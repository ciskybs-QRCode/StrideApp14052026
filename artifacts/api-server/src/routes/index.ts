import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import childrenRouter from "./children.js";
import coursesRouter from "./courses.js";
import delegatesRouter from "./delegates.js";
import documentsRouter from "./documents.js";
import paymentsRouter from "./payments.js";
import promoCodesRouter from "./promo-codes.js";
import messagesRouter from "./messages.js";
import usersRouter from "./users.js";
import attendanceRouter from "./attendance.js";
import lessonsRouter from "./lessons.js";
import orgRouter from "./org.js";
import logsRouter from "./logs.js";
import enrollmentRequestsRouter from "./enrollment-requests.js";
import checkoutRouter from "./checkout.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(childrenRouter);
router.use(coursesRouter);
router.use(delegatesRouter);
router.use(documentsRouter);
router.use(paymentsRouter);
router.use(promoCodesRouter);
router.use(messagesRouter);
router.use(usersRouter);
router.use(attendanceRouter);
router.use(lessonsRouter);
router.use(orgRouter);
router.use(logsRouter);
router.use(enrollmentRequestsRouter);
router.use(checkoutRouter);

export default router;
