import bcrypt from "bcryptjs";
import { logger } from "./logger.js";
import { pool } from "./pg.js";
import { supabase } from "./supabase.js";

const MASTER_EMAIL = "ciskybs@gmail.com";
const DEFAULT_ORG_ID = 1;

const TEST_ACCOUNTS: ReadonlyArray<{
  name: string;
  email: string;
  password: string;
  role: string;
}> = [
  { name: "Admin",    email: "admin@test.com",    password: "test123", role: "admin"    },
  { name: "Operator", email: "operator@test.com", password: "test123", role: "operator" },
  { name: "Member",   email: "member@test.com",   password: "test123", role: "parent"   },
  { name: "Kiosk",    email: "kiosk@test.com",    password: "test123", role: "kiosk"    },
];

const DEFAULT_GATEWAYS = [
  { type: "stripe",        label: "Stripe",       enabled: false, sort_order: 0 },
  { type: "paypal",        label: "PayPal",        enabled: false, sort_order: 1 },
  { type: "bank_transfer", label: "Bank Transfer", enabled: false, sort_order: 2 },
];

async function ensurePlatformTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_org_discounts (
      org_id                INTEGER PRIMARY KEY,
      discount_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,
      discount_duration_end TIMESTAMPTZ,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS super_admin_collaborators (
      id          SERIAL PRIMARY KEY,
      email       TEXT NOT NULL UNIQUE,
      added_by    TEXT NOT NULL DEFAULT 'system',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS platform_payment_gateways (
      id          SERIAL PRIMARY KEY,
      type        TEXT NOT NULL,
      label       TEXT NOT NULL,
      enabled     BOOLEAN DEFAULT FALSE,
      config      JSONB NOT NULL DEFAULT '{}',
      sort_order  INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS platform_events (
      id          SERIAL PRIMARY KEY,
      event_type  TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT,
      payload     JSONB DEFAULT '{}',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'platform_payment_gateways_type_key'
      ) THEN
        ALTER TABLE platform_payment_gateways
        ADD CONSTRAINT platform_payment_gateways_type_key UNIQUE (type);
      END IF;
    END $$;
  `).catch(() => {});

  logger.info("[seed] Platform tables verified/created");
}

async function ensureDefaultOrg(): Promise<void> {
  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", DEFAULT_ORG_ID)
    .maybeSingle();

  if (existing) return;

  const trialEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("organizations").insert({
    id:                  DEFAULT_ORG_ID,
    name:                "Stride Platform",
    trial_ends_at:       trialEnd,
    subscription_status: "trialing",
  });
  if (error && error.code !== "23505") {
    logger.warn({ err: error.message }, "[seed] ensureDefaultOrg insert failed (non-critical)");
    return;
  }
  logger.info("[seed] Default organization (id=1) verified");
}

async function ensureTestAccounts(): Promise<void> {
  for (const acct of TEST_ACCOUNTS) {
    try {
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .ilike("email", acct.email)
        .maybeSingle();

      if (existing) continue;

      const hash = await bcrypt.hash(acct.password, 10);
      const { error } = await supabase.from("users").insert({
        name:            acct.name,
        email:           acct.email.toLowerCase(),
        password_hash:   hash,
        role:            acct.role,
        organization_id: DEFAULT_ORG_ID,
      });

      if (error) {
        logger.warn({ email: acct.email, err: error.message }, "[seed] Test account insert failed");
      } else {
        logger.info({ email: acct.email, role: acct.role }, "[seed] Test account created");
      }
    } catch (e) {
      logger.warn({ email: acct.email, err: (e as Error).message }, "[seed] Test account skipped");
    }
  }
}

async function ensureMasterCollaborator(): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM super_admin_collaborators WHERE lower(email) = lower($1) LIMIT 1`,
      [MASTER_EMAIL],
    );
    if (rows.length > 0) return;

    await pool.query(
      `INSERT INTO super_admin_collaborators (email, added_by)
       VALUES ($1, 'system')
       ON CONFLICT (email) DO NOTHING`,
      [MASTER_EMAIL],
    );
    logger.info({ email: MASTER_EMAIL }, "[seed] Master super_admin collaborator registered");
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[seed] ensureMasterCollaborator skipped");
  }
}

async function ensureDefaultGateways(): Promise<void> {
  try {
    for (const gw of DEFAULT_GATEWAYS) {
      await pool.query(
        `INSERT INTO platform_payment_gateways (type, label, enabled, config, sort_order)
         VALUES ($1, $2, $3, '{}', $4)
         ON CONFLICT (type) DO NOTHING`,
        [gw.type, gw.label, gw.enabled, gw.sort_order],
      );
    }
    logger.info({ count: DEFAULT_GATEWAYS.length }, "[seed] Default payment gateways verified");
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[seed] ensureDefaultGateways skipped");
  }
}

export async function runSeed(): Promise<void> {
  logger.info("[seed] Starting platform initialization...");

  try { await ensurePlatformTables(); } catch (e) {
    logger.warn({ err: (e as Error).message }, "[seed] ensurePlatformTables failed");
  }
  try { await ensureDefaultOrg(); } catch (e) {
    logger.warn({ err: (e as Error).message }, "[seed] ensureDefaultOrg failed");
  }
  try { await ensureTestAccounts(); } catch (e) {
    logger.warn({ err: (e as Error).message }, "[seed] ensureTestAccounts failed");
  }
  try { await ensureMasterCollaborator(); } catch (e) {
    logger.warn({ err: (e as Error).message }, "[seed] ensureMasterCollaborator failed");
  }
  try { await ensureDefaultGateways(); } catch (e) {
    logger.warn({ err: (e as Error).message }, "[seed] ensureDefaultGateways failed");
  }

  logger.info("[seed] Platform initialization complete");
}
