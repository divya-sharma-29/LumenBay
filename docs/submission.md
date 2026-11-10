# CitySim Nexus: submission note (one page)

**Team:** Apex Force · **Event:** CodeQuest National Tech Hackathon 2026, Round 2 · **City:** Lumen Bay (fictional)

## What it is
An interactive digital twin of a made-up city of 15,000 residents. Change one thing (close a bridge, cut buses, flood the river,
take a hospital out of action, add a bus route) and the effects travel through connected systems: roads, mode choice, jobs and
output, shops, power and water, hospitals and schools, and the public budget, which then feeds back into bus service. It ranks
possible responses under a limited budget, says who gains and who loses, and shows how sure it is.

## Open it
- **Link:** https://kanishkamehta648-cmd.github.io/-Fictional-City-Simulator/ (published by GitHub Pages after the tests pass)
- **Code:** https://github.com/kanishkamehta648-cmd/-Fictional-City-Simulator
- **Offline:** open `src/index.html` by double-click, or `npm run dev`. No install, no server, no internet.

## Deck promise → where to see it
| Deck | In the prototype |
|---|---|
| Interactive city twin | **City** tab: map, click an area or road, 8 districts, 11 roads, 3 bus lines, 2 hospitals, 6 schools |
| Ripple-effect engine | **Impact** tab, "Why did this happen?": each line is calculated from the one before |
| Policy Impact Ledger and equity lens | **Impact** tab: better off / worse off / unchanged (each resident counted once), by district, income, car ownership and need, with cost and spillovers |
| What-If Policy Lab | Bus sliders, close any road, events, add a bus route, raise hospital or school capacity, emergency budget |
| Live stress test | **Surprise me**; flood, heatwave, strike, bridge, hospital outage; judge-built scenarios open from a link |
| Explainability and confidence | Assumptions table (all 84 settings), **Check across 10 cities**, **Test the assumptions** |
| Extras | Saved experiments, Undo, Reset, downloadable report, recommendation written from the numbers |

Full table with the test that checks each row: `docs/deck_coverage.md`.

## Where we differ from the deck, and why
The deck recommends React + TypeScript, FastAPI and NetworkX. We built plain JavaScript with no backend, so a judge can run it by
double-click and nothing can fail on the day. The ideas are the same: a road graph with Dijkstra shortest paths, capacity
constraints, deterministic rules, a separate impact layer. There is no Python service and no database (scenarios live in the link,
saved experiments in the browser).

## How we know it is coupled and not just charts
142 model checks (each causal arrow is tested in both directions), 154 page checks, 150 rehearsed scenarios (every event
combination, every road closed, random surprises with random responses), hostile-link and rapid-click tests, and an accessibility
and layout audit at five screen sizes in light and dark. `npm test`, `npm run test:page`, `npm run rehearse`, `npm run test:audit`.

## Honest limits
Morning peak only · everyone has a job · power and water are city-wide totals · responses stay on all 14 days · uncertainty ranges
cover who lives where (plus a six-assumption sensitivity test), not every rule · only Chromium has been tested (the code uses
plain JavaScript and should run in current Firefox and Safari) · all results are estimates for a fictional city, not forecasts.

## A 2-minute demo
Close Crown Bridge → traffic piles onto Kings Bridge (142%), 6.5% cannot reach work → budget goes negative → press Play: austerity
cuts buses and the commute climbs → **Compare responses**: doing nothing costs 1,288k of harm, the best affordable plan 204k and it
wins in all 10 simulated cities → ledger: 7,420 better off, nobody worse off. Full script: `docs/demo.md`.
