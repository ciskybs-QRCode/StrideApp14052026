import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import crypto from "crypto";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /private-bookings
router.get("/private-bookings", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  let query = supabase
    .from("private_bookings")
    .select(`
      *,
      discipline:disciplines!discipline_id(id,name),
      child:children!child_id(id,name),
      operator:users!operator_user_id(id,name)
    `)
    .eq("organization_id", user.orgId)
    .order("slot_date", { ascending: false });

  if (user.role === "parent") query = query.eq("parent_user_id", user.id);
  if (user.role === "operator") query = query.eq("operator_user_id", user.id);

  const { data, error } = await query;
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") { res.json([]); return; }
    res.status(500).json({ error: error.message }); return;
  }
  res.json(data ?? []);
});

// POST /private-bookings — parent books a slot (adds pending booking, adds to cart)
router.post("/private-bookings", requireAuth, requireRole("parent"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { availabilityId, childId } = req.body as { availabilityId: number; childId: number };
  if (!availabilityId || !childId) {
    res.status(400).json({ error: "availabilityId and childId required" }); return;
  }

  // Fetch slot to confirm it's still available
  const { data: slot, error: sErr } = await supabase
    .from("operator_availability")
    .select(`*, operator_profile:operator_profiles!operator_profile_id(user_id)`)
    .eq("id", availabilityId)
    .eq("organization_id", user.orgId)
    .eq("status", "approved")
    .single();
  if (sErr || !slot) { res.status(400).json({ error: "Slot not available" }); return; }

  const qrToken = crypto.randomBytes(16).toString("hex");
  const { data: booking, error } = await supabase
    .from("private_bookings")
    .insert({
      organization_id: user.orgId,
      availability_id: availabilityId,
      child_id: childId,
      parent_user_id: user.id,
      operator_user_id: (slot.operator_profile as { user_id: number }).user_id,
      discipline_id: slot.discipline_id,
      location: slot.location,
      slot_date: slot.slot_date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      price_cents: slot.parent_price_cents ?? 0,
      status: "pending",
      qr_token: qrToken,
    })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Mark slot as booked so no double-bookings
  await supabase.from("operator_availability").update({ status: "booked" }).eq("id", availabilityId);

  // Notify operator of new booking request
  await supabase.from("private_notifications").insert({
    organization_id: user.orgId,
    recipient_id: (slot.operator_profile as { user_id: number }).user_id,
    sender_id: user.id,
    type: "booking_request",
    title: "New Lesson Request",
    body: `A parent has requested a private lesson on ${slot.slot_date} at ${slot.start_time}.`,
    booking_id: booking.id,
  });

  res.status(201).json({ ...booking, qr_token: qrToken });
});

// PATCH /private-bookings/:id/confirm — operator confirms
router.patch("/private-bookings/:id/confirm", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data: booking, error } = await supabase
    .from("private_bookings")
    .update({ status: "confirmed" })
    .eq("id", parseInt(String(req.params["id"])))
    .eq("organization_id", user.orgId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Notify parent
  await supabase.from("private_notifications").insert({
    organization_id: user.orgId,
    recipient_id: booking.parent_user_id,
    sender_id: user.id,
    type: "booking_confirmed",
    title: "Lesson Confirmed!",
    body: `Your private lesson on ${booking.slot_date} at ${booking.start_time} is confirmed.`,
    booking_id: booking.id,
  });
  res.json(booking);
});

// PATCH /private-bookings/:id/cancel
router.patch("/private-bookings/:id/cancel", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data: booking, error } = await supabase
    .from("private_bookings")
    .update({ status: "cancelled" })
    .eq("id", parseInt(String(req.params["id"])))
    .eq("organization_id", user.orgId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Re-open the slot
  await supabase.from("operator_availability").update({ status: "approved" }).eq("id", booking.availability_id);

  // Notify the other party
  const notifyId = user.role === "parent" ? booking.operator_user_id : booking.parent_user_id;
  await supabase.from("private_notifications").insert({
    organization_id: user.orgId,
    recipient_id: notifyId,
    sender_id: user.id,
    type: "booking_cancelled",
    title: "Lesson Cancelled",
    body: `A private lesson on ${booking.slot_date} at ${booking.start_time} has been cancelled.`,
    booking_id: booking.id,
  });
  res.json(booking);
});

// POST /private-bookings/scan — operator scans student QR at lesson start
router.post("/private-bookings/scan", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { qrToken } = req.body as { qrToken: string };
  if (!qrToken) { res.status(400).json({ error: "qrToken required" }); return; }

  // Find booking by QR token
  const { data: booking, error: bErr } = await supabase
    .from("private_bookings")
    .select("*")
    .eq("qr_token", qrToken)
    .eq("organization_id", user.orgId)
    .maybeSingle();
  if (bErr || !booking) { res.status(404).json({ error: "Invalid QR code" }); return; }
  if (booking.status === "completed") {
    res.status(409).json({ error: "Lesson already marked as attended" }); return;
  }
  if (booking.status === "cancelled") {
    res.status(409).json({ error: "This lesson was cancelled" }); return;
  }

  // Calculate duration in hours from start_time / end_time (HH:MM)
  const [sh, sm] = (booking.start_time as string).split(":").map(Number);
  const [eh, em] = (booking.end_time as string).split(":").map(Number);
  const durationHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;

  // Prefer operator_pay_cents set by admin on the availability slot
  let earningsCents = 0;
  const { data: slot } = await supabase
    .from("operator_availability")
    .select("operator_pay_cents")
    .eq("id", booking.availability_id)
    .maybeSingle();
  if (slot?.operator_pay_cents) {
    earningsCents = Math.round(durationHours * (slot.operator_pay_cents as number));
  } else {
    // Fallback: operator's per-discipline rate from operator_discipline_rates
    const { data: profile } = await supabase
      .from("operator_profiles")
      .select("id")
      .eq("user_id", booking.operator_user_id)
      .eq("organization_id", user.orgId)
      .maybeSingle();
    if (profile) {
      const { data: rateRow } = await supabase
        .from("operator_discipline_rates")
        .select("hourly_rate_cents")
        .eq("operator_profile_id", (profile as { id: number }).id)
        .eq("discipline_id", booking.discipline_id)
        .maybeSingle();
      if (rateRow?.hourly_rate_cents) {
        earningsCents = Math.round(durationHours * (rateRow.hourly_rate_cents as number));
      }
    }
  }

  const attended_at = new Date().toISOString();
  const invoice_number = `INV-${(booking.slot_date as string).replace(/-/g, "")}-${booking.id}`;

  const { error: uErr } = await supabase
    .from("private_bookings")
    .update({ status: "completed", earnings_cents: earningsCents, attended_at })
    .eq("id", booking.id);
  if (uErr) { res.status(500).json({ error: uErr.message }); return; }

  // Notify parent
  await supabase.from("private_notifications").insert({
    organization_id: user.orgId,
    recipient_id: booking.parent_user_id,
    sender_id: user.id,
    type: "payment_received",
    title: "Lesson Attended ✓",
    body: `Lesson on ${booking.slot_date} at ${booking.start_time} marked complete. Earnings: €${(earningsCents / 100).toFixed(2)}.`,
    booking_id: booking.id,
  });

  res.json({ ok: true, earnings_cents: earningsCents, invoice_number, attended_at });
});

export default router;
