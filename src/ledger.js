/*
 * Policy Impact Ledger + Equity Lens (Day 9, from the CitySim Nexus deck)
 *
 * Takes two runs of the city (A = after a change, B = before it) and says who gains, who loses and
 * what it costs, with every resident counted exactly once:
 *
 *   Ledger.compare(data, agents, A, B)    the three groups, by district and by kind of resident,
 *                                         access to jobs / hospitals / schools, spillovers
 *   Ledger.spending(projection)           public money spent by the change over the 14 days
 *   Ledger.efficiency(c, spend)           net residents better off per 10,000 credits
 *
 * How a resident is counted (the "no double counting" rule). Each simulated person stands for
 * `agentRepresentsResidents` residents. For each person we look at every measure that applies to them:
 *   - the all-in cost of their commute (time, waiting, fares and parking, in minutes): 2 or more higher is a loss, 2 or more lower is a gain
 *   - whether they can reach their job at all (the share of days / the chance they cannot)
 *   - access to a hospital, only for the residents who need one (healthNeedShare)
 *   - access to a school, only for the school-age residents (schoolAgeShare)
 * If any measure got worse they count as WORSE (a loss in one place is not cancelled by a gain in another);
 * otherwise if any got better they are BETTER; otherwise UNCHANGED. Where a measure is a share (the chance
 * of losing the route to work) the person is split between the groups by that share, and the three parts
 * always add up to the whole person. Who needs a hospital or attends school is a fixed pseudo-random
 * assignment (the same people in every run), so the baseline and a scenario always compare the same people.
 *
 * Works in the browser (window.Ledger) and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./services.js'));
  else root.Ledger = factory(root.Services);
})(typeof self !== 'undefined' ? self : this, function (Services) {
  'use strict';

  var TIME_STEP_MIN = 2;        // the commute's all-in cost must change by this many minutes to count as a loss or a gain
  var FLAG_SHARE = 0.25;        // a district with this share of residents worse off is flagged
  var UNDERSERVED = 0.8;        // a district below this access share is called underserved

  function hash01(id, salt) {
    var x = Math.imul((id | 0) + 1, 0x9E3779B1) ^ Math.imul(salt | 0, 0x85EBCA6B);
    x ^= x >>> 15; x = Math.imul(x, 0x2C1B3C6D); x ^= x >>> 12; x = Math.imul(x, 0x297A2D39); x ^= x >>> 15;
    return (x >>> 0) / 4294967296;
  }
  /** Who needs a hospital and who is of school age: fixed for each simulated person. */
  function needs(agentId, svcCfg) {
    return {
      patient: hash01(agentId, 11) < svcCfg.healthNeedShare,
      student: hash01(agentId, 29) < svcCfg.schoolAgeShare
    };
  }

  function tally() { return { residents: 0, better: 0, worse: 0, unchanged: 0 }; }
  function add(t, w, b, wo) { t.residents += w; t.better += w * b; t.worse += w * wo; t.unchanged += w * (1 - b - wo); }
  function groupKey(a) { return a.home + '|' + a.job + '|' + (a.hasCar ? 1 : 0); }
  function share(x, total) { return total ? x / total : 0; }

  function compare(data, agents, A, B) {
    var R = (data.assumptions && data.assumptions.agentRepresentsResidents) || 5;
    var svc = Services.has(data), sc = Services.config(data);
    var aA = svc ? Services.access(data, A) : null, aB = svc ? Services.access(data, B) : null;
    var nodes = data.neighbourhoods;
    var gA = {}, gB = {};
    A.groups.forEach(function (g) { gA[groupKey(g)] = g; });
    B.groups.forEach(function (g) { gB[groupKey(g)] = g; });

    var city = tally(), byD = nodes.map(function () { return tally(); });
    var byIncome = { low: tally(), middle: tally(), high: tally() };
    var byCar = { car: tally(), nocar: tally() };
    var byNeed = { patients: tally(), students: tally(), others: tally() };
    var jobsB = 0, jobsA = 0, people = 0;

    agents.forEach(function (a) {
      var k = groupKey(a), ga = gA[k], gb = gB[k];
      people += R;
      if (!ga || !gb) { add(city, R, 0, 0); add(byD[a.home], R, 0, 0); return; }
      var worse = 0, better = 0;
      // 1. getting to work at all
      worse = Math.max(worse, Math.max(0, ga.P.none - gb.P.none));
      better = Math.max(better, Math.max(0, gb.P.none - ga.P.none));
      jobsB += R * (1 - gb.P.none); jobsA += R * (1 - ga.P.none);
      // 2. how long the trip takes for those who can make it
      var movers = 1 - ga.P.none;
      if (movers > 0 && gb.P.none < 1 && ga.cost != null && gb.cost != null) {
        var dt = ga.cost - gb.cost;
        if (dt >= TIME_STEP_MIN) worse = Math.max(worse, movers);
        else if (dt <= -TIME_STEP_MIN) better = Math.max(better, movers);
      }
      // 3. hospital and school, for the residents who need them
      var nd = needs(a.id, sc), isPatient = false, isStudent = false;
      if (svc) {
        var rowA = aA.byNbhd[a.home], rowB = aB.byNbhd[a.home];
        var pick = function (row, type) {
          var v = a.hasCar ? row[type].withinCar : row[type].withinNoCar;
          return v == null ? row[type].withinShare : v;
        };
        if (nd.patient) {
          isPatient = true;
          var h0 = pick(rowB, 'hospital'), h1 = pick(rowA, 'hospital');
          worse = Math.max(worse, Math.max(0, h0 - h1)); better = Math.max(better, Math.max(0, h1 - h0));
        }
        if (nd.student) {
          isStudent = true;
          var s0 = pick(rowB, 'school'), s1 = pick(rowA, 'school');
          worse = Math.max(worse, Math.max(0, s0 - s1)); better = Math.max(better, Math.max(0, s1 - s0));
        }
      }
      worse = Math.min(1, worse);
      better = Math.min(1 - worse, better);
      add(city, R, better, worse);
      add(byD[a.home], R, better, worse);
      add(byIncome[a.income] || byIncome.middle, R, better, worse);
      add(a.hasCar ? byCar.car : byCar.nocar, R, better, worse);
      add(isPatient ? byNeed.patients : (isStudent ? byNeed.students : byNeed.others), R, better, worse);
    });

    var districts = nodes.map(function (nd, i) {
      var t = byD[i];
      var o = { id: nd.id, name: nd.name, residents: t.residents, better: t.better, worse: t.worse, unchanged: t.unchanged,
        worseShare: share(t.worse, t.residents), betterShare: share(t.better, t.residents) };
      var rA = A.byNbhd[i], rB = B.byNbhd[i];
      o.commuteDelta = rA.commute - rB.commute;
      o.jobs = { before: 1 - rB.shares.none, after: 1 - rA.shares.none };
      if (svc) {
        o.hospital = { before: aB.byNbhd[i].hospital.withinShare, after: aA.byNbhd[i].hospital.withinShare };
        o.school = { before: aB.byNbhd[i].school.withinShare, after: aA.byNbhd[i].school.withinShare };
      }
      var low = [];
      if (o.jobs.after < UNDERSERVED) low.push('jobs');
      if (svc && o.hospital.after < UNDERSERVED) low.push('hospital');
      if (svc && o.school.after < UNDERSERVED) low.push('school');
      o.underserved = low;
      o.flagged = o.worseShare >= FLAG_SHARE;
      return o;
    });

    function finishT(t) { return { residents: t.residents, better: t.better, worse: t.worse, unchanged: t.unchanged, worseShare: share(t.worse, t.residents), betterShare: share(t.better, t.residents) }; }
    var groups = {
      income: Object.keys(byIncome).map(function (k) { var o = finishT(byIncome[k]); o.id = k; o.label = k + ' income'; return o; }),
      car: [{ id: 'car', label: 'have a car' }, { id: 'nocar', label: 'have no car' }].map(function (d) { var o = finishT(byCar[d.id]); o.id = d.id; o.label = d.label; return o; }),
      need: [{ id: 'patients', label: 'need a hospital' }, { id: 'students', label: 'are school age' }, { id: 'others', label: 'neither' }].map(function (d) { var o = finishT(byNeed[d.id]); o.id = d.id; o.label = d.label; return o; })
    };

    // Equity: how unevenly the losses fall.
    var withRes = districts.filter(function (d) { return d.residents > 0; });
    var wMax = withRes.reduce(function (a, b) { return !a || b.worseShare > a.worseShare ? b : a; }, null);
    var wMin = withRes.reduce(function (a, b) { return !a || b.worseShare < a.worseShare ? b : a; }, null);
    var equity = { worstDistrict: wMax && wMax.name, bestDistrict: wMin && wMin.name, gapPts: wMax && wMin ? (wMax.worseShare - wMin.worseShare) * 100 : 0 };

    // Spillovers: what moved somewhere other than the change itself.
    var bEdge = {};
    B.edges.forEach(function (e) { bEdge[e.id] = e; });
    var roads = A.edges.filter(function (e) { return !e.closed && bEdge[e.id] && bEdge[e.id].vc != null; })
      .map(function (e) { return { name: e.name, before: bEdge[e.id].vc, after: e.vc, d: e.vc - bEdge[e.id].vc }; })
      .filter(function (x) { return Math.abs(x.d) >= 0.03; })
      .sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); }).slice(0, 3);
    var zoneB = {};
    B.econ.zones.forEach(function (z) { zoneB[z.id] = z; });
    var output = A.econ.zones.map(function (z) { return { name: z.name, d: z.revenue - zoneB[z.id].revenue, pct: zoneB[z.id].revenue ? z.revenue / zoneB[z.id].revenue - 1 : 0 }; })
      .filter(function (x) { return Math.abs(x.pct) >= 0.02; })
      .sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); }).slice(0, 3);
    var spill = {
      roads: roads, output: output,
      power: { before: B.econ.power.load, after: A.econ.power.load },
      water: { before: B.econ.water.load, after: A.econ.water.load },
      congestion: { before: B.summary.congestionIndex, after: A.summary.congestionIndex },
      overloaded: aA ? aA.facilities.filter(function (f) { return f.open && f.load > 1.05 && f.load > (aB.facilities.filter(function (g) { return g.id === f.id; })[0] || { load: 0 }).load + 0.05; })
        .map(function (f) { return { name: f.name, load: f.load }; }) : []
    };

    var access = {
      jobs: { before: people ? jobsB / people : 1, after: people ? jobsA / people : 1 }
    };
    if (svc) {
      access.hospital = { before: aB.city.hospital.share, after: aA.city.hospital.share, nocarBefore: aB.city.hospital.byCar.nocar.share, nocarAfter: aA.city.hospital.byCar.nocar.share };
      access.school = { before: aB.city.school.share, after: aA.city.school.share };
    }

    var c = finishT(city);
    return {
      residents: c.residents, better: c.better, worse: c.worse, unchanged: c.unchanged,
      betterShare: c.betterShare, worseShare: c.worseShare,
      districts: districts, groups: groups, equity: equity, access: access, spill: spill,
      flagged: districts.filter(function (d) { return d.flagged; }).map(function (d) { return d.name; }),
      underserved: districts.filter(function (d) { return d.underserved.length; }).map(function (d) { return { name: d.name, what: d.underserved }; })
    };
  }

  /** Public money the change costs over the projection: starting cost + extra bus running + repairs. */
  function spending(proj) {
    var h = proj && proj.harm ? proj.harm : { response: 0, busSpend: 0, repairs: 0 };
    return { response: h.response, bus: h.busSpend, repairs: h.repairs, total: h.response + h.busSpend + h.repairs };
  }

  /** Net residents better off per 10,000 credits spent (null when nothing was spent or nobody gained). */
  function efficiency(c, spend) {
    var net = c.better - c.worse;
    if (!(spend.total > 1)) return { net: net, per10k: null };
    return { net: net, per10k: net / (spend.total / 10000) };
  }

  return { compare: compare, spending: spending, efficiency: efficiency, needs: needs,
    TIME_STEP_MIN: TIME_STEP_MIN, FLAG_SHARE: FLAG_SHARE, UNDERSERVED: UNDERSERVED };
});
