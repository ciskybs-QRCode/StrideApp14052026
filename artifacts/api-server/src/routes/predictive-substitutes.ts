import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

function dayLabel(d: number): string {
  return (["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] as const)[d] ?? "day";
}

interface ScoredCandidate {
  id: string;
  name: string;
  email: string;
  matchPercent: number;
  availabilityScore: number;
  courseMatchScore: number;
  costScore: number;
  reasons: string[];
  hourlyRateCents: number | null;
}

/**
 * GET /api/finance/predictive-substitutes
 *
 * Query params:
 *   missing_operator_id  – user id of the absent operator (required)
 *   class_datetime       – ISO 8601 datetime of the class (required)
 *   discipline_id        – discipline/course type id (optional, improves match accuracy)
 *   org_id               – override org id (optional, defaults to token orgId)
 *
 * Returns up to 3 recommended substitutes ordered by weighted match score.
 * Scoring weights: availability 40%, discipline match 35%, cost efficiency 25%.
 * Strictly read-only — does not touch course schedules or attendance records.
 */
router.get(
  "/finance/predictive-substitutes",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const {
      missing_operator_id,
      class_datetime,
      discipline_id,
      org_id: qOrgId,
    } = req.query as Record<string, string | undefined>;

    if (!missing_operator_id || !class_datetime) {
      res.status(400).json({ error: "missing_operator_id and class_datetime are required" });
      return;
    }

    const classDate = new Date(class_datetime);
    if (isNaN(classDate.getTime())) {
      res.status(400).json({ error: "Invalid class_datetime — use ISO 8601" });
      return;
    }

    const orgId     = Number(qOrgId ?? user.orgId ?? 1);
    const weekday   = classDate.getDay();
    const classHour = classDate.getHours();
    const classMin  = classDate.getMinutes();
    const timeStr   = `${String(classHour).padStart(2,"0")}:${String(classMin).padStart(2,"0")}`;
    const discId    = discipline_id ? parseInt(discipline_id) : null;

    try {
      // ── 1. All active operators except the absent one ──────────────────────
      const { data: rawOps, error: opErr } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "operator")
        .neq("id", parseInt(missing_operator_id));

      if (opErr) {
        req.log.error(opErr, "predictive-substitutes: fetch operators");
        res.status(500).json({ error: "Failed to load operator list" });
        return;
      }

      const operators = (rawOps ?? []) as { id: number; name: string; email: string }[];
      if (operators.length === 0) { res.json([]); return; }

      // ── 2. Historical absence records (90-day window) ──────────────────────
      const since90 = new Date(classDate.getTime() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const candidateIds = operators.map(o => String(o.id));
      const weeksInWindow = 13; // ~90 / 7

      const { rows: absenceRows } = await pool.query<{
        operator_id: string;
        absence_date: string;
        start_time: string | null;
      }>(
        `SELECT operator_id, absence_date, start_time
         FROM operator_absences
         WHERE org_id = $1
           AND operator_id = ANY($2::text[])
           AND absence_date >= $3`,
        [orgId, candidateIds, since90],
      );

      const absenceMap: Record<string, Array<{ date: string; start: string | null }>> = {};
      for (const row of absenceRows) {
        if (!absenceMap[row.operator_id]) absenceMap[row.operator_id] = [];
        absenceMap[row.operator_id].push({ date: row.absence_date, start: row.start_time });
      }

      // ── 3. Operator discipline rates (for match + cost) ────────────────────
      const { rows: rateRows } = await pool.query<{
        user_id: number;
        discipline_id: number;
        hourly_rate_cents: number;
      }>(
        `SELECT op.user_id, odr.discipline_id, odr.hourly_rate_cents
         FROM operator_discipline_rates odr
         JOIN operator_profiles op ON op.id = odr.operator_profile_id
         WHERE op.organization_id = $1
           AND op.user_id = ANY($2::int[])`,
        [orgId, operators.map(o => o.id)],
      );

      const rateMap: Record<number, Record<number, number>> = {};
      for (const r of rateRows) {
        if (!rateMap[r.user_id]) rateMap[r.user_id] = {};
        rateMap[r.user_id][r.discipline_id] = r.hourly_rate_cents;
      }

      // ── 4. Completed private bookings for discipline match signal ──────────
      const bookingCounts: Record<string, number> = {};
      if (discId) {
        const { data: bkgs } = await supabase
          .from("private_bookings")
          .select("operator_user_id")
          .eq("organization_id", orgId)
          .eq("discipline_id", discId)
          .eq("status", "completed");

        for (const b of (bkgs ?? [])) {
          const oid = String((b as { operator_user_id: string | number }).operator_user_id);
          bookingCounts[oid] = (bookingCounts[oid] ?? 0) + 1;
        }
      }

      // ── 5. Cost normalisation bounds ───────────────────────────────────────
      const discRates = operators
        .map(o => (discId ? (rateMap[o.id]?.[discId] ?? null) : null))
        .filter((r): r is number => r !== null);
      const minRate   = discRates.length > 0 ? Math.min(...discRates) : 0;
      const maxRate   = discRates.length > 0 ? Math.max(...discRates) : 0;
      const rateRange = maxRate - minRate;

      // ── 6. Score each candidate ────────────────────────────────────────────
      const scored: ScoredCandidate[] = operators.map(op => {
        const oid      = String(op.id);
        const absences = absenceMap[oid] ?? [];

        // Availability — absences on same weekday that overlap the class time
        const sameDayAbsences = absences.filter(a => {
          const d = new Date(a.date + "T12:00:00");
          return d.getDay() === weekday;
        });
        const conflicts = sameDayAbsences.filter(a => {
          if (!a.start) return true; // full-day absence
          const [ah, am] = a.start.split(":").map(Number);
          const absStart   = ah * 60 + am;
          const classStart = classHour * 60 + classMin;
          return Math.abs(absStart - classStart) < 120;
        });
        const availabilityScore = Math.max(0, 1 - conflicts.length / weeksInWindow);
        const availPct          = Math.round(availabilityScore * 100);

        // Course match
        const sessions  = bookingCounts[oid] ?? 0;
        const hasRate   = discId ? !!(rateMap[op.id]?.[discId]) : false;
        const hasAnyQual = Object.keys(rateMap[op.id] ?? {}).length > 0;
        let courseMatchScore = 0.10;
        if (hasRate && sessions > 0) courseMatchScore = 1.00;
        else if (hasRate)            courseMatchScore = 0.70;
        else if (sessions > 0)       courseMatchScore = 0.50;
        else if (hasAnyQual)         courseMatchScore = 0.30;

        // Cost efficiency
        let costScore = 0.50;
        let hourlyRateCents: number | null = null;
        if (discId && rateMap[op.id]?.[discId] !== undefined) {
          hourlyRateCents = rateMap[op.id][discId] ?? 0;
          costScore = rateRange > 0 ? 1 - (hourlyRateCents - minRate) / rateRange : 1.0;
        }

        const score        = 0.40 * availabilityScore + 0.35 * courseMatchScore + 0.25 * costScore;
        const matchPercent = Math.min(99, Math.round(score * 100));

        // Human-readable reasons
        const reasons: string[] = [];
        if (availabilityScore >= 0.85)
          reasons.push(`Available ${availPct}% of ${dayLabel(weekday)}s at ${timeStr} (last 90 days)`);
        else if (availabilityScore >= 0.60)
          reasons.push(`${availPct}% available — ${conflicts.length} conflict${conflicts.length !== 1 ? "s" : ""} recorded`);
        else
          reasons.push(`Low availability — ${conflicts.length} absence${conflicts.length !== 1 ? "s" : ""} on ${dayLabel(weekday)}`);

        if (sessions > 0)
          reasons.push(`${sessions} completed session${sessions !== 1 ? "s" : ""} for this discipline`);
        else if (hasRate)
          reasons.push("Qualified — hourly rate on file for this discipline");
        else
          reasons.push("No prior sessions recorded for this discipline");

        if (hourlyRateCents !== null) {
          const euros = (hourlyRateCents / 100).toFixed(2);
          if (costScore >= 0.75)      reasons.push(`Rate: €${euros}/hr — below team average`);
          else if (costScore >= 0.50) reasons.push(`Rate: €${euros}/hr — at team average`);
          else                        reasons.push(`Rate: €${euros}/hr — above team average`);
        }

        return {
          id: oid,
          name: (op.name as string) || op.email,
          email: op.email,
          matchPercent,
          availabilityScore,
          courseMatchScore,
          costScore,
          reasons,
          hourlyRateCents,
        };
      });

      // Top 3 by weighted score
      const top3 = scored
        .sort((a, b) => b.matchPercent - a.matchPercent)
        .slice(0, 3);

      res.json(top3);
    } catch (err) {
      req.log.error(err, "predictive-substitutes: unexpected error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
