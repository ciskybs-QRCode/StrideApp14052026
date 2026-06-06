import { Router } from "express";
import multer from "multer";
import { parse as csvParse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { logAction } from "../lib/audit.js";
import { importLimiter } from "../lib/rate-limit.js";
import { internalError } from "../lib/validate.js";
import type { Request } from "express";

type AuthReq = Request & { user: TokenPayload };

const router = Router();

// ── Multer: in-memory, 5 MB cap, CSV / XLSX only ────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = [
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain", // some clients send CSV as text/plain
    ];
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    if (allowed.includes(file.mimetype) || ext === "csv" || ext === "xlsx" || ext === "xls") {
      cb(null, true);
    } else {
      cb(new Error("Only CSV and XLSX files are accepted"));
    }
  },
});

// ── Column name normaliser ───────────────────────────────────────────────────
const EMAIL_ALIASES      = ["email", "e-mail", "email address", "emailaddress"];
const FIRST_NAME_ALIASES = ["first_name", "firstname", "first name", "given name", "givenname", "given_name"];
const LAST_NAME_ALIASES  = ["last_name", "lastname", "last name", "surname", "family name", "familyname", "family_name"];
const DOB_ALIASES        = ["date_of_birth", "dob", "date of birth", "birthday", "birth_date", "birthdate"];
const PHONE_ALIASES      = ["phone", "phone_number", "phonenumber", "phone number", "mobile", "contact"];
const ROLE_ALIASES       = ["role", "user_role", "userrole", "member_role", "memberrole"];

function normaliseHeaders(raw: Record<string, unknown>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.trim().toLowerCase();
    const val = typeof v === "string" ? v.trim() : v !== null && v !== undefined ? String(v).trim() : undefined;
    if (EMAIL_ALIASES.includes(key))       out["email"]         = val;
    else if (FIRST_NAME_ALIASES.includes(key)) out["first_name"]= val;
    else if (LAST_NAME_ALIASES.includes(key))  out["last_name"] = val;
    else if (DOB_ALIASES.includes(key))        out["date_of_birth"] = val;
    else if (PHONE_ALIASES.includes(key))      out["phone"]     = val;
    else if (ROLE_ALIASES.includes(key))       out["role"]      = val;
  }
  return out;
}

// ── Row validation ───────────────────────────────────────────────────────────
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE    = /^\d{4}-\d{2}-\d{2}$/;
const VALID_ROLES = ["parent", "operator", "admin"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

interface ValidRow {
  email: string;
  first_name: string;
  last_name: string;
  role: ValidRole;
  date_of_birth?: string;
  phone?: string;
}

interface RowError {
  row: number;
  email?: string;
  errors: string[];
}

function validateRow(row: Record<string, string | undefined>, idx: number): { valid: ValidRow } | { error: RowError } {
  const errors: string[] = [];
  const email      = row["email"]?.toLowerCase();
  const first_name = row["first_name"];
  const last_name  = row["last_name"];
  const dob        = row["date_of_birth"];
  const phone      = row["phone"];
  const rawRole    = row["role"]?.toLowerCase() as ValidRole | undefined;
  const role: ValidRole = VALID_ROLES.includes(rawRole as ValidRole) ? (rawRole as ValidRole) : "parent";

  if (!email || !EMAIL_RE.test(email)) errors.push("Missing or invalid email");
  if (!first_name)                      errors.push("Missing first_name");
  if (!last_name)                       errors.push("Missing last_name");
  if (dob && !DATE_RE.test(dob))        errors.push(`date_of_birth must be YYYY-MM-DD, got "${dob}"`);
  if (rawRole && !VALID_ROLES.includes(rawRole)) {
    errors.push(`role must be one of: ${VALID_ROLES.join(", ")}, got "${rawRole}"`);
  }

  if (errors.length) return { error: { row: idx + 1, email, errors } };
  return {
    valid: {
      email:         email as string,
      first_name:    first_name as string,
      last_name:     last_name as string,
      role,
      ...(dob   ? { date_of_birth: dob }   : {}),
      ...(phone ? { phone }                : {}),
    },
  };
}

// ── Parser: buffer → raw row objects ────────────────────────────────────────
function parseBuffer(
  buffer: Buffer,
  mimetype: string,
  originalname: string,
): Record<string, unknown>[] {
  const ext = originalname.split(".").pop()?.toLowerCase();

  if (mimetype === "text/csv" || mimetype === "application/csv" || mimetype === "text/plain" || ext === "csv") {
    return csvParse(buffer, {
      columns: true,       // first row as header
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, unknown>[];
  }

  // XLSX / XLS
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("XLSX file contains no sheets");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

// ── POST /api/identity/import ────────────────────────────────────────────────
router.post(
  "/identity/import",
  requireAuth,
  requireRole("admin", "operator"),
  importLimiter,
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        res.status(400).json({ error: `Upload error: ${err.message}` });
        return;
      }
      if (err instanceof Error) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const user = (req as AuthReq).user;
    const dryRun = req.query["dryRun"] === "true" || req.query["dry_run"] === "true";

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded. Send a multipart/form-data request with a `file` field." });
      return;
    }

    // ── 1. Parse ─────────────────────────────────────────────────────────────
    let rawRows: Record<string, unknown>[];
    try {
      rawRows = parseBuffer(req.file.buffer, req.file.mimetype, req.file.originalname);
    } catch (parseErr) {
      res.status(422).json({ error: `Could not parse file: ${(parseErr as Error).message}` });
      return;
    }

    if (rawRows.length === 0) {
      res.status(422).json({ error: "File is empty or has no data rows." });
      return;
    }

    if (rawRows.length > 2000) {
      res.status(422).json({ error: "Batch size limit is 2 000 rows. Split the file and upload in chunks." });
      return;
    }

    // ── 2. Normalise headers & validate rows ─────────────────────────────────
    const validRows: ValidRow[] = [];
    const rowErrors: RowError[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const normalised = normaliseHeaders(rawRows[i] as Record<string, unknown>);
      const result = validateRow(normalised, i);
      if ("error" in result) {
        rowErrors.push(result.error);
      } else {
        validRows.push(result.valid);
      }
    }

    const summary = {
      total:  rawRows.length,
      valid:  validRows.length,
      errors: rowErrors.length,
      filename: req.file.originalname,
    };

    // ── 3. Dry run or validation errors → return report without writing ──────
    if (dryRun || rowErrors.length > 0) {
      logAction({
        userId:        user.id,
        action:        "IMPORT_DRY_RUN",
        tableAffected: "global_users",
        details: {
          ...summary,
          dryRun,
          rowErrors,
          orgId: user.orgId,
        },
      });

      res.status(rowErrors.length > 0 ? 422 : 200).json({
        dryRun: true,
        summary,
        validationErrors: rowErrors,
        ...(rowErrors.length === 0 ? { message: "Dry run passed — no errors found. Re-submit without ?dryRun=true to commit." } : {}),
      });
      return;
    }

    // ── 4. Batch upsert global_users ─────────────────────────────────────────
    const globalUserPayloads = validRows.map((r) => ({
      email:      r.email,
      first_name: r.first_name,
      last_name:  r.last_name,
    }));

    const { data: upsertedUsers, error: upsertErr } = await supabaseAdmin
      .from("global_users")
      .upsert(globalUserPayloads, { onConflict: "email", ignoreDuplicates: false })
      .select("id, email");

    if (upsertErr) {
      internalError(res, upsertErr, "identity/import:global_users-upsert", user.id);
      return;
    }

    // Build email → id map from upserted rows
    const emailToId = new Map<string, number>(
      (upsertedUsers ?? []).map((u) => [u.email as string, u.id as number]),
    );

    // For any email not returned by upsert (already-existed rows Supabase may omit),
    // fetch them explicitly
    const missingEmails = validRows
      .map((r) => r.email)
      .filter((e) => !emailToId.has(e));

    if (missingEmails.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from("global_users")
        .select("id, email")
        .in("email", missingEmails);
      for (const u of existing ?? []) {
        emailToId.set(u.email as string, u.id as number);
      }
    }

    // ── 5. Batch upsert tenant_memberships ───────────────────────────────────
    const membershipPayloads = validRows.flatMap((r) => {
      const globalUserId = emailToId.get(r.email);
      if (!globalUserId) return [];
      return [{
        global_user_id:  globalUserId,
        organization_id: user.orgId,
        role:            r.role,
        status:          "active" as const,
        activated_at:    new Date().toISOString(),
      }];
    });

    const { error: membershipErr } = await supabaseAdmin
      .from("tenant_memberships")
      .upsert(membershipPayloads, {
        onConflict: "global_user_id,organization_id",
        ignoreDuplicates: false,
      });

    if (membershipErr) {
      internalError(res, membershipErr, "identity/import:memberships-upsert", user.id);
      return;
    }

    // ── 6. Upsert tenant_specific_data (optional fields) ─────────────────────
    const tenantDataPayloads = validRows.flatMap((r) => {
      const globalUserId = emailToId.get(r.email);
      if (!globalUserId) return [];
      if (!r.date_of_birth && !r.phone) return [];
      const payload: Record<string, unknown> = {
        global_user_id:  globalUserId,
        organization_id: user.orgId,
      };
      if (r.date_of_birth) payload["date_of_birth"] = r.date_of_birth;
      if (r.phone)         payload["phone"]         = r.phone;
      return [payload];
    });

    if (tenantDataPayloads.length > 0) {
      await supabaseAdmin
        .from("tenant_specific_data")
        .upsert(tenantDataPayloads, { onConflict: "global_user_id,organization_id" });
    }

    // ── 7. Audit log ─────────────────────────────────────────────────────────
    logAction({
      userId:        user.id,
      action:        "IMPORT",
      tableAffected: "global_users,tenant_memberships",
      details: {
        ...summary,
        imported: membershipPayloads.length,
        orgId:    user.orgId,
        filename: req.file.originalname,
      },
    });

    const imported = membershipPayloads.length;
    const skipped  = validRows.length - imported;

    res.status(200).json({
      dryRun: false,
      summary: {
        ...summary,
        imported,
        skipped,
      },
      members: (upsertedUsers ?? []).map((u) => ({ id: u.id, email: u.email })),
    });
  },
);

export default router;
