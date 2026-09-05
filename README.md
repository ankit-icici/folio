# Nivesh

A minimal, installable PWA for tracking a personal Indian stock portfolio — live NSE prices, FIFO lot accounting, allocation targets with portfolio-level rebalancing, and month-wise cash flows.

**This repository contains only application code.** Portfolio data never touches this repo: it lives in a private `nivesh-data.json` in the owner's Google Drive, synced through a personal Google Apps Script relay whose URL and key are entered once per device (stored in `localStorage`).

## Architecture

- `index.html` — the whole app (vanilla JS, no build step)
- Quote + data relay — a Google Apps Script web app on the owner's account:
  - `GET ?k=KEY&action=quotes&symbols=A,B` → live prices from Yahoo Finance's NSE feed (last two daily closes)
  - `GET ?k=KEY&action=load` / `POST ?k=KEY` `{action:"save", data}` → portfolio JSON in Drive
- `sw.js` + `manifest.webmanifest` — installable, offline-capable shell

The app polls quotes every 15 seconds while open.
