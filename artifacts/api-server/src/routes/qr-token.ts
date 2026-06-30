import { Router, type Request } from "express";
import jwt from "jsonwebtoken";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

const QR_TTL_SECONDS = 24 * 60 * 60;

function qrSecret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET is required");
  return s;
}

// GET /api/qr-token?type=member
// GET /api/qr-token?type=child&childId={id}
// Returns a signed QR payload (STRIDE:SIGNED:v1:{jwt}) valid for 24 hours.
router.get("/qr-token", requireAuth, async (req, res) => {
  const actor = (req as AuthReq).user;
  const orgId = actor.orgId ?? 1;
  const { type, childId } = req.query as { type?: string; childId?: string };

  if (type === "member") {
    const payload = { sub: "qr", type: "member", id: Number(actor.id), orgId };
    const token = jwt.sign(payload, qrSecret(), { expiresIn: QR_TTL_SECONDS });
    const expiresAt = Date.now() + QR_TTL_SECONDS * 1000;
    req.log.info({ userId: actor.id, orgId }, "qr-token: issued member token");
    res.json({ token: `STRIDE:SIGNED:v1:${token}`, expiresAt });
    return;
  }

  if (type === "child") {
    const childIdNum = parseInt(String(childId ?? ""), 10);
    if (!childIdNum || childIdNum <= 0) {
      res.status(400).json({ error: "childId is required for type=child" });
      return;
    }
    const { data: child } = await supabase
      .from("children")
      .select("id")
      .eq("id", childIdNum)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!child) {
      res.status(404).json({ error: "Child not found in this organisation" });
      return;
    }
    const payload = { sub: "qr", type: "child", id: childIdNum, orgId };
    const token = jwt.sign(payload, qrSecret(), { expiresIn: QR_TTL_SECONDS });
    const expiresAt = Date.now() + QR_TTL_SECONDS * 1000;
    req.log.info({ childId: childIdNum, orgId }, "qr-token: issued child token");
    res.json({ token: `STRIDE:SIGNED:v1:${token}`, expiresAt });
    return;
  }

  res.status(400).json({ error: "type must be 'member' or 'child'" });
});

export default router;
