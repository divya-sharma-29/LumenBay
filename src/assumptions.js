/*
 * Every number the model relies on, in plain words (Day 1 honesty rule: "keep every assumption in
 * one visible table").
 *
 * groups(data, effective) -> [{ title, rows: [{ key, label, value, note, from }] }]
 *   `effective` is the settings the model really runs with (the city file's assumptions plus the
 *   built-in defaults for anything the file leaves out); `from` says which of the two a row came from.
 *
 * Nothing is hidden: any assumption in the city file that this module has no plain-English wording
 * for is still listed, under its own name. Text only; the page escapes it before showing it.
 *
 * Works in the browser (window.Assumptions) and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Assumptions = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function num(v) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    var n = Number(v.toPrecision(6));
    return Math.abs(n) >= 1000 ? n.toLocaleString('en-US') : String(n);   // 180,000 not 180000
  }
  function pct(v) { return typeof v === 'number' && isFinite(v) ? num(v * 100) + '%' : String(v); }
  function times(v) { return typeof v === 'number' && isFinite(v) ? '×' + num(v) : String(v); }
  function flat(v, f) {
    if (isObj(v)) return Object.keys(v).map(function (k) { return k + ' ' + flat(v[k], f); }).join(' · ');
    if (Array.isArray(v)) return v.map(function (x) { return flat(x, f); }).join(', ');
    return f ? f(v) : (typeof v === 'number' ? num(v) : String(v));
  }

  // [key, label, note, format]. The order here is the order on the page.
  var TRAVEL = [
    ['seed', 'Random seed', 'Decides which homes, jobs and cars the pretend residents get. Another seed is another possible city; “Check across 10 cities” tries several.'],
    ['agentRepresentsResidents', 'Residents per simulated person', 'Each simulated person stands for this many real residents.'],
    ['peakHourShare', 'Share of commuters in the peak hour', 'How much of the commuting lands in the busiest hour, which sets how many vehicles are on the roads.', pct],
    ['carOccupancy', 'People per car', 'More people per car means fewer cars for the same number of commuters.'],
    ['busPcu', 'Road space a bus takes', 'Counted in “car equivalents”, because a bus slows traffic more than one car does.'],
    ['congestionFormula', 'How traffic slows a road', 'The standard curve: a road is quick until it nears capacity, then slows sharply.'],
    ['bprAlpha', 'Traffic curve: strength', 'Part of the formula above.'],
    ['bprBeta', 'Traffic curve: sharpness', 'Part of the formula above. A higher number means a sharper jam once a road is full.'],
    ['msaIterations', 'Rounds of the traffic solver', 'Choices depend on travel times and travel times depend on choices, so the model repeats this many rounds until they agree.'],
    ['modeChoice', 'How people choose car, bus or walk', 'Each option gets a cost in minutes (time, waiting, money converted to minutes); cheaper options are likelier, not certain.'],
    ['logitScaleMin', 'How sharply people choose', 'In minutes. A smaller number means nearly everyone takes the cheapest option; a larger one gives a more mixed city.'],
    ['valueOfTimeCreditsPerMin', 'Value of a minute of travel', 'In credits. Turns money into minutes for choices, and travel time into a cost for the city.'],
    ['incomeVotMultiplier', 'How much each income group values time', 'Higher-income residents will pay more to save a minute.', times],
    ['carCostPerKm', 'Driving cost per km', 'Fuel and wear, in credits.'],
    ['parking', 'Parking cost per trip', 'In credits, by area. The business district costs most.'],
    ['busWaitPenaltyMultiplier', 'How bad waiting for a bus feels', 'A minute waiting counts as this many minutes on the move.', times],
    ['busAccessMin', 'Walk to and from a bus stop', 'Minutes added to every bus trip.'],
    ['busTransferMin', 'Time lost per bus change', 'Minutes added each time a trip needs a second bus.'],
    ['carComfortBonusMin', 'Extra appeal of driving', 'Minutes of “comfort” credited to driving. 0 means none.'],
    ['busDisutilityMin', 'Hassle of taking a bus', 'A fixed number of minutes added to every bus trip, for the inconvenience.'],
    ['busSpeedFactorVsCar', 'Bus speed compared with a car', 'On the same road, buses move at this share of car speed.', pct],
    ['busCrowdingStart', 'When a bus starts to feel crowded', 'As a share of its capacity.', pct],
    ['busCrowdingMinPerUnit', 'Crowding penalty', 'Minutes added for every 100% of its capacity a bus is loaded beyond the level above.'],
    ['busCrowdingMaxMin', 'Most a crowded bus can add', 'The cap on the crowding penalty, in minutes.'],
    ['walkSpeedKmh', 'Walking speed', 'Kilometres per hour.'],
    ['maxWalkKm', 'Longest walk to work', 'Beyond this distance walking is not an option.'],
    ['heatwaveWalkPenaltyMultiplier', 'How much a heatwave hurts walking', 'Walking feels this many times longer in a heatwave.', times],
    ['intraZoneKm', 'Trips inside one area: distance', 'Kilometres, for people who live and work in the same area.'],
    ['intraZoneCarMin', 'Trips inside one area: time by car', 'Minutes.'],
    ['jobDistanceDecayMin', 'How far people look for a job', 'In minutes. Nearer jobs are likelier; this sets how quickly that fades with travel time.']
  ];
  var ECONOMY = [
    ['latenessToleranceMin', 'Grace before lateness counts', 'Workers plan around their usual commute. Minutes beyond usual, plus this grace, count as late.'],
    ['tripsPerWorkerDay', 'Work trips per worker per day', 'There and back.'],
    ['strandedProductivity', 'Output of workers who cannot reach work', 'They can only partly work from home.', pct],
    ['shopTripsPerResidentDay', 'Shopping trips per resident per day', 'Sets how many shop visits there are to lose.'],
    ['shopDecayMin', 'How far people go to shop', 'In minutes. Closer, bigger shops win; this sets how quickly that fades with travel time.'],
    ['shopVisitDropPerExtraTripMin', 'Shop visits lost per extra minute', 'Every extra minute of travel cuts visits by this share.', pct],
    ['presenceLoadShare', 'Share of power use that follows who is at work', 'The rest is steady, whoever is where.', pct],
    ['signalCapacityLossPerShortfall', 'Road capacity lost to blackouts', 'Blackouts switch off traffic signals. If all power were missing, roads would lose this share of capacity; less is lost when only part is.', pct]
  ];

  var BUDGET = {
    dailyReserve: ['Starting reserve', 'The city’s savings at the start, in credits.'],
    businessTaxRate: ['Business tax rate', 'Share of business output the city collects.', pct],
    incomeTaxPerWorkerDay: ['Income tax per working resident', 'Credits per day.'],
    busCostPerBusHour: ['Cost of running one bus for an hour', 'Credits. Running fewer buses saves this.'],
    busHoursPerDay: ['Hours buses run per day', ''],
    baseServicesCostPerDay: ['Other city services', 'Credits per day the city spends outside transport.'],
    roadRepairCostPerDamagedEdge: ['Repair bill per flooded road', 'One-off, credits.'],
    emergencySpendingLimit: ['Default emergency budget', 'The starting value of the “Emergency budget” slider.'],
    austerity: ['Austerity rule', 'When the reserve runs out, bus service is cut a step each day (down to the floor) and restored once the reserve recovers.']
  };
  var POWER = {
    supplyCapacityMW: ['Power supply', 'Megawatts available.'],
    heatwaveDemandMultiplier: ['Power demand in a heatwave', 'Air conditioning.', times],
    peakHourMultiplier: ['Power demand at the peak hour', 'Compared with an average hour.', times]
  };
  var WATER = {
    supplyCapacityML: ['Water supply', 'Megalitres per day.'],
    baseDemandMLPer1000Residents: ['Water use per 1,000 residents', 'Megalitres per day.'],
    floodSupplyReduction: ['Water lost in a flood', 'Share of supply the flood takes out.', pct],
    heatwaveDemandMultiplier: ['Water demand in a heatwave', '', times]
  };
  var SECTORS = {
    revenuePerVisit: ['revenue per visit', 'credits'],
    revenuePerWorkerDay: ['revenue per worker per day', 'credits'],
    productivityLossPerLateMin: ['output lost per late minute', '', pct],
    powerSensitivity: ['how much a blackout hurts', 'a share of output lost per share of power missing'],
    waterSensitivity: ['how much rationing hurts', 'a share of output lost per share of water missing']
  };

  function humanise(key) {
    return String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); });
  }

  // Rows for a flat block of values, in the given order, then anything the wording list does not know.
  function rowsFor(block, spec, prefix, fileBlock) {
    var rows = [], seen = {};
    function from(k) { return fileBlock && own(fileBlock, k) ? 'city file' : 'built-in default'; }
    spec.forEach(function (s) {
      if (!own(block, s[0])) return;
      seen[s[0]] = 1;
      rows.push({ key: (prefix || '') + s[0], label: s[1], value: flat(block[s[0]], s[3]), note: s[2] || '', from: from(s[0]) });
    });
    Object.keys(block).forEach(function (k) {
      if (seen[k]) return;
      rows.push({ key: (prefix || '') + k, label: humanise(k), value: flat(block[k]), note: 'Set in the city file.', from: from(k) });
    });
    return rows;
  }
  function rowsFromMap(block, map, prefix, group) {
    var rows = [];
    Object.keys(block).forEach(function (k) {
      var m = own(map, k) ? map[k] : null, v = block[k];
      if (k === 'austerity' && isObj(v)) {
        v = (v.enabled ? 'on' : 'off') + ' · cuts ' + pct(v.stepPerDay) + ' a day · floor ' + pct(v.minService) + ' · restores above ' + num(v.restoreAbove);
        rows.push({ key: prefix + k, label: m[0], value: v, note: m[1] });
        return;
      }
      rows.push({ key: prefix + k, label: (group ? group + ': ' : '') + (m ? m[0] : humanise(k)), value: flat(v, m && m[2]), note: m ? m[1] : 'Set in the city file.' });
    });
    return rows;
  }

  function groups(data, effective) {
    var out = [];
    var fileA = isObj(data.assumptions) ? data.assumptions : {};
    var A = isObj(effective) ? effective : fileA;
    var travelKeys = TRAVEL.map(function (r) { return r[0]; });
    var econKeys = ECONOMY.map(function (r) { return r[0]; });
    var travelBlock = {}, econBlock = {};
    Object.keys(A).forEach(function (k) { (econKeys.indexOf(k) >= 0 ? econBlock : travelBlock)[k] = A[k]; });
    out.push({ title: 'How people travel and how roads behave', rows: rowsFor(travelBlock, TRAVEL, 'assumptions.', fileA) });
    out.push({ title: 'Work and shopping', rows: rowsFor(econBlock, ECONOMY, 'assumptions.', fileA) });

    var money = [];
    if (isObj(data.budget)) money = money.concat(rowsFromMap(data.budget, BUDGET, 'budget.', ''));
    if (isObj(data.utilities)) {
      if (isObj(data.utilities.power)) money = money.concat(rowsFromMap(data.utilities.power, POWER, 'utilities.power.', ''));
      if (isObj(data.utilities.water)) money = money.concat(rowsFromMap(data.utilities.water, WATER, 'utilities.water.', ''));
    }
    out.push({ title: 'Money, power and water', rows: money });

    var sec = [], biz = Array.isArray(data.businesses) ? data.businesses[0] : data.businesses;
    if (isObj(biz)) Object.keys(biz).forEach(function (name) {
      if (!isObj(biz[name])) return;
      Object.keys(biz[name]).forEach(function (k) {
        var m = own(SECTORS, k) ? SECTORS[k] : null, v = biz[name][k];
        sec.push({ key: 'businesses.' + name + '.' + k, label: humanise(name) + ': ' + (m ? m[0] : humanise(k)),
          value: flat(v, m && m[2]), note: m ? m[1] : 'Set in the city file.' });
      });
    });
    out.push({ title: 'Businesses', rows: sec });

    var svc = [];
    if (isObj(data.services) && Array.isArray(data.services.facilities)) {
      var sv = data.services;
      [['hospitalMaxMin', 'Longest acceptable trip to a hospital', 'Minutes. A resident has access if they can get to the nearest open hospital within this time in the morning peak.'],
       ['schoolMaxMin', 'Longest acceptable trip to a school', 'Minutes. The same test for schools.'],
       ['healthNeedShare', 'Residents who regularly need a hospital', 'Planning share used by the model.', pct],
       ['schoolAgeShare', 'Residents who attend school', 'Planning share used by the model.', pct]].forEach(function (r) {
        if (own(sv, r[0])) svc.push({ key: 'services.' + r[0], label: r[1], value: flat(sv[r[0]], r[3]), note: r[2] });
      });
      svc.push({ key: 'services.overloadTolerance', label: 'How full a hospital or school can get',
        value: pct(own(sv, 'overloadTolerance') ? sv.overloadTolerance : 1.15),
        note: 'Share of its places a building can take on. Residents beyond this are turned away and count as without access. Raising capacity (a policy on the City tab) lifts the limit.',
        from: own(sv, 'overloadTolerance') ? 'city file' : 'built-in default' });
      svc.push({ key: 'services.upgradeCost', label: 'Cost to add one place', value: 'Hospital 22 credits, school 14 credits',
        note: 'Made-up round numbers, paid once from the public budget when a capacity upgrade is part of the scenario.', from: 'built-in default' });
      sv.facilities.forEach(function (f) {
        if (!isObj(f)) return;
        svc.push({ key: 'services.facilities.' + f.id, label: String(f.name || f.id), value: String(f.type) + ' in ' + String(f.at), note: 'Can serve about ' + num(f.capacity) + ' residents. Load above 100% means queues.' });
      });
    }
    out.push({ title: 'Hospitals and schools', rows: svc });

    var ev = [];
    (Array.isArray(data.events) ? data.events : []).forEach(function (e) {
      if (!isObj(e)) return;
      var params = isObj(e.params) ? Object.keys(e.params).map(function (k) { return humanise(k).toLowerCase() + ' ' + flat(e.params[k]); }).join(' · ') : '';
      ev.push({ key: 'events.' + e.id, label: String(e.name || e.id),
        value: e.durationDays == null ? 'stays in force' : e.durationDays + ' days', note: params });
    });
    out.push({ title: 'Events: how long they last, how strong they are', rows: ev });
    return out.filter(function (g) { return g.rows.length; });
  }

  return { groups: groups, humanise: humanise };
});
