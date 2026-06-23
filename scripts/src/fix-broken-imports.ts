/**
 * fix-broken-imports.ts
 *
 * Fixes two types of breakage introduced by the migration script:
 *
 * Problem 1: `import { useColors }` was injected INSIDE a multi-line import block
 *   e.g.:
 *     import {
 *     import { useColors } from "@/hooks/useColors";
 *       getSupportTickets,
 *     } from "@/lib/api";
 *   Fix: move the useColors import line to before the broken multi-line block
 *
 * Problem 2: `const NAVY = colors.primary; const GOLD = colors.secondary;`
 *   at module level (outside any function), where `colors` is not in scope.
 *   These constants were originally:
 *     const NAVY = "#1E3A8A";
 *     const GOLD = "#FBBF24";
 *   Fix: replace `colors.primary` → `"#1E3A8A"` and `colors.secondary` → `"#FBBF24"`
 *   for module-level constants ONLY. Inside components it should stay as colors.*.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const APP_DIR  = path.resolve(__dirname, "../../artifacts/stride-app/app");
const COMP_DIR = path.resolve(__dirname, "../../artifacts/stride-app/components");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) return [full];
    return [];
  });
}

function fixFile(src: string): string {
  let changed = false;

  // ── Fix 1: useColors import injected inside a multi-line import block ───────
  // Pattern: we have `import {\nimport { useColors } from "...";\n  foo,\n} from "...";`
  // Detection: a line `import { useColors }...` that is NOT at a clean position
  // (i.e., the line before it is `import {` or `  something,` without a closing)

  // Strategy: extract all lines, find the broken injection, move it to the right place
  const lines = src.split("\n");
  const useColorsLineIdx = lines.findIndex(l =>
    /^import\s+\{\s*useColors\s*\}\s+from\s+"@\/hooks\/useColors"/.test(l.trim()) &&
    l.trim().startsWith("import")
  );

  if (useColorsLineIdx !== -1) {
    const prevLine = useColorsLineIdx > 0 ? lines[useColorsLineIdx - 1].trim() : "";
    // Is the previous line an opening of a multi-line import (e.g. "import {" or "  Foo,")
    // i.e., NOT a complete import statement and NOT a blank line?
    const prevIsInsideBlock = (
      prevLine.endsWith(",") ||
      prevLine === "import {" ||
      prevLine.startsWith("import {") && !prevLine.includes("from")
    );

    if (prevIsInsideBlock) {
      // Remove the useColors line from its current position
      const useColorsLine = lines[useColorsLineIdx];
      const newLines = lines.filter((_, i) => i !== useColorsLineIdx);

      // Find the last complete import statement before the broken block
      // Walk backwards from useColorsLineIdx to find start of the broken import block
      let blockStart = useColorsLineIdx - 1;
      while (blockStart > 0) {
        const l = newLines[blockStart - 1].trim();
        if (l.startsWith("import") || l === "") break;
        blockStart--;
      }
      // blockStart is now the index of the `import {` line of the broken block
      // We want to insert useColors BEFORE blockStart
      newLines.splice(blockStart, 0, useColorsLine);
      src = newLines.join("\n");
      changed = true;
    }
  }

  // ── Fix 2: module-level `const NAVY = colors.primary` ─────────────────────
  // These should be reverted to the original hex values since they're
  // used as module-level constants (not inside a component with useColors in scope)
  // Pattern: `const NAVY = colors.primary;` at start of line (module level)
  src = src.replace(/^const\s+NAVY\s*=\s*colors\.primary\s*;/gm, 'const NAVY = "#1E3A8A";');
  src = src.replace(/^const\s+GOLD\s*=\s*colors\.secondary\s*;/gm, 'const GOLD = "#FBBF24";');

  return src;
}

const files = [...walk(APP_DIR), ...walk(COMP_DIR)];
let changed = 0;

for (const f of files) {
  const before = fs.readFileSync(f, "utf8");
  const after  = fixFile(before);
  if (after !== before) {
    fs.writeFileSync(f, after, "utf8");
    changed++;
    console.log(`  ✓  ${path.relative(process.cwd(), f)}`);
  }
}
console.log(`\nFixed ${changed} files`);
