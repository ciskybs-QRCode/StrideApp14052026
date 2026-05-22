import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Stripe: Create Payment Intent ─────────────────────────────────────────
router.post("/checkout/stripe/intent", requireAuth, async (req, res) => {
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!stripeKey) {
    res.status(503).json({ error: "stripe_not_configured" });
    return;
  }
  const user = (req as AuthReq).user;
  const { amount } = req.body as { amount: number };
  if (!amount || amount <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: { userId: String(user.id), orgId: String(user.orgId) },
    });
    res.json({ clientSecret: intent.client_secret, intentId: intent.id });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PayPal helpers ──────────────────────────────────────────────────────────
async function getPayPalToken(base: string, clientId: string, secret: string): Promise<string> {
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

const PAYPAL_BASE = (sandbox: boolean) =>
  sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

// ── PayPal: Create Order ────────────────────────────────────────────────────
router.post("/checkout/paypal/order", requireAuth, async (req, res) => {
  const clientId = process.env["PAYPAL_CLIENT_ID"];
  const secret = process.env["PAYPAL_CLIENT_SECRET"];
  if (!clientId || !secret) { res.status(503).json({ error: "paypal_not_configured" }); return; }

  const { amount } = req.body as { amount: number };
  if (!amount || amount <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }

  try {
    const base = PAYPAL_BASE(process.env["PAYPAL_SANDBOX"] !== "false");
    const token = await getPayPalToken(base, clientId, secret);
    const orderRes = await fetch(`${base}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "EUR", value: amount.toFixed(2) } }],
      }),
    });
    const order = await orderRes.json() as { id: string };
    res.json({ orderId: order.id });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PayPal: Capture Order ───────────────────────────────────────────────────
router.post("/checkout/paypal/capture", requireAuth, async (req, res) => {
  const clientId = process.env["PAYPAL_CLIENT_ID"];
  const secret = process.env["PAYPAL_CLIENT_SECRET"];
  if (!clientId || !secret) { res.status(503).json({ error: "paypal_not_configured" }); return; }

  const { orderId } = req.body as { orderId: string };
  try {
    const base = PAYPAL_BASE(process.env["PAYPAL_SANDBOX"] !== "false");
    const token = await getPayPalToken(base, clientId, secret);
    const captureRes = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const data = await captureRes.json();
    res.json({ success: true, data });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Complete Checkout: enroll + invoice + transaction ──────────────────────
router.post("/checkout/complete", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { items, paymentMethod, paymentRef, amount } = req.body as {
    items: Array<{
      courseId: string;
      courseName: string;
      participantName: string;
      childId?: string;
      packageType: string;
      price: number;
    }>;
    paymentMethod: string;
    paymentRef: string;
    amount: number;
  };

  // 1. Record transaction
  const { data: txn } = await supabase
    .from("transactions")
    .insert({
      organization_id: user.orgId,
      amount,
      status: "completed",
      description: `Enrollment — ${items.map(i => i.courseName).join(", ")}`,
      payment_ref: paymentRef,
      payment_method: paymentMethod,
      user_id: parseInt(user.id),
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  // 2. Create enrollments (upsert so re-enrolling is safe)
  const enrollmentErrors: string[] = [];
  for (const item of items) {
    if (!item.childId || !item.courseId) continue;
    const { error } = await supabase
      .from("enrollments")
      .upsert(
        { child_id: parseInt(item.childId), course_id: parseInt(item.courseId), status: "enrolled" },
        { onConflict: "child_id,course_id" },
      );
    if (error) {
      req.log.error({ msg: "Enrollment failed", error, item });
      enrollmentErrors.push(`${item.participantName}: ${error.message}`);
    }
  }

  // 3. Generate invoice document
  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
  const invoiceTitle = `Invoice ${invoiceNumber} — €${Number(amount).toFixed(2)}`;
  const { data: doc } = await supabase
    .from("documents")
    .insert({
      organization_id: user.orgId,
      title: invoiceTitle,
      type: "invoice",
      mandatory: false,
      is_deleted: false,
      priority: 0,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  res.json({
    success: true,
    invoiceNumber,
    invoiceId: (doc as { id?: number } | null)?.id ?? null,
    transactionId: (txn as { id?: number } | null)?.id ?? null,
    enrollmentErrors: enrollmentErrors.length > 0 ? enrollmentErrors : null,
  });
});

export default router;
