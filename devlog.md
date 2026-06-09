# YgoBindr — Dev Log & Learning Reference

This file is a running record of everything built, every architectural decision made, and why. It's written so you can come back after the project is done and deep-dive into any topic you want to understand better.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Phase 1–4: Frontend (Complete)](#2-phase-14-frontend-complete)
3. [Phase 5: Backend](#3-phase-5-backend)
   - [Architecture Decisions](#architecture-decisions)
   - [Guest Mode](#guest-mode)
   - [Security Measures](#security-measures)
4. [Phase 5: Frontend Wiring + Deployment](#4-phase-5-frontend-wiring--deployment)
   - [What Was Built](#what-was-built)
   - [Deployment War Stories](#deployment-war-stories)
   - [Bugs Fixed After Launch](#bugs-fixed-after-launch)
5. [Custom Domain + Animations](#5-custom-domain--animations-phase-2026-06-07)
6. [Cleaning Branch](#6-cleaning-branch-2026-06-08) — Wishlist rename + multi-select CardPickerModal
7. [Price History](#7-phase-6-price-history)
8. [Binder Backend Sync](#8-phase-7-binder-backend-sync)
9. [What's Left to Build](#9-whats-left-to-build)
10. [Key Technical Decisions](#6-key-technical-decisions)
11. [Learning Resources](#7-learning-resources)

---

## 1. Project Overview

**YgoBindr** is a Yu-Gi-Oh card collection management web app.

**Stack:** React + TypeScript + Vite (frontend) · Node.js + Express + PostgreSQL (backend)  
**Deployed:** Vercel (frontend) · Railway (backend + database)  
**Repo:** https://github.com/bikramveer/YgoBindr

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

---

## 4. Phase 5: Frontend Wiring + Deployment

### What Was Built

| File | What it does |
|---|---|
| `src/services/api.ts` | Typed API client. Holds auth token in a module-level variable. UUID caches (Maps) populated on login so PUT/DELETE can find backend rows. Handles silent token refresh on 401. |
| `src/context/AuthContext.tsx` | On mount, calls `POST /auth/refresh` to restore session from cookie. Exposes `login`, `logout`, `register`, `verifyEmail`. Sets `isLoading: true` until the session check completes — prevents the navbar from flashing "Sign in" when you're actually logged in. |
| `src/components/AuthModal/` | Single component with three views: Login → Register → Verify OTP. Handles the `EMAIL_NOT_VERIFIED` error code from login by jumping straight to the verify view. OTP input is numeric-only with large letter-spacing. |
| `src/components/Navbar/` | Added "Sign in" / email + "Sign out" controls on desktop and in the mobile drawer. Hidden while `isLoading` to prevent flicker. |
| `src/context/CollectionContext.tsx` | Replaced `dispatch` with `apiAwareDispatch`: dispatches locally first (optimistic), then fires the matching API call as a fire-and-forget side effect. On login, fetches from API and replaces local state. On logout, reloads from localStorage. `saveState` only runs for guests. |
| `src/components/SyncPrompt/` | Fixed bottom banner shown after first login if local guest data exists. "Import" calls `POST /sync` then re-fetches. "Discard" dismisses cleanly. |
| `src/components/GuestBanner/` | Fixed bottom banner for guests: explains data is local-only, links to sign in. Dismissible and remembers the dismissal in localStorage. |

**Key architectural patterns:**

**Optimistic updates** — The UI always updates instantly. The API call happens after. If it fails, it's logged to console. For a personal collection tool this is the right tradeoff — the alternative (waiting for the server before updating the UI) makes every interaction feel slow.

**UUID caching** — The frontend identifies cards by a composite key like `46986414-LOB-EN005-UR`. The database identifies rows by UUID. We maintain two Maps in `api.ts` that translate between them. These are populated when you log in (via `fetchAll`) and kept current on every add. This means React state never needs to hold backend UUIDs.

**Token refresh flow** — Access tokens expire in 15 minutes. `api.ts` detects a 401, silently calls `POST /auth/refresh`, and retries the original request — all invisible to the user. If the refresh fails (cookie expired or logged out elsewhere), `onSessionExpired()` is called and AuthContext logs the user out.

**Binders are local-only** — Binder sync to the server is deferred to Phase 7. On login, binders reset to `[]` (not carried from localStorage). The SyncPrompt includes binders in its "do you have local data?" check. If you click Import, your local binders are restored to state (but not written to the server yet). If you Discard, you start with an empty binder list.

---

### Deployment War Stories

These are the real problems that came up when going from "works on my machine" to "works on Railway + Vercel." They're worth understanding because you'll hit variations of all of them in future projects.

---

#### 1. Internal vs. public database URL

Railway gives you two PostgreSQL connection strings:
- `DATABASE_URL` — uses an internal hostname (`postgres.railway.internal`) only reachable within Railway's private network
- `DATABASE_PUBLIC_URL` — uses a public hostname, reachable from anywhere

**What happened:** Using `DATABASE_URL` locally gave `ENOTFOUND postgres.railway.internal`. The hostname doesn't exist outside Railway.

**Fix:** Use `DATABASE_PUBLIC_URL` in your local `.env`. Use `DATABASE_URL` in Railway's environment variables (for the deployed service, which is inside the network).

---

#### 2. Railway's reverse proxy and rate limiting

Railway puts a reverse proxy in front of your server. The proxy adds an `X-Forwarded-For` header with the real client IP. But `express-rate-limit` saw this header and threw:

```
ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
```

Because Express didn't know it was behind a proxy (and couldn't verify the header wasn't forged by a client).

**Fix:** `app.set('trust proxy', 1)` — tells Express to trust the first hop in `X-Forwarded-For`. This must come before you attach any rate limiters.

**Why it matters:** If you skip this, rate limiting doesn't work correctly — it'll either crash or rate-limit by the proxy's IP (blocking everyone) instead of the real client IPs.

---

#### 3. Vite bakes environment variables at build time

Vite replaces `import.meta.env.VITE_*` at build time, not runtime. So if `VITE_API_URL` isn't set when Vercel builds your app, every API call in the built bundle will point to `undefined` (which defaults to `localhost:3001`).

**What happened:** The app was deployed but all API calls were going to `localhost:3001` in the user's browser — a server that doesn't exist there.

**Fix:** Add `VITE_API_URL=https://your-railway-url.up.railway.app` in Vercel → Settings → Environment Variables, then redeploy. Vercel won't pick it up until a new build runs.

**Lesson:** Environment variables in Vite are fundamentally different from Node.js — they're compile-time constants, not runtime values.

---

#### 4. CORS and preview deployment URLs

Vercel creates a unique URL for every deployment (e.g. `ygo-binder-abc123-bikramveers-projects.vercel.app`). The production URL is stable (`ygobinder.vercel.app`).

**What happened:** Testing from a preview URL. Railway's CORS only whitelists the production URL stored in `FRONTEND_URL`. Browser blocked the request.

**Fix:** Always test from the production URL (Vercel → Settings → Domains). CORS errors are always about origin mismatch — read the error message carefully, it tells you exactly what origin was sent vs. what was expected.

---

### Bugs Fixed After Launch

#### `entry_key` missing from database

This column was added to the schema mid-development to solve a problem: the frontend identifies cards by a composite key (`${cardId}-${setCode}-${rarityCode}`) but the backend only stored the full rarity name (e.g. "Ultra Rare"), not the short code ("UR"). Without storing the frontend key explicitly, there was no way to reconstruct it from the backend.

The Railway database was set up before this column was added. Every INSERT into `collection_entries` and `toget_entries` was failing with a NOT NULL violation and rolling back.

**Fix:** Drop and recreate the affected tables using the current `schema.sql`, which includes `entry_key`. Since there was no real data yet, this was safe.

**Lesson:** When you change a schema mid-development, you need a migration. Future schema changes should be accompanied by a SQL migration file (e.g. `migrations/002_add_entry_key.sql`).

---

#### `sync.ts` wrong conflict targets

The sync route — which imports guest localStorage data on first login — had two bugs in its INSERT statements:

1. Missing `entry_key` column in the INSERT → NOT NULL violation → entire transaction rolled back
2. `ON CONFLICT (user_id, card_id, set_code, rarity, condition)` — these columns don't form a UNIQUE constraint. The actual constraint is `(user_id, entry_key, condition)`. PostgreSQL requires the conflict target to exactly match a unique constraint.

Also, `api.ts` wasn't sending `entryKey` in the sync payload, so even with a fixed INSERT the value would be missing.

**Fix:** Added `entry_key` to both INSERTs, corrected conflict targets, added `entryKey: entry.id` to the sync payload in `api.ts`.

---

#### Binders persisting across login/logout

When a user logged in, binders were being carried over from localStorage even if they clicked "Discard" on the sync prompt. Root cause: `loadFromApi()` was dispatching `binders: stateRef.current.binders` instead of `binders: []`.

**Fix:** `loadFromApi()` always sets `binders: []`. If the user clicks Import, `localSnapshot.binders` is restored. If they click Discard, binders stay empty — correct "start fresh" behavior.

---

#### Resend free tier limitation

Resend's free tier only allows sending emails to the address used to sign up for Resend. Attempting to send to any other address returns a 403.

**This is expected behavior** — Resend requires domain verification before you can send to arbitrary recipients.

**What you need to do before launch:** Verify a domain you own in Resend (add a few DNS records). Once verified, you can send to anyone. Resend walks you through it in their dashboard.

---

## 5. Custom Domain + Animations Phase (2026-06-07)

### Custom Domain Setup

**Domain:** `ygobindr.com`

| Service | Config | Notes |
|---|---|---|
| Vercel | `ygobindr.com` → 308 → `www.ygobindr.com` (Production) | Vercel treats www as the Production deployment |
| Railway | `FRONTEND_URL=https://www.ygobindr.com`, `api.ygobindr.com` CNAME → Railway URL | Must use www, not apex |
| Resend | `EMAIL_FROM=YgoBindr <noreply@ygobindr.com>` in Railway env vars | Domain verified with DNS records |

**War stories:**

**CORS blocked after domain switch:** `FRONTEND_URL` in Railway had escaped quotes (`"\"https://ygobindr.com"`) and pointed to the apex domain instead of www. Vercel routes apex → 308 redirect → www, so CORS comparisons failed because the origin arriving at Railway was `https://www.ygobindr.com` but the allowed origin was `https://ygobindr.com`. Fix: `FRONTEND_URL=https://www.ygobindr.com` (no quotes, www prefix).

**OTP emails not sending:** `EMAIL_FROM` env var wasn't set in Railway. The backend fell back to Resend's default sender `onboarding@resend.dev`, which is restricted to the Resend account owner's email on the free tier. Fix: add `EMAIL_FROM=YgoBindr <noreply@ygobindr.com>` to Railway env vars after verifying the domain in Resend.

---

### Landing Page

**File:** `src/pages/LandingPage.tsx` + `src/pages/LandingPage.css`

A public-facing entry point at `/`. Key decisions:

**Guest CTA → `/search` directly:** "Start your collection →" navigates guests to the Search page without requiring an account. The goal is zero friction for new users — they can explore the app immediately and only need to sign up when they want data to persist across devices.

**Auto-redirect logged-in users:** `useEffect` + `useAuth` check: if `user` is set, immediately navigate to `/dashboard`. The landing page is for people who aren't in yet.

**No navbar on landing:** Landing page uses a sticky minimal header (logo + Sign in button), not the full app navbar. The app navbar only appears on authenticated/app routes inside `AppLayout`.

**App.tsx restructure:** Added `AppLayout` component wrapping `<Outlet>`. Route `/` renders `LandingPage` outside `AppLayout` (no navbar); all other routes are children of `AppLayout`.

---

### Book-Style Binder Spread

**Files:** `src/pages/BinderPage.tsx` (full rewrite), `src/pages/BinderPage.css`

**Spread math:**
- Spread 0: cover page (left) + `pages[0]` (right)
- Spread n (n≥1): `pages[2n-1]` (left) + `pages[2n]` (right)
- `spreadCount = 1 + Math.ceil(Math.max(0, pages.length - 1) / 2)`

**Why always keep a page on spread 0's right side:** The first page is always visible when you open the binder. The cover is the left side of spread 0. If you have 0 pages, you just see the cover.

**Page-turn animation (scaleX):**
```
animState: 'idle' | 'out' | 'in'
flipDir: 'forward' | 'back'
pendingSpreadIndex: number | null
```
Flow: `goToSpread(n)` → sets flipDir, pendingSpreadIndex, animState='out' → CSS applies flip-out class → `onAnimationEnd` fires → sets displayedSpreadIndex=pending, animState='in' → CSS applies flip-in → `onAnimationEnd` fires → animState='idle'.

**Why scaleX not rotateY:** A true 3D `rotateY` requires the content on both sides of the page to be rendered simultaneously (front-face content + back-face content). With scaleX (collapse to 0 then expand from 0), you swap the content mid-animation. Simpler, no 3D transform layer, same visual feel at this scale.

**transform-origin matters for direction feel:**
- Forward (next page, content moves LEFT like turning a book): both out and in use `transform-origin: left center`
- Back (previous page, content moves RIGHT): both use `transform-origin: right center`

**Add pages → animates to new spread:** `addTwoPages()` awaits both API calls, then triggers the normal flip animation via `setFlipDir/setPendingSpreadIndex/setAnimState('out')` instead of jumping directly to the new spread.

---

### Binder Cover Feature

**New files:** `src/components/Binder/binderCovers.ts`, `BinderCoverPicker.tsx`, `BinderCoverPicker.css`

**9 preset covers:** Popular cards pulled from the YGOPRODeck CDN (`https://images.ygoprodeck.com/images/cards/{passcode}.jpg`): Dark Magician, Dark Magician Girl, Blue-Eyes White Dragon, Red-Eyes Black Dragon, Slifer the Sky Dragon, Obelisk the Tormentor, The Winged Dragon of Ra, Time Wizard, Pot of Greed.

**Why flat card images instead of binder photos:** The original implementation used Konami binder product photos (angled 3D renders). Replaced with flat card art images — these are what users know and care about, and they're also what gets displayed in the spread view as the cover page, so they look natural in context.

**DB change:** `ALTER TABLE binders ADD COLUMN IF NOT EXISTS cover_url VARCHAR(500);` — must be run against Railway DB if setting up from an existing schema.

**Cover in spread view:** The cover is absolutely positioned within its flex column (`.binder-spread__page--left { position: relative }`). This takes it out of flow so the flex line height is determined solely by the card grid on the right. Then the cover fills `inset: 0` — always matching the card page height regardless of viewport. `object-fit: contain` shows the full card without cropping.

---

### Site-Wide Animations

**File:** `src/index.css`

| Animation | Trigger | Implementation |
|---|---|---|
| Route fade-in | `.page` class | `fadeIn` keyframe: opacity 0→1 + translateY 6px→0, 0.2s, fill-mode: backwards |
| Modal entrance | `.modal` class | `modalIn` keyframe: opacity 0→1 + scale 0.94→1, 0.18s |
| Card slot hover lift | `.binder-slot:hover` | `translateY(-2px) scale(1.03)`, box-shadow, z-index: 1 |
| Button press | `.btn:active:not(:disabled)` | `scale(0.96)` |

**Critical: `fill-mode: backwards` not `both` on `.page`:**

`animation-fill-mode: both` = `forwards + backwards`. `forwards` keeps the final keyframe values applied after the animation ends. If the final keyframe includes `transform: translateY(0)` or even `transform: none`, some browsers still create a CSS stacking context on the element while the animation fill is active. A stacking context on `.page` means any `position: fixed` child (like `.modal-backdrop`) is positioned relative to `.page` instead of the viewport — the backdrop clips to the page's max-width and doesn't cover the navbar.

**Fix:** `fill-mode: backwards` — only applies the `from` keyframe before the animation starts (during any delay). After the animation completes, the fill is removed and the element returns to its natural styles. No persistent stacking context. ✓

---

### Bugs Fixed

**CORS blocked on custom domain:** See Domain section above.

**OTP not sending on custom domain:** See Domain section above.

**Modal off-screen (showing only lower half):** The `.modal` class has `max-height: 90vh; overflow-y: auto`. The create binder modal with the cover picker exceeded the viewport height, and `align-items: center` on the backdrop centered a >100vh element with its top cut off. Fixed by making the cover picker `max-height: 220px; overflow-y: auto` so the modal fits within 90vh.

**Modal backdrop not covering full screen:** The `fadeIn` animation's fill mode was creating a stacking context on `.page`. Fixed by switching from `fill-mode: both` to `fill-mode: backwards`. See Animation section above for full explanation.

**Page flip direction reversed:** `transform-origin: right center` on `flip-out-forward` made pages appear to move right when going to the next spread. Swapped: forward animations use `left center`, back animations use `right center`.

**Cover image too tall relative to card grid:** Cover's `<img>` has a natural intrinsic height of 614px (ygoprodeck card image size). With `align-items: stretch`, the flex line height = max(card grid height, cover intrinsic height) = 614px on smaller viewports, making the cover much taller than the card grid. Fixed by making the cover `position: absolute; inset: 0` inside a `position: relative` left page wrapper — takes the img out of flow, flex line is determined by the card grid alone.

**TypeScript build errors (TS18047):** `dragSource?.pageId === pageId ? dragSource.slotIndex : null` — optional chain `?.` doesn't narrow `dragSource` to non-null in the ternary's true branch. Fixed with explicit null check: `dragSource !== null && dragSource.pageId === pageId ? dragSource.slotIndex : null`.

---

## 7. Cleaning Branch (2026-06-08)

### "To Get" → "Wishlist" Rename

Renamed the entire "To Get" concept to "Wishlist" — everywhere: display strings, state keys, TypeScript types, action types, route names, CSS classes, and the PostgreSQL table.

**Why rename?** "To Get" was awkward English. "Wishlist" is the standard term users expect.

**Scope of changes:** `backend/src/server.ts`, `routes/sync.ts`, `routes/binders.ts`, `services/priceSync.ts`, `db/schema.sql`, `src/pages/DashboardPage.tsx` + `.css`, `src/pages/SearchPage.tsx`, `src/components/Binder/BinderSlot.tsx`, `BinderCardModal.tsx`.

`src/utils/storage.ts` kept backwards compatibility:
```typescript
(parsed as any).wishlist ?? (parsed as any).toGet ?? []
```
Existing guest users' localStorage has the old `toGet` key — reading both ensures they don't lose data after the update.

**DB migration (`001_rename_toget_to_wishlist.sql`) — critical ordering:**

You can't `UPDATE binder_slots SET source = 'wishlist'` while the old CHECK constraint `('collection', 'toGet')` is still in place — PostgreSQL rejects the new value. Fix: drop the CHECK constraint first, run the UPDATE, then add the new constraint.

```sql
ALTER TABLE toget_entries RENAME TO wishlist_entries;
ALTER TABLE binder_slots DROP CONSTRAINT IF EXISTS binder_slots_source_check;  -- MUST come before UPDATE
UPDATE binder_slots SET source = 'wishlist' WHERE source = 'toGet';
ALTER TABLE binder_slots ADD CONSTRAINT binder_slots_source_check CHECK (source IN ('collection', 'wishlist'));
```

A rollback script (`001_rollback.sql`) was saved alongside it.

---

### Multi-Select "Add Cards" Modal (CardPickerModal rewrite)

Replaced the old single-slot picker with a full multi-select modal. Old flow: click a slot → pick one card → done. New flow: click a slot → pick as many cards as you want → confirm → auto-fill empty slots forward from the clicked slot.

**Why multi-select?** When filling a binder you often want to drop 9–16 cards at once. The old flow required clicking every slot individually — tedious.

**New `TrayItem` interface (exported from `CardPickerModal.tsx`):**
```typescript
export interface TrayItem {
  id: string;
  entryId: string;
  source: 'collection' | 'wishlist';
  condition?: Condition;
  cardName: string;
  cardImageUrl: string;
  pendingCard?: YGOCard;   // card that needs to be added to a list before placing
  pendingSet?: YGOCardSet;
}
```

**Three tabs:**

- **Owned** — cards from the user's collection. Filter by search, rarity, and set. Clicking the tile uses the best available condition; clicking a condition chip uses that condition. Chips show available copy count. Best-condition chip gets a `--best` CSS modifier.
- **Wishlist** — cards from the user's wishlist. Simpler tiles (no condition chips), fully clickable.
- **All Cards** — full YGOPRODeck database search. Shows newest cards by default (empty query). After selecting a card, a configure panel appears to pick set, condition, and target list before placing in binder.

**Collection tile consistency fix:** The old modal required clicking a condition chip on collection tiles, while wishlist tiles were fully clickable — inconsistent. Fixed: collection tiles are now fully clickable divs (adds best available condition); chips are still present for precision and stop propagation so they don't trigger the tile click.

Implemented using `role="button"` on the div with `onClick`, and `e.stopPropagation()` on the chips container — avoids invalid button-in-button HTML nesting.

**Auto-fill logic (in `BinderPage.tsx`):**

When the user clicks a slot, pre-compute `emptySlotCount` — the number of empty slots from that slot forward. This caps how many cards can be selected in the modal. On confirm, walk the same forward path and assign one `TrayItem` per empty slot in order.

```typescript
const emptySlots: Array<{ pageId: string; slotIndex: number }> = [];
let started = false;
for (const p of binder.pages) {
  for (let i = 0; i < slotCount; i++) {
    if (!started) {
      if (p.id === modal.pageId && i === modal.slotIndex) started = true;
      else continue;
    }
    if (!p.slots[i]) emptySlots.push({ pageId: p.id, slotIndex: i });
  }
}
for (let i = 0; i < Math.min(items.length, emptySlots.length); i++) {
  dispatch({ type: 'ASSIGN_BINDER_SLOT', ... });
}
```

**Tray:** Horizontal scrolling row of selected card thumbnails at the bottom. Each has a × remove button. "Add N to binder" is disabled when empty.

---

### "All Cards" Tab — Auto-Populate

Changed `ygoprodeck.ts` to use `sort=new` when no search query is present:
```typescript
if (query.trim()) {
  params.set('fname', query);
} else {
  params.set('sort', 'new'); // show newest cards instead of blank state
}
```

Also removed debounce for initial/filter-only loads in the picker modal so the tab populates immediately on open.

---

### Vercel Build Error — Cascade TypeScript Failure

After the rename, Vercel reported two errors on `SearchPage.tsx`:
1. `Type '"ADD_TO_TO_GET"' is not assignable` — that file was missed during the rename
2. `'id' does not exist in type 'BinderSlot'` — cascade: TypeScript couldn't match the invalid action type against the discriminated union and fell through to structural matching against `ASSIGN_BINDER_SLOT` (which has `entry: BinderSlot | null`), making `id` appear invalid

**Lesson:** When you see unexpected type errors in a reducer dispatch, look for an invalid action type string first. One mistyped `type:` value can produce misleading secondary errors elsewhere in the same file.

Fix: `'ADD_TO_TO_GET'` → `'ADD_TO_WISHLIST'` in `SearchPage.tsx` resolved both.

---

## 8. Phase 6: Price History (Complete)

### What was built

Daily price snapshots for every card tracked across all users. The system runs once per day, fetches current prices from YGOPRODeck, and stores a snapshot so users can see how prices have moved over time.

**Backend:**
- `price_history` table — `(card_id, set_code, rarity, price_usd, recorded_at)` with a UNIQUE constraint so re-running the sync on the same day is safe (`ON CONFLICT DO NOTHING`).
- `exchange_rates` table — `(currency, rate, recorded_at)`. Same daily snapshot approach. Stores CAD, EUR, GBP, AUD, JPY relative to USD.
- `priceSync.ts` — queries `collection_entries UNION wishlist_entries` for all distinct `(card_id, set_code, rarity)` across all users. Groups by card_id (one API call per card fetches all its set prices). Inserts matching snapshots. Sleeps 300ms between cards to avoid hammering the free YGOPRODeck API.
- `GET /prices` (authenticated) — returns price history for a specific `(cardId, setCode, rarity)` over a configurable window (default 90 days). JOINs `exchange_rates` on `recorded_at` so each data point carries historically accurate rates — not today's rate applied backward.
- `GET /prices/rates` (public) — returns the most recent exchange rates. Used by guests who can't call `/prices` but still want currency conversion in the card detail modal.
- `POST /prices/sync` (authenticated) — manual trigger for testing. Remove before public launch.

**Frontend:**
- `PriceChart.tsx` — SVG line chart with area fill, hover tooltips, and Y-axis labels. Renders inside `CardDetailModal` when price history is available. Currency selector converts all data points using the historically accurate rates baked into each `PricePoint`.
- Exchange rates fetched once on app load and stored in context; used for current-price display throughout the app.

**Key decision — historically accurate rates:** When you join `price_history` with `exchange_rates` on `recorded_at`, each data point reflects what the exchange rate was on that actual day, not what it is today. Without this join, applying today's rate to a 6-month-old USD price in a volatile currency produces a misleading chart.

---

## 9. Phase 7: Binder Backend Sync (Complete)

### What was built

Binders are now fully synced to the server for logged-in users. Previously binders were local-only (localStorage) and reset to `[]` on login.

**Schema changes:**
- `binder_slots` uses `entry_key VARCHAR` + `source VARCHAR` instead of a UUID FK — consistent with how collection/wishlist entries are identified in the frontend.
- `source` CHECK constraint updated to `('collection', 'wishlist')` (was `'toGet'`).

**API surface added:**
```
GET    /binders                      All binders with pages + slots (nested JSON)
POST   /binders                      Create a binder (returns server-assigned UUID)
PUT    /binders/:id                  Rename or update cover
DELETE /binders/:id                  Delete binder + cascade pages + slots
POST   /binders/:id/pages            Add a page (returns server-assigned UUID)
DELETE /binders/:id/pages/:pid       Remove a page
PUT    /binders/:id/pages/:pid/slots/:pos   Assign or clear a slot
```

**Frontend wiring:**
- `CREATE_BINDER` and `ADD_BINDER_PAGE` are **non-optimistic** — the server UUID is needed before dispatch so the frontend can reference it in subsequent slot assignments. Both `await` the API call, then dispatch with the server-returned `id`.
- All other binder actions (`RENAME_BINDER`, `DELETE_BINDER`, `REMOVE_BINDER_PAGE`, `ASSIGN_BINDER_SLOT`, `MOVE_BINDER_SLOT`) are optimistic — dispatch fires immediately, API call is fire-and-forget.
- `SyncPrompt` now imports binders on "Import" (was sending `binders: []` before — a bug where local binders were silently discarded on first login).

**Why non-optimistic for create/add-page:** Creating a binder or page requires a server-assigned UUID. Any slot assignment that follows needs to reference the correct UUID. If you dispatch optimistically with a client-side UUID and the POST fails, every subsequent slot assignment will silently 404. The roundtrip cost (one extra network hop) on create is acceptable; all subsequent interactions are optimistic.

---

## 10. Alternate Artwork Feature — Yugipedia Integration (2026-06-09)

### What was built

Per-printing rarity-specific card images in the CardDetailModal set table, an expanded artwork picker (beyond YGOPRODeck's 2-image limit), and a correct confirmation screen when adding a card.

**New file:** `src/services/yugipediaArtwork.ts`

**Edited:** `src/components/CardDetailModal/CardDetailModal.tsx`

---

### Why Yugipedia

YGOPRODeck's API only provides up to 2 artwork variants for any card (`card_images` array). But some cards have 3 or more (e.g. I:P Masquerena has 4 distinct artworks across sets LOCH, RA02, RA05). YGOPRODeck also doesn't distinguish between rarity prints of the same set — it has one image per artwork index regardless of whether the UR, CR, or StR print looks different.

Yugipedia stores per-printing gallery images following a consistent filename pattern:
```
CardName-SetCode-Region-RarityCode[-Edition][-AA].extension
```
For example: `InstantFusionMasquerena-RA02-EN-UR-1E.png`

This means you can:
1. Map each set printing to its artwork index (from the card's wikitext `| image =` section)
2. Fetch the actual rarity-specific image URL for any `setCode|rarityCode` pair

---

### Three-call architecture

Each card name triggers up to 3 sequential Yugipedia API calls (1 req/sec, 30-min localStorage cache keyed `ygo-data2-${cardName}`):

**Call 1 — wikitext → `artMap`**
```
GET /api.php?action=query&prop=revisions&rvprop=content&titles={cardName}
```
Parses the `| image =` section for lines like `2; CardName-RA02-EN-UR-1E.png` → maps set code → artwork index (0-based: the wikitext uses 1-based).

```ts
const re = new RegExp(`(\\d+)(?:\\.\\d+)?;\\s+${cardNorm}-([A-Z0-9]+)-`, 'gm');
// artMap = { QCAC: 0, L26D: 0, RA02: 1, RA05: 2, LOCH: 3 }
```

**Call 2 — gallery image list → `rawMap`**
```
GET /api.php?action=query&prop=images&imlimit=500&titles=Card gallery:{cardName}
```
Returns all filenames on the gallery page (~50–150 per card). `buildRawMap` parses each to extract `setPrefix|rarityCode` as the map key. **Only EN/NA/AE regions are kept** — this prevents JP/KR/SC filenames (which share the same key format) from overwriting the EN entry, since galleries list all regions.

```ts
const EN_REGIONS = new Set(['EN', 'NA', 'AE']);
if (!EN_REGIONS.has(parts[1])) continue; // skip JP, KR, SP, SC, etc.
```

**Call 3 — imageinfo batch → CDN URLs**
```
GET /api.php?action=query&prop=imageinfo&iiprop=url&titles=File:name1|File:name2|...
```
Resolves each EN/NA filename to its actual Yugipedia CDN URL. Batched in groups of 50. Result stored as `galleryMap: Map<setPrefix|rarityCode, { baseUrl?, altUrl? }>`.

---

### The EN overwrite bug

**Symptom:** Only 2 CDN URLs resolved out of 56 gallery images.

**Root cause:** `buildRawMap` used `setPrefix|rarityCode` as the key with no region in it. Yugipedia galleries list EN first, then JP, KR, SC for the same set. The JP entry for `RA02|UR` was overwriting the EN entry, so by the time `buildRawMap` was done, most keys held JP filenames. The `EN_REGIONS` filter in the imageinfo stage then found almost nothing.

**Fix:** Filter out non-EN regions *in `buildRawMap`* before any key is written — not after. This way JP/KR filenames never enter the map at all.

**After fix:** `rawMap has 23 entries`, `24 EN/NA files to imageinfo-resolve`, `20 CDN URLs resolved` — working correctly.

---

### Fallback chain in `yugipediaImageUrl`

When the CardDetailModal needs an image for a `(setPrefix, rarity)` pair:

1. **Exact `setPrefix|rarityCode` match** — rarity-specific image exists (e.g. RA02 UR uploaded to Yugipedia)
2. **Any image from the same set** — set exists but this specific rarity hasn't been uploaded yet (e.g. RA05 StR not yet on Yugipedia → use RA05 UR which was uploaded)
3. **`null` → caller falls back to YGOPRODeck** — set has no Yugipedia gallery images at all

---

### CardDetailModal changes

**`totalArtworks` (useMemo):** Expands the picker beyond YGOPRODeck's `images.length`. Uses the max artwork index seen in `artMap` (plus 1). If Yugipedia says a card has artworks at indices 0, 1, 2, 3 but YGOPRODeck only has 2 images, the picker shows 4 thumbnails.

```ts
const totalArtworks = useMemo(() => {
  if (setArtworkMap.size === 0) return images.length;
  const maxArtIdx = Math.max(...setArtworkMap.values());
  return Math.max(images.length, maxArtIdx + 1);
}, [images.length, setArtworkMap]);
```

**`getArtworkUrl` (useCallback):** Resolves an artwork index to a URL. Tries YGOPRODeck first (fast, reliable); if the index is beyond `images.length`, searches `galleryMap` for a Yugipedia CDN URL. Falls back to Art 1 if nothing found.

**Art column:** Each row in the set printings table shows the correct per-printing image (Yugipedia CDN URL if available, YGOPRODeck if not). Clicking the thumbnail updates the main card header.

**Confirmation screen:** When clicking "+ Collection" on a row, `openAddForm` looks up the artwork index from `artMap`, calls `yugipediaImageUrl` to get the rarity-specific URL, and stores it as `addState.artworkUrl`. The confirmation screen's header image (the main card display) updates to show exactly this image — no separate "Selected artwork" row.

---

### Key numbers for I:P Masquerena

```
artMap:    { QCAC: 0, L26D: 0, RA02: 1, RA05: 2, LOCH: 3 }
rawMap:    23 entries
EN/NA:     24 files sent to imageinfo
Resolved:  20 CDN URLs
galleryMap: 19 entries with URLs
```

Picker shows 4 thumbnails (totalArtworks = 4). Adding from RA02 shows alternate art; adding from RA05 shows the 3rd artwork image; adding from LOCH correctly uses the 4th. YGOPRODeck only provided 2.

---

## 6. What's Left to Build

| Phase | Feature | Notes |
|---|---|---|
| 6 | ✅ Price history | Done — daily snapshots, exchange rates, SVG chart in card modal. |
| 7 | ✅ Binder backend sync | Done — binders fully synced, non-optimistic create/add-page. |
| 8 | Mobile app | React Native, shares the Phase 5 backend. |
| — | Google OAuth | Deferred — user wants to implement to learn it. |
| — | Est. Value stat on Dashboard | Needs bulk price fetching in the backend. |

---

## 6. Key Technical Decisions

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

## 7. Learning Resources

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
