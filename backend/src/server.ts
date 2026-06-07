import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';

import authRouter from './routes/auth';
import collectionRouter from './routes/collection';
import togetRouter from './routes/toget';
import bindersRouter from './routes/binders';
import syncRouter from './routes/sync';

const app = express();

// Security headers (must be before other middleware)
app.use(helmet());

// CORS — only allow requests from the configured frontend URL
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true, // required for cookies (refresh tokens)
}));

app.use(express.json());
app.use(cookieParser());

// ── Rate limiting ─────────────────────────────────────────────────────────────

// Loose limit for all routes
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limit for auth routes — prevents brute force and spam signups
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

app.use(generalLimiter);
app.use('/auth', authLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/auth', authRouter);
app.use('/collection', collectionRouter);
app.use('/toget', togetRouter);
app.use('/binders', bindersRouter);
app.use('/sync', syncRouter);

// Health check — Railway uses this to confirm the server is running
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`YgoBinder API running on port ${PORT}`);
});
