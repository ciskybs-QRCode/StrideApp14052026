import app from "./app";
import { logger } from "./lib/logger";
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
});
