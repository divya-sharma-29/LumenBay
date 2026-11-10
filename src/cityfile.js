/*
 * City files: check a city specification before the simulator runs it.
 *
 * A city file is the same JSON structure as data/city.json. Only three parts are required
 * (neighbourhoods, roads, busLines); everything else (businesses, utilities, budget, model
 * assumptions, events, responses) falls back to the built-in city's values, and the result says so.
 *
 * validate(obj, defaults) -> { ok, errors: [text], warnings: [text], data: cleaned city or null }
 *
 * The checks are strict on purpose: a file from outside is untrusted, and a bad one must produce a
 * plain-English message, never a broken page.
 *
 * Works in the browser (window.CityFile) and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CityFile = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMITS = {
    fileBytes: 1000000, neighbourhoods: 30, roads: 80, busLines: 12, stopsPerLine: 20,
    agentsPerArea: 5000, agentsTotal: 6000, nameLength: 40, facilities: 40
  };
  var UNSAFE = { '__proto__': 1, 'constructor': 1, 'prototype': 1, 'hasOwnProperty': 1, 'toString': 1, 'valueOf': 1 };
  var ID = /^[A-Za-z0-9_-]{1,40}$/;
  var INCOME = ['low', 'middle', 'high'];
  var PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]{1,400}$/;

  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // Fill gaps from the defaults. Arrays and numbers from the file win outright; objects merge key by key.
  function merge(base, over) {
    if (!isObj(base) || !isObj(over)) return over === undefined ? clone(base) : clone(over);
    var out = {};
    Object.keys(base).forEach(function (k) { if (!UNSAFE[k]) out[k] = clone(base[k]); });
    Object.keys(over).forEach(function (k) {
      if (UNSAFE[k]) return;
      out[k] = own(base, k) && isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : clone(over[k]);
    });
    return out;
  }

  function validate(input, defaults) {
    var errors = [], warnings = [];
    function bad(msg) { errors.push(msg); }
    function warn(msg) { warnings.push(msg); }

    if (!isObj(input)) return { ok: false, errors: ['The file must contain one JSON object (the city), not a list or a single value.'], warnings: [], data: null };

    function str(o, k, where, max) {
      if (typeof o[k] !== 'string' || !o[k].trim()) { bad(where + ': "' + k + '" must be some text.'); return false; }
      if (o[k].length > (max || LIMITS.nameLength)) { bad(where + ': "' + k + '" is too long (limit ' + (max || LIMITS.nameLength) + ' characters).'); return false; }
      return true;
    }
    function num(o, k, where, lo, hi, loOpen) {
      var v = o[k];
      if (!isNum(v)) { bad(where + ': "' + k + '" must be a number.'); return false; }
      if (loOpen ? v <= lo : v < lo) { bad(where + ': "' + k + '" must be ' + (loOpen ? 'above ' : 'at least ') + lo + '.'); return false; }
      if (hi != null && v > hi) { bad(where + ': "' + k + '" must be at most ' + hi + '.'); return false; }
      return true;
    }
    function idOf(o, where, seen) {
      if (typeof o.id !== 'string' || !ID.test(o.id) || UNSAFE[o.id]) {
        bad(where + ': "id" must be 1 to 40 letters, digits, "-" or "_" (and not a reserved word).'); return null;
      }
      if (seen[o.id]) { bad(where + ': the id "' + o.id + '" is used twice.'); return null; }
      seen[o.id] = true; return o.id;
    }

    var name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, LIMITS.nameLength) : null;
    if (!name) bad('The city needs a "name" (some text).');

    // ---- neighbourhoods
    var nb = input.neighbourhoods, nbIds = {}, totalAgents = 0;
    if (!Array.isArray(nb) || nb.length < 2) bad('"neighbourhoods" must be a list of at least 2 areas.');
    else if (nb.length > LIMITS.neighbourhoods) bad('At most ' + LIMITS.neighbourhoods + ' neighbourhoods are supported (this file has ' + nb.length + ').');
    else nb.forEach(function (n, i) {
      var where = 'Neighbourhood ' + (i + 1);
      if (!isObj(n)) { bad(where + ' must be an object.'); return; }
      var id = idOf(n, where, nbIds); if (id) where = 'Neighbourhood "' + id + '"';
      str(n, 'name', where);
      num(n, 'x', where, 0, 100); num(n, 'y', where, 0, 100);
      if (num(n, 'agents', where, 1, LIMITS.agentsPerArea)) totalAgents += n.agents;
      num(n, 'jobs', where, 0); num(n, 'shops', where, 0);
      num(n, 'carOwnership', where, 0, 1); num(n, 'basePowerMW', where, 0);
      if (INCOME.indexOf(n.income) < 0) bad(where + ': "income" must be one of ' + INCOME.join(', ') + '.');
      if (n.floodRisk != null) num(n, 'floodRisk', where, 0, 1);
      if (n.type != null && typeof n.type !== 'string') bad(where + ': "type" must be text.');
      var m = n.sectorMix;
      if (!isObj(m)) bad(where + ': "sectorMix" must have retail, office and industry shares.');
      else {
        var sum = 0, okm = true;
        ['retail', 'office', 'industry'].forEach(function (k) { if (!num(m, k, where + ' sectorMix', 0, 1)) okm = false; else sum += m[k]; });
        if (okm && (sum < 0.99 || sum > 1.01)) bad(where + ': the sectorMix shares must add up to 1 (they add up to ' + sum.toFixed(2) + ').');
      }
    });
    if (totalAgents > LIMITS.agentsTotal) bad('Too many simulated residents: ' + totalAgents + ' agents in total, the limit is ' + LIMITS.agentsTotal + ' (the page would be too slow).');
    if (nb && Array.isArray(nb) && nb.length >= 2 && nb.length <= LIMITS.neighbourhoods && !nb.some(function (n) { return isObj(n) && isNum(n.jobs) && n.jobs > 0; })) bad('At least one neighbourhood needs jobs above 0.');

    // ---- roads
    var rd = input.roads, rdIds = {}, edge = {};
    if (!Array.isArray(rd) || rd.length < 1) bad('"roads" must be a list with at least 1 road.');
    else if (rd.length > LIMITS.roads) bad('At most ' + LIMITS.roads + ' roads are supported (this file has ' + rd.length + ').');
    else rd.forEach(function (r, i) {
      var where = 'Road ' + (i + 1);
      if (!isObj(r)) { bad(where + ' must be an object.'); return; }
      var id = idOf(r, where, rdIds); if (id) where = 'Road "' + id + '"';
      str(r, 'name', where);
      var okEnds = true;
      ['from', 'to'].forEach(function (k) { if (typeof r[k] !== 'string' || !own(nbIds, r[k])) { bad(where + ': "' + k + '" must be the id of a neighbourhood in this file.'); okEnds = false; } });
      if (okEnds && r.from === r.to) bad(where + ': "from" and "to" are the same place.');
      else if (okEnds) { edge[r.from + '|' + r.to] = true; edge[r.to + '|' + r.from] = true; }
      num(r, 'km', where, 0, 100, true); num(r, 'freeFlowMin', where, 0, 240, true); num(r, 'capacity', where, 0, 20000, true);
      ['bridge', 'floodProne'].forEach(function (k) { if (r[k] != null && typeof r[k] !== 'boolean') bad(where + ': "' + k + '" must be true or false.'); });
    });

    // ---- bus lines
    var bl = input.busLines, blIds = {};
    if (!Array.isArray(bl) || bl.length < 1) bad('"busLines" must be a list with at least 1 bus line.');
    else if (bl.length > LIMITS.busLines) bad('At most ' + LIMITS.busLines + ' bus lines are supported (this file has ' + bl.length + ').');
    else bl.forEach(function (l, i) {
      var where = 'Bus line ' + (i + 1);
      if (!isObj(l)) { bad(where + ' must be an object.'); return; }
      var id = idOf(l, where, blIds); if (id) where = 'Bus line "' + id + '"';
      str(l, 'name', where);
      num(l, 'headwayMin', where, 0, 120, true); num(l, 'buses', where, 1, 500);
      num(l, 'capacityPerBus', where, 1, 300); num(l, 'fare', where, 0, 50);
      if (!Array.isArray(l.stops) || l.stops.length < 2 || l.stops.length > LIMITS.stopsPerLine) { bad(where + ': "stops" must list 2 to ' + LIMITS.stopsPerLine + ' neighbourhood ids.'); return; }
      var stopsOk = true;
      l.stops.forEach(function (s) { if (typeof s !== 'string' || !own(nbIds, s)) { bad(where + ': the stop "' + String(s).slice(0, 30) + '" is not a neighbourhood in this file.'); stopsOk = false; } });
      if (stopsOk) for (var k = 0; k < l.stops.length - 1; k++) {
        if (l.stops[k] === l.stops[k + 1]) bad(where + ': the same stop "' + l.stops[k] + '" appears twice in a row.');
        else if (!edge[l.stops[k] + '|' + l.stops[k + 1]]) bad(where + ': there is no road directly between "' + l.stops[k] + '" and "' + l.stops[k + 1] + '", so buses cannot go from one to the next.');
      }
    });

    // ---- optional map decoration
    var map = null;
    if (input.map != null) {
      if (!isObj(input.map)) bad('"map" must be an object.');
      else if (input.map.river != null) {
        var rv = input.map.river, w = '"map.river"';
        if (!isObj(rv)) bad(w + ' must be an object.');
        else if (typeof rv.path !== 'string' || !PATH.test(rv.path)) bad(w + ': "path" must be an SVG path (letters, numbers, spaces and commas only, up to 400 characters).');
        else {
          map = { river: { path: rv.path, label: typeof rv.label === 'string' ? rv.label.slice(0, 20) : '' } };
          ['labelX', 'labelY', 'bandX0', 'bandX1', 'bandY0', 'bandY1'].forEach(function (k) { if (rv[k] != null) { if (num(rv, k, w, 0, 100)) map.river[k] = rv[k]; } });
        }
      }
    }

    // ---- optional hospitals and schools (a city without them simply has no service-access section)
    var services = null;
    if (input.services != null) {
      var sv = input.services, sw = '"services"';
      if (!isObj(sv)) bad(sw + ' must be an object.');
      else {
        var cfgS = { facilities: [] };
        if (typeof sv.note === 'string') cfgS.note = sv.note.slice(0, 600);
        [['hospitalMaxMin', 1, 240], ['schoolMaxMin', 1, 240], ['healthNeedShare', 0, 1], ['schoolAgeShare', 0, 1], ['overloadTolerance', 1, 5]].forEach(function (k) {
          if (sv[k[0]] != null && num(sv, k[0], sw, k[1], k[2])) cfgS[k[0]] = sv[k[0]];
        });
        if (!Array.isArray(sv.facilities) || sv.facilities.length < 1 || sv.facilities.length > LIMITS.facilities) bad(sw + ': "facilities" must be a list of 1 to ' + LIMITS.facilities + ' hospitals or schools.');
        else {
          var fIds = {};
          sv.facilities.forEach(function (f, i) {
            var fw = 'Facility ' + (i + 1);
            if (!isObj(f)) { bad(fw + ' must be an object.'); return; }
            var fid = idOf(f, fw, fIds); if (fid) fw = 'Facility "' + fid + '"';
            str(f, 'name', fw);
            if (f.type !== 'hospital' && f.type !== 'school') bad(fw + ': "type" must be hospital or school.');
            if (typeof f.at !== 'string' || !own(nbIds, f.at)) bad(fw + ': "at" must be the id of a neighbourhood in this file.');
            num(f, 'capacity', fw, 0, 1e7, true);
            if (fid && f.type && typeof f.name === 'string' && typeof f.at === 'string') cfgS.facilities.push({ id: f.id, type: f.type, name: f.name.trim().slice(0, 60), at: f.at, capacity: f.capacity });
          });
        }
        services = cfgS;
      }
    }

    if (errors.length) return { ok: false, errors: errors, warnings: warnings, data: null };

    // ---- everything else: defaults for whatever is missing
    var base = isObj(defaults) ? defaults : {};
    var used = [];
    var out = {
      name: name, note: typeof input.note === 'string' ? input.note.slice(0, 600) : '',
      neighbourhoods: input.neighbourhoods.map(function (n) {
        return { id: n.id, name: n.name.trim(), type: typeof n.type === 'string' ? n.type : 'mixed', x: n.x, y: n.y, agents: Math.round(n.agents),
          jobs: n.jobs, shops: n.shops, income: n.income, carOwnership: n.carOwnership, floodRisk: n.floodRisk == null ? 0 : n.floodRisk,
          basePowerMW: n.basePowerMW, sectorMix: { retail: n.sectorMix.retail, office: n.sectorMix.office, industry: n.sectorMix.industry } };
      }),
      roads: input.roads.map(function (r) {
        return { id: r.id, name: r.name.trim(), from: r.from, to: r.to, km: r.km, freeFlowMin: r.freeFlowMin, capacity: r.capacity, bridge: !!r.bridge, floodProne: !!r.floodProne };
      }),
      busLines: input.busLines.map(function (l) {
        return { id: l.id, name: l.name.trim(), stops: l.stops.slice(), headwayMin: l.headwayMin, buses: Math.round(l.buses), capacityPerBus: l.capacityPerBus, fare: l.fare };
      })
    };
    ['businesses', 'utilities', 'budget', 'assumptions'].forEach(function (k) {
      if (input[k] != null && !isObj(input[k])) { warn('"' + k + '" is not an object, so the built-in values are used.'); out[k] = clone(base[k]); used.push(k); }
      else if (input[k] == null) { out[k] = clone(base[k]); used.push(k); }
      else out[k] = merge(base[k] || {}, input[k]);
    });
    ['events', 'responses'].forEach(function (k) {
      if (Array.isArray(input[k]) && input[k].length && input[k].every(function (x) { return isObj(x) && typeof x.id === 'string' && ID.test(x.id) && !UNSAFE[x.id]; })) out[k] = clone(input[k]);
      else { if (input[k] != null) warn('"' + k + '" was not a valid list, so the built-in ones are used.'); out[k] = clone(base[k] || []); used.push(k); }
    });
    if (used.length) warn('Not in the file, so the built-in city\'s values are used for: ' + used.join(', ') + '.');
    if (used.indexOf('utilities') >= 0) warn('The built-in power and water supply were sized for Lumen Bay, so they may be far too big or too small for this city.');
    if (used.indexOf('budget') >= 0) warn('The built-in budget was sized for Lumen Bay, so the city may start with a large surplus or deficit.');
    if (map) out.map = map;
    if (services) out.services = services;

    // Sanity checks on numbers the model divides by.
    var chk = function (v, label, lo) { if (!isNum(v) || v <= lo) { bad(label + ' must be a number above ' + lo + '.'); } };
    chk(out.utilities && out.utilities.power && out.utilities.power.supplyCapacityMW, 'utilities.power.supplyCapacityMW', 0);
    chk(out.utilities && out.utilities.water && out.utilities.water.supplyCapacityML, 'utilities.water.supplyCapacityML', 0);
    chk(out.budget && out.budget.baseServicesCostPerDay, 'budget.baseServicesCostPerDay', -1);
    chk(out.assumptions && out.assumptions.agentRepresentsResidents, 'assumptions.agentRepresentsResidents', 0);
    chk(out.assumptions && out.assumptions.msaIterations, 'assumptions.msaIterations', 0);
    if (out.assumptions && isNum(out.assumptions.msaIterations) && out.assumptions.msaIterations > 100) bad('assumptions.msaIterations is at most 100.');
    if (errors.length) return { ok: false, errors: errors, warnings: warnings, data: null };

    // Disconnected cities are allowed but worth a warning: some people will have no route at all.
    var comp = {}, ids = out.neighbourhoods.map(function (n) { return n.id; });
    ids.forEach(function (id) { comp[id] = id; });
    function find(a) { while (comp[a] !== a) a = comp[a]; return a; }
    out.roads.forEach(function (r) { comp[find(r.from)] = find(r.to); });
    var groups = {}; ids.forEach(function (id) { groups[find(id)] = 1; });
    if (Object.keys(groups).length > 1) warn('The roads do not connect every neighbourhood, so some residents will have no route to work at all.');

    return { ok: true, errors: [], warnings: warnings, data: out };
  }

  /** Read JSON text from a file or storage safely. */
  function parse(text) {
    if (typeof text !== 'string') return { ok: false, errors: ['No file contents were read.'], warnings: [], data: null };
    if (text.length > LIMITS.fileBytes) return { ok: false, errors: ['The file is larger than ' + Math.round(LIMITS.fileBytes / 1000) + ' KB, which is far more than a city needs.'], warnings: [], data: null };
    try { return { ok: true, value: JSON.parse(text.replace(/^﻿/, '')) }; }
    catch (e) { return { ok: false, errors: ['The file is not valid JSON (' + String(e.message).slice(0, 80) + ').'], warnings: [], data: null }; }
  }

  return { LIMITS: LIMITS, validate: validate, parse: parse };
});
