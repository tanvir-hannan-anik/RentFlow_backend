import { Router } from "express";
import { getHealth, getDatabaseHealth } from "../controllers/health.controller.js";
import { verifyToken, verifyRenter, verifyOwner, verifyAdmin } from "../middleware/auth.js";
import { getCurrentUser, changeUserRole } from "../controllers/auth.controller.js";
import { env } from "../config/env.js";
import equipmentRoutes from './equipment.routes.js';
import paymentsRoutes from './payments.routes.js';
import uploadsRoutes from './uploads.routes.js';

const router = Router();
router.use(equipmentRoutes);
router.use(paymentsRoutes);
router.use(uploadsRoutes);
router.get("/health", getHealth);
router.get("/health/database", getDatabaseHealth);
router.get("/auth-options", (request, response) => response.json({ googleEnabled: Boolean(env.googleClientId && env.googleClientSecret) }));
router.get("/me", verifyToken, getCurrentUser);
router.get("/customer", verifyToken, verifyRenter, getCurrentUser);
router.get("/owner", verifyToken, verifyOwner, getCurrentUser);
router.get("/admin", verifyToken, verifyAdmin, getCurrentUser);
router.post("/admin/users/:userId/role", verifyToken, verifyAdmin, changeUserRole);

export default router;
