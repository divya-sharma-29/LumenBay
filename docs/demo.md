# Demo script (about 5 minutes)

Every number below was produced by the model with the default settings (`node tests/rehearsal.js`
and the page itself reproduce them). If your numbers differ by a few percent, someone changed
`data/city.json`; the story still holds.

## Before you start

- Open `src/index.html` by double-click (or `npm run dev`). No server, no install. Chrome, Edge or Firefox (only Chromium has been tested; see the README).
- Press **Reset city**. Use a full-screen window; the map and the summary card should both be visible.
- The page has four tabs: **City** (the map and the buttons to change things), **Impact** (why it happened, key numbers, budget),
  **Respond** (compare fixes) and **Details** (full tables). The summary card at the top stays visible on every tab.
- Know where these are: the road **Crown Bridge** on the map, **Surprise me**, **Play** (all on City), the **Policy Impact Ledger** (Impact tab), **Add a bus route** and **Save experiment** (City), **Test the assumptions** (Respond).

## The pitch (20 seconds)

> "Lumen Bay is a city that doesn't exist: 15,000 residents, 8 neighbourhoods, 11 roads, 3 bus lines,
> power, water and a public budget. Nothing on screen is typed in. Change one thing and
> every other part moves, because the systems feed each other."

## The walkthrough

**1. The normal city (20 s).** Point at the summary card: commute 19.3 min, output about 1,212k a day,
power 90% of supply. "This is the reference. Every change is measured against it."

**2. The judge's surprise: close Crown Bridge (60 s).** Click the bridge on the map.

| What moves | Normal | Bridge closed |
|---|---|---|
| Fullest road | 81% (Hillcrest Ave) | **142% (Kings Bridge)** |
| People who cannot reach work | 0% | **6.5%** |
| Workers arriving late | 0% | **20.6%** |
| Business output | 1,212k/day | **1,132k/day (-6.6%)** |
| Budget balance | +4k/day | **-11k/day** |

Say: "One closed road. Traffic reroutes onto the other bridge, workers are late or stranded,
offices and shops lose output, tax income falls, and the budget goes negative."

**3. Why it happened (30 s).** Open the **Impact** tab. **Why did this happen?** is the first card. Each line is calculated from the
line before. Do not read it all; read the first and last.

**4. The feedback loop (45 s).** Back on the **City** tab, press **Play** under the map, or drag **Day shown**. Point at the
reserve on the timeline going negative around day 3, and the orange text: the austerity rule then
cuts bus service (to 40% at its worst) and the commute climbs from about 19.7 to **26.9 min**.
Say: "The budget reaches back into transport. That loop is what makes it a system, not charts."
Tick off the austerity checkbox to show the difference if the city refuses to cut.

**5. What should the city do? (75 s).** Press **Compare responses** (it opens the **Respond** tab). A progress bar runs for a few seconds (about 8 for a bridge closure in Chrome, the first time).

- Doing nothing: **1,288k** of harm over 14 days.
- Best affordable plan: **Temporary shuttle + Remote-work order + Add buses**, 24k to start, **204k** of harm.
- Drag the **Emergency budget** slider to 10k: the best plan becomes the shuttle alone (392k). "That's
  what the extra money buys."
- Read the green line: the winner "came out best in all 10 simulated cities", with harm between
  164k and 207k. Do-nothing ranges from 1,214k to 1,341k.
- Press **Apply** and watch the orange shuttle line appear on the map and the numbers recover.

**5b. Who gains, who loses (45 s).** Open the **Impact** tab and read the **Policy Impact Ledger** (with the bridge closed and nothing applied).
Of 15,000 residents, **965 better off, 4,970 worse off, 9,065 unchanged**, counted once each. Northfield, Hillcrest and Tech Park are
flagged. Hospital access falls from **87% to 68%**. Say: "A dashboard shows the closed bridge. This shows who it hurts, and where."
With the best plan applied, switch the ledger to **Response compared with doing nothing**: **7,420 better off, 0 worse off**, for 138k of public spending
(about 538 residents helped per 10,000 spent).

**5c. Test a new route (30 s).** Back on the **City** tab, **Add a bus route** from Harbor to Tech Park with no event: **1,715 residents better off, nobody worse off**,
for 48k over 14 days (8k to set up). Say: "The planner tests a feeder route against the same ledger."

**5d. Ask the assistant, then stress the advice (45 s).** On **Respond**, read the green **Recommendation**: it names the plan, the saving, who gains,
and whether a cheaper plan gets most of the benefit. Press **Test the assumptions** (about 7 seconds): six assumptions pushed down and up. The plan beats doing nothing in
**all 12 variations**; it is replaced in one (if the value of travel time is 30% lower, a different plan wins). Say: "We report where our advice depends on a guess."
Press **Download report** for a printable page with the scenario, ledger, comparison, sensitivity and every assumption; **Save experiment** keeps it, **Undo** steps back.

**6. Be honest about uncertainty (20 s).** Press **Check across 10 cities**. "Each city has different
homes, jobs and cars, same rules. The exact numbers move by a few percent. The ranking of
responses does not."

**7. Hand it to the judges (60 s).** Press **Reset city**, then **Surprise me** (one or two random events), or let
them drag a bus slider or tick any road in the table. Repeat steps 3 and 5. Press **Copy scenario
link** to save the exact scenario.

## Backup stories (pick one if there is time)

- **"Cutting buses saves money" (the trap).** Press **Cut bus service 30%**. The budget *improves*
  (from +4k to +8k a day) while commutes lengthen by about 2 minutes and travel time cost rises 14k a day.
  Say: "A budget-only view says do it. The page shows both sides."
- **Heatwave.** Power demand hits 122% of supply, so blackouts begin; signals fail, road capacity
  falls, output drops to about 1,021k. Compare responses: the winner pairs the **conservation drive** with
  **backup generators** and takes the harm from 863k to about zero (generators alone cut about 813k);
  every transport response just adds its own cost.
- **Flood.** Four roads go under water, 31% of people cannot reach work, output falls to 813k, water is
  rationed (123% of supply). The best plans combine repair crews, remote work and extra buses.
- **A hospital goes out of action (and capacity).** On **City**, under **Hospitals and schools**, pick Bay General Hospital and press
  **Take out of action**. Hospital access falls from **87% to 17.7%**; Harbor Health Centre is suddenly **257% loaded** and turns away
  **55%** of the people sent to it. Now pick Harbor Health Centre, choose **+100% places** and press **Raise capacity**: access rises to
  **35.4%** for 15k (+50% gives 26.6% for 8k). Say: "Closing one building overloads the next one. More capacity helps, but it does not
  replace the lost hospital, so the planner sees where the real weak point is."
- **Free fares.** Looks generous, but the lost fare income empties the reserve and triggers bus cuts:
  in a 30% bus cut it adds about 1,110k of harm with the austerity rule on, about 76k with it off.

## Likely questions

**"Is this just charts?"** Open `docs/coupling_map.md`. Every arrow is a calculation, and tests check each
direction: bus headway to mode choice, volumes to travel time, lateness to productivity, revenue to tax
to budget to bus service, power shortfall to traffic signals to road capacity.

**"Where do the numbers come from?"** The city is fictional, so every assumption is in one place: the
**Assumptions** table at the bottom of the Details tab (and in `data/city.json`). The model is calibrated to a plausible baseline (about 49% car,
42% bus, 8% walk). We do not claim they match a real city.

**"How do we know it's not overfitted to your demo?"** `node tests/rehearsal.js` runs 150 scenarios (every
event combination, every road closed, every pair of bridges, 60 random surprises with random responses)
and checks every number is finite and plausible. `node tests/browser.js` throws hostile links and rapid clicks at
the real page.

**"What can't it do?"** Morning peak only; everyone has a job; power and water are city-wide totals;
responses stay on for 14 days. The ranges cover who lives where, not uncertainty in the rules. All of it is
listed under "Known simplifications" in the README.

**"What if we change something not on your buttons?"** Any bus line can be set from 0 to 150%, any road can be
closed, events combine, and any response combination up to the budget is searched. A brand-new event type
means adding a few lines in `src/events.js`.

## If something goes wrong

- Page looks stuck: reload. A scenario you copied with **Copy scenario link** reopens exactly.
- A comparison seems slow: it is working (progress bar). The worst case, flood plus heatwave,
  takes about 11 seconds in Chrome including the 10-city check.
- No sound or network needed at any point.
