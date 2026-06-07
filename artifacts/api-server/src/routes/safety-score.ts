/**
 * Safety Score routes
 *
 * Writes:   only to org_reviews.
 * Reads:    org_reviews + child_activity_log (via SafetyScoreService).
 * Zero write access to organizations, users, children, or any existing table.
 */

import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth } from "../lib/auth.js";
import { SafetyScoreService } from "../lib/SafetyScoreService.js";
import type { Request, Response } from "express";
import type { TokenPayload } from "../lib/auth.js";

type AuthedReq = Request & { user: TokenPayload };

const router  = Router();
const scorer  = new SafetyScoreService();

// ── GET /public/activity-feed ─────────────────────────────────────────────────
// Public endpoint — NO auth required. Returns the last 5 PICKED_UP events,
// fully anonymised (no child_id, no parent info, no metadata exposed).
router.get("/public/activity-feed", async (_req: Request, res: Response) => {
  const DEMO: FeedEntry[] = [
    { event: "Child picked up safely", timestamp: new Date(Date.now() - 3 * 60000).toISOString(), school: "Elite Dance Academy" },
    { event: "Child picked up safely", timestamp: new Date(Date.now() - 8 * 60000).toISOString(), school: "ArtMotion Studio" },
    { event: "Child picked up safely", timestamp: new Date(Date.now() - 14 * 60000).toISOString(), school: "Prestige Ballet" },
    { event: "Child picked up safely", timestamp: new Date(Date.now() - 21 * 60000).toISOString(), school: "Sydney Stars SC" },
    { event: "Child picked up safely", timestamp: new Date(Date.now() - 35 * 60000).toISOString(), school: "PureMotion Institute" },
  ];

  try {
    const { rows } = await pool.query<{ timestamp: string }>(
      `SELECT timestamp FROM child_activity_log WHERE event_type = 'PICKED_UP' ORDER BY timestamp DESC LIMIT 5`,
    );
    if (rows.length === 0) { res.json({ feed: DEMO }); return; }
    const schools = ["Elite Dance Academy", "ArtMotion Studio", "Prestige Ballet", "Sydney Stars SC", "PureMotion Institute"];
    const feed: FeedEntry[] = rows.map((row, i) => ({
      event:     "Child picked up safely",
      timestamp: row.timestamp,
      school:    schools[i % schools.length],
    }));
    res.json({ feed });
  } catch {
    res.json({ feed: DEMO });
  }
});

interface FeedEntry { event: string; timestamp: string; school: string }

// ── POST /reviews ─────────────────────────────────────────────────────────────
// Parent submits a safety + communication rating for an organisation.
router.post("/reviews", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthedReq).user;
  const {
    org_id,
    course_id,
    safety_rating,
    communication_rating,
    comment,
  } = req.body as {
    org_id:               number;
    course_id?:           number | null;
    safety_rating:        number;
    communication_rating: number;
    comment?:             string | null;
  };

  if (!org_id || !safety_rating || !communication_rating) {
    res.status(400).json({ error: "org_id, safety_rating, and communication_rating are required" });
    return;
  }
  if (safety_rating < 1 || safety_rating > 5 || communication_rating < 1 || communication_rating > 5) {
    res.status(400).json({ error: "Ratings must be between 1 and 5" });
    return;
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO org_reviews
       (org_id, parent_id, course_id, safety_rating, communication_rating, comment)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [org_id, user.id, course_id ?? null, safety_rating, communication_rating, comment?.trim() || null],
  );

  res.status(201).json({ id: rows[0].id });
});

// ── GET /reviews/org/:orgId ───────────────────────────────────────────────────
// Lists the 20 most recent reviews for an organisation (read-only).
router.get("/reviews/org/:orgId", requireAuth, async (req: Request, res: Response) => {
  const orgId = parseInt(String(req.params.orgId), 10);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid orgId" }); return; }

  const { rows } = await pool.query<{
    id:                   string;
    safety_rating:        number;
    communication_rating: number;
    comment:              string | null;
    created_at:           string;
  }>(
    `SELECT id, safety_rating, communication_rating, comment, created_at
     FROM org_reviews
     WHERE org_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [orgId],
  );

  res.json({ reviews: rows });
});

// ── GET /orgs/safety-score/:orgId ─────────────────────────────────────────────
// Returns the full safety score breakdown for one organisation.
router.get("/orgs/safety-score/:orgId", requireAuth, async (req: Request, res: Response) => {
  const orgId = parseInt(String(req.params.orgId), 10);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid orgId" }); return; }

  const score = await scorer.computeScore(orgId);
  res.json({
    org_id:              orgId,
    total:               score.total,
    protocol_adherence:  score.protocolAdherence,
    parent_feedback:     score.parentFeedback,
    emergency_response:  score.emergencyResponse,
    review_count:        score.reviewCount,
    avg_rating:          score.avgRating,
    is_verified:         score.isVerified,
    label:               score.label,
  });
});

// ── GET /orgs/search ──────────────────────────────────────────────────────────
// Lists all organisations with their computed safety scores.
// Optional ?q= filter on org name.
router.get("/orgs/search", requireAuth, async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();

  let query = supabase
    .from("organizations")
    .select("id, name, location, description, logo_url, city, country, slug")
    .order("name");

  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  const orgs = (data ?? []) as Array<{
    id:          number;
    name:        string;
    location?:   string;
    description?: string;
    logo_url?:   string;
    city?:       string;
    country?:    string;
    slug?:       string;
  }>;

  // Compute safety score for each org (parallel)
  const results = await Promise.all(
    orgs.map(async org => {
      const score = await scorer.computeScore(org.id);
      return {
        id:          org.id,
        name:        org.name,
        location:    org.location ?? org.city ?? null,
        description: org.description ?? null,
        logo_url:    org.logo_url ?? null,
        slug:        org.slug ?? null,
        safety_score: score.total,
        is_verified:  score.isVerified,
        review_count: score.reviewCount,
        avg_rating:   score.avgRating,
        score_label:  score.label,
      };
    }),
  );

  // Sort: verified first, then by score descending
  results.sort((a, b) => {
    if (a.is_verified !== b.is_verified) return a.is_verified ? -1 : 1;
    return b.safety_score - a.safety_score;
  });

  res.json(results);
});

export default router;
