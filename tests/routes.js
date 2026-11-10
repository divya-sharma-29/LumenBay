// What-if Lab: a planner-added bus route (Day 10). It is a policy: built on real open roads, costed, and judged by the ledger.
const assert = require('assert');
const Sim = require('../src/sim');
const Economy = require('../src/economy');
const Events = require('../src/events');
const Responses = require('../src/responses');
const Ledger = require('../src/ledger');
const data = require('../data/city.json');

const cfg = Sim.config(data), agents = Sim.generateAgents(data, cfg), normal = Economy.normalCity(data, agents, cfg);
const ref = Economy.refCity(data, agents, normal, cfg);
function run(routes, list) {
  const sc = Events.build(data, list || []); sc.newRoutes = routes;
  const ap = Responses.apply(data, agents, sc, [], normal, cfg);
  const r = Economy.runCity(data, agents, Economy.effective(data, ap, 1, 1), normal, cfg);
  const proj = Economy.projectDays(data, agents, JSON.parse(JSON.stringify(ap)), normal, cfg, 14, { enabled: true });
  return { ap, r, proj, ledger: Ledger.compare(data, agents, r, ref), spend: Ledger.spending(proj) };
}
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; } }
const total = data.neighbourhoods.reduce((s, n) => s + n.agents * data.assumptions.agentRepresentsResidents, 0);
const HARBOUR_TECH = [{ from: 'harbor', to: 'techpark' }];

test('no new routes: the city is exactly the unchanged city', () => {
  const x = run([]);
  assert.strictEqual(Math.round(x.ledger.unchanged), total);
  assert.strictEqual((x.ap.extraLines || []).length, 0);
});
test('a new route follows real roads and joins the two areas', () => {
  const x = run(HARBOUR_TECH), l = x.ap.extraLines[0];
  assert.strictEqual(l.stops[0], 'harbor'); assert.strictEqual(l.stops[l.stops.length - 1], 'techpark');
  for (let i = 0; i < l.stops.length - 1; i++) {
    assert(data.roads.some((r) => (r.a === l.stops[i] && r.b === l.stops[i + 1]) || (r.b === l.stops[i] && r.a === l.stops[i + 1])
      || (r.from === l.stops[i] && r.to === l.stops[i + 1]) || (r.to === l.stops[i] && r.from === l.stops[i + 1])), 'a road joins ' + l.stops[i] + ' and ' + l.stops[i + 1]);
  }
});
test('the route helps people, hurts nobody, and is paid for: set-up plus running the buses', () => {
  const x = run(HARBOUR_TECH);
  assert(x.ledger.better > 500, String(x.ledger.better));
  assert.strictEqual(Math.round(x.ledger.worse), 0);
  assert(Math.abs(x.ledger.better + x.ledger.worse + x.ledger.unchanged - total) < 1e-6);
  assert(x.spend.total > Responses.NEW_ROUTE.setup, 'running cost is included, not just set-up');
});
test('a route detours around a closed bridge', () => {
  const x = run([{ from: 'eastgate', to: 'northfield' }], [{ id: 'bridge_close', params: { roadId: 'e3' } }]);
  const l = x.ap.extraLines[0];
  assert(!(l.stops.join('>').includes('cbd>northfield')), l.stops.join('>'));
  assert.strictEqual(l.stops[l.stops.length - 1], 'northfield');
});
test('a route with no open road is not built, and says so', () => {
  const sc = Events.build(data, []); sc.closedRoads = ['e1', 'e3']; sc.newRoutes = [{ from: 'northfield', to: 'cbd' }];
  const ap = Responses.apply(data, agents, sc, [], normal, cfg);
  assert.strictEqual((ap.extraLines || []).length, 0);
  assert(ap.notes.length === 1 && /No open road/.test(ap.notes[0]), JSON.stringify(ap.notes));
});
test('same area twice, or an unknown area, builds nothing and breaks nothing', () => {
  assert.strictEqual(Responses.pathBetween(data, run([]).r, 'cbd', 'cbd'), null);
  assert.strictEqual(Responses.pathBetween(data, run([]).r, 'cbd', 'nowhere'), null);
});
test('the event description names the new route', () => {
  const sc = Events.build(data, []); sc.newRoutes = HARBOUR_TECH;
  assert(/new bus route Harbor to Tech Park/i.test(Events.describe(data, sc)), Events.describe(data, sc));
});
test('same route, same answer (deterministic)', () => {
  const a = run(HARBOUR_TECH), b = run(HARBOUR_TECH);
  assert.strictEqual(a.ledger.better, b.ledger.better); assert.strictEqual(a.spend.total, b.spend.total);
});
console.log(passed + ' passed');
