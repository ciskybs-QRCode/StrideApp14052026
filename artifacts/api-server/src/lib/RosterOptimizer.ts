/**
 * RosterOptimizer — AI Roster Engine.
 *
 * Returns a ranked list of candidate operators for a given discipline and
 * optional date range, using the formula:
 *
 *   composite_score = (skill_match * 0.6) + (reliability_score * 0.4)
 *
 * Skill Match derivation:
 *   1.00  operator has a rate AND completed sessions for the discipline
 *   0.70  operator has a rate only (qualified, no session history)
 *   0.50  operator has completed sessions (experience, no formal rate)
 *   0.30  operator has any discipline rate (adjacent qualification)
 *   0.10  no relevant qualification
 */

import { pool } from "./pg.js";
import { supabase } from "./supabase.js";
import { logger } from "./logger.js";

export interface RankedOperator {
  operatorUserId: string;
  name:            string;
  email:           string;
  skillScore:      number;   // 0–1
  reliabilityScore: number;  // 0–1
  compositeScore:  number;   // 0–1
  matchPercent:    number;   // 0–99 for display
  reasons:         string[];
}

export interface OptimizerParams {
  disciplineId:       number;
  orgId:              number;
  excludeOperatorId?: string;  // absent operator to exclude
  dateRangeStart?:    string;  // ISO date, for future date-range availability checks
  dateRangeEnd?:      string;
}

export class RosterOptimizer {
  static async getRankedOperators(params: OptimizerParams): Promise<RankedOperator[]> {
    const { disciplineId, orgId, excludeOperatorId } = params;

    try {
      // ── 1. All active operators for the org ────────────────────────────────
      const { data: rawUsers, error: uErr } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "operator");

      if (uErr || !rawUsers) {
        logger.error(uErr, "RosterOptimizer: fetch users");
        return [];
      }

      // ── 2. operator_profiles (for reliability_score) ───────────────────────
      const { rows: profiles } = await pool.query<{
        user_id: string;
        reliability_score: string | null;
      }>(
        `SELECT user_id::text, reliability_score
         FROM operator_profiles
         WHERE organization_id = $1`,
        [orgId],
      );
      const profileMap: Record<string, number> = {};
      for (const p of profiles) {
        profileMap[p.user_id] = parseFloat(p.reliability_score ?? "0.8");
      }

      // ── 3. Discipline rates (qualification signal) ─────────────────────────
      const { rows: rateRows } = await pool.query<{
        user_id: number;
        discipline_id: number;
      }>(
        `SELECT op.user_id, odr.discipline_id
         FROM operator_discipline_rates odr
         JOIN operator_profiles op ON op.id = odr.operator_profile_id
         WHERE op.organization_id = $1`,
        [orgId],
      );
      const rateMap: Record<string, Set<number>> = {};
      for (const r of rateRows) {
        const uid = String(r.user_id);
        if (!rateMap[uid]) rateMap[uid] = new Set();
        rateMap[uid].add(r.discipline_id);
      }

      // ── 4. Completed session counts for the target discipline ──────────────
      const bookingCounts: Record<string, number> = {};
      const { data: bkgs } = await supabase
        .from("private_bookings")
        .select("operator_user_id")
        .eq("organization_id", orgId)
        .eq("discipline_id", disciplineId)
        .eq("status", "completed");
      for (const b of (bkgs ?? [])) {
        const oid = String((b as { operator_user_id: string | number }).operator_user_id);
        bookingCounts[oid] = (bookingCounts[oid] ?? 0) + 1;
      }

      // ── 5. Score each candidate ────────────────────────────────────────────
      const results: RankedOperator[] = [];

      for (const u of rawUsers as { id: number; name: string; email: string }[]) {
        const uid = String(u.id);
        if (excludeOperatorId && uid === excludeOperatorId) continue;

        const hasRate   = rateMap[uid]?.has(disciplineId) ?? false;
        const sessions  = bookingCounts[uid] ?? 0;
        const hasAnyQual = (rateMap[uid]?.size ?? 0) > 0;

        let skillScore = 0.10;
        if (hasRate && sessions > 0) skillScore = 1.00;
        else if (hasRate)            skillScore = 0.70;
        else if (sessions > 0)       skillScore = 0.50;
        else if (hasAnyQual)         skillScore = 0.30;

        const reliabilityScore = profileMap[uid] ?? 0.80;
        const compositeScore   = skillScore * 0.6 + reliabilityScore * 0.4;
        const matchPercent     = Math.min(99, Math.round(compositeScore * 100));

        const reasons: string[] = [];
        if (hasRate && sessions > 0)
          reasons.push(`Qualified + ${sessions} completed session${sessions !== 1 ? "s" : ""} for this discipline`);
        else if (hasRate)
          reasons.push("Qualified — hourly rate on file for this discipline");
        else if (sessions > 0)
          reasons.push(`${sessions} completed session${sessions !== 1 ? "s" : ""} (no formal rate on file)`);
        else if (hasAnyQual)
          reasons.push("Qualified in adjacent disciplines");
        else
          reasons.push("No prior sessions recorded for this discipline");

        const rel = Math.round(reliabilityScore * 100);
        if (reliabilityScore >= 0.85)
          reasons.push(`Reliability: ${rel}% — excellent attendance & acceptance record`);
        else if (reliabilityScore >= 0.65)
          reasons.push(`Reliability: ${rel}% — good track record`);
        else
          reasons.push(`Reliability: ${rel}% — limited history or past non-attendances`);

        results.push({
          operatorUserId: uid,
          name:           (u.name as string) || u.email,
          email:          u.email,
          skillScore,
          reliabilityScore,
          compositeScore,
          matchPercent,
          reasons,
        });
      }

      return results.sort((a, b) => b.compositeScore - a.compositeScore);
    } catch (err) {
      logger.error(err, "RosterOptimizer: unexpected error");
      return [];
    }
  }
}
