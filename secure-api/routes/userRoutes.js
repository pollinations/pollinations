// routes/userRoutes.js

import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { getProfile } from '../controllers/userController.js';

const router = Router();

// Protected route
router.get('/profile', authenticateToken, getProfile);

export default router;
