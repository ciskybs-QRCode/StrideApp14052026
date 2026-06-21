import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

type AuthReq = Request & { user: TokenPayload };

const router = Router();

router.post("/api/reviews/submit", async (req, res) => {
  try {
    const { name, role, association_name, member_count, rating, comment } = req.body as Record<string, unknown>;
    if (!name || !role || !association_name || rating === undefined || !comment) {
      res.status(400).json({ error: "Missing required fields: name, role, association_name, rating, comment" });
      return;
    }
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      res.status(400).json({ error: "Rating must be an integer between 1 and 5" });
      return;
    }
    const text = String(comment).trim();
    if (text.length < 20) {
      res.status(400).json({ error: "Review must be at least 20 characters" });
      return;
    }
    const mc = member_count ? Number(member_count) : null;
    const { rows } = await pool.query(
      `INSERT INTO public_reviews (name, role, association_name, member_count, rating, comment)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [String(name).trim(), String(role).trim(), String(association_name).trim(), mc, r, text]
    );
    res.status(201).json({ id: (rows[0] as { id: number }).id, message: "Review submitted — it will appear after moderation. Thank you!" });
  } catch (err) {
    req.log?.error(err, "reviews/submit");
    res.status(500).json({ error: "Failed to submit review" });
  }
});

router.get("/api/reviews", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, role, association_name, member_count, rating, comment, created_at
       FROM public_reviews WHERE approved = TRUE ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    req.log?.error(err, "reviews/list");
    res.json([]);
  }
});

router.get("/api/reviews/pending", requireAuth, async (req: AuthReq, res) => {
  if (!["admin", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM public_reviews WHERE approved = FALSE ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    req.log?.error(err, "reviews/pending");
    res.status(500).json({ error: "Failed to fetch pending reviews" });
  }
});

router.patch("/api/reviews/:id/approve", requireAuth, async (req: AuthReq, res) => {
  if (!["admin", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id), 10);
  const approved = (req.body as { approved?: boolean }).approved !== false;
  try {
    await pool.query(`UPDATE public_reviews SET approved = $1 WHERE id = $2`, [approved, id]);
    res.json({ ok: true });
  } catch (err) {
    req.log?.error(err, "reviews/approve");
    res.status(500).json({ error: "Failed to update review" });
  }
});

router.delete("/api/reviews/:id", requireAuth, async (req: AuthReq, res) => {
  if (!["admin", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id), 10);
  try {
    await pool.query(`DELETE FROM public_reviews WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    req.log?.error(err, "reviews/delete");
    res.status(500).json({ error: "Failed to delete review" });
  }
});

export default router;
