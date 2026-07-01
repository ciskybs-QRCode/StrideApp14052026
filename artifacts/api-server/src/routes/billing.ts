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
    const [orgResult, memberResult, childResult, pickupResult] = await Promise.all([
      supabase
        .from("organizations")
        .select(
          "subscription_status, trial_ends_at, data_deletion_scheduled_at, stripe_customer_id, " +
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
      // authorized_pickups are always FREE — counted separately for transparency
      supabase
        .from("authorized_pickups")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId),
    ]);

    const org = orgResult.data as {
      subscription_status?: string;
      trial_ends_at?: string;
      data_deletion_scheduled_at?: string;
      stripe_customer_id?: string;
      stripe_subscription_id?: string;
      stripe_price_id_per_seat?: string;
      cost_per_seat_cents?: number;
      currency?: string;
    } | null;

    const membersCount  = memberResult.count ?? 0;   // adult member accounts
    const childrenCount = childResult.count  ?? 0;   // dependant children
    const pickupCount   = pickupResult.count ?? 0;   // pickup-only contacts (always free)
    const qrCodeCount   = membersCount + childrenCount; // billable QR total

    const currency           = (org?.currency ?? "EUR").toUpperCase();
    const totalMonthlyCents  = calcQrBillCents(qrCodeCount, currency);
    const subscriptionStatus = org?.subscription_status ?? "trialing";
    const trialEndsAt        = org?.trial_ends_at ?? null;
    const trialExpired       = trialEndsAt ? new Date() > new Date(trialEndsAt) : false;

    res.json({
      subscriptionStatus,
      trialEndsAt,
      trialExpired,
      dataDeletionScheduledAt: org?.data_deletion_scheduled_at ?? null,
      qrCodeCount,
      membersCount,
      childrenCount,
      pickupCount,
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
    const [orgResult, planTier] = await Promise.all([
      supabase
        .from("organizations")
        .select("name, stripe_customer_id, currency, trial_ends_at, first_invoice_discount_applied")
        .eq("id", orgId)
        .maybeSingle(),
      getOrgPlanTier(orgId),
    ]);

    const org = orgResult.data as {
      name?: string;
      stripe_customer_id?: string;
      currency?: string;
      trial_ends_at?: string | null;
      first_invoice_discount_applied?: boolean;
    } | null;

    // Flat plan pricing: Core €49 · Plus €99 · Premium €199 (in EUR cents)
    const PLAN_NAMES: Record<string, string> = { core: "Core", plus: "Plus", premium: "Premium" };
    const monthlyTotalCents = PLAN_PRICES[planTier] ?? PLAN_PRICES["core"];
    const planName          = PLAN_NAMES[planTier] ?? "Core";
    const orgCurrency       = (org?.currency ?? "EUR").toUpperCase();

    // Trial end: honour existing trial_ends_at for Stripe trial_end anchor
    const trialEndsAt    = org?.trial_ends_at ? new Date(org.trial_ends_at) : null;
    const trialEndUnix   = trialEndsAt && trialEndsAt > new Date()
      ? Math.floor(trialEndsAt.getTime() / 1000)
      : undefined;

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

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
        name:  org?.name ?? adminUser?.name ?? undefined,
        metadata: { orgId: String(orgId) },
      });
      customerId = customer.id;
      await supabase.from("organizations").update({ stripe_customer_id: customerId }).eq("id", orgId);
    }

    const rawDomain =
      process.env["REPLIT_DEV_DOMAIN"] ??
      process.env["REPLIT_DOMAINS"]?.split(",")[0] ??
      "localhost";
    const baseUrl = `https://${rawDomain}`;

    // First subscription: 25% welcome coupon (waived if org came through a referral credit)
    const isFirstSubscription = !org?.first_invoice_discount_applied;
    let welcomeCouponId: string | undefined;
    if (isFirstSubscription) {
      const coupon = await stripe.coupons.create({
        percent_off: 25,
        duration:    "once",
        name:        "Welcome — 25% First Month",
        metadata:    { orgId: String(orgId) },
      });
      welcomeCouponId = coupon.id;
    }

    // Use pre-created Stripe Price IDs when available (preferred — avoids ad-hoc price creation).
    // Fall back to price_data for environments where env vars are not yet set.
    const STRIPE_PRICE_IDS: Record<string, string | undefined> = {
      core:    process.env["STRIPE_PRICE_CORE"],
      plus:    process.env["STRIPE_PRICE_PLUS"],
      premium: process.env["STRIPE_PRICE_PREMIUM"],
    };
    const stripePriceId = STRIPE_PRICE_IDS[planTier];

    const session = await stripe.checkout.sessions.create({
      mode:     "subscription",
      customer: customerId,
      line_items: [stripePriceId ? {
        price:    stripePriceId,
        quantity: 1,
      } : {
        price_data: {
          currency:     orgCurrency.toLowerCase(),
          product_data: { name: `Stride Platform — ${planName} Plan` },
          unit_amount:  monthlyTotalCents,
          recurring:    { interval: "month" },
        },
        quantity: 1,
      }],
      ...(welcomeCouponId ? { discounts: [{ coupon: welcomeCouponId }] } : {}),
      subscription_data: {
        metadata: { orgId: String(orgId), plan_tier: planTier },
        ...(trialEndUnix ? { trial_end: trialEndUnix } : {}),
      },
      success_url: `${baseUrl}/billing-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/billing-cancel`,
      metadata:    { orgId: String(orgId) },
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
    } else if (process.env["NODE_ENV"] === "development") {
      // Development-mode ONLY: accept without signature verification.
      // In any other environment a missing STRIPE_WEBHOOK_SECRET is a hard
      // failure — accepting unsigned webhooks would let anyone forge events
      // (e.g. "invoice.paid") and mark an org's subscription active for free.
      event = JSON.parse(rawBody.toString()) as import("stripe").Stripe.Event;
    } else {
      req.log.error(
        "STRIPE_WEBHOOK_SECRET is not set in a non-development environment — refusing to process unsigned webhook",
      );
      res.status(503).json({ error: "webhook_not_configured" });
      return;
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

            // Store payment_intent_id for future refunds
            if (session.payment_intent) {
              const { pool: piPool } = await import("../lib/pg.js");
              const piId = typeof session.payment_intent === "string"
                ? session.payment_intent
                : (session.payment_intent as { id: string }).id;
              await piPool.query(
                `UPDATE checkout_sessions SET payment_intent_id = $1 WHERE session_id = $2`,
                [piId, session.id],
              ).catch(() => {});
            }

            // Capture Stripe subscription_id for recurring sessions
            if (session.subscription) {
              const { pool: pgPool }        = await import("../lib/pg.js");
              const { getPricingForOrg }    = await import("../lib/pricing-service.js");
              const { currency }            = await getPricingForOrg(orgId);
              const subId = typeof session.subscription === "string"
                ? session.subscription
                : (session.subscription as { id: string }).id;
              type SubItem = { courseName?: string; participantName?: string; packageType?: string; price?: number; quantity?: number };
              const subItems = (items as SubItem[]).filter(
                i => i.packageType === "monthlyBilling" || i.packageType === "annual",
              );
              for (const item of subItems) {
                await pgPool.query(
                  `INSERT INTO member_subscriptions
                     (stripe_subscription_id, organization_id, user_id,
                      participant_name, item_name, item_type, package_type,
                      amount_cents, currency, status, created_at)
                   VALUES ($1,$2,$3,$4,$5,'course',$6,$7,$8,'active',NOW())
                   ON CONFLICT (stripe_subscription_id) DO NOTHING`,
                  [
                    subId, orgId, userId,
                    item.participantName ?? null,
                    item.courseName ?? null,
                    item.packageType ?? "monthlyBilling",
                    Math.round((item.price ?? 0) * 100 * (item.quantity ?? 1)),
                    currency.toUpperCase(),
                  ],
                ).catch(() => {});
              }
            }
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
        } else if (meta?.["type"] === "fee_event_addon") {
          // Mark optional add-on order as paid — triggered only after Stripe confirms payment.
          const feeEventId = meta["feeEventId"] ? parseInt(meta["feeEventId"]) : null;
          const userId     = meta["userId"]     ? parseInt(meta["userId"])     : null;
          if (feeEventId && userId) {
            const { pool: pgPool } = await import("../lib/pg.js");
            await pgPool.query(
              `UPDATE fee_event_optional_orders
                 SET payment_status='paid', paid_at=NOW()
               WHERE fee_event_id=$1 AND user_id=$2 AND payment_status='awaiting_payment'`,
              [feeEventId, userId],
            ).catch(() => {});
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

// ── Shared plan helpers ───────────────────────────────────────────────────────

/**
 * Billing unit = member accounts (adult members only).
 * Children/dependants: FREE.  Operators: capped, not billed.  Admin: FREE.
 */
export const PLAN_LIMITS: Record<string, { accounts: number | null; ops: number | null }> = {
  core:    { accounts: 100,  ops: 3    },
  plus:    { accounts: 500,  ops: 10   },
  premium: { accounts: 2000, ops: null },
  // legacy aliases
  studio:  { accounts: 100,  ops: 3    },
  company: { accounts: 500,  ops: 10   },
  academy: { accounts: 2000, ops: null },
};

/** Flat monthly price in EUR cents per tier. */
export const PLAN_PRICES: Record<string, number> = {
  core:    4900,
  plus:    9900,
  premium: 19900,
};

/** Read org plan tier from local pg (org_plan_settings). Falls back to 'core'. */
export async function getOrgPlanTier(orgId: number): Promise<string> {
  const { rows } = await pool.query(
    `SELECT plan_tier FROM org_plan_settings WHERE org_id = $1`,
    [orgId],
  );
  return (rows[0] as { plan_tier?: string } | undefined)?.plan_tier ?? "core";
}

/** Upsert org plan tier in local pg. */
export async function setOrgPlanTier(orgId: number, tier: string): Promise<void> {
  await pool.query(
    `INSERT INTO org_plan_settings (org_id, plan_tier, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (org_id) DO UPDATE SET plan_tier = $2, updated_at = NOW()`,
    [orgId, tier],
  );
}

// ── GET /billing/plan ─────────────────────────────────────────────────────────
router.get("/billing/plan", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  try {
    const [planTier, subResult, membersResult, opsResult, grantResult] = await Promise.all([
      getOrgPlanTier(orgId),
      supabase.from("organizations").select("subscription_status").eq("id", orgId).single(),
      // Billing unit: member accounts only (roles parent/member). Children are FREE.
      supabase.from("users").select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("role", ["parent", "member"]),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("role", ["operator"]),
      pool.query(
        `SELECT plan_tier, end_date FROM org_access_grants
         WHERE org_id = $1 AND is_active = true AND start_date <= NOW()
           AND (end_date IS NULL OR end_date > NOW())
         ORDER BY created_at DESC LIMIT 1`,
        [orgId],
      ),
    ]);
    const activeGrant = (grantResult.rows[0] as { plan_tier?: string; end_date?: string } | undefined);
    const effectiveTier = activeGrant?.plan_tier ?? planTier;
    const accountCount = membersResult.count ?? 0; // member accounts only — billing unit
    const opCount      = opsResult.count      ?? 0;
    res.json({
      plan_tier: effectiveTier,
      stored_tier: planTier,
      subscription_status: (subResult.data as { subscription_status?: string } | null)?.subscription_status ?? "trialing",
      current_accounts: accountCount,
      current_qr: accountCount,          // backward-compat alias
      current_operators: opCount,
      limits: PLAN_LIMITS,
      active_grant: activeGrant ? { plan_tier: activeGrant.plan_tier, end_date: activeGrant.end_date ?? null } : null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PATCH /billing/plan ───────────────────────────────────────────────────────
router.patch("/billing/plan", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  const { tier } = req.body as { tier?: string };
  const VALID = ["core", "plus", "premium"];
  if (!tier || !VALID.includes(tier)) {
    res.status(400).json({ error: "tier must be core | plus | premium" }); return;
  }
  try {
    const lim = PLAN_LIMITS[tier];
    if (lim.accounts !== null || lim.ops !== null) {
      const [membersResult, opsResult] = await Promise.all([
        supabase.from("users").select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("role", ["parent", "member"]),
        supabase.from("users").select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("role", ["operator"]),
      ]);
      const accountCount = membersResult.count ?? 0;
      const opCount      = opsResult.count      ?? 0;
      if (lim.accounts !== null && accountCount > lim.accounts) {
        res.status(422).json({ error: `Cannot downgrade: you have ${accountCount} member accounts but ${tier} allows max ${lim.accounts}. Remove members first.`, current_accounts: accountCount, limit_accounts: lim.accounts }); return;
      }
      if (lim.ops !== null && opCount > lim.ops) {
        res.status(422).json({ error: `Cannot downgrade: you have ${opCount} operators but ${tier} allows max ${lim.ops}. Remove operators first.`, current_operators: opCount, limit_operators: lim.ops }); return;
      }
    }
    await setOrgPlanTier(orgId, tier);
    res.json({ success: true, plan_tier: tier });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /billing/start-free-trial ───────────────────────────────────────────
// Start a 2-month free trial for the org (no payment data required).
router.post("/billing/start-free-trial", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  const { plan_tier } = req.body as { plan_tier?: string };
  const VALID = ["core", "plus", "premium"];
  const tier = VALID.includes(plan_tier ?? "") ? (plan_tier as string) : "core";
  try {
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 2);
    await pool.query(
      `INSERT INTO plan_trial_periods (org_id, plan_tier, start_date, end_date, status)
       VALUES ($1, $2, NOW(), $3, 'active')
       ON CONFLICT (org_id) DO NOTHING`,
      [orgId, tier, endDate.toISOString()],
    );
    // Also set the plan tier
    await setOrgPlanTier(orgId, tier);
    const daysRemaining = Math.ceil((endDate.getTime() - Date.now()) / 86_400_000);
    res.json({ ok: true, end_date: endDate.toISOString(), days_remaining: daysRemaining });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /billing/upgrade-trial-status ─────────────────────────────────────────
router.get("/billing/upgrade-trial-status", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  try {
    const { rows } = await pool.query<{
      id: number; from_tier: string; to_tier: string; status: string;
      start_date: string | null; end_date: string | null;
      confirmed_upgrade: boolean; offer_sent_at: string | null;
    }>(
      `SELECT id, from_tier, to_tier, status, start_date, end_date, confirmed_upgrade, offer_sent_at
       FROM plan_upgrade_trials WHERE org_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [orgId],
    );
    if (!rows.length) {
      res.json({ offer_pending: false, trial_active: false, from_tier: null, to_tier: null,
                 days_remaining: null, end_date: null, price_difference_cents: null,
                 confirmed_upgrade: false, id: null });
      return;
    }
    const row = rows[0]!;
    const isActive  = row.status === "active" && row.end_date !== null && new Date(row.end_date) > new Date();
    const daysLeft  = row.end_date
      ? Math.max(0, Math.ceil((new Date(row.end_date).getTime() - Date.now()) / 86_400_000))
      : null;
    const fromPrice = PLAN_PRICES[row.from_tier] ?? 4900;
    const toPrice   = PLAN_PRICES[row.to_tier]   ?? 9900;
    res.json({
      offer_pending:           row.status === "offer_sent",
      trial_active:            isActive,
      from_tier:               row.from_tier,
      to_tier:                 row.to_tier,
      days_remaining:          daysLeft,
      end_date:                row.end_date,
      price_difference_cents:  toPrice - fromPrice,
      confirmed_upgrade:       row.confirmed_upgrade,
      id:                      row.id,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /billing/activate-upgrade-trial/:token ───────────────────────────────
// Public route — called from email link; activates the 2-month upgrade trial.
router.post("/billing/activate-upgrade-trial/:token", async (req, res) => {
  const { token } = req.params as { token: string };
  try {
    const { rows } = await pool.query<{ id: number; org_id: number; to_tier: string; status: string }>(
      `SELECT id, org_id, to_tier, status FROM plan_upgrade_trials WHERE activation_token = $1 LIMIT 1`,
      [token],
    );
    if (!rows.length) { res.status(404).json({ error: "Invalid or expired token" }); return; }
    const row = rows[0]!;
    if (row.status !== "offer_sent") { res.json({ ok: true, message: "Trial already activated" }); return; }
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 2);
    await pool.query(
      `UPDATE plan_upgrade_trials
       SET status = 'active', activated_at = NOW(), start_date = NOW(), end_date = $1 WHERE id = $2`,
      [endDate.toISOString(), row.id],
    );
    // Bump the org's plan tier to the trial tier
    await setOrgPlanTier(row.org_id, row.to_tier);
    const daysRemaining = Math.ceil((endDate.getTime() - Date.now()) / 86_400_000);
    res.json({ ok: true, end_date: endDate.toISOString(), days_remaining: daysRemaining });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /billing/confirm-upgrade-trial ───────────────────────────────────────
// Admin confirms they want to keep the upgraded plan (will be charged at next cycle).
router.post("/billing/confirm-upgrade-trial", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  try {
    const { rows } = await pool.query<{ id: number; to_tier: string }>(
      `SELECT id, to_tier FROM plan_upgrade_trials WHERE org_id = $1 AND status = 'active' LIMIT 1`,
      [orgId],
    );
    if (!rows.length) { res.status(404).json({ error: "No active upgrade trial found" }); return; }
    const row = rows[0]!;
    await pool.query(`UPDATE plan_upgrade_trials SET confirmed_upgrade = true, status = 'confirmed' WHERE id = $1`, [row.id]);
    await setOrgPlanTier(orgId, row.to_tier);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /billing/decline-upgrade-trial ───────────────────────────────────────
// Admin declines — revert to the original plan at trial end (or immediately).
router.post("/billing/decline-upgrade-trial", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const orgId = (req as AuthReq).user.orgId ?? 1;
  try {
    const { rows } = await pool.query<{ id: number; from_tier: string }>(
      `SELECT id, from_tier FROM plan_upgrade_trials WHERE org_id = $1 AND status IN ('active','offer_sent') LIMIT 1`,
      [orgId],
    );
    if (!rows.length) { res.status(404).json({ error: "No active upgrade trial found" }); return; }
    const row = rows[0]!;
    await pool.query(`UPDATE plan_upgrade_trials SET status = 'declined' WHERE id = $1`, [row.id]);
    // Revert plan tier to the original
    await setOrgPlanTier(orgId, row.from_tier);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /billing/plan-prices ───────────────────────────────────────────────────
// Public-ish — returns flat monthly prices per tier.
router.get("/billing/plan-prices", async (_req, res) => {
  res.json(PLAN_PRICES);
});

export default router;
