// Hospitals and schools (Day 8): access follows the same roads, buses and floods as the commute.
const assert = require('assert');
const Sim = require('../src/sim');
const Economy = require('../src/economy');
const Events = require('../src/events');
const Services = require('../src/services');
const data = require('../data/city.json');

const cfg = Sim.config(data), agents = Sim.generateAgents(data, cfg), normal = Economy.normalCity(data, agents, cfg);
function run(list) {
  const sc = Events.build(data, list);
  const T = Economy.runCity(data, agents, Economy.effective(data, sc, 1, 1), normal, cfg);
  return Services.access(data, T);
}
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; } }

const base = run([]);

test('the city has hospitals and schools, each in a real neighbourhood', () => {
  assert(Services.has(data));
  const ids = data.neighbourhoods.map((n) => n.id);
  Services.facilities(data).forEach((f) => { assert(ids.includes(f.at), f.id); assert(['hospital', 'school'].includes(f.type)); assert(f.capacity > 0); });
  assert(Services.facilities(data).some((f) => f.type === 'hospital') && Services.facilities(data).some((f) => f.type === 'school'));
});
test('people counted: every neighbourhood and the city add up', () => {
  const R = data.assumptions.agentRepresentsResidents, pop = data.neighbourhoods.reduce((s, n) => s + n.agents * R, 0);
  assert(Math.abs(base.city.hospital.people - pop * data.services.healthNeedShare) < 1e-6);
  assert(Math.abs(base.city.school.people - pop * data.services.schoolAgeShare) < 1e-6);
  const sum = base.byNbhd.reduce((s, n) => s + n.hospital.people, 0);
  assert(Math.abs(sum - base.city.hospital.people) < 1e-6);
  const cars = base.city.hospital.byCar.car.people + base.city.hospital.byCar.nocar.people;
  assert(Math.abs(cars - base.city.hospital.people) < 1e-6, 'car owners + no car should be everyone');
});
test('normal city: shares are between 0 and 1, and people without a car have worse access', () => {
  ['hospital', 'school'].forEach((t) => { const c = base.city[t]; assert(c.share >= 0 && c.share <= 1); assert(c.avgMin > 0); });
  assert(base.city.hospital.byCar.nocar.share <= base.city.hospital.byCar.car.share + 1e-9);
});
test('closing the main bridge worsens hospital access and does not improve schools', () => {
  const a = run([{ id: 'bridge_close', params: { roadId: 'e3' } }]);
  assert(a.city.hospital.share < base.city.hospital.share - 0.05, a.city.hospital.share + ' vs ' + base.city.hospital.share);
  assert(a.city.hospital.avgMin > base.city.hospital.avgMin);
  assert(a.city.school.share <= base.city.school.share + 1e-9);
  const nf = (x) => x.byNbhd.find((n) => n.id === 'northfield').hospital.withinShare;
  assert(nf(a) < nf(base), 'Northfield is the area cut off by the Crown Bridge');
});
test('a flood cuts access further than the bridge alone, and a strike hurts the people without cars', () => {
  const flood = run([{ id: 'flood' }]), strike = run([{ id: 'strike' }]);
  assert(flood.city.hospital.share < run([{ id: 'bridge_close', params: { roadId: 'e3' } }]).city.hospital.share);
  assert(strike.city.hospital.byCar.nocar.share < base.city.hospital.byCar.nocar.share - 0.05);
  assert(strike.city.hospital.byCar.car.share >= strike.city.hospital.byCar.nocar.share);
});
test('taking a hospital out of action sends its patients elsewhere and overloads that one', () => {
  const a = run([{ id: 'service_close', params: { serviceId: 'bay_general' } }]);
  const bg = a.facilities.find((f) => f.id === 'bay_general'), hh = a.facilities.find((f) => f.id === 'harbor_health');
  assert(!bg.open && bg.assigned === 0);
  assert(hh.load > 2 * base.facilities.find((f) => f.id === 'harbor_health').load - 0.01, 'Harbor Health Centre should take the extra load');
  assert(a.city.hospital.share < base.city.hospital.share - 0.2);
  // Patients are never lost or invented: everyone with a route is assigned to one open hospital.
  const sent = a.facilities.filter((f) => f.type === 'hospital').reduce((s, f) => s + f.assigned, 0);
  assert(sent <= a.city.hospital.people + 1e-6 && sent > 0.95 * a.city.hospital.people);
});
test('closing every hospital leaves nobody with access', () => {
  const a = run([{ id: 'service_close', params: { serviceId: 'bay_general' } }, { id: 'service_close', params: { serviceId: 'harbor_health' } }]);
  assert.strictEqual(a.city.hospital.within, 0);
  assert(a.byNbhd.every((n) => n.hospital.timeMin === null));
  assert(Math.abs(a.city.hospital.noRoute - a.city.hospital.people) < 1e-6);
});
test('unknown service ids are refused and the description names the building', () => {
  assert.throws(() => Events.build(data, [{ id: 'service_close', params: { serviceId: 'constructor' } }]));
  const sc = Events.build(data, [{ id: 'service_close', params: { serviceId: 'bay_general' } }]);
  assert(/Bay General Hospital out of action/.test(Events.describe(data, sc)));
});
test('a city file without services works (access is empty, nothing breaks)', () => {
  const d2 = JSON.parse(JSON.stringify(data)); delete d2.services;
  assert(!Services.has(d2));
  const T = Economy.runCity(d2, agents, {}, normal, cfg);
  const a = Services.access(d2, T);
  assert.strictEqual(a.facilities.length, 0);
});
test('the same scenario always gives the same access (deterministic)', () => {
  assert.deepStrictEqual(run([{ id: 'flood' }]).city, run([{ id: 'flood' }]).city);
});
console.log('\n' + passed + ' passed');
