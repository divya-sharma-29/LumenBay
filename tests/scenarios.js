// Checks that cause and effect run in the right direction.
// Run with:  node tests/scenarios.js
const assert = require('assert');
const path = require('path');
const Sim = require(path.join(__dirname, '..', 'src', 'sim.js'));
const data = require(path.join(__dirname, '..', 'data', 'city.json'));

const cfg = Sim.config(data);
const agents = Sim.generateAgents(data, cfg);
const run = (sc) => Sim.runTransport(data, agents, sc, cfg);
const edge = (r, id) => r.edges.find((e) => e.id === id);
const allBus = (m) => ({ busFrequency: { L1: m, L2: m, L3: m } });

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

const base = run({});

test('baseline is sensible (mix of modes, nobody stranded, bridges not overloaded)', () => {
  const s = base.summary.shares;
  assert(s.car > 0.35 && s.car < 0.65, 'car share ' + s.car);
  assert(s.bus > 0.25 && s.bus < 0.55, 'bus share ' + s.bus);
  assert(s.walk > 0.03 && s.walk < 0.2, 'walk share ' + s.walk);
  assert(s.none === 0, 'stranded ' + s.none);
  ['e3', 'e4', 'e5'].forEach((id) => assert(edge(base, id).vc < 1, id + ' over capacity in baseline'));
});

test('runs are deterministic', () => {
  assert.strictEqual(run({}).summary.commute, base.summary.commute);
});

test('model converges', () => assert(base.converged));

test('bus cut: riders move to cars, roads fill up, commutes lengthen', () => {
  const r = run(allBus(0.7));
  assert(r.summary.shares.bus < base.summary.shares.bus, 'bus share should fall');
  assert(r.summary.shares.car > base.summary.shares.car, 'car share should rise');
  assert(edge(r, 'e3').vc > edge(base, 'e3').vc, 'Crown Bridge should get busier');
  assert(r.summary.commute > base.summary.commute, 'commute should lengthen');
});

test('bigger bus cut hurts more than a smaller one', () => {
  const a = run(allBus(0.8)).summary.commute, b = run(allBus(0.5)).summary.commute;
  assert(b > a, a + ' vs ' + b);
});

test('better bus service helps', () => {
  const r = run(allBus(1.3));
  assert(r.summary.commute < base.summary.commute, 'commute should shorten');
});

test('Crown Bridge closure: traffic reroutes to Kings Bridge, Northfield loses bus access', () => {
  const r = run({ closedRoads: ['e3'] });
  assert(edge(r, 'e3').closed);
  assert(edge(r, 'e4').vc > edge(base, 'e4').vc + 0.2, 'Kings Bridge should absorb traffic');
  assert(r.summary.shares.none > 0, 'some residents should lose their route');
  assert(r.summary.congestionIndex > base.summary.congestionIndex, 'congestion should rise');
});

test('transit strike: commutes balloon, car use rises', () => {
  const r = run(allBus(0.1));
  assert(r.summary.commute > base.summary.commute * 1.5, 'commute ' + r.summary.commute);
  assert(r.summary.shares.car > base.summary.shares.car, 'car share should rise');
});

test('flood closes flood-prone roads and isolates Riverside', () => {
  const ids = data.roads.filter((x) => x.floodProne).map((x) => x.id);
  const r = run({ closedRoads: ids });
  ids.forEach((id) => assert(edge(r, id).closed));
  const rv = r.byNbhd.find((n) => n.id === 'riverside');
  assert(rv.shares.none > 0.5, 'Riverside no-route share ' + rv.shares.none);
});

test('heatwave: fewer people walk', () => {
  const r = run({ heatwave: true });
  assert(r.summary.shares.walk < base.summary.shares.walk);
});

test('closing one road never makes the whole city better on congestion', () => {
  data.roads.forEach((road) => {
    const r = run({ closedRoads: [road.id] });
    assert(r.summary.congestionIndex >= base.summary.congestionIndex - 0.02, road.id + ' closure lowered congestion');
  });
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
