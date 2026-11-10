/*
 * Lumen Bay responses and comparison (Day 4)
 *
 * A response is not a bonus added to the results. It changes the city and the
 * simulation does the rest:
 *   add_buses       -> more trips on every regular line   (bus cost follows)
 *   stagger_hours   -> fewer trips in the peak hour       (small output cost)
 *   shuttle         -> a new bus line on open roads       (carries real riders)
 *   emergency_fund  -> flooded / closed roads reopen sooner
 *   remote_work     -> a share of workers stay home (no traffic, some output lost)
 *   conservation    -> power and water demand fall (fewer blackouts / less rationing)
 *   free_fares      -> buses cost nothing: mode choice shifts, the budget loses fares
 *   signal_timing   -> road capacity up a little everywhere
 *   backup_power    -> power supply up (fewer blackouts, signals stay on)
 *   water_tankers   -> water supply up (less rationing)
 *
 * Options are ranked on one scale, "harm", measured against the unchanged city
 * over the outlook period:
 *   harm = output lost + extra travel-time cost + extra bus spending
 *          + repair bills + the cost of the response
 *
 * Works in the browser (window.Responses) and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'), require('./economy.js'), require('./events.js'), require('./services.js'));
  else root.Responses = factory(root.Sim, root.Economy, root.Events, root.Services);
})(typeof self !== 'undefined' ? self : this, function (Sim, Economy, Events, Services) {
  'use strict';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Two responses that data/city.json does not define yet. They are used only
  // when the city data has no response with the same id, so moving them into
  // the data file later changes nothing.
  var EXTRA = [
    { id: 'remote_work', name: 'Remote-work order', oneOff: 3000,
      effect: { remoteShare: 0.25, remoteProductivity: 0.85 },
      how: 'A quarter of workers stay home. They add no traffic but produce 15% less.' },
    { id: 'conservation', name: 'Power and water conservation drive', oneOff: 5000,
      effect: { powerDemandMult: 0.85, waterDemandMult: 0.85 },
      how: 'Peak-shaving deals with big users and public appeals cut power and water demand by 15%.' },
    { id: 'free_fares', name: 'Free bus fares', oneOff: 3000,
      effect: { fareMult: 0 },
      how: 'Buses cost nothing to ride, so some drivers switch. The city gives up its fare income, which the budget (and the austerity rule) feels.' },
    { id: 'signal_timing', name: 'Retime traffic signals', oneOff: 6000,
      effect: { capacityBoost: 1.08 },
      how: 'Retimed signals and enforced bus lanes raise capacity on every open road by 8%.' },
    { id: 'backup_power', name: 'Rent backup generators', oneOff: 15000,
      effect: { powerSupplyMult: 1.2 },
      how: 'Rented generators add 20% to power supply: fewer blackouts, and traffic signals stay on.' },
    { id: 'water_tankers', name: 'Truck in drinking water', oneOff: 8000,
      effect: { waterSupplyMult: 1.2 },
      how: 'Tankers and temporary pumps add 20% to water supply, so less rationing.' }
  ];

  /** The responses on offer: the city file's, plus any extra ones it lacks. */
  function list(data) {
    var have = {};
    (data.responses || []).forEach(function (r) { have[r.id] = true; });
    return (data.responses || []).filter(function (r) { return r.effect; })
      .concat(EXTRA.filter(function (r) { return !have[r.id]; }));
  }

  // How long each kind of event lasts, from the city data (owned by events.js).
  function defaultDurations(data) { return Events.defaultDurations(data); }

  function responseById(data, id) {
    return list(data).filter(function (r) { return r.id === id; })[0];
  }

  function label(data, ids) {
    if (!ids.length) return 'Do nothing';
    return ids.map(function (id) { return responseById(data, id).name; }).join(' + ');
  }

  // ---------------------------------------------------------------- shuttle

  /**
   * Choose a route for the temporary shuttle: from the area that the event hurt
   * most (among those still connected by road) to the biggest job centre,
   * along the quickest open roads.
   */
  function resolveShuttle(data, eventCity, normal, spec) {
    var nodes = data.neighbourhoods;
    var idx = {};
    nodes.forEach(function (n, i) { idx[n.id] = i; });
    var hub = 0;
    nodes.forEach(function (n, i) { if (n.jobs > nodes[hub].jobs) hub = i; });

    var open = eventCity.edges.filter(function (e) { return !e.closed; });
    var adj = nodes.map(function () { return []; });
    open.forEach(function (e) {
      adj[idx[e.from]].push({ to: idx[e.to], w: e.ff });
      adj[idx[e.to]].push({ to: idx[e.from], w: e.ff });
    });
    // shortest paths from the hub over open roads
    var dist = nodes.map(function () { return Infinity; }), prev = nodes.map(function () { return -1; });
    var done = nodes.map(function () { return false; });
    dist[hub] = 0;
    for (;;) {
      var u = -1, best = Infinity;
      for (var i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = true;
      adj[u].forEach(function (nb) {
        if (dist[u] + nb.w < dist[nb.to]) { dist[nb.to] = dist[u] + nb.w; prev[nb.to] = u; }
      });
    }

    var base = {};
    normal.byNbhd.forEach(function (n) { base[n.id] = n; });
    var pick = -1, score = 0;
    eventCity.byNbhd.forEach(function (n, i) {
      if (i === hub || !isFinite(dist[i])) return;
      var worse = Math.max(0, n.commute - base[n.id].commute) + 40 * n.shares.none;
      var s = nodes[i].agents * worse;
      if (s > score) { score = s; pick = i; }
    });
    if (pick < 0) return null;

    var stops = [], v = pick;
    while (v >= 0) { stops.push(nodes[v].id); v = prev[v]; }
    return {
      id: 'S1', name: 'Shuttle (' + nodes[pick].name + ' to ' + nodes[hub].name + ')',
      stops: stops, headwayMin: spec.headwayMin, buses: spec.buses,
      capacityPerBus: spec.capacityPerBus, fare: spec.fare
    };
  }

  // ------------------------------------------------------------- new route

  // A bus route the planner adds (a policy, not an emergency response): same kind of bus as the
  // regular lines, set up once, then paid for every day through the normal bus operating cost.
  var NEW_ROUTE = { headwayMin: 10, buses: 4, capacityPerBus: 70, setup: 8000 };

  /** Quickest open-road path between two neighbourhoods, as a list of neighbourhood ids (null if cut off). */
  function pathBetween(data, city, fromId, toId) {
    var nodes = data.neighbourhoods, idx = {};
    nodes.forEach(function (n, i) { idx[n.id] = i; });
    if (idx[fromId] == null || idx[toId] == null || fromId === toId) return null;
    var adj = nodes.map(function () { return []; });
    city.edges.filter(function (e) { return !e.closed; }).forEach(function (e) {
      adj[idx[e.from]].push({ to: idx[e.to], w: e.ff });
      adj[idx[e.to]].push({ to: idx[e.from], w: e.ff });
    });
    var dist = nodes.map(function () { return Infinity; }), prev = nodes.map(function () { return -1; }), done = nodes.map(function () { return false; });
    dist[idx[fromId]] = 0;
    for (;;) {
      var u = -1, best = Infinity;
      for (var i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = true;
      adj[u].forEach(function (nb) { if (dist[u] + nb.w < dist[nb.to]) { dist[nb.to] = dist[u] + nb.w; prev[nb.to] = u; } });
    }
    if (!isFinite(dist[idx[toId]])) return null;
    var stops = [], v = idx[toId];
    while (v >= 0) { stops.unshift(nodes[v].id); v = prev[v]; }
    return stops;
  }

  function buildNewRoute(data, city, r, k) {
    var stops = pathBetween(data, city, r.from, r.to);
    if (!stops) return null;
    var name = {};
    data.neighbourhoods.forEach(function (n) { name[n.id] = n.name; });
    var fares = data.busLines.map(function (l) { return l.fare; });
    var fare = fares.length ? fares.reduce(function (a, b) { return a + b; }, 0) / fares.length : 1;
    return { id: 'N' + (k + 1), name: 'New route (' + name[r.from] + ' to ' + name[r.to] + ')', stops: stops,
      headwayMin: NEW_ROUTE.headwayMin, buses: NEW_ROUTE.buses, capacityPerBus: NEW_ROUTE.capacityPerBus, fare: fare };
  }

  // ------------------------------------------------------------------ apply

  /**
   * Return a copy of the event scenario with the chosen responses built in.
   * `eventCity` (the event with no response, day 1) is only needed for the
   * shuttle; it is computed here if not supplied.
   */
  function apply(data, agents, scenario, ids, normal, cfg, eventCity) {
    var s = clone(scenario);
    s.responses = ids.slice();
    s.responseOneOff = 0;
    s.notes = [];
    ids.forEach(function (id) {
      var r = responseById(data, id), eff = r.effect;
      if (eff.busFrequencyMult) s.busBoost = (s.busBoost != null ? s.busBoost : 1) * eff.busFrequencyMult;
      if (eff.peakShareMult) s.peakShareMult = (s.peakShareMult != null ? s.peakShareMult : 1) * eff.peakShareMult;
      if (eff.outputLoss) s.outputLoss = 1 - (1 - (s.outputLoss || 0)) * (1 - eff.outputLoss);
      if (eff.remoteShare) {
        s.remoteShare = 1 - (1 - (s.remoteShare || 0)) * (1 - eff.remoteShare);
        s.remoteProductivity = eff.remoteProductivity != null ? eff.remoteProductivity : 0.85;
      }
      if (eff.powerDemandMult) s.powerDemandMult = (s.powerDemandMult != null ? s.powerDemandMult : 1) * eff.powerDemandMult;
      if (eff.waterDemandMult) s.waterDemandMult = (s.waterDemandMult != null ? s.waterDemandMult : 1) * eff.waterDemandMult;
      if (eff.fareMult != null) s.fareMult = (s.fareMult != null ? s.fareMult : 1) * eff.fareMult;
      if (eff.capacityBoost) s.capacityBoost = (s.capacityBoost != null ? s.capacityBoost : 1) * eff.capacityBoost;
      if (eff.powerSupplyMult) s.powerSupplyMult = (s.powerSupplyMult != null ? s.powerSupplyMult : 1) * eff.powerSupplyMult;
      if (eff.waterSupplyMult) s.waterSupplyMult = (s.waterSupplyMult != null ? s.waterSupplyMult : 1) * eff.waterSupplyMult;
      if (eff.recoveryMult) {
        s.durations = s.durations || {};
        ['flood', 'closures'].forEach(function (k) {
          if (s.durations[k] != null) s.durations[k] = Math.max(1, Math.round(s.durations[k] * eff.recoveryMult));
        });
      }
      s.responseOneOff += r.oneOff || 0;
    });
    if (ids.indexOf('shuttle') >= 0) {
      var spec = responseById(data, 'shuttle').effect.shuttle;
      var city = eventCity || Economy.runCity(data, agents, Economy.effective(data, scenario, 1, 1), normal, cfg);
      var line = resolveShuttle(data, city, normal, spec);
      if (line) s.extraLines = (s.extraLines || []).concat([line]);
      else s.notes.push('The shuttle found no connected area that needs it.');
    }
    var boosts = s.serviceBoost || {};
    Object.keys(boosts).forEach(function (id) {
      if (boosts[id] > 0) s.responseOneOff += Services.upgradeCost(data, id, boosts[id]);
    });
    if (s.newRoutes && s.newRoutes.length) {
      var city0 = eventCity || Economy.runCity(data, agents, Economy.effective(data, scenario, 1, 1), normal, cfg);
      s.newRoutes.forEach(function (r, k) {
        var line = buildNewRoute(data, city0, r, k);
        if (line) { s.extraLines = (s.extraLines || []).concat([line]); s.responseOneOff += NEW_ROUTE.setup; }
        else s.notes.push('No open road joins ' + r.from + ' and ' + r.to + ', so that new route was not built.');
      });
    }
    return s;
  }

  // ------------------------------------------------------- compare / search

  function evaluateOption(data, agents, event, ids, normal, cfg, eventCity, projOpts) {
    var applied = apply(data, agents, event, ids, normal, cfg, eventCity);
    var proj = Economy.projectDays(data, agents, applied, normal, cfg, 14, projOpts);
    return {
      ids: ids.slice(), name: label(data, ids), oneOff: applied.responseOneOff,
      harm: proj.harm, summary: proj.summary, reserveOutDay: proj.reserveOutDay,
      finalReserve: proj.finalReserve, minReserve: proj.minReserve, minService: proj.minService,
      scenario: applied, notes: applied.notes, proj: proj
    };
  }

  function sortByHarm(rows) {
    return rows.sort(function (a, b) { return a.harm.total - b.harm.total; });
  }

  /** Do nothing, and each response on its own, ranked by harm. */
  function compare(data, agents, event, normal, cfg, projOpts) {
    var eventCity = Economy.runCity(data, agents, Economy.effective(data, event, 1, 1), normal, cfg);
    var sets = [[]].concat(list(data).map(function (r) { return [r.id]; }));
    var rows = sets.map(function (ids) {
      return evaluateOption(data, agents, event, ids, normal, cfg, eventCity, projOpts);
    });
    var nothing = rows[0];
    rows.forEach(function (r) { r.vsNothing = r.harm.total - nothing.harm.total; });
    return { rows: sortByHarm(rows), nothing: nothing };
  }

  function costOf(data, ids) {
    return ids.reduce(function (s, id) { return s + (responseById(data, id).oneOff || 0); }, 0);
  }

  var DEFAULT_BEAM = 3;

  /**
   * Search for the best response within a spending limit, one option at a time
   * so a page can stay responsive: call step() until it returns true, then
   * result().
   *
   * Stage 1 tries doing nothing and every affordable response on its own.
   * Stage 2 grows plans a response at a time: it keeps the best `beam` plans
   * (default 3), tries adding each response that helped on its own to each of
   * them, and repeats until a round finds nothing better. That finds the same
   * winner as trying every combination in the cases we checked, in a few seconds
   * instead of half a minute. Combinations of responses that each make things
   * worse alone are never tried. `pruned` says how many options were skipped.
   * `{ exhaustive: true }` tries every combination of the helpful responses.
   */
  function optimiser(data, agents, event, normal, cfg, limit, projOpts, only, searchOpts) {
    if (limit == null) limit = data.budget.emergencySpendingLimit;
    var exhaustive = !!(searchOpts && searchOpts.exhaustive);
    var beamW = searchOpts && searchOpts.beam != null ? searchOpts.beam : DEFAULT_BEAM;
    var eventCity = Economy.runCity(data, agents, Economy.effective(data, event, 1, 1), normal, cfg);
    var ids = list(data).map(function (r) { return r.id; }).filter(function (id) { return !only || only.indexOf(id) >= 0; });
    var rows = [], stage = 1, nothing = null;
    var queue = [[]].concat(ids.filter(function (id) { return costOf(data, [id]) <= limit; }).map(function (id) { return [id]; }));
    var planned = queue.length;
    var useful = [], beam = [], seen = {}, levelStart = 0, bestSoFar = Infinity;

    function key(set) { return set.slice().sort().join('+'); }

    function exhaustiveQueue() {
      var q = [];
      for (var mask = 1; mask < (1 << useful.length); mask++) {
        var set = useful.filter(function (id, i) { return mask & (1 << i); });
        if (set.length > 1 && costOf(data, set) <= limit) q.push(set);
      }
      return q;
    }
    // Every plan in the beam, plus one more helpful response, that fits the limit and is new.
    function growBeam() {
      var q = [];
      beam.forEach(function (st) {
        useful.forEach(function (id) {
          if (st.ids.indexOf(id) >= 0) return;
          var set = st.ids.concat(id), k = key(set);
          if (seen[k] || costOf(data, set) > limit) return;
          seen[k] = true; q.push(set);
        });
      });
      return q;
    }

    return {
      step: function () {
        if (!queue.length && stage === 1) {
          nothing = rows.filter(function (r) { return !r.ids.length; })[0];
          var helpful = rows.filter(function (r) { return r.ids.length === 1 && r.harm.total < nothing.harm.total; })
            .sort(function (a, b) { return a.harm.total - b.harm.total; });
          useful = helpful.map(function (r) { return r.ids[0]; });
          stage = 2;
          if (exhaustive) { queue = exhaustiveQueue(); planned += queue.length; }
          else {
            rows.forEach(function (r) { seen[key(r.ids)] = true; });
            beam = helpful.slice(0, beamW);
            bestSoFar = helpful.length ? helpful[0].harm.total : Infinity;
            queue = growBeam(); planned += queue.length; levelStart = rows.length;
          }
        } else if (!queue.length && stage === 2 && !exhaustive) {
          // A round just finished: carry on only if it found something better.
          var level = rows.slice(levelStart).sort(function (a, b) { return a.harm.total - b.harm.total; });
          if (level.length && level[0].harm.total < bestSoFar - 1e-6) {
            bestSoFar = level[0].harm.total;
            beam = level.slice(0, beamW);
            queue = growBeam(); planned += queue.length; levelStart = rows.length;
          }
        }
        if (!queue.length) return true;
        rows.push(evaluateOption(data, agents, event, queue.shift(), normal, cfg, eventCity, projOpts));
        return false;
      },
      progress: function () { return { done: rows.length, planned: planned }; },
      result: function () {
        nothing = rows.filter(function (r) { return !r.ids.length; })[0];
        rows.forEach(function (r) { r.vsNothing = r.harm.total - nothing.harm.total; });
        return {
          rows: sortByHarm(rows.slice()), nothing: nothing, limit: limit, tried: rows.length,
          pruned: (1 << ids.length) - rows.length, eventCity: eventCity
        };
      }
    };
  }

  /** The whole search in one call. */
  function optimise(data, agents, event, normal, cfg, limit, projOpts, only, searchOpts) {
    var o = optimiser(data, agents, event, normal, cfg, limit, projOpts, only, searchOpts);
    while (!o.step()) { /* keep going */ }
    return o.result();
  }

  /** One sentence on what a response did compared with doing nothing. */
  function describe(row, nothing) {
    if (!row.ids.length) return 'No action: this is the reference for every other row.';
    function k(n) { return (n < 0 ? '-' : '+') + Math.abs(n / 1000).toFixed(1) + 'k'; }
    var h = row.harm, n = nothing.harm;
    var parts = [
      'output lost ' + k(h.lostOutput - n.lostOutput),
      'residents’ travel time ' + k(h.extraTravel - n.extraTravel),
      'bus spending ' + k(h.busSpend - n.busSpend),
      'response cost ' + k(h.response)
    ];
    var net = h.total - n.total;
    return 'Against doing nothing: ' + parts.join(', ') + '. Net harm ' + k(net) + ' over 14 days (' +
      (net < 0 ? 'better' : 'worse') + ').';
  }

  return {
    list: list, costOf: costOf,
    defaultDurations: defaultDurations, apply: apply, compare: compare, optimise: optimise, optimiser: optimiser,
    describe: describe, label: label, resolveShuttle: resolveShuttle, responseById: responseById,
    evaluate: evaluateOption, pathBetween: pathBetween, NEW_ROUTE: NEW_ROUTE
  };
});
