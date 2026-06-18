/**
 * seat-sync-scheduler.ts
 *
 * Runs every 24 h to keep Stripe subscription quantities in sync with the
 * actual member count for each active org.
 *
 * Why: members join and leave throughout the month. If the quantity drifts,
 * the association over- or under-pays. The sync ensures billing always
 * reflects the current headcount — pickup authorisations are never in the
 * `members` table so they never inflate the count.
 */

import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import { calcQrBillCents } from "./qr-pricing.js";
import { getPlatformStripeKey } from "./pg.js";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const INITIAL_DELAY_MS  = 90_000;               // 90 s after boot (after warm-up)

export function startSeatSyncScheduler(): void {
  setTimeout(() => {
    void syncAllSeats();
    setInterval(() => { void syncAllSeats(); }, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  logger.info("Seat sync scheduler started (checks every 24 h)");
}

async function syncAllSeats(): Promise<void> {
  const stripeKey = await getPlatformStripeKey();
  if (!stripeKey) return;

  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, stripe_subscription_id")
    .eq("subscription_status", "active")
    .not("stripe_subscription_id", "is", null);

  if (error || !orgs?.length) return;

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(stripeKey);

  for (const org of orgs as Array<{ id: number; stripe_subscription_id: string }>) {
    try {
      // Billing unit = QR code.
      // Each member account + each dependant (child) has a QR code → 1 seat.
      // authorized_pickups are in a separate table and never have their own
      // QR code → never billed.
      const [{ count: mCount }, { count: cCount }] = await Promise.all([
        supabase.from("members").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
        supabase.from("children").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
      ]);

      const qrCount = Math.max(1, (mCount ?? 0) + (cCount ?? 0));

      // Get org currency to compute the correct tiered monthly amount
      const { data: orgCurrData } = await supabase
        .from("organizations").select("currency").eq("id", org.id).maybeSingle();
      const currency = ((orgCurrData as { currency?: string } | null)?.currency ?? "EUR").toUpperCase();
      const newMonthlyCents = calcQrBillCents(qrCount, currency);

      const sub  = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
      const item = sub.items.data[0];

      if (item && item.price.unit_amount !== newMonthlyCents) {
        // Stripe SDK types lag behind the API: product_data IS valid on
        // subscriptionItems.update price_data but the TS types don't include it.
        await stripe.subscriptionItems.update(item.id, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          price_data: {
            currency:     currency.toLowerCase(),
            product_data: { name: `Stride Platform — ${qrCount} QR codes` },
            unit_amount:  newMonthlyCents,
            recurring:    { interval: "month" },
          } as any,
          quantity: 1,
        });
        logger.info(
          { orgId: org.id, prevAmount: item.price.unit_amount, newAmount: newMonthlyCents, qrCount },
          "seat-sync: Stripe monthly amount updated (tiered pricing)",
        );
      }
    } catch (err) {
      logger.warn({ orgId: org.id, err }, "seat-sync: failed to sync seats for org");
    }
  }
}
