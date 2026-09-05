# Folio

A minimal, installable PWA for tracking personal Indian stock portfolios — live NSE prices, FIFO lot accounting, allocation targets with portfolio-level rebalancing, and month-wise cash flows.

**Multi-user by design:** anyone with the app link creates a **username + PIN** on first open and gets their own private portfolio. No install, no keys, no other setup.

**This repository contains only application code.** Portfolios live as per-account JSON files in the host's Google Drive, behind a Google Apps Script backend. Accounts are isolated by SHA-256 of username+PIN; wrong-PIN attempts are rate-limited.

## What it does

- **Dashboard** — current value, total investment, unrealised P&L, day P&L, gainers/losers split, and lifetime **CAGR** (money-weighted XIRR over your full transaction history, recomputed live)
- **Core** — full detail per holding: qty, last price, current value, unrealised P&L and %, day P&L, average buy, invested, and allocation %. Sort by value, name, or day %
- **Satellite** — holdings that count in the dashboard but sit outside allocation and rebalancing (REITs/InvITs, IPO flips, anything you don't want in the core allocation maths)
- **Flows** — net cash in/out per month from your pocket's perspective (buys −, sells +green), with every transaction listed per month and 3M/6M/1Y/All filters. Can be backed by an imported multi-account ledger so history predates the app itself
- **Plan** — set a target % per core stock, optionally add or withdraw cash, and get per-stock "Add ₹X · n shares" / "Trim ₹X" instructions computed together at portfolio level. Allocation status is colour-coded: red under-allocated, orange near target, green over-allocated
- **Buy/Sell** with FIFO lot accounting (sell preview shows FIFO cost and realised gain), plus per-stock edit and bulk paste-import of holdings
- Live NSE prices every 15 s, light/dark/auto themes, works offline against the last synced state

## Architecture

- `index.html` — the whole app (vanilla JS, no build step, no dependencies); backend URL is the `BACKEND` constant
- `relay/Code.gs` — the Google Apps Script backend deployed on the host's Google account:
  - `POST {action:register}` — create an account (username + PIN)
  - `GET action=load` / `POST {action:save, data, force?}` — that account's portfolio JSON in Drive
  - `GET action=quotes&symbols=…` — live NSE prices via Yahoo Finance, cached server-side 45 s so all users share fetch quota
  - `GET action=snapshots` / `GET action=snapshot&day=…` — restore points
  - `POST {action:unregister}` — delete the account, its data, and its snapshots
- `sw.js` + `manifest.webmanifest` — installable, offline-capable shell
- `CLAUDE.md` — architecture notes, release runbook, and hard-won gotchas for future work

### Positions vs history

An account document holds two independent things: `stocks`/`txns` describe **what you hold and
at what cost**, while an optional `history` ledger holds **every real broker transaction**,
including positions closed years ago and accounts held elsewhere. Flows and the lifetime CAGR
read the ledger (plus anything recorded in the app after it ends); holdings never do. They are
kept apart on purpose — broker order exports omit bonus and rights shares, and some brokers
only expose one or two financial years, so reconstructing positions from them would quietly
lose shares and cost basis.

## Data durability

Losing data should take deliberate effort, not a bad day:

1. **Write guard** — the server refuses any save that would zero out an account's stocks or drop more than half its transactions, unless the client explicitly passes `force:true` (only the in-app restore flows do).
2. **Automatic snapshots** — before the first save of each day, the previous state is copied to a `Folio Backups` folder in the host's Drive: a **daily** restore point (kept 60 days) and a **monthly archive that is never deleted**.
3. **In-app recovery** — ⚙ Account → *Go back to an earlier version* lists every snapshot in plain language and restores it in two taps. No files, no pasting.
4. **Stale-tab protection** — a tab returning to the foreground re-syncs from the server before it can save, so an old tab can't overwrite newer data.
5. Plus Google Drive's own file revisions and a per-device local cache.

## Host your own instance

1. Deploy [`relay/Code.gs`](relay/Code.gs) on your Google account (script.google.com → paste → Deploy → Web app → Execute as **Me** → access **Anyone** → authorise).
2. Fork this repo, put your `/exec` URL in the `BACKEND` constant in `index.html`, enable GitHub Pages.
3. Share your Pages link — each person creates their own username + PIN.

Note: PIN auth is meant for casual personal use among people you'd share the link with, not adversarial security. All portfolios reside in the host's Drive, so the host account owner can technically read them. Prices come from Yahoo Finance's NSE feed and can lag the exchange by seconds to minutes; this is not a trading terminal.
