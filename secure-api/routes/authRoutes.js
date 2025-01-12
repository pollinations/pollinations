// routes/authRoutes.js

import { Router } from 'express';
import { register, login, logout } from '../controllers/userController.js';

const router = Router();

// Public endpoints
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

export default router;
