import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /availability — approved slots visible to parents; all for admin/operator
router.get("/availability", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  let query = supabase
    .from("operator_availability")
    .select(`
      *,
      operator_profile:operator_profiles!operator_profile_id(
        id, profile_type,
        user:users!user_id(id, name)
      ),
      discipline:disciplines!discipline_id(id, name)
    `)
    .eq("organization_id", user.orgId)
    .order("slot_date")
    .order("start_time");

  if (user.role === "parent") {
    query = query.eq("status", "approved");
  } else if (user.role === "operator") {
    // Operators see their own availability
    const { data: profile } = await supabase
      .from("operator_profiles")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", user.orgId)
      .single();
    if (profile) query = query.eq("operator_profile_id", profile.id);
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
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
        body: `${user.name} submitted a slot for ${slotDate} at ${startTime}.`,
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
    .eq("id", parseInt(req.params.id))
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

export default router;
