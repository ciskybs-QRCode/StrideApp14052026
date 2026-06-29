import { Router, type Request } from "express";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { getPricingForOrg } from "../lib/pricing-service.js";
import {
  computeFamilyDiscount,
  effectiveFamilyConfig,
  FAMILY_DISCOUNT_DEFAULT,
  type FamilyDiscountConfig,
} from "../lib/family-discount.js";

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
  // "course" = a per-dependant enrolment (eligible for family discount),
  // "other"  = marketplace / event ticket / membership (never eligible).
  kind:              "course" | "other";
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
      kind:             "course",
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
        kind:             "other",
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
        kind:             "other",
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
        kind:             "other",
      });
    }
  }

  return results;
}

// ── Family / sibling discount engine ─────────────────────────────────────────
// Flexible, per-org rule engine. The cart of a single member IS the "family":
// every course enrolment tied to a dependant (childId) in the same checkout is
// grouped together and discounted per the org's rule. Server is authoritative.
// FamilyDiscountConfig, FAMILY_DISCOUNT_DEFAULT and the pure compute engine now
// live in ../lib/family-discount.js (DB-free + unit-tested). This file keeps only
// the DB-backed glue: loading the config and resolving owned children/disciplines.

async function loadFamilyDiscountConfig(orgId: number): Promise<FamilyDiscountConfig> {
  try {
    const { rows } = await pool.query<{ config: unknown }>(
      `SELECT config FROM org_family_discount_config WHERE organization_id = $1`,
      [orgId],
    );
    const raw = (rows[0]?.config ?? {}) as Partial<FamilyDiscountConfig>;
    return { ...FAMILY_DISCOUNT_DEFAULT, ...raw };
  } catch {
    return { ...FAMILY_DISCOUNT_DEFAULT };
  }
}

// Mutates lineItems (discount/finalPrice). Returns total family discount in euros.
// DB-backed glue around the pure engine in ../lib/family-discount.js: it loads the
// org config, resolves which childIds the buyer actually owns *within this org*
// (server-authoritative — never trusts client participant names/childIds), and,
// only when the rule scopes by discipline, resolves course→discipline names.
async function applyFamilyDiscount(orgId: number, userId: string, lineItems: CheckoutLineItem[]): Promise<number> {
  const cfg = await loadFamilyDiscountConfig(orgId);
  if (!cfg.enabled) return 0;

  // Owned children for this buyer in this org. A childId present but NOT in this
  // set is a crafted request and is dropped by the engine; an absent childId maps
  // to the account holder's single self group.
  const ownedChildIds = new Set<string>();
  const numericUser = parseInt(String(userId), 10);
  if (Number.isFinite(numericUser)) {
    const { data: memberRows } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", numericUser)
      .eq("organization_id", orgId);
    for (const r of (memberRows ?? []) as Array<{ id: number | string }>) {
      ownedChildIds.add(String(r.id));
    }
  }

  // Resolve disciplines only when the effective rule scopes by discipline.
  const eff = effectiveFamilyConfig(cfg);
  const disciplineByCourse = new Map<number, string>();
  if (eff.scopeType === "discipline" && eff.scopeDiscipline) {
    const ids = [...new Set(
      lineItems
        .filter(li => li.kind === "course" && li.finalPrice > 0)
        .map(li => parseInt(li.courseId))
        .filter(n => !isNaN(n)),
    )];
    if (ids.length > 0) {
      const { rows } = await pool.query<{ scheduled_course_id: number; discipline_name: string | null }>(
        `SELECT scheduled_course_id, discipline_name FROM course_extras
         WHERE organization_id = $1 AND scheduled_course_id = ANY($2)`,
        [orgId, ids],
      );
      for (const r of rows) if (r.discipline_name) disciplineByCourse.set(r.scheduled_course_id, r.discipline_name);
    }
  }

  return computeFamilyDiscount(cfg, ownedChildIds, String(userId), lineItems, disciplineByCourse);
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

    // Family/sibling discount (server-authoritative, configurable per org).
    const familyDiscount = await applyFamilyDiscount(orgId, String(user.id), lineItems);

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
        familyDiscount,
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
        lineItems, calculatedTotal, discountApplied, familyDiscount, currency,
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
      familyDiscount,
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

      // Apply the per-org family/sibling discount to this group. In a split
      // (multi-org) checkout each org's children form their own family, so the
      // discount is computed independently per group using that org's config.
      await applyFamilyDiscount(group.orgId, String(user.id), lineItems);

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

// ── POST /checkout/manual-payment ──────────────────────────────────────────
// Handles cash, bank transfer, and PayPal payments. Creates a checkout session
// with manual payment method and stores it in the database.
router.post("/checkout/manual-payment", requireAuth, async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;

  const {
    items,
    paymentMethod,
    promoCode,
    promoDiscountType,
    promoDiscountPercent,
    promoDiscountAmount,
    promoTargetCourseIds,
  } = req.body as {
    items:                 CartItemInput[];
    paymentMethod:         "cash" | "bank_transfer" | "paypal" | "apple_pay" | "google_pay";
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

  const validMethods = ["cash", "bank_transfer", "paypal", "apple_pay", "google_pay"];
  if (!validMethods.includes(paymentMethod)) {
    res.status(400).json({ error: "Invalid payment method" });
    return;
  }

  try {
    const { data: orgData } = await supabase
      .from("organizations")
      .select("name, currency, stripe_connect_account_id, stripe_secret_key, trial_ends_at")
      .eq("id", orgId)
      .maybeSingle();

    const org = orgData as OrgRow | null;
    const { currency } = await getPricingForOrg(orgId);
    const orgName = org?.name ?? "Stride";

    const lineItems = await resolveAllLineItems(
      orgId, items, orgName,
      promoCode, promoDiscountType, promoDiscountPercent,
      promoDiscountAmount, promoTargetCourseIds,
    );

    const discountApplied = lineItems.reduce((s, i) => s + i.discount, 0);
    const calculatedTotal = lineItems.reduce((s, i) => s + i.finalPrice, 0);
    const calculatedCents = Math.round(calculatedTotal * 100);

    if (calculatedCents <= 0) {
      res.status(400).json({ error: "Total amount must be greater than zero" });
      return;
    }

    // Generate reference numbers
    const sessionId = `manual_${paymentMethod}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const bankReference = paymentMethod === "bank_transfer"
      ? `STRIDE-BANK-${orgId}-${Date.now().toString(36).toUpperCase()}`
      : null;
    const paypalOrderId = paymentMethod === "paypal"
      ? `paypal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      : null;

    const status = paymentMethod === "cash" ? "pending_cash" :
                   paymentMethod === "bank_transfer" ? "pending_bank" :
                   paymentMethod === "paypal" ? "pending_paypal" : "pending";

    // Audit log
    const { data: auditRow } = await supabase
      .from("payment_audit_log")
      .insert({
        organization_id:  orgId,
        user_id:          String(user.id),
        performed_by_user_id: parseInt(user.id),
        performed_by_name:   user.email,
        items_list:       lineItems,
        calculated_total: calculatedTotal,
        discount_applied: discountApplied,
        promo_code:       promoCode ?? null,
        payment_method:   paymentMethod,
        bank_reference:   bankReference,
        paypal_order_id:  paypalOrderId,
        status:           status,
      })
      .select("request_id")
      .single();

    const auditId = (auditRow as { request_id?: string } | null)?.request_id ?? "unknown";

    // Create checkout session
    await supabase.from("checkout_sessions").insert({
      session_id:      sessionId,
      organization_id: orgId,
      user_id:         String(user.id),
      status:          status,
      items:           lineItems,
      amount_cents:    calculatedCents,
      payment_method:  paymentMethod,
      bank_reference:  bankReference,
      paypal_order_id: paypalOrderId,
      checkout_url:    null,
    });

    const resp: Record<string, unknown> = {
      sessionId,
      paymentMethod,
      status,
      lineItems,
      calculatedTotal,
      discountApplied,
      currency,
      auditId,
    };

    if (bankReference) resp.bankReference = bankReference;
    if (paypalOrderId) resp.paypalOrderId = paypalOrderId;

    res.json(resp);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /checkout/pending-payments ──────────────────────────────────
// Admin/operator: list all pending manual payments for this org
router.get("/checkout/pending-payments", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const { data } = await supabase
      .from("checkout_sessions")
      .select("session_id, user_id, status, items, amount_cents, payment_method, bank_reference, cash_confirmed_by, cash_confirmed_at, created_at, paypal_order_id")
      .eq("organization_id", user.orgId)
      .in("status", ["pending_cash", "pending_bank", "pending_paypal", "pending"])
      .order("created_at", { ascending: false });
    res.json(data ?? []);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load pending payments" });
  }
});

// ── POST /checkout/confirm-cash/:sessionId ─────────────────────────
// Admin/operator: confirm a cash payment was received
router.post("/checkout/confirm-cash/:sessionId", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user      = (req as AuthReq).user;
  const sessionId = String(req.params["sessionId"] ?? "");
  if (!sessionId) { res.status(400).json({ error: "Missing sessionId" }); return; }

  try {
    const { data } = await supabase
      .from("checkout_sessions")
      .select("status, amount_cents, items, user_id, payment_method")
      .eq("session_id", sessionId)
      .eq("organization_id", user.orgId)
      .maybeSingle();

    if (!data) { res.status(404).json({ error: "Session not found" }); return; }
    const row = data as { status: string; amount_cents: number; items: unknown; user_id: string; payment_method: string };
    if (row.status !== "pending_cash") {
      res.status(400).json({ error: "Session is not awaiting cash confirmation" });
      return;
    }

    // Update session
    await supabase
      .from("checkout_sessions")
      .update({
        status: "complete",
        cash_confirmed_by: parseInt(user.id),
        cash_confirmed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);

    // Update audit log
    await supabase
      .from("payment_audit_log")
      .update({
        status: "complete",
        cash_confirmed_by: parseInt(user.id),
        cash_confirmed_at: new Date().toISOString(),
      })
      .eq("stripe_session_id", sessionId);

    // Process enrollment (same as Stripe)
    if (Array.isArray(row.items)) {
      const items = row.items as Array<{ childId?: string; courseId?: string }>;
      for (const item of items) {
        if (!item.childId || !item.courseId) continue;
        const childId  = parseInt(item.childId);
        const courseId = parseInt(item.courseId);
        if (isNaN(childId) || isNaN(courseId)) continue;
        await supabase
          .from("enrollments")
          .upsert(
            { child_id: childId, course_id: courseId, status: "enrolled" },
            { onConflict: "child_id,course_id" },
          );
      }
    }

    // Notify user
    await supabase.from("private_notifications").insert({
      user_id:         parseInt(row.user_id),
      organization_id: user.orgId,
      type:            "payment_confirmed",
      title:           "Cash Payment Confirmed",
      body:            `Your cash payment of €${(row.amount_cents / 100).toFixed(2)} has been confirmed.`,
      read:            false,
      created_at:      new Date().toISOString(),
    });

    res.json({ ok: true, sessionId });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to confirm cash payment" });
  }
});

// ── POST /checkout/confirm-bank/:sessionId ─────────────────────────
// Admin/operator: confirm a bank transfer was received
router.post("/checkout/confirm-bank/:sessionId", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user      = (req as AuthReq).user;
  const sessionId = String(req.params["sessionId"] ?? "");
  if (!sessionId) { res.status(400).json({ error: "Missing sessionId" }); return; }

  try {
    const { data } = await supabase
      .from("checkout_sessions")
      .select("status, amount_cents, items, user_id, payment_method")
      .eq("session_id", sessionId)
      .eq("organization_id", user.orgId)
      .maybeSingle();

    if (!data) { res.status(404).json({ error: "Session not found" }); return; }
    const row = data as { status: string; amount_cents: number; items: unknown; user_id: string; payment_method: string };
    if (row.status !== "pending_bank") {
      res.status(400).json({ error: "Session is not awaiting bank confirmation" });
      return;
    }

    await supabase
      .from("checkout_sessions")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);

    await supabase
      .from("payment_audit_log")
      .update({ status: "complete" })
      .eq("stripe_session_id", sessionId);

    if (Array.isArray(row.items)) {
      const items = row.items as Array<{ childId?: string; courseId?: string }>;
      for (const item of items) {
        if (!item.childId || !item.courseId) continue;
        const childId  = parseInt(item.childId);
        const courseId = parseInt(item.courseId);
        if (isNaN(childId) || isNaN(courseId)) continue;
        await supabase
          .from("enrollments")
          .upsert(
            { child_id: childId, course_id: courseId, status: "enrolled" },
            { onConflict: "child_id,course_id" },
          );
      }
    }

    await supabase.from("private_notifications").insert({
      user_id:         parseInt(row.user_id),
      organization_id: user.orgId,
      type:            "payment_confirmed",
      title:           "Bank Transfer Confirmed",
      body:            `Your bank transfer payment of €${(row.amount_cents / 100).toFixed(2)} has been confirmed.`,
      read:            false,
      created_at:      new Date().toISOString(),
    });

    res.json({ ok: true, sessionId });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to confirm bank payment" });
  }
});

// ── POST /checkout/confirm-paypal/:sessionId ───────────────────────
// Admin/operator: confirm a PayPal payment was received
router.post("/checkout/confirm-paypal/:sessionId", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user      = (req as AuthReq).user;
  const sessionId = String(req.params["sessionId"] ?? "");
  if (!sessionId) { res.status(400).json({ error: "Missing sessionId" }); return; }

  try {
    const { data } = await supabase
      .from("checkout_sessions")
      .select("status, amount_cents, items, user_id, payment_method")
      .eq("session_id", sessionId)
      .eq("organization_id", user.orgId)
      .maybeSingle();

    if (!data) { res.status(404).json({ error: "Session not found" }); return; }
    const row = data as { status: string; amount_cents: number; items: unknown; user_id: string; payment_method: string };
    if (row.status !== "pending_paypal") {
      res.status(400).json({ error: "Session is not awaiting PayPal confirmation" });
      return;
    }

    await supabase
      .from("checkout_sessions")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);

    await supabase
      .from("payment_audit_log")
      .update({ status: "complete" })
      .eq("stripe_session_id", sessionId);

    if (Array.isArray(row.items)) {
      const items = row.items as Array<{ childId?: string; courseId?: string }>;
      for (const item of items) {
        if (!item.childId || !item.courseId) continue;
        const childId  = parseInt(item.childId);
        const courseId = parseInt(item.courseId);
        if (isNaN(childId) || isNaN(courseId)) continue;
        await supabase
          .from("enrollments")
          .upsert(
            { child_id: childId, course_id: courseId, status: "enrolled" },
            { onConflict: "child_id,course_id" },
          );
      }
    }

    await supabase.from("private_notifications").insert({
      user_id:         parseInt(row.user_id),
      organization_id: user.orgId,
      type:            "payment_confirmed",
      title:           "PayPal Payment Confirmed",
      body:            `Your PayPal payment of \u20ac${(row.amount_cents / 100).toFixed(2)} has been confirmed.`,
      read:            false,
      created_at:      new Date().toISOString(),
    });

    res.json({ ok: true, sessionId });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to confirm PayPal payment" });
  }
});

// ── Family / sibling discount config ──────────────────────────────────────────
const FamilyTierSchema = z.object({
  index:   z.number().int().min(2).max(20),
  percent: z.number().min(0).max(100),
});
const FamilyDiscountConfigSchema = z.object({
  enabled:            z.boolean(),
  advancedEnabled:    z.boolean(),
  fromDependantIndex: z.number().int().min(2).max(20),
  scopeType:          z.enum(["all", "courses", "discipline"]),
  scopeCourseIds:     z.array(z.string()).max(500),
  scopeDiscipline:    z.string().max(120).nullable(),
  discountType:       z.enum(["percent", "fixed", "tiered"]),
  percent:            z.number().min(0).max(100),
  fixedCents:         z.number().int().min(0).max(1_000_000),
  tiers:              z.array(FamilyTierSchema).max(20),
  applyTo:            z.enum(["subsequent", "cheapest", "all"]),
  capCents:           z.number().int().min(0).max(10_000_000).nullable(),
});

router.get(
  "/checkout/family-discount-config",
  requireAuth,
  requireRole("admin", "operator"),
  async (req, res) => {
    const user = (req as AuthReq).user;
    const cfg  = await loadFamilyDiscountConfig(user.orgId ?? 1);
    res.json(cfg);
  },
);

router.put(
  "/checkout/family-discount-config",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const user   = (req as AuthReq).user;
    const parsed = FamilyDiscountConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid config", details: parsed.error.flatten() });
      return;
    }
    try {
      await pool.query(
        `INSERT INTO org_family_discount_config (organization_id, config, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (organization_id)
         DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()`,
        [user.orgId ?? 1, JSON.stringify(parsed.data)],
      );
      res.json(parsed.data);
    } catch (err) {
      req.log.error(err, "family-discount-config PUT: error");
      res.status(500).json({ error: "Failed to save config" });
    }
  },
);

// ── POST /checkout/preview — live totals incl. family discount (no Stripe) ─────
router.post("/checkout/preview", requireAuth, async (req, res) => {
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
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    const orgName        = (orgData as { name?: string } | null)?.name ?? "Stride";
    const { currency }   = await getPricingForOrg(orgId);

    const lineItems = await resolveAllLineItems(
      orgId, items, orgName,
      promoCode, promoDiscountType, promoDiscountPercent,
      promoDiscountAmount, promoTargetCourseIds,
    );

    const subtotal       = lineItems.reduce((s, i) => s + i.unitPrice, 0);
    const promoDiscount  = lineItems.reduce((s, i) => s + i.discount,  0);
    const familyDiscount = await applyFamilyDiscount(orgId, String(user.id), lineItems);
    const total          = lineItems.reduce((s, i) => s + i.finalPrice, 0);

    res.json({ lineItems, subtotal, promoDiscount, familyDiscount, total, currency });
  } catch (err) {
    req.log.error(err, "checkout preview: error");
    res.status(500).json({ error: "preview_failed" });
  }
});

export default router;
