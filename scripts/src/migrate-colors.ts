/**
 * migrate-colors.ts — pass 3
 *
 * Handles remaining residual patterns after pass 1+2:
 *
 * A. Alpha-hex variants: "#1E3A8A12" → colors.primary + "12"  (not possible in RN)
 *    → Replace with `${colors.primary}12` using template syntax, OR
 *    → Keep as-is if inside a template literal (HTML)
 *    → For RN inline styles: use `colors.primary + "12"` notation
 *
 * B. thumbColor="#1E3A8A" / thumbColor="#FBBF24" (Switch component)
 *    → thumbColor={colors.primary}
 *
 * C. trackColor={{ true: "#1E3A8A" }}
 *    → trackColor={{ true: colors.primary }}
 *
 * D. Template literal HTML/CSS strings (invoicing, checkout webview)
 *    → These are server-rendered HTML; replace with ${} interpolation
 *    → colors.primary is available in scope for these files
 *
 * Files skipped: same as before + app-customization.tsx
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const APP_DIR  = path.resolve(__dirname, "../../artifacts/stride-app/app");
const COMP_DIR = path.resolve(__dirname, "../../artifacts/stride-app/components");

const SKIP = new Set([
  "app-customization.tsx",
  "colors.ts", "Colors.ts",
  "useColors.ts",
  "BrandingContext.tsx",
  "PdfBadgeGenerator.tsx",
]);

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    if ((e.name.endsWith(".tsx") || e.name.endsWith(".ts")) && !SKIP.has(e.name)) return [full];
    return [];
  });
}

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}
function hasHardcoded(src: string): boolean {
  const s = stripComments(src);
  return s.includes(NAVY) || s.includes(GOLD);
}

function ensureImport(src: string): string {
  if (/useColors/.test(src)) return src;
  const importRe = /^import\s.+$/gm;
  let last: RegExpExecArray | null = null, m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) !== null) last = m;
  if (!last || last.index === undefined) return src;
  const at = last.index + last[0].length;
  return src.slice(0, at) + `\nimport { useColors } from "@/hooks/useColors";` + src.slice(at);
}

function ensureHookCall(src: string): string {
  if (/const\s+colors\s*=\s*useColors\(\)/.test(src)) return src;
  const m = /export\s+default\s+function\s+\w+[^{]*\{/.exec(src);
  if (m && m.index !== undefined) {
    const at = m.index + m[0].length;
    return src.slice(0, at) + `\n  const colors = useColors();` + src.slice(at);
  }
  return src;
}

function migrate(src: string): string {
  const before = src;

  // ── A. thumbColor prop ────────────────────────────────────────────────────
  src = src.replace(/thumbColor="#1E3A8A"/g, "thumbColor={colors.primary}");
  src = src.replace(/thumbColor="#FBBF24"/g, "thumbColor={colors.secondary}");
  src = src.replace(/thumbColor='#1E3A8A'/g, "thumbColor={colors.primary}");
  src = src.replace(/thumbColor='#FBBF24'/g, "thumbColor={colors.secondary}");

  // ── B. trackColor={{ true: "#1E3A8A" }} ──────────────────────────────────
  src = src.replace(/trackColor=\{\{ true: "#1E3A8A" \}\}/g, 'trackColor={{ true: colors.primary }}');
  src = src.replace(/trackColor=\{\{ true: "#FBBF24" \}\}/g, 'trackColor={{ true: colors.secondary }}');

  // ── C. Alpha hex in RN inline styles (NOT in template literals) ────────────
  // "#1E3A8A12" inside JS object literals → colors.primary + "12"
  // These appear as: backgroundColor: "#1E3A8A12"
  // We do a careful replacement: only outside template literals
  // Split by template literals
  const segments: Array<{ text: string; isTemplate: boolean }> = [];
  let i = 0, current = "", inTemplate = 0;
  while (i < src.length) {
    if (src[i] === "`" && inTemplate === 0) {
      if (current) segments.push({ text: current, isTemplate: false });
      current = "`";
      i++; inTemplate = 1;
    } else if (inTemplate > 0) {
      current += src[i];
      if (src[i] === "`" && src[i-1] !== "\\") {
        inTemplate--;
        if (inTemplate === 0) { segments.push({ text: current, isTemplate: true }); current = ""; }
      } else if (src[i] === "$" && src[i+1] === "{") inTemplate++;
      else if (src[i] === "}" && inTemplate > 1) inTemplate--;
      i++;
    } else { current += src[i]; i++; }
  }
  if (current) segments.push({ text: current, isTemplate: false });

  src = segments.map(seg => {
    if (seg.isTemplate) {
      // Inside template literals (HTML strings) — replace with ${} interpolation
      let t = seg.text;
      t = t.replace(/#1E3A8A/g, "${colors.primary}");
      t = t.replace(/#FBBF24/g, "${colors.secondary}");
      return t;
    }
    // Outside template literals — replace alpha-hex variants
    let t = seg.text;
    // "#1E3A8A" + alpha suffix (12, 15, 18, 20, 25, 30, 40, etc.)
    t = t.replace(/"#1E3A8A([0-9A-Fa-f]{2})"/g, "(colors.primary + \"$1\")");
    t = t.replace(/'#1E3A8A([0-9A-Fa-f]{2})'/g, "(colors.primary + \"$1\")");
    t = t.replace(/"#FBBF24([0-9A-Fa-f]{2})"/g, "(colors.secondary + \"$1\")");
    t = t.replace(/'#FBBF24([0-9A-Fa-f]{2})'/g, "(colors.secondary + \"$1\")");
    // Remaining plain hex (should be rare after pass 1+2)
    t = t.replace(/"#1E3A8A"/g, "colors.primary");
    t = t.replace(/'#1E3A8A'/g, "colors.primary");
    t = t.replace(/"#FBBF24"/g, "colors.secondary");
    t = t.replace(/'#FBBF24'/g, "colors.secondary");
    return t;
  }).join("");

  if (src !== before && (src.includes("colors.primary") || src.includes("colors.secondary"))) {
    src = ensureImport(src);
    src = ensureHookCall(src);
  }
  return src;
}

// ─── Run ──────────────────────────────────────────────────────────────────────
const files = [...walk(APP_DIR), ...walk(COMP_DIR)].filter(f => {
  const src = fs.readFileSync(f, "utf8");
  return hasHardcoded(src);
});

console.log(`\nPass 3 — ${files.length} files with residual hardcoded colors\n`);
let changed = 0;
const errors: string[] = [];

for (const f of files) {
  try {
    const before = fs.readFileSync(f, "utf8");
    const after  = migrate(before);
    if (after !== before) {
      fs.writeFileSync(f, after, "utf8");
      changed++;
      console.log(`  ✓  ${path.relative(process.cwd(), f)}`);
    } else {
      console.log(`  –  ${path.relative(process.cwd(), f)}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`${f}: ${msg}`);
    console.error(`  ✗  ${path.relative(process.cwd(), f)}: ${msg}`);
  }
}

console.log(`\n${"─".repeat(64)}`);
console.log(`Files changed : ${changed} / ${files.length}`);
console.log(`Errors        : ${errors.length}`);
if (errors.length) { errors.forEach(e => console.error("  " + e)); process.exit(1); }
