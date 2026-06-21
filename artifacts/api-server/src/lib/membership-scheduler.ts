/**
 * Membership Scheduler
 * Runs every hour:
 *  1. Sends expiry reminder notifications (30/15/7/3/1 days before)
 *  2. Suspends memberships past their expires_at when suspend_on_expiry = true
 *  3. Reactivates suspended memberships when Stripe marks them active again
 */
import { pool }   from "./pg.js";
import { logger }  from "./logger.js";

interface MemberSub {
  id:                  number;
  user_id:             string;
  organization_id:     number;
  item_name:           string | null;
  participant_name:    string | null;
  expires_at:          Date | null;
  membership_status:   string;
  cancel_at_period_end: boolean;
}

interface PolicyRow {
  membership_mandatory:         boolean;
  membership_reminder_days:     string;
  membership_suspend_on_expiry: boolean;
}

async function getPolicy(orgId: number): Promise<PolicyRow | null> {
  try {
    const { rows } = await pool.query<PolicyRow>(
      `SELECT membership_mandatory, membership_reminder_days, membership_suspend_on_expiry
         FROM admin_settings WHERE organization_id = $1`,
      [orgId],
    );
    return rows[0] ?? null;
  } catch { return null; }
}

async function sendReminderNotification(
  userId: string,
  orgId: number,
  subId: number,
  daysLeft: number,
  itemName: string | null,
  participantName: string | null,
): Promise<void> {
  const label   = participantName ? ` for ${participantName}` : "";
  const product = itemName ?? "Membership";
  const body    = daysLeft === 1
    ? `Your ${product}${label} expires tomorrow — renew now to stay active.`
    : `Your ${product}${label} expires in ${daysLeft} days. Please renew to avoid suspension.`;

  await pool.query(
    `INSERT INTO private_notifications (user_id, organization_id, type, title, body, read, created_at)
     VALUES ($1, $2, 'membership_reminder', 'Membership Expiring Soon', $3, false, NOW())
     ON CONFLICT DO NOTHING`,
    [userId, orgId, body],
  ).catch(() => {});
}

async function runMembershipCheck(): Promise<void> {
  const now = new Date();
  try {
    // Load all non-cancelled active/suspended subscriptions that have an expires_at
    const { rows: subs } = await pool.query<MemberSub>(
      `SELECT id, user_id, organization_id, item_name, participant_name,
              expires_at, membership_status, cancel_at_period_end
         FROM member_subscriptions
        WHERE expires_at IS NOT NULL
          AND membership_status IN ('active','suspended')`,
    );

    for (const sub of subs) {
      const policy = await getPolicy(sub.organization_id);
      if (!policy) continue;

      const expiresAt = new Date(sub.expires_at!);
      const msLeft    = expiresAt.getTime() - now.getTime();
      const daysLeft  = Math.ceil(msLeft / 86_400_000);

      // ── 1. Send reminders ───────────────────────────────────────────────
      if (daysLeft > 0 && daysLeft <= 30) {
        let reminderDays: number[] = [30, 15, 7, 3, 1];
        try {
          const parsed = JSON.parse(policy.membership_reminder_days);
          if (Array.isArray(parsed)) reminderDays = parsed.map(Number).filter(Boolean);
        } catch { /* use defaults */ }

        for (const day of reminderDays) {
          if (daysLeft <= day) {
            // Check dedup log
            const { rows: already } = await pool.query(
              `SELECT 1 FROM membership_reminder_log WHERE subscription_id = $1 AND reminder_day = $2`,
              [sub.id, day],
            );
            if (already.length === 0) {
              await sendReminderNotification(
                sub.user_id, sub.organization_id, sub.id,
                daysLeft, sub.item_name, sub.participant_name,
              );
              await pool.query(
                `INSERT INTO membership_reminder_log (subscription_id, reminder_day) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [sub.id, day],
              ).catch(() => {});
              logger.info({ subId: sub.id, daysLeft, day }, "membership-scheduler: reminder sent");
            }
          }
        }
      }

      // ── 2. Suspend if past expiry ───────────────────────────────────────
      if (daysLeft <= 0 && policy.membership_suspend_on_expiry && sub.membership_status === "active") {
        await pool.query(
          `UPDATE member_subscriptions SET membership_status = 'suspended' WHERE id = $1`,
          [sub.id],
        ).catch(() => {});

        await pool.query(
          `INSERT INTO private_notifications (user_id, organization_id, type, title, body, read, created_at)
           VALUES ($1, $2, 'membership_suspended', 'Membership Suspended',
                   $3, false, NOW()) ON CONFLICT DO NOTHING`,
          [
            sub.user_id, sub.organization_id,
            `Your ${sub.item_name ?? "membership"} has expired and been suspended. Renew to regain access.`,
          ],
        ).catch(() => {});

        logger.info({ subId: sub.id }, "membership-scheduler: membership suspended");
      }
    }
  } catch (err) {
    logger.error(err, "membership-scheduler: runMembershipCheck error");
  }
}

export function startMembershipScheduler(): void {
  // Run once 30s after boot, then every hour
  setTimeout(() => {
    void runMembershipCheck();
    setInterval(() => void runMembershipCheck(), 60 * 60 * 1000);
  }, 30_000);
  logger.info("membership-scheduler: started");
}
