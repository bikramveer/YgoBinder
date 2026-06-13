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
9. [Alternate Artwork Feature](#10-alternate-artwork-feature--yugipedia-integration-2026-06-09)
10. [Price History Relocation + Search Improvements](#11-price-history-relocation--searchbrowse-improvements-2026-06-09)
11. [Dashboard Est. Value + Binder Stats + Guest Guards](#12-dashboard-est-value--binder-stats--guest-guards-2026-06-09)
12. [What's Left to Build](#6-whats-left-to-build)
13. [Key Technical Decisions](#6-key-technical-decisions)
14. [Learning Resources](#7-learning-resources)
15. [Binder UX Polish + Est. Value (2026-06-13)](#15-binder-ux-polish--est-value-2026-06-13)

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

## 11. Price History Relocation + Search/Browse Improvements (2026-06-09)

### Price history moved from CardDetailModal to Collection/Wishlist

**Why:** Price history only exists for cards users are already tracking (the cron only syncs cards in `collection_entries` / `wishlist_entries`). Showing a price chart in the general search modal was misleading — it would always be empty for most cards. The Collection and Wishlist entry modals are exactly where users who care about price trends will look.

**What changed in `CardDetailModal.tsx`:**
- Removed the `↗` price history button from the set printings table
- Removed the expandable chart row (`card-detail__chart-row`)
- Removed `historyKey`, `isExpanded`, `expandedSet`, `historyMap`, `historyLoading`, `toggleHistory`, and the `Fragment` wrapper around table rows
- Removed imports: `Fragment`, `PriceChart`, `PricePoint`, `isLoggedIn`
- Dead CSS removed: `.card-detail__history-btn`, `.card-detail__chart-row`, `.card-detail__chart-guest`, `.card-detail__price-cell`

**What was added to `CollectionPage.tsx` and `WishlistPage.tsx`:**
- `PriceChart` and `pricesApi` imported into both pages
- `selectedEntry` triggers a `pricesApi.getHistory()` fetch in a `useEffect` (cancellable via `cancelled` flag)
- Price history section added to the entry detail modal — shows spinner while loading, chart when data exists, and "Price tracking begins the day you add a card" when empty
- Guests see "Sign in to track price history" instead
- **"View all printings" button** added to the entry modal footer — closes the entry modal and opens `CardDetailModal` with that card's ID, so users can see other printings without leaving the page

**`index.css` changes:**
- `max-width` on `.entry-modal` widened 440px → 520px to fit the chart
- Added `.entry-modal__note` — small italic muted text for contextual messages

---

### Search autopopulates / No-set card filtering (2026-06-09)

**Problem 1:** SearchPage was blank until the user typed. CardPickerModal's "All Cards" tab already autopopulated with newest cards — inconsistent.

**Problem 2:** The "All Cards" tab (and now Search) default view used `sort=new`, which returns the very latest announced cards. These are pre-release OCG cards that haven't been given TCG set data yet — clicking them in the binder picker opened the configure panel with "No sets available" and a disabled "Add to tray" button. Confusing.

**Fix — filter cards with no sets:**
- `useCardSearch.ts`: removed the `if (!query.trim()) return` early exit. Hook now always fetches. Results are filtered to `(c.card_sets?.length ?? 0) > 0` before being returned.
- `CardPickerModal.tsx`: same filter applied to the All Cards tab's own fetch.

**Fix — change default sort:**
- `ygoprodeck.ts`: empty-query default changed from `sort=new` to `sort=views&sortorder=desc`.
- `sort=views desc` returns the most-viewed cards first (Dark Magician, Blue-Eyes, Ash Blossom, etc.) — these are established cards that always have sets.
- `sort=new` was returning only brand-new set-less cards, making the filtered view completely empty (as confirmed in testing).

**Fix — SearchPage autopopulates:**
- Removed `{!query && <prompt>}` / `{query && <CardGrid>}` guards.
- Added `"Popular cards"` section label shown above the grid when query is empty and results are loaded.
- Hook fires immediately (0ms delay) for empty query; still debounces 350ms when the user is typing.

---

## 12. Dashboard Est. Value + Binder Stats + Guest Guards (2026-06-09)

### Est. Value stat

**Backend — `GET /prices/collection-value`** (authenticated):
Uses a lateral join to get the most recent price snapshot for every unique `(card_id, set_code, rarity)` in the user's collection in one query:
```sql
SELECT ce.entry_key, ph.price_usd::float
FROM (
  SELECT DISTINCT ON (entry_key) entry_key, card_id, set_code, rarity
  FROM collection_entries WHERE user_id = $1
) ce
LEFT JOIN LATERAL (
  SELECT price_usd FROM price_history
  WHERE card_id = ce.card_id AND set_code = ce.set_code AND rarity = ce.rarity
  ORDER BY recorded_at DESC LIMIT 1
) ph ON true
```

**Why lateral join:** A regular JOIN would require a subquery per row or a window function to rank and deduplicate. `LATERAL` lets you run a correlated subquery per row of the outer query, selecting only the single most recent price row — clean and efficient.

**Guest fallback — `getPriceFromCache`** (`src/utils/priceCache.ts`):
Guests can't hit `/prices/collection-value` (requires auth). Instead, `getPriceFromCache(cardId, setCode, rarity)` reads the card's localStorage entry (written when the card detail modal was opened) and finds the matching `card_sets` entry by `set_code + set_rarity`. Returns `null` if the card was never opened — so guest Est. Value is partial but better than nothing.

**Frontend — `estValue` useMemo:**
Iterates all collection entries, looks up each in `priceMap` (Map<entry_key, price_usd>), multiplies by total copy count, sums. If a card has no price yet, it contributes 0.

---

### Circular SVG progress ring

**Component: `BinderRing`** in `DashboardPage.tsx`:

Uses `stroke-dasharray` + `stroke-dashoffset` on an SVG circle to draw a partial arc:
```
dasharray  = circumference (full circle length)
dashoffset = circumference × (1 - pct)  → draws pct% of the circle
rotate -90° so the arc starts at 12 o'clock (default SVG start is 3 o'clock)
```

The ring is 48×48 viewBox, radius 20, showing `%` text centered and `filled/total` sub-text below it. Both text elements use SVG `<text>` with `textAnchor="middle"`.

**Why no 3 o'clock start correction needed for `transform-origin`:** The `transform="rotate(-90 24 24)"` rotates around the circle's center (cx=24, cy=24), not the default SVG origin (0,0). Must pass the center explicitly or the rotation goes off-axis.

---

### Guest value guards

- **Est. Value stat tile:** Guests see `$-.--` with dim styling + "Sign in to track value" note. Previously showed partial guest value from cache with "Open cards to load prices" note — clearer to just gate it.
- **Binder-row est. value:** Hidden for guests via `{isLoggedIn && binderValue > 0 && ...}`. The `binderValue` is still computed (priceMap exists for guests from cache) but not displayed.
- **No animations on ring:** User found the breathing stroke-opacity pulse and glow drop-shadow "weird" — both keyframes removed. Ring is static.

---

### Binder selection screen

**Problem:** The `<select>` dropdown for binder switching was functional but felt out of place in a visual card app. With multiple binders, users wanted something they could see and click.

**Solution:** When `state.binders.length > 1` and no binder is selected, render a grid of `.binder-card` elements instead of the spread view. Each card shows:
- Cover image (or name/size placeholder with display font + accent color)
- Name, size, page count, filled/total slots, % full, owned count

**`binder` computation change:**
```ts
// Before: always auto-select state.binders[0] if no selectedBinderId
state.binders.find((b) => b.id === selectedBinderId) ?? state.binders[0] ?? null

// After: only auto-select when there's exactly 1 binder
state.binders.find((b) => b.id === selectedBinderId) ??
  (state.binders.length === 1 ? state.binders[0] : null)
```

This means multi-binder users start on the selection screen. Single-binder users still auto-open. After deleting a binder (which sets `selectedBinderId(null)`), multi-binder users return to the selection screen automatically.

**Back navigation:** When inside a binder with multiple binders available, a "← All Binders" button appears in the action bar — sets `selectedBinderId(null)`.

---

### Cropped binder cover art

**Before:** `binderCovers.ts` used `https://images.ygoprodeck.com/images/cards/{id}.jpg` — full card images with borders, text boxes, and stats.

**After:** Changed to `https://images.ygoprodeck.com/images/cards_cropped/{id}.jpg` — just the artwork, no card frame.

**Aspect ratio:** Full cards are `421 / 614` (portrait). Cropped arts are approximately square. Updated `cover-picker__item` and `.binder-card__cover` to `aspect-ratio: 1`.

**Backward compatibility:** Existing saved `coverUrl` values pointing to full-card URLs still render correctly in the binder spread (just `<img src={binder.coverUrl} />`). They won't be recognized as "selected" in the updated picker, but the user can re-pick.

---

## 6. What's Left to Build

| Phase | Feature | Notes |
|---|---|---|
| 6 | ✅ Price history | Done — daily snapshots, exchange rates; chart now in Collection/Wishlist modals |
| 7 | ✅ Binder backend sync | Done — binders fully synced, non-optimistic create/add-page. |
| — | ✅ Est. Value on Dashboard | Done — lateral join backend, guest cache fallback, per-binder value |
| — | ✅ KaibaCorp Holo-Terminal design revamp | Done — circuit board, decode effects, HoloRing, full landing page redesign |
| — | ✅ Binder UX polish + est. value | Done — ring text fix, HUD offset + connectors, default 20 pages, est. value per binder, deletion warning |
| — | Card art accuracy in binders | Scoped but not started — set-specific art not resolved in CardPickerModal "All Cards" tab or quick-add |
| — | Manual est. value (no price data) | Deferred (DB-backed) — needs `custom_price_usd` column on collection/wishlist entries |
| 8 | Mobile app | React Native, shares the Phase 5 backend. |
| — | Google OAuth | Deferred — user wants to implement to learn it. |
| — | Edition display (1st/Unlimited/Limited) | Deferred — no edition-split pricing available from free sources |
| — | Quarter Century Stampede printings | Deferred — YGOPRODeck API limitation (one entry per set_code+rarity). |

---

## 13. KaibaCorp Holo-Terminal Design Revamp (2026-06-12)

A complete visual overhaul of the app — "KaibaCorp Holo-Terminal" light theme and "Shadow Hologram" dark theme. All effects are implemented as vanilla JS IIFE modules (side-effect imports) so they work outside React's lifecycle without being tied to any component.

### New effect files

**`src/effects/holo-circuit.js`** — Procedural circuit-board canvas that auto-mounts on any `.holo-grid` element via a `MutationObserver`. Generates random traces on a 38px grid pitch, then animates traveling data pulses along the traces via `requestAnimationFrame`. Key decisions:

- **`data-circuit-fixed` attribute:** The AppLayout wrapper gets this flag, making its canvas layer `position: fixed` instead of `position: absolute`. This means the same circuit trace set persists across page navigation — no flash or rebuild as you switch tabs. Other sections (landing page hero, CTA band) still use `position: absolute` and are contained within their section.
- **`ResizeObserver`** (non-fixed only): Detects when a contained `.holo-grid` element grows (e.g. cards loading on SearchPage) and rebuilds the canvas at the new size. Without this, the canvas was built at initial element height then CSS-stretched to the new height — making traces appear zoomed in.
- **DPR-aware:** Canvas pixel dimensions are `width * devicePixelRatio` (capped at 2×). The transform matrix is set to DPR so all drawing coordinates stay in logical pixels.

**`src/effects/holo-text.js`** — Scramble-decode animation for `[data-decode]` elements. On mount and route change, each matching element randomises through a charset before settling on the real text. After animation: removes `.holo-decoding`, adds `.holo-decoded` (permanent glow via CSS). `[data-caret]` adds a blinking cursor after the last character. Also handles `.holo-input` focus tracking — lights up the `>` prompt and activates the scanning beam underline.

**`src/effects/holo-transition.js`** — Full-screen veil cross-fade for the theme toggle. When the user switches themes, a `position: fixed; inset: 0` overlay fades in to the destination background colour, the theme is applied, then the overlay fades out — masking the instant CSS variable swap.

**`src/effects/holo.css`** — All utility classes consumed by the above:
- `.holo-grid` / `.holo-grid--floor` — circuit backdrop (CSS fallback; canvas replaces it when JS runs)
- `.holo-scanlines` — CRT scanline overlay via `::after` + `repeating-linear-gradient`
- `.holo-frame` — HUD corner brackets via `::before`/`::after`
- `.holo-input` — terminal input widget with `>` prompt and scanning beam
- `.holo-decoded` — `color: var(--text) !important` + glow; applied permanently after decode
- `.holo-ring__*` — rotation animation classes for HoloRing
- `.ygo-progress` / `.ygo-progress__fill--holo` — shimmer progress bar

### New components

**`HoloRing`** (`src/components/progress/HoloRing.tsx`) — SVG HUD ring with counter-rotating bracket arcs, tick bezel, dashed counter-rotating outer ring, and a glowing progress arc. Props: `value`, `max`, `size`, `label`, `sublabel`, `caption`, `spinning`. Used on the Dashboard binder rows and BinderPage stats.

**`ProgressBar`** (`src/components/progress/ProgressBar.tsx`) — Horizontal progress bar with optional `holo` shimmer variant. The `holo` prop adds a traveling shimmer highlight via `::after` animation. Used on Dashboard wishlist progress.

### Changes to existing pages

| Page | Change |
|---|---|
| All pages | `h1` elements get `data-decode data-caret` — boot-up scramble on every route visit |
| Dashboard | `BinderRing` SVG → `HoloRing` component; custom wishlist bar divs → `<ProgressBar holo>` |
| Search | "Search & Browse" h1 added; input wrapped in `.holo-input` terminal widget |
| Collection | Input wrapped in `.holo-input`; row border changed from bottom-only to full border + hover glow |
| Wishlist | Same input + row treatment as Collection |
| BinderPage | Two flanking `HoloRing` stats (Slots filled, Slots owned) hidden below 1300px |
| AppLayout | Wrapped in `<div class="holo-grid" data-circuit-fixed>` |

### Landing page redesign

Full replacement of the old placeholder landing page:

**Hero** — `.holo-grid.holo-scanlines` section with circuit backdrop. H1 first line uses `data-decode data-caret`; second line uses `color: var(--accent)` + `.holo-glow-text` (accent glow, no decode).

**Stat ticker** — Three `CountUp` components that animate from 0 to target via `IntersectionObserver` + cubic-ease `requestAnimationFrame` loop. Triggers once when scrolled into view.

**Split light/dark preview** — A `position: relative; aspect-ratio: 16/10` container with two `clip-path: polygon()` panels (57%/43% diagonal seam). Each panel has `data-theme="light"` or `data-theme="dark"`, scoped via the `:root, [data-theme="light"]` selector added to `index.css`. The seam has a traveling dot (`animation: lpSeamDot`) and an SVG accent line.

**Live dashboard inside the preview** — Instead of a hand-coded mock, both panels render a `DashPreview` component that uses the actual `HoloRing` and `ProgressBar` with hardcoded demo data. The HoloRing bracket arcs spin, the progress bar shimmer runs — live animations, same CSS classes as the real dashboard. Scale is computed by a `ResizeObserver` on the `.lp-preview` container that sets `--preview-scale` as a CSS variable; `dashpv-scale` applies `transform: scale(var(--preview-scale))` with `transform-origin: top left`. Design width is 1100px so the scale ≈ 0.9 at full 1000px preview width.

**Features grid** — 4 cards using Lucide React icons (`Search`, `Layers`, `BookOpen`, `TrendingUp`) with `.holo-frame` corner brackets.

**CTA band** — `.holo-grid.holo-grid--floor` canvas backdrop with `data-decode` heading.

**Logo emblem** — Three stacked SVG card silhouettes with "Y" and "B" Orbitron letterforms, used in both the nav and footer.

### Key technical decisions

**Fixed circuit for AppLayout:** The circuit canvas on the AppLayout wrapper is `position: fixed` — it covers the viewport, never rebuilds on navigation, and keeps the same random traces as you move between pages. This was the root cause of the "harsh background flash" on tab switch — previously the canvas was `position: absolute` and rebuilt whenever the `.holo-grid` div resized (which happened every time new content loaded).

**`[data-theme="light"]` on `:root`:** The `:root` selector was extended to `:root, [data-theme="light"]`. This allows the light panel in the split preview (which has `data-theme="light"` on it as a child inside a `data-theme="dark"` document) to correctly receive light tokens via CSS custom property scoping.

**`.holo-decoded` uses `!important`:** The page h1 elements have component-level `color: var(--accent)` from their own classes. Without `!important`, `.holo-decoded`'s `color: var(--text)` would lose to the component class specificity. The intent is for decoded headings to always land on `--text` (white in dark, deep blue in light) — the accent color during scramble is just the animation state.

**`lucide-react` added** for landing page feature icons.

---

## 15. Binder UX Polish + Est. Value (2026-06-13)

A set of targeted UX improvements to the Binder page and related pages, plus est. value surfaced at the binder level.

### Text visibility (#1)
Dashboard section titles ("Binders", "Wishlist", "Recently Added") were barely readable — they used `var(--font-mono)`, `font-weight: 500`, and `var(--text-muted)`. Changed to `var(--font-display)`, `font-weight: 700`, `color: var(--text)` to match the visual hierarchy of page h1s. Same boost applied to `.dashboard__sub-label`.

### HoloRing text fix (#2)
The sublabel and caption text in HoloRing were both positioned at `y = C + 20`/`C + 22` — overlapping. Fixed the stacking:
- `y` of the percentage shifts up dynamically: `C - 12` when both sublabel + caption present, `C - 4` with only caption, `C + 2` with neither.
- Sublabel: `fontSize 13`, `font-weight: 700`, `color: var(--text)` — now clearly legible.
- Caption: `color: var(--accent)` to match the ring's accent color rather than invisible muted text.
- Right ring caption changed from "OWNED" with `value/totalSlots` to `value/filledSlots` — now reads as "of the cards you've placed, how many do you actually own?" which is the meaningful question.

### Binder side panel + connector lines (#2 continued)
The two HoloRings flanking the binder spread were symmetrically centered, which felt uniform and disconnected from the binder. Redesigned:
- Both rings are now in `170px` side columns (`binder-side-col`).
- Left column: `justify-content: space-between` — est. value display sits at the top, ring sits at the bottom (visually lower than binder center).
- Right column: `justify-content: flex-start` — ring sits near the top (visually higher than binder center).
- `48px` SVG connector strips (`binder-hud-connector`) sit between each column and the binder spread. The SVGs use `preserveAspectRatio="none"` to fill the full column height, drawing diagonal lines with terminal node dots (filled circle + open circle) from each HUD element to the binder edge. Left connector has two source lines (est. value top, ring bottom) converging at the binder's center; right has one (ring near top) diverging from center.
- Both columns + connectors hidden at `max-width: 1300px` (same breakpoint as before).

### Binder selection grid (#4)
Grid was `minmax(150px, 1fr)` — at 2 binders, cards stretched to fill half the viewport each. Changed to `minmax(240px, 280px)` + `justify-content: center` so cards appear at a proper size and center on the page rather than stretching.

### Default 20 pages on creation (#3)
New binders previously started with 1 page. `confirmCreate` now adds 19 more pages in parallel via `Promise.all` immediately after the binder is created. For guests this is instant (local IDs). For logged-in users, 19 parallel `POST /binders/:id/pages` requests fire simultaneously — small payloads, Railway handles it without issue.

### Est. value per binder (#5)
`BinderPage` now fetches the same price map as `DashboardPage` (`pricesApi.getCollectionValue()` for logged-in, `getPriceFromCache()` for guests). Two new computations:
- **`binderValue`**: sum of `priceMap.get(slot.entryId)` for all `source === 'collection'` slots in the current binder.
- **`binderValues`**: Map of binderId → total value, used on the "All Binders" selection screen.

The value display in the left HUD column uses `data-decode` and re-decodes whenever the formatted string changes — achieved by clearing `data-decode-text` before calling `window.HoloText.decode(el)`, which forces the animation to re-read the current `textContent`. The binder card tile on the selection screen gains a `binder-card__value` line showing the est. value. Both are hidden for guests.

### Deletion warning (#6)
Before any `REMOVE_FROM_COLLECTION` or `REMOVE_FROM_WISHLIST` dispatch, a `getBinderNamesForEntry(entryId)` check scans `state.binders[].pages[].slots[]` for any slot whose `entryId` matches. If found, a confirmation modal appears: *"[Card] is placed in your "[Binder]" binder. Removing it will also clear it from that binder."* The user must explicitly click "Remove anyway" to proceed. Covers three removal paths in CollectionPage: row button, qty-to-zero in modal, and "Remove All" modal button. Same in WishlistPage row and modal.

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
