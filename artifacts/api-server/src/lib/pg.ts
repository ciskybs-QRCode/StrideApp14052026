import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

  // Pioneer: system_configured flag on organizations
  await pool.query(`
    ALTER TABLE IF EXISTS organizations
    ADD COLUMN IF NOT EXISTS system_configured BOOLEAN DEFAULT FALSE;
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

  // Discretionary trial engine: 6-month default; pioneer resets to 30 days at first login
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NOW();`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '6 months');`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS is_trial_extended BOOLEAN DEFAULT FALSE;`).catch(() => {});

  // Subscription billing state machine
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trialing';`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS stripe_price_id_per_seat TEXT;`).catch(() => {});
  await pool.query(`ALTER TABLE IF EXISTS organizations ADD COLUMN IF NOT EXISTS cost_per_seat_cents INTEGER DEFAULT 150;`).catch(() => {});

  // Platform owner configuration (dynamic OWNER_EMAIL, etc.)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

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

  // Financial audit trail — every payment request logged before Stripe session is created
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_audit_log (
      id               SERIAL PRIMARY KEY,
      request_id       UUID    NOT NULL DEFAULT gen_random_uuid(),
      organization_id  INTEGER,
      user_id          TEXT    NOT NULL,
      items_list       JSONB   NOT NULL,
      calculated_total NUMERIC(10,2) NOT NULL,
      discount_applied NUMERIC(10,2) NOT NULL DEFAULT 0,
      promo_code       TEXT,
      stripe_session_id TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS pal_org_idx  ON payment_audit_log (organization_id);
    CREATE INDEX IF NOT EXISTS pal_user_idx ON payment_audit_log (user_id);
  `).catch(() => {});

  // Web-Checkout Proxy: track Stripe-hosted checkout sessions for member purchases
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

  initialized = true;
}
