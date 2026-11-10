// City files: the loader must accept good cities and reject bad or hostile ones with a clear message.
// Run with:  node tests/cityfile.js
const assert = require('assert');
const path = require('path');
const root = path.join(__dirname, '..');
const CF = require(path.join(root, 'src', 'cityfile.js'));
const Sim = require(path.join(root, 'src', 'sim.js'));
const Eco = require(path.join(root, 'src', 'economy.js'));
const Events = require(path.join(root, 'src', 'events.js'));
const builtin = require(path.join(root, 'data', 'city.json'));
const marlow = require(path.join(root, 'data', 'examples', 'port-marlow.json'));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}
const copy = (x) => JSON.parse(JSON.stringify(x));
const check = (obj) => CF.validate(obj, builtin);
const has = (r, re) => r.errors.some((e) => re.test(e));

test('GOOD: the built-in city is accepted with no warnings', () => {
  const r = check(builtin);
  assert(r.ok, r.errors.join('; '));
  assert.deepStrictEqual(r.warnings, []);
  assert.strictEqual(r.data.neighbourhoods.length, 8);
});

test('GOOD: the example city is accepted, and says which parts it borrowed', () => {
  const r = check(marlow);
  assert(r.ok, r.errors.join('; '));
  assert(r.warnings.some((w) => /built-in city's values are used for: .*businesses/.test(w)), r.warnings.join('|'));
  assert.strictEqual(r.data.map.river.label, 'Canal');
});

test('GOOD: a city with only the three required parts works, with warnings about the rest', () => {
  const r = check({ name: 'Tiny', neighbourhoods: marlow.neighbourhoods, roads: marlow.roads, busLines: marlow.busLines });
  assert(r.ok);
  assert(r.warnings.some((w) => /sized for Lumen Bay/.test(w)));
  assert(r.data.utilities.power.supplyCapacityMW > 0 && r.data.assumptions.msaIterations > 0);
});

test('GOOD: both cities actually run in the simulator', () => {
  [check(builtin).data, check(marlow).data].forEach((d) => {
    const cfg = Sim.config(d), agents = Sim.generateAgents(d, cfg), normal = Eco.normalCity(d, agents, cfg);
    const c = Eco.runCity(d, agents, Events.base(d), normal, cfg);
    assert(isFinite(c.summary.commute) && c.summary.commute > 0 && isFinite(c.econ.totals.revenue), d.name);
  });
});

test('BAD: not an object, not JSON, too big', () => {
  assert(!CF.validate([1, 2], builtin).ok);
  assert(!CF.validate('hello', builtin).ok);
  assert(!CF.validate(null, builtin).ok);
  assert(!CF.parse('{nope').ok && /not valid JSON/.test(CF.parse('{nope').errors[0]));
  assert(!CF.parse('x'.repeat(CF.LIMITS.fileBytes + 1)).ok);
  assert(CF.parse('﻿{"a":1}').ok, 'a byte-order mark at the start is tolerated');
});

test('BAD: missing required parts are named', () => {
  const r = check({ name: 'x' });
  assert(!r.ok && has(r, /neighbourhoods/) && has(r, /roads/) && has(r, /busLines/));
  assert(has(check({ neighbourhoods: [], roads: [], busLines: [] }), /needs a "name"/));
});

test('BAD: roads and stops that point at nothing, and buses with no road between stops', () => {
  const a = copy(marlow); a.roads[0].to = 'atlantis';
  assert(has(check(a), /Road "r1".*"to".*neighbourhood/));
  const b = copy(marlow); b.busLines[0].stops = ['westgate', 'eastfield'];
  assert(has(check(b), /no road directly between "westgate" and "eastfield"/));
  const c = copy(marlow); c.busLines[1].stops = ['millbrook', 'nowhere'];
  assert(has(check(c), /not a neighbourhood/));
  const d = copy(marlow); d.busLines[0].stops = ['westgate'];
  assert(has(check(d), /2 to 20/));
  const e = copy(marlow); e.roads[1].from = e.roads[1].to;
  assert(has(check(e), /same place/));
});

test('BAD: duplicate and reserved ids', () => {
  const a = copy(marlow); a.roads[1].id = 'r1';
  assert(has(check(a), /"r1" is used twice/));
  ['__proto__', 'constructor', 'toString', 'has space', '', 'x'.repeat(41), '<b>'].forEach((id) => {
    const b = copy(marlow); b.neighbourhoods[0].id = id;
    assert(!check(b).ok, 'id ' + JSON.stringify(id) + ' should be rejected');
  });
});

test('BAD: wrong kinds of numbers', () => {
  const tries = [
    (c) => { c.roads[0].capacity = 'lots'; }, (c) => { c.roads[0].capacity = 0; }, (c) => { c.roads[0].capacity = -5; },
    (c) => { c.roads[0].km = null; }, (c) => { c.roads[0].freeFlowMin = 1e9; },
    (c) => { c.neighbourhoods[0].x = 150; }, (c) => { c.neighbourhoods[0].agents = 0; }, (c) => { c.neighbourhoods[0].agents = 1e6; },
    (c) => { c.neighbourhoods[0].carOwnership = 1.5; }, (c) => { c.neighbourhoods[0].income = 'rich'; },
    (c) => { c.busLines[0].headwayMin = 0; }, (c) => { c.busLines[0].buses = 0; }, (c) => { c.busLines[0].fare = -1; },
    (c) => { c.roads[0].bridge = 'yes'; }, (c) => { c.neighbourhoods[0].sectorMix.retail = 0.9; },
    (c) => { c.neighbourhoods.forEach((n) => { n.jobs = 0; }); }
  ];
  tries.forEach((fn, i) => { const c = copy(marlow); fn(c); assert(!check(c).ok, 'case ' + i + ' should be rejected'); });
});

test('BAD: size limits stop a file that would freeze the page', () => {
  const big = copy(marlow); big.neighbourhoods.forEach((n) => { n.agents = 2500; });
  assert(has(check(big), /Too many simulated residents/));
  const many = copy(marlow); while (many.neighbourhoods.length < 31) many.neighbourhoods.push(Object.assign(copy(marlow.neighbourhoods[0]), { id: 'n' + many.neighbourhoods.length }));
  assert(has(check(many), /At most 30 neighbourhoods/));
  const roads = copy(marlow); while (roads.roads.length < 81) roads.roads.push(Object.assign(copy(marlow.roads[0]), { id: 'x' + roads.roads.length }));
  assert(has(check(roads), /At most 80 roads/));
  const iters = copy(marlow); iters.assumptions = { msaIterations: 100000 };
  assert(has(check(iters), /msaIterations/));
});

test('HOSTILE: prototype tricks change nothing and are rejected or ignored', () => {
  const evil = JSON.parse(JSON.stringify(marlow).replace('{', '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted2":1}},'));
  const r = check(evil);
  assert.strictEqual(({}).polluted, undefined);
  assert.strictEqual(({}).polluted2, undefined);
  assert(r.ok, 'extra keys are ignored, not fatal');
  assert(!('polluted' in (r.data || {})) && !Object.prototype.hasOwnProperty.call(r.data, '__proto__'));
  const evil2 = JSON.parse('{"name":"x","utilities":{"__proto__":{"polluted3":1},"power":{"supplyCapacityMW":50,"__proto__":{"polluted4":1}}}}');
  const merged = check(Object.assign({}, copy(marlow), { utilities: evil2.utilities }));
  assert.strictEqual(({}).polluted3, undefined);
  assert.strictEqual(({}).polluted4, undefined);
  assert(merged.ok && merged.data.utilities.power.supplyCapacityMW === 50);
});

test('HOSTILE: unknown fields are dropped, markup in names stays inert text, long names are rejected', () => {
  const c = copy(marlow); c.neighbourhoods[0].evil = '<script>alert(1)</script>'; c.neighbourhoods[1].name = '<img src=x onerror=alert(1)>';
  const r = check(c);
  assert(r.ok);
  assert(!('evil' in r.data.neighbourhoods[0]));
  assert.strictEqual(r.data.neighbourhoods[1].name, '<img src=x onerror=alert(1)>', 'kept as text; the page escapes it');
  const long = copy(marlow); long.neighbourhoods[0].name = 'x'.repeat(41);
  assert(has(check(long), /too long/));
  const note = copy(marlow); note.note = 'n'.repeat(5000);
  assert(check(note).data.note.length <= 600);
});

test('HOSTILE: map paths may only be drawing commands', () => {
  ['M0 0 L 5 5 <script>', 'url(javascript:alert(1))', 'M0 0"onload="x', 'M'.repeat(401)].forEach((p) => {
    const c = copy(marlow); c.map.river.path = p;
    assert(has(check(c), /map\.river/), JSON.stringify(p.slice(0, 20)));
  });
  const ok = copy(marlow); ok.map.river.path = 'M0 50 L 100 50';
  assert(check(ok).ok);
  const noMap = copy(marlow); delete noMap.map;
  assert(check(noMap).ok && !check(noMap).data.map, 'a city may have no river');
});

test('WARN: a city whose roads do not join up is allowed, with a warning', () => {
  const c = copy(marlow); c.roads = c.roads.filter((r) => r.from !== 'eastfield' && r.to !== 'eastfield'); c.busLines[0].stops = ['westgate', 'oldport', 'market'];
  const r = check(c);
  assert(r.ok && r.warnings.some((w) => /do not connect every neighbourhood/.test(w)));
});

test('WARN: bad optional lists fall back to the built-in ones', () => {
  const c = copy(marlow); c.events = 'lots'; c.responses = [{ nope: 1 }];
  const r = check(c);
  assert(r.ok && r.data.events.length === builtin.events.length && r.data.responses.length === builtin.responses.length);
  assert(r.warnings.some((w) => /"events" was not a valid list/.test(w)) && r.warnings.some((w) => /"responses" was not a valid list/.test(w)));
});

test('ERRORS: messages are plain sentences naming the thing to fix', () => {
  const c = copy(marlow); c.roads[2].capacity = 'x';
  const r = check(c);
  assert(r.errors.length === 1 && /^Road "r3": "capacity" must be a number\.$/.test(r.errors[0]), r.errors.join('|'));
});

test('SERVICES: hospitals and schools load, with bad types, places and sizes rejected', () => {
  const r = check(marlow);
  assert(r.ok && r.data.services.facilities.length === 4);
  const a = copy(marlow); a.services.facilities[0].at = 'nowhere';
  assert(has(check(a), /"at" must be the id of a neighbourhood/));
  const b = copy(marlow); b.services.facilities[1].type = 'zoo';
  assert(has(check(b), /hospital or school/));
  const c = copy(marlow); c.services.facilities[2].capacity = -5;
  assert(has(check(c), /capacity/));
  const d = copy(marlow); d.services.facilities[2].id = d.services.facilities[1].id;
  assert(has(check(d), /used twice/));
  const e = copy(marlow); e.services.hospitalMaxMin = 'soon';
  assert(has(check(e), /hospitalMaxMin/));
  const f = copy(marlow); f.services = [];
  assert(has(check(f), /"services" must be an object/));
});

test('SERVICES: a city file without them is fine and gets none (the built-in ones would point at the wrong places)', () => {
  const r = check(builtin.neighbourhoods ? Object.assign(copy(marlow), { services: undefined }) : marlow);
  assert(r.ok && r.data.services === undefined);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
