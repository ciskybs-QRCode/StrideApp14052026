import app from "./app";
import { logger } from "./lib/logger";
import { verifySupabaseSchema } from "./lib/supabase-schema-check.js";
import { startReminderScheduler, startCertReminderScheduler } from "./lib/reminder-scheduler.js";
import { startMembershipScheduler } from "./lib/membership-scheduler.js";
import { startTrialBillingScheduler } from "./lib/trial-billing-scheduler.js";
import { startSeatSyncScheduler } from "./lib/seat-sync-scheduler.js";
import { startDataDeletionScheduler } from "./lib/data-deletion-scheduler.js";
import { startReportScheduler } from "./lib/report-scheduler.js";
import { RescueCascadeService } from "./lib/RescueCascadeService.js";
import { EmergencyPushService } from "./lib/EmergencyPushService.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Start listening immediately so the deployment healthcheck at /api/healthz
// can respond as soon as the process is up. Schema verification and schedulers
// run in the background — a schema failure is logged as fatal but does NOT
// kill the process (a dead server is worse than a server with a schema warning).
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  startReminderScheduler();
  startCertReminderScheduler();
  startMembershipScheduler();
  startTrialBillingScheduler();
  startSeatSyncScheduler();
  startDataDeletionScheduler();
  startReportScheduler();
  RescueCascadeService.ensureMigration().catch(err =>
    logger.error(err, "RescueCascadeService: migration failed"),
  );
  EmergencyPushService.ensureMigration()
    .then(() => EmergencyPushService.startAckWatchdog())
    .catch(err => logger.error(err, "EmergencyPushService: boot failed"));

  // Background schema check — logs critical errors if Supabase columns are missing
  // but does not kill the process so the healthcheck stays green.
  verifySupabaseSchema().catch(err => {
    logger.fatal({ err }, "Supabase schema check failed");
  });
});
