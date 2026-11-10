// Policy Impact Ledger (Day 9): every resident counted once, equity visible, money and efficiency stated.
const assert = require('assert');
const Sim = require('../src/sim');
const Economy = require('../src/economy');
const Events = require('../src/events');
const Responses = require('../src/responses');
const Ledger = require('../src/ledger');
const Uncertainty = require('../src/uncertainty');
const data = require('../data/city.json');

const cfg = Sim.config(data), agents = Sim.generateAgents(data, cfg), normal = Economy.normalCity(data, agents, cfg);
const ref = Economy.refCity(data, agents, normal, cfg);
function city(list, resp, d) {
  const sc = Events.build(data, list || []); sc.responses = resp || [];
  const ap = Responses.apply(data, agents, sc, sc.responses, normal, cfg);
  const run = Economy.runCity(data, agents, Economy.effective(data, ap, 1, 1), normal, cfg);
  const proj = Economy.projectDays(data, agents, JSON.parse(JSON.stringify(ap)), normal, cfg, 14, { enabled: true });
  return { run, proj };
}
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; } }
const BRIDGE = [{ id: 'bridge_close', params: { roadId: 'e3' } }];
const total = data.neighbourhoods.reduce((s, n) => s + n.agents * data.assumptions.agentRepresentsResidents, 0);

test('nothing changed: everyone is unchanged', () => {
  const c = Ledger.compare(data, agents, ref, ref);
  assert.strictEqual(Math.round(c.unchanged), total);
  assert.strictEqual(c.better, 0); assert.strictEqual(c.worse, 0);
  assert.deepStrictEqual(c.flagged, []);
});
test('no double counting: better + worse + unchanged is exactly the population, everywhere', () => {
  [city(BRIDGE), city([{ id: 'flood' }]), city([{ id: 'bus_cut' }]), city([{ id: 'heatwave' }, { id: 'strike' }])].forEach((x) => {
    const c = Ledger.compare(data, agents, x.run, ref);
    assert(Math.abs(c.better + c.worse + c.unchanged - total) < 1e-6, 'city total');
    assert(Math.abs(c.residents - total) < 1e-6);
    c.districts.forEach((d) => assert(Math.abs(d.better + d.worse + d.unchanged - d.residents) < 1e-6, d.name));
    assert(Math.abs(c.districts.reduce((s, d) => s + d.worse, 0) - c.worse) < 1e-6);
    ['income', 'car', 'need'].forEach((g) => {
      assert(Math.abs(c.groups[g].reduce((s, d) => s + d.residents, 0) - total) < 1e-6, g + ' groups add up to everyone');
      assert(Math.abs(c.groups[g].reduce((s, d) => s + d.worse, 0) - c.worse) < 1e-6, g + ' losses add up');
    });
    assert(c.better >= 0 && c.worse >= 0 && c.unchanged >= -1e-9);
  });
});
test('closing the main bridge: a large share are worse off and Northfield is flagged', () => {
  const c = Ledger.compare(data, agents, city(BRIDGE).run, ref);
  assert(c.worse > 0.2 * total, String(c.worse));
  assert(c.flagged.includes('Northfield'));
  assert(c.equity.worstDistrict === 'Northfield' && c.equity.gapPts > 50);
  assert(c.access.jobs.after < c.access.jobs.before);
  assert(c.access.hospital.after < c.access.hospital.before);
  assert(c.spill.roads.some((r) => /Kings/.test(r.name) && r.after > r.before), 'traffic spills onto the other bridge');
});
test('equity: a bus cut falls hardest on low-income and car-less residents', () => {
  const c = Ledger.compare(data, agents, city([{ id: 'bus_cut' }]).run, ref);
  const by = (g, id) => c.groups[g].find((x) => x.id === id).worseShare;
  assert(by('car', 'nocar') > 3 * by('car', 'car'), by('car', 'nocar') + ' vs ' + by('car', 'car'));
  assert(by('income', 'low') > by('income', 'high'));
  assert.strictEqual(c.better, 0, 'a bus cut does not make anyone better off');
});
test('a response compared with doing nothing helps people and hurts nobody', () => {
  const before = city(BRIDGE).run, after = city(BRIDGE, ['shuttle', 'remote_work', 'add_buses']);
  const c = Ledger.compare(data, agents, after.run, before);
  assert(c.better > 0.15 * total, String(c.better));
  assert(c.worse < 0.01 * total, String(c.worse));
  const sp = Ledger.spending({ harm: { response: after.proj.harm.response, busSpend: after.proj.harm.busSpend - city(BRIDGE).proj.harm.busSpend, repairs: 0 } });
  assert(sp.total > 20000, 'the response costs money: ' + sp.total);
  const ef = Ledger.efficiency(c, sp);
  assert(ef.per10k > 0 && ef.net > 0);
});
test('expenditure and efficiency edge cases: nothing spent, or money saved, gives no ratio', () => {
  const c = { better: 100, worse: 20 };
  assert.strictEqual(Ledger.efficiency(c, { total: 0 }).per10k, null);
  assert.strictEqual(Ledger.efficiency(c, { total: -5000 }).per10k, null);
  assert.strictEqual(Ledger.efficiency(c, { total: 20000 }).per10k, 40);
  assert.deepStrictEqual(Ledger.spending(null), { response: 0, bus: 0, repairs: 0, total: 0 });
});
test('who needs a hospital or school is fixed, and close to the stated shares', () => {
  const sc = data.services;
  let p = 0, s = 0;
  agents.forEach((a) => { const n = Ledger.needs(a.id, sc); if (n.patient) p++; if (n.student) s++; assert.deepStrictEqual(n, Ledger.needs(a.id, sc)); });
  assert(Math.abs(p / agents.length - sc.healthNeedShare) < 0.02, String(p / agents.length));
  assert(Math.abs(s / agents.length - sc.schoolAgeShare) < 0.02, String(s / agents.length));
});
test('the ledger is deterministic', () => {
  const a = Ledger.compare(data, agents, city(BRIDGE).run, ref), b = Ledger.compare(data, agents, city(BRIDGE).run, ref);
  assert.deepStrictEqual(a, b);
});
test('a city without hospitals and schools still gets a ledger', () => {
  const d2 = JSON.parse(JSON.stringify(data)); delete d2.services;
  const sc = Events.build(d2, BRIDGE);
  const n2 = Economy.normalCity(d2, agents, cfg);
  const r2 = Economy.refCity(d2, agents, n2, cfg);
  const run = Economy.runCity(d2, agents, Economy.effective(d2, sc, 1, 1), n2, cfg);
  const c = Ledger.compare(d2, agents, run, r2);
  assert(c.worse > 0 && c.access.hospital === undefined && c.districts[0].hospital === undefined);
  assert(Math.abs(c.better + c.worse + c.unchanged - total) < 1e-6);
});
test('uncertainty: the ranges now include residents worse and better off', () => {
  const r = Uncertainty.finish(Uncertainty.spread(data, Events.build(data, BRIDGE), cfg, 3, { enabled: true }));
  assert(r.metrics.worse.min > 0 && r.metrics.worse.max >= r.metrics.worse.min && r.metrics.better.values.length === 3);
  const main = Ledger.compare(data, agents, city(BRIDGE).run, ref);
  assert(Math.abs(r.metrics.worse.values[0] - main.worse) < 1, 'first simulated city is the page\'s own city');
});
console.log('\n' + passed + ' passed');
