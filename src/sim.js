/*
 * Lumen Bay transport core (Day 2)
 *
 * Works in the browser (window.Sim) and in Node (require).
 *
 * How it works
 *  1. Residents are agents with a home, a job, and a car (or not).
 *  2. Each agent chooses car / bus / walk with a logit model on generalized cost
 *     (travel time + wait penalty + money cost converted to minutes).
 *  3. Car volume on each road raises its travel time (BPR curve), and buses
 *     share those roads, so congestion slows buses too.
 *  4. Choices depend on travel times and travel times depend on choices, so we
 *     iterate (method of successive averages) until the two agree.
 *
 * Scenario object (all fields optional):
 *   { closedRoads: ['e3'], capacityMult: {e7: 0.5},
 *     busFrequency: {L1: 0.7, L2: 1, L3: 1},   // 1 = normal, 0.7 = 30% cut
 *     heatwave: false }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    seed: 42,
    agentRepresentsResidents: 10,
    peakHourShare: 0.5,
    carOccupancy: 1.2,
    busPcu: 2.5,
    logitScaleMin: 8,
    carCostPerKm: 0.15,
    parking: { cbd: 2.5, oldtown: 1.5, default: 0.5 },
    valueOfTimeCreditsPerMin: 0.3,
    incomeVotMultiplier: { low: 0.67, middle: 1, high: 1.5 },
    busWaitPenaltyMultiplier: 1.8,
    busAccessMin: 6,
    busTransferMin: 4,
    busSpeedFactorVsCar: 0.85,
    busCrowdingStart: 0.8,
    busCrowdingMinPerUnit: 25,
    busCrowdingMaxMin: 30,
    carComfortBonusMin: 0,
    busDisutilityMin: 0,
    walkSpeedKmh: 4.5,
    maxWalkKm: 3.0,
    heatwaveWalkPenaltyMultiplier: 1.5,
    intraZoneKm: 1.0,
    intraZoneCarMin: 4,
    jobDistanceDecayMin: 25,
    bprAlpha: 0.15,
    bprBeta: 4,
    msaIterations: 40
  };

  function config(data) {
    return Object.assign({}, DEFAULTS, (data && data.assumptions) || {});
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- network

  function createNetwork(data, scenario, cfg) {
    scenario = scenario || {};
    var closed = new Set(scenario.closedRoads || []);
    // A river flood closes every flood-prone road.
    if (scenario.flood) data.roads.forEach(function (r) { if (r.floodProne) closed.add(r.id); });
    // Whole-network capacity scale, e.g. traffic signals failing in a brownout.
    var gscale = (scenario.capacityScale == null ? 1 : scenario.capacityScale) *
      (scenario.capacityBoost == null ? 1 : scenario.capacityBoost);   // retimed signals (a response)
    var capMult = scenario.capacityMult || {};
    var busFreq = scenario.busFrequency || {};
    var nodes = data.neighbourhoods;
    var idx = {};
    nodes.forEach(function (n, i) { idx[n.id] = i; });

    var edges = data.roads.map(function (r, i) {
      var mult = capMult[r.id] == null ? 1 : capMult[r.id];
      var isClosed = closed.has(r.id) || mult <= 0;
      return {
        i: i, id: r.id, name: r.name, a: idx[r.from], b: idx[r.to],
        from: r.from, to: r.to, km: r.km, ff: r.freeFlowMin,
        baseCap: r.capacity, cap: isClosed ? 0 : r.capacity * mult * gscale,
        closed: isClosed, bridge: !!r.bridge, floodProne: !!r.floodProne,
        flooded: !!scenario.flood && !!r.floodProne,
        baseVol: 0
      };
    });

    var adj = nodes.map(function () { return []; });
    var edgeBetween = {};
    edges.forEach(function (e) {
      edgeBetween[e.a + '-' + e.b] = e;
      edgeBetween[e.b + '-' + e.a] = e;
      if (!e.closed) {
        adj[e.a].push({ to: e.b, e: e });
        adj[e.b].push({ to: e.a, e: e });
      }
    });

    // Responses can add temporary lines (e.g. a shuttle) on top of the regular ones.
    var lines = data.busLines.concat(scenario.extraLines || []).map(function (l, li) {
      var mult = busFreq[l.id] == null ? 1 : busFreq[l.id];
      var active = mult > 0.001;
      var headway = active ? l.headwayMin / mult : Infinity;
      return {
        li: li, id: l.id, name: l.name, buses: l.buses, temporary: li >= data.busLines.length,
        stops: l.stops.map(function (s) { return idx[s]; }),
        stopIds: l.stops, baseHeadway: l.headwayMin, headway: headway,
        active: active, mult: mult, fare: l.fare * (scenario.fareMult == null ? 1 : scenario.fareMult),   // free fares (a response)
        capPerHour: active ? (60 / headway) * l.capacityPerBus : 0
      };
    });

    // Buses are vehicles too: they add (small) volume to the roads they use,
    // so cutting service slightly relieves roads while pushing riders to cars.
    lines.forEach(function (ln) {
      if (!ln.active) return;
      for (var k = 0; k < ln.stops.length - 1; k++) {
        var e = edgeBetween[ln.stops[k] + '-' + ln.stops[k + 1]];
        if (e && !e.closed) e.baseVol += (60 / ln.headway) * cfg.busPcu;
      }
    });

    return {
      nodes: nodes, idx: idx, edges: edges, adj: adj, edgeBetween: edgeBetween,
      lines: lines, n: nodes.length, heat: !!scenario.heatwave
    };
  }

  function edgeTime(e, vol, cfg) {
    if (e.closed || e.cap <= 0) return Infinity;
    var r = Math.min((vol + e.baseVol) / e.cap, 6);
    return e.ff * (1 + cfg.bprAlpha * Math.pow(r, cfg.bprBeta));
  }

  function dijkstraRoad(net, src, weightFn) {
    var n = net.n;
    var dist = new Array(n).fill(Infinity);
    var prevNode = new Array(n).fill(-1);
    var prevEdge = new Array(n).fill(null);
    var done = new Array(n).fill(false);
    dist[src] = 0;
    for (;;) {
      var u = -1, best = Infinity;
      for (var i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = true;
      var nb = net.adj[u];
      for (var j = 0; j < nb.length; j++) {
        var w = weightFn(nb[j].e);
        if (dist[u] + w < dist[nb[j].to]) {
          dist[nb[j].to] = dist[u] + w;
          prevNode[nb[j].to] = u;
          prevEdge[nb[j].to] = nb[j].e;
        }
      }
    }
    return { dist: dist, prevNode: prevNode, prevEdge: prevEdge };
  }

  function pathEdges(tree, d) {
    var out = [], v = d;
    while (tree.prevEdge[v]) { out.push(tree.prevEdge[v]); v = tree.prevNode[v]; }
    return out.reverse();
  }

  // Bus search over (stop, line) states so transfers cost a wait + penalty.
  function busFrom(net, cfg, o, edgeT, crowd) {
    var nl = net.lines.length, S = net.n * nl, pen = cfg.busWaitPenaltyMultiplier;
    var gc = new Array(S).fill(Infinity), tm = new Array(S).fill(0);
    var fare = new Array(S).fill(0), prev = new Array(S).fill(null);
    var done = new Array(S).fill(false);

    net.lines.forEach(function (ln) {
      if (!ln.active || ln.stops.indexOf(o) < 0) return;
      var s = o * nl + ln.li;
      gc[s] = pen * ln.headway / 2; tm[s] = ln.headway / 2; fare[s] = ln.fare;
      prev[s] = { from: -1, seg: null };
    });

    for (;;) {
      var u = -1, best = Infinity;
      for (var s = 0; s < S; s++) if (!done[s] && gc[s] < best) { best = gc[s]; u = s; }
      if (u < 0) break;
      done[u] = true;
      var node = Math.floor(u / nl), li = u % nl, ln = net.lines[li];
      var k = ln.stops.indexOf(node);
      [-1, 1].forEach(function (dk) {
        var k2 = k + dk;
        if (k2 < 0 || k2 >= ln.stops.length) return;
        var nx = ln.stops[k2];
        var e = net.edgeBetween[node + '-' + nx];
        if (!e || e.closed) return;
        var t = edgeT(e), c = crowd(li, node, nx), s2 = nx * nl + li, g = gc[u] + t + c;
        if (g < gc[s2]) {
          gc[s2] = g; tm[s2] = tm[u] + t + c; fare[s2] = fare[u];
          prev[s2] = { from: u, seg: { li: li, from: node, to: nx, e: e } };
        }
      });
      net.lines.forEach(function (l2) {
        if (!l2.active || l2.li === li || l2.stops.indexOf(node) < 0) return;
        var s2 = node * nl + l2.li, w = l2.headway / 2;
        var g = gc[u] + pen * w + cfg.busTransferMin;
        if (g < gc[s2]) {
          gc[s2] = g; tm[s2] = tm[u] + w + cfg.busTransferMin; fare[s2] = fare[u] + l2.fare;
          prev[s2] = { from: u, seg: null };
        }
      });
    }
    return { gc: gc, tm: tm, fare: fare, prev: prev, nl: nl };
  }

  function busTo(res, d) {
    var best = -1, bg = Infinity;
    for (var li = 0; li < res.nl; li++) {
      var s = d * res.nl + li;
      if (res.gc[s] < bg) { bg = res.gc[s]; best = s; }
    }
    if (best < 0) return null;
    var segs = [], s2 = best;
    while (s2 >= 0 && res.prev[s2]) {
      var p = res.prev[s2];
      if (p.seg) segs.push(p.seg);
      s2 = p.from;
    }
    segs.reverse();
    return { gc: bg, tm: res.tm[best], fare: res.fare[best], segs: segs };
  }

  // ----------------------------------------------------------------- agents

  function generateAgents(data, cfgIn) {
    var cfg = cfgIn || config(data);
    var rng = mulberry32(cfg.seed);
    var nodes = data.neighbourhoods, n = nodes.length;
    var idx = {};
    nodes.forEach(function (x, i) { idx[x.id] = i; });

    // Free-flow travel time matrix (Floyd-Warshall) for job choice.
    var ff = [];
    for (var i = 0; i < n; i++) { ff.push(new Array(n).fill(Infinity)); ff[i][i] = 0; }
    data.roads.forEach(function (r) {
      var a = idx[r.from], b = idx[r.to];
      ff[a][b] = Math.min(ff[a][b], r.freeFlowMin);
      ff[b][a] = Math.min(ff[b][a], r.freeFlowMin);
    });
    for (var k = 0; k < n; k++) for (var x = 0; x < n; x++) for (var y = 0; y < n; y++) {
      if (ff[x][k] + ff[k][y] < ff[x][y]) ff[x][y] = ff[x][k] + ff[k][y];
    }

    var agents = [], id = 0;
    nodes.forEach(function (h, hi) {
      var weights = nodes.map(function (d, di) {
        return d.jobs * Math.exp(-ff[hi][di] / cfg.jobDistanceDecayMin);
      });
      var total = weights.reduce(function (s, w) { return s + w; }, 0);
      for (var a = 0; a < h.agents; a++) {
        var r = rng() * total, di = 0;
        while (di < n - 1 && r > weights[di]) { r -= weights[di]; di++; }
        agents.push({
          id: id++, home: hi, job: di,
          hasCar: rng() < h.carOwnership, income: h.income
        });
      }
    });
    return agents;
  }

  // -------------------------------------------------------------- the model

  function runTransport(data, agents, scenario, cfgIn) {
    var cfg = cfgIn || config(data);
    var net = createNetwork(data, scenario, cfg);
    // Staggered work start times spread the morning peak over more hours, and a
    // remote-work order removes some commuters from it altogether.
    var peakShare = cfg.peakHourShare * (scenario && scenario.peakShareMult != null ? scenario.peakShareMult : 1) *
      (1 - Math.min(1, Math.max(0, (scenario && scenario.remoteShare) || 0)));
    var E = net.edges.length, N = net.n, nl = net.lines.length;
    var walkMult = net.heat ? cfg.heatwaveWalkPenaltyMultiplier : 1;

    // Group agents with identical situations so each round is cheap.
    var gmap = {}, groups = [];
    agents.forEach(function (a) {
      var key = a.home + '|' + a.job + '|' + (a.hasCar ? 1 : 0);
      if (!gmap[key]) {
        gmap[key] = {
          home: a.home, job: a.job, hasCar: a.hasCar, income: a.income, n: 0,
          P: { car: 0, bus: 0, walk: 0, none: 0 }
        };
        groups.push(gmap[key]);
      }
      gmap[key].n++;
    });

    // Walking uses distance only, so compute it once.
    var walkTrees = [];
    for (var o = 0; o < N; o++) walkTrees.push(dijkstraRoad(net, o, function (e) { return e.km; }));
    function walkOption(oi, di) {
      var km = oi === di ? cfg.intraZoneKm : walkTrees[oi].dist[di];
      if (!isFinite(km) || km > cfg.maxWalkKm + 1e-9) return null;
      var t = km / cfg.walkSpeedKmh * 60;
      return { t: t, gc: t * walkMult };
    }

    function parkCost(di) {
      var id = net.nodes[di].id;
      return cfg.parking[id] != null ? cfg.parking[id] : cfg.parking.default;
    }

    var vol = new Array(E).fill(0);
    var load = {};                   // bus passengers per hour by "line|from|to"
    function crowdFn(li, from, to) {
      var ln = net.lines[li];
      if (!ln.capPerHour) return 0;
      var ratio = (load[li + '|' + from + '|' + to] || 0) / ln.capPerHour;
      var extra = cfg.busCrowdingMinPerUnit * Math.max(0, ratio - cfg.busCrowdingStart);
      return Math.min(extra, cfg.busCrowdingMaxMin);
    }

    function buildTrees() {
      var eT = function (e) { return edgeTime(e, vol[e.i], cfg); };
      var busT = function (e) { return eT(e) / cfg.busSpeedFactorVsCar; };
      var road = [], bus = [];
      for (var o2 = 0; o2 < N; o2++) {
        road.push(dijkstraRoad(net, o2, eT));
        bus.push(busFrom(net, cfg, o2, busT, crowdFn));
      }
      return { road: road, bus: bus };
    }

    function options(g, trees) {
      var oi = g.home, di = g.job;
      var vot = cfg.valueOfTimeCreditsPerMin * cfg.incomeVotMultiplier[g.income];
      var car = null, bus = null, walk = walkOption(oi, di);
      if (oi === di) {
        if (g.hasCar) {
          car = {
            t: cfg.intraZoneCarMin,
            gc: cfg.intraZoneCarMin + (cfg.carCostPerKm * cfg.intraZoneKm + parkCost(di)) / vot - cfg.carComfortBonusMin,
            edges: []
          };
        }
      } else {
        var rt = trees.road[oi];
        if (g.hasCar && isFinite(rt.dist[di])) {
          var edges = pathEdges(rt, di), km = 0;
          edges.forEach(function (e) { km += e.km; });
          car = {
            t: rt.dist[di],
            gc: rt.dist[di] + (cfg.carCostPerKm * km + parkCost(di)) / vot - cfg.carComfortBonusMin,
            edges: edges
          };
        }
        var b = busTo(trees.bus[oi], di);
        if (b && isFinite(b.gc)) {
          bus = {
            t: b.tm + cfg.busAccessMin,
            gc: b.gc + cfg.busAccessMin + b.fare / vot + cfg.busDisutilityMin,
            segs: b.segs, fare: b.fare
          };
        }
      }
      return { car: car, bus: bus, walk: walk };
    }

    function choose(opt) {
      var modes = ['car', 'bus', 'walk'].filter(function (m) { return opt[m]; });
      var P = { car: 0, bus: 0, walk: 0, none: 0 };
      if (!modes.length) { P.none = 1; return P; }
      var minGc = Math.min.apply(null, modes.map(function (m) { return opt[m].gc; }));
      var sum = 0;
      modes.forEach(function (m) { P[m] = Math.exp(-(opt[m].gc - minGc) / cfg.logitScaleMin); sum += P[m]; });
      modes.forEach(function (m) { P[m] /= sum; });
      return P;
    }

    var iterations = cfg.msaIterations, lastAvg = null, converged = false;
    for (var it = 1; it <= iterations; it++) {
      var trees = buildTrees();
      var newVol = new Array(E).fill(0), newLoad = {};
      var w = 1 / it, sumT = 0, sumN = 0;

      groups.forEach(function (g) {
        var opt = options(g, trees);
        var P = choose(opt);
        var persons = g.n * cfg.agentRepresentsResidents * peakShare;
        if (P.car > 0) {
          var cars = persons * P.car / cfg.carOccupancy;
          opt.car.edges.forEach(function (e) { newVol[e.i] += cars; });
        }
        if (P.bus > 0) {
          opt.bus.segs.forEach(function (s) {
            var key = s.li + '|' + s.from + '|' + s.to;
            newLoad[key] = (newLoad[key] || 0) + persons * P.bus;
          });
        }
        ['car', 'bus', 'walk', 'none'].forEach(function (m) {
          g.P[m] = it === 1 ? P[m] : (1 - w) * g.P[m] + w * P[m];
        });
        ['car', 'bus', 'walk'].forEach(function (m) {
          if (opt[m]) { sumT += opt[m].t * P[m] * g.n; }
        });
        sumN += g.n * (1 - P.none);
      });

      for (var e = 0; e < E; e++) vol[e] = (1 - w) * vol[e] + w * newVol[e];
      var keys = {};
      Object.keys(load).forEach(function (k2) { keys[k2] = 1; });
      Object.keys(newLoad).forEach(function (k2) { keys[k2] = 1; });
      Object.keys(keys).forEach(function (k2) {
        load[k2] = (1 - w) * (load[k2] || 0) + w * (newLoad[k2] || 0);
      });
      var avg = sumN ? sumT / sumN : 0;
      if (lastAvg !== null && Math.abs(avg - lastAvg) < 0.05 && it > 10) converged = true;
      lastAvg = avg;
    }

    // Final evaluation: actual times at the equilibrium volumes.
    var finalTrees = buildTrees();
    var byN = net.nodes.map(function (nd) {
      return { id: nd.id, name: nd.name, agents: 0, timeSum: 0, moving: 0, car: 0, bus: 0, walk: 0, none: 0 };
    });
    var tot = { agents: 0, timeSum: 0, moving: 0, car: 0, bus: 0, walk: 0, none: 0 };
    var groupOut = [];

    groups.forEach(function (g) {
      var opt = options(g, finalTrees);
      var avail = ['car', 'bus', 'walk'].filter(function (m) { return opt[m]; });
      var pSum = avail.reduce(function (s, m) { return s + g.P[m]; }, 0);
      var time = 0;
      if (pSum > 0) avail.forEach(function (m) { time += opt[m].t * g.P[m] / pSum; });
      var moving = g.n * (1 - g.P.none);
      // The "all-in cost" of getting to work, in minutes: the logit log-sum of the options (time, waiting,
      // fares and parking turned into minutes). It rises when any option gets worse, even if people switch
      // to a faster but dearer one, so it is the fair way to say whether a change left someone better or worse off.
      var cost = null;
      if (avail.length) {
        var minG = Math.min.apply(null, avail.map(function (m) { return opt[m].gc; })), expSum = 0;
        avail.forEach(function (m) { expSum += Math.exp(-(opt[m].gc - minG) / cfg.logitScaleMin); });
        cost = minG - cfg.logitScaleMin * Math.log(expSum);
      }
      groupOut.push({
        home: g.home, job: g.job, hasCar: g.hasCar, income: g.income, n: g.n,
        time: time, cost: cost, P: { car: g.P.car, bus: g.P.bus, walk: g.P.walk, none: g.P.none },
        busFare: opt.bus ? opt.bus.fare : 0
      });
      [byN[g.home], tot].forEach(function (acc) {
        acc.agents += g.n;
        acc.timeSum += time * moving;
        acc.moving += moving;
        acc.car += g.n * g.P.car; acc.bus += g.n * g.P.bus;
        acc.walk += g.n * g.P.walk; acc.none += g.n * g.P.none;
      });
    });

    function finish(acc) {
      var a = acc.agents || 1;
      return {
        commute: acc.moving ? acc.timeSum / acc.moving : 0,
        shares: { car: acc.car / a, bus: acc.bus / a, walk: acc.walk / a, none: acc.none / a },
        agents: acc.agents
      };
    }
    // Origin-destination travel times for non-work trips (shopping): expected
    // time and share who can reach, blending car owners and non-owners.
    var od = [], odBy = [];
    for (var oo = 0; oo < N; oo++) {
      od.push([]); odBy.push([]);
      for (var dd = 0; dd < N; dd++) {
        var tSum = 0, reachSum = 0, split = [];
        [true, false].forEach(function (hc) {
          var wgt = hc ? net.nodes[oo].carOwnership : 1 - net.nodes[oo].carOwnership;
          if (wgt <= 0) return;
          var gg = { home: oo, job: dd, hasCar: hc, income: net.nodes[oo].income };
          var op = options(gg, finalTrees), P = choose(op), tt = 0;
          ['car', 'bus', 'walk'].forEach(function (m) { if (op[m]) tt += op[m].t * P[m]; });
          tSum += wgt * tt; reachSum += wgt * (1 - P.none);
          // The same trip for car owners and for people without a car, kept apart so that
          // access to services can show who is left behind.
          split.push({ hasCar: hc, w: wgt, t: (1 - P.none) > 0 ? tt / (1 - P.none) : null, reach: 1 - P.none });
        });
        odBy[oo].push(split);
        od[oo].push({ t: reachSum > 0 ? tSum / reachSum : null, reach: reachSum });
      }
    }

    var summary = finish(tot);
    var byNbhd = byN.map(function (x) {
      var f = finish(x);
      f.id = x.id; f.name = x.name;
      return f;
    });

    var edgeStats = net.edges.map(function (e) {
      var v = vol[e.i] + e.baseVol;
      var t = e.closed ? null : edgeTime(e, vol[e.i], cfg);
      return {
        id: e.id, name: e.name, from: e.from, to: e.to, bridge: e.bridge,
        closed: e.closed, floodProne: e.floodProne, flooded: e.flooded,
        vol: v, cap: e.cap, baseCap: e.baseCap,
        vc: e.closed ? null : v / e.cap,
        time: t, ff: e.ff, delay: t == null ? null : t - e.ff
      };
    });

    var wSum = 0, wvc = 0, maxEdge = null;
    edgeStats.forEach(function (e, i) {
      if (e.closed) return;
      var km = net.edges[i].km, flow = vol[i] * km;
      wSum += flow; wvc += flow * e.vc;
      if (!maxEdge || e.vc > maxEdge.vc) maxEdge = e;
    });
    summary.congestionIndex = wSum ? wvc / wSum : 0;
    summary.maxVC = maxEdge ? maxEdge.vc : 0;
    summary.maxVCEdge = maxEdge ? maxEdge.name : '-';

    var movers = byNbhd.filter(function (x) { return x.shares.none < 0.999; });
    var worst = movers.reduce(function (a, b) { return !a || b.commute > a.commute ? b : a; }, null);
    var best = movers.reduce(function (a, b) { return !a || b.commute < a.commute ? b : a; }, null);
    summary.worstNbhd = worst ? worst.name : '-';
    summary.worstCommute = worst ? worst.commute : 0;
    summary.equityGap = worst && best ? worst.commute - best.commute : 0;

    var lineStats = net.lines.map(function (ln) {
      var maxLoad = 0, riders = 0;
      Object.keys(load).forEach(function (k2) {
        var p = k2.split('|');
        if (+p[0] === ln.li) { maxLoad = Math.max(maxLoad, load[k2]); riders += load[k2]; }
      });
      return {
        id: ln.id, name: ln.name, active: ln.active, headway: ln.headway,
        mult: ln.mult, baseHeadway: ln.baseHeadway, buses: ln.buses, temporary: ln.temporary,
        stops: ln.stopIds,
        peakLoad: maxLoad, cap: ln.capPerHour,
        util: ln.capPerHour ? maxLoad / ln.capPerHour : 0
      };
    });

    return {
      summary: summary, byNbhd: byNbhd, edges: edgeStats, lines: lineStats,
      groups: groupOut, od: od, odBy: odBy,
      iterations: iterations, converged: converged,
      scenario: scenario || {}
    };
  }

  return {
    DEFAULTS: DEFAULTS, config: config, generateAgents: generateAgents,
    runTransport: runTransport, createNetwork: createNetwork
  };
});
