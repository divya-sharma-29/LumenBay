// Recommendation assistant, report and saved experiments (Day 11): every sentence comes from a number; nothing hostile gets through.
const assert = require('assert');
const Sim = require('../src/sim');
const Economy = require('../src/economy');
const Events = require('../src/events');
const Responses = require('../src/responses');
const Ledger = require('../src/ledger');
const Report = require('../src/report');
const Assumptions = require('../src/assumptions');
const data = require('../data/city.json');

const cfg = Sim.config(data), agents = Sim.generateAgents(data, cfg), normal = Economy.normalCity(data, agents, cfg);
const ref = Economy.refCity(data, agents, normal, cfg);
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; } }

const sc = Events.build(data, [{ id: 'bridge_close', params: { roadId: 'e3' } }]);
const cmpRes = Responses.compare(data, agents, sc, normal, cfg, { budget: 40000, austerity: { enabled: true } });
const rows = cmpRes.rows.filter((r) => r.oneOff <= 40000), best = rows[0], nothing = cmpRes.nothing;
function runIds(ids) { const s = JSON.parse(JSON.stringify(sc)); s.responses = ids; const ap = Responses.apply(data, agents, s, ids, normal, cfg); return Economy.runCity(data, agents, Economy.effective(data, ap, 1, 1), normal, cfg); }
const led = Ledger.compare(data, agents, runIds(best.ids), runIds([]));

test('the recommendation names the real best plan and the real numbers', () => {
  const r = Report.recommend({ budget: 40000, best, nothing, overall: cmpRes.rows[0], rows, ledger: led, sample: { wins: 10, n: 10 } });
  assert(r.headline.includes(best.name), r.headline);
  assert(r.headline.includes(Math.round(nothing.harm.total / 1000).toLocaleString('en-US') + 'k'), r.headline);
  assert(r.headline.includes(Math.round(best.harm.total / 1000).toLocaleString('en-US') + 'k'), r.headline);
  assert(r.points.some((p) => /better off/.test(p) && p.includes(Math.round(led.better).toLocaleString('en-US'))), r.points.join(' | '));
  assert(r.caveats.some((c) => /all 10 simulated cities/.test(c)));
  assert(r.caveats.some((c) => /not forecasts/.test(c)));
  assert(!r.caveats.some((c) => /fictional|synthetic/i.test(c)));
});
test('it says when the 10-city check has not been run, and when the ranking is close', () => {
  assert(Report.recommend({ budget: 40000, best, nothing, overall: best, rows, ledger: led, sample: null }).caveats.some((c) => /not been run/.test(c)));
  assert(Report.recommend({ budget: 40000, best, nothing, overall: best, rows, ledger: led, sample: { wins: 6, n: 10 } }).caveats.some((c) => /6 of 10/.test(c)));
});
test('when nothing beats doing nothing, it says so instead of recommending something', () => {
  const r = Report.recommend({ budget: 0, best: nothing, nothing, overall: nothing, rows: [nothing], ledger: null, sample: null });
  assert(/No response beats doing nothing/.test(r.headline), r.headline);
});
test('it points out a cheaper plan that gets most of the benefit, only when one exists', () => {
  const fake = (name, oneOff, harm, ids) => ({ name, ids: ids || ['x'], oneOff, harm: { total: harm }, vsNothing: harm - 1000 });
  const n = fake('Nothing', 0, 1000, []), b = fake('Big plan', 30000, 200), c = fake('Small plan', 5000, 260);
  const r = Report.recommend({ budget: 40000, best: b, nothing: n, overall: b, rows: [b, c, n], ledger: null, sample: null });
  assert(r.points.some((p) => /Small plan/.test(p) && /9\d%|8\d%/.test(p)), r.points.join(' | '));
  const r2 = Report.recommend({ budget: 40000, best: b, nothing: n, overall: b, rows: [b, fake('Weak', 5000, 900), n], ledger: null, sample: null });
  assert(!r2.points.some((p) => /Weak/.test(p)) && r2.points.some((p) => /No cheaper option/.test(p)), r2.points.join(' | '));
});
test('the report is a complete page with the scenario, outcomes, ledger and every assumption', () => {
  const c = Ledger.compare(data, agents, runIds([]), ref);
  const page = Report.html({ title: 'Policy impact report', city: data.name, generated: '2026-10-30', event: Events.describe(data, sc), responses: '', austerity: true,
    metrics: [{ label: 'Average commute', base: '19.3 min', now: '21 min' }],
    ledger: { vs: 'the normal city', residents: c.residents, better: c.better, worse: c.worse, unchanged: c.unchanged, equity: 'x', districts: c.districts, spend: '0k' },
    assumptions: Assumptions.groups(data, Economy.ecfg(data)),
    recommendation: Report.recommend({ budget: 40000, best, nothing, overall: best, rows, ledger: led, sample: null }),
    options: rows.slice(0, 3).map((r) => ({ name: r.name, ids: r.ids.length, oneOff: r.oneOff, harm: r.harm.total, vs: r.vsNothing, range: '' })), link: 'http://x/#c=e3' });
  assert(/^<!doctype html>/.test(page) && /<\/html>$/.test(page));
  ['The scenario', 'Recommendation', 'Responses compared', 'Outcomes', 'Policy Impact Ledger', 'Assumptions the model used', 'Northfield'].forEach((h) => assert(page.includes(h), h));
  assert(!/fictional|synthetic|AI-generated|concept art|not a real place/i.test(page));
  const rowsInPage = (page.match(/<tr>/g) || []).length;
  assert(rowsInPage > 60, 'all assumption rows are there: ' + rowsInPage);
  assert(!/NaN|undefined|\[object/.test(page));
});
test('hostile text in names is escaped in the report', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const page = Report.html({ title: evil, city: evil, generated: evil, event: evil, responses: evil, austerity: false,
    metrics: [{ label: evil, base: evil, now: evil }], ledger: { vs: evil, residents: 1, better: 0, worse: 0, unchanged: 1, equity: evil, districts: [{ name: evil, residents: 1, better: 0, worse: 0, unchanged: 1 }], spend: evil },
    assumptions: [{ title: evil, rows: [{ label: evil, value: evil, note: evil }] }], notes: [evil], link: evil,
    recommendation: { headline: evil, points: [evil], caveats: [evil] }, options: [{ name: evil, ids: 1, oneOff: 1, harm: 1, vs: 1, range: evil }] });
  assert(!/<img/.test(page), 'no raw tag');
  assert(page.includes('&lt;img'));
});
test('saved experiments: newest first, the same scenario replaces its older copy, capped at 20', () => {
  let list = [];
  const e = (i, st) => ({ id: 'id' + i, name: 'n' + i, state: st != null ? st : 'c=e' + i, savedAt: '2026-10-30 10:00', headline: 'h', numbers: { commute: 20 } });
  for (let i = 0; i < 25; i++) list = Report.historyAdd(list, e(i));
  assert.strictEqual(list.length, Report.MAX_SAVED); assert.strictEqual(list[0].id, 'id24');
  list = Report.historyAdd(list, e(99, 'c=e20'));
  assert.strictEqual(list.filter((x) => x.state === 'c=e20').length, 1); assert.strictEqual(list[0].id, 'id99');
  assert.strictEqual(Report.historyAdd([], e(1, '')).length, 1, 'the unchanged city can be saved');
});
test('saved experiments: broken or hostile storage is dropped, never thrown', () => {
  assert.deepStrictEqual(Report.historyParse('not json'), []);
  assert.deepStrictEqual(Report.historyParse('{"a":1}'), []);
  assert.deepStrictEqual(Report.historyParse('null'), []);
  const mixed = JSON.stringify([{ id: 'ok', name: 'fine', state: 'c=e3&r=shuttle', numbers: { commute: 20, junk: 5, output: 'x' } },
    { id: 'bad1', name: 'x', state: '<script>alert(1)</script>' }, { id: 'bad2', name: 'x', state: 5 }, 'str', null, { name: 'noid', state: 'c=e3' },
    { id: 'long', name: 'x'.repeat(500), state: 'c=e3', headline: 'y'.repeat(900) }]);
  const out = Report.historyParse(mixed);
  assert.deepStrictEqual(out.map((x) => x.id), ['ok', 'long']);
  assert.deepStrictEqual(out[0].numbers, { commute: 20 });
  assert(out[1].name.length <= 80 && out[1].headline.length <= 200);
});
console.log(passed + ' passed');
