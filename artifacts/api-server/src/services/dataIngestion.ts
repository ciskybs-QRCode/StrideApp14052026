/**
 * dataIngestion.ts
 * Parses CSV / XLSX buffers into typed MemberEntry records and generates
 * cross-check reports against an existing member list.
 *
 * No UI, no network I/O — pure data transformation and reporting.
 */

import * as XLSX from "xlsx";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Dependant {
  name: string;
  surname: string;
  /** ISO 8601 date string (YYYY-MM-DD) or empty string when not provided. */
  dateOfBirth: string;
}

export type MemberStatus = "pending" | "active" | "suspended" | "expired";

export interface MemberEntry {
  name: string;
  surname: string;
  email: string;
  dependants: Dependant[];
  status: MemberStatus;
}

// ── Cross-check types ─────────────────────────────────────────────────────────

/** A member present in the import file but absent from the existing list. */
export interface MissingProfile {
  kind: "missing_profile";
  email: string;
  name: string;
  surname: string;
}

/** An email that appears more than once in the imported file. */
export interface DuplicateEmail {
  kind: "duplicate_email";
  email: string;
  occurrences: number;
}

/** A member present in the existing list but absent from the import file. */
export interface OrphanedRecord {
  kind: "orphaned_record";
  email: string;
  name: string;
  surname: string;
  status: MemberStatus;
}

/** An email whose imported record contains more than one dependant. */
export interface MultipleDependants {
  kind: "multiple_dependants";
  email: string;
  dependantCount: number;
  dependants: Dependant[];
}

export type Discrepancy =
  | MissingProfile
  | DuplicateEmail
  | OrphanedRecord
  | MultipleDependants;

export interface CrossCheckResult {
  /** Total members in the existing list. */
  existingCount: number;
  /** Total members parsed from the import file. */
  importedCount: number;
  /** Members present in both lists (matched on normalised email). */
  matchedCount: number;
  /** All detected discrepancies, typed by `kind`. */
  discrepancies: Discrepancy[];
  /** Whether any discrepancies were found. */
  hasDiscrepancies: boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Normalise an email for consistent comparison. */
function normaliseEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

/** Coerce a raw cell value to a trimmed string. */
function str(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim();
}

/** Accepted column aliases → canonical field names. */
const COLUMN_ALIASES: Record<string, keyof RawRow> = {
  // name
  name: "name",
  "first name": "name",
  "given name": "name",
  firstname: "name",
  // surname
  surname: "surname",
  "last name": "surname",
  "family name": "surname",
  lastname: "surname",
  // email
  email: "email",
  "email address": "email",
  "e-mail": "email",
  // dependant name
  "dependant name": "dependant_name",
  "dependent name": "dependant_name",
  dep_name: "dependant_name",
  // dependant surname
  "dependant surname": "dependant_surname",
  "dependent surname": "dependant_surname",
  dep_surname: "dependant_surname",
  // dependant dob
  "dependant dob": "dependant_dob",
  "dependent dob": "dependant_dob",
  dob: "dependant_dob",
  dep_dob: "dependant_dob",
  "date of birth": "dependant_dob",
  // status
  status: "status",
};

interface RawRow {
  name: string;
  surname: string;
  email: string;
  dependant_name: string;
  dependant_surname: string;
  dependant_dob: string;
  status: string;
}

/**
 * Map a raw header string to its canonical field name.
 * Returns `null` when the header is not recognised.
 */
function mapHeader(header: string): keyof RawRow | null {
  const key = header.trim().toLowerCase();
  return COLUMN_ALIASES[key] ?? null;
}

/** Parse a raw ISO date string or Excel serial date to YYYY-MM-DD. */
function parseDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";

  // Excel serial number
  if (typeof raw === "number") {
    const date = XLSX.SSF.parse_date_code(raw);
    if (!date) return "";
    const y = String(date.y).padStart(4, "0");
    const m = String(date.m).padStart(2, "0");
    const d = String(date.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const s = str(raw);
  // Already looks like YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try to parse other date strings via Date
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return s; // return as-is if unparseable
}

/**
 * Convert an XLSX sheet to an array of typed row objects.
 * Each spreadsheet row whose `email` field is non-empty becomes a RawRow.
 */
function sheetToRawRows(sheet: XLSX.WorkSheet): RawRow[] {
  const jsonRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: true,
  });

  if (jsonRows.length === 0) return [];

  // Build a header mapping from the first row's keys
  const firstRowKeys = Object.keys(jsonRows[0]);
  const headerMap = new Map<string, keyof RawRow>();
  for (const key of firstRowKeys) {
    const canonical = mapHeader(key);
    if (canonical) headerMap.set(key, canonical);
  }

  return jsonRows
    .map((row): RawRow => {
      const out: RawRow = {
        name: "",
        surname: "",
        email: "",
        dependant_name: "",
        dependant_surname: "",
        dependant_dob: "",
        status: "",
      };
      for (const [rawKey, canonicalKey] of headerMap) {
        if (canonicalKey === "dependant_dob") {
          out[canonicalKey] = parseDate(row[rawKey]);
        } else {
          out[canonicalKey] = str(row[rawKey]);
        }
      }
      return out;
    })
    .filter((r) => normaliseEmail(r.email) !== "");
}

/**
 * Validate a MemberStatus string, defaulting to "pending".
 */
function toStatus(raw: string): MemberStatus {
  const valid: MemberStatus[] = ["pending", "active", "suspended", "expired"];
  const lower = raw.toLowerCase() as MemberStatus;
  return valid.includes(lower) ? lower : "pending";
}

/**
 * Collapse multiple rows that share the same email into a single MemberEntry,
 * accumulating dependants from each row.
 */
function collapseRows(rows: RawRow[]): MemberEntry[] {
  const byEmail = new Map<string, MemberEntry>();

  for (const row of rows) {
    const email = normaliseEmail(row.email);
    if (!email) continue;

    let entry = byEmail.get(email);
    if (!entry) {
      entry = {
        name: row.name,
        surname: row.surname,
        email,
        dependants: [],
        status: toStatus(row.status),
      };
      byEmail.set(email, entry);
    }

    // Attach a dependant if this row carries dependant data
    const depName = row.dependant_name;
    const depSurname = row.dependant_surname;
    if (depName || depSurname) {
      entry.dependants.push({
        name: depName,
        surname: depSurname,
        dateOfBirth: row.dependant_dob,
      });
    }
  }

  return Array.from(byEmail.values());
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a CSV or XLSX file buffer into an array of `MemberEntry` records.
 *
 * - All new entries receive `status: "pending"` unless the file provides one.
 * - Multiple rows sharing the same email are collapsed into one entry with
 *   multiple dependants.
 * - Rows with missing or invalid emails are silently skipped.
 *
 * @throws {Error} if the buffer cannot be parsed as a valid workbook.
 */
export function processDataFile(fileBuffer: Buffer): MemberEntry[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: false });
  } catch (err) {
    throw new Error(
      `dataIngestion: failed to parse workbook — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("dataIngestion: workbook contains no sheets");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = sheetToRawRows(sheet);
  return collapseRows(rawRows);
}

/**
 * Compare an existing member list against an imported one and surface
 * discrepancies as a structured `CrossCheckResult`.
 *
 * Detected discrepancy kinds:
 * - `missing_profile`    — email in import but not in existing list
 * - `duplicate_email`    — email appears more than once in the import file's
 *                          raw input (detected via pre-collapse occurrence map)
 * - `orphaned_record`    — email in existing list but absent from import
 * - `multiple_dependants`— a single imported member has more than one dependant
 */
export function generateCrossCheckReport(
  existingMembers: MemberEntry[],
  importedMembers: MemberEntry[],
): CrossCheckResult {
  const existingByEmail = new Map<string, MemberEntry>(
    existingMembers.map((m) => [normaliseEmail(m.email), m]),
  );
  const importedByEmail = new Map<string, MemberEntry>(
    importedMembers.map((m) => [normaliseEmail(m.email), m]),
  );

  const discrepancies: Discrepancy[] = [];

  // ── missing profiles: in import but not in existing ──
  for (const [email, imported] of importedByEmail) {
    if (!existingByEmail.has(email)) {
      discrepancies.push({
        kind: "missing_profile",
        email,
        name: imported.name,
        surname: imported.surname,
      });
    }
  }

  // ── duplicate emails within the imported set ──
  // (importedMembers may already be collapsed; surface any that were collapsed)
  const emailOccurrences = new Map<string, number>();
  for (const member of importedMembers) {
    const key = normaliseEmail(member.email);
    emailOccurrences.set(key, (emailOccurrences.get(key) ?? 0) + 1);
  }
  for (const [email, count] of emailOccurrences) {
    if (count > 1) {
      discrepancies.push({
        kind: "duplicate_email",
        email,
        occurrences: count,
      });
    }
  }

  // ── multiple dependants ──
  for (const [email, member] of importedByEmail) {
    if (member.dependants.length > 1) {
      discrepancies.push({
        kind: "multiple_dependants",
        email,
        dependantCount: member.dependants.length,
        dependants: member.dependants,
      });
    }
  }

  // ── orphaned records: in existing but absent from import ──
  for (const [email, existing] of existingByEmail) {
    if (!importedByEmail.has(email)) {
      discrepancies.push({
        kind: "orphaned_record",
        email,
        name: existing.name,
        surname: existing.surname,
        status: existing.status,
      });
    }
  }

  const matchedCount = [...importedByEmail.keys()].filter((e) =>
    existingByEmail.has(e),
  ).length;

  return {
    existingCount: existingMembers.length,
    importedCount: importedMembers.length,
    matchedCount,
    discrepancies,
    hasDiscrepancies: discrepancies.length > 0,
  };
}
