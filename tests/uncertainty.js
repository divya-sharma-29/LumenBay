// Uncertainty ranges: repeat a question in several simulated cities (different seeds).
// Run with:  node tests/uncertainty.js
const assert = require('assert');
const path = require('path');
const src = (f) => path.join(__dirname, '..', 'src', f);
const Sim = require(src('sim.js'));
const Eco = require(src('economy.js'));
const Events = require(src('events.js'));
const Resp = require(src('responses.js'));
const U = require(src('uncertainty.js'));
const data = require(path.join(__dirname, '..', 'data', 'city.json'));

const cfg = Sim.config(data);
const agents = Sim.generateAgents(data, cfg);
const normal = Eco.normalCity(data, agents, cfg);
const NO_AUSTERITY = { enabled: false };
const crown = Events.build(data, [{ id: 'bridge_close', params: { roadId: 'e3' } }]);

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

test('CITIES: seeds are fixed, distinct, and start with the main city', () => {
  const a = U.seedList(cfg, 8), b = U.seedList(cfg, 8);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a[0], cfg.seed);
  assert.strictEqual(new Set(a).size, 8);
});

test('CITIES: different seeds give different residents, the same seed gives the same ones', () => {
  const w0 = U.world(data, cfg, cfg.seed), w1 = U.world(data, cfg, cfg.seed + 101);
  assert.strictEqual(U.world(data, cfg, cfg.seed), w0, 'cities are built once and reused');
  assert.notDeepStrictEqual(w0.agents.slice(0, 50).map((x) => x.job), w1.agents.slice(0, 50).map((x) => x.job));
  assert.deepStrictEqual(w0.agents.map((x) => x.job), agents.map((x) => x.job), 'the first city is the one the page shows');
});

test('SPREAD: min <= mean <= max, real variation, deterministic', () => {
  const a = U.finish(U.spread(data, crown, cfg, 6, NO_AUSTERITY));
  const b = U.finish(U.spread(data, crown, cfg, 6, NO_AUSTERITY));
  assert.deepStrictEqual(a.metrics.harm.values, b.metrics.harm.values);
  assert.strictEqual(a.n, 6);
  Object.keys(a.metrics).forEach((k) => {
    const m = a.metrics[k];
    assert(m.min <= m.mean + 1e-9 && m.mean <= m.max + 1e-9, k);
  });
  assert(a.metrics.harm.max > a.metrics.harm.min * 1.01, 'the seed really changes the answer');
  assert(a.metrics.commute.max > a.metrics.commute.min);
});

test('SPREAD: the main city is one of the runs, and the reserve band covers 14 days', () => {
  const r = U.finish(U.spread(data, crown, cfg, 4, NO_AUSTERITY));
  const main = Eco.projectDays(data, agents, Resp.apply(data, agents, crown, [], normal, cfg), normal, cfg, 14, NO_AUSTERITY);
  assert(Math.abs(r.metrics.harm.values[0] - main.harm.total) < 1, 'first run equals the page\'s own city');
  assert.strictEqual(r.reserve.min.length, 14);
  for (let d = 0; d < 14; d++) assert(r.reserve.min[d] <= r.reserve.max[d] + 1e-9);
});

test('SPREAD: responses in force are included in the runs', () => {
  const plain = U.finish(U.spread(data, crown, cfg, 3, NO_AUSTERITY));
  const withR = U.finish(U.spread(data, Object.assign({}, crown, { responses: ['shuttle', 'remote_work'] }), cfg, 3, NO_AUSTERITY));
  assert(withR.metrics.harm.mean < plain.metrics.harm.mean * 0.7, plain.metrics.harm.mean + ' -> ' + withR.metrics.harm.mean);
});

test('OPTIONS: doing nothing is always included; wins add up to the number of cities', () => {
  const r = U.finish(U.sampleOptions(data, crown, [['shuttle'], ['remote_work']], cfg, 4, NO_AUSTERITY));
  assert(r.options.some((o) => !o.ids.length));
  assert.strictEqual(r.options.reduce((s, o) => s + o.wins, 0), 4);
  r.options.forEach((o) => assert.strictEqual(o.harm.values.length, 4));
});

test('OPTIONS: each option is compared with the same city\'s own do-nothing', () => {
  const r = U.finish(U.sampleOptions(data, crown, [['shuttle']], cfg, 3, NO_AUSTERITY));
  const none = r.options.find((o) => !o.ids.length), sh = r.options.find((o) => o.ids[0] === 'shuttle');
  sh.vsNothing.values.forEach((v, i) => assert(Math.abs(v - (sh.harm.values[i] - none.harm.values[i])) < 1e-6));
  assert.strictEqual(none.beatsNothing, 0);
  assert.strictEqual(none.vsNothing.max, 0);
});

test('OPTIONS: a plan that helps a lot beats doing nothing in every city, and is called clear', () => {
  const r = U.finish(U.sampleOptions(data, crown, [['shuttle', 'remote_work'], ['stagger_hours']], cfg, 5, NO_AUSTERITY));
  const plan = r.options.find((o) => o.ids.length === 2);
  assert.strictEqual(plan.beatsNothing, 5);
  assert.strictEqual(r.leader, plan);
  assert(r.clear && /best in all 5/.test(r.note), r.note);
});

test('OPTIONS: a plan that only adds cost never wins and never beats doing nothing', () => {
  const r = U.finish(U.sampleOptions(data, crown, [['backup_power']], cfg, 3, NO_AUSTERITY));
  const bp = r.options.find((o) => o.ids[0] === 'backup_power');
  assert.strictEqual(bp.beatsNothing, 0);
  assert.strictEqual(bp.wins, 0);
});

test('OPTIONS: stepper reports progress and finishes', () => {
  const s = U.sampleOptions(data, crown, [['shuttle']], cfg, 2, NO_AUSTERITY);
  let steps = 0;
  while (!s.step()) { steps++; assert(s.progress().done <= s.progress().planned); }
  assert.strictEqual(s.progress().done, s.progress().planned);
  assert(steps >= 3);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
