import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import pool from '../db';
import { requireAuth } from '../middleware/auth';
import { sendOtpEmail } from '../services/email';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const VerifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, 'Code must be exactly 6 digits.'),
});

const SettingsSchema = z.object({
  preferredCurrency: z.enum(['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY']).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateAccessToken(userId: number, email: string): string {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

async function createRefreshToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(64).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );

  return token;
}

function setRefreshCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: isProduction,
    // 'none' is required for cross-origin cookies (Vercel → Railway).
    // 'lax' in dev avoids the Secure requirement on http://localhost.
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/auth',
  });
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, passwordHash]
    );

    const userId: number = result.rows[0].id;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await pool.query(
      'INSERT INTO email_otps (user_id, code, expires_at) VALUES ($1, $2, $3)',
      [userId, code, expiresAt]
    );

    await sendOtpEmail(email, code);

    res.status(201).json({ message: 'Account created. Check your email for a 6-digit verification code.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /auth/verify-email
router.post('/verify-email', async (req: Request, res: Response) => {
  const parsed = VerifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, code } = parsed.data;

  try {
    const userResult = await pool.query(
      'SELECT id, preferred_currency FROM users WHERE email = $1',
      [email]
    );
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    const userId: number = userResult.rows[0].id;
    const preferred_currency: string = userResult.rows[0].preferred_currency;

    const otpResult = await pool.query(
      `SELECT id FROM email_otps
       WHERE user_id = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId, code]
    );

    if (otpResult.rows.length === 0) {
      res.status(400).json({ error: 'Invalid or expired verification code.' });
      return;
    }

    await pool.query('UPDATE email_otps SET used = TRUE WHERE id = $1', [otpResult.rows[0].id]);
    await pool.query(
      'UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    const accessToken = generateAccessToken(userId, email);
    const refreshToken = await createRefreshToken(userId);
    setRefreshCookie(res, refreshToken);

    res.json({ token: accessToken, user: { id: userId, email, preferred_currency } });
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, email_verified, preferred_currency FROM users WHERE email = $1',
      [email]
    );

    // Same error for "not found" and "wrong password" — avoids user enumeration
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!user.email_verified) {
      res.status(403).json({ error: 'Please verify your email before logging in.', code: 'EMAIL_NOT_VERIFIED' });
      return;
    }

    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = await createRefreshToken(user.id);
    setRefreshCookie(res, refreshToken);

    res.json({ token: accessToken, user: { id: user.id, email: user.email, preferred_currency: user.preferred_currency } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  const token: string | undefined = req.cookies.refresh_token;
  if (!token) {
    res.status(401).json({ error: 'No refresh token.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const result = await pool.query(
      `SELECT rt.id, rt.user_id, u.email
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid or expired refresh token.' });
      return;
    }

    const { id: tokenId, user_id: userId, email } = result.rows[0];

    // Token rotation — delete old, issue new
    await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [tokenId]);

    const newAccessToken = generateAccessToken(userId, email);
    const newRefreshToken = await createRefreshToken(userId);
    setRefreshCookie(res, newRefreshToken);

    res.json({ token: newAccessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  const token: string | undefined = req.cookies.refresh_token;

  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]).catch(() => {});
  }

  res.clearCookie('refresh_token', { path: '/auth' });
  res.json({ message: 'Logged out.' });
});

// GET /auth/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, email, email_verified, preferred_currency, created_at FROM users WHERE id = $1',
      [req.user!.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// PATCH /auth/me — update account settings
router.patch('/me', requireAuth, async (req: Request, res: Response) => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { preferredCurrency } = parsed.data;
  if (!preferredCurrency) {
    res.status(400).json({ error: 'No settings provided.' });
    return;
  }

  try {
    const result = await pool.query(
      'UPDATE users SET preferred_currency = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, preferred_currency',
      [preferredCurrency, req.user!.userId]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Settings error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

export default router;
