// The assumptions table must show every number the model relies on, in plain words, and never hide one.
// Run with:  node tests/assumptions.js
const assert = require('assert');
const path = require('path');
const src = (f) => path.join(__dirname, '..', 'src', f);
const Eco = require(src('economy.js'));
const A = require(src('assumptions.js'));
const CityFile = require(src('cityfile.js'));
const data = require(path.join(__dirname, '..', 'data', 'city.json'));
const example = require(path.join(__dirname, '..', 'data', 'examples', 'port-marlow.json'));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}
const rowsOf = (d) => A.groups(d, Eco.ecfg(d)).reduce((a, g) => a.concat(g.rows), []);
const keysOf = (d) => new Set(rowsOf(d).map((r) => r.key));

test('EVERY setting the model runs with is listed (file settings and built-in defaults)', () => {
  const have = keysOf(data), missing = Object.keys(Eco.ecfg(data)).filter((k) => !have.has('assumptions.' + k));
  assert.deepStrictEqual(missing, []);
});

test('EVERY budget, power, water, business and event figure is listed', () => {
  const have = keysOf(data), missing = [];
  Object.keys(data.budget).forEach((k) => { if (!have.has('budget.' + k)) missing.push('budget.' + k); });
  Object.keys(data.utilities.power).forEach((k) => { if (!have.has('utilities.power.' + k)) missing.push('power.' + k); });
  Object.keys(data.utilities.water).forEach((k) => { if (!have.has('utilities.water.' + k)) missing.push('water.' + k); });
  const biz = Array.isArray(data.businesses) ? data.businesses[0] : data.businesses;
  Object.keys(biz).forEach((s) => Object.keys(biz[s]).forEach((k) => { if (!have.has('businesses.' + s + '.' + k)) missing.push(s + '.' + k); }));
  data.events.forEach((e) => { if (!have.has('events.' + e.id)) missing.push('events.' + e.id); });
  assert.deepStrictEqual(missing, []);
});

test('NOTHING is shown as [object Object], NaN or undefined, and every row has plain words', () => {
  rowsOf(data).forEach((r) => {
    assert(r.label && r.label.length > 2, 'label for ' + r.key);
    assert(!/\[object|NaN|undefined|null/.test(r.label + ' ' + r.value + ' ' + r.note), r.key + ' = ' + r.value);
    assert(String(r.value).length > 0, 'value for ' + r.key);
  });
});

test('NUMBERS read cleanly: no floating-point noise, percentages and multipliers marked', () => {
  const by = {}; rowsOf(data).forEach((r) => { by[r.key] = r.value; });
  assert.strictEqual(by['assumptions.shopVisitDropPerExtraTripMin'], '1.2%');
  assert.strictEqual(by['assumptions.heatwaveWalkPenaltyMultiplier'], '×1.5');
  assert.strictEqual(by['assumptions.peakHourShare'], '40%');
  assert.strictEqual(by['budget.businessTaxRate'], '8%');
  assert(/on · cuts 10% a day · floor 40%/.test(by['budget.austerity']), by['budget.austerity']);
  rowsOf(data).forEach((r) => assert(!/\d\.\d{7,}/.test(r.value), r.key + ' = ' + r.value));
});

test('SOURCE: a setting the city file leaves out is marked as a built-in default', () => {
  const d = JSON.parse(JSON.stringify(data)); delete d.assumptions.busAccessMin;
  const row = A.groups(d, Eco.ecfg(d)).reduce((a, g) => a.concat(g.rows), []).find((r) => r.key === 'assumptions.busAccessMin');
  assert.strictEqual(row.from, 'built-in default');
  assert.strictEqual(rowsOf(data).find((r) => r.key === 'assumptions.busAccessMin').from, 'city file');
});

test('UNKNOWN settings are still shown, under their own name', () => {
  const d = JSON.parse(JSON.stringify(data)); d.assumptions.mysteryKnob = 7; d.budget.rainyDayFund = 123;
  const rows = A.groups(d, Eco.ecfg(d)).reduce((a, g) => a.concat(g.rows), []);
  const mk = rows.find((r) => r.key === 'assumptions.mysteryKnob'), rf = rows.find((r) => r.key === 'budget.rainyDayFund');
  assert(mk && mk.label === 'Mystery knob' && mk.value === '7');
  assert(rf && rf.label === 'Rainy day fund' && rf.value === '123');
});

test('OTHER CITIES: the table works for the example city, and for a bare-bones file', () => {
  const v = CityFile.validate(example, data);
  assert(v.ok);
  assert(rowsOf(v.data).length >= 60);
  const bare = { name: 'Bare', neighbourhoods: [], roads: [], busLines: [] };
  assert.doesNotThrow(() => A.groups(bare, Eco.ecfg(bare)));
  assert.doesNotThrow(() => A.groups({}, null));
});

test('HOSTILE: odd keys and values in a file cannot crash it or fake a row', () => {
  const d = JSON.parse('{"assumptions":{"__proto__x":1,"<b>x</b>":"<img src=x onerror=alert(1)>","deep":{"a":{"b":[1,2,{"c":3}]}}},"budget":{"austerity":"yes"},"events":[null,5,{"id":"e"}],"businesses":[null]}');
  const rows = A.groups(d, d.assumptions).reduce((a, g) => a.concat(g.rows), []);
  assert(rows.some((r) => r.value.indexOf('<img') === 0), 'markup stays as text for the page to escape');
  assert(rows.every((r) => typeof r.label === 'string' && typeof r.value === 'string'));
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
