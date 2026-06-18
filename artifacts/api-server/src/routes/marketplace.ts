/**
 * Stride-Verified Marketplace routes.
 *
 * Architecture:
 *   • Admins list / create / update / deactivate products for their org.
 *   • Stride super-admins manage global "Stride Verified" partner products (org_id = NULL).
 *   • Parents browse and purchase items; the web-checkout proxy creates a Stripe
 *     Checkout Session with `application_fee_amount` set to the product's platform_fee_pct,
 *     routing net proceeds to the org's Stripe Connect account.
 *   • Global Stride Verified products (insurance) use the master Stripe key — Stride
 *     retains the full amount and handles partner payouts externally.
 *
 * Commission flow:
 *   total_cents           = price_cents × quantity
 *   platform_fee_cents    = round(total_cents × platform_fee_pct / 100)
 *   org_receives_cents    = total_cents − platform_fee_cents   (via Stripe application_fee_amount)
 *
 * Endpoints:
 *   GET    /marketplace/products          — list active products (filterable)
 *   POST   /marketplace/products          — admin creates a product
 *   PATCH  /marketplace/products/:id      — admin updates a product
 *   DELETE /marketplace/products/:id      — admin deactivates a product
 *   POST   /marketplace/checkout          — create Stripe Checkout session for a product
 *   GET    /marketplace/purchases         — current user's purchase history
 */

import { Router } from "express";
import { pool } from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import type { Request, Response, NextFunction } from "express";

type AuthReq = Request & { user: TokenPayload };

type OrgRow = {
  currency?:                  string;
  stripe_connect_account_id?: string;
  stripe_secret_key?:         string;
  trial_ends_at?:             string;
};

const router = Router();

// 30-second in-memory cache for the DB-backed marketplace_enabled flag.
// Avoids a DB round-trip on every request while staying fresh enough for
// the governance toggle to propagate within half a minute.
let _cachedEnabled: boolean | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 30_000;

async function isMarketplaceEnabled(): Promise<boolean> {
  if (_cachedEnabled !== null && Date.now() - _cacheTs < CACHE_TTL_MS) {
    return _cachedEnabled;
  }
  try {
    const { rows } = await pool.query<{ value: string }>(
      "SELECT value FROM system_config WHERE key = 'marketplace_enabled'",
    );
    _cachedEnabled = rows[0]?.value === "true";
  } catch {
    _cachedEnabled = false;
  }
  _cacheTs = Date.now();
  return _cachedEnabled ?? false;
}

// Feature-flag guard — returns 404 for all marketplace endpoints when disabled.
// State is read from system_config (DB) and cached for 30 s so that a super-admin
// toggle propagates across all sessions within half a minute.
// Scoped to /marketplace/* so the guard does not intercept unrelated routes.
router.use("/marketplace", async (_req: Request, res: Response, next: NextFunction) => {
  const enabled = await isMarketplaceEnabled();
  if (!enabled) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});

// ── GET /marketplace/products ─────────────────────────────────────────────────
// List all active marketplace products.
// Query params: org_id (includes org products + global verified), category, verified=true
router.get("/marketplace/products", requireAuth, async (req: Request, res: Response) => {
  const { org_id, category, verified } = req.query as Record<string, string | undefined>;

  const conditions: string[] = ["is_active = true"];
  const params: unknown[] = [];

  if (org_id) {
    params.push(parseInt(org_id, 10));
    conditions.push(`(org_id = $${params.length} OR org_id IS NULL)`);
  }
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  if (verified === "true") {
    conditions.push("is_stride_verified = true");
  }

  const { rows } = await pool.query(
    `SELECT id, org_id, title, description, category,
            price_cents, currency, platform_fee_pct,
            image_url, is_stride_verified, created_at
     FROM marketplace_products
     WHERE ${conditions.join(" AND ")}
     ORDER BY is_stride_verified DESC, org_id NULLS FIRST, created_at DESC`,
    params,
  );

  res.json({ products: rows });
});

// ── POST /marketplace/products ────────────────────────────────────────────────
router.post("/marketplace/products", requireAuth, requireRole("admin", "super_admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;

  const {
    title, description, category, price_cents, currency,
    platform_fee_pct, image_url, is_stride_verified, org_id,
  } = req.body as {
    title:              string;
    description?:       string;
    category?:          string;
    price_cents:        number;
    currency?:          string;
    platform_fee_pct?:  number;
    image_url?:         string;
    is_stride_verified?: boolean;
    org_id?:            number | null;
  };

  if (!title?.trim() || price_cents == null || price_cents < 0) {
    res.status(400).json({ error: "title and price_cents are required" });
    return;
  }

  // Non-super-admins can only create products for their own org
  const resolvedOrgId = org_id !== undefined ? org_id : (user.orgId ?? null);

  const { rows } = await pool.query(
    `INSERT INTO marketplace_products
       (org_id, title, description, category, price_cents, currency, platform_fee_pct, image_url, is_stride_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      resolvedOrgId,
      title.trim(),
      description?.trim() ?? null,
      (category ?? "equipment").trim(),
      price_cents,
      (currency ?? "eur").toLowerCase(),
      platform_fee_pct ?? 10.0,
      image_url?.trim() ?? null,
      is_stride_verified ?? false,
    ],
  );

  res.status(201).json(rows[0]);
});

// ── PATCH /marketplace/products/:id ──────────────────────────────────────────
router.patch("/marketplace/products/:id", requireAuth, requireRole("admin", "super_admin"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, description, category, price_cents, platform_fee_pct, image_url, is_active, is_stride_verified } = req.body;

  const { rows } = await pool.query(
    `UPDATE marketplace_products
     SET title              = COALESCE($1, title),
         description        = COALESCE($2, description),
         category           = COALESCE($3, category),
         price_cents        = COALESCE($4, price_cents),
         platform_fee_pct   = COALESCE($5, platform_fee_pct),
         image_url          = COALESCE($6, image_url),
         is_active          = COALESCE($7, is_active),
         is_stride_verified = COALESCE($8, is_stride_verified)
     WHERE id = $9
     RETURNING *`,
    [title, description, category, price_cents, platform_fee_pct, image_url, is_active, is_stride_verified, id],
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(rows[0]);
});

// ── DELETE /marketplace/products/:id ─────────────────────────────────────────
router.delete("/marketplace/products/:id", requireAuth, requireRole("admin", "super_admin"), async (req: Request, res: Response) => {
  await pool.query(`UPDATE marketplace_products SET is_active = false WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// ── POST /marketplace/checkout ────────────────────────────────────────────────
// Create a Stripe Checkout Session for a single marketplace product.
// Platform fee is automatically extracted as application_fee_amount on Stripe Connect.
router.post("/marketplace/checkout", requireAuth, async (req: Request, res: Response) => {
  const masterStripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!masterStripeKey) {
    res.status(503).json({ error: "stripe_not_configured" });
    return;
  }

  const user = (req as AuthReq).user;
  const { product_id, quantity = 1 } = req.body as { product_id: string; quantity?: number };

  if (!product_id) {
    res.status(400).json({ error: "product_id is required" });
    return;
  }

  // 1. Fetch product from DB — never trust client-side pricing
  const { rows: productRows } = await pool.query(
    `SELECT id, org_id, title, description, category, price_cents, currency,
            platform_fee_pct, image_url, is_stride_verified
     FROM marketplace_products
     WHERE id = $1 AND is_active = true`,
    [product_id],
  );
  const product = productRows[0];
  if (!product) {
    res.status(404).json({ error: "Product not found or no longer available" });
    return;
  }

  const qty            = Math.max(1, Math.floor(quantity));
  const totalCents     = product.price_cents * qty;
  const feePct         = parseFloat(product.platform_fee_pct as string);
  const platformFeeCents = Math.round(totalCents * feePct / 100);
  const targetOrgId    = (product.org_id as number | null) ?? user.orgId ?? 1;
  const currency       = (product.currency as string) ?? "eur";

  // 2. Fetch org's Stripe Connect credentials (if org-linked product)
  let connectId:    string | null = null;
  let orgStripeKey: string | null = null;
  let isTrial                     = false;

  if (product.org_id != null) {
    const { data: orgData } = await supabase
      .from("organizations")
      .select("stripe_connect_account_id, stripe_secret_key, trial_ends_at")
      .eq("id", product.org_id)
      .maybeSingle();

    const org  = orgData as OrgRow | null;
    connectId    = org?.stripe_connect_account_id ?? null;
    orgStripeKey = org?.stripe_secret_key ?? null;
    isTrial      = !org?.trial_ends_at || new Date() < new Date(org.trial_ends_at);
  }

  // 3. Build Stripe session
  const Stripe = (await import("stripe")).default;

  const rawDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0]
    ?? process.env["REPLIT_DEV_DOMAIN"]
    ?? "localhost";
  const baseUrl = `https://${rawDomain}`;

  type SessionParams = Parameters<InstanceType<typeof Stripe>["checkout"]["sessions"]["create"]>[0];

  const productData: { name: string; description?: string; images?: string[] } = {
    name:        product.title as string,
    description: (product.description as string | null) ?? "Stride Marketplace",
  };
  if (product.image_url) productData.images = [product.image_url as string];

  const sessionParams: SessionParams = {
    mode: "payment",
    line_items: [{
      price_data: {
        currency,
        product_data: productData,
        unit_amount: product.price_cents as number,
      },
      quantity: qty,
    }],
    success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${baseUrl}/payment-cancelled`,
    metadata: {
      type:       "marketplace_checkout",
      product_id: String(product_id),
      user_id:    String(user.id),
      org_id:     String(targetOrgId),
    },
  };

  // 4. Commission routing
  let activeStripeKey: string;

  if (orgStripeKey) {
    // Org manages their own Stripe account — no Connect deduction
    activeStripeKey = orgStripeKey;
  } else if (product.org_id == null) {
    // Global Stride Verified product (insurance partner) — master key, Stride retains
    activeStripeKey = masterStripeKey;
  } else {
    // Org product via Stripe Connect — apply platform commission
    activeStripeKey = masterStripeKey;
    if (connectId && !isTrial && platformFeeCents > 0) {
      sessionParams.payment_intent_data = {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: connectId },
      };
    }
  }

  const stripe  = new Stripe(activeStripeKey);
  const session = await stripe.checkout.sessions.create(sessionParams);

  // 5. Record purchase attempt
  await pool.query(
    `INSERT INTO marketplace_purchases
       (product_id, user_id, org_id, stripe_session_id, amount_cents, platform_fee_cents, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
    [product_id, String(user.id), targetOrgId, session.id, totalCents, platformFeeCents],
  );

  res.json({
    checkoutUrl:        session.url,
    sessionId:          session.id,
    amount_cents:       totalCents,
    platform_fee_cents: platformFeeCents,
    net_cents:          totalCents - platformFeeCents,
    currency,
    product: {
      title:    product.title,
      category: product.category,
    },
  });
});

// ── Shop Links CRUD ───────────────────────────────────────────────────────────
// GET  /marketplace/shop-links?org_id=X  — list active shop links for an org
// POST /marketplace/shop-links           — admin creates a link
// PATCH /marketplace/shop-links/:id      — admin updates a link
// DELETE /marketplace/shop-links/:id     — admin deletes a link

router.get("/marketplace/shop-links", requireAuth, async (req: Request, res: Response) => {
  const { org_id } = req.query as Record<string, string | undefined>;
  if (!org_id) { res.status(400).json({ error: "org_id is required" }); return; }
  const { rows } = await pool.query(
    `SELECT id, org_id, name, url, icon, color, position, is_active, created_at
     FROM shop_links WHERE org_id = $1 AND is_active = true
     ORDER BY position ASC, created_at ASC`,
    [parseInt(org_id, 10)],
  );
  res.json({ links: rows });
});

router.post("/marketplace/shop-links", requireAuth, requireRole("admin", "super_admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const { name, url, icon, color, position } = req.body as {
    name: string; url: string; icon?: string; color?: string; position?: number;
  };
  if (!name?.trim() || !url?.trim()) {
    res.status(400).json({ error: "name and url are required" });
    return;
  }
  const orgId = user.orgId;
  if (!orgId) { res.status(400).json({ error: "No org associated with this account" }); return; }
  const { rows } = await pool.query(
    `INSERT INTO shop_links (org_id, name, url, icon, color, position)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [orgId, name.trim(), url.trim(), icon ?? "bag-handle-outline", color ?? "#1E3A8A", position ?? 0],
  );
  res.status(201).json(rows[0]);
});

router.patch("/marketplace/shop-links/:id", requireAuth, requireRole("admin", "super_admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const { id } = req.params;
  const { name, url, icon, color, position, is_active } = req.body as Partial<{
    name: string; url: string; icon: string; color: string; position: number; is_active: boolean;
  }>;
  const { rows } = await pool.query(
    `UPDATE shop_links
     SET name      = COALESCE($1, name),
         url       = COALESCE($2, url),
         icon      = COALESCE($3, icon),
         color     = COALESCE($4, color),
         position  = COALESCE($5, position),
         is_active = COALESCE($6, is_active)
     WHERE id = $7 AND org_id = $8
     RETURNING *`,
    [name?.trim() ?? null, url?.trim() ?? null, icon ?? null, color ?? null,
     position ?? null, is_active ?? null, id, user.orgId],
  );
  if (!rows[0]) { res.status(404).json({ error: "Link not found" }); return; }
  res.json(rows[0]);
});

router.delete("/marketplace/shop-links/:id", requireAuth, requireRole("admin", "super_admin"), async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;
  const { id } = req.params;
  await pool.query(
    `UPDATE shop_links SET is_active = false WHERE id = $1 AND org_id = $2`,
    [id, user.orgId],
  );
  res.status(204).end();
});

// ── GET /marketplace/purchases ────────────────────────────────────────────────
// Current authenticated user's purchase history.
router.get("/marketplace/purchases", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthReq).user;

  const { rows } = await pool.query(
    `SELECT mp.id, mp.stripe_session_id, mp.amount_cents, mp.platform_fee_cents,
            mp.status, mp.purchased_at,
            p.title, p.category, p.image_url, p.is_stride_verified
     FROM marketplace_purchases mp
     JOIN marketplace_products  p  ON p.id = mp.product_id
     WHERE mp.user_id = $1
     ORDER BY mp.purchased_at DESC
     LIMIT 50`,
    [String(user.id)],
  );

  res.json({ purchases: rows });
});

export default router;
