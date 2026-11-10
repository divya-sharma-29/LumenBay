// Checks that the systems are really coupled: each link in docs/coupling_map.md
// must move the right way. Run with:  node tests/economy.js
const assert = require('assert');
const path = require('path');
const Sim = require(path.join(__dirname, '..', 'src', 'sim.js'));
const Eco = require(path.join(__dirname, '..', 'src', 'economy.js'));
const data = require(path.join(__dirname, '..', 'data', 'city.json'));

const cfg = Sim.config(data);
const agents = Sim.generateAgents(data, cfg);
const normal = Eco.normalCity(data, agents, cfg);
const run = (sc) => Eco.runCity(data, agents, sc, normal, cfg);
const busAll = (m) => ({ busFrequency: { L1: m, L2: m, L3: m } });
const zone = (r, id) => r.econ.zones.find((z) => z.id === id);

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

const base = run({});

test('baseline city is healthy: budget roughly balanced, utilities under capacity, nobody late', () => {
  const b = base.econ.budget;
  assert(Math.abs(b.balance) < 10000, 'balance ' + b.balance);
  assert(base.econ.power.load < 1 && base.econ.water.load < 1);
  assert.strictEqual(base.econ.totals.lateMin, 0);
  assert(Math.abs(base.econ.totals.productivity - 1) < 1e-9);
});

test('books add up', () => {
  const e = base.econ, b = e.budget;
  const zoneSum = e.zones.reduce((s, z) => s + z.revenue, 0);
  assert(Math.abs(zoneSum - e.totals.revenue) < 1e-6);
  assert(Math.abs(b.income - (b.businessTax + b.incomeTax + b.fares)) < 1e-6);
  assert(Math.abs(b.balance - (b.income - b.busOps - b.baseServices)) < 1e-6);
  e.zones.forEach((z) => assert(z.revenue >= 0));
});

test('LINK bus headway -> mode choice -> lateness -> productivity -> revenue', () => {
  const r = run(busAll(0.4));
  assert(r.summary.shares.bus < base.summary.shares.bus, 'bus share');
  assert(r.econ.totals.lateMin > 0, 'workers should be late');
  assert(r.econ.totals.productivity < base.econ.totals.productivity, 'productivity');
  assert(r.econ.totals.revenue < base.econ.totals.revenue, 'revenue');
});

test('LINK travel time -> shop visits -> retail revenue', () => {
  const r = run(busAll(0.4));
  assert(r.econ.totals.visits < base.econ.totals.visits, 'visits');
  assert(r.econ.totals.retail < base.econ.totals.retail, 'retail revenue');
});

test('LINK revenue -> business tax -> budget', () => {
  const r = run({ closedRoads: ['e3'] });
  assert(r.econ.budget.businessTax < base.econ.budget.businessTax);
  assert(Math.abs(r.econ.budget.businessTax - data.budget.businessTaxRate * r.econ.totals.revenue) < 1e-6);
});

test('LINK stranded workers -> income tax and output', () => {
  const r = run({ closedRoads: ['e3'] });
  assert(r.summary.shares.none > 0);
  assert(r.econ.budget.incomeTax < base.econ.budget.incomeTax, 'income tax');
  assert(r.econ.budget.balance < base.econ.budget.balance, 'balance');
});

test('worse disruptions cost more (bus 70% < bus 40% < strike in output)', () => {
  const a = run(busAll(0.7)).econ.totals.revenue, b = run(busAll(0.4)).econ.totals.revenue, c = run(busAll(0.1)).econ.totals.revenue;
  assert(base.econ.totals.revenue > a && a > b && b > c, [base.econ.totals.revenue, a, b, c].join(' > '));
});

test('bus cut saves the city money but costs residents more in time (the trade-off is visible)', () => {
  const r = run(busAll(0.7));
  assert(r.econ.budget.busOps < base.econ.budget.busOps, 'bus operating cost should fall');
  assert(r.econ.budget.balance > base.econ.budget.balance, 'budget looks better');
  const saving = base.econ.budget.busOps - r.econ.budget.busOps;
  assert(r.econ.timeCost - base.econ.timeCost > saving, 'residents lose more than the city saves');
});

test('LINK heatwave -> power shortfall -> business hours lost -> revenue', () => {
  const r = run({ heatwave: true });
  assert(r.econ.power.shortfall > 0.05, 'shortfall ' + r.econ.power.shortfall);
  assert(r.econ.totals.revenue < base.econ.totals.revenue * 0.95, 'revenue should drop clearly');
});

test('LINK power shortfall -> traffic signals fail -> road capacity (feedback into transport)', () => {
  const r = run({ heatwave: true });
  assert(r.scenario.capacityScale < 1, 'signals should degrade, scale ' + r.scenario.capacityScale);
  const noSignalLoss = Sim.runTransport(data, agents, { heatwave: true }, cfg);
  assert(r.summary.congestionIndex > noSignalLoss.summary.congestionIndex, 'congestion should be higher');
});

test('LINK flood -> roads closed + water shortfall + repair bill', () => {
  const r = run({ flood: true });
  const flooded = data.roads.filter((x) => x.floodProne).length;
  assert.strictEqual(r.econ.budget.floodedRoads, flooded);
  assert.strictEqual(r.econ.budget.oneOff, flooded * data.budget.roadRepairCostPerDamagedEdge);
  assert(r.econ.water.shortfall > 0.05, 'water shortfall');
  assert(r.econ.totals.revenue < base.econ.totals.revenue * 0.8, 'flood should hit output hard');
  assert(zone(r, 'riverside').presence < 0.3, 'Riverside cut off');
});

test('water shortfall alone hurts industrial Harbor more than office Tech Park', () => {
  const w = JSON.parse(JSON.stringify(data));
  w.utilities.water.supplyCapacityML = 50;          // city short of water, roads normal
  const r = Eco.runCity(w, agents, {}, normal, cfg);
  assert(r.econ.water.shortfall > 0.1, 'needs a real shortfall');
  assert.strictEqual(r.summary.shares.none, 0, 'transport unaffected');
  const loss = (id) => 1 - zone(r, id).revenue / zone(base, id).revenue;
  assert(loss('harbor') > loss('techpark') + 0.05, 'harbor ' + loss('harbor').toFixed(3) + ' vs techpark ' + loss('techpark').toFixed(3));
});

test('runs are deterministic', () => {
  assert.strictEqual(run({ heatwave: true }).econ.totals.revenue, run({ heatwave: true }).econ.totals.revenue);
});

test('LINK budget deficit -> austerity bus cuts -> longer commutes (multi-day loop)', () => {
  const quiet = Eco.projectDays(data, agents, {}, normal, cfg, 10);
  assert.strictEqual(quiet.reserveOutDay, null, 'baseline should never run out');
  assert.strictEqual(quiet.finalService, 1);

  const sc = { heatwave: true };
  const on = Eco.projectDays(data, agents, sc, normal, cfg, 14, { enabled: true });
  const off = Eco.projectDays(data, agents, sc, normal, cfg, 14, { enabled: false });
  assert(on.reserveOutDay !== null, 'heatwave drains the reserve');
  assert(on.finalService < 1, 'service should be cut, now ' + on.finalService);
  assert.strictEqual(off.finalService, 1);
  assert(on.days[13].commute > off.days[13].commute + 3, 'austerity lengthens commutes');
  assert(on.days[13].revenue < off.days[13].revenue, 'and costs business output');
  assert(on.finalReserve > off.finalReserve, 'while helping the reserve');
});

test('projection charges the flood repair bill on day 1 only', () => {
  const p = Eco.projectDays(data, agents, { flood: true }, normal, cfg, 3, { enabled: false });
  const rec = run({ flood: true }).econ.budget;
  assert(Math.abs(p.days[0].balance - (rec.balance - rec.oneOff)) < 1e-6);
  assert(Math.abs(p.days[1].balance - rec.balance) < 1e-6);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
