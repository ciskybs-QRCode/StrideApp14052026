import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const DEFAULT_MEETING_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_MEETING_SLOTS = [
  "09:00 \u2013 09:45",
  "10:00 \u2013 10:45",
  "11:00 \u2013 11:45",
  "14:00 \u2013 14:45",
  "15:00 \u2013 15:45",
  "16:00 \u2013 16:45",
];

router.get("/meeting-availability", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  try {
    const { data } = await supabase
      .from("admin_settings")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle();

    const row = data as Record<string, unknown> | null;
    res.json({
      meeting_days: (Array.isArray(row?.["meeting_days"]) ? row?.["meeting_days"] : null) ?? DEFAULT_MEETING_DAYS,
      meeting_slots: (Array.isArray(row?.["meeting_slots"]) ? row?.["meeting_slots"] : null) ?? DEFAULT_MEETING_SLOTS,
    });
  } catch {
    res.json({ meeting_days: DEFAULT_MEETING_DAYS, meeting_slots: DEFAULT_MEETING_SLOTS });
  }
});

export default router;
