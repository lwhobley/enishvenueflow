import { Router, type IRouter } from "express";
import healthRouter from "./health";
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

const router: IRouter = Router();

router.use(healthRouter);
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

export default router;
