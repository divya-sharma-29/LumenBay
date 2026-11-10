// Events and responses: each response must help where it should, cost what it
// says, and the search must respect the budget. Run with:  node tests/responses.js
const assert = require('assert');
const path = require('path');
const Sim = require(path.join(__dirname, '..', 'src', 'sim.js'));
const Eco = require(path.join(__dirname, '..', 'src', 'economy.js'));
const Events = require(path.join(__dirname, '..', 'src', 'events.js'));
const Resp = require(path.join(__dirname, '..', 'src', 'responses.js'));
const data = require(path.join(__dirname, '..', 'data', 'city.json'));

const cfg = Sim.config(data);
const agents = Sim.generateAgents(data, cfg);
const normal = Eco.normalCity(data, agents, cfg);
const NO_AUSTERITY = { enabled: false };

const ev = {
  flood: Events.build(data, [{ id: 'flood' }]),
  heat: Events.build(data, [{ id: 'heatwave' }]),
  strike: Events.build(data, [{ id: 'strike' }]),
  crown: Events.build(data, [{ id: 'bridge_close', params: { roadId: 'e3' } }]),
  busCut: Events.build(data, [{ id: 'bus_cut', params: { cutFraction: 0.3 } }])
};

// Day-1 picture of an event with some responses in force.
function dayOne(event, ids) {
  const applied = Resp.apply(data, agents, event, ids, normal, cfg);
  return { applied, city: Eco.runCity(data, agents, Eco.effective(data, applied, 1, 1), normal, cfg) };
}
// Full 14-day harm of an event with some responses in force.
function harm(event, ids, opts) {
  const applied = Resp.apply(data, agents, event, ids, normal, cfg);
  return Eco.projectDays(data, agents, applied, normal, cfg, 14, opts || NO_AUSTERITY);
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

// ---------------------------------------------------------------- events

test('EVENTS: base is the normal city and events compose', () => {
  const b = Events.base(data);
  assert.strictEqual(Events.describe(data, b), 'normal city');
  const s = Events.build(data, [{ id: 'flood' }, { id: 'heatwave' }, { id: 'bus_cut', params: { cutFraction: 0.4 } }]);
  assert(s.flood && s.heatwave);
  assert(Math.abs(s.busFrequency.L1 - 0.6) < 1e-9);
  assert.throws(() => Events.add(data, b, 'meteor'), /Unknown event/);
});

test('EVENTS: a surprise is repeatable from a seed and always valid', () => {
  assert.deepStrictEqual(Events.random(data, Events.mulberry32(3)), Events.random(data, Events.mulberry32(3)));
  const rng = Events.mulberry32(11);
  for (let i = 0; i < 30; i++) {
    const list = Events.random(data, rng);
    assert(list.length >= 1 && list.length <= 2);
    const r = Eco.runCity(data, agents, Eco.effective(data, Events.build(data, list), 1, 1), normal, cfg);
    assert(isFinite(r.econ.totals.revenue) && r.econ.totals.revenue >= 0, JSON.stringify(list));
  }
});

test('EVENTS: floods, heatwaves and strikes end on their own and the city recovers', () => {
  const p = Eco.projectDays(data, agents, ev.flood, normal, cfg, 14, NO_AUSTERITY);
  const D = data.events.find((e) => e.id === 'flood').durationDays;
  assert(p.days[D - 1].active.flood && !p.days[D].active.flood, 'flood should end after day ' + D);
  assert(p.days[0].none > 0.2 && p.days[13].none === 0, 'residents reconnected');
  assert(p.days[13].revenue > p.days[0].revenue * 1.2, 'output recovers');
  const h = Eco.projectDays(data, agents, ev.heat, normal, cfg, 14, NO_AUSTERITY);
  assert(h.days[0].powerShortfall > 0 && h.days[10].powerShortfall === 0, 'blackouts stop');
  const s = Eco.projectDays(data, agents, ev.strike, normal, cfg, 14, NO_AUSTERITY);
  assert(s.days[0].commute > s.days[13].commute + 10, 'buses come back after the strike');
});

test('EVENTS: a bus cut is a policy and does not end', () => {
  const p = Eco.projectDays(data, agents, ev.busCut, normal, cfg, 14, NO_AUSTERITY);
  assert(Math.abs(p.days[0].commute - p.days[13].commute) < 1e-9);
});

// ------------------------------------------------------------- responses

test('RESPONSE shuttle: bridge closure -> a new line carries real riders and reconnects Northfield', () => {
  const none = dayOne(ev.crown, []).city, sh = dayOne(ev.crown, ['shuttle']);
  const line = sh.applied.extraLines[0];
  assert(line && line.stops.length >= 3, 'shuttle route ' + JSON.stringify(line && line.stops));
  const nf = (c) => c.byNbhd.find((n) => n.id === 'northfield').shares;
  assert(nf(sh.city).none < nf(none).none, 'Northfield no-route share should fall');
  assert(nf(sh.city).bus > nf(none).bus, 'and bus riders return');
  assert(sh.city.lines.some((l) => l.temporary), 'temporary line present in results');
});

test('RESPONSE add_buses: strike -> shorter commutes, higher bus cost', () => {
  const none = dayOne(ev.strike, []).city, ab = dayOne(ev.strike, ['add_buses']).city;
  assert(ab.summary.commute < none.summary.commute, 'commute');
  assert(ab.econ.budget.busOps > none.econ.budget.busOps, 'bus operating cost follows the extra bus-hours');
});

test('RESPONSE remote_work: bridge closure -> less traffic and travel time, at a cost in output', () => {
  const none = dayOne(ev.crown, []).city, rw = dayOne(ev.crown, ['remote_work']).city;
  const edge = (c, id) => c.edges.find((e) => e.id === id);
  assert(edge(rw, 'e4').vc < edge(none, 'e4').vc, 'Kings Bridge less full');
  assert(rw.econ.timeCost < none.econ.timeCost, 'residents save travel time');
  assert(rw.econ.budget.fares < none.econ.budget.fares, 'fewer fares: fewer commuters');
  // Home working is 15% less productive, so output drops here; the gain is the time saved.
  assert(rw.econ.totals.revenue < none.econ.totals.revenue, 'output falls');
  const net = (c) => c.econ.totals.revenue - c.econ.timeCost;
  assert(net(rw) > net(none) + 10000, 'but output minus travel cost improves');
});

test('RESPONSE remote_work: no free lunch in a calm city, big win when workers are cut off', () => {
  const net = (c) => c.econ.totals.revenue - c.econ.timeCost;
  const calmA = dayOne(Events.base(data), []).city, calmB = dayOne(Events.base(data), ['remote_work']).city;
  assert(Math.abs(net(calmB) - net(calmA)) < 5000, 'calm city is a wash: ' + (net(calmB) - net(calmA)));
  const fa = dayOne(ev.flood, []).city, fb = dayOne(ev.flood, ['remote_work']).city;
  assert(fb.econ.totals.revenue > fa.econ.totals.revenue, 'cut-off workers can still work from home');
  assert(net(fb) > net(fa) + 50000, 'net gain in a flood');
});

test('RESPONSE emergency_fund: flood -> roads reopen sooner, repair bill unchanged', () => {
  const D = data.events.find((e) => e.id === 'flood').durationDays;
  const applied = Resp.apply(data, agents, ev.flood, ['emergency_fund'], normal, cfg);
  assert(applied.durations.flood < D, 'flood duration ' + applied.durations.flood + ' vs ' + D);
  const a = harm(ev.flood, []), b = harm(ev.flood, ['emergency_fund']);
  assert(b.harm.total < a.harm.total, 'less harm');
  assert.strictEqual(b.harm.repairs, a.harm.repairs, 'same repair bill');
});

test('RESPONSE stagger_hours: spreads the peak, costs 1% of output', () => {
  const none = dayOne(ev.crown, []).city, sg = dayOne(ev.crown, ['stagger_hours']).city;
  assert(sg.summary.congestionIndex < none.summary.congestionIndex, 'congestion');
  const calm = dayOne(Events.base(data), ['stagger_hours']).city, normalCityRun = dayOne(Events.base(data), []).city;
  const loss = 1 - calm.econ.totals.revenue / normalCityRun.econ.totals.revenue;
  assert(loss > 0.005 && loss < 0.02, 'output loss ' + loss);
});

test('RESPONSE conservation: heatwave -> fewer blackouts, more output, less harm', () => {
  const none = dayOne(ev.heat, []).city, cs = dayOne(ev.heat, ['conservation']).city;
  assert(cs.econ.power.shortfall < none.econ.power.shortfall, 'power shortfall');
  assert(cs.econ.totals.revenue > none.econ.totals.revenue, 'output');
  assert(harm(ev.heat, ['conservation']).harm.total < harm(ev.heat, []).harm.total, 'harm');
});

test('RESPONSE that does not touch the problem only adds its cost', () => {
  const a = harm(ev.heat, []), b = harm(ev.heat, ['emergency_fund']);
  assert(b.harm.total > a.harm.total, 'emergency repairs cannot help a heatwave');
});

// ----------------------------------------------------------------- costs

test('COSTS: harm adds up and response cost is charged once, on day 1', () => {
  const p = harm(ev.crown, ['shuttle', 'remote_work']);
  const H = p.harm;
  assert(Math.abs(H.total - (H.lostOutput + H.extraTravel + H.busSpend + H.repairs + H.response)) < 1e-6);
  assert.strictEqual(H.response, Resp.costOf(data, ['shuttle', 'remote_work']));
  const plain = harm(ev.crown, []);
  assert(Math.abs((plain.days[0].balance - p.days[0].balance) - H.response) < 1e4, 'day-1 balance should carry the spend (running costs differ slightly)');
});

test('COSTS: with the austerity rule off, an unrelated response costs exactly its price', () => {
  const a = harm(ev.crown, []), b = harm(ev.crown, ['conservation']);
  assert(Math.abs(b.harm.total - a.harm.total - 5000) < 1e-6, String(b.harm.total - a.harm.total));
});

test('COSTS: the austerity rule can turn a small spend into a bigger loss (budget -> transport loop)', () => {
  const on = { enabled: true };
  const a = harm(ev.crown, [], on), b = harm(ev.crown, ['conservation'], on);
  assert(b.reserveOutDay <= a.reserveOutDay, 'spending brings the cash-out day forward');
  assert(b.harm.total - a.harm.total > 5000, 'service cuts start sooner, which costs residents more than the spend');
});

// ------------------------------------------------------------- optimiser

// ---------------------------------------------------------------- Day 6 responses

test('FREE FARES: riders move to buses, fare income goes to zero, the budget loses it', () => {
  const calm = dayOne(Events.base(data), []).city, free = dayOne(Events.base(data), ['free_fares']).city;
  assert(free.summary.shares.bus > calm.summary.shares.bus + 0.01, 'bus share up');
  assert(free.summary.shares.car < calm.summary.shares.car - 0.01, 'car share down');
  assert(Math.abs(free.econ.budget.fares) < 1, 'no fare income');
  assert(free.econ.budget.income < calm.econ.budget.income - 5000, 'budget income down');
});

test('SIGNAL TIMING: more road capacity means less congestion and shorter commutes in a closure', () => {
  const base = dayOne(ev.crown, []).city, timed = dayOne(ev.crown, ['signal_timing']).city;
  assert(timed.summary.congestionIndex < base.summary.congestionIndex - 0.02, base.summary.congestionIndex + ' -> ' + timed.summary.congestionIndex);
  assert(timed.summary.commute < base.summary.commute);
});

test('BACKUP POWER: a heatwave has far fewer blackouts and businesses keep trading', () => {
  const base = dayOne(ev.heat, []).city, gen = dayOne(ev.heat, ['backup_power']).city;
  assert(base.econ.power.shortfall > 0.05, 'the heatwave causes blackouts to begin with');
  assert(gen.econ.power.shortfall < base.econ.power.shortfall / 3, base.econ.power.shortfall + ' -> ' + gen.econ.power.shortfall);
  assert(gen.econ.totals.revenue > base.econ.totals.revenue * 1.05);
});

test('BACKUP POWER: does nothing for a closure except cost money (power was never short)', () => {
  const base = dayOne(ev.crown, []).city, gen = dayOne(ev.crown, ['backup_power']).city;
  assert.strictEqual(gen.summary.commute, base.summary.commute);
  const extra = harm(ev.crown, ['backup_power']).harm.total - harm(ev.crown, []).harm.total;
  assert(Math.abs(extra - 15000) < 1, 'adds exactly its price, got ' + extra);
});

test('WATER TANKERS: a flood is rationed far less and output recovers', () => {
  const base = dayOne(ev.flood, []).city, tank = dayOne(ev.flood, ['water_tankers']).city;
  assert(base.econ.water.shortfall > 0.1, 'the flood causes rationing to begin with');
  assert(tank.econ.water.shortfall < base.econ.water.shortfall / 3, base.econ.water.shortfall + ' -> ' + tank.econ.water.shortfall);
  assert(tank.econ.totals.revenue > base.econ.totals.revenue);
  assert.strictEqual(tank.summary.commute, base.summary.commute, 'water does not change who can drive');
});

test('SEARCH: respects the spending limit', () => {
  const o = Resp.optimise(data, agents, ev.crown, normal, cfg, 12000, NO_AUSTERITY, ['shuttle', 'remote_work', 'stagger_hours', 'add_buses']);
  o.rows.forEach((r) => assert(r.oneOff <= 12000, r.name + ' costs ' + r.oneOff));
  assert(o.rows.some((r) => r.ids.length === 0), 'doing nothing is always on the table');
  const none = Resp.optimise(data, agents, ev.crown, normal, cfg, 0, NO_AUSTERITY);
  assert.strictEqual(none.rows.length, 1);
  assert.strictEqual(none.rows[0].ids.length, 0);
});

test('SEARCH: the winner beats everything else it tried, and beats doing nothing when something helps', () => {
  const o = Resp.optimise(data, agents, ev.crown, normal, cfg, 40000, NO_AUSTERITY, ['shuttle', 'remote_work', 'stagger_hours']);
  const best = o.rows[0];
  o.rows.forEach((r) => assert(best.harm.total <= r.harm.total + 1e-6));
  assert(best.harm.total < o.nothing.harm.total && best.ids.length > 0);
  assert(o.rows.some((r) => r.ids.length > 1), 'combinations were tried');
});

test('SEARCH: a bigger budget never gives a worse best option', () => {
  const only = ['shuttle', 'remote_work', 'emergency_fund', 'add_buses'];
  const small = Resp.optimise(data, agents, ev.flood, normal, cfg, 8000, NO_AUSTERITY, only).rows[0].harm.total;
  const large = Resp.optimise(data, agents, ev.flood, normal, cfg, 40000, NO_AUSTERITY, only).rows[0].harm.total;
  assert(large <= small + 1e-6, small + ' -> ' + large);
});

test('SEARCH: the right tool wins for each event', () => {
  const heat = Resp.optimise(data, agents, ev.heat, normal, cfg, 40000, NO_AUSTERITY).rows[0];
  // Only the utility responses address a heatwave; anything else just adds its cost.
  assert(heat.ids.indexOf('conservation') >= 0 && heat.ids.every((id) => ['conservation', 'backup_power'].indexOf(id) >= 0), 'heatwave -> ' + heat.name);
  const crown = Resp.optimise(data, agents, ev.crown, normal, cfg, 40000, NO_AUSTERITY).rows[0];
  assert(crown.ids.indexOf('shuttle') >= 0 || crown.ids.indexOf('remote_work') >= 0, 'bridge -> ' + crown.name);
  const flood = Resp.optimise(data, agents, ev.flood, normal, cfg, 40000, NO_AUSTERITY).rows[0];
  assert(flood.ids.indexOf('emergency_fund') >= 0, 'flood -> ' + flood.name);
});

test('SEARCH: the fast beam search finds the same winner as trying every combination', () => {
  [ev.crown, ev.flood].forEach((e) => {
    const fast = Resp.optimise(data, agents, e, normal, cfg, 40000, NO_AUSTERITY);
    const full = Resp.optimise(data, agents, e, normal, cfg, 40000, NO_AUSTERITY, null, { exhaustive: true });
    assert(Math.abs(fast.rows[0].harm.total - full.rows[0].harm.total) < 1, fast.rows[0].name + ' vs ' + full.rows[0].name);
    assert(fast.tried < full.tried || fast.tried <= 40, 'beam tried ' + fast.tried + ', exhaustive ' + full.tried);
  });
});

test('SEARCH: step-by-step search gives the same answer as the one-call search', () => {
  const only = ['shuttle', 'remote_work'];
  const one = Resp.optimise(data, agents, ev.crown, normal, cfg, 40000, NO_AUSTERITY, only);
  const o = Resp.optimiser(data, agents, ev.crown, normal, cfg, 40000, NO_AUSTERITY, only);
  let steps = 0;
  while (!o.step()) { steps++; assert(o.progress().done <= o.progress().planned); }
  const two = o.result();
  assert.deepStrictEqual(two.rows.map((r) => r.name), one.rows.map((r) => r.name));
  assert(steps >= 3);
});

test('SEARCH: deterministic', () => {
  const a = Resp.compare(data, agents, ev.crown, normal, cfg, NO_AUSTERITY).rows.map((r) => r.harm.total);
  const b = Resp.compare(data, agents, ev.crown, normal, cfg, NO_AUSTERITY).rows.map((r) => r.harm.total);
  assert.deepStrictEqual(a, b);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
