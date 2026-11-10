// Sensitivity analysis (Day 12): push the model's own assumptions down and up and see whether the advice changes.
const assert = require('assert');
const Sim = require('../src/sim');
const Economy = require('../src/economy');
const Events = require('../src/events');
const Responses = require('../src/responses');
const U = require('../src/uncertainty');
const data = require('../data/city.json');

const cfg = Sim.config(data);
const ev = Events.build(data, [{ id: 'bridge_close', params: { roadId: 'e3' } }]);
const OPTS = [['shuttle', 'remote_work', 'add_buses'], ['shuttle']];
const before = JSON.stringify(data);
const r = U.finish(U.sensitivity(data, ev, OPTS, cfg, { enabled: true }));
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; } }

test('every rule is tested both ways, plus the base city', () => {
  assert.strictEqual(r.variations.length, 2 * U.FACTORS.length);
  U.FACTORS.forEach((f) => ['low', 'high'].forEach((s) => assert(r.variations.some((v) => v.id === f.id && v.setting === s), f.id + ' ' + s)));
  assert.strictEqual(r.options.length, 3); assert.strictEqual(r.options[0].name, 'Do nothing');
});
test('the base row is exactly what the ordinary comparison gives', () => {
  const agents = Sim.generateAgents(data, cfg), normal = Economy.normalCity(data, agents, cfg);
  const eventCity = Economy.runCity(data, agents, Economy.effective(data, ev, 1, 1), normal, cfg);
  r.options.forEach((o, i) => {
    const row = Responses.evaluate(data, agents, ev, o.ids, normal, cfg, eventCity, { enabled: true });
    assert(Math.abs(row.harm.total - r.base.harms[i]) < 1e-6, o.name);
  });
});
test('the city data is left untouched by the testing', () => { assert.strictEqual(JSON.stringify(data), before); });
test('every number is finite and doing nothing always costs something', () => {
  [r.base].concat(r.variations).forEach((v) => { v.harms.forEach((h) => assert(isFinite(h))); assert(v.harms[0] > 0, v.label); });
});
test('the rules matter in the direction you would expect', () => {
  const get = (id, s) => r.variations.find((v) => v.id === id && v.setting === s).harms[0];
  assert(get('demand', 'high') > r.base.harms[0] && get('demand', 'low') < r.base.harms[0], 'more rush-hour trips, more harm');
  assert(get('roadcap', 'low') > r.base.harms[0] && get('roadcap', 'high') < r.base.harms[0], 'smaller roads, more harm');
  assert(get('cars', 'high') < r.base.harms[0], 'more cars: fewer people stranded on the bus network, less harm here');
});
test('the bridge-closure advice beats doing nothing under every variation', () => {
  assert.strictEqual(r.beatsNothingAlways, true);
  assert(r.leaderRange.min < r.base.harms[0] && r.leaderRange.max > 0);
});
test('a flip is reported honestly: the best option changes when the value of time falls', () => {
  const lo = r.variations.find((v) => v.id === 'votime' && v.setting === 'low');
  assert.strictEqual(r.stable, r.flips.length === 0);
  if (lo.winner !== r.base.winner) assert(r.flips.includes(lo));
  assert(r.swing && r.swing.change > 0 && typeof r.swing.label === 'string');
});
test('same inputs, same answer (deterministic)', () => {
  const r2 = U.finish(U.sensitivity(data, ev, OPTS, cfg, { enabled: true }));
  assert.deepStrictEqual(r2.variations.map((v) => v.harms), r.variations.map((v) => v.harms));
});
test('a calm city: nothing to rank beyond doing nothing, no crash', () => {
  const calm = U.finish(U.sensitivity(data, Events.build(data, []), [], cfg, { enabled: true }, [U.FACTORS[0]]));
  assert.strictEqual(calm.options.length, 1); assert.strictEqual(calm.variations.length, 2);
  assert.strictEqual(calm.stable, true);
});
console.log(passed + ' passed');
