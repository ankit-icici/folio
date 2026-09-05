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

## Use it for your own portfolio

Anyone can run their own instance — the app is just static files, and each user brings their own backend:

1. Deploy [`relay/Code.gs`](relay/Code.gs) as a web app on your own Google account (instructions at the top of the file, ~5 minutes, free).
2. Open the app, paste your `/exec` URL and your key, tap Connect.
3. Add holdings via **+** (single buys or bulk paste import).

Sharing the same URL + key with another person gives them full read/write access to the same portfolio — treat the pair like a password.
