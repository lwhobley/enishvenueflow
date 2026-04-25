import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import venuesRouter from "./venues";
import usersRouter from "./users";
import rolesRouter from "./roles";
import schedulesRouter from "./schedules";
import shiftsRouter from "./shifts";
import reservationsRouter from "./reservations";
import guestsRouter from "./guests";
import timeclockRouter from "./timeclock";
import floorplanRouter from "./floorplan";
import tippayrollRouter from "./tippayroll";
import messagingRouter from "./messaging";
import analyticsRouter from "./analytics";
import availabilityRouter from "./availability";
import pushRouter from "./push";
import integrationsRouter from "./integrations";
import reportsRouter from "./reports";
import literatureRouter from "./literature";
import enrollmentRouter from "./enrollment";
import aiRouter from "./ai";
import { requireAuth } from "../middlewares/require-auth";
import { enforceVenueScope } from "../middlewares/enforce-venue-scope";

const router: IRouter = Router();

// Bearer-token auth. requireAuth itself allow-lists the public paths
// (/healthz, /auth/pin, /push/vapid-public-key, /enroll/:venueId/:token)
// so login, the SW VAPID bootstrap, and self-enrollment still work
// before a session exists. Everything else requires a valid session
// header populated by requireAuth into req.auth.
router.use(requireAuth);

// Cross-venue guard: any caller-supplied venueId in body/query/params
// must match the session's venueId. Stops a logged-in user in venue A
// from listing or mutating data in venue B.
router.use(enforceVenueScope);

router.use(healthRouter);
router.use(authRouter);
router.use(venuesRouter);
router.use(usersRouter);
router.use(rolesRouter);
router.use(schedulesRouter);
router.use(shiftsRouter);
router.use(reservationsRouter);
router.use(guestsRouter);
router.use(timeclockRouter);
router.use(floorplanRouter);
router.use(tippayrollRouter);
router.use(messagingRouter);
router.use(analyticsRouter);
router.use(availabilityRouter);
router.use(pushRouter);
router.use(integrationsRouter);
router.use(reportsRouter);
router.use(literatureRouter);
router.use(enrollmentRouter);
router.use(aiRouter);

export default router;
