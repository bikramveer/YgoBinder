# YgoBinder — Product Requirements Document

## Overview

YgoBinder is a web application for Yu-Gi-Oh collectors to manage their physical card collection. Users can search the full card database, mark cards they own (with specific set printings, quantity, and condition), and maintain a "To Get" watchlist with live price data to help them complete their collection efficiently. The app is designed to grow from a local-only MVP into a full cross-device platform with user accounts, price history, and a mobile app.

---

## Goals

- Give collectors a single place to track what they own and what they're hunting for.
- Surface per-set pricing so users can make informed purchasing decisions.
- Keep data persistent across sessions and, later, across devices.
- Track card condition so condition-conscious collectors can record exactly what they have.

---

## User Stories

| # | As a user, I want to… | So that… |
|---|---|---|
| 1 | Search for any Yu-Gi-Oh card by name | I can quickly find a specific card |
| 2 | See all available set printings for a card | I know which prints exist and can pick the one I want |
| 3 | See current market price (or out-of-stock status) for each printing | I can decide what's worth buying |
| 4 | Add a specific card+set combination to my Collection with quantity and condition | I can track exactly what I own |
| 5 | Remove or update a card in my Collection | I can correct mistakes or reflect trades |
| 6 | Add a specific card+set combination to my To Get list with quantity and condition preference | I can track what I'm still hunting for |
| 7 | Remove or mark a To Get card as acquired (moves it to Collection) | I can close the loop when I buy a card |
| 8 | Browse my Collection and To Get list | I can see my full inventory at a glance |
| 9 | Filter/sort my lists (by name, set, price, condition) | I can prioritize purchases |
| 10 | See a total estimated value of my Collection | I know roughly what my collection is worth |
| 11 | Export my Collection or To Get list as a CSV | I can share it with a store or keep a local backup |
| 12 | Log in and have my data sync across devices | I can use the app on my phone and PC |
| 13 | See historical price trends for a card | I can decide whether now is a good time to buy |

---

## Features

### 1. Card Search

- Full-text search against the YGOPRODeck public API (`https://db.ygoprodeck.com/api/v7/`).
- Search by card name (partial match supported).
- Results show: card image thumbnail, name, type, attribute, level/rank, ATK/DEF.
- Clicking a result opens the Card Detail view.

### 2. Card Detail View

- Full card image, name, description/effect text, and stats.
- **Set Printings table**: lists every set the card was printed in, including:
  - Set name and set code
  - Rarity
  - TCGPlayer market price (sourced from YGOPRODeck's bundled price data, refreshed on load)
  - Out-of-stock / no-listing indicator when no price data is available
- Action buttons per printing row:
  - "Add to Collection" — opens a small form to set quantity and condition, then saves
  - "Add to To Get" — opens a small form to set desired quantity and minimum acceptable condition, then saves
- If a printing is already in Collection or To Get, the button reflects that state (with an edit option).

### 3. My Collection

- Lists all card+printing combinations the user owns.
- Columns: Card image (small), Card name, Set name, Set code, Rarity, Condition, Quantity, Market price (refreshed on load), Date added.
- Inline "Edit" (update quantity/condition) and "Remove" buttons per row.
- Summary footer: total unique cards, total copies owned, total estimated market value.
- Sort by: name, set, price, condition, date added.
- Filter by: rarity, set name, card type, condition.
- **CSV Export**: downloads collection as a CSV file (card name, set, set code, rarity, condition, quantity, price at export time).

### 4. My To Get List

- Same structure as Collection, with a "desired condition" field instead of an owned condition.
- Additional "Mark as Acquired" button per row — prompts for actual condition received, then moves entry to Collection.
- Sorted by price (cheapest first) by default.
- **CSV Export**: same as Collection export — useful for sending to card stores.

### 5. Price Data

- Prices are pulled from YGOPRODeck's card set price data (which aggregates TCGPlayer market prices).
- Prices refresh on every page load so the user always sees current data.
- "No price available" label shown when a printing has no market data.
- **Future (Phase 5)**: price history chart per card, showing price over time.

### 6. Card Condition

Supported condition grades (standard TCG grading scale):

| Code | Label |
|---|---|
| NM | Near Mint |
| LP | Lightly Played |
| MP | Moderately Played |
| HP | Heavily Played |
| DMG | Damaged |

- Collection entries record the condition of the copy owned.
- To Get entries record the minimum acceptable condition the user is willing to buy.

### 7. Quantity Tracking

- Collection entries store a quantity (integer ≥ 1) to handle duplicate copies.
- To Get entries store a desired quantity so users can track how many copies they still need.

### 8. Persistence — MVP

- All data stored locally in the browser using `localStorage`.
- No account required for MVP.

### 9. Persistence — Post-MVP (Phase 3+)

- User accounts with email/password authentication (and optionally OAuth via Google).
- Data stored in a backend database.
- Seamless sync across browser and mobile.

---

## Technical Architecture

### MVP (Phases 1–2)

- **Frontend**: React (Vite) + Tailwind CSS
- **State**: React Context + `useReducer`, persisted to `localStorage`
- **Routing**: React Router — Search, Collection, To Get (three main views)
- **Backend**: None — pure SPA calling YGOPRODeck directly
- **Hosting**: Static host (e.g. Vercel, Netlify)

### Post-MVP (Phase 3+)

- **Backend**: Node.js + Express (or similar lightweight framework)
- **Database**: PostgreSQL — user accounts, collections, to-get lists, price snapshots
- **Auth**: JWT-based sessions; bcrypt for password hashing; optional OAuth
- **Mobile**: React Native (code-sharing with web components where possible) or PWA as a stepping stone

### Data Source

- **YGOPRODeck API** — free, no API key required, ~13k cards, updated regularly.
  - Card search: `GET /cardinfo.php?fname=<query>&num=20&offset=0`
  - Card detail + set prices: `GET /cardinfo.php?name=<exact_name>`
  - Card images: `https://images.ygoprodeck.com/images/cards/<card_id>.jpg`

### Local Data Model (localStorage / DB schema basis)

```ts
interface CardEntry {
  id: string;              // "<card_id>-<set_code>" composite key
  cardId: number;          // YGOPRODeck card ID
  cardName: string;
  cardImageUrl: string;
  setName: string;
  setCode: string;         // e.g. "LOB-EN001"
  rarity: string;
  condition: "NM" | "LP" | "MP" | "HP" | "DMG";
  quantity: number;        // copies owned (Collection) or desired (To Get)
  dateAdded: string;       // ISO 8601
}

interface AppState {
  collection: CardEntry[];
  toGet: CardEntry[];
}
```

---

## UI Layout

```
┌──────────────────────────────────────────────────────────┐
│  YgoBinder          [Search]  [My Collection]  [To Get]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  [Search view / Collection view / To Get view]           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- **Search view**: search bar at top, results grid below.
- **Card Detail**: modal or slide-in panel over search results, with set/price table.
- **Collection / To Get**: full-page table with filter bar, sort controls, and export button.

---

## Milestones

| Phase | Scope | Goal |
|---|---|---|
| 1 — Search & Browse | Card search, Card Detail view with set/price table | Look up any card, see all printings + live prices |
| 2 — Collection & To Get | Add/remove/acquire flows with quantity + condition, localStorage | Core collection tracking working locally |
| 3 — Auth & Sync | User accounts, backend API, PostgreSQL, cross-device data sync | Data follows the user across devices |
| 4 — Polish & Export | Filtering, sorting, summary stats, total value, CSV export, loading/error/empty states | Shippable, store-ready quality |
| 5 — Price History | Store periodic price snapshots, per-card history chart | Users can track price trends over time |
| 6 — Mobile App | React Native app (iOS + Android) sharing core logic with the web app | Full mobile experience |

---

## Nice-to-Haves (Post-Phase 6)

- **Price alerts**: notify user when a To Get card drops below a target price
- **Deck building**: build and save decks from owned cards
- **CSV import**: bulk-load a collection from a spreadsheet

---

## Out of Scope

- Trade tracking (not planned; revisit only if directly requested)
