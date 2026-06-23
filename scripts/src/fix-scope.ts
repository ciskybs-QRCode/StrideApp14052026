/**
 * fix-scope.ts
 *
 * Problem: The migration script injected `const styles = make_styles(colors.primary, colors.secondary)`
 * only into the FIRST component of each file. But many files have multiple components that all
 * use `styles` (or `S`, `ss`, `em`, `mu`, etc.) without having them in scope.
 *
 * Fix strategy:
 *   For every React component function in a file that uses a `make_XXX`-produced variable
 *   (like `styles`, `S`, `ss`, `em`, etc.) but does NOT declare it in its own body,
 *   inject `const VAR = make_VAR(colors.primary, colors.secondary);` right after the
 *   `const colors = useColors();` line in that component.
 *
 *   If the component uses `colors` but doesn't have `const colors = useColors()`, also inject that.
 *
 * We also fix: `make_s` (lowercase) → normalized to correct casing.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STRIDE_APP = path.resolve(__dirname, "../../artifacts/stride-app");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) return [full];
    return [];
  });
}

// Skip files that should not be touched
const SKIP_FILES = new Set([
  "useColors.ts",
  "BrandingContext.tsx",
  "colors.ts",
  "app-customization.tsx",
  "PdfBadgeGenerator.tsx",
]);

function shouldSkip(f: string): boolean {
  const base = path.basename(f);
  return SKIP_FILES.has(base);
}

/**
 * Given file source, find all `const MAKE_NAME = (primary, secondary) => StyleSheet.create`
 * Returns map of varName -> makeName (e.g. styles -> make_styles, S -> make_S)
 */
function findMakeMap(src: string): Map<string, string> {
  const map = new Map<string, string>();
  // const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  for (const m of src.matchAll(/const\s+(make_\w+)\s*=\s*\(primary[^)]*\)\s*=>/g)) {
    const makeName = m[1];
    // The variable name produced is make_X -> X (strip make_)
    const varName = makeName.replace(/^make_/, "");
    map.set(varName, makeName);
  }
  return map;
}

/**
 * Split source into component-level segments.
 * Each segment starts with a function/const declaration that looks like a React component.
 * Returns array of {start, end, body} where start/end are line indices (0-based).
 */
function findComponentBodies(lines: string[]): Array<{ start: number; end: number }> {
  const components: Array<{ start: number; end: number }> = [];

  // Detect function starts: `export default function`, `export function`, `function Xxx`,
  // or `const Xxx = (` / `const Xxx = React.memo`
  const fnStartRe = /^(?:export\s+(?:default\s+)?)?function\s+[A-Z]\w*\s*[(<]/;
  const constCompRe = /^(?:export\s+)?const\s+[A-Z]\w*\s*(?::\s*React\.FC[^=]*)?=\s*(?:\([^)]*\)|React\.memo\()/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (fnStartRe.test(line) || constCompRe.test(line)) {
      // Find the opening brace of the function body
      let braceStart = i;
      let depth = 0;
      let inBody = false;

      for (let j = i; j < Math.min(lines.length, i + 5); j++) {
        if (lines[j].includes("{")) {
          braceStart = j;
          inBody = true;
          break;
        }
      }

      if (!inBody) { i++; continue; }

      // Count braces to find end
      depth = 0;
      let end = braceStart;
      for (let j = braceStart; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === "{") depth++;
          else if (ch === "}") { depth--; if (depth === 0) { end = j; break; } }
        }
        if (depth === 0) break;
      }

      components.push({ start: i, end });
      i = end + 1;
    } else {
      i++;
    }
  }
  return components;
}

function processFile(src: string): string {
  const makeMap = findMakeMap(src);
  if (makeMap.size === 0) return src; // no make_* in this file, skip

  const lines = src.split("\n");
  const components = findComponentBodies(lines);
  if (components.length === 0) return src;

  // For each component, check what it uses vs what it declares
  const insertions: Map<number, string[]> = new Map(); // lineIndex -> lines to insert after

  for (const { start, end } of components) {
    const body = lines.slice(start, end + 1).join("\n");

    // Find what make_XXX results are USED in this component
    const usedVars = new Set<string>();
    for (const [varName] of makeMap) {
      // Use regex to find `styles.xxx` or `S.xxx` etc. as well as plain `styles`
      const useRe = new RegExp(`\\b${varName}(?:\\.|\\[|\\s*,|\\s*\\)|\\/\\*| )`, "g");
      if (useRe.test(body)) {
        usedVars.add(varName);
      }
    }

    if (usedVars.size === 0) continue;

    // Does this component declare the vars?
    const declaredVars = new Set<string>();
    for (const [varName] of makeMap) {
      if (new RegExp(`const\\s+${varName}\\s*=\\s*make_${varName === "styles" ? "styles" : varName}`).test(body) ||
          new RegExp(`const\\s+${varName}\\s*=\\s*make_\\w+\\(`).test(body)) {
        declaredVars.add(varName);
      }
    }

    // Does it have useColors?
    const hasColors = /const\s+colors\s*=\s*useColors\(\)/.test(body);
    const usesColors = /\bcolors\.\w+/.test(body) || usedVars.size > 0;

    // Find insertion point: right after `const colors = useColors()`
    // or right after the first `const` declaration in the body if no useColors
    let insertAfterLine = -1;

    for (let j = start; j <= end; j++) {
      if (/const\s+colors\s*=\s*useColors\(\)/.test(lines[j])) {
        insertAfterLine = j;
        break;
      }
    }

    // If no useColors found but component uses colors, find first statement after opening brace
    if (insertAfterLine === -1 && usesColors) {
      for (let j = start; j <= end; j++) {
        if (lines[j].trim() === "{" || (j === start && lines[j].includes("{"))) {
          insertAfterLine = j;
          break;
        }
      }
    }

    if (insertAfterLine === -1) continue;

    const toInsert: string[] = [];

    // Add useColors if missing
    if (!hasColors && usesColors) {
      // Detect indentation
      const indent = lines[insertAfterLine + 1]?.match(/^(\s+)/)?.[1] ?? "  ";
      toInsert.push(`${indent}const colors = useColors();`);
    }

    // Add missing make_XXX calls
    for (const varName of usedVars) {
      if (!declaredVars.has(varName)) {
        const makeName = makeMap.get(varName)!;
        const indent = lines[insertAfterLine + 1]?.match(/^(\s+)/)?.[1] ?? "  ";
        toInsert.push(`${indent}const ${varName} = ${makeName}(colors.primary, colors.secondary);`);
      }
    }

    if (toInsert.length > 0) {
      const existing = insertions.get(insertAfterLine) ?? [];
      insertions.set(insertAfterLine, [...existing, ...toInsert]);
    }
  }

  if (insertions.size === 0) return src;

  // Apply insertions in reverse order (so line numbers stay valid)
  const sortedKeys = [...insertions.keys()].sort((a, b) => b - a);
  for (const lineIdx of sortedKeys) {
    const toInsert = insertions.get(lineIdx)!;
    lines.splice(lineIdx + 1, 0, ...toInsert);
  }

  return lines.join("\n");
}

const allFiles = [
  ...walk(path.join(STRIDE_APP, "app")),
  ...walk(path.join(STRIDE_APP, "components")),
];

let changed = 0;
for (const f of allFiles) {
  if (shouldSkip(f)) continue;
  const before = fs.readFileSync(f, "utf8");
  const after = processFile(before);
  if (after !== before) {
    fs.writeFileSync(f, after, "utf8");
    changed++;
    console.log(`  ✓  ${path.relative(process.cwd(), f)}`);
  }
}
console.log(`\nFixed ${changed} files`);
