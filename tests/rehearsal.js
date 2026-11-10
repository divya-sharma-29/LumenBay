// Rehearsal: throw lots of surprises at the model and check that nothing breaks.
// Every number must be finite and plausible, every run must be fast enough for a live demo.
// Run with:  node tests/rehearsal.js        (add --quick for a shorter pass)
const path = require('path');
const src = (f) => path.join(__dirname, '..', 'src', f);
const fs = require('fs');
const Sim = require(src('sim.js')), Eco = require(src('economy.js')), Events = require(src('events.js')), Resp = require(src('responses.js')), CityFile = require(src('cityfile.js'));
const builtin = require(path.join(__dirname, '..', 'data', 'city.json'));
const quick = process.argv.includes('--quick');
// Optionally rehearse another city:  node tests/rehearsal.js data/examples/port-marlow.json
const fileArg = process.argv.slice(2).find((a) => a.endsWith('.json'));
let data = builtin;
if (fileArg) {
  const v = CityFile.validate(JSON.parse(fs.readFileSync(path.resolve(fileArg), 'utf8')), builtin);
  if (!v.ok) { console.log('city file rejected:\n - ' + v.errors.join('\n - ')); process.exit(1); }
  data = v.data;
}
const mainRoad = ((data.roads.filter((r) => r.bridge).length ? data.roads.filter((r) => r.bridge) : data.roads).slice().sort((a, b) => b.capacity - a.capacity)[0]).id;
console.log('rehearsing ' + data.name + ' (main bridge ' + mainRoad + ')');

const cfg = Sim.config(data), agents = Sim.generateAgents(data, cfg), normal = Eco.normalCity(data, agents, cfg);
const allIds = Resp.list(data).map((r) => r.id);
const problems = [];
let runs = 0, slowest = { ms: 0, name: '' };

function bad(name, what) { problems.push(name + ': ' + what); }
function finite(name, label, v) { if (typeof v !== 'number' || !isFinite(v)) bad(name, label + ' is ' + v); }

function checkCity(name, r) {
  finite(name, 'commute', r.summary.commute); finite(name, 'congestion', r.summary.congestionIndex);
  finite(name, 'revenue', r.econ.totals.revenue); finite(name, 'balance', r.econ.budget.balance);
  finite(name, 'timeCost', r.econ.timeCost); finite(name, 'productivity', r.econ.totals.productivity);
  const sh = r.summary.shares, sum = sh.car + sh.bus + sh.walk + sh.none;
  if (Math.abs(sum - 1) > 0.01) bad(name, 'mode shares add to ' + sum.toFixed(3));
  ['car', 'bus', 'walk', 'none'].forEach((k) => { if (sh[k] < -1e-9 || sh[k] > 1 + 1e-9) bad(name, 'share ' + k + ' = ' + sh[k]); });
  if (r.summary.commute < 0) bad(name, 'negative commute');
  if (r.econ.totals.revenue < -1e-6) bad(name, 'negative revenue ' + r.econ.totals.revenue);
  if (r.econ.totals.productivity < -1e-9 || r.econ.totals.productivity > 1.0001) bad(name, 'productivity ' + r.econ.totals.productivity);
  ['power', 'water'].forEach((k) => {
    const s = r.econ[k].shortfall; finite(name, k + ' shortfall', s);
    if (s < -1e-9 || s > 1) bad(name, k + ' shortfall ' + s);
  });
  r.byNbhd.forEach((n) => { finite(name, n.id + ' commute', n.commute); });
  r.edges.forEach((e) => { if (!e.closed) { finite(name, e.id + ' load', e.vc); if (e.vc < 0) bad(name, e.id + ' negative load'); } });
  r.lines.forEach((l) => { if (l.active) finite(name, l.id + ' util', l.util); });
}

function rehearse(name, sc, ids) {
  const t0 = Date.now();
  try {
    const applied = Resp.apply(data, agents, sc, ids || [], normal, cfg);
    checkCity(name + ' day1', Eco.runCity(data, agents, Eco.effective(data, applied, 1, 1), normal, cfg));
    const p = Eco.projectDays(data, agents, JSON.parse(JSON.stringify(applied)), normal, cfg, 14, { enabled: true });
    if (p.days.length !== 14) bad(name, 'outlook has ' + p.days.length + ' days');
    p.days.forEach((d) => { ['reserve', 'commute', 'revenue', 'service'].forEach((k) => finite(name + ' day' + d.day, k, d[k])); if (d.service < 0.39 || d.service > 1.0001) bad(name, 'service level ' + d.service + ' on day ' + d.day); });
    finite(name, 'harm', p.harm.total);
    // Harm is measured against the unchanged city. An event on its own cannot improve on it, but a
    // response can (remote work or retimed signals relieve a busy city), so only flag it with no response.
    if (!(ids && ids.length) && p.harm.total < -1) bad(name, 'harm below zero with nothing in force: ' + p.harm.total);
  } catch (e) { bad(name, 'THREW ' + e.message); }
  runs++;
  const ms = Date.now() - t0;
  if (ms > slowest.ms) slowest = { ms, name };
}

// 1. every combination of the four events, at every bus level
const busLevels = [1, 0.7, 0.3, 0];
for (let mask = 0; mask < 16; mask++) for (const lvl of busLevels) {
  const sc = Events.base(data);
  if (mask & 1) sc.flood = true; if (mask & 2) sc.heatwave = true; if (mask & 4) sc.strike = true; if (mask & 8) sc.closedRoads = [mainRoad];
  data.busLines.forEach((l) => { sc.busFrequency[l.id] = lvl; });
  rehearse('events#' + mask + ' bus ' + lvl, sc);
}
// 2. every single road closed, then every pair of bridges, then everything closed
data.roads.forEach((r) => { const sc = Events.base(data); sc.closedRoads = [r.id]; rehearse('close ' + r.id, sc); });
const bridges = data.roads.filter((r) => r.bridge).map((r) => r.id);
for (let i = 0; i < bridges.length; i++) for (let j = i + 1; j < bridges.length; j++) { const sc = Events.base(data); sc.closedRoads = [bridges[i], bridges[j]]; rehearse('close ' + bridges[i] + '+' + bridges[j], sc); }
{ const sc = Events.base(data); sc.closedRoads = data.roads.map((r) => r.id); rehearse('every road closed', sc); }
{ const sc = Events.base(data); sc.closedRoads = data.roads.map((r) => r.id); sc.flood = sc.heatwave = sc.strike = true; data.busLines.forEach((l) => { sc.busFrequency[l.id] = 0; }); rehearse('total disaster', sc); }
// 3. random surprises, with random responses in force
const rnd = Events.mulberry32(2026);
for (let i = 0; i < (quick ? 15 : 60); i++) {
  const sc = Events.build(data, Events.random(data, rnd));
  const k = Math.floor(rnd() * 4), ids = [];
  while (ids.length < k) { const id = allIds[Math.floor(rnd() * allIds.length)]; if (ids.indexOf(id) < 0) ids.push(id); }
  rehearse('surprise ' + i + ' [' + Events.describe(data, sc) + '] + ' + (ids.join(',') || 'nothing'), sc, ids);
}
// 4. every response alone in a calm city: must never crash, and must cost at least its price in harm or save something
allIds.forEach((id) => rehearse('calm + ' + id, Events.base(data), [id]));

// 5. the live search must stay fast for the nastiest realistic events
const tough = {
  'flood + heatwave': Events.build(data, [{ id: 'flood' }, { id: 'heatwave' }]),
  'strike + bridge': Events.build(data, [{ id: 'strike' }, { id: 'bridge_close', params: { roadId: mainRoad } }]),
  'flood + heatwave + strike': Events.build(data, [{ id: 'flood' }, { id: 'heatwave' }, { id: 'strike' }])
};
const searchTimes = [];
for (const [name, sc] of Object.entries(tough)) {
  const t0 = Date.now();
  const o = Resp.optimise(data, agents, sc, normal, cfg, 60000, { enabled: true });
  const ms = Date.now() - t0; searchTimes.push(name + ' ' + (ms / 1000).toFixed(1) + 's (' + o.tried + ' options)');
  if (ms > 15000) bad('search ' + name, 'took ' + ms + ' ms');
  if (!(o.rows[0].harm.total <= o.nothing.harm.total + 1e-6)) bad('search ' + name, 'best is worse than doing nothing');
  o.rows.forEach((r) => finite('search ' + name, r.name, r.harm.total));
}

console.log('rehearsed ' + runs + ' scenarios; slowest ' + (slowest.ms / 1000).toFixed(2) + 's (' + slowest.name + ')');
console.log('searches: ' + searchTimes.join('; '));
if (problems.length) { console.log('\n' + problems.length + ' PROBLEMS'); problems.slice(0, 40).forEach((p) => console.log(' - ' + p)); process.exit(1); }
console.log('all clear');
