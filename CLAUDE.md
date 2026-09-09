# Folio — working notes for Claude

Personal stock-portfolio PWA (India/NSE). Vanilla JS, **no build step, no framework, no
dependencies**. Everything the app does is in `index.html`. Read this file before changing
anything — the operational gotchas below have all bitten before.

## Live URLs

| Thing | Where |
|---|---|
| App | https://ankit-icici.github.io/folio/ (GitHub Pages, `main` branch, root) |
| Repo | https://github.com/ankit-icici/folio (public — code only, **never** portfolio data) |
| Backend | Google Apps Script web app on the owner's Google account (`alliances.ankit@gmail.com`) |
| Apps Script project | `https://script.google.com/home/projects/1CpID_Y5jaqO31kbsUSqOEFVgaNPjilXJV1xxO15piummuwCAKSPB-njp/edit` |

The backend `/exec` URL is hardcoded as `BACKEND` at the top of the `<script>` in `index.html`.
`relay/Code.gs` is the deployed backend source, kept in sync by hand.

## Files

- `index.html` — the entire app: state, FIFO maths, rendering, sheets, auth, sync, quote polling
- `relay/Code.gs` — copy of the Apps Script backend (deploy target, not built from here)
- `sw.js` — offline shell cache. **Bump `CACHE` on every release, and `BUILD` in `index.html`
  to the same `vN`.** They are the update mechanism, not decoration: the page fetches `sw.js`
  with `no-store` on launch, on every return to the foreground, and every 10 min, and reloads
  itself when the two disagree. Leave them out of step and either nothing updates or the app
  reload-loops (a `sessionStorage` guard caps it at one reload per build per session).
  `BUILD` is shown at the bottom of the Account sheet — ask for it first when the user reports
  a shipped feature as missing; an installed PWA that is only resumed never re-fetches the page,
  which is exactly how one release went unseen.
- `manifest.webmanifest`, `icon-*.png` — PWA install metadata

## Architecture

Users sign in with **username + PIN** (no email, no OAuth). The backend stores
`sha256(username + ':' + pin)` in Script Properties and keeps each account's portfolio as its
own JSON file in the owner's Drive, named from that hash. The PIN is never stored anywhere and
never reaches Claude — if a task needs a signed-in app, ask the user to sign in themselves.

Backend actions (`?u=<username>&p=<pin>` on every authed call):

- `GET action=ping` → `{ok, v}` (version probe, no auth)
- `GET action=load` → `{data:{stocks,txns}}`
- `GET action=quotes&symbols=A,B` → live NSE prices, server-cached 45 s
- `GET action=snapshots` / `GET action=snapshot&day=YYYY-MM-DD|YYYY-MM` → restore points
- `POST {action:'register'}` / `{action:'save', data, force?}` / `{action:'unregister'}`

Data shape (one document per account):

```js
stocks[id] = { name, symbol, pool:'core'|'ipo', price, prevClose, target, rating?, closed?, createdAt }
txns[id]   = { stockId, side:'buy'|'sell', qty, price, date:'YYYY-MM-DD', seq, noLot? }
history    = { ledger:[{d,s,n,b,q,v,a?}], end:'YYYY-MM-DD', sources:'…' }   // optional
```

**Two separate concerns — do not merge them.** `stocks`/`txns` describe **positions** (what is
held now, at what cost). `history` is an imported **cash-flow ledger** covering every real
broker transaction across all of the owner's accounts, and drives **Flows** and the **lifetime
CAGR** only. Keeping them apart is deliberate: broker order histories omit bonus/rights shares
and some brokers only expose 1–2 financial years, so rebuilding positions from them loses
shares and cost basis. `cashFlows()` returns the ledger plus any in-app txn dated after
`history.end`, so nothing is double-counted and new trades flow in automatically.

Ledger row fields are short to keep the document small: `d` date, `s` symbol, `n` name,
`b` 1=buy/0=sell, `q` qty, `v` rupee value, `a` 1 = approximate date (shown as ≈ in the UI).

- `pool:'ipo'` is the **Satellite** pool (label lives in the `POOL2` constant): counts in the
  dashboard, excluded from allocation % and the rebalance plan.
- `noLot:true` — a ledger record that must show in Flows but must NOT create/consume a lot
  (imported sells whose effect is already baked into the imported holdings). `holding()` skips them.
- `keep:1` — a transaction the user typed in. Flows ignores in-app txns dated on or before
  `history.end` so the imported lots do not double-count against the ledger; `keep:1` exempts a
  hand-entered trade from that cutoff. **Set it on every txn any sheet creates, never on an
  imported one.** Without it, a backdated entry silently vanishes from Flows and CAGR while
  still driving P&L - that is how a 17 Aug 2026 sale went missing.
- `closed:true` — fully exited position: hidden from lists, still present in Flows history.
- Holdings use **FIFO**: sells consume oldest lots first. `holding()` is the single source of
  truth for qty / invested / avg / P&L — don't recompute elsewhere.
- Prices: `price` and `prevClose` drive day P&L; live polling every 15 s overwrites them for any
  stock with a `symbol`.
- `symbol` carries its **exchange** only when it is not NSE. NSE is bare (`HDFCBANK`); a stock
  listed only on BSE keeps its Yahoo suffix (`SONALAD.BO`); the two indices keep their caret
  (`^NSEI`, `^BSESN`). The relay appends `.NS` only when the symbol has neither a caret nor a
  dot, so all three round-trip through one code path. Use `symRoot()` / `symExch()` / `symHTML()`
  to display one - never print the raw symbol.
- Adding a stock resolves the ticker itself: the Add sheet is a typeahead over `action=search`
  and adopts the top match (tap another row to override). There is no ticker field on that sheet;
  the one in the Edit sheet stays, for corrections and for anything the feed cannot find.

### Rebalance maths (Plan tab)

Everything is read against `T2`, the total the plan is being evaluated at — `planCtx()` is the
one place that computes it (core invested + the cash box + any single-stock match).

- `planRowAct` shows `d = target% x T2 - invested`, i.e. the move when the total is already
  fixed at `T2` (the cash box money is counted in `T2` before it is distributed).
- `planMoves` — per-stock what-if amounts, keyed by stock id, values are raw input strings.
  Tapping a stock name in the table seeds one and re-renders; the amount is then freely editable
  (negative = withdrawal) and every row recomputes against the new total. The Action column of a
  stock with a what-if shows what is **still** left to do after that amount, not the original gap.
- `planMatch(inv,t,T2) = d / (1 - t/100)` — the amount to transact in **one** stock so it lands on
  target *after* that trade changes the portfolio total. Only used to seed a new `planMoves` entry.
  Not the same as `d`; don't conflate them.
- `planDilute` — fresh money into the *other* holdings that brings an over-weight name down to
  target with no sale. Shown per row as "or +Rs X in others".

### Flows periods

`flowWindow()` resolves every period to an inclusive `[from, to]` pair — there is no rolling
cutoff any more. Financial years run 1 April to 31 March (`fyStart()` / `fyLabel()` roll over
automatically each April), and "Custom" is a from/to month pair (`flowA`, `flowB`, swapped if
reversed). Choosing a period ticks every month in it (`flowTouched = false`) and the header
totals them; unticking one sets `flowTouched` and shows an "All months" reset. A month the
current period hides is dropped from the selection rather than counted invisibly.
- `planBand(t,T2) = max(500, 2% of the stock's own target value)` is the on-target tolerance.
  It MUST stay in sync with `planDilute`, which solves to that same threshold — a band expressed
  as a share of the whole portfolio makes small positions read "on target" while the dilution
  figure still asks for lakhs. That exact mismatch was a reported bug; keep them coupled.

### ESOPs (ESOP tab)

Employer stock lives in `meta.esops` and is **deliberately outside** `stocks{}` — it must never
reach the dashboard, allocation, Plan, Flows or CAGR. Its price comes from `ESOP_SYM`
("ICICIBANK") fetched alongside the portfolio symbols and parked in `idx[ESOP_SYM]`, not in a
stock record. The user's own ICICIBANK share sales are excluded from the portfolio for the same
reason (employee shares, not investments).

```js
meta.esops = {
  grants: { id: {year, qty, strike, sold} },   // strike is shown as "grant price"
  lots:   { id: {gid, qty, fmv, date?, perq?, cgr?} },  // exercised, sitting in the demat
  pool:   {qty?, fmv?, gpx?, perq?},           // dashboard overrides
  cmp?, taxPerq, taxCg
}
```

- **Vesting is derived, never stored**: `VEST = [0.30, 0.30, 0.40]` on the grant year +1, +2, +3.
  `vestedBy(g, year)` is the cumulative figure; a single year's tranche is the difference between
  consecutive years. Verified against the user's own sheet: 700 -> 210/210/280, 430 -> 129/129/172.
- `sold` is what left before the app existed. Without it, `esopUnex()` would report every
  already-sold vested option as "vested, not exercised" — 390 phantom options on the 2021 grant.
  Removing a lot as sold adds its quantity to `sold` automatically; keep that link.
- **Two taxes, and they are not the same thing.** *Perquisite* tax is salary tax on
  (exercise price − grant price), paid when you exercise. *Capital gains* tax is on
  (sale price − exercise price). The perquisite rate varied by year (31% and 34% in this
  account), so the **paid amount** is stored per lot and aggregated into `pool.perq` rather than
  recomputed from one rate — a flat 34% overstates it by about Rs 12,000. The PAT tile edits the
  amount and shows the rate it implies. Don't "simplify" this back to a rate.
- `esopPool()` collapses the lots into quantity, average exercise price, average grant price and
  paid perquisite tax; `esopSummary()` turns those into the four dashboard figures. Overriding
  the quantity scales the perquisite pro-rata.
- `eD` holds the per-row what-if inputs (exercise price, sell qty, sell price, tax %) as raw
  strings, seeded from CMP by `eDraft()`. They are transient on purpose — a scenario must not
  outlive the session. `refreshEsopCalc()` updates the PAT cell and the open box **in place**;
  a full `render()` on every keystroke steals focus mid-typing.

## Data durability (do not weaken)

1. Server rejects any save that zeroes out stocks or drops >50% of transactions
   (`suspicious_save`) unless the client passes `force:true` — only the Restore flows do.
2. Before the first save each day, the previous state is snapshotted to the Drive folder
   **"Folio Backups"**: `snap-<hash8>-YYYY-MM-DD.json` (pruned after 60 days) and
   `keep-<hash8>-YYYY-MM.json` (**permanent, never pruned**).
3. The app re-loads from the server when it regains focus after >2 min, so a stale tab can't
   overwrite newer data.
4. ⚙ Account → Restore points browses and restores any snapshot in-app.

## Release process

```bash
# 1. edit index.html
# 2. bump BOTH: CACHE in sw.js and BUILD in index.html (folio-vN -> folio-vN+1)
git add -A && git commit -m "..." && git push
# 3. Pages goes live ~45 s later; verify with a grep for something new:
curl -s https://ankit-icici.github.io/folio/ | grep -c '<new marker>'
```

### Changing the backend

Apps Script has no CLI here — edit in the browser (the user must be signed into their Google
account; drive it with the Chrome tools):

1. Open the project URL above; the editor is Monaco — set the whole file with
   `monaco.editor.getModels()[0].setValue(src)`, then Cmd+S.
2. A "You're currently signed in as…" popup often swallows the first clicks — dismiss it (OK) first.
3. Deploy → **New deployment** → type Web app → Execute as **Me** → access **Anyone** → Deploy.
   *Manage deployments → edit* is flaky in automation; creating a new deployment is reliable.
4. **A new deployment means a new `/exec` URL** → update `BACKEND` in `index.html`, and mirror the
   code into `relay/Code.gs`.
5. Old deployments keep serving their old code version; they are not auto-retired.

### Verifying against real data

Never ask for the PIN. Ask the user to sign in in their browser, then run checks through that
signed-in page (`api()`, `stocks`, `txns` are all in scope), e.g.
`await fetch(api('action=snapshots')).then(r=>r.json())`.

## Gotchas that have caused real bugs

- **Service worker**: if a change seems not to deploy, it's the cache. Bump `CACHE`; when
  testing, unregister the SW and clear caches before reloading.
- **Yahoo quote fields lie**: `meta.regularMarketPrice` / `chartPreviousClose` are sometimes wrong
  or misaligned (IndiGrid once showed ₹140 vs ₹175). Use the last two non-null values of
  `indicators.quote[0].close` from `range=5d`. This is why the backend does it that way.
- Apps Script cannot be reached from Anthropic cloud sandboxes (egress-blocked) — browser or
  local shell only.
- The app must keep working when the backend is unreachable: render from `localStorage` cache and
  show the offline state, never a blank screen.
- Sorting default is **current value**, not invested amount.
- Flows are shown from the user's pocket's perspective: buys negative, sells positive/green.
- **Never count a sell whose matching buy isn't in the data** — it reads as free income and
  inflates the return. This produced a wrong CAGR once (26.9% vs the true 20.2% at the time).
  Either import both sides, or exclude the record from the return calculation.
- Broker exports are dirty: Groww emits **₹0 "SELL" rows for off-market transfers** between the
  owner's own accounts (drop them — internal moves, not trades) and for rights/bonus
  entitlements, and some rows carry corrupt dates (year 1971).
- **ICICI Direct**: the trading UI shows only today. The history lives on `ireports.icicidirect.com`
  — *Orders → Order/Trade Book* (set the period, then press View) for trades, and
  *Statements → P&L Statement* for matched buy/sell pairs with cost basis, which is the
  authoritative source for a realised gain. Its *Capital Gains* statement covers mutual funds
  only. Its instrument codes are internal and are **not** NSE tickers (DHOTRA is Dhoot
  Transmission, whose real symbol is DHOOTTRANS) — always resolve the symbol before storing it.
- **An IPO allotment produces no buy order anywhere.** The "never count an orphan sell" rule
  above then silently discards the sale as unmatched, which is how a real 17 Aug 2026 trade went
  missing from the ledger entirely. When a sell has no buy, look for an allotment before deleting it.
- **Duplicate function declarations shadow silently.** Rewriting a screen and leaving the old
  helper behind means the later declaration wins and the new one never runs — no error, just a
  UI that ignores input. After any rewrite: `grep -c "function <name>"` and expect 1.
- **Don't reuse the `pt` class for a new table.** It carries `min-width:452px` for the Plan
  layout, which forces sideways scrolling on a 375px screen no matter what the new table sets.
- When adding a field to `meta.esops` (or any settings blob), add it to the **reader** too —
  `esops()` returns an explicit object, so a field it doesn't list is written and then ignored.
- Mobile first: transaction rows are two lines (name + chip, then date · qty × price) with the
  amount on the right. Five-column table layouts truncate names to "He…" on a phone.

## Design language

Ivory/near-black surfaces, restrained gold accent, Instrument Serif (wordmark, sheet titles),
Schibsted Grotesk (UI), Spline Sans Mono (all figures). Full light/dark support via CSS tokens
on `:root`, `@media (prefers-color-scheme: dark)` guarded with `:root:not([data-theme="light"])`,
and `:root[data-theme="dark"]`. Minimal chrome, no explanatory clutter, mobile-first (max-width
560 px, safe-area insets). Keep it that way.
