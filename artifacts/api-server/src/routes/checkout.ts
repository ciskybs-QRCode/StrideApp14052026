import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";
import { getPricingForOrg } from "../lib/pricing-service.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Shared types ──────────────────────────────────────────────────────────────
export type CheckoutLineItem = {
  courseId:          string;
  courseName:        string;
  participantName:   string;
  packageType:       string;
  childId?:          string;
  organizationName?: string;
  unitPrice:         number;
  discount:          number;
  finalPrice:        number;
  priceSource:       "db" | "client_fallback";
};

type CartItemInput = {
  type?:                "course" | "private_lesson" | "marketplace" | "event_ticket" | "membership";
  courseId:             string;
  courseName:           string;
  participantName:      string;
  childId?:             string;
  packageType:          string;
  clientPrice?:         number;
  // Marketplace
  marketplaceProductId?: string;
  // Event tickets
  eventId?:             string;
  eventTicketTypeId?:   string;
  quantity?:            number;
  // Membership
  memberId?:            string;
  memberType?:          "member" | "dependant";
};

type OrgRow = {
  currency?:                  string;
  stripe_connect_account_id?: string;
  stripe_secret_key?:         string;
  name?:                      string;
  branding_primary_color?:    string;
  branding_secondary_color?:  string;
  branding_logo_url?:         string | null;
  trial_ends_at?:             string;
};

// ── Server-side price resolution ─────────────────────────────────────────────
async function resolveLineItems(
  orgId:                  number,
  items:                  CartItemInput[],
  orgName?:               string,
  promoCode?:             string,
  promoDiscountType?:     "percent" | "amount",
  promoDiscountPercent?:  number,
  promoDiscountAmount?:   number,
  promoTargetCourseIds?:  string[],
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
      unitPrice   = item.clientPrice ?? 0;
      priceSource = "client_fallback";
    }

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
      courseId:         item.courseId,
      courseName:       item.courseName,
      participantName:  item.participantName,
      packageType:      item.packageType,
      childId:          item.childId,
      organizationName: orgName,
      unitPrice,
      discount,
      finalPrice,
      priceSource,
    };
  });
}

// ── Line item display helpers ─────────────────────────────────────────────────

function buildLineItemName(item: CheckoutLineItem): string {
  const base = item.participantName
    ? `${item.courseName} — ${item.participantName}`
    : item.courseName;
  return base;
}

function buildLineItemDescription(item: CheckoutLineItem): string {
  const pkg = item.packageType;
  if (pkg === "fixedBlock")    return "Full Package";
  if (pkg === "monthlyBilling") return "Monthly Subscription";
  if (pkg === "annual")         return "Annual Subscription";
  if (pkg === "one_time")       return "One-time Purchase";
  return "Single Lesson";
}

// ── resolveAllLineItems — handles all CartItem types ─────────────────────────

async function resolveAllLineItems(
  orgId:                 number,
  items:                 CartItemInput[],
  orgName?:              string,
  promoCode?:            string,
  promoDiscountType?:    "percent" | "amount",
  promoDiscountPercent?: number,
  promoDiscountAmount?:  number,
  promoTargetCourseIds?: string[],
): Promise<CheckoutLineItem[]> {
  const results: CheckoutLineItem[] = [];

  // Group course/private_lesson items for batch resolution
  const courseItems = items.filter(i => !i.type || i.type === "course" || i.type === "private_lesson");
  const otherItems  = items.filter(i =>  i.type && i.type !== "course" && i.type !== "private_lesson");

  // Resolve course items via existing logic
  if (courseItems.length > 0) {
    const resolved = await resolveLineItems(
      orgId, courseItems, orgName,
      promoCode, promoDiscountType, promoDiscountPercent,
      promoDiscountAmount, promoTargetCourseIds,
    );
    results.push(...resolved);
  }

  // Resolve non-course items individually
  for (const item of otherItems) {
    const itemType = item.type!;
    const qty      = Math.max(1, item.quantity ?? 1);

    if (itemType === "marketplace") {
      let unitPrice: number    = item.clientPrice ?? 0;
      let priceSource: "db" | "client_fallback" = "client_fallback";
      if (item.marketplaceProductId) {
        const pid = parseInt(item.marketplaceProductId);
        if (!isNaN(pid)) {
          const { rows } = await pool.query<{ price_cents: number; name: string }>(
            `SELECT price_cents, name FROM marketplace_products
             WHERE id = $1 AND (org_id = $2 OR is_stride_verified = TRUE) AND is_active = TRUE`,
            [pid, orgId],
          );
          if (rows[0]) { unitPrice = rows[0].price_cents / 100; priceSource = "db"; }
        }
      }
      results.push({
        courseId:         item.courseId,
        courseName:       item.courseName,
        participantName:  item.participantName,
        packageType:      "one_time",
        organizationName: orgName,
        unitPrice,
        discount:         0,
        finalPrice:       unitPrice * qty,
        priceSource,
      });
    } else if (itemType === "event_ticket") {
      let unitPrice: number    = item.clientPrice ?? 0;
      let priceSource: "db" | "client_fallback" = "client_fallback";
      if (item.eventTicketTypeId) {
        const tid = parseInt(item.eventTicketTypeId);
        if (!isNaN(tid)) {
          const { rows } = await pool.query<{ price_cents: number }>(
            `SELECT price_cents FROM event_ticket_types WHERE id = $1`,
            [tid],
          );
          if (rows[0]) { unitPrice = rows[0].price_cents / 100; priceSource = "db"; }
        }
      }
      results.push({
        courseId:         item.courseId,
        courseName:       item.courseName,
        participantName:  item.participantName,
        packageType:      "one_time",
        organizationName: orgName,
        unitPrice,
        discount:         0,
        finalPrice:       unitPrice * qty,
        priceSource,
      });
    } else if (itemType === "membership") {
      let unitPrice: number    = item.clientPrice ?? 0;
      let priceSource: "db" | "client_fallback" = "client_fallback";
      const isAnnual = item.packageType === "annual";
      const { rows } = await pool.query<{ membership_annual_fee_cents: number; membership_monthly_fee_cents: number }>(
        `SELECT membership_annual_fee_cents, membership_monthly_fee_cents
         FROM admin_settings WHERE organization_id = $1`,
        [orgId],
      );
      if (rows[0]) {
        const cents = isAnnual ? rows[0].membership_annual_fee_cents : rows[0].membership_monthly_fee_cents;
        unitPrice   = cents / 100;
        priceSource = "db";
      }
      results.push({
        courseId:         item.courseId,
        courseName:       item.courseName,
        participantName:  item.participantName,
        packageType:      item.packageType,
        organizationName: orgName,
        unitPrice,
        discount:         0,
        finalPrice:       unitPrice,
        priceSource,
      });
    }
  }

  return results;
}

// ── POST /checkout/web-session ────────────────────────────────────────────────
router.post("/checkout/web-session", requireAuth, async (req, res) => {
  const masterStripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!masterStripeKey) {
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
    const { data: orgData } = await supabase
      .from("organizations")
      .select(
        "currency, stripe_connect_account_id, stripe_secret_key, " +
        "name, branding_primary_color, branding_secondary_color, branding_logo_url, " +
        "trial_ends_at",
      )
      .eq("id", orgId)
      .maybeSingle();

    const org = orgData as OrgRow | null;

    const { currency }   = await getPricingForOrg(orgId);
    const connectId      = org?.stripe_connect_account_id ?? null;
    const orgStripeKey   = org?.stripe_secret_key ?? null;
    const orgName        = org?.name ?? "Stride";
    const trialEndsAt    = org?.trial_ends_at ?? null;
    const isTrial        = !trialEndsAt || new Date() < new Date(trialEndsAt);

    const lineItems = await resolveAllLineItems(
      orgId, items, orgName,
      promoCode, promoDiscountType, promoDiscountPercent,
      promoDiscountAmount, promoTargetCourseIds,
    );

    const discountApplied = lineItems.reduce((s, i) => s + i.discount,   0);
    const calculatedTotal = lineItems.reduce((s, i) => s + i.finalPrice, 0);
    const calculatedCents = Math.round(calculatedTotal * 100);

    if (calculatedCents <= 0) {
      // Free enrollment — skip Stripe, mark as paid immediately
      const freeSessionId = `free_${Date.now()}`;
      await supabase.from("checkout_sessions").insert({
        session_id:      freeSessionId,
        organization_id: orgId,
        user_id:         String(user.id),
        status:          "paid",
        items:           lineItems,
        amount_cents:    0,
        checkout_url:    null,
      });
      res.json({
        freeEnrollment:  true,
        sessionId:       freeSessionId,
        lineItems,
        calculatedTotal: 0,
        discountApplied,
        currency,
      });
      return;
    }

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

    const rawDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0]
      ?? process.env["REPLIT_DEV_DOMAIN"]
      ?? "localhost";
    const baseUrl = `https://${rawDomain}`;

    const Stripe = (await import("stripe")).default;
    type SessionParams = Parameters<InstanceType<typeof Stripe>["checkout"]["sessions"]["create"]>[0];

    const activeStripeKey = orgStripeKey ?? masterStripeKey;
    const stripe          = new Stripe(activeStripeKey);

    // ── Detect subscription vs one-time items ──────────────────────────────
    const isRecurring = (pkg: string) => pkg === "monthlyBilling" || pkg === "annual";
    const subItems    = lineItems.filter(i => isRecurring(i.packageType));
    const payItems    = lineItems.filter(i => !isRecurring(i.packageType));
    const hasSubs     = subItems.length > 0;
    const hasPay      = payItems.length > 0;

    // Helper — build Stripe line item for one-time payment
    const toPayStripeItem = (item: CheckoutLineItem) => ({
      price_data: {
        currency,
        product_data: { name: buildLineItemName(item), description: buildLineItemDescription(item) },
        unit_amount:  Math.round(item.finalPrice * 100),
      },
      quantity: 1,
    });

    // Helper — build Stripe line item for subscription
    const toSubStripeItem = (item: CheckoutLineItem) => ({
      price_data: {
        currency,
        product_data: { name: buildLineItemName(item) },
        recurring:    { interval: (item.packageType === "annual" ? "year" : "month") as "month" | "year" },
        unit_amount:  Math.round(item.finalPrice * 100),
      },
      quantity: 1,
    });

    // Helper — creates a single Stripe session and stores it in Supabase
    const createAndStoreSession = async (
      params: SessionParams,
      sessionItems: CheckoutLineItem[],
      amtCents: number,
      batchId?: string,
      batchPosition?: number,
    ) => {
      const sess = await stripe.checkout.sessions.create(params);
      await supabase.from("checkout_sessions").insert({
        session_id:      sess.id,
        organization_id: orgId,
        user_id:         String(user.id),
        status:          "pending",
        items:           sessionItems,
        amount_cents:    amtCents,
        checkout_url:    sess.url,
        ...(batchId       ? { batch_id: batchId }          : {}),
        ...(batchPosition ? { batch_position: batchPosition } : {}),
      });
      return sess;
    };

    // ── Case A: Pure subscription cart ─────────────────────────────────────
    if (hasSubs && !hasPay) {
      const subCents   = Math.round(subItems.reduce((s, i) => s + i.finalPrice, 0) * 100);
      const subParams: SessionParams = {
        mode:        "subscription",
        line_items:  subItems.map(toSubStripeItem),
        success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${baseUrl}/payment-cancelled`,
        metadata:    { type: "member_checkout", orgId: String(orgId), userId: String(user.id), auditId },
      };
      if (!orgStripeKey && connectId) {
        subParams.subscription_data = {
          transfer_data:           { destination: connectId },
          application_fee_percent: isTrial ? 0 : 2,
        };
      }
      const sess = await createAndStoreSession(subParams, subItems, subCents);
      await supabase.from("payment_audit_log").update({ stripe_session_id: sess.id }).eq("request_id", auditId);
      res.json({
        sessionId: sess.id, checkoutUrl: sess.url, auditId,
        lineItems, calculatedTotal, discountApplied, currency,
      });
      return;
    }

    // ── Case B: Mixed cart → return as batch (sub + payment sessions) ──────
    if (hasSubs && hasPay) {
      const batchId  = crypto.randomUUID();
      const payCents = Math.round(payItems.reduce((s, i) => s + i.finalPrice, 0) * 100);
      const subCents = Math.round(subItems.reduce((s, i) => s + i.finalPrice, 0) * 100);

      const payParams: SessionParams = {
        mode:        "payment",
        line_items:  payItems.map(toPayStripeItem),
        success_url: `${baseUrl}/payment-batch?batch_id=${batchId}&position=1`,
        cancel_url:  `${baseUrl}/payment-cancelled?batch_id=${batchId}&position=1`,
        metadata:    { type: "member_checkout", orgId: String(orgId), userId: String(user.id), auditId, batchId, batchPosition: "1" },
      };
      if (!orgStripeKey && connectId) {
        payParams.payment_intent_data = {
          transfer_data:          { destination: connectId },
          application_fee_amount: isTrial ? 0 : Math.round(payCents * 0.02),
        };
      }
      const subParams: SessionParams = {
        mode:        "subscription",
        line_items:  subItems.map(toSubStripeItem),
        success_url: `${baseUrl}/payment-batch?batch_id=${batchId}&position=2`,
        cancel_url:  `${baseUrl}/payment-cancelled?batch_id=${batchId}&position=2`,
        metadata:    { type: "member_checkout", orgId: String(orgId), userId: String(user.id), auditId, batchId, batchPosition: "2" },
      };
      if (!orgStripeKey && connectId) {
        subParams.subscription_data = {
          transfer_data:           { destination: connectId },
          application_fee_percent: isTrial ? 0 : 2,
        };
      }
      const [paySess, subSess] = await Promise.all([
        createAndStoreSession(payParams, payItems, payCents, batchId, 1),
        createAndStoreSession(subParams, subItems, subCents, batchId, 2),
      ]);
      await supabase.from("checkout_batches").insert({
        batch_id: batchId, user_id: String(user.id), organization_id: orgId,
        status: "pending", total_sessions: 2, completed_count: 0,
        total_cents: payCents + subCents,
      });
      await supabase.from("payment_audit_log").update({ stripe_session_id: paySess.id }).eq("request_id", auditId);
      res.json({
        batchId,
        sessions: [
          { position: 1, sessionId: paySess.id, checkoutUrl: paySess.url, orgId, orgName, amountCents: payCents, currency },
          { position: 2, sessionId: subSess.id, checkoutUrl: subSess.url, orgId, orgName, amountCents: subCents, currency },
        ],
      });
      return;
    }

    // ── Case C: Pure payment cart (existing behavior) ───────────────────────
    const sessionParams: SessionParams = {
      mode:        "payment",
      line_items:  payItems.map(toPayStripeItem),
      success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/payment-cancelled`,
      metadata: {
        type:    "member_checkout",
        orgId:   String(orgId),
        userId:  String(user.id),
        auditId,
      },
    };
    if (!orgStripeKey && connectId) {
      sessionParams.payment_intent_data = {
        transfer_data:          { destination: connectId },
        application_fee_amount: isTrial ? 0 : Math.round(calculatedCents * 0.02),
      };
    }

    const session = await createAndStoreSession(sessionParams, lineItems, calculatedCents);

    await supabase
      .from("payment_audit_log")
      .update({ stripe_session_id: session.id })
      .eq("request_id", auditId);

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

// ── POST /checkout/batch-session ──────────────────────────────────────────────
// Creates one Stripe checkout session per org group, linked under a single batch.
// Returns batchId + ordered session list so the app can open them sequentially.
router.post("/checkout/batch-session", requireAuth, async (req, res) => {
  const masterStripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!masterStripeKey) {
    res.status(503).json({ error: "stripe_not_configured" });
    return;
  }

  const user = (req as AuthReq).user;

  const {
    groups,
    promoCode,
    promoDiscountType,
    promoDiscountPercent,
    promoDiscountAmount,
    promoTargetCourseIds,
  } = req.body as {
    groups: Array<{ orgId: number; items: CartItemInput[] }>;
    promoCode?:            string;
    promoDiscountType?:    "percent" | "amount";
    promoDiscountPercent?: number;
    promoDiscountAmount?:  number;
    promoTargetCourseIds?: string[];
  };

  if (!Array.isArray(groups) || groups.length === 0) {
    res.status(400).json({ error: "No groups provided" });
    return;
  }

  try {
    const Stripe = (await import("stripe")).default;
    type SessionParams = Parameters<InstanceType<typeof Stripe>["checkout"]["sessions"]["create"]>[0];

    const rawDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0]
      ?? process.env["REPLIT_DEV_DOMAIN"]
      ?? "localhost";
    const baseUrl = `https://${rawDomain}`;
    const batchId = crypto.randomUUID();

    const sessions: Array<{
      position:    number;
      sessionId:   string;
      checkoutUrl: string;
      orgId:       number;
      orgName:     string;
      amountCents: number;
      currency:    string;
    }> = [];
    let totalCents = 0;

    for (let pos = 0; pos < groups.length; pos++) {
      const group = groups[pos];
      if (!group || !Array.isArray(group.items) || group.items.length === 0) continue;

      const { data: orgData } = await supabase
        .from("organizations")
        .select("currency, stripe_connect_account_id, stripe_secret_key, name, trial_ends_at")
        .eq("id", group.orgId)
        .maybeSingle();

      const org          = orgData as OrgRow | null;
      const { currency } = await getPricingForOrg(group.orgId);
      const connectId    = org?.stripe_connect_account_id ?? null;
      const orgStripeKey = org?.stripe_secret_key ?? null;
      const orgName      = org?.name ?? `Organisation ${group.orgId}`;
      const trialEndsAt  = org?.trial_ends_at ?? null;
      const isTrial      = !trialEndsAt || new Date() < new Date(trialEndsAt);

      const lineItems = await resolveLineItems(
        group.orgId, group.items, orgName,
        promoCode, promoDiscountType, promoDiscountPercent,
        promoDiscountAmount, promoTargetCourseIds,
      );

      const groupCents = Math.round(lineItems.reduce((s, i) => s + i.finalPrice, 0) * 100);
      if (groupCents <= 0) continue;

      const { data: auditRow } = await supabase
        .from("payment_audit_log")
        .insert({
          organization_id:  group.orgId,
          user_id:          String(user.id),
          items_list:       lineItems,
          calculated_total: groupCents / 100,
          discount_applied: lineItems.reduce((s, i) => s + i.discount, 0),
          promo_code:       promoCode ?? null,
        })
        .select("request_id")
        .single();

      const auditId = (auditRow as { request_id?: string } | null)?.request_id ?? "unknown";

      const stripeLineItems = lineItems.map(item => ({
        price_data: {
          currency,
          product_data: { name: `${item.courseName} — ${item.participantName}` },
          unit_amount:  Math.round(item.finalPrice * 100),
        },
        quantity: 1,
      }));

      const position = pos + 1;
      const sessionParams: SessionParams = {
        mode:       "payment",
        line_items: stripeLineItems,
        success_url: `${baseUrl}/payment-batch?batch_id=${batchId}&position=${position}`,
        cancel_url:  `${baseUrl}/payment-cancelled?batch_id=${batchId}&position=${position}`,
        metadata: {
          type:          "member_checkout",
          orgId:         String(group.orgId),
          userId:        String(user.id),
          auditId,
          batchId,
          batchPosition: String(position),
        },
      };

      const activeStripeKey = orgStripeKey ?? masterStripeKey;

      if (!orgStripeKey && connectId) {
        sessionParams.payment_intent_data = {
          transfer_data:          { destination: connectId },
          application_fee_amount: isTrial ? 0 : Math.round(groupCents * 0.02),
        };
      }

      const stripe  = new Stripe(activeStripeKey);
      const session = await stripe.checkout.sessions.create(sessionParams);

      await Promise.all([
        supabase.from("payment_audit_log").update({ stripe_session_id: session.id }).eq("request_id", auditId),
        supabase.from("checkout_sessions").insert({
          session_id:      session.id,
          organization_id: group.orgId,
          user_id:         String(user.id),
          status:          "pending",
          items:           lineItems,
          amount_cents:    groupCents,
          batch_id:        batchId,
          batch_position:  position,
          checkout_url:    session.url,
        }),
      ]);

      totalCents += groupCents;
      sessions.push({
        position,
        sessionId:   session.id,
        checkoutUrl: session.url ?? "",
        orgId:       group.orgId,
        orgName,
        amountCents: groupCents,
        currency,
      });
    }

    if (sessions.length === 0) {
      res.status(400).json({ error: "No valid payment groups" });
      return;
    }

    await supabase.from("checkout_batches").insert({
      batch_id:        batchId,
      user_id:         String(user.id),
      organization_id: user.orgId ?? null,
      status:          "pending",
      total_sessions:  sessions.length,
      completed_count: 0,
      total_cents:     totalCents,
    });

    res.json({ batchId, sessions, totalSessions: sessions.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /checkout/batch-status/:batchId — public (UUID is unguessable) ────────
router.get("/checkout/batch-status/:batchId", async (req, res) => {
  const batchId = String(req.params["batchId"] ?? "");
  if (!batchId) { res.status(400).json({ error: "Missing batchId" }); return; }

  const { data: batchData } = await supabase
    .from("checkout_batches")
    .select("batch_id, status, total_sessions, completed_count, total_cents")
    .eq("batch_id", batchId)
    .maybeSingle();

  if (!batchData) { res.status(404).json({ error: "Batch not found" }); return; }

  const { data: sessionRows } = await supabase
    .from("checkout_sessions")
    .select("session_id, status, batch_position, organization_id, amount_cents, invoice_number, checkout_url")
    .eq("batch_id", batchId)
    .order("batch_position", { ascending: true });

  type BatchRow = { batch_id: string; status: string; total_sessions: number; completed_count: number; total_cents: number };
  type SessionRow = {
    session_id:      string;
    status:          string;
    batch_position:  number;
    organization_id: number;
    amount_cents:    number;
    invoice_number?: string | null;
    checkout_url?:   string | null;
  };

  const batch    = batchData as BatchRow;
  const sessions = (sessionRows ?? []) as SessionRow[];

  const orgIds = [...new Set(sessions.map(s => s.organization_id).filter(Boolean))];
  const orgMap = new Map<number, string>();
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    type OrgNameRow = { id: number; name: string };
    (orgs ?? []).forEach((o: OrgNameRow) => orgMap.set(o.id, o.name));
  }

  res.json({
    batchId:        batch.batch_id,
    status:         batch.status,
    totalSessions:  batch.total_sessions,
    completedCount: batch.completed_count,
    totalCents:     batch.total_cents,
    sessions:       sessions.map(s => ({
      position:      s.batch_position,
      sessionId:     s.session_id,
      status:        s.status,
      checkoutUrl:   s.status === "pending" ? (s.checkout_url ?? null) : null,
      orgId:         s.organization_id,
      orgName:       orgMap.get(s.organization_id) ?? null,
      amountCents:   s.amount_cents,
      invoiceNumber: s.invoice_number ?? null,
    })),
  });
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

// ── GET /checkout/receipt/:sessionId — public, no auth ───────────────────────
router.get("/checkout/receipt/:sessionId", async (req, res) => {
  const sessionId = String(req.params["sessionId"] ?? "");
  if (!sessionId) { res.status(400).json({ error: "Missing sessionId" }); return; }

  const { data } = await supabase
    .from("checkout_sessions")
    .select("status, invoice_number, amount_cents, items, organization_id")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!data) {
    res.json({ status: "pending", invoiceNumber: null, amountCents: null, currency: "eur", orgName: null, branding: null, items: [] });
    return;
  }

  type SessionRow = {
    status:           string;
    invoice_number?:  string | null;
    amount_cents?:    number | null;
    items?:           unknown;
    organization_id?: number | null;
  };
  const row = data as SessionRow;

  let orgName: string | null = null;
  let branding = { primaryColor: "#1E3A8A", secondaryColor: "#D4AF37", logoUrl: null as string | null };

  if (row.organization_id) {
    const { data: orgData } = await supabase
      .from("organizations")
      .select("name, branding_primary_color, branding_secondary_color, branding_logo_url")
      .eq("id", row.organization_id)
      .maybeSingle();

    if (orgData) {
      type OrgBrandRow = { name?: string; branding_primary_color?: string; branding_secondary_color?: string; branding_logo_url?: string | null };
      const org = orgData as OrgBrandRow;
      orgName  = org.name ?? null;
      branding = {
        primaryColor:   org.branding_primary_color   ?? "#1E3A8A",
        secondaryColor: org.branding_secondary_color ?? "#D4AF37",
        logoUrl:        org.branding_logo_url        ?? null,
      };
    }
  }

  res.json({
    status:        row.status,
    invoiceNumber: row.invoice_number ?? null,
    amountCents:   row.amount_cents   ?? null,
    currency:      "eur",
    orgName,
    branding,
    items:         Array.isArray(row.items) ? row.items : [],
  });
});

// ── GET /subscriptions — list user's active recurring subscriptions ───────────
router.get("/subscriptions", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  try {
    const { rows } = await pool.query(
      `SELECT id, stripe_subscription_id, item_name, participant_name, item_type,
              package_type, amount_cents, currency, status,
              current_period_end, cancel_at_period_end, created_at
       FROM member_subscriptions
       WHERE user_id = $1 AND organization_id = $2
         AND status NOT IN ('cancelled','canceled','unpaid')
       ORDER BY created_at DESC`,
      [String(user.id), orgId],
    );
    res.json({ subscriptions: rows });
  } catch (err) {
    req.log.error(err, "GET /subscriptions error");
    res.status(500).json({ error: "Failed to load subscriptions" });
  }
});

// ── DELETE /subscriptions/:id — cancel at period end ─────────────────────────
router.delete("/subscriptions/:id", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const subId = parseInt(String(req.params["id"] ?? ""));

  if (isNaN(subId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const { rows } = await pool.query<{ stripe_subscription_id: string }>(
      `SELECT stripe_subscription_id FROM member_subscriptions
       WHERE id = $1 AND user_id = $2 AND organization_id = $3`,
      [subId, String(user.id), orgId],
    );
    if (!rows[0]) { res.status(404).json({ error: "Subscription not found" }); return; }

    const stripeSubId     = rows[0].stripe_subscription_id;
    const masterStripeKey = process.env["STRIPE_SECRET_KEY"];

    // Cancel at period end in Stripe (if real subscription id)
    if (masterStripeKey && stripeSubId.startsWith("sub_")) {
      try {
        const Stripe = (await import("stripe")).default;
        const stripe  = new Stripe(masterStripeKey);
        await stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: true });
      } catch { /* non-blocking */ }
    }

    await pool.query(
      `UPDATE member_subscriptions SET cancel_at_period_end = TRUE WHERE id = $1`,
      [subId],
    );
    res.json({ ok: true, message: "Subscription will cancel at end of billing period." });
  } catch (err) {
    req.log.error(err, "DELETE /subscriptions/:id error");
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

// ── processMemberCheckout (webhook / internal use) ────────────────────────────
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

  // ── Batch completion tracking ─────────────────────────────────────────────
  const { data: sessionRow } = await supabase
    .from("checkout_sessions")
    .select("batch_id")
    .eq("session_id", sessionId)
    .maybeSingle();

  const batchId = (sessionRow as { batch_id?: string | null } | null)?.batch_id ?? null;
  if (batchId) {
    const { data: batchRow } = await supabase
      .from("checkout_batches")
      .select("total_sessions, completed_count")
      .eq("batch_id", batchId)
      .maybeSingle();

    if (batchRow) {
      type BatchRow = { total_sessions: number; completed_count: number };
      const b = batchRow as BatchRow;
      const newCount  = b.completed_count + 1;
      const newStatus = newCount >= b.total_sessions ? "complete" : "partial";
      await supabase.from("checkout_batches").update({
        completed_count: newCount,
        status:          newStatus,
        ...(newStatus === "complete" ? { completed_at: new Date().toISOString() } : {}),
      }).eq("batch_id", batchId);
    }
  }

  return { invoiceNumber, invoiceId };
}

export default router;
