/*
 * Lumen Bay essential services (Day 8, from the CitySim Nexus deck)
 *
 * Hospitals and schools sit in neighbourhoods. A resident "has access" when they can get to the
 * nearest open facility of that kind within a time limit. Travel times come straight from the
 * transport model (Sim.runTransport -> od), so a closed road, a bus cut or a flood changes access
 * through the same routes, mode choices and congestion as everything else. Nothing here is typed in.
 *
 *   Services.has(data)                      does this city have a services section?
 *   Services.config(data)                   the settings with defaults filled in
 *   Services.facilities(data)               [{ id, type, name, at, capacity }]
 *   Services.access(data, T)                access to each kind of service for every neighbourhood
 *   Services.describeFacility(data, id)     "Bay General Hospital (Central Business District)"
 *
 * T is a transport result (Sim.runTransport or Economy.runCity). Facilities named in
 * T.scenario.closedServices are out of action. T.scenario.serviceBoost ({ facilityId: 0.5 } = +50% places)
 * raises a facility's capacity. A facility can take on up to overloadTolerance x its capacity (115%);
 * residents beyond that are turned away and do not count as having access, so a closure that pushes
 * everyone onto one hospital hurts, and extra capacity there helps. Normal-city loads stay below the limit.
 *
 * Works in the browser (window.Services) and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Services = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = { hospitalMaxMin: 20, schoolMaxMin: 25, healthNeedShare: 0.12, schoolAgeShare: 0.2, overloadTolerance: 1.15 };
  // Credits to add one extra place (made-up round numbers, shown in the Assumptions table).
  var UPGRADE_COST = { hospital: 22, school: 14 };
  var TYPES = ['hospital', 'school'];
  var TYPE_LABEL = { hospital: 'Hospital', school: 'School' };

  function has(data) {
    return !!(data && data.services && Array.isArray(data.services.facilities) && data.services.facilities.length);
  }

  function config(data) {
    var s = (data && data.services) || {};
    var c = {};
    Object.keys(DEFAULTS).forEach(function (k) { c[k] = typeof s[k] === 'number' ? s[k] : DEFAULTS[k]; });
    return c;
  }

  function facilities(data) { return has(data) ? data.services.facilities : []; }

  function rep(data) {
    var a = data.assumptions || {};
    return typeof a.agentRepresentsResidents === 'number' ? a.agentRepresentsResidents : 5;
  }

  function describeFacility(data, id) {
    var f = facilities(data).filter(function (x) { return x.id === id; })[0];
    if (!f) return String(id);
    var nb = data.neighbourhoods.filter(function (n) { return n.id === f.at; })[0];
    return f.name + (nb ? ' (' + nb.name + ')' : '');
  }

  function boostOf(T, id) {
    var b = T && T.scenario && T.scenario.serviceBoost;
    var v = b && typeof b[id] === 'number' ? b[id] : 0;
    return v > 0 ? v : 0;
  }

  function effectiveCapacity(T, f) { return f.capacity * (1 + boostOf(T, f.id)); }

  function closedList(T) {
    var c = T && T.scenario && T.scenario.closedServices;
    return Array.isArray(c) ? c : [];
  }

  /**
   * For each neighbourhood and each kind of service: how many residents need it, how many can
   * reach the best open facility within the limit, the travel time, and which facility that is.
   * Also each facility's load: the residents who would use it against what it can serve.
   */
  function access(data, T) {
    var cfg = config(data), R = rep(data), closed = closedList(T);
    var nodes = data.neighbourhoods, idx = {};
    nodes.forEach(function (n, i) { idx[n.id] = i; });
    var fac = facilities(data);
    var out = { byNbhd: [], facilities: [], city: {}, closed: closed.slice() };
    var assigned = {};
    fac.forEach(function (f) { assigned[f.id] = 0; });
    function bestFor(i, type, hc, cells) {
      var best = null;
      cells.forEach(function (f) {
        var sp = T.odBy && T.odBy[i] && T.odBy[i][idx[f.at]];
        var g = sp && sp.filter(function (x) { return x.hasCar === hc; })[0];
        if (!g || g.t == null || !(g.reach > 0.001)) return;
        if (!best || g.t < best.t - 1e-9) best = { f: f, t: g.t, reach: g.reach };
      });
      return best;
    }
    // Pass 1: who would go where. Pass 2 (below) turns away whoever a full facility cannot take.
    nodes.forEach(function (nd, i) {
      var pop = nd.agents * R;
      TYPES.forEach(function (type) {
        var people = pop * (type === 'hospital' ? cfg.healthNeedShare : cfg.schoolAgeShare);
        var cells = fac.filter(function (f) { return f.type === type && closed.indexOf(f.id) < 0 && idx[f.at] != null; });
        [true, false].forEach(function (hc) {
          var gw = hc ? nd.carOwnership : 1 - nd.carOwnership;
          if (!(gw > 0)) return;
          var b = bestFor(i, type, hc, cells);
          if (b) assigned[b.f.id] += people * gw * b.reach;
        });
      });
    });
    var admit = {};
    fac.forEach(function (f) {
      var lim = effectiveCapacity(T, f) * cfg.overloadTolerance;
      admit[f.id] = assigned[f.id] > lim && assigned[f.id] > 0 ? lim / assigned[f.id] : 1;
    });
    fac.forEach(function (f) { assigned[f.id] = 0; });

    TYPES.forEach(function (type) {
      out.city[type] = { people: 0, within: 0, share: 1, avgMin: 0, noRoute: 0, timeSum: 0, timeN: 0,
        byCar: { car: { people: 0, within: 0 }, nocar: { people: 0, within: 0 } } };
    });

    nodes.forEach(function (nd, i) {
      var pop = nd.agents * R;
      var row = { id: nd.id, name: nd.name, pop: pop };
      TYPES.forEach(function (type) {
        var share = type === 'hospital' ? cfg.healthNeedShare : cfg.schoolAgeShare;
        var limit = type === 'hospital' ? cfg.hospitalMaxMin : cfg.schoolMaxMin;
        var people = pop * share;
        var r = { people: people, within: 0, reachShare: 0, timeMin: null, facility: null, withinShare: 0, timeSum: 0, withinCar: null, withinNoCar: null };
        var c = out.city[type], faceCount = {};
        // Residents with a car and residents without one reach the same buildings differently,
        // so each group picks its own quickest open facility.
        var cells = fac.filter(function (f) { return f.type === type && closed.indexOf(f.id) < 0 && idx[f.at] != null; });
        var splitIdx = {};
        [true, false].forEach(function (hc) {
          var gw = hc ? nd.carOwnership : 1 - nd.carOwnership;
          if (!(gw > 0)) return;
          var best = bestFor(i, type, hc, cells);
          var gp = people * gw, key = hc ? 'car' : 'nocar';
          c.byCar[key].people += gp;
          if (best) {
            var ok = best.t <= limit + 1e-9 ? gp * best.reach * admit[best.f.id] : 0;
            r.within += ok; r.reachShare += gw * best.reach; r.timeSum += best.t * gp * best.reach;
            c.byCar[key].within += ok;
            r[hc ? 'withinCar' : 'withinNoCar'] = best.t <= limit + 1e-9 ? best.reach * admit[best.f.id] : 0;
            assigned[best.f.id] += gp * best.reach;
            faceCount[best.f.id] = (faceCount[best.f.id] || 0) + gp * best.reach;
            c.timeSum += best.t * gp * best.reach; c.timeN += gp * best.reach;
            c.noRoute += gp * (1 - best.reach);
          } else { c.noRoute += gp; r[hc ? 'withinCar' : 'withinNoCar'] = 0; }
        });
        var reached = r.reachShare * people;
        r.timeMin = reached > 0 ? r.timeSum / reached : null;
        delete r.timeSum;
        var topF = null;
        Object.keys(faceCount).forEach(function (k) { if (!topF || faceCount[k] > faceCount[topF]) topF = k; });
        r.facility = topF;
        r.withinShare = people ? r.within / people : 1;
        row[type] = r;
        c.people += people; c.within += r.within;
      });
      out.byNbhd.push(row);
    });

    TYPES.forEach(function (type) {
      var c = out.city[type];
      c.share = c.people ? c.within / c.people : 1;
      c.byCar.car.share = c.byCar.car.people ? c.byCar.car.within / c.byCar.car.people : 1;
      c.byCar.nocar.share = c.byCar.nocar.people ? c.byCar.nocar.within / c.byCar.nocar.people : 1;
      c.avgMin = c.timeN ? c.timeSum / c.timeN : 0;
      delete c.timeSum; delete c.timeN;
    });
    out.facilities = fac.map(function (f) {
      var isClosed = closed.indexOf(f.id) >= 0;
      return {
        id: f.id, type: f.type, name: f.name, at: f.at, capacity: effectiveCapacity(T, f), baseCapacity: f.capacity,
        boost: boostOf(T, f.id), open: !isClosed, turnedAway: 1 - admit[f.id],
        assigned: assigned[f.id], load: effectiveCapacity(T, f) ? assigned[f.id] / effectiveCapacity(T, f) : 0
      };
    });
    return out;
  }

  /** Credits to raise a facility by a fraction (0.5 = 50% more places). */
  function upgradeCost(data, id, boost) {
    var f = facilities(data).filter(function (x) { return x.id === id; })[0];
    return f ? Math.round(f.capacity * boost * (UPGRADE_COST[f.type] || 0)) : 0;
  }

  return {
    DEFAULTS: DEFAULTS, UPGRADE_COST: UPGRADE_COST, upgradeCost: upgradeCost, TYPES: TYPES, TYPE_LABEL: TYPE_LABEL,
    has: has, config: config, facilities: facilities, access: access, describeFacility: describeFacility
  };
});
