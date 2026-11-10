# Lumen Bay: Coupling Map (Day 1)

The rule for the whole project: every arrow below must exist in code as a real
calculation, not a hard-coded result. If an arrow is missing, the systems are
not coupled.

## The 5 systems

1. **Transport**: roads, bridges, 3 bus lines, congestion
2. **Residents**: 3,000 agents with home, job, shopping habits, mode choice
3. **Businesses**: jobs, customers, productivity, revenue
4. **Utilities**: power and water demand vs capacity
5. **Budget**: tax income vs bus operating cost, repairs, services

## Main causal chain (the one to demo)

```
Bus frequency cut
  -> longer waits, bus gets less attractive
  -> some residents switch bus -> car              [mode choice]
  -> more cars on roads/bridges
  -> congestion up, travel time up                 [BPR volume/capacity curve]
  -> workers arrive late                           [lateness]
  -> business productivity down                    [revenue hit]
  -> fewer shop visits (people avoid long trips)   [footfall]
  -> business revenue down
  -> tax revenue down                              [budget]
  -> less money for bus service / road repair
  -> (feedback) service stays poor or worsens
```

## Feedback loops (the "interesting" part judges look for)

| Loop | Type | Description | Status |
|---|---|---|---|
| Bus death spiral | Reinforcing | fewer buses -> fewer riders -> less fare income -> fewer buses | Built (austerity rule), but the model shows it is **not** a spiral: see finding below |
| Congestion loop | Balancing | congestion -> longer car trips -> some people switch to bus/walk -> congestion eases | Built (Day 2) |
| Revenue-budget loop | Reinforcing | congestion -> lower revenue -> lower budget -> poorer roads/service -> more congestion | Built (Day 3, 14-day outlook) |
| Heat-power loop | Reinforcing | heatwave -> power strain -> blackouts -> businesses lose hours; signals fail -> road capacity falls -> congestion | Built (Day 3) |

### Finding from the model: austerity helps the budget but hurts the city

Day 1 predicted a "bus death spiral". With the Day 3 numbers it does not happen.
Cutting buses saves far more than the tax and fares it loses:

| Heatwave, 14 days | Austerity rule ON | Austerity rule OFF |
|---|---|---|
| Reserve on day 14 | about -70k | about -134k |
| Commute on day 14 | about 27 min | about 19 min |
| Business output on day 14 | about 984k/day | about 1,021k/day |

So the budget improves while commutes lengthen by 8 minutes and output falls 3.6%.
The cost lands on residents (the "Travel time cost" metric), not on the city's books,
which is why a budget-only view makes bus cuts look attractive. The fares loop is
real but small (fares are about 8% of income).

## What each day built

- Day 2: transport links (mode choice, congestion, closures, bus crowding).
- Day 3: lateness and stranded workers -> productivity; shop trips -> visits;
  power and water -> revenue; power -> traffic signals -> roads; revenue -> tax -> budget;
  deficit -> austerity -> bus service -> transport (multi-day).
- Day 4: events end on their own (flood, heatwave, strike, closure) and can be combined;
  six responses each change a different link (extra buses -> service, stagger -> peak
  demand, shuttle -> new bus line, repair crews -> road reopening, remote work -> commuters,
  conservation -> power and water demand); response spending -> reserve -> austerity.
- Day 5: nothing new is coupled; the page now shows the chain over time (14-day timeline,
  weather on the map, per-area detail, a summary card, shareable scenario links).
- Day 6: the same questions asked in 10 simulated cities (ranges, ranking confidence); four more
  responses on links not yet used (fares, road capacity, power supply, water supply).
- Day 7: rehearsed 150 surprise scenarios and hostile links; demo script in `docs/demo.md`.

### Findings from the Day 4 comparisons

1. **Match the response to the problem.** A heatwave is only helped by the conservation
   drive (it cuts harm by about 740k over 14 days); every other response just adds its
   cost. Bridge closures are best served by the shuttle and remote work, floods by repair
   crews plus remote work, strikes by remote work plus extra buses.
2. **Remote work is not a free lunch.** In a calm city it is a wash (-1k a day net: the 15%
   output loss cancels the travel time saved). It pays when workers are cut off or roads
   are jammed: +23k a day net in a bridge closure, +89k in a flood.
3. **The austerity rule roughly doubles the harm of a bridge closure** (about 1,288k with
   it, 751k without), because the bus cuts cost residents far more than they save the city.
4. **Spending can trigger cuts.** A 5k conservation drive that does nothing for a bridge
   closure shows 66k of harm with the austerity rule on, because the spend empties the
   reserve a day sooner and bus cuts start sooner (with the rule off it costs exactly 5k).
   The page flags this when it happens.

### Findings from Day 6 (measured, 14 days, harm = lost output + travel time + bus spend + repairs + response cost)

5. **Backup generators are the best heatwave fix** (cut harm by about 813k with the austerity
   rule on, 706k off). They change nothing in a bridge closure except adding their 15k price.
   Water tankers do the same job for a flood (about 268k saved) and nothing elsewhere.
6. **Free fares are a trap while the austerity rule is on.** Riders do shift to buses, but the
   fare income goes, the reserve empties sooner and the rule cuts bus service: +1,110k of
   harm in a 30% bus cut and +762k in a heatwave, against +76k and +68k with the rule off.
   A budget-to-transport feedback loop turns a kind-looking policy into a harmful one.
7. **Retimed signals help only when roads are the bottleneck** (about 95k saved in a flood,
   52k in a bridge closure with the rule off) and are roughly a wash otherwise.
8. **The ranking is more stable than the numbers.** Across 10 simulated cities, harm varies by
   1% to 5% (one standard deviation) and 18% from lowest to highest for a bus cut, but the
   winning plan for a bridge closure was best in all 10.

## Cross-system links (full list)

| From | To | How it is calculated |
|---|---|---|
| Bus headway | Residents | wait time = headway / 2, feeds mode-choice cost |
| Residents' mode choice | Transport | car volume per road edge = sum of agents routed through it |
| Road volume | Transport | travel time = freeflow * (1 + 0.15 * (volume/capacity)^4) |
| Travel time | Residents | commute duration, lateness = max(0, commute - tolerance) |
| Lateness | Businesses | productivity = 1 - k * average lateness |
| Travel time to shops | Residents | shop-visit probability drops as trip time grows |
| Shop visits + productivity | Businesses | daily revenue |
| Business revenue | Budget | business tax = rate * revenue |
| Employed residents | Budget | income tax per working resident |
| Budget | Transport | bus fleet and hours affordable (the austerity rule). *Repair funds are not built:* a flood leaves a one-off repair bill, but spending on roads does not change road condition |
| Residents + businesses | Utilities | power demand worked out per neighbourhood (it follows who is at work); water demand city-wide. *Supply is one city-wide total, not a network*, so blackouts and rationing are shared evenly |
| Utility shortfall | Businesses | operating hours lost, revenue lost |
| Flood event | Transport | flood-prone edges closed or capacity cut |
| Flood event | Utilities | water treatment capacity reduced |
| Heatwave event | Utilities, Residents | demand up, walking less attractive |

## Events (judge-surprise buttons)

1. Bus frequency cut (by X%)
2. Bridge closure (pick any bridge)
3. Flood (closes flood-prone roads, hits water supply)
4. Heatwave (power demand up, walking down)
5. Transit strike (bus service drops to near zero)

## Responses to compare (for each event)

- Reroute / add buses on the surviving corridor
- Stagger work start times (spreads the peak)
- Temporary shuttle or park-and-ride
- Emergency spending from reserve
- Do nothing (baseline for comparison)

## Metrics to show for every run

- Average commute time (minutes) and worst neighbourhood
- Share of trips by mode (car / bus / walk)
- Congestion index (average volume/capacity on busiest edges)
- Business revenue per day
- Budget balance per day
- Power and water load as % of capacity
- Equity: gap between best-off and worst-off neighbourhood commute

## Honesty rules

- Run each scenario 10+ times with random seeds and show ranges. (Done on Day 6: 10 cities.)
- Keep every assumption in one visible table. (Done: Details tab > Assumptions, built from the same settings the model runs with, with built-in defaults marked. A test fails if any setting is missing from it.)
