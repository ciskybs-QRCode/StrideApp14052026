#!/usr/bin/env tsx
/**
 * audit-db-links.ts
 *
 * Database Lineage & Audit Script for the Stride API Server.
 * Parses route files, lib/service files, and the Stride mobile app
 * to build a Data-to-App Connection Map.
 *
 * Usage:  pnpm --filter @workspace/scripts run audit:db
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname  = fileURLToPath(new URL(".", import.meta.url));
const WORKSPACE  = join(__dirname, "../..");
const ROUTES_DIR = join(WORKSPACE, "artifacts/api-server/src/routes");
const LIBS_DIR   = join(WORKSPACE, "artifacts/api-server/src/lib");
const PG_TS      = join(LIBS_DIR, "pg.ts");
const SCHEMA_DIR = join(WORKSPACE, "lib/db/src/schema");
const APP_DIR    = join(WORKSPACE, "artifacts/stride-app/app");
const API_TS     = join(WORKSPACE, "artifacts/stride-app/lib/api.ts");

// ─── SQL keywords to filter from table-name candidates ────────────────────────

const SQL_KW = new Set([
  "select","from","where","and","or","not","in","is","null","true","false",
  "insert","into","update","delete","join","left","right","inner","outer","full",
  "on","as","by","group","order","limit","offset","having","distinct","exists",
  "case","when","then","else","end","returning","values","set","asc","desc",
  "count","sum","avg","min","max","coalesce","nullif","cast","between","like",
  "ilike","with","union","except","intersect","create","table","index",
  "constraint","primary","key","foreign","references","default","check","unique",
  "add","alter","column","drop","cascade","conflict","nothing","current_timestamp",
  "timestamptz","serial","text","integer","boolean","uuid","jsonb","date",
  "timestamp","zone","varchar","float","double","precision","array","interval",
  "bigint","smallint","numeric","real","char","public","schema","extension",
  "sequence","view","function","trigger","procedure","perform","execute","format",
  "returns","language","plpgsql","begin","declare","raise","exception","using",
  "define","replace","pool","supabase","req","res","data","error","rows","row",
  "result","org","user","email","name","type","status","role","ids","new","old",
  "each","statement","for","loop","return","endif","else","elseif","only",
  "temporary","temp","unlogged","global","local","recursive","materialized",
  "refresh","concurrently","wait","include","exclude","following","preceding",
  "range","rows","unbounded","current","over","partition","within","filter",
  "tablesample","bernoulli","system","repeatable","seed","lateral","natural",
  "cross","straight","apply","pivot","unpivot","merge","matched","target",
  "source","output","inserted","deleted","bulk","collect","member","operator",
  "admin","parent","child","uuid","path","key","value","sort","rank","row",
  "number","dense","lead","lag","first","last","nth","window","frame",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function read(path: string): string {
  try { return readFileSync(path, "utf-8"); }
  catch { return ""; }
}

function listTs(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith(".ts") && f !== "index.ts")
      .map(f => join(dir, f));
  } catch { return []; }
}

function walkTs(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (e === "node_modules" || e.startsWith(".")) continue;
      try {
        if (statSync(full).isDirectory()) out.push(...walkTs(full));
        else if (e.endsWith(".ts") || e.endsWith(".tsx")) out.push(full);
      } catch { /**/ }
    }
  } catch { /**/ }
  return out;
}

function screenName(filePath: string): string {
  return relative(APP_DIR, filePath)
    .replace(/\.(tsx|ts)$/, "")
    .replace(/\\/g, "/");
}

// ─── 1. Discover all "known" tables ─────────────────────────────────────────

function knownTablesFromPg(): Set<string> {
  const src = read(PG_TS);
  const tables = new Set<string>();
  const pat = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z][a-z0-9_]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(src)) !== null) {
    const t = m[1].toLowerCase();
    if (!SQL_KW.has(t)) tables.add(t);
  }
  // Also pick up ALTER TABLE ... ADD CONSTRAINT (covers tables defined before ALTER)
  const alterPat = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z][a-z0-9_]+)\b/gi;
  while ((m = alterPat.exec(src)) !== null) {
    const t = m[1].toLowerCase();
    if (!SQL_KW.has(t)) tables.add(t);
  }
  return tables;
}

function knownTablesFromDrizzle(): Set<string> {
  const tables = new Set<string>();
  try {
    for (const f of readdirSync(SCHEMA_DIR).filter(f => f.endsWith(".ts"))) {
      const src = read(join(SCHEMA_DIR, f));
      const pat = /pgTable\(\s*["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = pat.exec(src)) !== null) tables.add(m[1]);
    }
  } catch { /**/ }
  return tables;
}

// ─── 2. Extract table references from a source file ─────────────────────────

function poolTables(src: string): Set<string> {
  const out = new Set<string>();
  const patterns: RegExp[] = [
    /\bFROM\s+([a-z][a-z0-9_]{2,})\b/gi,
    /\bINTO\s+([a-z][a-z0-9_]{2,})\b/gi,
    /\bUPDATE\s+([a-z][a-z0-9_]{2,})\s+SET\b/gi,
    /\bDELETE\s+FROM\s+([a-z][a-z0-9_]{2,})\b/gi,
    /\bJOIN\s+([a-z][a-z0-9_]{2,})\b/gi,
    /\bINSERT\s+INTO\s+([a-z][a-z0-9_]{2,})\b/gi,
    /\bTABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z][a-z0-9_]{2,})\s*[(\s]/gi,
  ];
  for (const pat of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(src)) !== null) {
      const t = m[1].toLowerCase();
      if (!SQL_KW.has(t) && t.includes("_")) out.add(t);
    }
  }
  return out;
}

function supabaseTables(src: string): Set<string> {
  const out = new Set<string>();
  const pat = /\.from\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(src)) !== null) out.add(m[1]);
  return out;
}

function allTableRefs(src: string): { pool: Set<string>; supabase: Set<string> } {
  return { pool: poolTables(src), supabase: supabaseTables(src) };
}

// ─── 3. Extract route definitions from a route file ──────────────────────────

interface RouteEntry { method: string; path: string }

function extractRoutes(src: string): RouteEntry[] {
  const routes: RouteEntry[] = [];
  const pat = /router\.(get|post|put|patch|delete|options)\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(src)) !== null) {
    routes.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return routes;
}

// Normalise path for prefix matching: strip trailing param segments
function pathPrefix(p: string): string {
  return p.split("/").filter(s => !s.startsWith(":")).join("/") || "/";
}

// ─── 4. Map stride-app screens → API paths they call ─────────────────────────

interface ScreenEntry { name: string; paths: Set<string> }

// Parse api.ts for named method → path mappings
function parseApiTs(): Map<string, string> {
  const methodMap = new Map<string, string>();
  const src = read(API_TS);
  // Pattern: someMethod: () => request<...>("METHOD", "/path/...") or request("METHOD", "/path")
  const pat = /(\w+)\s*:\s*(?:\([^)]*\)\s*=>?\s*)?request(?:<[^>]*>)?\(\s*"[A-Z]+"\s*,\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(src)) !== null) {
    methodMap.set(m[1], m[2]);
  }
  return methodMap;
}

function extractScreenPaths(src: string, apiMethodMap: Map<string, string>): Set<string> {
  const paths = new Set<string>();

  // Direct request() calls
  const directPat = /request(?:<[^>]*>)?\(\s*"[A-Z]+"\s*,\s*`?["']([^"'`]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = directPat.exec(src)) !== null) paths.add(m[1]);

  // api.namespace.method() calls → resolve via apiMethodMap
  const apiCallPat = /\bapi\.(\w+)(?:\.\w+)*\s*\(/g;
  while ((m = apiCallPat.exec(src)) !== null) {
    const resolved = apiMethodMap.get(m[1]);
    if (resolved) paths.add(resolved);
  }

  // Literal fetch/url strings that look like api paths
  const litPat = /["'`](\/(?:api\/)?[a-z][a-z0-9/_-]+)[`"']/g;
  while ((m = litPat.exec(src)) !== null) {
    if (m[1].length > 3 && !m[1].includes("//")) paths.add(m[1].replace(/^\/api/, ""));
  }

  return paths;
}

// ─── 5. Build the full lineage map ───────────────────────────────────────────

interface LineageRow {
  table: string;
  storageType: "local-pg" | "supabase" | "both";
  routes: Array<{ file: string; method: string; path: string }>;
  screens: string[];
}

function build(): { rows: LineageRow[]; orphans: string[]; unknownTables: string[] } {
  // Known tables
  const pgTables      = knownTablesFromPg();
  const drizzleTables = knownTablesFromDrizzle();
  const allKnown      = new Set([...pgTables, ...drizzleTables]);

  // Route files
  const routeFiles = listTs(ROUTES_DIR);
  // Lib/service files
  const libFiles = listTs(LIBS_DIR);

  // Per-file parsed data
  interface FileParsed {
    name: string;
    routes: RouteEntry[];
    pool: Set<string>;
    supabase: Set<string>;
  }
  const routeParsed: FileParsed[] = routeFiles.map(f => {
    const src = read(f);
    const refs = allTableRefs(src);
    return {
      name: f.replace(/.*routes\//, "").replace(".ts", ""),
      routes: extractRoutes(src),
      pool: refs.pool,
      supabase: refs.supabase,
    };
  });
  const libParsed: FileParsed[] = libFiles.map(f => {
    const src = read(f);
    const refs = allTableRefs(src);
    return {
      name: f.replace(/.*lib\//, "").replace(".ts", ""),
      routes: [],
      pool: refs.pool,
      supabase: refs.supabase,
    };
  });
  const allParsed = [...routeParsed, ...libParsed];

  // Collect all referenced tables across everything
  const allReferencedPool = new Set<string>();
  const allReferencedSupa = new Set<string>();
  for (const p of allParsed) {
    p.pool.forEach(t => allReferencedPool.add(t));
    p.supabase.forEach(t => allReferencedSupa.add(t));
  }
  const allReferenced = new Set([...allReferencedPool, ...allReferencedSupa]);

  // Supabase-only tables (not in local pg.ts)
  const supabaseOnlyTables = new Set([...allReferencedSupa].filter(t => !pgTables.has(t)));

  // All unique tables = known + supabase-only (to catch supabase-managed tables not in local schema)
  const allTables = new Set([...allKnown, ...supabaseOnlyTables]);

  // API method → path map from api.ts
  const apiMethodMap = parseApiTs();

  // Stride-app screens
  const screenFiles = walkTs(APP_DIR);
  const screens: ScreenEntry[] = screenFiles.map(f => ({
    name: screenName(f),
    paths: extractScreenPaths(read(f), apiMethodMap),
  }));

  // ── Build lineage rows ────────────────────────────────────────────────────
  const rows: LineageRow[] = [];
  const seenTables = new Set<string>();

  for (const table of [...allTables].sort()) {
    if (seenTables.has(table)) continue;
    seenTables.add(table);

    // Find all route+lib files that reference this table
    const matchedFiles = allParsed.filter(
      p => p.pool.has(table) || p.supabase.has(table)
    );
    if (matchedFiles.length === 0) continue; // pure orphan handled below

    // Collect route entries from matched route files (libs have no routes; bubble up to their callers)
    const libFileNames = new Set(matchedFiles.filter(p => p.routes.length === 0).map(p => p.name));

    // Direct route entries
    const routeEntries: Array<{ file: string; method: string; path: string }> = [];
    for (const p of matchedFiles) {
      if (p.routes.length > 0) {
        for (const r of p.routes) {
          routeEntries.push({ file: p.name, method: r.method, path: r.path });
        }
      }
    }

    // If only lib files matched, note them as "(service)"
    if (routeEntries.length === 0 && libFileNames.size > 0) {
      for (const lib of libFileNames) {
        routeEntries.push({ file: lib, method: "SVC", path: "(service / scheduler)" });
      }
    }

    // For each route, find screens that call it
    const matchedScreens = new Set<string>();
    for (const entry of routeEntries) {
      if (entry.method === "SVC") continue;
      const prefix = pathPrefix(entry.path);
      for (const screen of screens) {
        for (const p of screen.paths) {
          const normalised = p.replace(/^\/api/, "");
          if (normalised === entry.path || normalised.startsWith(prefix + "/") || normalised === prefix) {
            matchedScreens.add(screen.name);
          }
        }
      }
    }

    // Storage type
    const inPool = allParsed.some(p => p.pool.has(table));
    const inSupa = allParsed.some(p => p.supabase.has(table));
    const storageType: LineageRow["storageType"] =
      inPool && inSupa ? "both" : inSupa ? "supabase" : "local-pg";

    rows.push({
      table,
      storageType,
      routes: routeEntries,
      screens: [...matchedScreens].sort(),
    });
  }

  // Orphans: known tables with zero references anywhere
  const orphans = [...allKnown].filter(t => !allReferenced.has(t)).sort();

  // Unknown tables: referenced in code but not in any known schema definition
  const unknownTables = [...allReferenced]
    .filter(t => !allTables.has(t))
    .sort();

  return { rows, orphans, unknownTables };
}

// ─── 6. Render ────────────────────────────────────────────────────────────────

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";
const RED    = "\x1b[31m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const BLUE   = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const WHITE  = "\x1b[37m";

function badge(storageType: LineageRow["storageType"]): string {
  if (storageType === "local-pg") return `${BLUE}[pg]${RESET}`;
  if (storageType === "supabase") return `${MAGENTA}[supabase]${RESET}`;
  return `${CYAN}[pg+sb]${RESET}`;
}

function methodColor(method: string): string {
  switch (method) {
    case "GET":    return `${GREEN}GET   ${RESET}`;
    case "POST":   return `${YELLOW}POST  ${RESET}`;
    case "PUT":    return `${YELLOW}PUT   ${RESET}`;
    case "PATCH":  return `${YELLOW}PATCH ${RESET}`;
    case "DELETE": return `${RED}DELETE${RESET}`;
    case "SVC":    return `${DIM}SVC   ${RESET}`;
    default:       return `${WHITE}${method.padEnd(6)}${RESET}`;
  }
}

function hr(char = "─", width = 100): string {
  return char.repeat(width);
}

function render(rows: LineageRow[], orphans: string[], unknownTables: string[]): void {
  const ts = new Date().toISOString();
  console.log(`\n${BOLD}╔${"═".repeat(98)}╗${RESET}`);
  console.log(`${BOLD}║${"  DATABASE LINEAGE & AUDIT REPORT".padEnd(98)}║${RESET}`);
  console.log(`${BOLD}║${"  Stride API Server — stride-app".padEnd(62)}${DIM}Generated: ${ts}${RESET}${BOLD}${" ".repeat(98 - 62 - 11 - ts.length)}║${RESET}`);
  console.log(`${BOLD}╚${"═".repeat(98)}╝${RESET}\n`);

  console.log(`${BOLD}Legend:${RESET}  ${BLUE}[pg]${RESET} = local Postgres (pool)   ${MAGENTA}[supabase]${RESET} = Supabase client   ${CYAN}[pg+sb]${RESET} = both`);
  console.log(`         ${GREEN}GET   ${RESET}= read   ${YELLOW}POST/PUT/PATCH${RESET} = write   ${RED}DELETE${RESET} = delete   ${DIM}SVC${RESET} = background service\n`);

  let tableCount = 0;
  let routeCount = 0;
  let linkedScreenCount = 0;

  for (const row of rows) {
    tableCount++;
    console.log(`${hr()}`);
    console.log(
      `${BOLD}TABLE${RESET}  ${CYAN}${row.table.padEnd(40)}${RESET}` +
      `${badge(row.storageType)}`
    );
    console.log();

    if (row.routes.length === 0) {
      console.log(`  ${DIM}No direct route handlers found (may be accessed via service layer)${RESET}`);
    } else {
      // Group by file
      const byFile = new Map<string, typeof row.routes>();
      for (const r of row.routes) {
        if (!byFile.has(r.file)) byFile.set(r.file, []);
        byFile.get(r.file)!.push(r);
      }

      for (const [file, entries] of byFile) {
        console.log(`  ${DIM}routes/${file}.ts${RESET}`);
        for (const e of entries) {
          routeCount++;
          const prefix = "/api";
          const fullPath = e.path === "(service / scheduler)" ? e.path : `${prefix}${e.path}`;
          console.log(`    ${methodColor(e.method)}  ${BOLD}${fullPath}${RESET}`);
        }
      }
    }

    if (row.screens.length > 0) {
      linkedScreenCount += row.screens.length;
      console.log();
      console.log(`  ${BOLD}↳ Stride App Screens:${RESET}`);
      for (const s of row.screens) {
        // Determine role from path
        const role = s.startsWith("(parent)")   ? `${GREEN}parent  ${RESET}`
                   : s.startsWith("(operator)") ? `${YELLOW}operator${RESET}`
                   : s.startsWith("(admin)")    ? `${RED}admin   ${RESET}`
                   :                              `${DIM}shared  ${RESET}`;
        console.log(`    ${role}  ${s}`);
      }
    } else {
      console.log();
      console.log(`  ${DIM}↳ No Stride App screen directly detected (may be triggered by background service or dev-tools)${RESET}`);
    }

    console.log();
  }

  // ── Orphan tables ──────────────────────────────────────────────────────────
  console.log(`${hr("═")}`);
  console.log(`\n${BOLD}ORPHAN TABLES  (defined in schema but never referenced in any route or service)${RESET}\n`);
  if (orphans.length === 0) {
    console.log(`  ${GREEN}✓ No orphan tables found.${RESET}\n`);
  } else {
    for (const t of orphans) {
      const inPg      = knownTablesFromPg().has(t);
      const inDrizzle = knownTablesFromDrizzle().has(t);
      const src = inPg ? "pg.ts" : "drizzle";
      console.log(`  ${RED}[WARNING: ORPHAN TABLE]${RESET}  ${BOLD}${t}${RESET}  ${DIM}(schema: ${src})${RESET}`);
    }
    console.log();
  }

  // ── Unknown / undeclared tables ─────────────────────────────────────────────
  if (unknownTables.length > 0) {
    console.log(`${hr("─")}`);
    console.log(`\n${BOLD}UNDECLARED TABLES  (referenced in code but absent from schema definitions)${RESET}\n`);
    for (const t of unknownTables) {
      console.log(`  ${YELLOW}[WARNING: UNDECLARED]${RESET}  ${BOLD}${t}${RESET}  ${DIM}(not in pg.ts or Drizzle schema)${RESET}`);
    }
    console.log();
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`${hr("═")}`);
  console.log(`\n${BOLD}SUMMARY${RESET}`);
  console.log(`  Tables in connection map : ${CYAN}${tableCount}${RESET}`);
  console.log(`  Routes mapped            : ${CYAN}${routeCount}${RESET}`);
  console.log(`  Screen ↔ table links     : ${CYAN}${linkedScreenCount}${RESET}`);
  console.log(`  Orphan tables            : ${orphans.length > 0 ? RED : GREEN}${orphans.length}${RESET}`);
  console.log(`  Undeclared tables        : ${unknownTables.length > 0 ? YELLOW : GREEN}${unknownTables.length}${RESET}`);
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const { rows, orphans, unknownTables } = build();
render(rows, orphans, unknownTables);
