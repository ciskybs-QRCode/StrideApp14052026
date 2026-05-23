import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /operator-earnings?month=YYYY-MM
// Returns completed private-lesson earnings aggregated by discipline for the operator.
router.get("/operator-earnings", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay   = new Date(year, mon, 0).getDate();
  const endDate   = `${year}-${String(mon).padStart(2, "0")}-${lastDay}`;

  const { data: bookings, error } = await supabase
    .from("private_bookings")
    .select("*, discipline:disciplines!discipline_id(id,name)")
    .eq("organization_id", user.orgId)
    .eq("operator_user_id", user.id)
    .eq("status", "completed")
    .gte("slot_date", startDate)
    .lte("slot_date", endDate);

  if (error) { res.status(500).json({ error: error.message }); return; }

  type DiscMap = Record<number, {
    discipline_id: number;
    discipline_name: string;
    lesson_count: number;
    total_minutes: number;
    total_hours: number;
    earnings_cents: number;
    hourly_rate_cents: number;
  }>;
  const disciplineMap: DiscMap = {};

  for (const b of (bookings ?? [])) {
    const [sh, sm] = (b.start_time as string).split(":").map(Number);
    const [eh, em] = (b.end_time as string).split(":").map(Number);
    const minutes = (eh * 60 + em) - (sh * 60 + sm);
    const dId = b.discipline_id as number;
    const dName = (b.discipline as { id: number; name: string } | null)?.name ?? "Unknown";

    if (!disciplineMap[dId]) {
      disciplineMap[dId] = { discipline_id: dId, discipline_name: dName, lesson_count: 0, total_minutes: 0, total_hours: 0, earnings_cents: 0, hourly_rate_cents: 0 };
    }
    disciplineMap[dId].lesson_count++;
    disciplineMap[dId].total_minutes += minutes;
    disciplineMap[dId].earnings_cents += (b.earnings_cents as number) ?? 0;
  }

  const disciplines = Object.values(disciplineMap).map(d => {
    const total_hours = Math.round((d.total_minutes / 60) * 10) / 10;
    const hourly_rate_cents = total_hours > 0 ? Math.round(d.earnings_cents / total_hours) : 0;
    return { ...d, total_hours, hourly_rate_cents };
  });

  const total_lessons      = disciplines.reduce((s, d) => s + d.lesson_count, 0);
  const total_hours        = Math.round(disciplines.reduce((s, d) => s + d.total_hours, 0) * 10) / 10;
  const total_earnings_cents = disciplines.reduce((s, d) => s + d.earnings_cents, 0);

  res.json({ month, disciplines, total_lessons, total_hours, total_earnings_cents });
});

export default router;
