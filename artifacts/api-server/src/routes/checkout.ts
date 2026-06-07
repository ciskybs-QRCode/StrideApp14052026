import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Shared types ──────────────────────────────────────────────────────────────
export type CheckoutLineItem = {
  courseId:        string;
  courseName:      string;
  participantName: string;
  packageType:     string;
  childId?:        string;
  unitPrice:       number;   // server-verified (DB or client_fallback)
  discount:        number;   // server-calculated
  finalPrice:      number;   // unitPrice - discount
  priceSource:     "db" | "client_fallback";
};

type CartItemInput = {
  courseId:        string;
  courseName:      string;
  participantName: string;
  childId?:        string;
  packageType:     string;
  clientPrice?:    number;  // only trusted when DB has no record (private lessons)
};

// ── Server-side price resolution ─────────────────────────────────────────────
// Fetches authoritative prices from the courses table.
// Private lessons (courseId starts with "private-") fall back to clientPrice.
async function resolveLineItems(
  orgId: number,
  items: CartItemInput[],
  promoCode?: string,
  promoDiscountType?: "percent" | "amount",
  promoDiscountPercent?: number,
  promoDiscountAmount?: number,
  promoTargetCourseIds?: string[],
): Promise<CheckoutLineItem[]> {
  const numericIds = items
    .map(i => parseInt(i.courseId))
    .filter(id => !isNaN(id) && id > 0);

  let courseMap = new Map<number, { name: string; price: number }>();
  if (numericIds.length > 0) {
    const { data: dbCourses } = await supabase
      .from("courses")
      .select("id, name, price")
      .eq("organization_id", orgId)
      .in("id", numericIds);

    type DbRow = { id: number; name: string; price: number };
    courseMap = new Map<number, { name: string; price: number }>(
      (dbCourses ?? []).map((c: DbRow) => [c.id, { name: c.name, price: c.price }]),
    );
  }

  return items.map(item => {
    const numericId = parseInt(item.courseId);
    const dbRow     = !isNaN(numericId) ? courseMap.get(numericId) : null;

    let unitPrice: number;
    let priceSource: "db" | "client_fallback";

    if (dbRow) {
      unitPrice   = dbRow.price;
      priceSource = "db";
    } else {
      // Private lesson or demo course — accept client-provided price
      unitPrice   = item.clientPrice ?? 0;
      priceSource = "client_fallback";
    }

    // Server-side promo calculation
    let discount = 0;
    if (promoCode) {
      const targets = promoTargetCourseIds ?? [];
      const matches = targets.length === 0 || targets.includes(item.courseId);
      if (matches) {
        if (promoDiscountType === "percent" && promoDiscountPercent != null) {
          discount = Math.round(unitPrice * promoDiscountPercent) / 100;
        } else if (promoDiscountType === "amount" && promoDiscountAmount != null) {
          discount = Math.min(promoDiscountAmount, unitPrice);
        }
      }
    }

    const finalPrice = Math.max(0, unitPrice - discount);
    return {
      courseId:        item.courseId,
      courseName:      item.courseName,
      participantName: item.participantName,
      packageType:     item.packageType,
      childId:         item.childId,
      unitPrice,
      discount,
      finalPrice,
      priceSource,
    };
  });
}

// ── POST /checkout/web-session ────────────────────────────────────────────────
// Client sends item IDs + participant info — never prices.
// Server fetches authoritative prices, logs to payment_audit_log, then
// creates the Stripe session. Returns the itemized breakdown to the app.
router.post("/checkout/web-session", requireAuth, async (req, res) => {
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!stripeKey) {
    res.status(503).json({ error: "stripe_not_configured" });
    return;
  }

  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;

  const {
    items,
    promoCode,
    promoDiscountType,
    promoDiscountPercent,
    promoDiscountAmount,
    promoTargetCourseIds,
  } = req.body as {
    items:                 CartItemInput[];
    promoCode?:            string;
    promoDiscountType?:    "percent" | "amount";
    promoDiscountPercent?: number;
    promoDiscountAmount?:  number;
    promoTargetCourseIds?: string[];
  };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "No items provided" });
    return;
  }

  try {
    // ── 1. Server-side price resolution ─────────────────────────────────────
    const lineItems = await resolveLineItems(
      orgId, items,
      promoCode, promoDiscountType, promoDiscountPercent,
      promoDiscountAmount, promoTargetCourseIds,
    );

    const discountApplied  = lineItems.reduce((s, i) => s + i.discount,   0);
    const calculatedTotal  = lineItems.reduce((s, i) => s + i.finalPrice, 0);
    const calculatedCents  = Math.round(calculatedTotal * 100);

    if (calculatedCents <= 0) {
      res.status(400).json({ error: "Calculated total is zero" });
      return;
    }

    // ── 2. Audit log — written BEFORE Stripe session is created ─────────────
    const { data: auditRow } = await supabase
      .from("payment_audit_log")
      .insert({
        organization_id:  orgId,
        user_id:          String(user.id),
        items_list:       lineItems,
        calculated_total: calculatedTotal,
        discount_applied: discountApplied,
        promo_code:       promoCode ?? null,
      })
      .select("request_id")
      .single();

    const auditId = (auditRow as { request_id?: string } | null)?.request_id ?? "unknown";

    // ── 3. Org config ────────────────────────────────────────────────────────
    const { data: orgData } = await supabase
      .from("organizations")
      .select("currency, stripe_connect_account_id, trial_ends_at")
      .eq("id", orgId)
      .maybeSingle();

    const currency    = (orgData as { currency?: string }                   | null)?.currency?.toLowerCase() ?? "eur";
    const connectId   = (orgData as { stripe_connect_account_id?: string }  | null)?.stripe_connect_account_id ?? null;
    const trialEndsAt = (orgData as { trial_ends_at?: string }              | null)?.trial_ends_at ?? null;
    const isTrial     = !trialEndsAt || new Date() < new Date(trialEndsAt);

    const rawDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0]
      ?? process.env["REPLIT_DEV_DOMAIN"]
      ?? "localhost";
    const baseUrl = `https://${rawDomain}`;

    // ── 4. Create Stripe session using server-calculated amounts ─────────────
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

    const stripeLineItems = lineItems.map(item => ({
      price_data: {
        currency,
        product_data: {
          name:        `${item.courseName} — ${item.participantName}`,
          description: item.packageType === "fixedBlock" ? "Full Package" : "Single Lesson",
        },
        unit_amount: Math.round(item.finalPrice * 100),
      },
      quantity: 1,
    }));

    type SessionParams = Parameters<typeof stripe.checkout.sessions.create>[0];
    const sessionParams: SessionParams = {
      mode:         "payment",
      line_items:   stripeLineItems,
      success_url:  `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:   `${baseUrl}/payment-cancelled`,
      metadata: {
        type:    "member_checkout",
        orgId:   String(orgId),
        userId:  String(user.id),
        auditId,
      },
    };

    if (connectId) {
      sessionParams.payment_intent_data = {
        transfer_data:        { destination: connectId },
        application_fee_amount: isTrial ? 0 : Math.round(calculatedCents * 0.02),
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // ── 5. Link audit record to the Stripe session ───────────────────────────
    await Promise.all([
      supabase
        .from("payment_audit_log")
        .update({ stripe_session_id: session.id })
        .eq("request_id", auditId),
      supabase.from("checkout_sessions").insert({
        session_id:      session.id,
        organization_id: orgId,
        user_id:         String(user.id),
        status:          "pending",
        items:           lineItems,
        amount_cents:    calculatedCents,
      }),
    ]);

    res.json({
      sessionId:        session.id,
      checkoutUrl:      session.url,
      auditId,
      lineItems,
      calculatedTotal,
      discountApplied,
      currency,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /checkout/session-status/:sessionId ───────────────────────────────────
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

// ── processMemberCheckout (webhook / internal use) ────────────────────────────
// Called by the billing webhook on checkout.session.completed.
// Reads the server-verified items from checkout_sessions (never the client payload).
export async function processMemberCheckout(opts: {
  orgId:       number;
  userId:      string;
  sessionId:   string;
  items:       CheckoutLineItem[];
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
    const numericChildId  = parseInt(item.childId);
    const numericCourseId = parseInt(item.courseId);
    if (isNaN(numericChildId) || isNaN(numericCourseId)) continue;
    await supabase
      .from("enrollments")
      .upsert(
        { child_id: numericChildId, course_id: numericCourseId, status: "enrolled" },
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
