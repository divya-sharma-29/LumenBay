# CitySim Nexus deck: what is built, where, and how it is checked

This maps every feature promised in the Round 2 idea deck ("CitySim Nexus") to the prototype.
"Lumen Bay" is the fictional city; the page title still says Fictional City Simulator.

| Deck item | Status | Where to see it | Checked by |
|---|---|---|---|
| 2.3.1 Interactive city twin: districts, roads, buses, services, utilities; select a place, inspect it | Done | **City** tab: map, click an area for its detail, **Details** tab tables | `tests/page.js` |
| 2.3.2 Ripple-effect engine: closure changes routes, travel times, mode choice, access, money | Done | Every control; **Impact** tab "Why did this happen?" | `tests/scenarios.js`, `tests/economy.js` |
| 2.3.3 Policy Impact Ledger: who gains or loses access to jobs, hospitals, schools; districts flagged; costs; labelled as estimates | Done | **Impact** tab, Policy Impact Ledger card | `tests/ledger.js`, `tests/services.js` |
| 2.3.4 What-If Policy Lab: bus frequency, close roads, add routes, capacity, budget, inject events, compare | Done | **City** tab controls (bus sliders, close roads, **Add a bus route**, events, services out of action, **Raise capacity** at a hospital or school); **Respond** tab budget slider | `tests/routes.js`, `tests/capacity.js`, `tests/responses.js` |
| 2.3.5 Live Stress-Test Mode: judges inject a flood, bus disruption, outage | Done | **Surprise me**, flood, heatwave, strike, bridge, hospital out of action | `tests/rehearsal.js` (150 scenarios), `tests/browser.js` |
| 2.3.6 Explainability and confidence: factors, assumptions, repeated runs with varied assumptions | Done | "Why did this happen?", **Assumptions** table, **Check across 10 cities**, **Test the assumptions** | `tests/uncertainty.js`, `tests/sensitivity.js`, `tests/assumptions.js` |
| Equity Lens: better / worse / unchanged counted once; district and group differences | Done | Ledger card: districts, income, car ownership, need | `tests/ledger.js` (no double counting) |
| Resource efficiency: residents served per unit of spending | Done | Ledger card (net residents better off per 10,000 credits) | `tests/ledger.js` |
| Spillovers: congestion, business access, utility load elsewhere | Done | Ledger card, spillover rows | `tests/ledger.js` |
| Budget-constrained planning | Done | **Respond** tab, emergency budget slider | `tests/responses.js` |
| Scenario history: save and reopen | Done | **City** tab, Save experiment / Saved experiments | `tests/report.js`, `tests/page.js` |
| Undo and reset | Done | **Undo** and **Reset city** buttons | `tests/page.js` |
| Automatic scenario report: outcomes, costs, assumptions | Done | **Download report** (a printable HTML page) | `tests/report.js`, `tests/page.js` |
| Sensitivity analysis: vary demand, road capacity, service assumptions | Done | **Respond** tab, **Test the assumptions** (6 assumptions, low and high) | `tests/sensitivity.js` |
| Policy recommendation assistant using real results | Done | **Respond** tab, "Recommendation (written from the numbers above)" | `tests/report.js` |
| Reproducible baseline; every scenario against an unchanged baseline | Done | Everything is compared with the normal city; same inputs give the same answer | `tests/ledger.js`, `tests/routes.js`, `tests/sensitivity.js` |
| Milestone 5: stress-test a bus reduction, a bus increase, a flooded road | Done | Rehearsal runs every event and combination | `tests/rehearsal.js` |

## Where the prototype differs from the deck

- **Tech stack.** The deck suggests React + TypeScript, FastAPI, NetworkX and Recharts. The prototype is plain
  JavaScript with no install and no server (open `src/index.html`, or `npm run dev`). The same ideas apply: a graph
  of roads, Dijkstra shortest paths, capacity constraints, deterministic rules, a separate impact layer. The
  deck calls its stack a recommendation ("suitable for a student team"), and it was chosen so a judge can run the
  prototype with a double-click. It is not a React app and has no Python backend.
- **Resident groups.** The deck suggests counts such as commuters, students and people who need healthcare. The
  prototype uses 3,000 simulated agents (each standing for 5 residents) with a neighbourhood, income, car ownership,
  and a fixed share who need a hospital or attend school. Groups add up exactly across the baseline and every scenario.
- **Size.** Eight districts, eleven roads, three bus lines, two hospitals and six schools (see the Services card) rather than
  "four to six districts"; a bigger city, not a smaller one.
- **Utilities and business.** Power and water are city-wide totals (blackouts are shared evenly), not per district.
- **Hosting.** `.github/workflows/pages.yml` publishes `src/` to GitHub Pages after the tests pass. It needs the one-time
  setting Settings > Pages > Source: GitHub Actions. A private repository needs a paid plan for Pages.

## Known limits (also in the README)

Morning peak only; everyone has a job; responses stay on for all 14 days; ranges cover who lives where, and the
sensitivity test covers six assumptions, not all of them. All results are model estimates on a fictional city.
