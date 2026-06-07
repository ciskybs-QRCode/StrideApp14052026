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

  initialized = true;
}
