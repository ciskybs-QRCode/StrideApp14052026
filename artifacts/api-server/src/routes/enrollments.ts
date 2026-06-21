/**
 * Enrollments routes
 * POST /enrollments/withdraw — member withdraws from a course
 * DELETE /memberships/:orgId — leave an org association (keeps account)
 */
import { Router, type Request } from "express";
import { requireAuth, type TokenPayload } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { pool }     from "../lib/pg.js";

type AuthReq = Request & { user: TokenPayload };

const router = Router();

// ── POST /enrollments/withdraw ────────────────────────────────────────────────
router.post("/enrollments/withdraw", requireAuth, async (req, res) => {
  const user      = (req as AuthReq).user;
  const { courseId, childId } = req.body as { courseId?: string; childId?: string };

  if (!courseId) {
    return res.status(400).json({ error: "courseId is required" });
  }

  try {
    // Try updating status to 'withdrawn'
    const memberId = childId ?? String(user.id);
    let done = false;

    // Attempt 1: update by course_id + member_id (enrolled member or child)
    const { error: err1 } = await supabase
      .from("enrollments")
      .update({ status: "withdrawn" })
      .eq("course_id", courseId)
      .eq("member_id", memberId);

    if (!err1) done = true;

    // Attempt 2: also try children table member_id
    if (!done || err1) {
      const { error: err2 } = await supabase
        .from("enrollments")
        .update({ status: "withdrawn" })
        .eq("course_id", courseId)
        .eq("child_id", memberId);
      if (!err2) done = true;
    }

    // Attempt 3: try by user_id field
    if (!done) {
      await supabase
        .from("enrollments")
        .update({ status: "withdrawn" })
        .eq("course_id", courseId)
        .eq("user_id", String(user.id));
    }

    // Log the withdrawal action
    await pool.query(
      `INSERT INTO child_activity_log (organization_id, actor_user_id, action, details, created_at)
       VALUES ($1, $2, 'course_withdrawal', $3, NOW())`,
      [
        user.orgId ?? 1,
        user.id,
        JSON.stringify({ courseId, childId, memberId }),
      ],
    ).catch(() => {});

    req.log.info({ courseId, memberId, userId: user.id }, "enrollment withdrawal");
    return res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "enrollments/withdraw error");
    return res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

// ── DELETE /memberships/leave-org ─────────────────────────────────────────────
// Leave an org association while keeping the Stride account active
router.delete("/memberships/leave-org", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;

  try {
    // Remove from org_members / organization_members
    await supabase
      .from("organization_members")
      .delete()
      .eq("user_id", String(user.id))
      .eq("organization_id", orgId);

    // Remove child_org_memberships for this user's children
    await pool.query(
      `DELETE FROM child_org_memberships WHERE parent_user_id = $1 AND organization_id = $2`,
      [user.id, orgId],
    ).catch(() => {});

    // Cancel any active member_subscriptions for this org
    await pool.query(
      `UPDATE member_subscriptions
          SET membership_status = 'cancelled', cancel_at_period_end = true
        WHERE user_id = $1 AND organization_id = $2 AND membership_status = 'active'`,
      [String(user.id), orgId],
    ).catch(() => {});

    req.log.info({ userId: user.id, orgId }, "user left org");
    return res.json({ ok: true, message: "You have left the association. Your account remains active." });
  } catch (err) {
    req.log.error(err, "memberships/leave-org error");
    return res.status(500).json({ error: "Failed to leave association" });
  }
});

export default router;
