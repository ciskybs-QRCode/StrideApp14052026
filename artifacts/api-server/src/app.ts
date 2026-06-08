import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { trialGuard } from "./middleware/trial-guard.js";
import { globalApiLimiter } from "./lib/rate-limit.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Global rate limiter — 300 req / 15 min per IP across all /api routes
app.use(globalApiLimiter);
// Raw body required for Stripe webhook signature verification — must precede express.json()
app.use("/api/billing/webhook", express.raw({ type: "*/*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(trialGuard);

app.use("/api", router);

export default app;
