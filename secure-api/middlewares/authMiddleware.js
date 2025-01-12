// middlewares/authMiddleware.js

import jwt from 'jsonwebtoken';
import { jwtSecret } from '../config/keys.js';

export function authenticateToken(req, res, next) {
  // Get token from cookie
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Access denied, no token provided' });
  }

  // Verify token
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    // Attach user info to the req for next steps
    req.user = { userId: decoded.userId };
    next();
  });
}
