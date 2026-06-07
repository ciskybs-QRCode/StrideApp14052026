/**
 * SignatureService — Digital Proof of Presence
 *
 * Append-only service that writes to two isolated satellite tables:
 *   pickup_records       — the raw pickup event data
 *   verification_hashes  — the SHA-256 integrity hash for each record
 *
 * This service has NO import from any other table module and no write
 * access to children, users, or any pre-existing table.
 */

import { createHash } from "crypto";
import type { Pool } from "pg";

// ── Table bootstrap ─────────────────────────────────────────────────────────

let tablesReady = false;

export async function ensureSignatureTables(pool: Pool): Promise<void> {
  if (tablesReady) return;

  // pickup_records — one row per pick-up event (append-only)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pickup_records (
      id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      pickup_id      UUID        NOT NULL DEFAULT gen_random_uuid(),
      child_id       TEXT        NOT NULL,
      operator_id    TEXT        NOT NULL,
      parent_id      TEXT,
      timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lat            DOUBLE PRECISION,
      lng            DOUBLE PRECISION,
      signature_blob TEXT        NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pr_child_idx    ON pickup_records (child_id);
    CREATE INDEX IF NOT EXISTS pr_operator_idx ON pickup_records (operator_id);
    CREATE INDEX IF NOT EXISTS pr_pickup_idx   ON pickup_records (pickup_id);
  `);

  // verification_hashes — one row per pickup_records row (append-only)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS verification_hashes (
      id         SERIAL      PRIMARY KEY,
      record_id  UUID        NOT NULL REFERENCES pickup_records(id),
      hash_value TEXT        NOT NULL,
      hash_algo  TEXT        NOT NULL DEFAULT 'SHA-256',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS vh_record_idx ON verification_hashes (record_id);
  `);

  tablesReady = true;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface AddRecordInput {
  child_id:       string;
  operator_id:    string;
  parent_id?:     string | null;
  lat?:           number | null;
  lng?:           number | null;
  signature_blob: string;
  /** Optional: caller-supplied pickup session UUID. Auto-generated if omitted. */
  pickup_id?:     string;
}

export interface AddRecordResult {
  recordId:  string;
  pickupId:  string;
  hashValue: string;
  timestamp: string;
}

// ── SignatureService ─────────────────────────────────────────────────────────

export class SignatureService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * addRecord — the only write method this service exposes.
   *
   * Atomically inserts one row into pickup_records and one row into
   * verification_hashes inside a single transaction. The operation is
   * strictly append-only: no UPDATE or DELETE is ever issued.
   *
   * Hash input: SHA-256( timestamp | signature_blob[:300] | child_id )
   */
  async addRecord(data: AddRecordInput): Promise<AddRecordResult> {
    await ensureSignatureTables(this.pool);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Insert the event record
      const { rows: recRows } = await client.query<{
        id:        string;
        pickup_id: string;
        timestamp: string;
      }>(
        `INSERT INTO pickup_records
           (child_id, operator_id, parent_id, lat, lng, signature_blob, pickup_id)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::uuid, gen_random_uuid()))
         RETURNING id, pickup_id, timestamp`,
        [
          data.child_id,
          data.operator_id,
          data.parent_id ?? null,
          data.lat       ?? null,
          data.lng       ?? null,
          data.signature_blob,
          data.pickup_id ?? null,
        ],
      );

      const rec = recRows[0];
      if (!rec) throw new Error("INSERT into pickup_records returned no rows");

      // 2. Compute integrity hash (timestamp + signature snippet + child_id)
      const hashInput = [
        rec.timestamp,
        data.signature_blob.slice(0, 300),
        data.child_id,
      ].join("|");
      const hashValue = createHash("sha256").update(hashInput).digest("hex");

      // 3. Append hash to verification_hashes
      await client.query(
        `INSERT INTO verification_hashes (record_id, hash_value, hash_algo)
         VALUES ($1, $2, 'SHA-256')`,
        [rec.id, hashValue],
      );

      await client.query("COMMIT");

      return {
        recordId:  rec.id,
        pickupId:  rec.pickup_id,
        hashValue,
        timestamp: rec.timestamp,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * verifyRecord — read-only integrity check.
   * Returns true if the stored hash still matches the record data.
   */
  async verifyRecord(recordId: string): Promise<{
    valid:     boolean;
    recordId:  string;
    hashValue: string;
  }> {
    await ensureSignatureTables(this.pool);

    const { rows } = await this.pool.query<{
      id:             string;
      timestamp:      string;
      signature_blob: string;
      child_id:       string;
      hash_value:     string;
    }>(
      `SELECT pr.id, pr.timestamp, pr.signature_blob, pr.child_id, vh.hash_value
       FROM pickup_records pr
       JOIN verification_hashes vh ON vh.record_id = pr.id
       WHERE pr.id = $1
       LIMIT 1`,
      [recordId],
    );

    if (!rows[0]) {
      return { valid: false, recordId, hashValue: "" };
    }

    const r = rows[0];
    const recomputed = createHash("sha256")
      .update([r.timestamp, r.signature_blob.slice(0, 300), r.child_id].join("|"))
      .digest("hex");

    return {
      valid:     recomputed === r.hash_value,
      recordId:  r.id,
      hashValue: r.hash_value,
    };
  }
}
