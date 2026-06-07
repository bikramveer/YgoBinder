import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import cron from 'node-cron';

import authRouter from './routes/auth';
import collectionRouter from './routes/collection';
import togetRouter from './routes/toget';
import bindersRouter from './routes/binders';
import syncRouter from './routes/sync';
import pricesRouter from './routes/prices';
import { runPriceSync } from './services/priceSync';

const app = express();

// Trust Railway's reverse proxy so rate limiting uses the real client IP
app.set('trust proxy', 1);

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
app.use('/prices', pricesRouter);

// Health check — Railway uses this to confirm the server is running
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── Daily price sync — runs at midnight UTC ───────────────────────────────────

cron.schedule('0 0 * * *', () => {
  runPriceSync().catch((err) => console.error('Cron price sync failed:', err));
}, { timezone: 'UTC' });

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`YgoBinder API running on port ${PORT}`);
});
