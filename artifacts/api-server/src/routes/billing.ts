import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { invalidateTrialCache } from "../middleware/trial-guard.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /billing/status ───────────────────────────────────────────────────────
// Returns trial state, member count, cost breakdown, and subscription status.
router.get("/billing/status", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;

  try {
    const [orgResult, memberResult] = await Promise.all([
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

    const memberCount = memberResult.count ?? 0;
    const costPerSeatCents = org?.cost_per_seat_cents ?? 150; // $1.50 default
    const currency = org?.currency ?? "EUR";
    const subscriptionStatus = org?.subscription_status ?? "trialing";
    const trialEndsAt = org?.trial_ends_at ?? null;
    const trialExpired = trialEndsAt ? new Date() > new Date(trialEndsAt) : false;

    res.json({
      subscriptionStatus,
      trialEndsAt,
      trialExpired,
      memberCount,
      costPerSeatCents,
      currency,
      totalMonthlyCents: memberCount * costPerSeatCents,
      hasActiveSubscription: subscriptionStatus === "active",
      stripeCustomerId: org?.stripe_customer_id ?? null,
      stripeSubscriptionId: org?.stripe_subscription_id ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /billing/checkout-session ────────────────────────────────────────────
// Creates a Stripe Checkout Session (subscription mode) for the admin's org.
router.post("/billing/checkout-session", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!stripeKey) { res.status(503).json({ error: "stripe_not_configured" }); return; }

  try {
    const [orgResult, memberResult] = await Promise.all([
      supabase
        .from("organizations")
        .select("name, stripe_customer_id, stripe_price_id_per_seat, currency")
        .eq("id", orgId)
        .maybeSingle(),
      supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId),
    ]);

    const org = orgResult.data as {
      name?: string;
      stripe_customer_id?: string;
      stripe_price_id_per_seat?: string;
      currency?: string;
    } | null;

    const priceId = org?.stripe_price_id_per_seat ?? process.env["STRIPE_PRICE_ID_PER_SEAT"];
    if (!priceId) {
      res.status(400).json({
        error: "no_price_configured",
        message: "No Stripe price ID is configured. Contact platform administration.",
      });
      return;
    }

    const memberCount = Math.max(1, memberResult.count ?? 1);

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
      line_items: [{ price: priceId, quantity: memberCount }],
      ...(welcomeCouponId ? { discounts: [{ coupon: welcomeCouponId }] } : {}),
      subscription_data: {
        metadata: { orgId: String(orgId), memberCount: String(memberCount) },
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
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!stripeKey) { res.status(503).json({ error: "stripe_not_configured" }); return; }

  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_subscription_id")
      .eq("id", orgId)
      .maybeSingle();

    const subId = (org as { stripe_subscription_id?: string } | null)?.stripe_subscription_id;
    if (!subId) { res.status(400).json({ error: "No active subscription found" }); return; }

    const { count } = await supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId);
    const memberCount = Math.max(1, count ?? 1);

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);
    const sub = await stripe.subscriptions.retrieve(subId);
    const item = sub.items.data[0];
    if (item) {
      await stripe.subscriptionItems.update(item.id, { quantity: memberCount });
    }

    res.json({ success: true, memberCount });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /billing/webhook ─────────────────────────────────────────────────────
// Stripe webhook handler (public — no auth, raw body required for sig check).
router.post("/billing/webhook", async (req, res) => {
  const stripeKey      = process.env["STRIPE_SECRET_KEY"];
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

export default router;
