import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

type CartItemPayload = {
  courseId: string;
  courseName: string;
  participantName: string;
  childId?: string;
  packageType: string;
  price: number;
};

// ── Create Stripe-hosted web checkout session ─────────────────────────────
router.post("/checkout/web-session", requireAuth, async (req, res) => {
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!stripeKey) {
    res.status(503).json({ error: "stripe_not_configured" });
    return;
  }

  const user = (req as AuthReq).user;
  const { items, amountCents } = req.body as {
    items: CartItemPayload[];
    amountCents: number;
  };

  if (!items?.length || !amountCents || amountCents <= 0) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  try {
    const { data: orgData } = await supabase
      .from("organizations")
      .select("currency, stripe_connect_account_id, trial_ends_at")
      .eq("id", user.orgId ?? 1)
      .maybeSingle();

    const currency   = (orgData as { currency?: string }                         | null)?.currency?.toLowerCase()            ?? "eur";
    const connectId  = (orgData as { stripe_connect_account_id?: string }        | null)?.stripe_connect_account_id          ?? null;
    const trialEndsAt= (orgData as { trial_ends_at?: string }                   | null)?.trial_ends_at                      ?? null;
    const isTrial    = !trialEndsAt || new Date() < new Date(trialEndsAt);

    const rawDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0]
      ?? process.env["REPLIT_DEV_DOMAIN"]
      ?? "localhost";
    const baseUrl = `https://${rawDomain}`;

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

    const lineItems = items.map(item => ({
      price_data: {
        currency,
        product_data: {
          name: `${item.courseName} — ${item.participantName}`,
          description: item.packageType === "fixedBlock" ? "Full Package" : "Single Lesson",
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: 1,
    }));

    type SessionParams = Parameters<typeof stripe.checkout.sessions.create>[0];
    const sessionParams: SessionParams = {
      mode: "payment",
      line_items: lineItems,
      success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment-cancelled`,
      metadata: {
        type: "member_checkout",
        orgId: String(user.orgId ?? 1),
        userId: String(user.id),
      },
    };

    if (connectId) {
      sessionParams.payment_intent_data = {
        transfer_data: { destination: connectId },
        application_fee_amount: isTrial ? 0 : Math.round(amountCents * 0.02),
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    await supabase.from("checkout_sessions").insert({
      session_id:      session.id,
      organization_id: user.orgId ?? 1,
      user_id:         String(user.id),
      status:          "pending",
      items:           items,
      amount_cents:    amountCents,
    });

    res.json({ sessionId: session.id, checkoutUrl: session.url });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Poll session status ────────────────────────────────────────────────────
router.get("/checkout/session-status/:sessionId", requireAuth, async (req, res) => {
  const user      = (req as AuthReq).user;
  const sessionId = String(req.params["sessionId"] ?? "");

  if (!sessionId) { res.status(400).json({ error: "Missing sessionId" }); return; }

  const { data } = await supabase
    .from("checkout_sessions")
    .select("status, invoice_number, invoice_id")
    .eq("session_id", sessionId)
    .eq("user_id",    String(user.id))
    .maybeSingle();

  if (!data) { res.status(404).json({ error: "Session not found" }); return; }

  const row = data as { status: string; invoice_number?: string | null; invoice_id?: number | null };
  res.json({
    status:        row.status,
    invoiceNumber: row.invoice_number ?? null,
    invoiceId:     row.invoice_id     ?? null,
  });
});

// ── Complete Checkout (legacy / webhook internal use) ─────────────────────
// This route remains for webhook-driven server-side processing.
// The client no longer calls it directly.
export async function processMemberCheckout(opts: {
  orgId: number;
  userId: string;
  sessionId: string;
  items: CartItemPayload[];
  amountCents: number;
}): Promise<{ invoiceNumber: string; invoiceId: number | null }> {
  const { orgId, userId, sessionId, items, amountCents } = opts;

  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
  const invoiceTitle  = `Invoice ${invoiceNumber} — €${(amountCents / 100).toFixed(2)}`;

  await supabase.from("transactions").insert({
    organization_id: orgId,
    amount:          amountCents / 100,
    status:          "completed",
    description:     `Enrollment — ${items.map(i => i.courseName).join(", ")}`,
    payment_ref:     sessionId,
    payment_method:  "card",
    user_id:         parseInt(userId),
    created_at:      new Date().toISOString(),
  });

  for (const item of items) {
    if (!item.childId || !item.courseId) continue;
    await supabase
      .from("enrollments")
      .upsert(
        { child_id: parseInt(item.childId), course_id: parseInt(item.courseId), status: "enrolled" },
        { onConflict: "child_id,course_id" },
      );
  }

  const { data: doc } = await supabase
    .from("documents")
    .insert({
      organization_id: orgId,
      title:           invoiceTitle,
      type:            "invoice",
      mandatory:       false,
      is_deleted:      false,
      priority:        0,
      created_at:      new Date().toISOString(),
    })
    .select()
    .single();

  const invoiceId = (doc as { id?: number } | null)?.id ?? null;

  await supabase
    .from("checkout_sessions")
    .update({
      status:         "complete",
      invoice_number: invoiceNumber,
      invoice_id:     invoiceId,
      completed_at:   new Date().toISOString(),
    })
    .eq("session_id", sessionId);

  return { invoiceNumber, invoiceId };
}

export default router;
