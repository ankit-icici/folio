# Folio

A minimal, installable PWA for tracking a personal Indian portfolio end to end — stocks on live NSE prices with FIFO lot accounting, mutual funds on daily AMFI NAVs, and employer ESOPs — with allocation targets, portfolio-level rebalancing, month-wise cash flows and money-weighted lifetime returns.

**Multi-user by design:** anyone with the app link creates a **username + PIN** on first open and gets their own private portfolio. No install, no keys, no other setup.

**This repository contains only application code.** Portfolios live as per-account JSON files in the host's Google Drive, behind a Google Apps Script backend. Accounts are isolated by SHA-256 of username+PIN; wrong-PIN attempts are rate-limited.

## What it does

- **Home** — one combined dashboard over stocks + mutual funds (ESOPs deliberately excluded), then a row per asset class to drill into. Every dashboard shows current value, total investment, unrealised P&L and a returns row of **Abs %** and **CAGR** (money-weighted XIRR)
- **Stocks dashboard** — current value, total investment, unrealised P&L, day P&L, gainers/losers split, and lifetime **CAGR** (money-weighted XIRR over your full transaction history, recomputed live)
- **Core** — full detail per holding: qty, last price, current value, unrealised P&L and %, day P&L, average buy, invested, and allocation %. Sort by value, name, or day %
- **Satellite** — holdings that count in the dashboard but sit outside allocation and rebalancing (REITs/InvITs, IPO flips, anything you don't want in the core allocation maths)
- **Flows** — net cash in/out per month from your pocket's perspective (buys −, sells +green), with every transaction listed per month. Periods are **financial years** (India's April–March), a **custom** month range, or All; picking one ticks every month in it and totals them, and any month can be unticked to leave it out. Can be backed by an imported multi-account ledger so history predates the app itself
- **Plan** — set a target % per core stock, optionally add or withdraw cash, and get per-stock "Add ₹X · n shares" / "Trim ₹X" instructions computed together at portfolio level. Allocation status is colour-coded: red under-allocated, orange near target, green over-allocated
- **Funds** — a mutual-fund section with its own dashboard and four views: **Portfolio** (active funds grouped Personal / HUF / Closed, each card tapping open to that fund's transactions), **SIPs**, **SWPs** (including a transfer that lands as a purchase in another fund) and **Lumpsum**. NAVs refresh daily from AMFI, every fund carries its own lifetime CAGR, and periods filter by financial year or a custom range
- **Redemptions** — redeem part or all of a fund by amount or by units: units and cost basis both move, the money coming back is logged, and a fully-exited fund stays on record as *closed* so its returns keep counting for life
- **Ownership rules** — an HUF-held fund is visible in Portfolio but excluded from every dashboard figure and every return, because it is a different entity's money. A fund marked **private** is excluded the same way *and* never leaves your login, so your dashboards keep tying to your advisor's official app figure for figure
- **Privacy shutter** — the eye icon masks every amount as `₹XXX` and every quantity as `XXX` across the whole app in one tap; unmasking asks for your PIN, and while masked no screen will open that would reveal a stored figure
- **Advisor view** — a second, **view-only** PIN on your own account. Your advisor signs in at the same link and sees stocks and funds, live and complete, but cannot change or save anything. Your **ESOPs** and any fund you mark **private** are stripped **server-side**, so they never reach that device — and private funds sit outside your own totals too, which keeps both apps showing the same numbers. Set or revoke it under ⚙ Account
- **ESOP** — a separate tab for employer stock, kept out of the portfolio entirely. Grants vest 30/30/40 on the grant year +1/+2/+3, so next year's vesting is worked out for you. The dashboard gives CMP, shares held, value after tax and profit after tax, each tile tapping through to the one input that drives it. Options still to be exercised — vested or not — sit in a table where exercise price, sell quantity and sell price are editable inline and profit after tax updates as you type; the tax rate and the full workings open under the row
- **Buy/Sell** with FIFO lot accounting (sell preview shows FIFO cost and realised gain), plus per-stock edit and bulk paste-import of holdings
- **Add by name** — start typing a company and the ticker is resolved for you; stocks listed only on BSE work too
- Live NSE prices every 15 s, light/dark/auto themes, works offline against the last synced state, and the installed app updates itself when a new build ships

## Architecture

- `index.html` — the whole app (vanilla JS, no build step, no dependencies); backend URL is the `BACKEND` constant
- `relay/Code.gs` — the Google Apps Script backend deployed on the host's Google account:
  - `POST {action:register}` — create an account (username + PIN)
  - `GET action=load` / `POST {action:save, data, force?}` — that account's portfolio JSON in Drive
  - `GET action=quotes&symbols=…` — live prices via Yahoo Finance, cached server-side so all users share fetch quota. A bare ticker is NSE; a `.BO` suffix is BSE; a `^` prefix is an index
  - `GET action=search&q=…` — company-name lookup for the add-stock typeahead
  - `POST {action:setguest, gp}` — set (or, with an empty `gp`, revoke) the account's view-only advisor PIN. A guest session may only read: it gets the portfolio with `esops` and every `priv` fund removed, and any write or snapshot call is refused
  - `GET action=snapshots` / `GET action=snapshot&day=…` — restore points
  - `POST {action:unregister}` — delete the account, its data, and its snapshots
  - `monthlyBackup()` / `setupMonthlyBackup()` — not endpoints but scheduled work: a time-driven trigger that emails the account JSON to the owner monthly
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

1. **Write guard** — the server refuses any save that would empty **any** section of the document (stocks, transactions, funds, fund transactions, SIPs, SWPs, ESOP grants or lots) or halve a large one, and refuses to drop an imported history, unless the client explicitly passes `force:true` (only the in-app restore flows do). A bug in the app therefore cannot quietly erase a category.
2. **Automatic snapshots** — before the first save of each day, the previous state is copied to a `Folio Backups` folder in the host's Drive: a **daily** restore point (kept 60 days) and a **monthly archive that is never deleted**.
3. **In-app recovery** — ⚙ Account → *Go back to an earlier version* lists every snapshot in plain language and restores it in two taps. No files, no pasting. Restores apply the **whole** document — stocks, transactions, funds, ESOPs and imported history — and show you what a copy contains before it replaces anything.
4. **Your own file** — ⚙ Account → *Save a copy to this device* writes the **entire** document (shares, transactions, funds, ESOPs, imported history) as `Folio-backup-YYYY-MM-DD-HHMM.json`, named so it is easy to spot in a phone's Files app and sorts chronologically. Restoring it warns you first if the copy is missing anything you currently hold.
5. **Monthly off-Drive copy** — run `setupMonthlyBackup()` once and the backend emails the account JSON to the owner on the 1st of each month (`Folio-backup-<user>-YYYY-MM-DD.json`), so a copy survives losing the Google account that hosts everything else.
6. **Stale-tab protection** — a tab returning to the foreground re-syncs from the server before it can save, so an old tab can't overwrite newer data.
7. **Blast-radius limits on the rate limiter** — wrong-PIN attempts are counted per account, and a given wrong credential only ever costs one strike, so a stale device retrying a revoked PIN can never lock the real owner out.
8. Plus Google Drive's own file revisions and a per-device local cache.

## Host your own instance

1. Deploy [`relay/Code.gs`](relay/Code.gs) on your Google account (script.google.com → paste → Deploy → Web app → Execute as **Me** → access **Anyone** → authorise).
2. Fork this repo, put your `/exec` URL in the `BACKEND` constant in `index.html`, enable GitHub Pages.
3. Share your Pages link — each person creates their own username + PIN.
4. Optional but recommended: in the Apps Script editor, run `setupMonthlyBackup()` once to schedule the monthly backup email to yourself.

Note: PIN auth is meant for casual personal use among people you'd share the link with, not adversarial security. All portfolios reside in the host's Drive, so the host account owner can technically read them. Prices come from Yahoo Finance's NSE feed and can lag the exchange by seconds to minutes; this is not a trading terminal.
