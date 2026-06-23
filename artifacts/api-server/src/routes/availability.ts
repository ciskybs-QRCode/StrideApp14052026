import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /availability — approved slots visible to parents; all for admin/operator
router.get("/availability", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const params: unknown[] = [user.orgId];
    let roleFilter = "";
    if (user.role === "parent") {
      roleFilter = " AND oa.status = 'approved'";
    } else if (user.role === "operator") {
      // operators see only their own slots
      const { data: profile } = await supabase
        .from("operator_profiles")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", user.orgId)
        .single();
      if (profile) {
        roleFilter = ` AND oa.operator_profile_id = $${params.push(profile.id)}`;
      }
    }
    const { rows } = await pool.query(
      `SELECT oa.*,
              op.id AS op_id, op.profile_type,
              u.id AS op_user_id, u.name AS op_user_name,
              d.id AS disc_id, d.name AS disc_name
       FROM operator_availability oa
       LEFT JOIN operator_profiles op ON op.id = oa.operator_profile_id
       LEFT JOIN users u ON u.id = op.user_id
       LEFT JOIN disciplines d ON d.id = oa.discipline_id
       WHERE oa.organization_id = $1${roleFilter}
       ORDER BY oa.slot_date, oa.start_time`,
      params,
    );
    res.json(rows);
  } catch (err) {
    req.log.error(err, "GET /availability failed");
    res.status(500).json({ error: "Failed to fetch availability" });
  }
});

// POST /availability — operator submits an availability slot
router.post("/availability", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { disciplineId, location, slotDate, startTime, endTime, notes } = req.body as {
    disciplineId: number;
    location: string;
    slotDate: string;
    startTime: string;
    endTime: string;
    notes?: string;
  };
  if (!disciplineId || !location || !slotDate || !startTime || !endTime) {
    res.status(400).json({ error: "disciplineId, location, slotDate, startTime, endTime required" }); return;
  }
  // Find operator profile
  const { data: profile, error: pErr } = await supabase
    .from("operator_profiles")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", user.orgId)
    .single();
  if (pErr || !profile) { res.status(400).json({ error: "Operator profile not found" }); return; }

  const { data, error } = await supabase
    .from("operator_availability")
    .insert({
      operator_profile_id: profile.id,
      organization_id: user.orgId,
      discipline_id: disciplineId,
      location,
      slot_date: slotDate,
      start_time: startTime,
      end_time: endTime,
      status: "pending",
      notes,
    })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Notify admins
  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .eq("organization_id", user.orgId)
    .eq("role", "admin");
  if (admins && admins.length > 0) {
    await supabase.from("private_notifications").insert(
      admins.map((a: { id: number }) => ({
        organization_id: user.orgId,
        recipient_id: a.id,
        sender_id: user.id,
        type: "booking_request",
        title: "New Availability Submitted",
        body: `Operator submitted a slot for ${slotDate} at ${startTime}.`,
      }))
    );
  }
  res.status(201).json(data);
});

// PATCH /availability/:id — admin approves/rejects + sets parent price
router.patch("/availability/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { status, parentPriceCents } = req.body as {
    status: "approved" | "rejected";
    parentPriceCents?: number;
  };
  if (!status) { res.status(400).json({ error: "status required" }); return; }

  const { data: slot, error } = await supabase
    .from("operator_availability")
    .update({ status, parent_price_cents: parentPriceCents })
    .eq("id", parseInt(String(req.params["id"])))
    .eq("organization_id", user.orgId)
    .select(`*, operator_profile:operator_profiles!operator_profile_id(user_id)`)
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Notify operator
  const opUserId = (slot.operator_profile as { user_id: number } | null)?.user_id;
  if (opUserId) {
    await supabase.from("private_notifications").insert({
      organization_id: user.orgId,
      recipient_id: opUserId,
      sender_id: user.id,
      type: status === "approved" ? "availability_approved" : "availability_rejected",
      title: status === "approved" ? "Availability Approved" : "Availability Rejected",
      body: status === "approved"
        ? `Your slot on ${slot.slot_date} at ${slot.start_time} is live for booking.`
        : `Your slot on ${slot.slot_date} at ${slot.start_time} was not approved.`,
    });
  }
  res.json(slot);
});

// POST /availability/resign — operator submits resignation with notice period
router.post("/availability/resign", requireAuth, requireRole("operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { notice_period } = req.body as { notice_period?: string };

  const VALID = ["immediate", "1w", "2w", "3w", "4w"] as const;
  if (!notice_period || !VALID.includes(notice_period as typeof VALID[number])) {
    res.status(400).json({ error: "Invalid notice_period" });
    return;
  }

  const penaltyWeeks = notice_period === "immediate" || notice_period === "1w" ? 2 : 0;

  const { data: admins } = await supabase
    .from("users")
    .select("id, name")
    .eq("organization_id", user.orgId)
    .in("role", ["admin", "super_admin"]);

  const { data: opUser } = await supabase
    .from("users")
    .select("name")
    .eq("id", user.id)
    .single();

  const opName = opUser?.name ?? "An operator";
  const noticeLabel = notice_period === "immediate" ? "immediately"
    : notice_period === "1w" ? "1 week"
    : notice_period === "2w" ? "2 weeks"
    : notice_period === "3w" ? "3 weeks"
    : "4 weeks";

  if (admins && admins.length > 0) {
    const notifRows = admins.map(a => ({
      organization_id: user.orgId,
      recipient_id:    a.id,
      sender_id:       user.id,
      type:            "operator_resigned",
      title:           "Operator Resignation",
      body:            `${opName} has submitted a resignation with ${noticeLabel} notice.${penaltyWeeks > 0 ? ` A ${penaltyWeeks}-week pay deduction applies.` : ""} AI is searching for a replacement.`,
    }));
    await supabase.from("notifications").insert(notifRows);
  }

  res.json({ success: true, message: "Resignation submitted", notice_period, penalty_weeks: penaltyWeeks });
});

export default router;
