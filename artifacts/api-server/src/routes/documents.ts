import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.get("/documents", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("organization_id", user.orgId)
    .eq("is_deleted", false)
    .order("priority");
  if (error) { res.status(500).json({ error: error.message }); return; }

  const { data: sigs } = await supabase
    .from("document_signatures")
    .select("document_id, signed_at")
    .eq("user_id", parseInt(user.id));

  const signedSet = new Set((sigs ?? []).map((s: { document_id: number }) => s.document_id));
  const enriched = (data ?? []).map((d: { id: number; [key: string]: unknown }) => ({
    ...d,
    signed: signedSet.has(d.id),
  }));
  res.json(enriched);
});

router.post("/documents/:id/sign", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const docId = parseInt(String(req.params.id));
  const { error } = await supabase
    .from("document_signatures")
    .upsert({ document_id: docId, user_id: parseInt(user.id), signed_at: new Date().toISOString() });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

router.post("/documents", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("documents")
    .insert({ ...body, organization_id: user.orgId })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // ── Push Notification Stub ────────────────────────────────────────────────
  // TODO: When expo-server-sdk is available, notify all members of this org
  // that a new document requires their attention. Example implementation:
  //
  //   import { Expo } from "expo-server-sdk";
  //   const expo = new Expo();
  //
  //   const { data: tokens } = await supabase
  //     .from("push_tokens")
  //     .select("token, user_id")
  //     .eq("organization_id", user.orgId);
  //
  //   const messages = (tokens ?? [])
  //     .filter(t => Expo.isExpoPushToken(t.token))
  //     .map(t => ({
  //       to: t.token,
  //       sound: "default" as const,
  //       title: "New document requires your signature",
  //       body: `"${body.title ?? "Document"}" has been added and needs your review.`,
  //       data: { screen: "documents", documentId: (data as { id?: number })?.id },
  //     }));
  //
  //   await expo.sendPushNotificationsAsync(messages);
  // ─────────────────────────────────────────────────────────────────────────

  res.status(201).json(data);
});

export default router;
