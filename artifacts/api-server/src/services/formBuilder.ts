/**
 * formBuilder.ts
 * Dynamic form schema retrieval and submission validation.
 *
 * Pure data-layer utilities — no UI, no network I/O.
 * Consumable by both web and mobile form renderers.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FieldType = "text" | "number" | "date" | "file";

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  isRequired: boolean;
  isMedical: boolean;
}

/**
 * Per-field validation result. Included in the detailed report returned by
 * `validateSubmissionDetailed` — useful for surfacing field-level errors in UIs.
 */
export interface FieldValidationError {
  fieldId: string;
  label: string;
  reason: "missing_required" | "type_mismatch";
  expected: FieldType;
  received: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: FieldValidationError[];
}

// ── Mock database ─────────────────────────────────────────────────────────────

/**
 * Baseline fields shared by all organisations.
 * Extended or overridden by per-org configuration below.
 */
const BASE_SCHEMA: FormField[] = [
  { id: "first_name",   label: "First Name",   type: "text",   isRequired: true,  isMedical: false },
  { id: "last_name",    label: "Last Name",    type: "text",   isRequired: true,  isMedical: false },
  { id: "email",        label: "Email",        type: "text",   isRequired: true,  isMedical: false },
  { id: "date_of_birth",label: "Date of Birth",type: "date",   isRequired: false, isMedical: false },
  { id: "phone",        label: "Phone Number", type: "text",   isRequired: false, isMedical: false },
];

/**
 * Organisation-specific field overrides / additions.
 *
 * In production this would be loaded from the database (e.g. a
 * `org_form_config` table).  The mock entries here illustrate the
 * variability that `getFormSchema` must handle.
 */
const ORG_SCHEMAS: Record<string, FormField[]> = {
  // Sports / fitness club — medical fields required
  "org-sports": [
    ...BASE_SCHEMA,
    { id: "emergency_contact", label: "Emergency Contact Name",  type: "text",   isRequired: true,  isMedical: false },
    { id: "emergency_phone",   label: "Emergency Contact Phone", type: "text",   isRequired: true,  isMedical: false },
    { id: "medical_notes",     label: "Medical Notes",           type: "text",   isRequired: false, isMedical: true  },
    { id: "allergies",         label: "Allergies",               type: "text",   isRequired: false, isMedical: true  },
    { id: "insurance_doc",     label: "Insurance Document",      type: "file",   isRequired: false, isMedical: true  },
  ],

  // Dance school — age and consent doc
  "org-dance": [
    ...BASE_SCHEMA,
    { id: "age",               label: "Age",                     type: "number", isRequired: true,  isMedical: false },
    { id: "consent_doc",       label: "Parent Consent Form",     type: "file",   isRequired: true,  isMedical: false },
    { id: "medical_notes",     label: "Medical Notes",           type: "text",   isRequired: false, isMedical: true  },
  ],

  // Generic / default — only base fields
  "org-default": BASE_SCHEMA,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Retrieve the form schema for a given organisation.
 *
 * Falls back to the base schema when no specific configuration is found.
 * Returns a new array each call so callers cannot mutate the mock database.
 *
 * @param orgId - The organisation identifier (e.g. "org-sports").
 */
export function getFormSchema(orgId: string): FormField[] {
  const schema = ORG_SCHEMAS[orgId] ?? BASE_SCHEMA;
  return schema.map((f) => ({ ...f })); // shallow clone — prevent mutation
}

// ── Validation helpers ────────────────────────────────────────────────────────

/** Registered type guards. Return `true` when the value is acceptable. */
const TYPE_GUARDS: Record<FieldType, (v: unknown) => boolean> = {
  text(v) {
    return typeof v === "string" && v.trim().length > 0;
  },
  number(v) {
    if (typeof v === "number") return isFinite(v);
    if (typeof v === "string" && v.trim() !== "") return isFinite(Number(v));
    return false;
  },
  date(v) {
    if (typeof v !== "string" || v.trim() === "") return false;
    // Accept ISO 8601 date strings (YYYY-MM-DD) or parseable date strings
    const d = new Date(v);
    return !isNaN(d.getTime());
  },
  file(v) {
    // A file field may arrive as a non-empty string (path / URL / base64 prefix),
    // a Buffer, or any object — just check it is non-null / non-empty.
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true; // Buffer, File object, etc.
  },
};

/** Return a human-readable type description for error reporting. */
function describeValue(v: unknown): string {
  if (v === null)      return "null";
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * Validate a form submission against a schema and return a detailed result.
 *
 * Rules applied per field:
 *  1. If `isRequired` and the field is absent or empty → `missing_required`
 *  2. If the field is present and its value fails the type guard → `type_mismatch`
 *  3. Optional fields that are absent are silently accepted.
 *
 * @param submission - Raw key-value map from the form renderer.
 * @param schema     - The `FormField[]` returned by `getFormSchema`.
 */
export function validateSubmissionDetailed(
  submission: Record<string, unknown>,
  schema: FormField[],
): ValidationResult {
  const errors: FieldValidationError[] = [];

  for (const field of schema) {
    const raw = submission[field.id];
    const isPresent = raw !== undefined && raw !== null && raw !== "";

    if (!isPresent) {
      if (field.isRequired) {
        errors.push({
          fieldId: field.id,
          label: field.label,
          reason: "missing_required",
          expected: field.type,
          received: describeValue(raw),
        });
      }
      // Optional + absent → fine
      continue;
    }

    if (!TYPE_GUARDS[field.type](raw)) {
      errors.push({
        fieldId: field.id,
        label: field.label,
        reason: "type_mismatch",
        expected: field.type,
        received: describeValue(raw),
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Simple boolean guard — returns `true` only when the submission is fully valid.
 *
 * Suitable for quick checks in route handlers. Use `validateSubmissionDetailed`
 * when field-level error messages are needed (e.g. in form UIs).
 *
 * @param submission - Raw key-value map from the form renderer.
 * @param schema     - The `FormField[]` returned by `getFormSchema`.
 */
export function validateSubmission(
  submission: Record<string, unknown>,
  schema: FormField[],
): boolean {
  return validateSubmissionDetailed(submission, schema).valid;
}
