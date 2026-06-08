/**
 * GET /live-pulse  (public — no auth required)
 *
 * Returns anonymised recent security events + global trust stats.
 * Results are cached for 30 seconds in memory so repeated page loads
 * do not saturate the database.
 *
 * Graceful fallback: any DB error returns zero values — the landing page
 * must never error because a query fails.
 */

import { Router, type Request, type Response } from "express";
import { pool } from "../lib/pg.js";

const router = Router();

// ── Types ──────────────────────────────────────────────────────────────────────

interface LiveEvent {
  id:    string;
  label: string;
  ts:    string;
}

interface LivePulseData {
  events: LiveEvent[];
  stats: {
    totalPickups:       number;
    verificationHashes: number;
    safeSchools:        number;
  };
}

// ── 30-second in-memory cache ──────────────────────────────────────────────────

let cache: { data: LivePulseData; cachedAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function anonymiseId(id: string): string {
  const hex = id.replace(/-/g, "").slice(-6);
  return String(parseInt(hex, 16) % 900 + 100);
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m    = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function safeInt(
  result: PromiseSettledResult<{ rows: Array<{ n: string }> }>,
): number {
  if (result.status === "rejected") return 0;
  return Math.max(0, parseInt(result.value.rows[0]?.n ?? "0", 10) || 0);
}

const EVENT_LABELS: Record<string, string> = {
  PICKED_UP:        "Pickup verified",
  CHECKED_IN:       "Check-in confirmed",
  GUARDIAN_SCANNED: "Guardian verified",
  QR_VERIFIED:      "Identity verified",
  OVERRIDE_SCANNED: "Override confirmed",
};

// ── Route ──────────────────────────────────────────────────────────────────────

router.get("/live-pulse", async (_req: Request, res: Response) => {
  try {
    const now = Date.now();

    if (cache && now - cache.cachedAt < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, max-age=30");
      res.json(cache.data);
      return;
    }

    const [eventsQ, pickupsQ, hashesQ, schoolsQ] = await Promise.allSettled([
      pool.query<{ id: string; child_id: string; event_type: string; timestamp: string }>(
        `SELECT id, child_id, event_type, timestamp
         FROM child_activity_log
         WHERE event_type = ANY($1::text[])
         ORDER BY timestamp DESC
         LIMIT 10`,
        [Object.keys(EVENT_LABELS)],
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
         FROM child_activity_log
         WHERE event_type = 'PICKED_UP'`,
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM verification_hashes`,
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM organizations`,
      ),
    ]);

    const events: LiveEvent[] = [];
    if (eventsQ.status === "fulfilled") {
      for (const row of eventsQ.value.rows) {
        events.push({
          id:    row.id,
          label: `${EVENT_LABELS[row.event_type] ?? "Activity recorded"} for Child #${anonymiseId(row.child_id)}`,
          ts:    relativeTime(row.timestamp),
        });
      }
    }

    const data: LivePulseData = {
      events,
      stats: {
        totalPickups:       safeInt(pickupsQ),
        verificationHashes: safeInt(hashesQ),
        safeSchools:        safeInt(schoolsQ),
      },
    };

    cache = { data, cachedAt: now };
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(data);

  } catch {
    // Never let a DB failure crash the public landing page
    res.setHeader("Cache-Control", "public, max-age=10");
    res.json({ events: [], stats: { totalPickups: 0, verificationHashes: 0, safeSchools: 0 } });
  }
});

export default router;
