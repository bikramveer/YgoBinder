# YgoBinder — Dev Log & Learning Reference

This file is a running record of everything built, every architectural decision made, and why. It's written so you can come back after the project is done and deep-dive into any topic you want to understand better.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Phase 1–4: Frontend (Complete)](#2-phase-14-frontend-complete)
3. [Phase 5: Backend](#3-phase-5-backend)
   - [Architecture Decisions](#architecture-decisions)
   - [Guest Mode](#guest-mode)
   - [Security Measures](#security-measures)
4. [Key Technical Decisions](#4-key-technical-decisions)
5. [Learning Resources](#5-learning-resources)

---

## 1. Project Overview

**YgoBinder** is a Yu-Gi-Oh card collection management web app.

**Stack:** React + TypeScript + Vite (frontend) · Node.js + Express + PostgreSQL (backend)  
**Deployed:** Vercel (frontend) · Railway (backend + database)  
**Repo:** https://github.com/bikramveer/YgoBinder

**Core goals:**
- Search the full YGO card database (via YGOPRODeck free API)
- Track owned cards (set printing, condition, quantity)
- Track a "To Get" wishlist with live prices
- Organize cards into visual binders
- Work fully without an account; optionally sync to server with an account

---

## 2. Phase 1–4: Frontend (Complete)

### What was built

| Phase | Feature |
|---|---|
| 1 | Card search (YGOPRODeck API, infinite scroll, debounce) |
| 1 | Card detail modal (stats, all set printings, live prices) |
| 2 | Collection — add/edit/remove cards with set + condition + quantity |
| 2 | To Get list — desired quantity, acquire flow, auto-remove when complete |
| 2 | localStorage persistence (no account required) |
| 3 | Binders — named binders, variable grid (1×1 to 4×4), up to 20 pages |
| 3 | Binder drag-and-drop, per-condition slot tracking, Search & Add |
| 4 | Dashboard — stats bar, binder previews, To Get progress, recently added |
| 4 | Filtering & sorting on Collection and To Get pages |
| 4 | CSV export (browser Blob download, no server needed) |

### Key frontend decisions

**Entry ID format:** `${cardId}-${setCode}-${rarityCode}`  
Two printings of the same card in the same set at different rarities are tracked separately.

**Price caching:** Prices are fetched only when a card detail modal opens, then cached in localStorage until midnight. Key: `price_cache_<cardId>`.

**"Still needed" calculation:** Computed at render time as `desiredQuantity − totalOwned`. Never stored. Auto-removes To Get entry when fully acquired.

**State management:** React Context + `useReducer`. One `AppState` object holds `collection`, `toGet`, and `binders`. Persisted to localStorage on every change via `saveState()`.

---

## 3. Phase 5: Backend

### Architecture Decisions

**Why a backend at all?**  
localStorage only exists in the browser you're using. If you open the app on your phone, your collection isn't there. The backend gives the data a permanent home on a real server, accessible from any device.

**Language:** Node.js + TypeScript (consistent with the frontend — one language across the stack).

**Framework:** Express.js — minimal, widely used, easy to understand. No magic.

**Database:** PostgreSQL — the industry standard relational database. Structured data (users, collection entries) fits relational tables perfectly.

**Hosting:** Railway — auto-deploys from GitHub, includes a managed PostgreSQL instance, generous free tier. Chosen over:
- **AWS:** More powerful but complex (VPC, IAM, security groups) and the free tier expires after 12 months.
- **Supabase:** Has its own auth system that would conflict with the custom JWT approach we're building.

**Folder layout:**
```
backend/
  src/
    db/           ← database connection pool + SQL schema
    routes/       ← one file per resource (auth, collection, toget, binders)
    middleware/   ← JWT verification (applied to protected routes)
    types/        ← shared TypeScript interfaces
  server.ts       ← app entry point
  package.json
  tsconfig.json
  .env.example    ← template showing which env vars are needed (no real values)
```

**API surface:**
```
POST   /auth/register          Create account, send OTP verification email
POST   /auth/verify-email      Submit 6-digit OTP, activate account
POST   /auth/login             Returns JWT, sets refresh token as httpOnly cookie
POST   /auth/refresh           Exchange refresh token for a new JWT
POST   /auth/logout            Clear refresh token cookie
GET    /auth/me                Return current user info

GET    /collection             Get all collection entries for this user
POST   /collection             Add a card to collection
PUT    /collection/:id         Update quantity or condition
DELETE /collection/:id         Remove a card

GET    /toget                  Get all To Get entries
POST   /toget                  Add a card to To Get
PUT    /toget/:id              Update desired quantity/condition
DELETE /toget/:id              Remove
POST   /toget/:id/acquire      Acquire flow — moves entry to Collection

GET    /binders                Get all binders (with pages + slots)
POST   /binders                Create a binder
PUT    /binders/:id            Rename or resize
DELETE /binders/:id            Delete

POST   /sync                   One-time migration: upload guest localStorage data on first login
```

---

### Guest Mode

**Decision:** The entire app works without an account. localStorage is used for guests, exactly as in Phases 1–4.

**Why:** People won't give their email before they've seen why the app is valuable. Forcing a signup wall on page load kills adoption. This is the same pattern Duolingo, Figma, and many other apps use.

**How it works:**
- Guest users: Context + localStorage, same as before.
- On login/register: The app checks if there's any local data and offers a one-time migration ("You have 47 cards saved locally — import them to your account?").
- After login: The app syncs reads and writes to the API instead of localStorage.

---

### Security Measures

This section explains every security measure in the backend, why it's there, and what would happen without it.

---

#### Rate Limiting

**Package:** `express-rate-limit`

**What it does:** Limits how many requests a single IP address can make to a route in a time window. If they exceed it, the server returns `429 Too Many Requests`.

**Why it matters here:**
- **Login route:** Without rate limiting, a bot can try thousands of passwords per second (brute force attack). With a limit of 10 attempts per 15 minutes per IP, a brute force attack becomes computationally infeasible.
- **Register route:** Without it, a bot can create thousands of spam accounts in seconds, burning your database and your email quota.
- **General routes:** A loose limit (e.g. 100 requests/minute) prevents accidental or malicious server overload.

**What we set:**
- Auth routes (login, register, verify): 10 requests / 15 minutes
- All other routes: 100 requests / minute

**What happens without it:** Someone could hammer your login page with a script until they guess a password, or flood your database with fake accounts.

---

#### Password Hashing (bcrypt)

**Package:** `bcrypt`

**What it does:** Transforms a password into a fixed-length, irreversible string (a hash). When a user logs in, you hash what they typed and compare the hashes — you never compare or store the original password.

**Why it matters:**
- If your database is ever stolen, attackers get hashes, not passwords.
- bcrypt is intentionally slow (adjustable "cost factor") — hashing 10,000 passwords takes minutes, making brute force attacks against the hash impractical.
- bcrypt adds a random **salt** per hash — so two users with the same password produce completely different hashes. This prevents "rainbow table" attacks (pre-computed hash lookups).

**What happens without it:** A database breach exposes every user's actual password. Since most people reuse passwords, this is catastrophic — it compromises their other accounts too.

---

#### JWT Sessions (Access Tokens)

**Package:** `jsonwebtoken`

**What it does:** After login, the server creates a JSON Web Token (JWT) — a signed string that encodes the user's ID and an expiry time. The frontend sends this token in the `Authorization` header with every request. The server verifies the signature to confirm it's genuine and hasn't expired.

**Structure of a JWT:**
```
header.payload.signature
```
- **Header:** Algorithm used (HS256)
- **Payload:** `{ userId: 42, exp: 1717000000 }` — readable by anyone
- **Signature:** HMAC of header+payload using your `JWT_SECRET` — only you can produce this

**Why short expiry?** Access tokens expire in 15 minutes to 24 hours. If a token is stolen (e.g., via a network interception), it becomes useless after it expires. The attacker has a limited window.

**What happens without it:** A stolen token works forever, giving an attacker permanent access to a user's account.

---

#### Refresh Tokens

**What it does:** A second, longer-lived token (7–30 days) stored in an `httpOnly` cookie. When the short-lived JWT expires, the frontend silently sends the refresh token to get a new JWT — the user stays logged in without re-entering their password.

**httpOnly cookie:** This is a browser cookie that JavaScript *cannot read* — only the browser itself sends it automatically with requests to your server. This is critical because:
- If the JWT is stolen via XSS (a script injected into your page), an attacker can read it from `localStorage` or memory.
- The refresh token in an httpOnly cookie is invisible to injected scripts — it's the most secure place to store a long-lived credential in a browser.

**What happens without it:** Either users are logged out every 15 minutes (bad UX) or you make the JWT long-lived (security risk).

---

#### Input Validation (zod)

**Package:** `zod`

**What it does:** You define a schema for what valid request data looks like. Before your route handler runs, zod checks the incoming data against that schema. If anything is wrong (missing field, wrong type, value out of range), it returns a `400 Bad Request` with a clear error message.

**Example:**
```ts
const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
```
This rejects `""`, `"not-an-email"`, passwords under 8 chars, etc.

**Why it matters:** Without validation, your route handlers have to trust whatever the client sends. A malicious client (or just a buggy one) can send:
- Missing fields → your code crashes trying to read `undefined.toLowerCase()`
- Wrong types → type errors hit the database driver
- Oversized strings → 10MB in a `cardName` field crashes the server

**What happens without it:** Unpredictable crashes, data corruption, and opened doors for injection attacks.

---

#### Parameterized Queries (SQL Injection Prevention)

**Package:** Built into `pg` (the PostgreSQL Node.js driver)

**What it does:** Instead of building SQL strings by concatenating user input, you pass values *separately* from the SQL template:

```ts
// DANGEROUS — never do this:
db.query(`SELECT * FROM users WHERE email = '${email}'`);

// SAFE — parameterized:
db.query('SELECT * FROM users WHERE email = $1', [email]);
```

With parameterized queries, user input is always treated as a *value*, never as SQL syntax. The database driver handles escaping.

**Why it matters:** SQL injection is the #1 web vulnerability (OWASP). A carefully crafted input like `' OR '1'='1` can bypass login checks, and `'; DROP TABLE users; --` can destroy your database.

**What happens without it:** A single malicious input can read, modify, or delete your entire database.

---

#### Email Verification (OTP)

**Service:** Brevo or Resend (transactional email APIs)

**What it does:** On registration, the server generates a 6-digit code, stores it in the database with a 10-minute expiry, and emails it to the user. The user submits the code; the server verifies it and marks the account as `email_verified = true`. Unverified accounts cannot save data.

**Why it matters:**
- Confirms the user owns the email address they registered with.
- Prevents spam account creation (bots can't receive the email).
- Prevents someone from registering with your email to lock you out.

**What happens without it:** Anyone can register with `spam1@random.com` indefinitely, or register with your email address.

---

#### CORS (Cross-Origin Resource Sharing)

**Package:** `cors`

**What it does:** Browsers enforce a "same-origin policy" — a page at `yourbinder.vercel.app` cannot make requests to `api.railway.app` unless the server explicitly allows it. The `cors` package adds `Access-Control-Allow-Origin` headers that tell the browser "requests from this frontend URL are permitted."

**Configuration:**
```ts
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
```

`credentials: true` is required so the browser sends cookies (needed for refresh tokens).

**What happens without it:** Your frontend cannot talk to your backend at all — the browser blocks every request silently.

---

#### Security Headers (Helmet.js)

**Package:** `helmet`

**What it does:** One line — `app.use(helmet())` — sets a dozen HTTP response headers that instruct browsers to apply built-in protections:

| Header | Protection |
|---|---|
| `X-Frame-Options: DENY` | Blocks your page from being embedded in an iframe (clickjacking) |
| `X-Content-Type-Options: nosniff` | Prevents MIME-type sniffing attacks |
| `Strict-Transport-Security` | Forces HTTPS even if someone types `http://` |
| `Content-Security-Policy` | Restricts which scripts/styles can run (XSS mitigation) |
| `X-XSS-Protection` | Legacy browser XSS filter |

**Why it matters:** These are free browser-enforced protections. One line of code.

**What happens without it:** Browsers have no instructions and default to permissive behavior, leaving several attack surfaces open.

---

#### Environment Variables

**What it does:** Secrets are stored in a `.env` file locally and in the Railway dashboard in production — never in source code.

**Variables we use:**
```
DATABASE_URL=   PostgreSQL connection string (username + password + host)
JWT_SECRET=     Random 256-bit string — used to sign and verify JWTs
PORT=           Port the server listens on (Railway sets this automatically)
FRONTEND_URL=   Your Vercel URL — used by CORS
EMAIL_API_KEY=  Brevo or Resend API key for sending OTP emails
```

**Why it matters:** If `JWT_SECRET` leaks, anyone can forge tokens and log in as any user. If `DATABASE_URL` leaks, anyone can connect to your database directly.

**What happens without it:** Hardcoded secrets in your git repo are public. Bots scan GitHub for exposed credentials within minutes of a push.

---

#### Row Level Security (RLS) — Why we're NOT using it

**What it is:** A PostgreSQL feature where the database enforces that queries only return rows belonging to the current user.

**Why we're skipping it:** RLS is essential when the *frontend talks directly to the database* (the Supabase pattern). In our architecture, only our Express server talks to the database. Every query we write will include `WHERE user_id = $1` with the authenticated user's ID from the JWT. There is no way for a client to bypass this without compromising the server itself. RLS would be a redundant second check. If we ever migrate to Supabase or expose the database directly, we'd add it.

---

## 4. Key Technical Decisions

| Decision | Choice | Why |
|---|---|---|
| Auth type | Email + password | Simpler; Google OAuth deferred for self-learning |
| Token storage | JWT in memory/header + refresh in httpOnly cookie | Best security tradeoff for browser apps |
| ORM vs raw SQL | Raw SQL via `pg` | More control, easier to read and debug at this scale |
| Validation library | zod | TypeScript-native, excellent error messages |
| Email service | Brevo or Resend | Free tier sufficient; Resend has cleaner API |
| Guest mode | Full feature access, localStorage only | Lower barrier to entry for new users |
| Data migration | One-time sync on first login | Preserves work done as a guest |

---

## 5. Learning Resources

Deep-dives for topics introduced in this project:

### Authentication & JWTs
- [JWT.io](https://jwt.io) — Interactive JWT decoder, explains the structure
- [The JWT Handbook](https://auth0.com/resources/ebooks/jwt-handbook) (Auth0, free PDF)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### Password Security
- [How bcrypt works](https://auth0.com/blog/hashing-in-action-understanding-bcrypt/) — Auth0 blog, clear explanation
- [Have I Been Pwned](https://haveibeenpwned.com) — See why password leaks are a real problem

### SQL Injection
- [OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)
- [SQLZoo](https://sqlzoo.net) — Interactive SQL practice (also useful for learning PostgreSQL)

### HTTP Security Headers
- [securityheaders.com](https://securityheaders.com) — Paste any URL to see its security headers
- [MDN: HTTP Headers reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)

### Rate Limiting
- [express-rate-limit docs](https://github.com/express-rate-limit/express-rate-limit)

### CORS
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) — The definitive explainer

### PostgreSQL
- [PostgreSQL Tutorial](https://www.postgresqltutorial.com) — Comprehensive, beginner-friendly
- [Use The Index, Luke](https://use-the-index-luke.com) — When you want to understand query performance

### Express.js
- [Express official docs](https://expressjs.com)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices) — GitHub repo, very comprehensive

### zod
- [zod docs](https://zod.dev) — Official docs are excellent

### Railway
- [Railway docs](https://docs.railway.app)

---

*This file is updated as new phases are completed. Each security measure, architecture choice, and tradeoff is logged here so you can revisit and go deeper on anything after the project wraps up.*
