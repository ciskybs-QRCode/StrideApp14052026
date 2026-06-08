/**
 * verify-settings-clean.ts
 *
 * Confirms that no financial configuration items remain in the Settings index.
 * Exits with code 1 and prints a clear message if any banned key is found.
 *
 * Usage:  pnpm --filter @workspace/scripts run verify-settings-clean
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const SETTINGS_FILE = path.resolve(
  __dirname,
  "../../artifacts/stride-app/app/(admin)/settings/index.tsx"
);

const BANNED_KEYS = [
  "fee-settings",
  "stripe-connect",
  "subscription-billing",
  "regional-pricing",
  "Membership Fees",
  "Payment Processing",
  "Subscription & Billing",
  "Global Pricing",
  "Promo Codes",
  "featCardAmber",
  "featTitleAmber",
  "featDescAmber",
  "featIconAmber",
] as const;

function main() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    console.error(`ERROR: Settings file not found at:\n  ${SETTINGS_FILE}`);
    process.exit(1);
  }

  const source = fs.readFileSync(SETTINGS_FILE, "utf-8");
  const violations: string[] = [];

  for (const key of BANNED_KEYS) {
    if (source.includes(key)) {
      violations.push(key);
    }
  }

  if (violations.length > 0) {
    console.error("\n❌  Financial items still present in Settings/index.tsx:");
    violations.forEach(v => console.error(`   • "${v}"`));
    console.error(
      "\nThese items must live only in the Finance Hub. Remove them from Settings.\n"
    );
    process.exit(1);
  }

  console.log("\n✅  Settings/index.tsx is clean — no financial items found.\n");
  process.exit(0);
}

main();
