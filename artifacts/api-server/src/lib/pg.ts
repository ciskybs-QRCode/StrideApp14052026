import pg from "pg";

const { Pool } = pg;

if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is required");

/**
 * Supabase passwords may contain special chars ([, #, ]) that break URL
 * parsing. # in particular is treated as a fragment separator, silently
 * truncating the password. We rebuild the URL with the password segment
 * percent-encoded so the pg library parses it correctly.
 */
function sanitiseConnectionString(raw: string): string {
  try {
    new URL(raw);
    return raw; // already valid — no special chars to escape
  } catch {
    const afterProto = raw.split("://")[1] ?? "";
    const atIdx      = afterProto.lastIndexOf("@");
    const userinfo   = afterProto.substring(0, atIdx);
    const hostpart   = afterProto.substring(atIdx + 1);
    const colonIdx   = userinfo.indexOf(":");
    const user       = userinfo.substring(0, colonIdx);
    const pass       = userinfo.substring(colonIdx + 1);
    return `postgresql://${user}:${encodeURIComponent(pass)}@${hostpart}`;
  }
}

// REQUIRED for Supabase transaction pooler (port 6543): prepared statements
// are not supported in transaction pooling mode. Setting prepareThreshold to 0
// on the Client prototype disables automatic prepared statements globally.
pg.defaults.parseInputDatesAsUTC = true;
(pg.Client.prototype as unknown as Record<string, unknown>)["prepareThreshold"] = 0;

export const pool = new Pool({
  connectionString: sanitiseConnectionString(process.env.SUPABASE_DB_URL),
  ssl: { rejectUnauthorized: false },
  max: 10,
});

/**
 * getPlatformStripeKey
 *
 * Reads the platform owner's Stripe secret key from the system_config table.
 * Falls back to the STRIPE_SECRET_KEY env var for local/dev environments.
 * Returns null if neither is configured.
 */
export async function getPlatformStripeKey(): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ value: string }>(
      `SELECT value FROM system_config WHERE key = 'platform_stripe_key' LIMIT 1`,
    );
    if (rows[0]?.value) return rows[0].value;
  } catch {
    // system_config table may not exist yet in dev; fall through to env var
  }
  return process.env["STRIPE_SECRET_KEY"] ?? null;
}

let initialized = false;

export async function ensureTables(): Promise<void> {
  if (initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blacklist (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL DEFAULT 1,
      email           TEXT,
      phone_number    TEXT,
      first_name      TEXT,
      last_name       TEXT,
      reason          TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS disciplines (
      id            SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name          TEXT NOT NULL,
      description   TEXT,
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS operator_profiles (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      profile_type    TEXT NOT NULL CHECK (profile_type IN ('paid','volunteer')),
      bio             TEXT,
      active          BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, organization_id)
    );
    CREATE TABLE IF NOT EXISTS operator_discipline_rates (
      id                   SERIAL PRIMARY KEY,
      operator_profile_id  INTEGER NOT NULL,
      discipline_id        INTEGER NOT NULL,
      hourly_rate_cents    INTEGER NOT NULL DEFAULT 0,
      UNIQUE(operator_profile_id, discipline_id)
    );
  `);
  // Add birthday_message column to organizations if not already present (safe on Supabase PostgreSQL)
  await pool.query(`
    ALTER TABLE IF EXISTS organizations
    ADD COLUMN IF NOT EXISTS birthday_message TEXT;
  `).catch(() => {});

  // Stripe Connect: add stripe_connect_id to users table
  await pool.query(`
    ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS stripe_connect_id TEXT;
  `).catch(() => {});

  // Stripe Connect: add stripe_transfer_id to reimbursements table
  await pool.query(`
    ALTER TABLE IF EXISTS reimbursements
    ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;
  `).catch(() => {});

  // Legal signatures audit log (tamper-evident ledger)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legal_signatures_audit_log (
      id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id                 INTEGER NOT NULL,
      document_id             TEXT NOT NULL,
      document_version        TEXT NOT NULL DEFAULT '1',
      selected_option         TEXT,
      signature_svg           TEXT NOT NULL,
      timestamp               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_address              TEXT,
      device_operating_system TEXT,
      document_text_hash      TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS lsal_user_doc_idx
      ON legal_signatures_audit_log (user_id, document_id);
  `).catch(() => {});

  // Kiosk: check_in_method on attendance_records ('qr' | 'manual' | 'signed_out')
  await pool.query(`
    ALTER TABLE IF EXISTS attendance_records
    ADD COLUMN IF NOT EXISTS check_in_method TEXT DEFAULT 'qr';
  `).catch(() => {});

  // Operator clock-in / clock-out ledger (payroll cross-reference)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS operator_clock_records (
      id          SERIAL PRIMARY KEY,
      operator_id INTEGER NOT NULL,
      session_id  INTEGER,
      clock_in    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      clock_out   TIMESTAMPTZ,
      notes       TEXT
    );
    CREATE INDEX IF NOT EXISTS ocr_operator_idx ON operator_clock_records (operator_id);
    CREATE INDEX IF NOT EXISTS ocr_clock_in_idx ON operator_clock_records (clock_in);
  `).catch(() => {});

  // Pioneer: activation_status for users ('active' | 'pending_activation')
  await pool.query(`
    ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS activation_status TEXT DEFAULT 'active';
  `).catch(() => {});

  // Profile photo: base64 data URI stored per-user, synced across devices
  await pool.query(`
    ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
  `).catch(() => {});

  // Role assignment email templates (editable by admin, used when roles change)
  await pool.query(`
    ALTER TABLE IF EXISTS admin_settings
    ADD COLUMN IF NOT EXISTS role_assignment_email_subject TEXT
      DEFAULT 'Your role has been updated at {org_name}';
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE IF EXISTS admin_settings
    ADD COLUMN IF NOT EXISTS role_assignment_email_body TEXT
      DEFAULT 'Hi {name}, your role at {org_name} has been updated. You now have access as: {roles}. Log in to the app to explore your new features.';
  `).catch(() => {});

  // system_config: stores pioneer wizard state (system_configured) and owner_email.
  // Lives in Supabase (single source of truth) — pool now points to SUPABASE_DB_URL.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_config (
      key        TEXT PRIMARY KEY,
      value      TEXT    NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  // Invite tokens (admin-generated shareable registration links)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invite_tokens (
      id          SERIAL PRIMARY KEY,
      token       TEXT NOT NULL UNIQUE,
      org_id      INTEGER NOT NULL DEFAULT 1,
      created_by  INTEGER,
      expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS inv_tok_idx ON invite_tokens (token);
  `).catch(() => {});

  // Activation tokens (email verification for web-registered users)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activation_tokens (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      token       TEXT NOT NULL UNIQUE,
      used        BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS act_tok_idx ON activation_tokens (token);
  `).catch(() => {});

  // Multi-tenant: localization & compliance metadata on organizations
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'AU';`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS legal_framework TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS tenant_type TEXT DEFAULT 'commercial';`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;`).catch(() => {});

  // Discretionary trial engine — starts from first member join, not org creation
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NOW();`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '6 months');`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS is_trial_extended BOOLEAN DEFAULT FALSE;`).catch(() => {});
  // trial_duration_days: how long the trial lasts after first member joins (set by super-admin)
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS trial_duration_days INTEGER DEFAULT 30;`).catch(() => {});
  // Remove auto-NOW() defaults so new orgs start with null until first member joins
  await pool.query(`ALTER TABLE IF EXISTS organizations ALTER COLUMN trial_started_at DROP DEFAULT;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ALTER COLUMN trial_ends_at DROP DEFAULT;`).catch(() => {});

  // Subscription billing state machine
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trialing';`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS stripe_price_id_per_seat TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS cost_per_seat_cents INTEGER DEFAULT 150;`).catch(() => {});

  // Org contact email for audit-traced communications
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS contact_email TEXT;`).catch(() => {});

  // Data lifecycle: schedule deletion 30 days after trial/subscription expiry
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS data_deletion_scheduled_at TIMESTAMPTZ;`).catch(() => {});

  // Platform owner configuration (dynamic OWNER_EMAIL, etc.)
  // system_config table already created above — this is a no-op guard.

  // Seed default feature flags (idempotent — ON CONFLICT DO NOTHING)
  await pool.query(`
    INSERT INTO system_config (key, value)
    VALUES ('marketplace_enabled', 'false')
    ON CONFLICT (key) DO NOTHING
  `).catch(() => {});

  // Platform-level event log — super-admin notification feed
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_events (
      id          SERIAL PRIMARY KEY,
      event_type  TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT,
      payload     JSONB DEFAULT '{}',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  // QR code pricing adjustments per tenant (discount policy engine)
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS qr_base_price_cents INTEGER DEFAULT 0;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS qr_discount_type TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS qr_discount_value INTEGER DEFAULT 0;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS promo_code TEXT;`).catch(() => {});

  // Trial reminder tracking — prevents duplicate emails at T-7, T-3, T-1
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS trial_reminder_7d_sent_at TIMESTAMPTZ;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS trial_reminder_3d_sent_at TIMESTAMPTZ;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS trial_reminder_1d_sent_at TIMESTAMPTZ;`).catch(() => {});

  // First-invoice welcome discount (25% one-time reward, applied via Stripe coupon)
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS first_invoice_discount_applied BOOLEAN DEFAULT FALSE;`).catch(() => {});

  // Per-tenant Stripe key — org's own Stripe account for direct payment processing
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS stripe_secret_key TEXT;`).catch(() => {});

  // Dynamic branding engine — org-specific colors and logo for web checkout
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS branding_primary_color TEXT DEFAULT '#1E3A8A';`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS branding_secondary_color TEXT DEFAULT '#D4AF37';`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS branding_logo_url TEXT;`).catch(() => {});

  // Batch checkout: groups multiple org payments into one UX flow
  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkout_batches (
      id              SERIAL PRIMARY KEY,
      batch_id        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
      user_id         TEXT NOT NULL,
      organization_id INTEGER,
      status          TEXT NOT NULL DEFAULT 'pending',
      total_sessions  INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      total_cents     INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at    TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS cb_batch_idx ON checkout_batches (batch_id);
    CREATE INDEX IF NOT EXISTS cb_user_idx  ON checkout_batches (user_id);
  `).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS checkout_sessions ADD COLUMN IF NOT EXISTS batch_id UUID;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS checkout_sessions ADD COLUMN IF NOT EXISTS batch_position INTEGER;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS checkout_sessions ADD COLUMN IF NOT EXISTS checkout_url TEXT;`).catch(() => {});

  // Future absence planning — operator scheduling
  await pool.query(`
    CREATE TABLE IF NOT EXISTS operator_absences (
      id            SERIAL PRIMARY KEY,
      org_id        INTEGER,
      operator_id   TEXT,
      operator_name TEXT,
      status        TEXT NOT NULL DEFAULT 'scheduled_future',
      mode          TEXT NOT NULL,
      absence_date  DATE NOT NULL,
      end_date      DATE,
      start_time    TEXT,
      end_time      TEXT,
      reason        TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});

  // Future absence planning — student/parent scheduling (kiosk excused flag)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_absences (
      id           SERIAL PRIMARY KEY,
      org_id       INTEGER,
      student_id   TEXT,
      student_name TEXT,
      parent_id    TEXT,
      status       TEXT NOT NULL DEFAULT 'scheduled_future',
      mode         TEXT NOT NULL,
      absence_date DATE NOT NULL,
      end_date     DATE,
      note         TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});

  // Medical certificate AI analysis results
  await pool.query(`
    CREATE TABLE IF NOT EXISTS member_medical_certs (
      id                        SERIAL PRIMARY KEY,
      member_id                 INTEGER,
      org_id                    INTEGER,
      student_full_name         TEXT,
      expiration_date           DATE,
      doctor_name               TEXT,
      certificate_type          TEXT CHECK (certificate_type IN ('agonistico','non-agonistico','other')),
      classification_confidence REAL,
      potential_anomaly_detected BOOLEAN NOT NULL DEFAULT FALSE,
      status                    TEXT NOT NULL DEFAULT 'Pending Admin Review',
      anomaly_reasons           TEXT,
      analyzed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS mmc_member_idx ON member_medical_certs (member_id);
    CREATE INDEX IF NOT EXISTS mmc_org_idx    ON member_medical_certs (org_id);
  `).catch(() => {});

  // Financial audit trail — every payment request logged before any session is created
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_audit_log (
      id               SERIAL PRIMARY KEY,
      request_id       UUID    NOT NULL DEFAULT gen_random_uuid(),
      organization_id  INTEGER,
      user_id          TEXT    NOT NULL,
      performed_by_user_id  INTEGER,
      performed_by_name     TEXT,
      items_list       JSONB   NOT NULL,
      calculated_total NUMERIC(10,2) NOT NULL,
      discount_applied NUMERIC(10,2) NOT NULL DEFAULT 0,
      promo_code       TEXT,
      payment_method   TEXT    NOT NULL DEFAULT 'stripe_card',
      stripe_session_id TEXT,
      bank_reference   TEXT,
      cash_confirmed_by INTEGER,
      cash_confirmed_at TIMESTAMPTZ,
      paypal_order_id  TEXT,
      status           TEXT    NOT NULL DEFAULT 'pending',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS pal_org_idx  ON payment_audit_log (organization_id);
    CREATE INDEX IF NOT EXISTS pal_user_idx ON payment_audit_log (user_id);
    CREATE INDEX IF NOT EXISTS pal_status_idx ON payment_audit_log (status);
  `).catch(() => {});

  // Web-Checkout Proxy: track all checkout sessions (Stripe + manual)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkout_sessions (
      id              SERIAL PRIMARY KEY,
      session_id      TEXT NOT NULL UNIQUE,
      organization_id INTEGER,
      user_id         TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      items           JSONB,
      invoice_number  TEXT,
      invoice_id      INTEGER,
      amount_cents    INTEGER,
      payment_method  TEXT NOT NULL DEFAULT 'stripe_card',
      bank_reference  TEXT,
      cash_confirmed_by INTEGER,
      cash_confirmed_at TIMESTAMPTZ,
      paypal_order_id TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at    TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS cs_session_idx ON checkout_sessions (session_id);
    CREATE INDEX IF NOT EXISTS cs_user_idx    ON checkout_sessions (user_id);
  `).catch(() => {});

  // Stride Safety Score — org reviews (satellite table, writes only from /reviews endpoint)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_reviews (
      id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      org_id               INTEGER     NOT NULL,
      parent_id            TEXT        NOT NULL,
      course_id            INTEGER,
      safety_rating        SMALLINT    NOT NULL CHECK (safety_rating BETWEEN 1 AND 5),
      communication_rating SMALLINT    NOT NULL CHECK (communication_rating BETWEEN 1 AND 5),
      comment              TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS or_org_idx    ON org_reviews (org_id);
    CREATE INDEX IF NOT EXISTS or_org_ts_idx ON org_reviews (org_id, created_at DESC);
  `).catch(() => {});

  // Emergency Pulse — crisis broadcast tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS emergency_pulses (
      id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      org_id         INTEGER,
      triggered_by   TEXT        NOT NULL,
      location_label TEXT        NOT NULL DEFAULT 'Main Campus',
      status         TEXT        NOT NULL DEFAULT 'active',
      triggered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at    TIMESTAMPTZ,
      CHECK (status IN ('active', 'resolved'))
    );
    CREATE INDEX IF NOT EXISTS ep_status_idx ON emergency_pulses (status, triggered_at DESC);

    CREATE TABLE IF NOT EXISTS emergency_pulse_acks (
      id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      pulse_id   UUID        NOT NULL,
      parent_id  TEXT        NOT NULL,
      status     TEXT        NOT NULL,
      acked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (pulse_id, parent_id),
      CHECK (status IN ('safe', 'missing'))
    );
    CREATE INDEX IF NOT EXISTS epa_pulse_idx ON emergency_pulse_acks (pulse_id);
  `).catch(() => {});

  // BLE Proximity — frictionless check-in via beacon detection
  await pool.query(`
    CREATE TABLE IF NOT EXISTS proximity_beacons (
      id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      org_id        INTEGER,
      beacon_uuid   TEXT        NOT NULL UNIQUE,
      label         TEXT        NOT NULL,
      zone          TEXT        NOT NULL DEFAULT 'entrance',
      zone_category TEXT        NOT NULL DEFAULT 'core',
      active        BOOLEAN     NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS pb_org_idx    ON proximity_beacons (org_id);
    CREATE INDEX IF NOT EXISTS pb_uuid_idx   ON proximity_beacons (beacon_uuid);

    CREATE TABLE IF NOT EXISTS child_beacon_assignments (
      id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      child_id      TEXT        NOT NULL,
      wearable_uuid TEXT        NOT NULL UNIQUE,
      label         TEXT        NOT NULL DEFAULT 'Wearable',
      active        BOOLEAN     NOT NULL DEFAULT true,
      assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS cba_child_idx  ON child_beacon_assignments (child_id);
    CREATE INDEX IF NOT EXISTS cba_uuid_idx   ON child_beacon_assignments (wearable_uuid);
  `).catch(() => {});

  // Safe-Zone: add zone_category to existing beacons table (idempotent)
  await pool.query(`
    ALTER TABLE IF EXISTS proximity_beacons
      ADD COLUMN IF NOT EXISTS zone_category TEXT NOT NULL DEFAULT 'core';
  `).catch(() => {});

  // Safe-Zone: per-child transit state (IN_TRANSIT + transit_lock + 15-min timeout)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS child_transit_states (
      id                 UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      child_id           TEXT        NOT NULL UNIQUE,
      status             TEXT        NOT NULL DEFAULT 'CHECKED_IN',
      transit_lock       BOOLEAN     NOT NULL DEFAULT false,
      transit_started_at TIMESTAMPTZ,
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS cts_child_idx ON child_transit_states (child_id);
  `).catch(() => {});

  // Stride-Verified Marketplace — products, services, platform commission
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_products (
      id                 UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      org_id             INTEGER,
      title              TEXT        NOT NULL,
      description        TEXT,
      category           TEXT        NOT NULL DEFAULT 'equipment',
      price_cents        INTEGER     NOT NULL,
      currency           TEXT        NOT NULL DEFAULT 'eur',
      platform_fee_pct   NUMERIC(5,2) NOT NULL DEFAULT 10.0,
      image_url          TEXT,
      is_stride_verified BOOLEAN     NOT NULL DEFAULT false,
      is_active          BOOLEAN     NOT NULL DEFAULT true,
      metadata           JSONB,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS mp_org_idx       ON marketplace_products (org_id);
    CREATE INDEX IF NOT EXISTS mp_verified_idx  ON marketplace_products (is_stride_verified);
    CREATE INDEX IF NOT EXISTS mp_active_idx    ON marketplace_products (is_active);

    CREATE TABLE IF NOT EXISTS marketplace_purchases (
      id                 UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      product_id         UUID        NOT NULL,
      user_id            TEXT        NOT NULL,
      org_id             INTEGER,
      stripe_session_id  TEXT,
      amount_cents       INTEGER     NOT NULL,
      platform_fee_cents INTEGER     NOT NULL DEFAULT 0,
      status             TEXT        NOT NULL DEFAULT 'pending',
      purchased_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS mpur_user_idx    ON marketplace_purchases (user_id);
    CREATE INDEX IF NOT EXISTS mpur_prod_idx    ON marketplace_purchases (product_id);
    CREATE INDEX IF NOT EXISTS mpur_session_idx ON marketplace_purchases (stripe_session_id);
  `).catch(() => {});

  // Shopify / external shop links — per-org named URL buttons
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_links (
      id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      org_id     INTEGER     NOT NULL,
      name       TEXT        NOT NULL,
      url        TEXT        NOT NULL,
      icon       TEXT        NOT NULL DEFAULT 'bag-handle-outline',
      color      TEXT        NOT NULL DEFAULT '#1E3A8A',
      position   INTEGER     NOT NULL DEFAULT 0,
      is_active  BOOLEAN     NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS sl_org_idx ON shop_links (org_id);
  `).catch(() => {});

  // Seed Stride-Verified insurance partner products (demo)
  await pool.query(`
    INSERT INTO marketplace_products
      (title, description, category, price_cents, currency, platform_fee_pct, is_stride_verified)
    SELECT
      'Sports Injury Insurance — Annual',
      'Up to €50,000 cover for sport-related injuries, physiotherapy, and hospitalisation. Automatically renews annually. Underwritten by Stride Insurance Partners.',
      'insurance', 4999, 'eur', 15.0, true
    WHERE NOT EXISTS (
      SELECT 1 FROM marketplace_products WHERE title = 'Sports Injury Insurance — Annual'
    );

    INSERT INTO marketplace_products
      (title, description, category, price_cents, currency, platform_fee_pct, is_stride_verified)
    SELECT
      'Family Multi-Sport Cover',
      'Comprehensive annual policy covering all registered dependants across every enrolled activity. One premium, every child, all disciplines.',
      'insurance', 8999, 'eur', 15.0, true
    WHERE NOT EXISTS (
      SELECT 1 FROM marketplace_products WHERE title = 'Family Multi-Sport Cover'
    );

    INSERT INTO marketplace_products
      (org_id, title, description, category, price_cents, currency, platform_fee_pct, is_stride_verified)
    SELECT
      1,
      'Aikido Gi — Beginner Set',
      'Full uniform (jacket + trousers + white belt) sized for junior practitioners. Pre-washed, durable cotton blend. School logo embroidered on request.',
      'equipment', 4900, 'eur', 12.0, false
    WHERE NOT EXISTS (
      SELECT 1 FROM marketplace_products WHERE title = 'Aikido Gi — Beginner Set'
    );

    INSERT INTO marketplace_products
      (org_id, title, description, category, price_cents, currency, platform_fee_pct, is_stride_verified)
    SELECT
      1,
      'Stride Dance Bag',
      'Spacious drawstring bag with dedicated shoe pouch and water-bottle holder. Available in Navy/Gold colourway.',
      'accessories', 2499, 'eur', 12.0, false
    WHERE NOT EXISTS (
      SELECT 1 FROM marketplace_products WHERE title = 'Stride Dance Bag'
    );
  `).catch(() => {});

  // Security Timeline — black-box observer log (append-only, no FK to any other table)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS child_activity_log (
      id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      child_id   TEXT        NOT NULL,
      event_type TEXT        NOT NULL,
      timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata   JSONB
    );
    CREATE INDEX IF NOT EXISTS cal_child_idx    ON child_activity_log (child_id);
    CREATE INDEX IF NOT EXISTS cal_child_ts_idx ON child_activity_log (child_id, timestamp DESC);
  `).catch(() => {});

  // Guardian Circle — auxiliary authorized pickups table (satellite, no FK to members/users)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authorized_pickups (
      id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      child_id       TEXT        NOT NULL,
      guardian_name  TEXT        NOT NULL,
      guardian_email TEXT,
      guardian_phone TEXT,
      is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
      expires_at     TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by     TEXT
    );
    CREATE INDEX IF NOT EXISTS ap_child_idx  ON authorized_pickups (child_id);
    CREATE INDEX IF NOT EXISTS ap_active_idx ON authorized_pickups (child_id, is_active);
  `).catch(() => {});

  // ── Formally declared tables (previously undeclared, referenced in services) ──

  // Rescue cascade orchestration — autonomous operator absence cover
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rescue_cascades (
      id                      SERIAL      PRIMARY KEY,
      org_id                  INTEGER     NOT NULL,
      absence_id              INTEGER,
      discipline_id           INTEGER,
      course_name             TEXT,
      class_datetime          TIMESTAMPTZ,
      absent_operator_id      TEXT        NOT NULL,
      absent_operator_name    TEXT,
      status                  TEXT        NOT NULL DEFAULT 'pending',
      auto_triggered          BOOLEAN     NOT NULL DEFAULT FALSE,
      resolved_at             TIMESTAMPTZ,
      resolved_by_operator_id TEXT,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cascade_contacts (
      id                SERIAL      PRIMARY KEY,
      cascade_id        INTEGER     NOT NULL REFERENCES rescue_cascades(id) ON DELETE CASCADE,
      operator_id       TEXT        NOT NULL,
      operator_name     TEXT,
      rank              INTEGER     NOT NULL,
      skill_score       NUMERIC(4,3),
      reliability_score NUMERIC(4,3),
      composite_score   NUMERIC(4,3),
      contacted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status            TEXT        NOT NULL DEFAULT 'pending',
      responded_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});

  // Emergency push notification infrastructure — tokens + delivery log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_push_tokens (
      id         SERIAL      PRIMARY KEY,
      user_id    TEXT        NOT NULL,
      org_id     INTEGER     NOT NULL,
      token      TEXT        NOT NULL,
      platform   TEXT        NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, token)
    )
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS emergency_push_log (
      id                        SERIAL      PRIMARY KEY,
      org_id                    INTEGER     NOT NULL,
      category                  TEXT        NOT NULL,
      title                     TEXT        NOT NULL,
      body                      TEXT        NOT NULL,
      payload                   JSONB       NOT NULL DEFAULT '{}',
      tokens_sent               TEXT[]      NOT NULL DEFAULT '{}',
      status                    TEXT        NOT NULL DEFAULT 'pending_ack',
      suppressed                BOOLEAN     NOT NULL DEFAULT FALSE,
      suppress_reason           TEXT,
      ack_deadline              TIMESTAMPTZ,
      acknowledged_at           TIMESTAMPTZ,
      twilio_fallback_triggered BOOLEAN     NOT NULL DEFAULT FALSE,
      twilio_fallback_at        TIMESTAMPTZ,
      created_at                TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  // Digital Proof of Presence — cryptographic pickup record chain
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pickup_records (
      id             UUID             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      pickup_id      UUID             NOT NULL DEFAULT gen_random_uuid(),
      child_id       TEXT             NOT NULL,
      operator_id    TEXT             NOT NULL,
      parent_id      TEXT,
      timestamp      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
      lat            DOUBLE PRECISION,
      lng            DOUBLE PRECISION,
      signature_blob TEXT             NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pr_child_idx    ON pickup_records (child_id);
    CREATE INDEX IF NOT EXISTS pr_operator_idx ON pickup_records (operator_id);
    CREATE INDEX IF NOT EXISTS pr_pickup_idx   ON pickup_records (pickup_id);
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS verification_hashes (
      id         SERIAL      PRIMARY KEY,
      record_id  UUID        NOT NULL REFERENCES pickup_records(id),
      hash_value TEXT        NOT NULL,
      hash_algo  TEXT        NOT NULL DEFAULT 'SHA-256',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS vh_record_idx ON verification_hashes (record_id);
  `).catch(() => {});

  // Regional pricing tiers — per-region seat price overrides
  await pool.query(`
    CREATE TABLE IF NOT EXISTS regional_pricing (
      id                   SERIAL      PRIMARY KEY,
      region_code          TEXT        NOT NULL UNIQUE,
      currency_code        TEXT        NOT NULL,
      price_per_seat_cents INTEGER     NOT NULL DEFAULT 0,
      is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});

  // Security escalation events — phase-based child safety alerts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_escalation_events (
      id              SERIAL      PRIMARY KEY,
      organization_id INTEGER     NOT NULL,
      child_id        TEXT        NOT NULL,
      child_name      TEXT,
      phase           INTEGER     NOT NULL DEFAULT 1,
      triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status          TEXT        NOT NULL DEFAULT 'active',
      resolved_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS sec_esc_org_idx   ON security_escalation_events (organization_id);
    CREATE INDEX IF NOT EXISTS sec_esc_child_idx ON security_escalation_events (child_id);
  `).catch(() => {});

  // Organization members — user ↔ org role lookup (mirrors Supabase user_organizations)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_members (
      id              SERIAL      PRIMARY KEY,
      user_id         TEXT        NOT NULL,
      organization_id INTEGER     NOT NULL,
      role            TEXT        NOT NULL DEFAULT 'member',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, organization_id)
    );
    CREATE INDEX IF NOT EXISTS org_mem_org_idx  ON organization_members (organization_id);
    CREATE INDEX IF NOT EXISTS org_mem_user_idx ON organization_members (user_id);
  `).catch(() => {});

  // Parent profiles — self-provisioned parent/member role for multi-role users.
  // An admin or operator can activate a "parent" context for their own account
  // without changing their primary organization_members row (which has a unique
  // constraint on user_id + organization_id).  The GET /user/roles endpoint
  // reads this table in addition to organization_members and operator_profiles.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parent_profiles (
      id              SERIAL      PRIMARY KEY,
      user_id         TEXT        NOT NULL,
      organization_id INTEGER     NOT NULL,
      active          BOOLEAN     NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, organization_id)
    );
    CREATE INDEX IF NOT EXISTS pp_user_idx ON parent_profiles (user_id);
    CREATE INDEX IF NOT EXISTS pp_org_idx  ON parent_profiles (organization_id);
  `).catch(() => {});

  // Digital Proof of Presence — tamper-evident pickup signature log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pickup_signatures (
      id               SERIAL  PRIMARY KEY,
      pickup_id        UUID    NOT NULL DEFAULT gen_random_uuid(),
      child_id         TEXT    NOT NULL,
      child_name       TEXT    NOT NULL DEFAULT '',
      operator_id      TEXT    NOT NULL,
      operator_name    TEXT,
      guardian_name    TEXT,
      relationship     TEXT,
      lat              DOUBLE PRECISION,
      lng              DOUBLE PRECISION,
      signature_blob   TEXT    NOT NULL,
      integrity_hash   TEXT    NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ps_child_idx ON pickup_signatures (child_id);
    CREATE INDEX IF NOT EXISTS ps_op_idx    ON pickup_signatures (operator_id);
  `).catch(() => {});

  // Expand notifications CHECK constraint to the full 34-type set (27 production
  // types + 7 legacy types kept for backward compat with reminder-scheduler etc.)
  await pool.query(`
    ALTER TABLE notifications
      DROP CONSTRAINT IF EXISTS notifications_type_check
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY(ARRAY[
      'booking_request','booking_confirmed','booking_cancelled',
      'availability_approved','availability_rejected','lesson_reminder','payment_received',
      'promo','attendance_alert','emergency','course_assignment','broadcast','check_in',
      'course_pending_confirmation','feedback','lesson_decision','chat_message',
      'emergency_resolved','lesson_disruption','emergency_medical','document','meeting',
      'achievement','substitute_request','material','compliance','private_lesson_approved',
      'emergency_police','emergency_fire','reimbursement','private_lesson_proposed',
      'emergency_pulse','ble_timeout','security_escalation'
    ]))
  `).catch(() => {});

  // Pioneer double opt-in: email verification tokens
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      token      TEXT    NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS evt_user_idx ON email_verification_tokens (user_id);
  `).catch(() => {});

  // Organization compliance audit log (legal acceptance with IP + signature)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_compliance_logs (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL,
      org_id           INTEGER NOT NULL DEFAULT 0,
      ip_address       TEXT,
      user_agent       TEXT,
      accepted_terms   BOOLEAN NOT NULL DEFAULT FALSE,
      accepted_privacy BOOLEAN NOT NULL DEFAULT FALSE,
      signature_text   TEXT,
      signed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ocl_user_idx ON organization_compliance_logs (user_id);
    CREATE INDEX IF NOT EXISTS ocl_org_idx  ON organization_compliance_logs (org_id);
  `).catch(() => {});

  // Dependent-to-Member promotion tokens — email-confirmed upgrade flow
  await pool.query(`
    CREATE TABLE IF NOT EXISTS promotion_tokens (
      id              SERIAL PRIMARY KEY,
      token           TEXT        NOT NULL UNIQUE,
      member_id       TEXT        NOT NULL,
      user_id         TEXT        NOT NULL,
      org_id          INTEGER,
      dependent_email TEXT        NOT NULL,
      dependent_name  TEXT        NOT NULL,
      status          TEXT        NOT NULL DEFAULT 'pending',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at      TIMESTAMPTZ NOT NULL,
      confirmed_at    TIMESTAMPTZ,
      CHECK (status IN ('pending', 'confirmed', 'expired'))
    );
    CREATE INDEX IF NOT EXISTS pt_token_idx ON promotion_tokens (token);
    CREATE INDEX IF NOT EXISTS pt_user_idx  ON promotion_tokens (user_id);
  `).catch(() => {});

  // Multi-association invite codes — admin-generated shareable join codes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_invite_codes (
      id                  SERIAL PRIMARY KEY,
      code                VARCHAR(8) UNIQUE NOT NULL,
      organization_id     INT NOT NULL,
      role                VARCHAR(20) NOT NULL DEFAULT 'parent',
      created_by_user_id  INT,
      note                TEXT,
      expires_at          TIMESTAMPTZ,
      max_uses            INT,
      used_count          INT NOT NULL DEFAULT 0,
      active              BOOLEAN NOT NULL DEFAULT true,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_oic_org  ON org_invite_codes(organization_id);
    CREATE INDEX IF NOT EXISTS idx_oic_code ON org_invite_codes(code);
  `).catch(() => {});

  // Per-org child memberships — which orgs each dependent is enrolled in
  await pool.query(`
    CREATE TABLE IF NOT EXISTS child_org_memberships (
      id              SERIAL PRIMARY KEY,
      member_id       INT NOT NULL,
      organization_id INT NOT NULL,
      parent_user_id  INT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(member_id, organization_id)
    );
    CREATE INDEX IF NOT EXISTS idx_com_member ON child_org_memberships(member_id);
    CREATE INDEX IF NOT EXISTS idx_com_org    ON child_org_memberships(organization_id);
    CREATE INDEX IF NOT EXISTS idx_com_parent ON child_org_memberships(parent_user_id);
  `).catch(() => {});

  // organization_members: primary multi-org membership (one primary role per user per org)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_members (
      id              SERIAL PRIMARY KEY,
      user_id         TEXT NOT NULL,
      organization_id INT NOT NULL,
      role            VARCHAR(20) NOT NULL DEFAULT 'parent',
      joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, organization_id)
    );
    CREATE INDEX IF NOT EXISTS idx_om_user ON organization_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_om_org  ON organization_members(organization_id);
  `).catch(() => {});

  // parent_profiles: self-provisioned parent/member role per org
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parent_profiles (
      id              SERIAL PRIMARY KEY,
      user_id         TEXT NOT NULL,
      organization_id INT NOT NULL,
      active          BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, organization_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pp_user ON parent_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_pp_org  ON parent_profiles(organization_id);
  `).catch(() => {});

  // ── Event Ticketing ──────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id      INTEGER NOT NULL,
      title       TEXT NOT NULL,
      description TEXT,
      location    TEXT,
      category    TEXT NOT NULL DEFAULT 'general',
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_by  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id);
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_dates (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      date         DATE NOT NULL,
      start_time   TEXT,
      end_time     TEXT,
      capacity     INTEGER NOT NULL DEFAULT 0,
      tickets_sold INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_event_dates_event ON event_dates(event_id);
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_ticket_types (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name             TEXT NOT NULL,
      description      TEXT,
      price_cents      INTEGER NOT NULL DEFAULT 0,
      max_per_order    INTEGER NOT NULL DEFAULT 10,
      member_free_qty  INTEGER NOT NULL DEFAULT 0,
      is_active        BOOLEAN NOT NULL DEFAULT true
    );
    CREATE INDEX IF NOT EXISTS idx_ett_event ON event_ticket_types(event_id);
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_tickets (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id         UUID NOT NULL REFERENCES events(id),
      event_date_id    UUID REFERENCES event_dates(id),
      ticket_type_id   UUID REFERENCES event_ticket_types(id),
      user_id          TEXT NOT NULL,
      org_id           INTEGER NOT NULL,
      quantity         INTEGER NOT NULL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL DEFAULT 0,
      total_cents      INTEGER NOT NULL DEFAULT 0,
      status           TEXT NOT NULL DEFAULT 'confirmed',
      qr_code          TEXT UNIQUE NOT NULL,
      stripe_session_id TEXT,
      attendee_name    TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_et_event  ON event_tickets(event_id);
    CREATE INDEX IF NOT EXISTS idx_et_user   ON event_tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_et_qr     ON event_tickets(qr_code);
  `).catch(() => {});

  await pool.query(`
    ALTER TABLE IF EXISTS broadcast_messages
      ADD COLUMN IF NOT EXISTS recipient_mode      TEXT    DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS recipient_data      JSONB   DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS attachments         JSONB   DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS urgent              BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS signature_required  BOOLEAN DEFAULT FALSE;
  `).catch(() => {});

  // Message delivery + read-receipt audit log (legal-grade, immutable per recipient)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_read_log (
      id                    SERIAL      PRIMARY KEY,
      broadcast_message_id  TEXT        NOT NULL,
      notification_id       INTEGER,
      organization_id       INTEGER     NOT NULL,
      recipient_id          INTEGER     NOT NULL,
      recipient_name        TEXT        NOT NULL DEFAULT '',
      recipient_role        TEXT        NOT NULL DEFAULT '',
      performed_by_user_id  INTEGER,
      performed_by_name     TEXT        NOT NULL DEFAULT '',
      delivered_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at               TIMESTAMPTZ,
      skipped_at            TIMESTAMPTZ,
      push_sent             BOOLEAN     NOT NULL DEFAULT FALSE,
      UNIQUE (broadcast_message_id, recipient_id)
    )
  `).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mrl_bcast ON message_read_log(broadcast_message_id);
    CREATE INDEX IF NOT EXISTS idx_mrl_org   ON message_read_log(organization_id);
    CREATE INDEX IF NOT EXISTS idx_mrl_recip ON message_read_log(recipient_id);
  `).catch(() => {});

  // ── STRIDE Platform Messages (Super Admin → Association Admins) ───────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sa_platform_messages (
      id              SERIAL      PRIMARY KEY,
      sender_id       INTEGER     NOT NULL,
      subject         TEXT        NOT NULL,
      body            TEXT        NOT NULL,
      channels        TEXT[]      NOT NULL DEFAULT '{}',
      urgency         TEXT        NOT NULL DEFAULT 'normal',
      target_type     TEXT        NOT NULL DEFAULT 'all_admins',
      target_org_id   INTEGER,
      recipient_count INTEGER     NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sa_platform_message_recipients (
      id           SERIAL      PRIMARY KEY,
      message_id   INTEGER     NOT NULL,
      recipient_id INTEGER     NOT NULL,
      org_id       INTEGER     NOT NULL,
      email_sent   BOOLEAN     NOT NULL DEFAULT FALSE,
      push_sent    BOOLEAN     NOT NULL DEFAULT FALSE,
      in_app_sent  BOOLEAN     NOT NULL DEFAULT FALSE,
      read_at      TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (message_id, recipient_id)
    )
  `).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sapm_created  ON sa_platform_messages(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sapmr_message ON sa_platform_message_recipients(message_id);
    CREATE INDEX IF NOT EXISTS idx_sapmr_recip   ON sa_platform_message_recipients(recipient_id);
  `).catch(() => {});

  // ── Preset message templates ──────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preset_messages (
      id             SERIAL PRIMARY KEY,
      org_id         INTEGER NOT NULL,
      key            TEXT    NOT NULL,
      subject        TEXT,
      body           TEXT    NOT NULL DEFAULT '',
      channel_inapp  BOOLEAN NOT NULL DEFAULT TRUE,
      channel_push   BOOLEAN NOT NULL DEFAULT FALSE,
      channel_email  BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_id, key)
    );
    CREATE INDEX IF NOT EXISTS idx_pm_org ON preset_messages(org_id);
  `).catch(() => {});

  // ── Per-course waitlist config ────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_waitlist_config (
      id                 SERIAL PRIMARY KEY,
      course_id          INTEGER NOT NULL UNIQUE,
      org_id             INTEGER NOT NULL,
      waitlist_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
      max_capacity       INTEGER NOT NULL DEFAULT 20,
      waitlist_threshold INTEGER NOT NULL DEFAULT 5,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cwc_org ON course_waitlist_config(org_id);
  `).catch(() => {});

  // ── Course waitlist entries ───────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_waitlist (
      id               SERIAL PRIMARY KEY,
      org_id           INTEGER NOT NULL,
      course_id        INTEGER NOT NULL,
      member_id        INTEGER NOT NULL,
      dependent_id     INTEGER,
      preferred_days   JSONB   NOT NULL DEFAULT '[]'::jsonb,
      preferred_times  JSONB   NOT NULL DEFAULT '[]'::jsonb,
      joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status           TEXT NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting','offered','accepted','declined','enrolled')),
      offered_at       TIMESTAMPTZ,
      offer_expires_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_cwl_course ON course_waitlist(course_id);
    CREATE INDEX IF NOT EXISTS idx_cwl_member ON course_waitlist(member_id);
    CREATE INDEX IF NOT EXISTS idx_cwl_org    ON course_waitlist(org_id);
  `).catch(() => {});

  // ── Certificate reminder dedup log ────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cert_reminders_sent (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL,
      org_id       INTEGER NOT NULL,
      cert_type    TEXT    NOT NULL CHECK (cert_type IN ('medical','first_aid')),
      reminder_day INTEGER NOT NULL,
      sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, cert_type, reminder_day)
    );
  `).catch(() => {});

  // ── admin_settings — new feature-flag columns ────────────────────────────
  await pool.query(`
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS medical_cert_required          BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS medical_cert_required_members BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS first_aid_cert_required    BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS cert_grace_days            INTEGER NOT NULL DEFAULT 30;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS cert_reminder_body         TEXT;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS auto_invoice_enabled       BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS member_alerts_enabled      BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS payment_reminders_enabled  BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS attendance_reports_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS kiosk_exit_pin             TEXT    NOT NULL DEFAULT '4321';
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS waitlist_alerts_enabled    BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS waitlist_enabled           BOOLEAN NOT NULL DEFAULT FALSE;
  `).catch(() => {});

  // ── Superannuation columns on admin_settings ─────────────────────────────────
  await pool.query(`
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS super_rate_percent   NUMERIC(5,2) NOT NULL DEFAULT 11.5;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS super_included        BOOLEAN      NOT NULL DEFAULT FALSE;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS super_is_fixed        BOOLEAN      NOT NULL DEFAULT FALSE;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS super_fixed_cents     INTEGER      NOT NULL DEFAULT 0;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS payroll_deductions    JSONB        NOT NULL DEFAULT '[]';
  `).catch(() => {});

  // ── Operator availability prefs on operator_profiles ──────────────────────────
  await pool.query(`
    ALTER TABLE operator_profiles ADD COLUMN IF NOT EXISTS available_for_substitution    BOOLEAN      NOT NULL DEFAULT TRUE;
    ALTER TABLE operator_profiles ADD COLUMN IF NOT EXISTS sub_min_hours                 NUMERIC(4,2);
    ALTER TABLE operator_profiles ADD COLUMN IF NOT EXISTS available_for_private_lessons BOOLEAN      NOT NULL DEFAULT FALSE;
    ALTER TABLE operator_profiles ADD COLUMN IF NOT EXISTS private_lesson_min_hours      NUMERIC(4,2);
  `).catch(() => {});

  // ── Private lesson policy columns on admin_settings ───────────────────────────
  await pool.query(`
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS pl_reschedule_fee_pct      INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS pl_reschedule_window_hours  INTEGER NOT NULL DEFAULT 24;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS pl_cancel_fee_pct           INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS pl_cancel_window_hours      INTEGER NOT NULL DEFAULT 24;
  `).catch(() => {});

  // ── Operator absence course policy on admin_settings ─────────────────────────
  await pool.query(`
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS absence_policy             TEXT NOT NULL DEFAULT 'substitute';
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS absence_postpone_minutes   INTEGER NOT NULL DEFAULT 60;
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS absence_cancel_refund_type TEXT NOT NULL DEFAULT 'credit';
  `).catch(() => {});

  // ── Fee tracking columns on private_lesson_bookings ───────────────────────────
  await pool.query(`
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS operator_user_id       INTEGER;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS parent_user_id         INTEGER;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS cancelled_at           TIMESTAMPTZ;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS cancel_fee_cents       INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS reschedule_fee_cents   INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS rescheduled_from_date  DATE;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS cancel_reason          TEXT;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS status                 TEXT NOT NULL DEFAULT 'pending_payment';
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS preferred_date         DATE;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS preferred_time         TIME;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS duration_minutes       INTEGER NOT NULL DEFAULT 60;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS discipline_name        TEXT;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS member_price_cents     INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS operator_payout_cents  INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS checkout_session_id    TEXT;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS payroll_credited       BOOLEAN DEFAULT false;
    ALTER TABLE private_lesson_bookings ADD COLUMN IF NOT EXISTS notes                  TEXT;
  `).catch(() => {});

  // ── cert_grace_extensions — per-user admin-granted deadline extensions ──────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cert_grace_extensions (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL,
      org_id       INTEGER NOT NULL,
      admin_id     INTEGER NOT NULL,
      extended_days INTEGER NOT NULL DEFAULT 0,
      note         TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS cge_user_idx ON cert_grace_extensions (user_id, org_id);
  `).catch(() => {});

  // ── admin_settings — first aid org coverage threshold ───────────────────────
  await pool.query(`
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS min_first_aid_operators INTEGER NOT NULL DEFAULT 1;
  `).catch(() => {});

  // ── admin_settings — org contact email for audit trail / branding ───────────
  await pool.query(`
    ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS org_contact_email TEXT;

  -- Platform support email for the founder (super admin)
  ALTER TABLE system_config ADD COLUMN IF NOT EXISTS support_email TEXT;
  `).catch(() => {});

  // ── course_waitlist — 'expired' status support ───────────────────────────────
  await pool.query(`
    ALTER TABLE course_waitlist DROP CONSTRAINT IF EXISTS course_waitlist_status_check;
    ALTER TABLE course_waitlist ADD CONSTRAINT course_waitlist_status_check
      CHECK (status IN ('waiting','offered','accepted','declined','expired'));
  `).catch(() => {});

  // ── course_waitlist — defensive column additions (backfill migration) ────────
  await pool.query(`ALTER TABLE course_waitlist ADD COLUMN IF NOT EXISTS org_id           INTEGER NOT NULL DEFAULT 1`).catch(() => {});
  await pool.query(`ALTER TABLE course_waitlist ADD COLUMN IF NOT EXISTS member_id        INTEGER`).catch(() => {});
  await pool.query(`ALTER TABLE course_waitlist ADD COLUMN IF NOT EXISTS dependent_id     INTEGER`).catch(() => {});
  await pool.query(`ALTER TABLE course_waitlist ADD COLUMN IF NOT EXISTS preferred_days   JSONB   NOT NULL DEFAULT '[]'::jsonb`).catch(() => {});
  await pool.query(`ALTER TABLE course_waitlist ADD COLUMN IF NOT EXISTS preferred_times  JSONB   NOT NULL DEFAULT '[]'::jsonb`).catch(() => {});
  await pool.query(`ALTER TABLE course_waitlist ADD COLUMN IF NOT EXISTS offered_at       TIMESTAMPTZ`).catch(() => {});
  await pool.query(`ALTER TABLE course_waitlist ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cwl_org    ON course_waitlist(org_id)`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cwl_member ON course_waitlist(member_id)`).catch(() => {});

  // ── Backfill direct_messages.read_at (table predates column addition) ───────
  await pool.query(`ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ`).catch(() => {});

  // ── Backfill missing blacklist columns (table predates schema additions) ────
  await pool.query(`ALTER TABLE blacklist ADD COLUMN IF NOT EXISTS phone_number TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE blacklist ADD COLUMN IF NOT EXISTS first_name   TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE blacklist ADD COLUMN IF NOT EXISTS last_name    TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE blacklist ADD COLUMN IF NOT EXISTS reason       TEXT`).catch(() => {});

  // ── Operator first-aid certificates ────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS operator_first_aid_certs (
      id                         SERIAL PRIMARY KEY,
      operator_id                INTEGER NOT NULL,
      org_id                     INTEGER,
      expiration_date            DATE,
      classification_confidence  FLOAT,
      potential_anomaly_detected BOOLEAN NOT NULL DEFAULT FALSE,
      status                     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved','pending','flagged')),
      anomaly_reasons            TEXT,
      uploaded_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ofa_operator_idx ON operator_first_aid_certs (operator_id);
  `);
  // Expand cert_reminders_sent to include expiry variants
  await pool.query(`
    ALTER TABLE cert_reminders_sent DROP CONSTRAINT IF EXISTS cert_reminders_sent_cert_type_check;
    ALTER TABLE cert_reminders_sent ADD CONSTRAINT cert_reminders_sent_cert_type_check
      CHECK (cert_type IN ('medical','first_aid','medical_expiry','first_aid_expiry'));
  `).catch(() => {}); // ignore if constraint already correct

  // ── Employment type + contractor fields on operator_profiles ──────────────────
  await pool.query(`
    ALTER TABLE operator_profiles
      ADD COLUMN IF NOT EXISTS employment_type          TEXT NOT NULL DEFAULT 'contractor',
      ADD COLUMN IF NOT EXISTS contractor_rate_cents    INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS contractor_billing_unit  TEXT NOT NULL DEFAULT 'hourly',
      ADD COLUMN IF NOT EXISTS contractor_extra_chips   JSONB NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS primary_country          TEXT,
      ADD COLUMN IF NOT EXISTS primary_city             TEXT;
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE operator_profiles
      ADD COLUMN IF NOT EXISTS employment_sub_type TEXT;
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE operator_profiles
      ADD COLUMN IF NOT EXISTS payout_method TEXT NOT NULL DEFAULT 'bank_transfer';
  `).catch(() => {});

  // ── Employment contracts ───────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employment_contracts (
      id                    SERIAL PRIMARY KEY,
      operator_profile_id   INTEGER NOT NULL,
      organization_id       INTEGER NOT NULL,
      operator_user_id      INTEGER NOT NULL,
      employment_type       TEXT NOT NULL,
      contract_html         TEXT NOT NULL,
      rate_summary          TEXT,
      generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      signed_at             TIMESTAMPTZ,
      signature_ip          TEXT,
      signature_device      TEXT,
      UNIQUE (operator_profile_id, organization_id)
    );
    CREATE INDEX IF NOT EXISTS ec_op_idx ON employment_contracts (operator_profile_id);
    CREATE INDEX IF NOT EXISTS ec_user_idx ON employment_contracts (operator_user_id, organization_id);
  `).catch(() => {});

  // ── Org plan settings (plan tier in local pg, not Supabase) ──────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_plan_settings (
      org_id      INTEGER PRIMARY KEY,
      plan_tier   TEXT    NOT NULL DEFAULT 'studio',
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch(() => {});

  // ── Org access grants (super_admin grants free/custom access to any org) ─────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_access_grants (
      id          SERIAL PRIMARY KEY,
      org_id      INTEGER NOT NULL,
      granted_by  INTEGER,
      plan_tier   TEXT    NOT NULL DEFAULT 'academy',
      start_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_date    TIMESTAMPTZ,
      reason      TEXT,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS oag_org_idx    ON org_access_grants(org_id);
    CREATE INDEX IF NOT EXISTS oag_active_idx ON org_access_grants(org_id, is_active);
  `).catch(() => {});

  // ── User promo assignments (auto-push promo codes to org members) ─────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_promo_assignments (
      id              SERIAL PRIMARY KEY,
      org_id          INTEGER NOT NULL,
      user_id         INTEGER,
      promo_code      TEXT    NOT NULL,
      discount_type   TEXT    NOT NULL DEFAULT 'percent',
      discount_value  INTEGER NOT NULL DEFAULT 10,
      message         TEXT,
      valid_until     TIMESTAMPTZ,
      is_used         BOOLEAN NOT NULL DEFAULT FALSE,
      used_at         TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS upa_org_idx  ON user_promo_assignments(org_id);
    CREATE INDEX IF NOT EXISTS upa_user_idx ON user_promo_assignments(user_id);
    CREATE INDEX IF NOT EXISTS upa_code_idx ON user_promo_assignments(promo_code);
    CREATE INDEX IF NOT EXISTS upa_active   ON user_promo_assignments(user_id, is_used) WHERE is_used = false;
  `).catch(() => {});

  // ── Plan free trial periods (2 months free on first signup, no card needed) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plan_trial_periods (
      id           SERIAL PRIMARY KEY,
      org_id       INTEGER NOT NULL UNIQUE,
      plan_tier    TEXT    NOT NULL DEFAULT 'core',
      start_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_date     TIMESTAMPTZ NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'active',
      reminder_7d_sent_at TIMESTAMPTZ,
      reminder_3d_sent_at TIMESTAMPTZ,
      reminder_1d_sent_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ptp_org_idx    ON plan_trial_periods(org_id);
    CREATE INDEX IF NOT EXISTS ptp_status_idx ON plan_trial_periods(status, end_date);
  `).catch(() => {});

  // ── Plan upgrade trials (2 months free at next tier after 3 paid months) ─────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plan_upgrade_trials (
      id                   SERIAL PRIMARY KEY,
      org_id               INTEGER NOT NULL,
      from_tier            TEXT    NOT NULL,
      to_tier              TEXT    NOT NULL,
      activation_token     TEXT    UNIQUE,
      offer_sent_at        TIMESTAMPTZ,
      activated_at         TIMESTAMPTZ,
      start_date           TIMESTAMPTZ,
      end_date             TIMESTAMPTZ,
      status               TEXT    NOT NULL DEFAULT 'offer_sent',
      reminder_15d_sent_at TIMESTAMPTZ,
      reminder_7d_sent_at  TIMESTAMPTZ,
      reminder_3d_sent_at  TIMESTAMPTZ,
      reminder_1d_sent_at  TIMESTAMPTZ,
      confirmed_upgrade     BOOLEAN NOT NULL DEFAULT FALSE,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS put_org_idx    ON plan_upgrade_trials(org_id);
    CREATE INDEX IF NOT EXISTS put_status_idx ON plan_upgrade_trials(status, end_date);
    CREATE INDEX IF NOT EXISTS put_token_idx  ON plan_upgrade_trials(activation_token) WHERE activation_token IS NOT NULL;
  `).catch(() => {});

  // ── Consecutive paid months tracker ──────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_paid_months (
      id               SERIAL PRIMARY KEY,
      org_id           INTEGER NOT NULL,
      billing_month    DATE    NOT NULL,
      plan_tier        TEXT    NOT NULL,
      amount_cents     INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (org_id, billing_month)
    );
    CREATE INDEX IF NOT EXISTS opm_org_idx ON org_paid_months(org_id, billing_month DESC);
  `).catch(() => {});

  // ── Accountant payment orders ─────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accountant_payment_orders (
      id               SERIAL PRIMARY KEY,
      org_id           INTEGER NOT NULL,
      created_by       INTEGER,
      payee_name       TEXT NOT NULL,
      payee_type       TEXT NOT NULL DEFAULT 'accountant',
      description      TEXT,
      amount_cents     INTEGER NOT NULL,
      currency         TEXT NOT NULL DEFAULT 'EUR',
      due_date         DATE NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending_auth',
      authorized_by    INTEGER,
      authorized_at    TIMESTAMPTZ,
      paid_at          TIMESTAMPTZ,
      payment_notes    TEXT,
      failure_reason   TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS apo_org_idx    ON accountant_payment_orders(org_id);
    CREATE INDEX IF NOT EXISTS apo_status_idx ON accountant_payment_orders(org_id, status);
    CREATE INDEX IF NOT EXISTS apo_due_idx    ON accountant_payment_orders(due_date) WHERE status NOT IN ('paid','cancelled');
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE accountant_payment_orders
      ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'bank_transfer';
  `).catch(() => {});

  // ── Payment execution log ─────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_execution_log (
      id           SERIAL PRIMARY KEY,
      order_id     INTEGER NOT NULL REFERENCES accountant_payment_orders(id) ON DELETE CASCADE,
      attempted_at TIMESTAMPTZ DEFAULT NOW(),
      status       TEXT NOT NULL,
      error_msg    TEXT,
      executed_by  INTEGER
    );
    CREATE INDEX IF NOT EXISTS pel_order_idx ON payment_execution_log(order_id);
  `).catch(() => {});

  // ── Fee Events (admin-created one-off payment events, e.g. year-end gala fee) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fee_events (
      id                      SERIAL PRIMARY KEY,
      organization_id         INTEGER NOT NULL,
      title                   TEXT NOT NULL,
      description             TEXT,
      status                  TEXT NOT NULL DEFAULT 'draft',
      payment_type            TEXT NOT NULL DEFAULT 'single',
      total_amount_cents      INTEGER NOT NULL DEFAULT 0,
      currency                TEXT NOT NULL DEFAULT 'EUR',
      due_date                DATE,
      free_tickets_per_member INTEGER NOT NULL DEFAULT 0,
      recipient_mode          TEXT NOT NULL DEFAULT 'all',
      recipient_data          JSONB NOT NULL DEFAULT '{}',
      broadcast_message_id    INTEGER,
      created_by_admin_id     INTEGER NOT NULL,
      published_at            TIMESTAMPTZ,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS fee_events_org_idx    ON fee_events(organization_id);
    CREATE INDEX IF NOT EXISTS fee_events_status_idx ON fee_events(organization_id, status);

    CREATE TABLE IF NOT EXISTS fee_event_line_items (
      id            SERIAL PRIMARY KEY,
      fee_event_id  INTEGER NOT NULL REFERENCES fee_events(id) ON DELETE CASCADE,
      description   TEXT NOT NULL,
      amount_cents  INTEGER NOT NULL DEFAULT 0,
      sort_order    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS feli_event_idx ON fee_event_line_items(fee_event_id);

    CREATE TABLE IF NOT EXISTS fee_event_installments (
      id              SERIAL PRIMARY KEY,
      fee_event_id    INTEGER NOT NULL REFERENCES fee_events(id) ON DELETE CASCADE,
      installment_num INTEGER NOT NULL,
      label           TEXT,
      amount_cents    INTEGER NOT NULL,
      due_date        DATE NOT NULL
    );
    CREATE INDEX IF NOT EXISTS fein_event_idx ON fee_event_installments(fee_event_id);

    CREATE TABLE IF NOT EXISTS fee_event_recipients (
      id              SERIAL PRIMARY KEY,
      fee_event_id    INTEGER NOT NULL REFERENCES fee_events(id) ON DELETE CASCADE,
      user_id         INTEGER NOT NULL,
      member_name     TEXT NOT NULL DEFAULT '',
      notification_id INTEGER,
      delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at         TIMESTAMPTZ,
      skipped_at      TIMESTAMPTZ,
      payment_status  TEXT NOT NULL DEFAULT 'pending',
      paid_at         TIMESTAMPTZ,
      UNIQUE (fee_event_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS fere_event_idx ON fee_event_recipients(fee_event_id);
    CREATE INDEX IF NOT EXISTS fere_user_idx  ON fee_event_recipients(user_id);
  `).catch(() => {});

  // ── Association Expenses ──────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS association_expenses (
      id                    SERIAL PRIMARY KEY,
      organization_id       INTEGER NOT NULL,
      title                 TEXT NOT NULL,
      category              TEXT NOT NULL DEFAULT 'general',
      recipient_name        TEXT,
      recipient_iban        TEXT,
      recipient_bic         TEXT,
      recipient_stripe_link TEXT,
      amount_cents          INTEGER NOT NULL DEFAULT 0,
      currency              TEXT NOT NULL DEFAULT 'EUR',
      is_recurring          BOOLEAN NOT NULL DEFAULT FALSE,
      recurrence_interval   TEXT CHECK (recurrence_interval IN ('weekly','monthly','annual','custom')),
      recurrence_day        INTEGER,
      next_due_date         DATE,
      last_paid_date        DATE,
      payment_method        TEXT CHECK (payment_method IN ('bank','stripe','cash','check','other')),
      auto_pay              BOOLEAN NOT NULL DEFAULT FALSE,
      reminder_type         TEXT CHECK (reminder_type IN ('email','in_app','both','none')) DEFAULT 'in_app',
      notes                 TEXT,
      status                TEXT NOT NULL DEFAULT 'active',
      created_by_admin_id   INTEGER NOT NULL DEFAULT 0,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS assoc_expenses_org_idx    ON association_expenses(organization_id);
    CREATE INDEX IF NOT EXISTS assoc_expenses_status_idx ON association_expenses(organization_id, status);

    CREATE TABLE IF NOT EXISTS expense_payments (
      id              SERIAL PRIMARY KEY,
      expense_id      INTEGER NOT NULL REFERENCES association_expenses(id) ON DELETE CASCADE,
      organization_id INTEGER NOT NULL,
      paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      amount_cents    INTEGER NOT NULL DEFAULT 0,
      currency        TEXT NOT NULL DEFAULT 'EUR',
      reference       TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS exp_payments_expense_idx ON expense_payments(expense_id);
    CREATE INDEX IF NOT EXISTS exp_payments_org_idx     ON expense_payments(organization_id);

    CREATE TABLE IF NOT EXISTS volunteer_reimbursements (
      id                  SERIAL PRIMARY KEY,
      operator_user_id    INTEGER NOT NULL,
      organization_id     INTEGER NOT NULL,
      amount_cents        INTEGER NOT NULL DEFAULT 0,
      currency            TEXT NOT NULL DEFAULT 'EUR',
      reason              TEXT,
      is_recurring        BOOLEAN NOT NULL DEFAULT FALSE,
      recurrence_interval TEXT CHECK (recurrence_interval IN ('weekly','monthly','annual')),
      bank_holder_name    TEXT,
      bank_iban           TEXT,
      bank_bic            TEXT,
      stripe_link         TEXT,
      status              TEXT NOT NULL DEFAULT 'active',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS vol_reimb_org_idx  ON volunteer_reimbursements(organization_id);
    CREATE INDEX IF NOT EXISTS vol_reimb_user_idx ON volunteer_reimbursements(operator_user_id);
  `).catch(() => {});

  // ── Per-org Communication Settings ───────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_communication_settings (
      id                  SERIAL PRIMARY KEY,
      organization_id     INTEGER NOT NULL UNIQUE,
      resend_api_key      TEXT,
      resend_from_email   TEXT,
      twilio_account_sid  TEXT,
      twilio_auth_token   TEXT,
      twilio_from_number  TEXT,
      test_email_sent_at  TIMESTAMPTZ,
      test_sms_sent_at    TIMESTAMPTZ,
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS org_comm_settings_org_idx ON org_communication_settings(organization_id);
  `).catch(() => {});

  // ── WhatsApp columns on org_communication_settings ───────────────────────
  await pool.query(`
    ALTER TABLE org_communication_settings
      ADD COLUMN IF NOT EXISTS whatsapp_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS whatsapp_from_number  TEXT,
      ADD COLUMN IF NOT EXISTS test_whatsapp_sent_at TIMESTAMPTZ;
  `).catch(() => {});

  // ── Schema migrations ──────────────────────────────────────────────────────
  // Re-point enrollments.child_id FK to members table (original pointed to
  // the empty `children` table which blocked all enrollment inserts).
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'enrollments_child_id_children_id_fk'
          AND table_name = 'enrollments'
      ) THEN
        ALTER TABLE enrollments DROP CONSTRAINT enrollments_child_id_children_id_fk;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'enrollments_child_id_members_id_fk'
          AND table_name = 'enrollments'
      ) THEN
        ALTER TABLE enrollments
          ADD CONSTRAINT enrollments_child_id_members_id_fk
          FOREIGN KEY (child_id) REFERENCES members(id) ON DELETE CASCADE;
      END IF;
    END$$;
  `).catch(() => {});

  // ── Public Reviews ────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_reviews (
      id               SERIAL PRIMARY KEY,
      name             TEXT NOT NULL,
      role             TEXT NOT NULL,
      association_name TEXT NOT NULL,
      member_count     INTEGER,
      rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment          TEXT NOT NULL,
      approved         BOOLEAN NOT NULL DEFAULT FALSE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS public_reviews_approved_idx ON public_reviews(approved, created_at DESC);
  `).catch(() => {});

  // ── Member Subscriptions (Stripe recurring) ──────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS member_subscriptions (
      id                   SERIAL PRIMARY KEY,
      stripe_subscription_id TEXT NOT NULL UNIQUE,
      organization_id      INTEGER NOT NULL,
      user_id              TEXT NOT NULL,
      participant_name     TEXT,
      item_name            TEXT,
      item_type            TEXT NOT NULL DEFAULT 'course',
      package_type         TEXT NOT NULL DEFAULT 'monthlyBilling',
      amount_cents         INTEGER NOT NULL,
      currency             TEXT NOT NULL DEFAULT 'EUR',
      status               TEXT NOT NULL DEFAULT 'active',
      current_period_end   TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS member_subs_user_idx ON member_subscriptions(user_id, organization_id);
    CREATE INDEX IF NOT EXISTS member_subs_org_idx  ON member_subscriptions(organization_id);
  `).catch(() => {});

  // ── Membership fee + policy columns on admin_settings ────────────────────
  await pool.query(`
    ALTER TABLE admin_settings
      ADD COLUMN IF NOT EXISTS membership_annual_fee_cents       INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS membership_monthly_fee_cents      INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS membership_description            TEXT;
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE admin_settings
      ADD COLUMN IF NOT EXISTS membership_mandatory              BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS membership_renewal_type           TEXT    NOT NULL DEFAULT 'monthly',
      ADD COLUMN IF NOT EXISTS membership_renewal_days           INTEGER NOT NULL DEFAULT 365,
      ADD COLUMN IF NOT EXISTS membership_renewal_fixed_date     DATE,
      ADD COLUMN IF NOT EXISTS membership_reminder_days          TEXT    NOT NULL DEFAULT '[30,15,7,3,1]',
      ADD COLUMN IF NOT EXISTS membership_suspend_on_expiry      BOOLEAN NOT NULL DEFAULT FALSE;
  `).catch(() => {});
  // NEW: membership fee visibility controls (admin decides everything)
  await pool.query(`
    ALTER TABLE admin_settings
      ADD COLUMN IF NOT EXISTS membership_enabled                BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS membership_applies_to               TEXT    NOT NULL DEFAULT 'members',
      ADD COLUMN IF NOT EXISTS membership_billing_day            INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS membership_donation_mode          BOOLEAN NOT NULL DEFAULT FALSE;
  `).catch(() => {});

  // ── expires_at + membership_status on member_subscriptions ───────────────
  await pool.query(`
    ALTER TABLE member_subscriptions
      ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS membership_status TEXT NOT NULL DEFAULT 'active';
  `).catch(() => {});

  // ── membership_reminder_log — dedup table for expiry reminders ────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS membership_reminder_log (
      id              SERIAL PRIMARY KEY,
      subscription_id INTEGER NOT NULL,
      reminder_day    INTEGER NOT NULL,
      sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (subscription_id, reminder_day)
    );
  `).catch(() => {});

  // ── user_profile_extra — all non-auth profile fields synced across devices ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profile_extra (
      user_id          INTEGER PRIMARY KEY,
      preferred_name   TEXT,
      date_of_birth    TEXT,
      gender           TEXT,
      phone            TEXT,
      address_street   TEXT,
      address_suburb   TEXT,
      address_city     TEXT,
      address_postcode TEXT,
      address_state    TEXT,
      tax_id           TEXT,
      acn              TEXT,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS direct_messages (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      thread_id       UUID,
      from_user_id    INTEGER NOT NULL,
      to_user_id      INTEGER NOT NULL,
      subject         TEXT,
      body            TEXT NOT NULL,
      attachments     JSONB DEFAULT '[]',
      read_at         TIMESTAMPTZ,
      deleted_by_sender   BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_by_recipient BOOLEAN NOT NULL DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS dm_to_user_idx     ON direct_messages (to_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS dm_from_user_idx   ON direct_messages (from_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS dm_org_idx         ON direct_messages (organization_id);
    CREATE INDEX IF NOT EXISTS dm_thread_idx      ON direct_messages (thread_id);
    CREATE INDEX IF NOT EXISTS dm_unread_idx      ON direct_messages (to_user_id, read_at) WHERE read_at IS NULL;

    CREATE TABLE IF NOT EXISTS direct_message_threads (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id INTEGER NOT NULL,
      participant_1   INTEGER NOT NULL,
      participant_2   INTEGER NOT NULL,
      last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, participant_1, participant_2)
    );
    CREATE INDEX IF NOT EXISTS dmt_participant_idx ON direct_message_threads (participant_1, participant_2);
  `).catch(() => {});

  // ── admin_settings — branding columns ───────────────────────────────────────
  await pool.query(`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS brand_primary_color   TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS brand_secondary_color TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS brand_logo_url        TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS brand_app_name        TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS min_first_aid_operators INTEGER NOT NULL DEFAULT 1`).catch(() => {});
  await pool.query(`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS org_contact_email      TEXT`).catch(() => {});

  // ── operator_profile_rates — per-discipline hourly rates for operators ───────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS operator_profile_rates (
      id                    SERIAL PRIMARY KEY,
      operator_profile_id   INTEGER NOT NULL REFERENCES operator_profiles(id) ON DELETE CASCADE,
      discipline_id         INTEGER NOT NULL,
      hourly_rate_cents     INTEGER NOT NULL DEFAULT 0,
      UNIQUE(operator_profile_id, discipline_id)
    );
    CREATE INDEX IF NOT EXISTS idx_opr_profile ON operator_profile_rates(operator_profile_id);
  `).catch(() => {});

  // ── members — extra columns added after initial schema ────────────────────
  await pool.query(`ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS first_name       TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS last_name        TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS phone            TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS emergency_contact TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS allergies        TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS photo_uri        TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS medical_notes    TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS members ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'active'`).catch(() => {});

  // ── emergency_pulses — category + patient_name columns ─────────────────────
  await pool.query(`ALTER TABLE emergency_pulses ADD COLUMN IF NOT EXISTS category     TEXT NOT NULL DEFAULT 'FIRE'`).catch(() => {});
  await pool.query(`ALTER TABLE emergency_pulses ADD COLUMN IF NOT EXISTS patient_name TEXT`).catch(() => {});

  // ── notification_delivery_log — per-notification audit (deliver/open/read/dismiss) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_delivery_log (
      id              SERIAL      PRIMARY KEY,
      notification_id INTEGER,
      recipient_id    INTEGER     NOT NULL,
      organization_id INTEGER,
      source          TEXT        NOT NULL DEFAULT 'system',
      delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      opened_at       TIMESTAMPTZ,
      read_at         TIMESTAMPTZ,
      dismissed_at    TIMESTAMPTZ,
      push_sent       BOOLEAN     NOT NULL DEFAULT FALSE
    )
  `).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ndl_recipient ON notification_delivery_log(recipient_id);
    CREATE INDEX IF NOT EXISTS idx_ndl_notif     ON notification_delivery_log(notification_id);
  `).catch(() => {});

  // ── Operator Skills system ────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS operator_skills (
      id                  SERIAL      PRIMARY KEY,
      operator_profile_id INTEGER     NOT NULL,
      organization_id     INTEGER     NOT NULL,
      label               TEXT        NOT NULL,
      source              TEXT        NOT NULL DEFAULT 'custom',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(operator_profile_id, label)
    );
    CREATE INDEX IF NOT EXISTS idx_opskills_profile ON operator_skills(operator_profile_id);
    CREATE TABLE IF NOT EXISTS skill_label_presets (
      id              SERIAL  PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      label           TEXT    NOT NULL,
      UNIQUE(organization_id, label)
    );
  `).catch(() => {});

  await pool.query(`
    ALTER TABLE IF EXISTS operator_profiles
    ADD COLUMN IF NOT EXISTS skills_completed BOOLEAN NOT NULL DEFAULT FALSE;
  `).catch(() => {});

  // ── Notification read receipts (replaces Supabase read column) ──────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_read_receipts (
      id              SERIAL      PRIMARY KEY,
      notification_id INTEGER     NOT NULL,
      recipient_id    INTEGER     NOT NULL,
      organization_id INTEGER     NOT NULL DEFAULT 0,
      read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      opened_at       TIMESTAMPTZ,
      UNIQUE(notification_id, recipient_id)
    );
    CREATE INDEX IF NOT EXISTS idx_nrr_notif     ON notification_read_receipts(notification_id);
    CREATE INDEX IF NOT EXISTS idx_nrr_recipient ON notification_read_receipts(recipient_id);
    CREATE INDEX IF NOT EXISTS idx_nrr_org       ON notification_read_receipts(organization_id);
  `).catch(() => {});

  // ── Operator profile flags (skills_completed replaces Supabase column) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS operator_profile_flags (
      operator_profile_id INTEGER     PRIMARY KEY,
      skills_completed    BOOLEAN     NOT NULL DEFAULT FALSE,
      skills_completed_at TIMESTAMPTZ
    );
  `).catch(() => {});

  // ── Course labels (free-text suggestions per org) ────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_course_labels (
      id              SERIAL      PRIMARY KEY,
      organization_id INTEGER     NOT NULL,
      type            VARCHAR(20) NOT NULL,
      label           TEXT        NOT NULL,
      used_count      INTEGER     NOT NULL DEFAULT 1,
      UNIQUE(organization_id, type, label)
    );
    CREATE INDEX IF NOT EXISTS idx_ocl_org_type ON org_course_labels(organization_id, type);

    CREATE TABLE IF NOT EXISTS course_extras (
      scheduled_course_id         INTEGER     PRIMARY KEY,
      organization_id             INTEGER     NOT NULL,
      course_name                 TEXT,
      discipline_name             TEXT,
      start_date                  DATE,
      trial_lesson_free           BOOLEAN     NOT NULL DEFAULT FALSE,
      price_per_year_cents        INTEGER,
      operator_pay_override_cents INTEGER,
      capacity                    INTEGER,
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ce_org ON course_extras(organization_id);
  `).catch(() => {});

  initialized = true;
}
