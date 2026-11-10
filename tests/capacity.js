// Service capacity (Day 14, deck 2.3.4 "raise service capacity"): a full hospital or school turns people away,
// extra capacity fixes that, it costs money, and the normal city is untouched. Run with:  node tests/capacity.js
const assert = require('assert');
const Sim = require('../src/sim');
const Economy = require('../src/economy');
const Events = require('../src/events');
const Services = require('../src/services');
const Resp = require('../src/responses');
const data = require('../data/city.json');

const cfg = Sim.config(data), agents = Sim.generateAgents(data, cfg), normal = Economy.normalCity(data, agents, cfg);
function run(list, boost) {
  const sc = Events.build(data, list);
  if (boost) sc.serviceBoost = boost;
  const T = Economy.runCity(data, agents, Economy.effective(data, sc, 1, 1), normal, cfg);
  return Services.access(data, T);
}
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; } }
const lose = [{ id: 'service_close', params: { serviceId: 'bay_general' } }];

test('the normal city has nobody turned away, so extra capacity changes nothing there', () => {
  const a = run([]), b = run([], { bay_general: 1, harbor_school: 1 });
  a.facilities.forEach((f) => assert(f.turnedAway < 1e-9, f.id));
  assert(Math.abs(a.city.hospital.share - b.city.hospital.share) < 1e-9);
  assert(Math.abs(a.city.school.share - b.city.school.share) < 1e-9);
});
test('losing the big hospital overloads the other one and people are turned away', () => {
  const a = run(lose), h = a.facilities.find((f) => f.id === 'harbor_health');
  assert(h.load > 1.15 && h.turnedAway > 0.2, 'load ' + h.load + ' away ' + h.turnedAway);
  assert(a.city.hospital.share < run([]).city.hospital.share - 0.3);
});
test('raising the surviving hospital capacity helps, more capacity helps more, and capacity shows in the table', () => {
  const s0 = run(lose).city.hospital.share, s1 = run(lose, { harbor_health: 0.5 }), s2 = run(lose, { harbor_health: 1 });
  assert(s1.city.hospital.share > s0 + 0.03 && s2.city.hospital.share > s1.city.hospital.share + 0.03);
  const h = s1.facilities.find((f) => f.id === 'harbor_health');
  assert.strictEqual(h.baseCapacity, 700); assert(Math.abs(h.capacity - 1050) < 1e-9 && h.boost === 0.5);
});
test('extra capacity at a closed or unrelated building does not change who is reached', () => {
  const s0 = run(lose).city.hospital.share, s = run(lose, { bay_general: 1 }).city.hospital.share;
  assert(Math.abs(s0 - s) < 1e-9);
});
test('people counted stay consistent: access never exceeds the people who need it', () => {
  [run(lose), run(lose, { harbor_health: 1 })].forEach((a) => ['hospital', 'school'].forEach((t) => {
    assert(a.city[t].within <= a.city[t].people + 1e-6);
    assert(Math.abs(a.byNbhd.reduce((s, n) => s + n[t].people, 0) - a.city[t].people) < 1e-6);
  }));
});
test('it costs money: the upgrade bill is added to the response spending, and is zero when unused', () => {
  const ev = Events.build(data, lose);
  const plain = Resp.apply(data, agents, ev, [], normal, cfg);
  ev.serviceBoost = { harbor_health: 0.5 };
  const boosted = Resp.apply(data, agents, ev, [], normal, cfg);
  assert.strictEqual(boosted.responseOneOff - plain.responseOneOff, Services.upgradeCost(data, 'harbor_health', 0.5));
  assert.strictEqual(Services.upgradeCost(data, 'harbor_health', 0.5), 7700);
  assert.strictEqual(Services.upgradeCost(data, 'nope', 1), 0);
});
test('the scenario description names the upgrade', () => {
  const ev = Events.build(data, lose); ev.serviceBoost = { harbor_health: 0.5 };
  assert(/Harbor Health Centre \+50% places/.test(Events.describe(data, ev)), Events.describe(data, ev));
  assert(!/places/.test(Events.describe(data, Events.build(data, lose))));
});
test('garbage boosts (negative, text) are ignored, not crashes', () => {
  const a = run(lose, { harbor_health: -3, bay_general: 'x', nothing: 2 });
  assert(Math.abs(a.city.hospital.share - run(lose).city.hospital.share) < 1e-9);
});
console.log('\n' + passed + ' passed');
