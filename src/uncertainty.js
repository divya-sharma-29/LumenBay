/*
 * Lumen Bay uncertainty ranges (Day 6)
 *
 * One run of the city is one possible city: the seed decides which homes, jobs
 * and cars the 3,000 agents get. Different seeds give different cities that obey
 * the same rules. This module repeats a question over several of them and reports
 * the spread, so a number is never shown as more certain than it is:
 *
 *   spread()        how much do the headline numbers of one scenario move?
 *   sampleOptions() does the ranking of responses hold up in every city?
 *
 * Both are steppers (call step() until it returns true, then result()) so a page
 * can show progress and stay responsive. Cities are built once and reused.
 *
 * Works in the browser (window.Uncertainty) and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'), require('./economy.js'), require('./responses.js'), require('./ledger.js'));
  else root.Uncertainty = factory(root.Sim, root.Economy, root.Responses, root.Ledger);
})(typeof self !== 'undefined' ? self : this, function (Sim, Economy, Responses, Ledger) {
  'use strict';

  var DEFAULT_RUNS = 10;
  var SEED_STEP = 101;   // seeds are the base seed plus multiples of this, so they are always the same ones
  var cache = typeof WeakMap === 'function' ? new WeakMap() : null;

  function seedList(cfg, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(cfg.seed + i * SEED_STEP);
    return out;
  }

  /** A possible Lumen Bay: its own agents and its own "usual commute". The first one is the main city. */
  function world(data, cfg, seed) {
    var bySeed = cache && cache.get(data);
    if (cache && !bySeed) { bySeed = {}; cache.set(data, bySeed); }
    if (bySeed && bySeed[seed]) return bySeed[seed];
    var c = Object.assign({}, cfg, { seed: seed });
    var agents = Sim.generateAgents(data, c);
    var w = { seed: seed, cfg: c, agents: agents, normal: Economy.normalCity(data, agents, c) };
    if (bySeed) bySeed[seed] = w;
    return w;
  }

  function stats(values) {
    var n = values.length, sum = 0, i;
    for (i = 0; i < n; i++) sum += values[i];
    var mean = n ? sum / n : 0, v = 0;
    for (i = 0; i < n; i++) v += (values[i] - mean) * (values[i] - mean);
    return {
      mean: mean, min: n ? Math.min.apply(null, values) : 0, max: n ? Math.max.apply(null, values) : 0,
      sd: n ? Math.sqrt(v / n) : 0, values: values.slice()
    };
  }

  /**
   * Run one scenario (responses included) in n cities.
   * result(): { n, seeds, metrics: { commute, none, output, peakCommute, harm, finalReserve, worse, better },
   *             reserve: { min: [14], max: [14], mean: [14] } }
   */
  function spread(data, scenario, cfg, n, projOpts) {
    n = n || DEFAULT_RUNS;
    var seeds = seedList(cfg, n), done = 0;
    var acc = { commute: [], none: [], output: [], peakCommute: [], harm: [], finalReserve: [], worse: [], better: [] }, perDay = [];
    return {
      step: function () {
        if (done >= n) return true;
        var w = world(data, cfg, seeds[done]);
        var applied = Responses.apply(data, w.agents, scenario, scenario.responses || [], w.normal, w.cfg);
        var day1 = Economy.runCity(data, w.agents, Economy.effective(data, applied, 1, 1), w.normal, w.cfg);
        var proj = Economy.projectDays(data, w.agents, JSON.parse(JSON.stringify(applied)), w.normal, w.cfg, 14, projOpts);
        acc.commute.push(day1.summary.commute);
        acc.none.push(day1.summary.shares.none * 100);
        acc.output.push(day1.econ.totals.revenue);
        acc.peakCommute.push(proj.summary.peakCommute);
        acc.harm.push(proj.harm.total);
        acc.finalReserve.push(proj.finalReserve);
        // Who is better and worse off than in this city's own unchanged self (the Policy Impact Ledger).
        var led = Ledger.compare(data, w.agents, day1, Economy.refCity(data, w.agents, w.normal, w.cfg));
        acc.worse.push(led.worse); acc.better.push(led.better);
        perDay.push(proj.days.map(function (d) { return d.reserve; }));
        done++;
        return done >= n;
      },
      progress: function () { return { done: done, planned: n }; },
      result: function () {
        var metrics = {};
        Object.keys(acc).forEach(function (k) { metrics[k] = stats(acc[k]); });
        var days = perDay.length ? perDay[0].length : 0, band = { min: [], max: [], mean: [] };
        for (var d = 0; d < days; d++) {
          var col = perDay.map(function (r) { return r[d]; }), st = stats(col);
          band.min.push(st.min); band.max.push(st.max); band.mean.push(st.mean);
        }
        return { n: done, seeds: seeds.slice(0, done), metrics: metrics, reserve: band };
      }
    };
  }

  /**
   * Re-run chosen options (lists of response ids, [] = do nothing) in n cities and
   * compare them inside each city, so each option is measured against the same
   * city's own do-nothing.
   * result(): { n, options: [{ ids, name, oneOff, harm: stats, vsNothing: stats,
   *             wins, beatsNothing }], leader, clear, note }
   */
  function sampleOptions(data, event, optionIds, cfg, n, projOpts) {
    n = n || DEFAULT_RUNS;
    var lists = optionIds.map(function (x) { return x.slice(); });
    if (!lists.some(function (x) { return !x.length; })) lists.unshift([]);
    var seeds = seedList(cfg, n), total = n * lists.length, done = 0;
    var harm = lists.map(function () { return []; }), eventCities = {};
    return {
      step: function () {
        if (done >= total) return true;
        var si = Math.floor(done / lists.length), oi = done % lists.length;
        var w = world(data, cfg, seeds[si]);
        // The same city's own reference city is evaluated once and shared by every option.
        var eventCity = eventCities[si] || (eventCities[si] = Economy.runCity(data, w.agents, Economy.effective(data, event, 1, 1), w.normal, w.cfg));
        var row = Responses.evaluate(data, w.agents, event, lists[oi], w.normal, w.cfg, eventCity, projOpts);
        harm[oi].push(row.harm.total);
        done++;
        return done >= total;
      },
      progress: function () { return { done: done, planned: total }; },
      result: function () {
        var cities = harm[0].length;
        var ni = lists.findIndex(function (x) { return !x.length; });
        var wins = lists.map(function () { return 0; });
        for (var c = 0; c < cities; c++) {
          var best = -1, bestH = Infinity;
          for (var o = 0; o < lists.length; o++) {
            if (harm[o].length > c && harm[o][c] < bestH - 1e-9) { bestH = harm[o][c]; best = o; }
          }
          if (best >= 0) wins[best]++;
        }
        var options = lists.map(function (ids, o) {
          var vs = harm[o].map(function (h, c) { return h - harm[ni][c]; });
          return {
            ids: ids, name: Responses.label(data, ids), oneOff: Responses.costOf(data, ids),
            harm: stats(harm[o]), vsNothing: stats(vs), wins: wins[o],
            beatsNothing: vs.filter(function (v) { return v < -1e-9; }).length
          };
        });
        var order = options.slice().sort(function (a, b) { return b.wins - a.wins || a.harm.mean - b.harm.mean; });
        var leader = order[0];
        return {
          n: cities, options: options, leader: leader,
          clear: cities > 0 && leader.wins / cities >= 0.75,
          note: cities ? (leader.wins === cities ? 'best in all ' + cities + ' simulated cities' :
            'best in ' + leader.wins + ' of ' + cities + ' simulated cities') : ''
        };
      }
    };
  }

  // ------------------------------------------------------------ sensitivity

  // Rules of the model that are really estimates. Each is pushed down and up; the question is whether
  // the answer (and above all which response wins) changes. Every factor edits a copy of the city data.
  var FACTORS = [
    { id: 'demand', label: 'Rush-hour demand', low: 0.9, high: 1.1, what: 'share of trips made in the peak hour, 10% lower / higher',
      apply: function (d, m) { d.assumptions = d.assumptions || {}; d.assumptions.peakHourShare = Sim.config(d).peakHourShare * m; } },
    { id: 'roadcap', label: 'Road capacity', low: 0.85, high: 1.15, what: 'every road 15% smaller / larger',
      apply: function (d, m) { d.roads.forEach(function (r) { r.capacity = r.capacity * m; }); } },
    { id: 'buscap', label: 'Bus capacity', low: 0.85, high: 1.15, what: 'seats and standing room per bus 15% lower / higher',
      apply: function (d, m) { d.busLines.forEach(function (l) { l.capacityPerBus = l.capacityPerBus * m; }); } },
    { id: 'votime', label: 'Value of time', low: 0.7, high: 1.3, what: 'what a minute of travel is worth, 30% lower / higher',
      apply: function (d, m) { d.assumptions = d.assumptions || {}; d.assumptions.valueOfTimeCreditsPerMin = Sim.config(d).valueOfTimeCreditsPerMin * m; } },
    { id: 'choice', label: 'How readily people switch mode', low: 0.7, high: 1.3, what: 'the spread of the travel-mode choice rule, 30% lower / higher',
      apply: function (d, m) { d.assumptions = d.assumptions || {}; d.assumptions.logitScaleMin = Sim.config(d).logitScaleMin * m; } },
    { id: 'cars', label: 'Car ownership', low: 0.9, high: 1.1, what: 'share of residents with a car, 10% lower / higher',
      apply: function (d, m) { d.neighbourhoods.forEach(function (n) { n.carOwnership = Math.max(0, Math.min(1, n.carOwnership * m)); }); } }
  ];

  /**
   * Re-run the event and some options (lists of response ids, [] = do nothing) in a base city plus a low and a high
   * version of each uncertain rule, and report whether the best option changes.
   * result(): { variations: [{ id, label, what, setting: 'low'|'high', mult, harms: [..per option], winner }],
   *             options: [{ ids, name }], base: { harms, winner }, stable, flips, swing }
   */
  function sensitivity(data, event, optionIds, cfg, projOpts, factors) {
    factors = factors || FACTORS;
    var lists = optionIds.map(function (x) { return x.slice(); });
    if (!lists.some(function (x) { return !x.length; })) lists.unshift([]);
    var jobs = [{ id: 'base', label: 'Base city', what: 'the rules as given', setting: 'base', mult: 1, f: null }];
    factors.forEach(function (f) {
      jobs.push({ id: f.id, label: f.label, what: f.what, setting: 'low', mult: f.low, f: f });
      jobs.push({ id: f.id, label: f.label, what: f.what, setting: 'high', mult: f.high, f: f });
    });
    var done = 0, out = [];
    function harmsIn(d, c, w) {
      var eventCity = Economy.runCity(d, w.agents, Economy.effective(d, event, 1, 1), w.normal, w.cfg);
      return lists.map(function (ids) { return Responses.evaluate(d, w.agents, event, ids, w.normal, w.cfg, eventCity, projOpts).harm.total; });
    }
    function winnerOf(harms) {
      var b = 0;
      harms.forEach(function (h, i) { if (h < harms[b] - 1e-9) b = i; });
      return b;
    }
    return {
      step: function () {
        if (done >= jobs.length) return true;
        var j = jobs[done], d = data, c = cfg, w;
        if (j.f) {
          d = JSON.parse(JSON.stringify(data));
          j.f.apply(d, j.mult);
          c = Sim.config(d);
          c.seed = cfg.seed;
          var agents = Sim.generateAgents(d, c);
          w = { agents: agents, cfg: c, normal: Economy.normalCity(d, agents, c) };
        } else w = world(data, cfg, cfg.seed);
        var harms = harmsIn(d, c, w);
        out.push({ id: j.id, label: j.label, what: j.what, setting: j.setting, mult: j.mult, harms: harms, winner: winnerOf(harms) });
        done++;
        return done >= jobs.length;
      },
      progress: function () { return { done: done, planned: jobs.length }; },
      result: function () {
        var options = lists.map(function (ids) { return { ids: ids, name: Responses.label(data, ids), oneOff: Responses.costOf(data, ids) }; });
        var base = out[0] || null, vars = out.slice(1);
        var ni = lists.findIndex(function (x) { return !x.length; });
        var flips = base ? vars.filter(function (v) { return v.winner !== base.winner; }) : [];
        var swing = null;
        if (base) vars.forEach(function (v) {
          var ch = Math.abs(v.harms[base.winner] - base.harms[base.winner]);
          if (!swing || ch > swing.change) swing = { label: v.label, setting: v.setting, change: ch };
        });
        var leaderHarms = base ? vars.map(function (v) { return v.harms[base.winner]; }).concat([base.harms[base.winner]]) : [];
        return {
          options: options, base: base, variations: vars, nothingIndex: ni, flips: flips, swing: swing,
          stable: !!base && flips.length === 0,
          leaderRange: leaderHarms.length ? { min: Math.min.apply(null, leaderHarms), max: Math.max.apply(null, leaderHarms) } : null,
          beatsNothingAlways: !!base && ni >= 0 && base.winner !== ni && vars.every(function (v) { return v.harms[base.winner] < v.harms[ni] - 1e-9; })
        };
      }
    };
  }

  /** Run a stepper to the end in one call (tests, scripts). */
  function finish(stepper) {
    while (!stepper.step()) { /* keep going */ }
    return stepper.result();
  }

  return { DEFAULT_RUNS: DEFAULT_RUNS, seedList: seedList, world: world, stats: stats, spread: spread, sampleOptions: sampleOptions, sensitivity: sensitivity, FACTORS: FACTORS, finish: finish };
});
