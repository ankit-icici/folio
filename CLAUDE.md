# Folio — working notes for Claude

Personal stock-portfolio PWA (India/NSE). Vanilla JS, **no build step, no framework, no
dependencies**. Everything the app does is in `index.html`. Read this file before changing
anything — the operational gotchas below have all bitten before.

## Start here (first session on this project)

1. **Two version strings move together.** Every app change bumps `BUILD` in `index.html` **and**
   `CACHE` in `sw.js` to the same `vN`. Skip one and the user never sees the change.
2. **The backend is not built from this repo.** `relay/Code.gs` is a *copy*. The deployed script
   is edited in the Apps Script browser editor, then Deploy -> Manage deployments -> pencil ->
   New version. Read the live editor content before changing it, and write the copy back here
   afterwards. Verify with `?action=ping`.
3. **Never ask for the PIN**, and never type one. Ask the user to sign in in their own browser,
   then drive checks through that signed-in page.
4. **Verify on the live app before saying it works.** The user has been burned repeatedly by
   "done" claims that were only true in the source. Load the deployed build, exercise the actual
   path, and compare real numbers. For data-safety claims, prove the invariant (see *Verifying
   against real data*).
5. **This repo is public and holds code only.** Portfolio data lives solely in the owner's Drive.
   Never commit a document, an export, a PIN or a screenshot of holdings.
6. **The owner is not a programmer — write to him accordingly.** Plain English, the decision
   first, no jargon or file paths in replies. Technical reasoning goes in this file instead.
   See *Talking to the owner*; getting this wrong has already cost a round trip.

## Live URLs

| Thing | Where |
|---|---|
| App | https://ankit-icici.github.io/folio/ (GitHub Pages, `main` branch, root) |
| Repo | https://github.com/ankit-icici/folio (public — code only, **never** portfolio data) |
| Backend | Google Apps Script web app on the owner's own Google account (ask the owner; not recorded here) |
| Apps Script project | **"Folio backend (portfolio app)"** — `https://script.google.com/home/projects/1CpID_Y5jaqO31kbsUSqOEFVgaNPjilXJV1xxO15piummuwCAKSPB-njp/edit` |

The backend `/exec` URL is hardcoded as `BACKEND` at the top of the `<script>` in `index.html`.
`relay/Code.gs` is the deployed backend source, kept in sync by hand.

### Starter prompt (what to paste into a fresh session)

The short form the owner actually uses, and it is enough — this file carries the rest:

> Work on my portfolio app: https://github.com/ankit-icici/folio — clone it and read CLAUDE.md
> fully before anything else. Then: *[the request]*

**Both halves of that are load-bearing.** There is no local copy on the owner's machine, so a
session starts with nothing to read; and because the repo does not exist at session start, this
file is **not** picked up automatically the way a CLAUDE.md in an already-open project would be.
Drop either half and the next session starts guessing. "Fully" matters too: the rules that bite
(two version strings, never deleting a sold-out stock, `keep:1`) are spread all the way down.

Longer form, when the task needs the browser:

> …The live app is https://ankit-icici.github.io/folio/ and my data lives in my own Google Drive
> behind an Apps Script backend — that backend is edited in the Apps Script browser editor, not
> from the repo. I'm signed into that Google account in Chrome along with my broker portals, so
> use my browser for anything needing a login and ask me to sign in rather than asking for
> credentials. Verify changes against my real data in the live app before telling me they work.

Anything the owner must decide is under *Open decisions / backlog*. Ask; do not guess.

## Talking to the owner

**The owner is not a programmer.** He owns this app and makes every real decision about it, but
he does not read code and does not follow git or deployment jargon. A technically correct report
he cannot parse is a failed report — it leaves him unable to decide, which is the entire purpose
of reporting to him. This was learnt the hard way: a summary written in normal engineering
register got the reply *"didnt understand any of it. can you explain to me in a more-simpler,
easy to understand language. i am non tech guy."*

- **Lead with the plain-English situation, then the decision he has to make, then a
  recommendation.** Reach for an everyday analogy over precision he cannot use.
- **Keep commands, file paths, function names and flags out of replies** unless he asks for them.
  Say "the tab row stays put when you scroll", not "`#subseg` gets `position:sticky`".
- **Say how worried he should be, in words** — "worth tidying, not worth losing sleep over".
  Be explicit when something is housekeeping rather than urgent, so a blocked or deferred step
  does not read as an emergency.
- **Give him something short to answer.** He replies in a few words ("run", "pin changed",
  "do it"), so end with a clear either/or rather than an open-ended menu.
- **Detailed technical reasoning belongs in THIS file, not in replies to him.** That is what it
  is for: write the mechanism down here, tell him the outcome.
- None of this means hiding bad news or softening a real problem — state those plainly too, just
  in words he can act on. And when a claim turns out to be wrong, correct it outright: he was
  told the leaked username protected his login, and that had to be walked back (see backlog 2).

## Legacy name: "nivesh"

The app was called **nivesh** before it was Folio, and that name still keys everything that
persists, so grepping for "folio" finds none of it: Drive files `nivesh-acc-<hash16>.json`
(`FILE_PREFIX`), and localStorage `nivesh_auth`, `nivesh_cache_<user>`, `nivesh_mask`,
`nivesh_theme`, `nivesh_recent_<user>`, `nivesh_bk_<user>` (when the device copy was last
saved - drives the daily backup nudge). Renaming any of them orphans live data or signs
everyone out - leave them alone.

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
- `GET action=login` → `{ok, u, guest}` (credential check only)
- `GET action=search&q=…` → `{results:[{s,n,x}]}` company lookup for the add-stock typeahead
- `GET action=load` → `{data:<the whole document>, t, quotes?, guest?}` - that is `stocks`,
  `txns`, `history`, `esops`, `mf`, `savedAt`, not just stocks/txns. Pass `&symbols=A,B` to get
  prices in the same round trip. A guest reply has `guest:true` and is missing `esops` and every
  private fund.
- `GET action=quotes&symbols=A,B` → live NSE prices, server-cached 45 s
- `GET action=snapshots` / `GET action=snapshot&day=YYYY-MM-DD|YYYY-MM` → restore points
- `POST {action:'register'}` / `{action:'save', data, force?}` / `{action:'unregister'}`
- `POST {action:'setguest', gp}` — set/revoke the account's view-only advisor PIN (empty `gp` revokes).
  Setting a new one replaces the old instantly, which is the advisor hand-over path.
- `POST {action:'setpin', np}` — owner changes their own PIN. **This renames things**: the data
  file and every `snap-`/`keep-` snapshot are named from `sha(user:pin)`, so all of them are
  renamed in the same call. Miss that and the account opens empty with its history orphaned.
  Refused if the new PIN equals the current one or the advisor's. The advisor PIN is unaffected
  (guests resolve through the owner's stored hash, which is updated in step)

The web app now serves the same code as head (Apps Script deployment **"Version 16"**, whose
`?action=ping` answers **v:18** - two unrelated counters; do not try to align them). The
head-vs-deployed split described under *Monthly off-Drive backup* is therefore closed: deploying
head was safe because the owner's authorisation already covered the Mail and Trigger scopes. A *guest* (advisor-PIN) session may read
`load`, `search` and `quotes` only; `snapshots`/`snapshot` and every POST return `forbidden`,
and its `load` has `esops` plus every `priv` fund (with their sips/swps/txs) deleted server-side.

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
- `closed:true` — manual "hide this for good" flag: dropped by `withHolding()`, so it leaves every
  list *and* the Exited group below. Nothing in the UI sets it; it is an escape hatch only.
- **A position sold down to zero leaves the listing on its own (v78).** `all()` is LIVE holdings
  only (`qty > LIVEQ`), and `exited()` picks up the sold-out ones for an **"Exited · fully sold"**
  group under Core / Satellite, showing bought / sold / realised P&L from `realised(sid)`.
  The reason this exists at all: the only way to get a zero-qty stock out of the list used to be
  `delStock()`, which **deletes its txns**, and that silently removed the trade from Flows, from
  the lifetime CAGR and from the month's realised P&L. An intraday round trip (buy and sell the
  whole lot the same day) hit this every time. So:
  - **Never delete a stock to tidy the list** - it now leaves by itself. The exited card
    deliberately has **no Delete button**, only "Buy again" and "Edit"; `delStock()` stays for
    genuine mistakes, reachable from a live card.
  - `realised()` mirrors `holding()` in skipping `noLot` rows, so a flow-only imported record
    never invents a gain. Keep them in step.
  - Exited names are out of the dashboard, the allocation and the Plan automatically, because
    those all read `all()`. `nStocks` counts live holdings only, which is the intent.
  - `renderHeroOnly()` needs no change here: it already calls `totals(all())`.
  - **Search badges read live quantity too (v79).** `symState()` is the one place that decides
    them: `held` from `all()`, `exited` from `exited()`. Both the recents list and the results
    list call it. They used to build `held[sym]=1` from the mere existence of a stock record, so
    a name sold to zero stayed badged **HELD** for ever - reported against Karamtara after an
    intraday round trip. Anything new that labels a symbol goes through `symState()`, not
    `Object.values(stocks)`.
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
- **Targets cannot add up past 100% (v82).** The red footer sum used to be only a warning. Now
  the `data-plan-t` change handler trims the committed value to `100 − (sum of the other
  targets, drafts included)` before saving, so what is stored in `stocks[].target` can never
  total above 100. While a draft is over the line, `refreshPlan()` shows `TGTMSG` in the
  `.plwarn` line (`data-role="tgtwarn"`); after a trim the handler overwrites it with what was
  trimmed and why. Legacy data already over 100 just shows the warning — each row clamps as it
  is next edited, and a row committed when the others already total 100 clears to "set tgt"
  (deliberate: zero room means no target, not a fake sliver).

### Flows periods (note: the `planBand` rule below belongs to Plan, not Flows)

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

### Mutual funds (Funds tab)

```js
meta.mf = {
  funds: { id: {name, code, units, inv, nav, navDate, prevNav?, who?, priv?} },
  sips:  { id: {fid, amt, day, pause?} },   // pause: "YYYY-MM" restarts in that month, or 1 = open
  swps:  { id: {fid, amt, day, to?, pause?} },  // `to` = fund the payout buys into
  txs:   { id: {fid, kind:'sip'|'swp'|'in'|'out', amt, date, nav?, pid?, rc?} }
}
```

`nav` (v85) is the price the entry went through at; `pid` (v82) ties a recorded entry to the plan
it answers, so two tranches into one fund nag separately; `rc` (v87) is the cost basis that
actually left the fund on a `swp`/`out`, which is what makes booked P&L exact. All three are
preserved across edits — see the booked-P&L section for `rc`.

- `inv` is the **cost basis of the units still held**, not lifetime money in. Lifetime money in
  lives in `txs`. Both matter: the card's P&L is `units*nav - inv`, while the CAGR reads `txs`.
- NAVs come from `api.mfapi.in/mf/<code>/latest` straight from the client (CORS `*`),
  at most every 6 h; `prevNav` rolls when `navDate` changes, which is what day P&L reads.
- **Ownership rule:** `mfPersonal = f => !(f.who==="HUF")`. `mfTotals()` and `mfReturns()`
  cover personal funds only — HUF money is a different entity and joins no dashboard figure
  and no return. `hufTotals()` exists for the Portfolio card alone.
- `mfXirr(flows, cur)` is the shared money-weighted engine (bisection, 365.25 d). It appends a
  terminal value only when `cur > 0`, so a **fully redeemed fund still returns a realised
  lifetime CAGR**; it needs flows of both signs and at least 90 days of history, else `null`.
- `mfFundCagr(id)` per fund, `mfReturns()` across personal funds, `combinedCagr()` over stock
  cash flows + personal fund flows for Home.
- **A plan may name a fund you do not hold yet (v78).** Starting a SIP is normally the *first*
  thing that happens - there are no units until the first instalment lands. `mfPlanSheet()` used
  to dead-end on "Add a fund first", which forced inventing a units figure just to get past it,
  so its Fund dropdown now carries a **"+ A fund not in my list yet"** option (preselected when
  there are no funds at all) with the same mfapi typeahead as `mfSheet()`; saving creates the
  fund at `units:0, inv:0` and attaches the plan in one `mfWrite`. `mfSheet()`'s validation
  accordingly accepts `units >= 0` - blank still fails, because `parseFloat("")` is `NaN`.
- **Therefore `units:0` no longer implies "closed".** `mfPortHTML()` keys the live list on
  `units > 0 || planned(id)` and the Closed group on `units <= 0 && !planned(id) && has txs`.
  Without the `planned` test a brand-new SIP fund falls through **both** filters and does not
  render at all, or worse lands under "Closed · fully redeemed" as an exit that never happened.
- **A SIP is a standing instruction, not a feed. Nothing posts it (v80).** There is no scheduler
  anywhere - `meta.mf.sips` only records fund / amount / day, and the screen totals it as
  "₹X ∕ month". Left alone, `units` and `inv` stay frozen while real money goes in, so the fund
  reads low **and** its CAGR is wrong, because `mfFundCagr()` is computed purely from `txs`.
  - `sipDue()` flags plans whose `day` has passed this month with no money-in (`sip` **or** `in`)
    recorded against that fund in the current month. `in` counts deliberately: a lumpsum logged
    this month is money already accounted for, and nagging anyway trains the flag away. Surfaced
    three ways - a count on the Funds **SIPs** sub-tab, a gold banner, and a `DUE` tag per row.
  - `mfRecordSheet(id)` writes the instalment: `txs[…]={kind:'sip'}` **plus** `units += amt/nav`
    and `inv += amt`, in one `mfWrite`. It is the only thing that writes `kind:'sip'`.
  - **It confirms rather than assumes.** Amount, date and NAV are pre-filled (from the plan, the
    plan's own day this month, and the last NAV sync) but all stay editable, because an
    instalment can bounce, be paused, or buy at a NAV that is not today's. Do not "simplify" this
    into a silent one-tap post - the app must never invent a transaction.
  - Dates come from the app's own `today()`, so "has the day passed" agrees with every other date
    the app prints. The sheet clamps the pre-filled day to 28 so a short month cannot produce an
    invalid date.
- **Pausing a plan (v81).** `sips`/`swps` take an optional `pause`: a `"YYYY-MM"` string means it
  restarts **in** that month, `1` means it waits to be resumed by hand. `sipPaused()` decides,
  `pauseLabel()` words it, `pauseMonthOpts()` offers the next 24 months.
  - **Computed, never auto-cleared.** An elapsed pause simply stops counting; nothing rewrites the
    record, because rendering must not trigger a save. Do not "tidy" this into a write on render.
  - A paused plan is **out of the `∕ month` headline** (both the counted total and the private-fund
    line), never flagged due, greyed with a `PAUSED` tag, and carries a one-tap *Resume it now*
    (`data-mfres`, which just deletes `pause`). The plan sheet has a Running/Paused toggle.
  - **This is why it exists:** without it, a SIP paused at the AMC is flagged `DUE` every month
    for ever, for money that was never going out - and a nudge that cries wolf gets ignored,
    which would have undone v80. Deleting is not the substitute: it throws away the amount and
    the day, so restarting means retyping from memory.
  - Pausing touches nothing historical - units, cost basis and every past `txs` row are untouched.
- **SWPs record like SIPs now (v82).** `planDue(kind)` generalises the old `sipDue()`
  (`sipDue`/`swpDue` are thin wrappers, `planDueIds(kind)` replaced `sipDueIds`), so an SWP
  whose day has passed with no money-out (`swp` **or** `out` — a manual Redeem counts) recorded
  against the source fund this month is flagged DUE, counted on the SWPs sub-tab, and gets a
  one-tap "Record this month's payout".
  - `mfRecordSwpSheet(id)` is the payout mirror of `mfRecordSheet`: amount/date/NAV pre-filled
    but editable, cuts `amt/nav` units, releases cost at average (the same maths as Redeem),
    writes `{kind:'swp', pid}`. Paying out everything leaves the fund at `units:0, inv:0` —
    closed, still counted. It never posts the landing side: when the plan has `to`, the sheet
    says to record arrivals on the destination fund, with their real dates and amounts.
  - **Both record sheets now tag their tx with `pid:<plan id>`.** A tx carrying a `pid` answers
    the due-check only for that plan; an untagged tx (lumpsum, redemption, anything pre-v82)
    answers for every plan on the fund, which keeps the v80 rule. The tag is what lets two
    tranches into ONE fund nag separately — without it, recording the first instalment on a
    fund silenced every other plan on that fund for the month. `mfTxSheet` preserves `pid` on
    edit; dropping it would re-flag an already-recorded month.
  - The owner's real flow this was built for: SWP ₹30,000 on the 15th out of SBI Balanced
    Advantage (`to` Helios Flexi Cap), landing as two purchases there — ₹25,000 on the 20th and
    ₹5,000 on the 21st, set up as two SIP plans on Helios. Three nags a month, three one-tap
    confirms; across the portfolio the +30k out and −30k in net to zero in the returns, which
    is correct for an internal transfer.
  - Verified by differential runs of the extracted `planDue` in node (18 cases: due/cleared/
    stale-month/paused, per-plan tags, untagged fallback, clamp maths, payout maths incl. the
    close-out edge), plus a live check after deploy.
- **The record sheets fetch the price for the date picked (v83).** `mfNavOn(code, day)` pulls
  the fund's full NAV history from `api.mfapi.in/mf/<code>` once per fund per session
  (`mfNavHist` cache; rows newest-first, dates DD-MM-YYYY) and returns the price on `day`, or
  the **last traded day before it** - the real feed has gaps (12-14 Sep 2026 was a weekend plus
  a holiday). `mfNavAuto(code,dateSel,navSel,hintSel,after)` wires a sheet: the date drives the
  price, so changing the date refetches and overwrites the NAV box and says which day's price
  it used; a hand-typed NAV survives until the date changes (programmatic fills fire no `input`
  event, which is what the dirty flag rides on). A fund with **no scheme `code`** keeps the old
  behaviour silently - if autofill seems missing, edit the fund and pick its name from the
  suggestions so the code gets attached. NAV never enters the returns anyway (XIRR reads
  amounts + dates from `txs`); it only sizes the units cut or added, so this is an
  accuracy-of-units feature, not a returns fix. Verified against the live API in node:
  15 Sep 2026 -> 15.5554 exact, Sunday the 13th -> the 11th's price, bad code -> null.
- **Owner-confirmed on the LIVE account, 2026-09-17** (v82+v83 together): the SBI Balanced
  Advantage SWP and the two Helios SIP tranches (25k/20th, 5k/21st) are set up, the DUE flow
  and the date-driven price autofill behave on real data ("all changes reflecting"). The
  monthly rhythm from here is three one-tap confirms: payout after the 15th, tranches after
  the 20th and 21st.
- **Month-at-a-glance line on the SIPs and SWPs sub-tabs (v84).** `planStatus(kind)` is the one
  pass: per active (non-paused) plan it answers "recorded this month?" (same pid rule as v82)
  and returns `{total, left, due}`; `planDue()` is now just its `due` view, so the DUE logic is
  byte-identical (re-proven by rerunning the v82 cases). The line above the plan list reads
  "All N SIPs recorded this month ✓" or "X of N SIPs still to record this month" - unlike the
  gold banner, `left` also counts plans whose day has NOT come yet, so "all recorded" really
  means the month is finished, not merely nothing-overdue. Owner asked for it 2026-09-17.
- **Per-fund ledger rows show the NAV (v85).** Two sources, in order: (1) the record sheets
  (SIP instalment, SWP payout) and Redeem now store `nav` on the tx they write - `mfTxSheet`
  preserves it on edit exactly like `pid`, though editing a DATE keeps the old nav (known
  wart; recomputing would need an async fetch in the edit sheet); (2) an older tx with no
  stored nav renders a `data-txnav="fid:date"` placeholder that `mfFillTxNavs()` (called after
  every render) resolves from the `mfNavHist` cache - read-only, never writes, bails via
  `isConnected` when the list re-rendered mid-fetch. A fund with no scheme `code` and no
  stored nav shows no NAV line at all rather than a permanent dash. Lumpsum-tab rows
  (`showFund=true`) are untouched. NAV display goes through `price()`, so the privacy shutter
  masks it like every other figure.
- **A recorded instalment/payout can be corrected or removed (v86).** Fund-ledger rows are now
  buttons (`data-mftxe`): `in`/`out` rows open the plain diary editor (`mfTxSheet`, unchanged -
  it still never moves units), `sip`/`swp` rows open `mfTxUnitSheet`, which DOES move units.
  - The maths is the pure `mfTxRemath(kind,U,I,oldAmt,navOld,edit)`: rewind the old entry from
    today's fund state, then apply the edited one (`edit:null` = delete). Proven properties
    (12 node cases): delete restores the pre-record state exactly; edit ends exactly where
    recording the corrected figures would have; anything that would push units below zero
    returns null and the sheet refuses with a plain message.
  - Why a payout rewind may only be near-exact: it restores cost at the fund's CURRENT average
    per unit. A redemption never changes the average, so this is exact unless a purchase at a
    different price landed in between. A fund already at 0/0 falls back to the old NAV (a
    zero-gain stand-in) - the realistic case is undoing a just-recorded entry, where both are
    exact. Do not "fix" this by storing released cost on the tx without also handling the
    interim-purchase case; the approximation is deliberate and stated.
  - An old tx with no stored `nav` gets its day's official price looked up (`mfNavOn`) so the
    rewind matches what the entry actually did; the sheet says it is doing so.
  - `mfNavAuto` grew a `noInit` flag: the edit sheet must open showing the NAV the entry WAS
    recorded at, not today's price - the date box still refetches on change.
  - Kind is not editable (a SIP stays a SIP); `pid` survives the rewrite, so the due-flags stay
    truthful - deleting this month's entry re-flags the plan as DUE, which is correct.
- **Owner-confirmed on the LIVE account, 2026-09-17 (second confirmation, v84-v86):** the
  month-at-a-glance lines, the NAV on every ledger row, and the tap-to-correct editor are all
  working on real data ("all working"). Guest safety of the new doors was verified in code the
  same day: every mutating sheet (incl. mfRecordSwpSheet and mfTxUnitSheet) fronts guestGuard,
  saves are no-ops for guests, and the relay refuses guest writes regardless. No advisor PIN is
  set, so the guest view is dormant until the owner hands one out.
- **Redeeming** is `mfRedeemSheet(id)` and nothing else: it cuts units, releases cost basis
  pro-rata (average cost), and writes an `out` tx so the money back shows up in the returns.
  Redeem everything and the fund stays at `units:0, inv:0` — *closed*, still counted, shown in
  Portfolio's "Closed · fully redeemed" group. The fund sheet's Delete is only for an entry
  added by mistake and purges that fund's txs/sips/swps with it. The Lumpsum diary never
  moves units.

### Booked P&L for the current FY (Home hero, v87)

Introduced v87; the fund half was corrected in v88 (see below).
A fourth tile on the **Home** hero, **"P&L booked (Current FY)"** — profit actually taken this
financial year, shares and funds in one figure. Owner asked for it 2026-09-18 and named the
label himself; keep the wording unless he changes it.

- **What it is NOT, and why.** He first asked for "net P&L for the FY", which most naturally
  means *how much the whole portfolio grew since 1 April* — realised **and** unrealised. That
  cannot be answered: the app's first commit is **2026-09-05**, five months into FY 26-27, so
  no snapshot, no `keep-` file and no price record exists for 1 Apr 2026 to measure against.
  The oldest monthly restore point can only be `keep-…-2026-09`. Presented with that, the
  owner chose the booked-only figure. **Do not quietly widen it later**: the full version is a
  real, viable feature, but it needs historical closes (Yahoo serves them on the same chart
  endpoint the relay already calls, via `period1`/`period2`; mfapi already serves NAV history
  and `mfNavOn()` already reads it) — which means a relay change, a new deployment and a new
  `/exec` URL. That is the owner's call, not a gap to paper over with an estimate.
  From FY 27-28 onward the app *will* hold its own 1 April record, so the baseline problem
  solves itself for future years — but never for this one.
- `fyWindow(off)` is now the **single** definition of a financial year as dates.
  `flowWindow()` was rewritten to call it, so the Flows FY chip and this tile can never come
  to disagree about which trades fall inside the year. It rolls over on its own every 1 April
  because `fyStart()` reads the clock — verified against a stubbed clock at 31 Mar, 1 Apr and
  mid-year, for two consecutive years.
- `realisedWin(from,to)` — shares. Per **sale**, FIFO: proceeds less the cost of the exact
  lots consumed. Note this is a different question from `realised(sid)` above, which is
  whole-position cash in vs out and only means anything once a name is fully sold; do not
  merge them. The lot walk is `holding()`'s line for line, so the two cannot drift, and
  `noLot` rows are skipped in both.
  - **The walk must run over every sale, in or out of the window**, or the lots standing when
    an in-window sale arrives are the wrong ones. There is a test for exactly this.
  - **An uncovered sale books nothing** — only the covered part counts, the rest is tallied in
    `naked`. This is the orphan-sell rule applied to a new figure: counting it whole is what
    once put the lifetime CAGR several points above the truth, and it is not hypothetical,
    because an IPO allotment produces no buy order at any broker.
- `mfRealisedWin(from,to)` — funds. `swp` and `out` only, `mfCounted` only, so HUF and private
  money stay out exactly as they do everywhere else.
  - Cost released is read from the tx's own **`rc`**, written from v87 by `mfRedeemSheet`,
    `mfRecordSwpSheet` and `mfTxUnitSheet` as the amount that *actually* came off the fund's
    cost basis (`inv` before − `inv` after), not a recomputed estimate. That is what makes the
    figure permanently exact: a fund's average cost today is no guide to what it was on the
    day of an older redemption.
  - `mfTxRemath()` gained an **additive** `rc` in its return (payouts only; `null` for a SIP),
    so a corrected payout stores a fresh one. Existing callers read only `.u`/`.i` and are
    untouched — the v86 properties were re-proven after the change.
  - `mfTxSheet` **scales** `rc` by the amount ratio: that sheet can change the amount and
    never touches the NAV, so the units sold move with the amount and the cost moves in step.
    It drops `rc` entirely if the entry stops being a withdrawal or is moved to another fund.
  - **A pre-v87 entry has no `rc`, so `mfReleasedCosts(fid)` rebuilds it (v88).** v87 shipped
    valuing those at the fund's average **today**; the owner rejected that outright the same
    day — *"no it should completely match. it should consider the original cost price"* — and
    he was right: every purchase made after a payout drags the average, so today's average
    answers the wrong question. Measured on the test scenarios, it was out by up to
    **₹23,529 on a ₹25,000 cost**, and it always overstated profit after a purchase at a
    higher price. Do not reintroduce it as a fallback.
  - The rebuild walks the fund's books **backward** from its current `units`/`inv` — the
    authoritative pair — undoing each tx. Undoing a payout is an identity, not an estimate:
    a redemption never moves the average, so `cost before = cost after × units before /
    units after`. That is what `mfTxRemath()` already rewinds with. Walking backward is the
    whole trick: it needs no knowledge of what the fund held before its records begin, so an
    imported holding with years of untracked history still prices correctly.
  - **Accuracy: worst case ₹1.84 across the scenario suite, typically under ₹0.50**, versus
    ₹23,529 for what it replaced. The residual is not a modelling error — `units` is re-rounded
    to 4dp and `inv` to whole rupees on *every* write, so walking back through a payout that
    took a large fraction of the fund amplifies that rounding. The information is genuinely
    gone from the books; nothing can recover it. Entries written from v87 carry `rc` and have
    **no** error at all, so this ceiling only ever applies to the pre-v87 backlog.
  - **`out` means two different things in this data, and the walk has to guess.** `mfRedeemSheet`
    writes an `out` that MOVES units (and has carried a `nav` since v85); the Lumpsum diary
    writes an `out` that explicitly does not. `mfTxUnits()` therefore reads a withdrawal with
    no `nav` as a diary entry, and `in` as never moving units (nothing in the app writes one
    that does). That is right for everything the app has written since v85; the exposure is an
    app redemption from 5–16 Sep 2026, or an import that used `in` for real purchases.
    The walk cannot detect that locally, so it **stops** rather than pressing on whenever units
    go materially negative, and everything it did not reach is disclosed instead of guessed.
  - It also stops at **a payout that emptied the fund** — from 0 units and 0 cost there is no
    average to walk back through. Such an entry is skipped and counted, never booked at zero
    cost, which would read as pure profit.
  - Whatever the walk *did* reach is sound on its own, because each figure derives from the
    fund's authoritative current state working backward; trouble further back cannot corrupt
    what was already computed. So a stop keeps its results rather than discarding them — an
    earlier guard that threw the whole fund away was deleted for binning answers that were
    right to the paisa. **Its tolerance must stay above the app's own rounding** (`slack` grows
    with the tx count); too tight a bound there is not a safe default, it is a silent data loss.
  - `mfNavCached()` is the synchronous cache-only NAV lookup the walk needs inside a render;
    `mfWarmNavs()` (called from `bind()`, beside `mfFillTxNavs()`) fetches any missing history
    once and re-renders. Both are read-only and never write to the document.
- Anything skipped or uncovered surfaces as one plain line under the Home list, and **only**
  when the count is non-zero — a permanent caveat under a figure becomes wallpaper.
  The tile shows **"—"**, not ₹0, when nothing was sold all year: "nothing to report" and
  "sold up and came out exactly level" are different statements.
- `.hk.tight` exists because "P&L BOOKED (CURRENT FY)" wraps to two lines at 375px, which
  pushes its figure down and breaks the row's alignment with the cell beside it. Tightened,
  deliberately **not** `nowrap`, so a narrower phone wraps untidily rather than clipping the
  year off the end. Measured after the change: all four labels one line, the two values in
  row 2 within 1px of each other.
- Verified by extracting the shipped functions and running them in node (**47 assertions**:
  12 share cases incl. FIFO order, the previous-FY boundary at 31 Mar/1 Apr, lots eaten by an
  earlier out-of-window sale, `noLot`, orphan and partly-covered sales, intraday round trip;
  12 fund cases incl. stored-vs-rebuilt cost, the emptied-fund skip, HUF/private exclusion;
  14 clock and remath cases; **9 cost-rebuild cases**), plus a live render at phone width
  driven with synthetic data in the real document shape — privacy shutter, the "—" state and
  the uncounted-sale line all confirmed on screen.
  - The cost-rebuild suite is the one worth keeping in step. It **forward-simulates exactly
    what the sheets write** (rounding units to 4dp and cost to the rupee on every write, as
    the app does), records what each payout really released, then checks the backward walk
    recovers it: purchases after a payout at much higher and much lower prices, SIP and SWP
    running together, back-to-back payouts, a Redeem mixed with SWPs, a payout at a loss, an
    imported opening holding, the owner's own SWP-into-another-fund rhythm, and a 40-entry
    history. It prints the worst error for the new and old methods side by side — rerun it
    after touching any of this, and expect the new number to stay near ₹1.
- **Not yet confirmed against the owner's real data** (see below).

## Data durability (do not weaken)

**Relay v15 write guard covers the WHOLE document**, not just stocks/txns: `shrunk_(old,inc)`
refuses any save that empties a section (`stocks`, `txns`, `mf.funds`, `mf.txs`, `mf.sips`,
`mf.swps`, `esops.grants`, `esops.lots`) or halves one that held >= 20 rows, and refuses to drop
`history`. Only `force:true` (the in-app restore flows) may shrink a section. This closed a real
hole: the v62 login bug left `meta.mf` unset in memory, and the old stocks-only guard would have
happily written the funds away.

1. Server rejects any save that empties a section, halves one that held >= 20 rows, or drops
   `history` (`suspicious_save`), unless the client passes `force:true` — only the Restore
   flows do. See `shrunk_` above for the exact section list.
2. Before the first save each day, the previous state is snapshotted to the Drive folder
   **"Folio Backups"**: `snap-<hash8>-YYYY-MM-DD.json` (pruned after 60 days) and
   `keep-<hash8>-YYYY-MM.json` (**permanent, never pruned**).
3. The app re-loads from the server when it regains focus after >2 min, so a stale tab can't
   overwrite newer data.
4. ⚙ Account → *Go back to an earlier version* browses and restores any snapshot in-app;
   *Save a copy to this device* writes the whole document (`liveDoc()`) as a file. Both restore
   routes preview the copy's contents and name what restoring it would **remove** first.
   A **permanent banner** (v76, was a timed nudge in v75) sits under `#status` carrying the
   last-save stamp, with one tap to save. That device copy is the only one that does not live in
   the same Google account as the data file, the snapshots and the monthly email, which is why
   the app states its age rather than leaving it to memory.
   - `bkShow()` decides whether it appears at all - **not** whether a save is owing. It is always
     on screen except for guests, an empty portfolio, and before the first load.
   - `bkOverdue()` only decides its **tone**: quiet (`--surface`/`--muted`) when the copy is
     current, gold (`.due`) once 15:30 has gone past without one. Do not wire it back to
     visibility; the stamp is the point, and a permanently gold bar becomes wallpaper.
   - `nudgeAt()` resolves to the most recent 15:30 that has passed, so before 15:30 today the
     live nudge is still yesterday's. An unanswered banner therefore just stays gold - nothing
     is created or replaced at midnight, because there is one banner and one stored timestamp.
   - `bkStamp()` renders it, reusing the app's `toLocaleDateString("en-IN",…)` so "5 Sept" reads
     the same as every other date in the app.
   - `renderNudge()` rebuilds only when `last|due` changes, so the row is never swapped under a
     finger and the "Saved" confirmation survives the 5s `renderHeroOnly()` tick.
   - Both the banner and the Account button go through `exportBackup()` and both call
     `nudgeDone()`. Keep them on one path or saving from Account leaves a stale stamp.
   - Saving in the morning still turns the banner gold at 15:30 that day: the rule is "since the
     last 15:30", not "since midnight". Raised with the owner and not settled either way - it
     matters less now the banner is permanent, since only the tone changes. Ask before altering.
5. Wrong-PIN attempts are counted per account and a given wrong credential only ever costs one
   strike, so one stale device cannot lock the owner out (see the lockout gotcha).
6. The monthly email below puts a copy in a second Google *service*. It is not outside the
   account - see the correction under *Monthly off-Drive backup*.

### Monthly off-Drive backup

`monthlyBackup()` emails the account JSON to the script owner on the 1st of each month.
**Installed and live since 2026-09-11** (Triggers page shows one time-based trigger on `monthlyBackup`,
running against Head). The Apps Script project is named **"Folio backend (portfolio app)"**.
(`setupMonthlyBackup()` installs or reinstalls the trigger; `backup_users` script property, default
the `backup_users` script property names the account - the code constant is deliberately empty
so a public repo never carries half a login, `whoIsBackedUp()` prints what is configured, and a
run with nothing configured emails the owner a warning instead of failing silently). It exists
because the live file, the daily snapshots and the monthly archive all sit in one Google account.
**Be accurate about how far it goes:** `MailApp.sendEmail` addresses
`Session.getEffectiveUser().getEmail()` - the script owner - so the attachment lands in the *same*
account's Gmail. It survives a bad restore, a deleted Drive folder or a wiped data file; it does
**not** survive losing the account. The only copy that does is the device file, which is why v75-v77
put a permanent banner on it. Forwarding the monthly mail to a non-Google address would close the
gap; that is a standing mail rule and the owner's call, so ask, do not add one.

**Head vs deployed (historical - the split is now CLOSED):** the backup functions live in the
project **head**, and time-driven triggers run head. The web app used to serve a *pinned* version,
so `?action=ping` answered a lower number than head - that gap was the design, not drift: it kept
the live app from ever being blocked on scopes it had not been granted. The owner's authorisation
turned out to already cover Mail + Trigger, so the split was closed and **the web app now serves
the same code as head** (see *Architecture*): deployment **"Version 16"**, `?action=ping` answers
**v:18** - two unrelated counters, do not try to align them. Verified live on 2026-09-17.
Redeploying head is still never worth doing mid-market-day.

**Verified end to end on 2026-09-11**, not just by reading code: the trigger was installed and
listed on the Triggers page, `monthlyBackup()` was run once, the mail arrived, and the attachment
was downloaded and checked. Its SHA-256 equalled the stored document's byte for byte (86,004 B),
and feeding that file alone to the deployed app's `applyDoc()` from an empty state rebuilt every
section and re-serialised identically. Re-run that proof after any change to the document shape.

### Changing a PIN

Owner: ⚙ Account -> *Change my PIN* (`pinSheet()` -> `setpin`). The client updates `AUTH.p` and
localStorage on success; other devices on the old PIN drop to the sign-in screen (`authGone`).
Advisor: ⚙ Account -> *Advisor access* -> set a new PIN (replaces the old immediately) or
*Revoke access*. Verified end to end on a throwaway account: old PIN rejected, new PIN works,
data and snapshots intact under the new PIN, advisor unaffected by an owner PIN change, old
advisor locked out the moment a new advisor PIN is set, and revoke locks out everyone.

**Confirmed on the LIVE account, 2026-09-17** - the owner rotated their own PIN and reported the
portfolio rendering normally *and* ⚙ Account -> *Go back to an earlier version* still listing the
old snapshots. That is the `sha(user:pin)` rename of the data file **and** of every `snap-`/`keep-`
file working on real data, not just on a throwaway. Tell the owner to save a device copy first
anyway: the rename is the one moment every stored artefact for the account moves at once.

### Backup file naming

Device export: `Folio-backup-YYYY-MM-DD-HHMM.json` (capital F so it is findable by eye in a
phone's Files app, ISO date so copies sort chronologically, clock time so two saves in one day
do not collide). Email attachment: `Folio-backup-<user>-YYYY-MM-DD.json`. Keep both prefixes.

### Restores must apply the WHOLE document

Both restore paths (server snapshot and pasted file) used to do `stocks=d.stocks; txns=d.txns`
and then `saveRemote(true)`. That is `force:true`, which **bypasses the write guard** - so a
restore silently wiped funds, ESOPs and the imported history, the exact data the backup was
holding. v70 routes both through `applyDoc(d)`, which sets every section (and clears one the
document genuinely lacks), and shows `docSummary(d)` for confirmation before overwriting.
**Adding a new top-level section is a seven-place change.** Miss one and it silently fails to
save, fails to restore, or gets wiped: `liveDoc()` (what leaves the app - saves AND the device
export read it), `applyDoc()` (restore), `docSummary()` (the preview), `docLosses()` (the
"this removes..." warning), `isFolioDoc()` (paste validation), `cacheLocal()` (it stores whole
`meta`, so `meta.x` is automatic but a NEW top-level key outside `meta` is not), and the relay's
`shrunk_` guard. Note the naming asymmetry: in memory these live as `stocks`, `txns` and
`meta.history` / `meta.esops` / `meta.mf`, but in the document they are all top-level.

## Release process

```bash
# 1. edit index.html
# 2. bump BOTH: CACHE in sw.js and BUILD in index.html (folio-vN -> folio-vN+1)
git add -A && git commit -m "..." && git push
# 3. Pages usually serves in 1-2 min, but has taken 30-40+ min; queued builds then flush
#    together. Do not assume a failure - poll until BUILD flips, e.g.:
until curl -s https://ankit-icici.github.io/folio/index.html | grep -q 'BUILD="vN"'; do sleep 30; done
# (gh api repos/ankit-icici/folio/pages/builds/latest --jq .status shows building/built)
```

An installed PWA only re-checks `sw.js` on launch/foreground/10 min, so after a release ask the
user to foreground the app; `BUILD` at the foot of the Account sheet tells you what they are on.

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

(Do not trust a blanket claim that the Apps Script `/exec` is unreachable from a sandbox - it
has been reached successfully with plain `curl`. Try `?action=ping` first; only fall back to the
browser if it actually fails.)

Never ask for the PIN. Ask the user to sign in in their browser, then run checks through that
signed-in page (`api()`, `stocks`, `txns` are all in scope), e.g.
`await fetch(api('action=snapshots')).then(r=>r.json())`.

When the browser is unavailable — or to *prove* an invariant rather than eyeball one — verify the
**deployed** logic offline: `curl` the live `index.html`, pull the functions out of it by name
(brace-match from `function <name>(`), and run them in node with `new Function('mfunds','mfTxs',
code + 'return {…}')`, feeding a synthetic dataset in the real `meta.mf` shape. This tests what is
actually shipped, not a local copy. The strongest form is a **differential** run: build the same
dataset with and without the thing under test and assert the outputs are identical to several
decimals — that is how the "private funds move no total and no return" rule was confirmed.

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
  inflates the return. This produced a materially wrong CAGR once - several points above
  the truth - and it looked plausible, which is why it went unnoticed.
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

### ifaplanet (the advisor's mutual-fund portal)

Regular-plan fund data comes from the advisor's portal, `ifaplanet.com` ->
`get_family_report_detail.php` (the owner signs in himself). Quirks that cost real time:

- The SWP table renders **empty until "Show All SWPs" is clicked**; same pattern for SIPs/STPs.
- The SIP register **double-lists** a fund held under two folios, so the monthly total it
  shows can be double the real one. Cross-check each registration against that fund's invested amount.
- Rows labelled "Systematic (Electronic credit)" on SBI Balanced Advantage are **SWP payouts
  arriving**, not SIPs. In the app they are modelled as an SWP with a `to` destination.
- The family layout repeats HUF rows; dedupe before importing.
- Its portfolio "CAGR" is an average-holding-period shortcut, not XIRR, so it reads higher than
  the app's money-weighted figure. The app's was verified offline against the same flows and the
  absolute return matches exactly - the tell that the data agrees and only the method differs.
  Do not "fix" the app to match a portal's number.

### Importing a broker's history

Read the broker's own **order/transaction ledger** before modelling anything. Do not
reconstruct a history by fitting NAV series to current units: current units only reflect what
survived, so any past redemption is invisible to the fit. That mistake put a 5.8-year SIP
(69 instalments, ₹2.11 L in, four redemptions, ₹2.05 L out) into the app as 19 instalments with
no redemptions - turning a solidly positive lifetime XIRR into a small negative one, because
the money already taken out had vanished from the picture.

Groww specifics: the ledger is **All orders → Mutual Funds** (`/user/order/mutual-funds`), and
it **lazy-loads** — scroll until `document.body.scrollHeight` stops growing, else you silently
get only the newest ~20 rows. Its dashboard shows three unlike numbers at once (a portfolio
XIRR tile, a per-fund XIRR column, and your actual total return); only the last is arithmetic
on your own money, and a positive XIRR alongside a below-cost holding always means past
redemptions. Redemption rows may be denominated in **units**, needing that date's NAV to value.

## Design language

Ivory/near-black surfaces, restrained gold accent, Instrument Serif (wordmark, sheet titles),
Schibsted Grotesk (UI), Spline Sans Mono (all figures). Full light/dark support via CSS tokens
on `:root`, `@media (prefers-color-scheme: dark)` guarded with `:root:not([data-theme="light"])`,
and `:root[data-theme="dark"]`. Minimal chrome, no explanatory clutter, mobile-first (max-width
560 px, safe-area insets). Keep it that way.

- **The sub-tab row is frozen under the main one (v79).** `#subseg` is what carries
  `position:sticky`, **not** the `.seg.sub` nav inside it: a sticky element can only travel
  within its containing block, and that wrapper is exactly the nav's own height, so sticking the
  nav itself does nothing at all. The nav's old `margin-top:10px` moved onto the wrapper as
  `padding-top`, both to keep the spacing identical and to stop the margin collapsing out of the
  sticky box. `#subseg:empty` resets to static with no padding, so Home and ESOP - which render
  no sub row - gain no stray gap. The offset is `calc(10px + var(--segh))`, where `--segh` is set
  by `syncSegOffset()` from the main pill's real `offsetHeight` (called in `render()` and on
  resize) rather than a hardcoded constant, so platform font metrics cannot make the two
  overlap. Measured after the change: main pill 10 → 51.9, wrapper sticks at 52, sub pill
  62 → 101.2, i.e. the original 10px gap and no overlap.
- `renderHeroOnly()` (5s interval) has its OWN copy of the per-tab hero switch - a new tab's hero must be added BOTH in `render()` and `renderHeroOnly()`, else the hero blanks a few seconds after opening the tab (bit the Funds dashboard in v56).

## Advisor (guest) access & privacy
- Relay v11: a second per-account PIN stored as script property `g:<user>` (sha, same scheme as `u:<user>`). `auth_` returns `{guest:true}` for it; `load` strips `esops` server-side and tags the reply `guest:true`; every write (`save`, `setguest`, `unregister`) and `snapshots`/`snapshot` return `forbidden` for guests.
- Owner sets/revokes it from Account -> "Advisor access" (POST `{action:'setguest',gp}`; empty gp revokes).
- Lockout gotcha (relay v13): the brute-force guard used ONE global 'fails' counter (>30 in 10 min = every login refused, owner included). The app re-prices every 15s, so a single device holding a revoked/changed PIN burned 4 strikes a minute and locked the account out. v13 counts per account (`fu:<user>`, >20) and each distinct wrong credential (`fh:<hash>`) adds only its FIRST failure, so a looping stale device costs 1 strike. `clearLock()` in the editor clears the counters. Client v65: `authGone()` stops the polls - 'locked' backs off 5 min, 'unauthorized' signs out to the login screen.
- Home's `+` opens `addWhatSheet()` (stock or fund) because Home holds both kinds; Stocks/Funds/ESOP tabs go straight to their own add sheet. (Redemption lives under **Mutual funds** above.)
- `guestGuard()` fronts every mutating sheet, so the advisor keeps the whole UI (including the `+`) but each editing door answers "View-only access". `maskGuard()` does the same while the privacy shutter is on.
- Private funds (relay v14 + client v69): a fund with `priv:1` in `meta.mf.funds` is deleted from every GUEST load, along with its sips/swps/txs (and a swp's `to` is dropped if it pointed at one). **It is also outside every aggregate in the OWNER's view** - `mfCounted = f => !(f.who==="HUF") && !f.priv` gates `mfTotals`, `mfReturns`, `combinedCagr`, the Home hero and the fund count, and the SIP/SWP headline totals exclude private plans (surfaced as a separate "plus X/month on private funds" line). The point is that the owner's dashboards tie to the advisor's official app figure for figure, always. Private funds stay visible in Portfolio under "Private - outside every total", with their own per-fund CAGR, and `privTotals()` exists if a private subtotal is ever wanted.
- `hufTotals()` must test `f.who==="HUF"` directly, NOT `!mfCounted(f)` - otherwise private funds silently land in the HUF subtotal.
- Relay v12: guests KEEP `search` and `quotes` (public market data) - only `snapshots`/`snapshot` and every POST are owner-only. v11 gated all of doGet after `load`, which silently killed stock search in the advisor view (client showed "Nothing found").
- App: `AUTH.g` set at login from the reply; `isGuest()` hides the ESOP tab and the + button, no-ops saveRemote/saveNow, slims the Account sheet. The advisor logs in with the SAME username + the advisor PIN at the same URL.

## What is in the live account (shape only - no figures in a public repo)

Ask the owner for current numbers; this is only so you know what exists:

- **Stocks**: a couple of dozen holdings across Core and Satellite. The employer's own shares are
  ESOP-only and never appear in `stocks{}`.
- **Funds**: several counted personal funds, one HUF-held fund (excluded from every aggregate),
  one fully-redeemed fund kept at `units:0` so its flows still count, and one **private** fund
  (self-managed, held at a different broker) that is outside every total on both sides.
- **ESOPs**: a handful of grants with their exercised lots; perquisite amounts are the actual
  per-lot figures from the owner's sheet (a mix of rates), not a flat rate.
- **Imported history**: a multi-account broker ledger ending at `history.end`, which is why
  hand-entered trades need `keep:1`.
- **Advisor access**: no advisor PIN is set at present. Setting one is the owner's call.

### Open decisions / backlog

1. **Three exited funds at the self-managed broker are not imported** (the owner was offered
   this and has not decided). They would join as closed private funds and, being private, would
   move no dashboard figure - only the Closed group and their own per-fund CAGR.
2. **Git history still contains data that the current files no longer do.** Scrubbing HEAD does
   not remove it from a public repo's history. Rewriting history (filter-repo + force-push) is
   the owner's decision; flag it, do not do it unasked.

   *Audited 2026-09-17 — measured, not assumed:*
   - **78 of 97 commits** carry the owner's email; the only affected path is `CLAUDE.md`
     (plus `relay/Code.gs` for the username, below). HEAD itself is clean - 0 hits.
   - The worst commit (`373f262`) holds 1 email address and **18 rupee figures**.
   - A **literal login username** was committed in 2 revisions of `relay/Code.gs` as a
     non-empty `BACKUP_USERS` constant, which is why that constant is now deliberately empty.
     **But do not treat the username as a secret that history leaked** - it is a substring of
     the public GitHub account name *and* of the app's own address
     (`https://<owner>.github.io/folio/`), so anyone who opens the app already has it. It is
     in the CURRENT files 6 times, 5 of them inside github.com / github.io URLs. Scrubbing it
     from history therefore achieves **nothing**, and a replace-text rule matching it would
     corrupt every one of those URLs. Excluded from the scrub set for exactly that reason.
     The practical consequence: since auth is username + PIN and the username is permanently
     public, **the PIN is the only real lock on the account** - which is why rotating it (done,
     below) was worth far more than any amount of history rewriting.
   - **Clean:** no API keys, OAuth tokens, GitHub tokens, private keys or sha256 hashes
     anywhere in history. The three committed `/exec` URLs are public by design (the live
     `index.html` serves the current one).
   - **0 forks, 0 stars.** No fork-retained copies exist, so a rewrite would actually be
     effective here - the residual channels are GitHub's own orphaned objects (retrievable
     by old SHA until GC; ask GitHub Support to GC) and any external caches.

   *Owner's decisions, 2026-09-17:*
   - **PIN rotated on 2026-09-17** (declined at first, then done once the reasoning above was
     clear). This is the mitigation that actually closed the risk. Do not keep proposing it.
   - A **paid GitHub plan** - which is what a private repo serving Pages would need - was
     **declined**. Do not re-propose it.
   - **The scrub itself is still OUTSTANDING.** Scope is settled: 1 email address + 10 rupee
     figures, all absent from HEAD, so the current files come out byte-identical. The username
     is deliberately NOT in that set (see above). 7 further candidates were skipped because
     they also appear in the current files. Blocked only by tooling permissions, not by any
     decision - the owner said to run it. Residual after it lands: GitHub keeps orphaned
     objects addressable by old SHA until GC, so ask GitHub Support to GC.
   - Now that the PIN is rotated, the scrub is **privacy housekeeping, not a security fix**.
     Treat it as low urgency and say so rather than alarming the owner.
3. **The FY figure that includes holdings, not just sales, was offered and deferred.** On
   2026-09-18 the owner was given the choice and picked booked-only (shipped as v87), which
   is the half the trade records can prove on their own. The other half — his holdings rising
   or falling since 1 April — needs historical closes through the relay, so it costs a backend
   change, a new deployment and a new `/exec` URL. He has not said no to it; he has not been
   asked again since. Worth re-offering once he has lived with the booked figure, and note
   that from FY 27-28 the baseline problem disappears on its own.
4. Nothing else is half-built. If a feature looks unfinished, ask before assuming.
