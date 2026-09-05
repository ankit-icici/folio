# Folio

A minimal, installable PWA for tracking personal Indian stock portfolios — live NSE prices, FIFO lot accounting, allocation targets with portfolio-level rebalancing, and month-wise cash flows.

**Multi-user by design:** anyone with the app link creates a **username + PIN** on first open and gets their own private portfolio. No other setup.

**This repository contains only application code.** Portfolios live as per-account JSON files in the host's Google Drive, behind a Google Apps Script backend. Accounts are isolated by a salted SHA-256 of username+PIN; wrong-PIN attempts are rate-limited.

## Architecture

- `index.html` — the whole app (vanilla JS, no build step); backend URL is baked in
- Backend — a Google Apps Script web app ([`relay/Code.gs`](relay/Code.gs)) on the host's Google account:
  - `POST {action:register}` — create an account (username + PIN)
  - `GET action=load` / `POST {action:save}` — that account's portfolio JSON in Drive
  - `GET action=quotes&symbols=…` — live NSE prices via Yahoo Finance, cached server-side 45 s so all users share fetch quota
  - `POST {action:unregister}` — delete the account and its data
- `sw.js` + `manifest.webmanifest` — installable, offline-capable shell

The app polls quotes every 15 seconds while open.

## Host your own instance

1. Deploy [`relay/Code.gs`](relay/Code.gs) on your Google account (script.google.com → paste → Deploy → Web app → Execute as Me → access: Anyone).
2. Fork this repo, put your `/exec` URL in the `BACKEND` constant in `index.html`, enable GitHub Pages.
3. Share your Pages link — each person creates their own username + PIN.

Note: PIN-only auth is meant for casual personal use among people you'd share the link with, not for adversarial security. All portfolios reside in the host's Drive, so the host account owner can technically read them.
