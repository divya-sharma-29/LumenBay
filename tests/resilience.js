'use strict';
var assert = require('assert');
var Resilience = require('../src/resilience.js');
var data = { budget: { dailyReserve: 100 } };
function city(commute, revenue, power, water, none, hospital) {
  return {
    summary: { commute: commute, shares: { none: none } },
    econ: { totals: { revenue: revenue }, power: { shortfall: power }, water: { shortfall: water } },
    hospital: hospital
  };
}
var baseline = city(10, 1000, 0, 0, 0, { share: 1 });
var same = Resilience.evaluate(data, baseline, baseline,
  { city: { hospital: { share: 1 } }, reference: { hospital: { share: 1 } } },
  { worseShare: 0 }, { minReserve: 100 });
assert.strictEqual(same.score, 100, 'unchanged baseline scores 100');
var impacted = city(20, 500, 0.2, 0.1, 0.1, { share: 0.5 });
var lower = Resilience.evaluate(data, impacted, baseline,
  { city: { hospital: { share: 0.5 } }, reference: { hospital: { share: 1 } } },
  { worseShare: 0.25 }, { minReserve: -100 });
assert(lower.score < same.score, 'worse modeled outcomes lower resilience');
assert(lower.dimensions.every(function (d) { return d.value >= 0 && d.value <= 100; }), 'dimensions are normalized');
console.log('resilience: baseline, impact, and normalization passed');
