import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool, getPlatformStripeKey } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { invalidateTrialCache } from "../middleware/trial-guard.js";
import { calcQrBillCents, qrPricingTiers } from "../lib/qr-pricing.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /billing/status ───────────────────────────────────────────────────────
// Returns trial state, member count, cost breakdown, and subscription status.
router.get("/billing/status", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;

  try {
    // Billing unit = QR code.  Every member account AND every dependant (child)
    // carries a QR code and therefore counts as one seat.
    // authorized_pickups are NOT in either table — pickup contacts are always free.
    const [orgResult, memberResult, childResult] = await Promise.all([
      supabase
        .from("organizations")
        .select(
          "subscription_status, trial_ends_at, stripe_customer_id, " +
          "stripe_subscription_id, stripe_price_id_per_seat, cost_per_seat_cents, currency",
        )
        .eq("id", orgId)
        .maybeSingle(),
      supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase
        .from("children")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId),
    ]);

    const org = orgResult.data as {
      subscription_status?: string;
      trial_ends_at?: string;
      stripe_customer_id?: string;
      stripe_subscription_id?: string;
      stripe_price_id_per_seat?: string;
      cost_per_seat_cents?: number;
      currency?: string;
    } | null;

    // memberCount here = total QR codes (member seats + dependant seats)
    const memberCount = (memberResult.count ?? 0) + (childResult.count ?? 0);
    // Use landing-page tiered pricing; flat per-seat rate is no longer used.
    const currency = (org?.currency ?? "EUR").toUpperCase();
    const qrCodeCount = memberCount;  // memberCount already = members + children
    const totalMonthlyCents = calcQrBillCents(qrCodeCount, currency);
    const subscriptionStatus = org?.subscription_status ?? "trialing";
    const trialEndsAt = org?.trial_ends_at ?? null;
    const trialExpired = trialEndsAt ? new Date() > new Date(trialEndsAt) : false;

    res.json({
      subscriptionStatus,
      trialEndsAt,
      trialExpired,
      qrCodeCount,
      memberCount: qrCodeCount,    // backward compat alias
      costPerSeatCents: 0,         // N/A with tiered pricing
      currency,
      totalMonthlyCents,
      hasActiveSubscription: subscriptionStatus === "active",
      stripeCustomerId: org?.stripe_customer_id ?? null,
      stripeSubscriptionId: org?.stripe_subscription_id ?? null,
      tiers: qrPricingTiers(currency),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /billing/checkout-session ────────────────────────────────────────────
// Creates a Stripe Checkout Session (subscription mode) for the admin's org.
// Uses the platform owner's Stripe key (stored in system_config) so all
// subscription payments flow to the platform owner automatically.
router.post("/billing/checkout-session", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const stripeKey = await getPlatformStripeKey();
  if (!stripeKey) { res.status(503).json({ error: "stripe_not_configured" }); return; }

  try {
    const [orgResult, memberResult, childResult] = await Promise.all([
      supabase
        .from("organizations")
        .select("name, stripe_customer_id, stripe_price_id_per_seat, currency")
        .eq("id", orgId)
        .maybeSingle(),
      supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId),
      // Dependants (children) each have their own QR code → billed as a seat
      supabase
        .from("children")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId),
    ]);

    const org = orgResult.data as {
      name?: string;
      stripe_customer_id?: string;
      stripe_price_id_per_seat?: string;
      currency?: string;
    } | null;

    // Total QR codes = member accounts + their dependants
    const qrCount = Math.max(1, (memberResult.count ?? 0) + (childResult.count ?? 0));
    const orgCurrency = (org?.currency ?? "EUR").toUpperCase();
    // Monthly amount = tiered pricing, matching the landing-page calculator exactly
    const monthlyTotalCents = calcQrBillCents(qrCount, orgCurrency);

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

    // Ensure a Stripe Customer exists for this org
    let customerId = org?.stripe_customer_id ?? null;
    if (!customerId) {
      const adminData = await supabase
        .from("users")
        .select("email, name")
        .eq("id", user.id)
        .maybeSingle();
      const adminUser = adminData.data as { email?: string; name?: string } | null;
      const customer = await stripe.customers.create({
        email: adminUser?.email ?? user.email,
        name: org?.name ?? adminUser?.name ?? undefined,
        metadata: { orgId: String(orgId) },
      });
      customerId = customer.id;
      await supabase
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", orgId);
    }

    const rawDomain =
      process.env["REPLIT_DEV_DOMAIN"] ??
      process.env["REPLIT_DOMAINS"]?.split(",")[0] ??
      "localhost";
    const baseUrl = `https://${rawDomain}`;

    // Check if this org qualifies for the first-invoice 25% welcome discount
    const { data: discountCheck } = await supabase
      .from("organizations")
      .select("first_invoice_discount_applied")
      .eq("id", orgId)
      .maybeSingle();
    const isFirstSubscription =
      !(discountCheck as { first_invoice_discount_applied?: boolean } | null)
        ?.first_invoice_discount_applied;

    // Create a one-time Stripe coupon for the 25% welcome reward
    let welcomeCouponId: string | undefined;
    if (isFirstSubscription) {
      const coupon = await stripe.coupons.create({
        percent_off: 25,
        duration: "once",
        name: "Welcome — 25% First Month",
        metadata: { orgId: String(orgId) },
      });
      welcomeCouponId = coupon.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{
        price_data: {
          currency:     orgCurrency.toLowerCase(),
          product_data: { name: `Stride Platform — ${qrCount} QR codes` },
          unit_amount:  monthlyTotalCents,
          recurring:    { interval: "month" },
        },
        quantity: 1,
      }],
      ...(welcomeCouponId ? { discounts: [{ coupon: welcomeCouponId }] } : {}),
      subscription_data: {
        metadata: { orgId: String(orgId), qrCount: String(qrCount) },
      },
      success_url: `${baseUrl}/billing-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/billing-cancel`,
      metadata: { orgId: String(orgId) },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /billing/sync-seats ──────────────────────────────────────────────────
// Manually sync the Stripe subscription quantity to current member count.
router.post("/billing/sync-seats", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const stripeKey = await getPlatformStripeKey();
  if (!stripeKey) { res.status(503).json({ error: "stripe_not_configured" }); return; }

  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_subscription_id")
      .eq("id", orgId)
      .maybeSingle();

    const subId = (org as { stripe_subscription_id?: string } | null)?.stripe_subscription_id;
    if (!subId) { res.status(400).json({ error: "No active subscription found" }); return; }

    const [{ count: mCount }, { count: cCount }, orgCurrResult] = await Promise.all([
      supabase.from("members").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("children").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("organizations").select("currency").eq("id", orgId).maybeSingle(),
    ]);
    const qrCount = Math.max(1, (mCount ?? 0) + (cCount ?? 0));
    const currency = ((orgCurrResult.data as { currency?: string } | null)?.currency ?? "EUR").toUpperCase();
    const monthlyTotalCents = calcQrBillCents(qrCount, currency);

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);
    const sub = await stripe.subscriptions.retrieve(subId);
    const item = sub.items.data[0];
    if (item) {
      // Stripe SDK types lag behind the API: product_data IS valid on
      // subscriptionItems.update price_data but the TS types don't include it.
      await stripe.subscriptionItems.update(item.id, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        price_data: {
          currency:     currency.toLowerCase(),
          product_data: { name: `Stride Platform — ${qrCount} QR codes` },
          unit_amount:  monthlyTotalCents,
          recurring:    { interval: "month" },
        } as any,
        quantity: 1,
      });
    }

    res.json({ success: true, qrCount, monthlyTotalCents });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /billing/webhook ─────────────────────────────────────────────────────
// Stripe webhook handler (public — no auth, raw body required for sig check).
router.post("/billing/webhook", async (req, res) => {
  const stripeKey      = await getPlatformStripeKey();
  const webhookSecret  = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!stripeKey) { res.status(503).json({ error: "stripe_not_configured" }); return; }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

    // req.body is a Buffer when mounted with express.raw() in app.ts
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body));

    let event: import("stripe").Stripe.Event;

    if (webhookSecret) {
      const sig = req.headers["stripe-signature"] as string;
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      // Development-mode: accept without signature verification
      event = JSON.parse(rawBody.toString()) as import("stripe").Stripe.Event;
    }

    const getOrgId = (meta?: Record<string, string> | null): number | null => {
      const raw = meta?.["orgId"];
      return raw ? parseInt(raw, 10) : null;
    };

    switch (event.type) {
      case "invoice.paid": {
        const inv = event.data.object as import("stripe").Stripe.Invoice;
        const invAny = inv as unknown as { subscription_details?: { metadata?: Record<string, string> } };
        const orgId =
          getOrgId(invAny.subscription_details?.metadata) ??
          getOrgId(inv.metadata as Record<string, string>);
        if (orgId) {
          // Mark subscription active
          await supabase
            .from("organizations")
            .update({ subscription_status: "active" })
            .eq("id", orgId);
          invalidateTrialCache(orgId);

          // Mark first-invoice welcome discount as consumed (one-time reward)
          const { data: orgRow } = await supabase
            .from("organizations")
            .select("first_invoice_discount_applied")
            .eq("id", orgId)
            .maybeSingle();
          if (
            !(orgRow as { first_invoice_discount_applied?: boolean } | null)
              ?.first_invoice_discount_applied
          ) {
            await supabase
              .from("organizations")
              .update({ first_invoice_discount_applied: true })
              .eq("id", orgId);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as import("stripe").Stripe.Subscription;
        const orgId = getOrgId(sub.metadata as Record<string, string>);
        const mapped =
          sub.status === "active"   ? "active"   :
          sub.status === "past_due" ? "past_due" : "trialing";
        if (orgId) {
          await supabase.from("organizations").update({
            subscription_status: mapped,
            stripe_subscription_id: sub.id,
          }).eq("id", orgId);
          invalidateTrialCache(orgId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as import("stripe").Stripe.Subscription;
        const orgId = getOrgId(sub.metadata as Record<string, string>);
        if (orgId) {
          await supabase
            .from("organizations")
            .update({ subscription_status: "expired" })
            .eq("id", orgId);
          invalidateTrialCache(orgId);
        }
        break;
      }

      case "invoice.payment_failed":
      case "invoice.payment_action_required": {
        const inv = event.data.object as import("stripe").Stripe.Invoice;
        const invAny = inv as unknown as { subscription_details?: { metadata?: Record<string, string> } };
        const orgId =
          getOrgId(invAny.subscription_details?.metadata) ??
          getOrgId(inv.metadata as Record<string, string>);
        if (orgId) {
          await supabase
            .from("organizations")
            .update({ subscription_status: "past_due" })
            .eq("id", orgId);
          invalidateTrialCache(orgId);
        }
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as import("stripe").Stripe.Checkout.Session;
        const meta = session.metadata as Record<string, string> | null;

        if (meta?.["type"] === "member_checkout") {
          const orgId  = meta["orgId"]  ? parseInt(meta["orgId"])  : null;
          const userId = meta["userId"] ?? null;

          if (orgId && userId && session.id) {
            const { data: csRow } = await supabase
              .from("checkout_sessions")
              .select("items, amount_cents")
              .eq("session_id", session.id)
              .maybeSingle();

            const items      = (csRow as { items?: unknown[] }                | null)?.items       ?? [];
            const amtCents   = (csRow as { amount_cents?: number }            | null)?.amount_cents ?? 0;

            const { processMemberCheckout } = await import("./checkout.js");
            await processMemberCheckout({
              orgId,
              userId,
              sessionId:   session.id,
              items:       items as Parameters<typeof processMemberCheckout>[0]["items"],
              amountCents: amtCents,
            });
          }
        } else if (meta?.["type"] === "private_lesson") {
          const bookingId          = meta["bookingId"]          ? parseInt(meta["bookingId"])          : null;
          const operatorUserId     = meta["operatorUserId"]     ? parseInt(meta["operatorUserId"])     : null;
          const operatorPayoutCents = meta["operatorPayoutCents"] ? parseInt(meta["operatorPayoutCents"]) : 0;
          const orgId              = meta["orgId"]              ? parseInt(meta["orgId"])              : null;

          if (bookingId && orgId) {
            // Mark booking as paid/booked
            await pool.query(
              `UPDATE private_lesson_bookings SET status='booked', updated_at=NOW() WHERE id=$1`,
              [bookingId],
            ).catch(e => { (req as Request & { log?: { error: (e: unknown, msg: string) => void } }).log?.error(e, "pl booking update"); });

            // Auto-credit operator payroll if payout > 0
            if (operatorUserId && operatorPayoutCents > 0) {
              const { rows: bkRows } = await pool.query(
                `SELECT discipline_name, preferred_date FROM private_lesson_bookings WHERE id=$1`, [bookingId],
              );
              const bk           = (bkRows[0] ?? {}) as { discipline_name?: string; preferred_date?: string };
              const now          = new Date();
              const periodMonth  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
              const periodLabel  = now.toLocaleString("default", { month: "long", year: "numeric" });

              const { rows: opRows } = await pool.query(`SELECT name FROM users WHERE id=$1`, [operatorUserId]);
              const operatorName = (opRows[0] as { name?: string })?.name ?? "Operator";

              await pool.query(
                `INSERT INTO operator_invoice_submissions
                   (organization_id, operator_user_id, operator_name, period_label, period_month, total_cents, line_items)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [
                  orgId, operatorUserId, operatorName, periodLabel, periodMonth, operatorPayoutCents,
                  JSON.stringify([{
                    description: `Private ${bk.discipline_name ?? "lesson"} lesson${bk.preferred_date ? " · " + bk.preferred_date : ""}`,
                    amountCents: operatorPayoutCents,
                    bookingId,
                  }]),
                ],
              ).catch(() => {});

              // Mark payroll as credited on the booking
              await pool.query(
                `UPDATE private_lesson_bookings SET payroll_credited=true WHERE id=$1`, [bookingId],
              ).catch(() => {});
            }
          }
        } else {
          const orgId = getOrgId(meta);
          if (orgId && session.subscription) {
            await supabase.from("organizations").update({
              stripe_subscription_id: String(session.subscription),
            }).eq("id", orgId);
          }
        }
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ── generateBillingStatement ──────────────────────────────────────────────────
// Single source of truth for tenant billing. Explicitly filters out
// is_smart_pickup = true so Smart Pick-Up activity never inflates the bill.
export type BillingLineItem = {
  courseId: number;
  courseName: string;
  monthlyPriceCents: number;
  sessionsPerWeek: number;
};

export type BillingStatement = {
  orgId: number;
  memberCount: number;
  costPerSeatCents: number;
  memberFeeCents: number;
  courseItems: BillingLineItem[];
  totalMonthlyCents: number;
  currency: string;
  generatedAt: string;
};

export async function generateBillingStatement(orgId: number): Promise<BillingStatement> {
  // Billing unit = QR code.
  //   • Each member account has a QR code → 1 seat
  //   • Each dependant (child) has a QR code → 1 seat
  //   • authorized_pickups (pickup-only contacts) have NO QR code → 0 seats
  //   • Smart Pick-Up courses are logistics aids, never in the statement
  const [orgResult, memberResult, childResult, coursesResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("currency, cost_per_seat_cents")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("children")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("courses")
      .select("id, name, price, sessions_per_week, is_smart_pickup")
      .eq("organization_id", orgId)
      .eq("is_smart_pickup", false),
  ]);

  const org = orgResult.data as { currency?: string; cost_per_seat_cents?: number } | null;
  const qrCodeCount      = (memberResult.count ?? 0) + (childResult.count ?? 0);
  const currency         = org?.currency ?? "EUR";
  // Tiered pricing — matches landing-page calculator exactly
  const totalMonthlyCents = calcQrBillCents(qrCodeCount, currency);
  const memberFeeCents    = totalMonthlyCents;
  const costPerSeatCents  = qrCodeCount > 0 ? Math.round(totalMonthlyCents / qrCodeCount) : 0;
  const memberCount       = qrCodeCount;  // alias for output shape compat

  type DbCourse = { id: number; name: string; price: number; sessions_per_week?: number };
  const courses = (coursesResult.data ?? []) as DbCourse[];

  const courseItems: BillingLineItem[] = courses.map(c => ({
    courseId:         c.id,
    courseName:       c.name,
    monthlyPriceCents: Math.round(c.price * 100),
    sessionsPerWeek:  c.sessions_per_week ?? 1,
  }));

  return {
    orgId,
    memberCount,
    costPerSeatCents,
    memberFeeCents,
    courseItems,
    totalMonthlyCents,
    currency,
    generatedAt: new Date().toISOString(),
  };
}

// ── GET /billing/stripe-account ───────────────────────────────────────────────
// Returns current Stripe connection status for this org (admin only).
// Never returns the actual key — only a masked hint (last 4 chars).
router.get("/billing/stripe-account", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  try {
    const { data } = await supabase
      .from("organizations")
      .select("stripe_secret_key, branding_primary_color, branding_secondary_color, branding_logo_url")
      .eq("id", orgId)
      .maybeSingle();

    type OrgRow = {
      stripe_secret_key?:         string | null;
      branding_primary_color?:    string | null;
      branding_secondary_color?:  string | null;
      branding_logo_url?:         string | null;
    };
    const row = data as OrgRow | null;
    const key = row?.stripe_secret_key ?? null;

    res.json({
      connected:   !!key,
      keyHint:     key ? `...${key.slice(-4)}` : null,
      isLiveKey:   key ? key.startsWith("sk_live_") : null,
      branding: {
        primaryColor:   row?.branding_primary_color   ?? null,
        secondaryColor: row?.branding_secondary_color ?? null,
        logoUrl:        row?.branding_logo_url        ?? null,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /billing/stripe-account ──────────────────────────────────────────────
// Saves the org's own Stripe secret key after validating it with Stripe's API.
// Once set, all member payments for this org use this key directly — Stride
// is never in the money flow.
router.post("/billing/stripe-account", requireAuth, requireRole("admin"), async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;

  const { secretKey } = req.body as { secretKey?: string };
  if (!secretKey || !secretKey.startsWith("sk_")) {
    res.status(400).json({
      error:   "invalid_key_format",
      message: "Key must begin with sk_test_ or sk_live_",
    });
    return;
  }

  // Validate the key is accepted by Stripe before storing
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secretKey);
    await stripe.balance.retrieve();
  } catch {
    res.status(400).json({
      error:   "invalid_key",
      message: "Stripe rejected this key. Check it is correct and has not been revoked.",
    });
    return;
  }

  try {
    await supabase
      .from("organizations")
      .update({ stripe_secret_key: secretKey })
      .eq("id", orgId);

    res.json({
      success:   true,
      keyHint:   `...${secretKey.slice(-4)}`,
      isLiveKey: secretKey.startsWith("sk_live_"),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── DELETE /billing/stripe-account ────────────────────────────────────────────
// Removes the stored Stripe key — payments fall back to the Connect routing.
router.delete("/billing/stripe-account", requireAuth, requireRole("admin"), async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  try {
    await supabase
      .from("organizations")
      .update({ stripe_secret_key: null })
      .eq("id", orgId);
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PATCH /billing/branding ───────────────────────────────────────────────────
// Updates org branding used on the web checkout receipt page.
router.patch("/billing/branding", requireAuth, requireRole("admin"), async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  const { primaryColor, secondaryColor, logoUrl } = req.body as {
    primaryColor?:   string;
    secondaryColor?: string;
    logoUrl?:        string | null;
  };

  const updates: Record<string, unknown> = {};
  if (primaryColor   !== undefined) updates["branding_primary_color"]   = primaryColor;
  if (secondaryColor !== undefined) updates["branding_secondary_color"] = secondaryColor;
  if (logoUrl        !== undefined) updates["branding_logo_url"]        = logoUrl;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No branding fields provided" });
    return;
  }

  try {
    await supabase.from("organizations").update(updates).eq("id", orgId);
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
