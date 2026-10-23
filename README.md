# Flat Bid Calculator

Free, mobile-first web app (single page, vanilla JS — no frameworks) that runs
flat-bid math the way Chris Babcock actually bids. Staged locally only —
NOT deployed. No GitHub repo yet.

## Files
- `index.html` — the page (inputs, results, change-order mode, funnel CTAs)
- `styles.css` — navy/amber, phone-first, system fonts (zero external requests);
  print stylesheet shows ONLY the client-safe bid summary
- `app.js` — pure bid math + UI wiring; math exported for the QA gate
- `manifest.json`, `sw.js`, `icon.svg` — PWA basics: installable, works offline
- `qa.js` — the QA gate (Node): `node qa.js` must pass before any deploy
- `v1-backup/` — the complete v1.0 file set, untouched

## The math (Chris's calibration)
- Bid = labor (hours **per person** × crew × rate) + materials lines (each:
  cost + its markup %, default 15%, guideline 10–20%; sales tax, when on,
  passes through at cost — never marked up) + haul-off + other costs
- Deposit: default 50% up front, balance on completion; % is editable;
  computed on the (optionally rounded) bid
- Small-job rule: bid ≤ $500 with the toggle on → no deposit, full on completion
- Effective $/hr = bid ÷ total crew-hours (app definition; the packs' worked
  example also quotes a profit-per-hour figure — different metric)
- Change order: revised total = bid + change; deposit already collected stays
  put, the revised balance absorbs the change
- Markup ≠ margin: the materials readout shows profit $ and the true margin %
  (a 20% markup is a 16.67% margin)

## v2.0 — what changed (Oct 23, 2026, after the competitor scan)
Scan: `~/workspace/research_notes/bid-calculator-competitors-20261023/report.md`
(Joist, CostFlowAI, BidCalculator.net, Takeoff Convert, sold Etsy/Payhip
workbooks.) v2 closes the gaps that fit a free, offline, no-account tool:
1. **Multiple materials lines** with per-line markup override (category
   default + per-line override is the pro pattern on the workbook shelf)
2. **Sales-tax toggle** on materials, passed through at cost
3. **Markup vs margin done right** — profit $ and margin % beside the markup
4. **Saved jobs + crew presets** in localStorage (the Settings-tab pattern
   without an account); v1 saved inputs migrate automatically
5. **Printable client-safe bid summary** — your business name/phone, priced
   lines only (never costs or markup %), bid/deposit/balance, pack terms;
   free, where rivals paywall branded/exported documents
6. **Labor-burden helper** — wage + burden % → true rate (mirrors the
   Contractor Pack's Labor Burden sheet), one tap to use it as the bid rate
7. **Bid rounding** to the nearest $10/$50, applied before the deposit split

Deliberate non-goals (they need servers/accounts): cloud sync, CRM,
e-signature, payments, QuickBooks, live material pricing, AI estimating.

## Data / privacy
Everything runs in the visitor's browser. Inputs, saved jobs, and presets
persist in localStorage on the same device only. No accounts, no server,
no tracking, no analytics.

## Funnel links
- Contractor Paperwork Pack: https://payhip.com/b/i7upw (live)
- Shop: https://payhip.com/allaroundpaperwork
- Landlord / Tree product links in index.html are PLACEHOLDERS (shop URL)
  until those products' direct URLs exist.

## QA gate results
- **v1.0 (Oct 23, 2026): 25 assertions, 25 passed** (commit ff0dc63c0e33)
- **v2.0 (Oct 23, 2026): 39 assertions, 39 passed** — the full v1 gate
  re-run unchanged against the v2 math (legacy input shape), plus 14 new
  assertions: multi-line materials, per-line override, tax pass-through,
  markup⇄margin conversions, burden rate vs the pack's own sheet
  ($20 + 20.65% = $24.13), and rounding before the deposit split.
- Worked-example sourcing: both packs' documented totals ($1,250 + $180 CO
  chain; $2,980 + $175 CO chain) reproduce to the dollar. Bid-input splits
  were reconstructed to the app's model from those totals — the workbooks
  track job costs / count×rate lines, not app-style bid inputs.

## Before deploy (GitHub Pages)
1. Create the GitHub repo (queenellis2026-hash) — deliberately not done yet
2. Replace the two placeholder product URLs in index.html
3. Re-run `node qa.js` (39/39) on the exact tree being published
