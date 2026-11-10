/*
 * Lumen Bay event engine (Day 4)
 *
 * An event is a change to the city that the model then plays out: it edits the
 * scenario (roads closed, bus service, flood and heatwave flags) and the
 * transport, economy and budget models do the rest. Events can be combined,
 * and each kind ends on its own after a set number of days (see durationDays
 * in data/city.json). Bus cuts are policy changes, so they do not end.
 *
 * Works in the browser (window.Events) and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Events = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** How many days each kind of event lasts, from the city data. */
  function defaultDurations(data) {
    var d = {};
    (data.events || []).forEach(function (e) {
      if (e.durationDays == null) return;
      if (e.id === 'bridge_close') d.closures = e.durationDays;
      else d[e.id] = e.durationDays;
    });
    return d;
  }

  /** The unchanged city: nothing closed, full bus service, no responses. */
  function base(data) {
    var bf = {};
    data.busLines.forEach(function (l) { bf[l.id] = 1; });
    return {
      closedRoads: [], busFrequency: bf, heatwave: false, flood: false, strike: false,
      durations: defaultDurations(data), responses: [], closedServices: [], newRoutes: [], serviceBoost: {}
    };
  }

  function eventData(data, id) {
    return (data.events || []).filter(function (e) { return e.id === id; })[0] || { params: {} };
  }

  /** Return a copy of the scenario with one more event applied. */
  function add(data, scenario, id, params) {
    var s = clone(scenario), p = Object.assign({}, eventData(data, id).params, params || {});
    if (id === 'bus_cut') {
      data.busLines.forEach(function (l) {
        var b = s.busFrequency[l.id] == null ? 1 : s.busFrequency[l.id];
        s.busFrequency[l.id] = b * (1 - p.cutFraction);
      });
    } else if (id === 'bridge_close' || id === 'road_close') {
      if (s.closedRoads.indexOf(p.roadId) < 0) s.closedRoads.push(p.roadId);
    } else if (id === 'flood') s.flood = true;
    else if (id === 'heatwave') s.heatwave = true;
    else if (id === 'strike') s.strike = true;
    else if (id === 'service_close') {
      var sv = ((data.services && data.services.facilities) || []).filter(function (f) { return f.id === p.serviceId; })[0];
      if (!sv) throw new Error('Unknown service: ' + p.serviceId);
      s.closedServices = s.closedServices || [];
      if (s.closedServices.indexOf(sv.id) < 0) s.closedServices.push(sv.id);
    }
    else throw new Error('Unknown event: ' + id);
    return s;
  }

  /** Build a scenario from a list of {id, params}. */
  function build(data, list) {
    var s = base(data);
    (list || []).forEach(function (e) { s = add(data, s, e.id, e.params); });
    return s;
  }

  /**
   * A judge's surprise: one or two events at random (any road can close, bus
   * cuts of 20-60%). Pass a seeded rng to repeat a surprise.
   */
  function random(data, rng) {
    rng = rng || Math.random;
    var kinds = ['bus_cut', 'bridge_close', 'flood', 'heatwave', 'strike'];
    var count = rng() < 0.4 ? 2 : 1, chosen = [];
    while (chosen.length < count) {
      var k = kinds[Math.floor(rng() * kinds.length)];
      if (chosen.indexOf(k) < 0) chosen.push(k);
    }
    return chosen.map(function (k) {
      if (k === 'bus_cut') return { id: k, params: { cutFraction: Math.round((0.2 + rng() * 0.4) * 20) / 20 } };
      if (k === 'bridge_close') {
        var road = data.roads[Math.floor(rng() * data.roads.length)];
        return { id: k, params: { roadId: road.id } };
      }
      return { id: k, params: {} };
    });
  }

  function describeEvents(data, scenario) {
    var parts = [], name = {};
    data.roads.forEach(function (r) { name[r.id] = r.name; });
    var D = scenario.durations || {};
    function lasts(k) { return D[k] != null ? ' for ' + D[k] + ' days' : ''; }
    if (scenario.closedRoads && scenario.closedRoads.length) {
      parts.push(scenario.closedRoads.map(function (id) { return name[id]; }).join(' and ') + ' closed' + lasts('closures'));
    }
    if (scenario.flood) parts.push('river flood' + lasts('flood'));
    if (scenario.heatwave) parts.push('heatwave' + lasts('heatwave'));
    if (scenario.strike) parts.push('transit strike' + lasts('strike'));
    return parts.join(', ');
  }

  function describePolicies(data, scenario) {
    var parts = [];
    if (scenario.closedServices && scenario.closedServices.length) {
      var sn = {};
      ((data.services && data.services.facilities) || []).forEach(function (f) { sn[f.id] = f.name; });
      parts.push(scenario.closedServices.map(function (id) { return sn[id] || id; }).join(' and ') + ' out of action');
    }
    var sb = scenario.serviceBoost || {}, sbIds = Object.keys(sb).filter(function (k) { return sb[k] > 0; });
    if (sbIds.length) {
      var bn = {};
      ((data.services && data.services.facilities) || []).forEach(function (f) { bn[f.id] = f.name; });
      parts.push(sbIds.map(function (id) { return (bn[id] || id) + ' +' + Math.round(sb[id] * 100) + '% places'; }).join(' and '));
    }
    if (scenario.newRoutes && scenario.newRoutes.length) {
      var nn = {};
      data.neighbourhoods.forEach(function (n) { nn[n.id] = n.name; });
      parts.push(scenario.newRoutes.map(function (r) { return 'new bus route ' + (nn[r.from] || r.from) + ' to ' + (nn[r.to] || r.to); }).join(' and '));
    }
    var cuts = data.busLines.map(function (l) { return scenario.busFrequency && scenario.busFrequency[l.id] != null ? scenario.busFrequency[l.id] : 1; });
    var lo = Math.min.apply(null, cuts), hi = Math.max.apply(null, cuts);
    if (hi < 0.999 || lo > 1.001 || hi - lo > 0.001) {
      parts.push(hi - lo < 0.001 ? 'bus service at ' + Math.round(lo * 100) + '% of normal' : 'uneven bus service');
    }
    return parts.join(', ');
  }

  /** Plain-English description of everything changed in a scenario. */
  function describe(data, scenario) {
    var parts = [describeEvents(data, scenario), describePolicies(data, scenario)].filter(Boolean);
    return parts.length ? parts.join(', ') : 'normal city';
  }

  return {
    mulberry32: mulberry32, defaultDurations: defaultDurations, base: base, add: add,
    build: build, random: random, describe: describe,
    describeEvents: describeEvents, describePolicies: describePolicies
  };
});
