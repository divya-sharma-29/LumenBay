# Lumen Bay: Fictional City Simulator

An interactive digital twin of a city that doesn't exist. Change one thing
(a bus schedule, a flooded bridge) and watch the effects ripple through
transport, residents, businesses, utilities and the public budget.

> **3D intro:** open `intro.html` (same folder as `index.html`; on the live link add `/intro.html`) for a scroll-driven photo tour of Lumen Bay. See `docs/intro.md`.

## Core idea

The systems are coupled, not separate charts:

```
Bus cut -> mode switch to cars -> congestion -> longer commutes
        -> lateness + fewer shop visits -> lower revenue
        -> lower tax income -> smaller budget -> worse service
```

## Try it

**Judges' link:** https://kanishkamehta648-cmd.github.io/-Fictional-City-Simulator/ (GitHub Pages; every push to `main`
re-runs the tests and republishes the page). **One-page summary:** `docs/submission.md`. **What does the deck promise and where is it?** `docs/deck_coverage.md` maps every item.

**Presenting it?** Follow `docs/demo.md`: a 5-minute script with the exact clicks, the numbers to expect,
backup stories and answers to likely questions.

**Different city?** The simulator runs any city described in a city file. Open the **City** menu at the
top: **Download this city's file** shows the format, **Load a city file...** runs your own (it is checked
first, and a bad file gets a plain-English list of what to fix), and **Try the example city** loads
Port Marlow, a second city with its own map. **Back to Lumen Bay** returns. Only the roads, areas and
bus lines are required; anything else falls back to Lumen Bay's values and the page says so.

**What was the model told?** The **Details** tab ends with an **Assumptions** table: every number the
model relies on, in plain words, with built-in defaults marked.

Run `npm run dev` and open http://localhost:5173 for the home/intro page. Choose **Open the
simulator** there, or go straight to http://localhost:5173/index.html. Use the local server
because the simulator loads ES modules and needs WebGL; opening `index.html` directly as a
`file://` URL will not start the 3D scene.

The page has four tabs. **City**: the 3D city, the timeline and every control. **Impact**: why it happened,
the key numbers (all 18 metrics are one click away) and the budget. **Respond**: compare fixes.
**Details**: the full tables. The summary card at the top follows you across all four.

- Drag the bus service sliders, or press a preset (bus cut, strike, flood, heatwave).
  Presets combine, and **Surprise me** picks one or two events at random.
- Click any road in the city scene (or tick it in the Roads table) to close or reopen it.
- Explore the live 3D city scene: roads, bridges, districts, individually modelled
  buildings, service landmarks, a central park, trees, vehicles and wind turbines.
  Drag to orbit and scroll to zoom. Road congestion, closures, flooding and district
  conditions are reflected in the scene. **Download 3D city** exports an editable GLB.
- Watch the city scene, the metrics (all compared with the baseline) and the
  "Why did this happen?" panel, which traces the chain of effects.
- Floods, heatwaves, strikes and closures end on their own. Use **Day shown** to
  watch the city recover (or not: see the austerity finding in `docs/coupling_map.md`).
- The **summary card** at the top gives the demo in one glance: a headline, four status
  chips (transport, businesses, utilities, budget) and the best response once compared.
- The **timeline** under the city scene shows all 14 days (commute, reserve, which events are
  still running). Click a day to jump to it, or press **Play** to watch the recovery.
  Floodwater and a heat tint appear on the city while those events last.
- Click a **district** in the city scene for its commute, mode split, output and late workers.
- **Copy scenario link** saves the whole scenario in the page address, so a link (or a
  refresh) reopens exactly this city. Unknown values in a link are ignored.
- **Check across 10 cities** (summary card) re-runs the scenario in 10 simulated cities and
  shows each headline number with its range, plus a shaded band on the reserve chart.
- **Policy Impact Ledger** (Impact tab): every simulated resident is counted once as better off, worse off or
  unchanged, with district, income and car-ownership differences, hospital and school access, public spending,
  efficiency and what moved elsewhere. **Add a bus route** (City tab) tests a new route against the same ledger. **Raise capacity** adds places at a hospital or school (costed; a building over 115% full turns people away, so it matters most when another one is out of action).
- **Recommendation, report and experiments** (Respond and City tabs): a recommendation written from the numbers,
  **Test the assumptions** (six model assumptions pushed down and up), **Download report**, **Save experiment**
  and **Undo**.
- **Compare responses** (button, or the panel at the bottom) ranks doing nothing,
  each response alone and every affordable combination, then explains the winner.
  Move the budget slider to see what more money would buy, and press **Apply** to
  put a plan into the live city. The leading options are then re-run in 10 simulated
  cities: the table shows each one's range of harm and in how many cities it beats
  doing nothing, and a line says whether the winner "holds up" or is a close call.

Tests: `npm test` checks that every cause-and-effect link, every response and the
uncertainty ranges work in the right direction (134 checks, including city files, the assumptions table, hospitals and schools, the impact ledger, new routes, the report and the sensitivity test). `npm run test:page` also clicks through the
page in a simulated browser (151 checks; needs `npm install --no-save jsdom`
first). `npm run rehearse` throws 150 surprise scenarios at the model (about 30 seconds) and
`npm run test:browser` drives the real page in Chromium (needs `npm install --no-save playwright`).
`npm run test:audit` checks five screen sizes (desktop to a 320 px phone) in light and dark, all four tabs, with axe-core (WCAG 2 A/AA): no accessibility violations, no sideways scrolling, and Copy scenario link reopens the same scenario (needs `npm install --no-save playwright axe-core`).
Only Chromium has been run. The code uses plain ES5 JavaScript and one modern CSS feature (`color-mix`, Firefox 113+, Safari 16.2+), so current Firefox and Safari should work, but they have not been tested here.
After editing `data/city.json`, run `node scripts/build-data.js` so the
browser copy (`src/city-data.js`) stays in sync.

## How the transport model works (Day 2)

1. **Residents**: 3,000 agents (each stands for 5 people) with a home, a job
   (nearby jobs are more likely) and a car or not.
2. **Mode choice**: each agent picks car, bus or walk with a logit model on
   generalized cost: travel time + wait penalty + money cost (fuel, parking,
   fare) converted to minutes. Low-income residents feel costs more.
3. **Congestion**: car volume raises road travel time (BPR curve). Buses share
   the roads, so traffic slows buses too. Crowded buses add delay.
4. **Feedback**: choices depend on travel times and travel times depend on
   choices, so the model iterates (method of successive averages) until they agree.
5. **Closures**: a closed road disappears from the network. People reroute, switch
   mode, or, if no route exists, are counted as "cannot reach work".

Baseline calibration: about 49% car, 42% bus, 8% walk; bridges 55-75% full.

## How businesses, utilities and the budget connect (Day 3)

Everything below is calculated from the transport result, not typed in
(`src/economy.js`):

1. **Lateness**: workers plan around the usual commute. Minutes beyond that plus a
   5-minute grace are "late" and cost productivity (0.3-0.6% per minute by sector).
2. **Stranded workers**: people with no route can only partly work from home (25% output).
3. **Shopping**: residents choose shops by size and travel time. Each extra minute
   cuts visits by 1.2%; areas that become unreachable lose their share.
4. **Utilities**: power demand (peak hour, heatwave, how many people are at work)
   against supply; water demand against supply (a flood cuts supply 35%). A shortfall
   means blackouts or rationing, which cost each sector revenue in proportion to how
   sensitive it is.
5. **Power back into transport**: blackouts switch off traffic signals and cut road
   capacity, so the grid and the roads are solved together.
6. **Budget**: business tax + income tax + fares, minus bus operations and other
   services. A flood adds a one-off repair bill.
7. **14-day outlook**: if the reserve runs out, the austerity rule cuts bus service
   10% a day, which changes commutes and the economy the next day (switch it off in
   the controls to compare).

**One finding to be aware of:** cutting buses improves the budget and hurts residents.
The page shows both ("Budget balance" and "Travel time cost") so a budget-only view
does not mislead. Details in `docs/coupling_map.md`.

## Events and responses (Day 4)

**Events** (`src/events.js`) edit the scenario and the models play them out. They can
be combined, and each ends after a set number of days (`durationDays` in
`data/city.json`: flood 6, heatwave 4, strike 5, closure 10). A bus cut is a policy,
so it does not end.

**Responses** (`src/responses.js`) change the city; the simulation does the rest:

| Response | Starts at | What it does |
|---|---|---|
| Add buses | 12k | +50% trips on every regular line (running cost follows) |
| Stagger work start times | 2k | a quarter of peak trips move; costs 1% of output |
| Temporary shuttle | 9k | a new bus line on open roads from the worst-hit area to the main job centre |
| Emergency repair crews | 20k | flooded and closed roads reopen in half the time |
| Remote-work order | 3k | 25% of workers stay home: no traffic, 15% less output |
| Power and water conservation | 5k | demand falls 15%: fewer blackouts and less rationing |
| Free bus fares | 3k | fare income goes to zero; mode choice shifts some drivers to buses |
| Retime traffic signals | 6k | +8% capacity on every open road |
| Rent backup generators | 15k | +20% power supply: fewer blackouts, signals stay on |
| Truck in drinking water | 8k | +20% water supply: less rationing |

The last six are defined in `responses.js` because `data/city.json` did not list them;
a response with the same id in the data file takes priority.

**Ranking** uses one scale, *harm* over 14 days against the unchanged city:
output lost + extra travel-time cost for residents + extra bus spending + repair
bills + the response cost. The search tries doing nothing and each response alone,
then grows plans one response at a time: it keeps the best 3 plans, tries adding each
response that helped on its own, and stops when a round finds nothing better. It found
the same winner as trying every combination in every case we checked (a test does this),
in seconds instead of half a minute. Responses that only hurt on their own are never
added, and the page says how many options were skipped.
Response spending comes out of the same reserve as everything else.

## Uncertainty ranges (Day 6)

One run is one possible city: the seed decides which homes, jobs and cars the agents get.
`src/uncertainty.js` repeats a question in 10 cities (the main seed plus 9 fixed others),
each with its own agents and its own "usual commute", and reports the spread.

- **Spread** of a scenario: commute, people with no route, output, reserve on day 14.
- **Option check**: each leading response is compared with doing nothing *in the same
  city*, so the range is about the response, not about which city was drawn.

What it tells you, from the model: the seed moves 14-day harm by 1% (heatwave) to 5%
(bus cut) one standard deviation (18% from lowest to highest city for a bus cut), and a flood's average commute ranges from 21.6 to 25.8
minutes, yet the ranking of responses held up in every event we tried. The ranges cover
*who lives where* only. The rules and every number in `data/city.json` are fixed, so a
wide range is not a confidence interval for the real world.

## Known simplifications

- The average commute leaves out people with no route at all; their share is
  shown separately and feeds the economy through lost productivity.
- Morning peak hour only; one commute per person; capacity is peak-direction.
- Shopping trips use the same travel conditions as the commute.
- Everyone has a job; job capacity per area is not enforced.
- Power and water are city-wide totals; blackouts are shared evenly across areas.
- Responses stay in force for all 14 days (nothing is lifted when the event ends).
- Response spending draws on the operating reserve, so a large spend can trigger the
  austerity rule. Treat "emergency budget" as a cap on spending, not a separate fund.
- Ranges come from 10 cities and cover the agent population only. **Test the assumptions** covers six model assumptions, not all of them.
- Only the leading options are re-run in the other cities, not all of them.

## Repo layout

- `docs/coupling_map.md`: every cause-and-effect link the model must contain
- `data/city.json`: the Lumen Bay city spec and all model assumptions
- `src/sim.js`: the transport engine (runs in browser and Node)
- `src/economy.js`: businesses, utilities, budget and the multi-day outlook
- `src/events.js`: event presets, combinations, random surprises
- `src/responses.js`: the ten responses, the harm ranking and the search
- `src/uncertainty.js`: the same question asked in several simulated cities, and the sensitivity test
- `src/services.js`: hospitals and schools, and who can reach them
- `src/ledger.js`: the Policy Impact Ledger and Equity Lens
- `src/report.js`: the recommendation, the downloadable report and saved experiments
- `src/index.html`, `src/app.js`: the interface
- `src/cityfile.js`: checks a city file before it runs (strict, because files come from outside)
- `src/city-boot.js`, `src/city-ui.js`: choose which city to run, and the City menu
- `src/assumptions.js`: every assumption in plain words, for the Details tab
- `data/examples/port-marlow.json`: a second, smaller example city
- `src/city-data.js`, `src/example-city.js`: generated copies of the city files for the browser
- `scripts/build-data.js`: regenerates those two files
- `scripts/serve.js`: the tiny server behind `npm run dev`
- `tests/scenarios.js`, `tests/economy.js`, `tests/responses.js`, `tests/uncertainty.js`: cause-and-effect regression tests
- `tests/services.js`, `tests/ledger.js`, `tests/routes.js`, `tests/report.js`, `tests/sensitivity.js`: access, ledger, new routes, report and sensitivity
- `tests/cityfile.js`, `tests/assumptions.js`: city-file checking (including hostile files) and the assumptions table
- `tests/page.js`: clicks through the page in a simulated browser
- `tests/rehearsal.js`: 150 surprise scenarios (every event combination, every road closed, random surprises with responses); checks every number is finite and plausible and the search stays fast
- `tests/browser.js`: drives the real page in Chromium with hostile scenario links and rapid, conflicting clicks
- `tests/audit.js`: five screen sizes x light and dark x four tabs with axe-core, plus the copy-link round trip
- `docs/demo.md`: the demo script

## Roadmap

- [x] Day 1: coupling map and city data
- [x] Day 2: transport core (mode choice, congestion, interactive map)
- [x] Day 3: link businesses, utilities and budget
- [x] Day 4: event engine, responses, ranked comparison under a budget
- [x] Day 5: polish the interactive map and controls (summary, timeline, area details, shareable links)
- [x] Day 6: uncertainty ranges (repeat runs with different seeds), four more responses, faster search
- [x] Day 7: rehearsal and stress tests, hostile-link hardening, demo script
- [x] Day 8: hospitals and schools, access within a travel-time limit
- [x] Day 9: Policy Impact Ledger and Equity Lens
- [x] Day 10: add a bus route from the page (What-if Lab)
- [x] Day 11: recommendation assistant, downloadable report, saved experiments, undo
- [x] Day 12: sensitivity analysis (Test the assumptions)
- [x] Day 13: hosting workflow, deck coverage map, updated demo script
- [x] Day 14: raise hospital and school capacity (a full building turns people away)
- [x] Day 15: real-browser audit (five screen sizes, light and dark, axe-core) and the fixes it found
- [x] Day 17: submission note (`docs/submission.md`), demo script verified end to end
- [ ] Not built: an interactive 3D city view (a separate 3D prototype exists but is not connected), the optional Day 16 model-depth items (evening peak, per-district power and water, feeder-route suggestion, fare levers)
