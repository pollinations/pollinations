// server.js

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';

// 1) Connect to DB
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// 2) Security & middlewares
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// 3) Auth & user routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// 4) Example test route
app.get('/', (req, res) => {
  res.send('API is running and connected to DB...');
});

// 5) Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
