import { Router } from "express";
import { createHash } from "crypto";
import { pool, ensureTables } from "../lib/pg.js";
import { requireAuth } from "../lib/auth.js";
import { SignatureService } from "../lib/SignatureService.js";
import type { Request, Response } from "express";
import type { TokenPayload } from "../lib/auth.js";

type AuthedRequest = Request & { user: TokenPayload };

const router = Router();

// Singleton — one service instance reuses the shared pool
const signatureService = new SignatureService(pool);

// POST /security/pickup-signature  (any authenticated role — operator or kiosk)
router.post("/security/pickup-signature", requireAuth, async (req: Request, res: Response) => {
  await ensureTables();
  const user = (req as AuthedRequest).user;

  const { child_id, child_name, guardian_name, relationship, lat, lng, signature_blob } = req.body as {
    child_id:       string;
    child_name:     string;
    guardian_name:  string;
    relationship:   string;
    lat:            number | null;
    lng:            number | null;
    signature_blob: string;
  };

  if (!child_id || !signature_blob) {
    res.status(400).json({ error: "child_id and signature_blob are required" });
    return;
  }

  const ts = new Date().toISOString();
  const hashPayload = [ts, String(signature_blob).slice(0, 200), String(lat ?? "0"), String(lng ?? "0")].join("|");
  const integrity_hash = createHash("sha256").update(hashPayload).digest("hex");

  const { rows } = await pool.query<{ pickup_id: string; integrity_hash: string; created_at: string }>(
    `INSERT INTO pickup_signatures
       (child_id, child_name, operator_id, operator_name, guardian_name, relationship,
        lat, lng, signature_blob, integrity_hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING pickup_id, integrity_hash, created_at`,
    [
      child_id, child_name ?? "",
      user.id, user.email,
      guardian_name ?? "", relationship ?? "",
      lat ?? null, lng ?? null,
      signature_blob, integrity_hash,
      new Date(ts),
    ],
  );

  const row = rows[0];
  res.json({ pickupId: row.pickup_id, integrityHash: row.integrity_hash, createdAt: row.created_at });
});

// GET /security/audit-log/:childId  (parent or operator — auth required)
router.get("/security/audit-log/:childId", requireAuth, async (req: Request, res: Response) => {
  await ensureTables();
  const { childId } = req.params;

  const { rows } = await pool.query<{
    pickup_id:    string;
    child_id:     string;
    child_name:   string;
    operator_name: string | null;
    guardian_name: string | null;
    relationship:  string | null;
    lat:           number | null;
    lng:           number | null;
    hash_preview:  string;
    created_at:    string;
  }>(
    `SELECT
       pickup_id, child_id, child_name,
       operator_name, guardian_name, relationship,
       lat, lng,
       LEFT(integrity_hash, 16) AS hash_preview,
       created_at
     FROM pickup_signatures
     WHERE child_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [childId],
  );

  res.json({ records: rows });
});

// ── POST /security/pickup-log ────────────────────────────────────────────────
// Formal add-on endpoint — writes ONLY to pickup_records + verification_hashes.
// Has zero write access to children, users, or any pre-existing table.
router.post("/security/pickup-log", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthedRequest).user;

  const { child_id, parent_id, lat, lng, signature_blob, pickup_id } = req.body as {
    child_id:       string;
    parent_id?:     string;
    lat?:           number | null;
    lng?:           number | null;
    signature_blob: string;
    pickup_id?:     string;
  };

  if (!child_id || !signature_blob) {
    res.status(400).json({ error: "child_id and signature_blob are required" });
    return;
  }

  const result = await signatureService.addRecord({
    child_id,
    operator_id:    user.id,
    parent_id:      parent_id ?? null,
    lat:            lat       ?? null,
    lng:            lng       ?? null,
    signature_blob,
    pickup_id,
  });

  res.status(201).json(result);
});

// ── GET /security/pickup-log/verify/:recordId ────────────────────────────────
// Read-only integrity check — recomputes the hash and confirms it matches.
router.get("/security/pickup-log/verify/:recordId", requireAuth, async (req: Request, res: Response) => {
  const recordId = String(req.params.recordId);
  const check = await signatureService.verifyRecord(recordId);
  res.json(check);
});

export default router;
