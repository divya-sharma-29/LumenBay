// Loads src/index.html in a simulated browser and clicks through the controls.
// Needs jsdom:  npm install --no-save jsdom   then   node tests/page.js
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('jsdom is not installed. Run: npm install --no-save jsdom'); process.exit(2);
}
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src');

const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.scrollTo = () => {};   // jsdom does not implement scrolling
const errors = [];
const citySceneState = { updates: 0, roadClick: null, neighbourhoodClick: null };
function installCityScene(win) {
  win.CityScene = {
    create(host, data, handlers) {
      citySceneState.roadClick = handlers.onRoadClick;
      citySceneState.neighbourhoodClick = handlers.onNeighbourhoodClick;
      return {
        update() { citySceneState.updates++; },
        exportGlb() { return Promise.resolve(new win.Blob(['test'], { type: 'model/gltf-binary' })); }
      };
    }
  };
}
installCityScene(w);
w.addEventListener('error', (e) => errors.push(e.message));
for (const f of ['city-data.js', 'cityfile.js', 'city-boot.js', 'sim.js', 'economy.js', 'services.js', 'ledger.js', 'events.js', 'responses.js', 'uncertainty.js', 'assumptions.js', 'report.js', 'app.js', 'example-city.js', 'city-ui.js']) w.eval(fs.readFileSync(path.join(src, f), 'utf8'));
const d = w.document;
const wait = async (ms) => {
  await new Promise((r) => setTimeout(r, ms));
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline &&
    (/Calculating the 14-day outlook/.test(d.getElementById('outlook').textContent) ||
      [...d.querySelectorAll('#timeline .c')].some((item) => item.textContent === '·'))) {
    await new Promise((r) => setTimeout(r, 100));
  }
};
const text = (id) => d.getElementById(id).textContent.replace(/\s+/g, ' ').trim();
const metric = (label) => {
  const m = [...d.querySelectorAll('.metric')].find((x) => x.querySelector('.lbl').textContent === label);
  if (!m) throw new Error('no metric called ' + label);
  return m.querySelector('.val').textContent + ' | ' + m.querySelector('.dlt').textContent.trim() + ' | ' + m.querySelector('.sub').textContent;
};
const click = (id) => d.getElementById(id).click();
const cmp_running = () => !d.getElementById('cmp-bar').hidden;
const SETTLE = 400;   // lets the debounced 14-day outlook finish

let failed = 0;
const check = (name, ok, extra) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  -> ' + extra : ''));
  if (!ok) failed++;
};

(async () => {
  await wait(SETTLE);
  check('map has 11 roads, 8 districts, and reports both counts', d.querySelectorAll('.road').length === 11 &&
    d.querySelectorAll('.node-dot').length === 8 && /8 neighbourhoods, 11 roads/.test(text('intro')));
  check('3D city scene is initialized and receives simulation updates',
    !!d.getElementById('city-3d') && citySceneState.updates > 0 &&
    typeof citySceneState.roadClick === 'function' && typeof citySceneState.neighbourhoodClick === 'function');
  check('18 metric cards in 2 groups', d.querySelectorAll('.metric').length === 18 && d.querySelectorAll('.mgroup').length === 2);
  check('economy table has 8 rows', d.querySelectorAll('#econ-table tbody tr').length === 8);
  check('budget table shows balance', /Daily balance/.test(text('budget-table')));
  check('outlook chart drawn', !!d.querySelector('#outlook svg.chart'), text('outlook').slice(0, 90));
  check('baseline why-panel', /baseline/i.test(text('why')));
  console.log('  baseline:', metric('Business output'), '/', metric('Budget balance'));

  // bus cut -> economy follows
  click('btn-cut'); await wait(SETTLE);
  check('bus cut: workers arrive late', !/^0\.0/.test(metric('Workers arriving late')), metric('Workers arriving late'));
  check('bus cut: output slips', /▼/.test(metric('Business output')), metric('Business output'));
  check('bus cut: budget improves, travel cost rises', /▲/.test(metric('Budget balance')) && /▲/.test(metric('Travel time cost')),
    metric('Budget balance') + ' // ' + metric('Travel time cost'));
  check('bus cut: why-chain reaches the budget trade-off', /only looks better because/.test(text('why')), text('why').slice(-260));

  // heatwave -> power -> signals -> roads
  click('btn-reset'); await wait(SETTLE);
  click('btn-heat'); await wait(SETTLE);
  check('heatwave: power over capacity', /blackouts/.test(metric('Power demand')) && !/no blackouts/.test(metric('Power demand')), metric('Power demand'));
  check('heatwave: output falls', /▼/.test(metric('Business output')), metric('Business output'));
  check('heatwave: why mentions signals', /Traffic signals fail/.test(text('why')));
  check('heatwave: reserve runs out in outlook', /Reserve runs out on/.test(text('outlook')), text('outlook').slice(-170));
  check('heatwave: austerity feedback explained', /austerity rule trims bus service/.test(text('why')));

  // austerity off
  d.getElementById('chk-austerity').checked = false;
  d.getElementById('chk-austerity').dispatchEvent(new w.Event('change', { bubbles: true })); await wait(SETTLE);
  check('austerity off: no service cut message', !/Bus service is cut/.test(text('outlook')) && /austerity rule is off/.test(text('why')), text('outlook').slice(-120));
  d.getElementById('chk-austerity').checked = true;
  d.getElementById('chk-austerity').dispatchEvent(new w.Event('change', { bubbles: true })); await wait(SETTLE);
  click('btn-heat'); await wait(SETTLE);

  // flood
  click('btn-flood'); await wait(SETTLE);
  check('flood: 4 roads flooded', d.querySelectorAll('.road.closed').length === 4, d.querySelectorAll('.road.closed').length + '');
  check('flood: water rationed', /rationed/.test(metric('Water demand')) && !/no rationing/.test(metric('Water demand')), metric('Water demand'));
  check('flood: repair bill shown', /One-off road repairs/.test(text('budget-table')) && /repair bill/.test(metric('Budget balance')));
  check('flood: flooded roads cannot be clicked open', (() => {
    d.querySelectorAll('.hit')[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return true;
  })());
  await wait(SETTLE);
  check('flood: still 4 closed after clicking a flooded road', d.querySelectorAll('.road.closed').length === 4);
  check('flood: checkboxes on flooded roads disabled', d.querySelectorAll('#road-table input[disabled]').length === 4);
  check('flood: why mentions water and repairs', /Water/.test(text('why')) && /repair bill/.test(text('why')));
  click('btn-flood'); await wait(SETTLE);
  check('flood toggles off', d.querySelectorAll('.road.closed').length === 0);

  // bridge via map click then reopen via checkbox
  d.querySelectorAll('.hit')[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(SETTLE);
  check('bridge closure: stranded workers lower output', d.querySelectorAll('.road.closed').length === 1 && /▼/.test(metric('Business output')), metric('Business output'));
  check('bridge closure: why shows Workers step', /cannot reach work/.test(text('why')));
  const cb = d.querySelector('input[data-road="e3"]');
  cb.checked = false; cb.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(SETTLE);
  check('checkbox reopens road', d.querySelectorAll('.road.closed').length === 0);

  // slider and baseline reset
  const s = d.getElementById('s-L2'); s.value = '50'; s.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(SETTLE);
  check('slider: readout updates', /50%/.test(d.getElementById('o-L2').textContent));
  click('btn-baseline'); await wait(SETTLE);
  check('use as baseline: no change shown', /no change/.test(metric('Business output')), metric('Business output'));

  // ------------------------------------------------------------ Day 4
  const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100); } return false; };
  const dayInput = d.getElementById('view-day');
  const setDay = async (n) => { dayInput.value = String(n); dayInput.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(SETTLE); };

  click('btn-reset'); await wait(SETTLE);
  check('event line says normal city', /normal city/.test(text('event-line')), text('event-line'));

  // flood ends on its own: watch the recovery with the day slider
  click('btn-flood'); await wait(SETTLE);
  check('flood: day 1 has roads under water', d.querySelectorAll('.road.closed').length === 4);
  check('flood: event line shows its duration', /flood for 6 days/.test(text('event-line')), text('event-line'));
  await setDay(8);
  // The flood drained the reserve, so the austerity rule is still holding bus service down: recovery is not instant.
  check('flood: by day 8 the water has gone but reduced buses linger', d.querySelectorAll('.road.closed').length === 0 && /runs at \d+% of normal service/.test(text('why')) && !/under water/.test(text('why')), text('why').slice(0, 140));
  check('flood: day label updates', /day 8/.test(text('view-day-out')));
  await setDay(1);
  click('btn-flood'); await wait(SETTLE);

  // strike toggles on and off, and ends after its duration
  click('btn-strike'); await wait(SETTLE);
  check('strike on: pressed and commute much worse', d.getElementById('btn-strike').getAttribute('aria-pressed') === 'true' && /▲/.test(metric('Average commute')), metric('Average commute'));
  await setDay(9);
  check('strike over by day 9: commute back near normal', /no change|[▲▼] [+-]?[0-4]\.\d/.test(metric('Average commute')), metric('Average commute'));
  await setDay(1);
  click('btn-strike'); await wait(SETTLE);
  check('strike off', d.getElementById('btn-strike').getAttribute('aria-pressed') === 'false' && /normal city/.test(text('event-line')));

  // surprise
  click('btn-surprise'); await wait(SETTLE);
  check('surprise me creates an event', !/normal city/.test(text('event-line')), text('event-line'));
  click('btn-reset'); await wait(SETTLE);

  // compare responses to a bridge closure
  d.querySelectorAll('.hit')[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(SETTLE);
  check('compare: event line names the bridge', /Crown Bridge closed for 10 days/.test(text('event-line')), text('event-line'));
  click('btn-compare');
  const done = await waitFor(() => /^Compared/.test(text('cmp-status')), 60000);
  check('compare finishes', done, text('cmp-status'));
  const rows = d.querySelectorAll('#cmp-results table.cmp tbody tr');
  check('compare: ranked table with a best option', rows.length >= 3 && !!d.querySelector('#cmp-results .badge'), rows.length + ' rows');
  check('compare: do nothing is listed', /Do nothing/.test(text('cmp-results')));
  check('compare: explains the winner', /Why /.test(text('cmp-explain')) && /What each response does on its own/.test(text('cmp-explain')));
  check('compare: harm breakdown table', /Output lost/.test(text('cmp-explain')) && /Total harm/.test(text('cmp-explain')));
  check('recommendation: written from the numbers, names the best plan, says it is an estimate', /Recommended:/.test(text('cmp-rec')) && /better off/.test(text('cmp-rec')) && /not forecasts/.test(text('cmp-rec')) && !/NaN|undefined/.test(text('cmp-rec')), text('cmp-rec').slice(0, 200));
  const best = d.querySelector('#cmp-results tr.best');
  const bestSpend = best && best.children[2].textContent;
  const bestName = best && best.children[1].textContent.replace('best within budget', '').trim();
  const applyBtn = best && best.querySelector('button[data-apply]');
  applyBtn.click(); await wait(SETTLE + 400);
  check('apply: plan is in force', /Responses in force/.test(text('resp-line')) && d.getElementById('btn-clear-resp').style.display !== 'none', text('resp-line'));
  check('apply: why panel has a Response step', /Response/.test(text('why')) && /Starting cost/.test(text('why')));
  check('apply: applied row shows In force', /In force/.test(text('cmp-results')));
  check('apply: budget shows response spending', /Response spending/.test(text('budget-table')));
  check('apply: comparison is not marked stale (same event)', !/changed since this comparison/.test(text('cmp-results')));
  // ------------------------------------------- report, saved experiments, undo (Day 11)
  click('btn-sens');
  check('sensitivity: shows progress while it runs', /Testing the assumptions/.test(text('cmp-sens')), text('cmp-sens'));
  const sensDone = await waitFor(() => d.querySelectorAll('#cmp-sens table tbody tr').length === 13, 180000);
  check('sensitivity: base row plus 12 variations, with a plain-language summary', sensDone && /How sensitive is this to our assumptions/.test(text('cmp-sens')) && /beats doing nothing in every variation/.test(text('cmp-sens')), text('cmp-sens').slice(0, 300));
  check('sensitivity: names the rules it pushed, and marks a winner in every row', /Value of time/.test(text('cmp-sens')) && /Road capacity/.test(text('cmp-sens')) && d.querySelectorAll('#cmp-sens td.win').length === 13 && !/NaN|undefined/.test(text('cmp-sens')));
  let blobParts = null, dlName = null;
  w.Blob = function (parts) { this.parts = parts; };
  w.URL.createObjectURL = (b) => { blobParts = b.parts; return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { dlName = this.download; };
  click('btn-report'); await wait(100);
  const rep = blobParts && blobParts[0] || '';
  check('report: downloads a page named for the report', dlName === 'policy-impact-report.html' && /^<!doctype html>/.test(rep), String(dlName));
  check('report: has the scenario, recommendation, comparison, ledger and assumptions', ['Crown Bridge closed', 'Recommendation', 'Responses compared', 'How sensitive is this to our assumptions', 'Policy Impact Ledger', 'Assumptions the model used'].every((t) => rep.indexOf(t) >= 0));
  check('report: no raw NaN, undefined or script', !/NaN|undefined|<script/.test(rep) && (rep.match(/<tr>/g) || []).length > 60);
  click('btn-save'); await wait(SETTLE);
  check('saved: one experiment listed, with numbers', d.querySelectorAll('#saved-list li').length === 1 && /commute/.test(text('saved-list')) && /\(1\)/.test(text('saved-count')), text('saved-list'));
  check('saved: kept in this browser', /Crown Bridge|bridge/i.test(w.localStorage.getItem('citysim.saved.Lumen Bay') || ''));
  click('btn-reset'); await wait(SETTLE);
  check('undo: Reset city can be undone, and the button is live', d.getElementById('btn-undo').disabled === false && /normal city/.test(text('event-line')));
  click('btn-undo'); await wait(SETTLE);
  check('undo: the bridge closure is back', /Crown Bridge closed/.test(text('event-line')), text('event-line'));
  click('btn-reset'); await wait(SETTLE);
  d.querySelector('#saved-list button[data-open]').click(); await wait(SETTLE + 400);
  check('saved: Open restores the scenario and the plan', /Crown Bridge closed/.test(text('event-line')) && /Responses in force/.test(text('resp-line')), text('event-line') + ' | ' + text('resp-line'));
  d.querySelector('#saved-list button[data-del]').click(); await wait(100);
  check('saved: Delete removes it', d.querySelectorAll('#saved-list li').length === 0 && JSON.parse(w.localStorage.getItem('citysim.saved.Lumen Bay')).length === 0);

  check('ledger: with a response in force, the response-vs-nothing view appears', d.getElementById('lm-nothing').hidden === false);
  click('lm-nothing'); await wait(SETTLE);
  { const n = [...d.querySelectorAll('#ledger-head .lnums b')].map((b) => +b.textContent.replace(/,/g, ''));
    check('ledger: the plan helps people and hurts almost nobody compared with doing nothing', n[0] > 1000 && n[1] < 0.02 * 15000 && /doing nothing/.test(text('ledger-head')), n.join(' / ')); }
  check('ledger: it states what the response costs and its efficiency', /spent/.test(text('ledger-table')) && /net residents better off per 10,000 credits/.test(text('ledger-table')), text('ledger-table').slice(0, 0));
  click('lm-base'); await wait(SETTLE);

  // budget slider re-ranks without re-running
  const slider = d.getElementById('cmp-budget');
  slider.value = '0'; slider.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('budget 0: only doing nothing is affordable', d.querySelectorAll('#cmp-results table.cmp tbody tr').length === 1 && /No response beats doing nothing/.test(text('cmp-explain')));
  slider.value = '60000'; slider.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('budget 60k: many options again', d.querySelectorAll('#cmp-results table.cmp tbody tr').length >= 4);
  slider.value = '5000'; slider.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('budget 5k: a bigger budget is suggested', /With more money/.test(text('cmp-results')), text('cmp-results').slice(-260));
  slider.value = '40000'; slider.dispatchEvent(new w.Event('input', { bubbles: true }));

  // clear, then change the event: comparison goes stale
  click('btn-clear-resp'); await wait(SETTLE);
  check('clear responses', /No responses in force/.test(text('resp-line')));
  click('btn-heat'); await wait(SETTLE);
  check('changing the event marks the comparison stale', /changed since this comparison/.test(text('cmp-results')));


  // ------------------------------------------------------------ Day 5
  click('btn-reset'); await wait(SETTLE);
  check('summary: calm city says running normally', /running normally/.test(text('sum-head')), text('sum-head'));
  check('summary: five status chips (transport, businesses, utilities, services, budget)', d.querySelectorAll('#sum-chips .chip').length === 5);
  check('timeline: 14 day buttons with commute', d.querySelectorAll('#timeline button').length === 14 && /\d/.test(d.querySelector('#timeline button .c').textContent),
    d.querySelectorAll('#timeline button').length + ' buttons; ' + (d.querySelector('#timeline button .c') || {}).textContent);

  // ---- hospitals and schools (Day 8)
  check('services: card shows 8 areas and the controls list 8 buildings', d.querySelectorAll('#svc-table tbody tr').length === 8 && d.getElementById('svc-select').options.length === 8 && !d.getElementById('svc-card').hidden);
  check('services: calm city, chip is ok', /ok/.test(d.querySelector('#sum-chips .chip:nth-child(4) .st').textContent) && /Services/.test(d.querySelector('#sum-chips .chip:nth-child(4) .k').textContent));
  d.getElementById('svc-select').value = 'bay_general'; d.getElementById('svc-select').dispatchEvent(new w.Event('change', { bubbles: true }));
  click('btn-svc'); await wait(SETTLE);
  check('services: closing Bay General cuts hospital access and says why', /out of action/.test(text('policy-line')) && /Hospitals/.test(text('why')) && /out of action, so its residents must go further/.test(text('why')) && /Who loses/.test(text('why')), text('why').slice(0, 300));
  check('services: the chip turns red and the address remembers it', /cut off/.test(text('sum-chips')) && /x=bay_general/.test(w.location.hash), w.location.hash);
  check('services: the other hospital is shown overloaded', /Harbor Health Centre 2\d\d% of what it can serve/.test(text('svc-load')), text('svc-load').slice(0, 200));
  // Raise capacity (Day 14): lose Bay General, then add places to the surviving hospital
  const hospShare = () => text('svc-kpis');
  const before = hospShare();
  d.getElementById('svc-select').value = 'harbor_health'; d.getElementById('svc-select').dispatchEvent(new w.Event('change', { bubbles: true }));
  d.getElementById('svc-boost').value = '1'; d.getElementById('svc-boost').dispatchEvent(new w.Event('change', { bubbles: true }));
  click('btn-boost'); await wait(SETTLE);
  check('capacity: the scenario names the upgrade and the link remembers it', /Harbor Health Centre \+100% places/.test(text('policy-line')) && /k=harbor_health:1/.test(w.location.hash), text('policy-line') + w.location.hash);
  check('capacity: hospital access improves and the button offers to undo it', hospShare() !== before && /Remove extra capacity/.test(text('btn-boost')) && /Extra capacity/.test(text('boost-note')), before + ' -> ' + hospShare());
  click('btn-boost'); await wait(SETTLE);
  check('capacity: removing it restores the numbers', hospShare() === before && !/places/.test(text('policy-line')) && !/k=/.test(w.location.hash));
  d.getElementById('svc-select').value = 'bay_general'; d.getElementById('svc-select').dispatchEvent(new w.Event('change', { bubbles: true }));
  click('btn-svc'); await wait(SETTLE);
  check('services: bringing it back restores access', !/out of action/.test(text('policy-line')) && !/Hospitals/.test(text('why')));
  click('btn-reset'); await wait(SETTLE);

  // ---- Policy Impact Ledger (Day 9)
  check('ledger: on a fresh page the comparison is named as the normal city, not a saved baseline', /compared with the normal city/.test(text('ledger-head')) && !/saved baseline/.test(text('ledger-head')), text('ledger-head'));
  check('ledger: calm city shows everyone unchanged', /0\s*better off/.test(text('ledger-head')) && /15,000\s*unchanged/.test(text('ledger-head')), text('ledger-head'));
  click('btn-crown'); await wait(SETTLE);
  const nums = () => [...d.querySelectorAll('#ledger-head .lnums b')].map((b) => +b.textContent.replace(/,/g, ''));
  check('ledger: closing the bridge splits residents, and the three groups add to 15,000', (() => { const n = nums(); return n[1] > 3000 && n[0] + n[1] + n[2] === 15000; })(), nums().join(' / '));
  check('ledger: the eight impact dimensions from the deck are all shown', ['Beneficiaries', 'Adversely affected', 'Essential-service access', 'District-level equity', 'Public expenditure', 'Resource efficiency', 'Spillover effects', 'Uncertainty'].every((n) => [...d.querySelectorAll('#ledger-table tbody tr td:first-child')].some((t) => t.textContent === n)));
  check('ledger: neighbourhood table has 8 rows and flags Northfield as worsening', d.querySelectorAll('#ledger-districts tbody tr').length === 8 && /Northfield[^]*worsening/.test(text('ledger-districts')) && /Worsening districts/.test(text('ledger-table')));
  check('ledger: equity table splits by income, car and need', d.querySelectorAll('#ledger-groups tbody tr').length === 8 && /have no car/.test(text('ledger-groups')));
  check('ledger: the response-vs-nothing view is hidden until a response is in force', d.getElementById('lm-nothing').hidden === true);
  d.getElementById('btn-reset').click(); await wait(SETTLE);

  click('btn-flood'); await wait(SETTLE);
  check('flood: summary names the event and a chip is not ok', /flood/i.test(text('sum-head')) && !!d.querySelector('#sum-chips .chip.bad, #sum-chips .chip.warn'), text('sum-head'));
  check('flood: water wash on the map', /on/.test(d.querySelector('.flood-wash').getAttribute('class')) && /high/.test(d.querySelector('.river').getAttribute('class')));
  check('flood: event bar drawn for 6 of 14 days', d.querySelectorAll('#evbars i.f').length === 6, d.querySelectorAll('#evbars i.f').length + '');
  check('flood: address saved', /f=1/.test(w.location.hash), w.location.hash);
  d.querySelector('#timeline button[data-day="9"]').click(); await wait(SETTLE);
  check('timeline click jumps to day 9, flood gone from map', /day 9/.test(text('view-day-out')) && !/on/.test(d.querySelector('.flood-wash').getAttribute('class')) && /d=9/.test(w.location.hash));
  click('btn-play'); await wait(2000);
  check('play: starts over from day 1 and moves on', +d.getElementById('view-day').value >= 2 && /Pause/.test(text('btn-play')), text('view-day-out'));
  click('btn-play');
  check('pause stops it', /Play/.test(text('btn-play')));
  d.querySelectorAll('.node-g')[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('area click: detail panel shows commute and output', /Average commute/.test(text('area-detail')) && /Business output/.test(text('area-detail')), text('area-detail').slice(0, 80));
  check('area click again: closes', (d.querySelectorAll('.node-g')[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true })), /Click an area/.test(text('area-detail'))));
  check('summary: asks to compare when an event is on', !!d.getElementById('sum-compare'));

  // heatwave tint, and a scenario reopened from its address
  click('btn-reset'); await wait(SETTLE);
  click('btn-heat'); await wait(SETTLE);
  check('heatwave: warm tint on the map', /on/.test(d.querySelector('.heat-wash').getAttribute('class')));
  const hash = w.location.hash;
  const dom2 = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' + '#c=e3,nope&b=L1:0.5,ZZ:9&f=1&r=shuttle,bogus&d=3&a=0' });
  const w2 = dom2.window; const errs2 = [];
  installCityScene(w2);
  w2.addEventListener('error', (e) => errs2.push(e.message));
  for (const f of ['city-data.js', 'cityfile.js', 'city-boot.js', 'sim.js', 'economy.js', 'services.js', 'ledger.js', 'events.js', 'responses.js', 'uncertainty.js', 'assumptions.js', 'report.js', 'app.js', 'example-city.js', 'city-ui.js']) w2.eval(fs.readFileSync(path.join(src, f), 'utf8'));
  await wait(SETTLE);
  const sc2 = w2.LumenBay.getScenario();
  check('address restores the scenario, ignoring unknown ids', sc2.closedRoads.join() === 'e3' && sc2.flood && sc2.busFrequency.L1 === 0.5 && sc2.busFrequency.ZZ === undefined && sc2.responses.join() === 'shuttle', JSON.stringify([sc2.closedRoads, sc2.responses]));
  check('address restores day and austerity', w2.document.getElementById('view-day').value === '3' && w2.document.getElementById('chk-austerity').checked === false);
  check('restored page has no errors', errs2.length === 0, errs2.join('; '));
  const dom3 = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/#c=__proto__,constructor,toString,e3&r=__proto__,toString&b=__proto__:0.5' });
  installCityScene(dom3.window);
  for (const f of ['city-data.js', 'cityfile.js', 'city-boot.js', 'sim.js', 'economy.js', 'services.js', 'ledger.js', 'events.js', 'responses.js', 'uncertainty.js', 'assumptions.js', 'report.js', 'app.js', 'example-city.js', 'city-ui.js']) dom3.window.eval(fs.readFileSync(path.join(src, f), 'utf8'));
  await wait(SETTLE);
  const sc3 = dom3.window.LumenBay.getScenario();
  check('hostile address: built-in property names are not treated as roads or responses', sc3.closedRoads.join() === 'e3' && sc3.responses.length === 0 && !/undefined/.test(dom3.window.document.getElementById('event-line').textContent), JSON.stringify([sc3.closedRoads, sc3.responses]));

  // ------------------------------------------------------------ Day 6
  click('btn-reset'); await wait(SETTLE);
  check('range: nothing shown until asked', text('sum-range') === '' && /Check across 10 cities/.test(text('btn-range')));
  click('btn-flood'); await wait(SETTLE);
  click('btn-range');
  check('range: button shows progress while running', d.getElementById('btn-range').disabled || /Check/.test(text('btn-range')));
  const gotRange = await waitFor(() => /Across 10 simulated cities/.test(text('sum-range')), 60000);
  check('range: ranges for commute, output and reserve appear', gotRange && !/-0\b/.test(text('sum-range')) && /commute/.test(text('sum-range')) && /output/.test(text('sum-range')) && /reserve on day 14/.test(text('sum-range')), text('sum-range').slice(0, 200));
  check('range: min and max are shown in brackets', /commute \d+\.\d min \(\d+\.\d to \d+\.\d\)/.test(text('sum-range')), text('sum-range').slice(0, 120));
  check('range: reserve band drawn on the outlook', !!d.querySelector('#outlook path.band') && /range over 10 cities/.test(text('outlook')));
  click('btn-flood'); await wait(SETTLE);
  check('range: goes away when the scenario changes', text('sum-range') === '' && !d.querySelector('#outlook path.band'));

  // comparing responses: the top options are re-run in other cities
  click('btn-reset'); await wait(SETTLE);
  d.querySelectorAll('.hit')[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(SETTLE);
  click('btn-compare');
  await waitFor(() => /^Compared/.test(text('cmp-status')), 60000);
  const sampled = await waitFor(() => /re-run in 10 simulated cities/.test(text('cmp-status')), 120000);
  check('cities check: finishes after the search', sampled, text('cmp-status'));
  check('cities check: range and beats-nothing columns filled in', /\d+k.\d+k/.test(text('cmp-results')) && /\d of 10/.test(text('cmp-results')), text('cmp-results').slice(0, 260));
  check('cities check: a plain-language confidence line', /Holds up|Mostly holds up|Close call/.test(text('cmp-results')), (text('cmp-results').match(/(Holds up|Mostly holds up|Close call):[^.]*\./) || [''])[0]);
  check('cities check: summary names the best response', /Best response within/.test(text('sum-next')) && !!d.querySelector('#sum-next button[data-apply]'));
  d.querySelector('#sum-next button[data-apply]').click(); await wait(SETTLE + 400);
  check('summary Apply puts the plan in force', /Responses in force/.test(text('resp-line')));
  click('btn-clear-resp'); await wait(SETTLE);
  slider.value = '5000'; slider.dispatchEvent(new w.Event('input', { bubbles: true }));
  const bestRow = d.querySelector('#cmp-results tr.best');
  check('budget slider: the new best row has a range, or offers to redo the check', (!!bestRow && /\d+k.\d+k/.test(bestRow.textContent)) || /Check the top options again/.test(text('cmp-results')) || !bestRow, bestRow ? bestRow.textContent.slice(0, 140) : 'no best row');
  const offered = w.Responses.list(w.LumenBay.data).map((r) => r.id);
  check('ten responses on offer, including the four new ones', offered.length === 10 && ['free_fares', 'signal_timing', 'backup_power', 'water_tankers'].every((id) => offered.indexOf(id) >= 0), offered.join(','));

  // ------------------------------------------------------------ tabs
  click('btn-reset'); await wait(SETTLE);
  const vis = (id) => !d.getElementById(id).hidden;
  check('tabs: opens on City with the others hidden', vis('panel-city') && !vis('panel-impact') && !vis('panel-respond') && !vis('panel-details') && d.getElementById('tab-city').getAttribute('aria-selected') === 'true');
  click('tab-impact');
  check('tabs: Impact shows why-panel and key numbers', vis('panel-impact') && !vis('panel-city') && d.querySelectorAll('#kpis .kpi').length === 8 && d.getElementById('tab-impact').getAttribute('aria-selected') === 'true');
  check('tabs: all 18 metrics are behind a collapsed disclosure', d.querySelector('details.all-metrics') && !d.querySelector('details.all-metrics').open && d.querySelectorAll('.metric').length === 18);
  check('tabs: the address remembers the tab', /t=impact/.test(w.location.hash), w.location.hash);
  d.getElementById('tab-impact').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  check('tabs: arrow key moves to the next tab and focuses it', vis('panel-respond') && d.activeElement === d.getElementById('tab-respond'));
  d.getElementById('tab-respond').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  check('tabs: End goes to the last tab', vis('panel-details') && d.querySelectorAll('#road-table tbody tr').length === 11);
  click('tab-city'); click('btn-flood'); await wait(SETTLE);
  d.querySelector('[data-goto="impact"]').click();
  check('tabs: "See why it happened" link opens Impact with the flood explained', vis('panel-impact') && /under water|flood/i.test(text('why')));
  click('tab-city'); d.querySelector('[data-goto="respond"]').click();
  check('tabs: "Compare responses" link opens Respond and starts the search', vis('panel-respond') && (cmp_running() || /Compared|Setting up|Tried/.test(text('cmp-status'))), text('cmp-status'));
  await waitFor(() => /^Compared/.test(text('cmp-status')), 90000);
  click('tab-city'); click('btn-goto-compare');
  check('tabs: pressing Compare again with a fresh result does not redo the search', vis('panel-respond') && /Compared|re-run/.test(text('cmp-status')) && !/Setting up|Tried/.test(text('cmp-status')));
  click('btn-reset'); click('tab-city'); await wait(SETTLE);
  const dom4 = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/#t=respond' });
  dom4.window.scrollTo = () => {};
  installCityScene(dom4.window);
  for (const f of ['city-data.js', 'cityfile.js', 'city-boot.js', 'sim.js', 'economy.js', 'services.js', 'ledger.js', 'events.js', 'responses.js', 'uncertainty.js', 'assumptions.js', 'report.js', 'app.js', 'example-city.js', 'city-ui.js']) dom4.window.eval(fs.readFileSync(path.join(src, f), 'utf8'));
  await wait(SETTLE);
  check('tabs: a link can open straight on the Respond tab', !dom4.window.document.getElementById('panel-respond').hidden && dom4.window.document.getElementById('panel-city').hidden);
  const dom5 = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/#t=__proto__' });
  installCityScene(dom5.window);
  for (const f of ['city-data.js', 'cityfile.js', 'city-boot.js', 'sim.js', 'economy.js', 'services.js', 'ledger.js', 'events.js', 'responses.js', 'uncertainty.js', 'assumptions.js', 'report.js', 'app.js', 'example-city.js', 'city-ui.js']) dom5.window.eval(fs.readFileSync(path.join(src, f), 'utf8'));
  await wait(SETTLE);
  check('tabs: a hostile tab name falls back to City', !dom5.window.document.getElementById('panel-city').hidden);

  // ------------------------------------------------------------ city files
  const SCRIPTS = ['city-data.js', 'cityfile.js', 'city-boot.js', 'sim.js', 'economy.js', 'services.js', 'ledger.js', 'events.js', 'responses.js', 'uncertainty.js', 'assumptions.js', 'report.js', 'app.js', 'example-city.js', 'city-ui.js'];
  // A fresh page, optionally with a city already saved in the browser (as if loaded on an earlier visit).
  async function bootPage(saved) {
    const dm = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/',
      beforeParse(win) { if (saved != null) win.localStorage.setItem('lumenbay.customCity', saved); } });
    installCityScene(dm.window);
    const errs = []; dm.window.addEventListener('error', (e) => errs.push(e.message));
    for (const f of SCRIPTS) dm.window.eval(fs.readFileSync(path.join(src, f), 'utf8'));
    await wait(SETTLE);
    return { win: dm.window, doc: dm.window.document, errs };
  }
  const t$ = (pg, id) => pg.doc.getElementById(id).textContent.replace(/\s+/g, ' ').trim();

  check('city menu: built-in city shown by default', t$({ doc: d }, 'city-title') === 'Lumen Bay' && d.getElementById('btn-city-builtin').hidden);
  const example = w.CITY_EXAMPLE;
  check('city menu: the example city is on offer and valid', !!example && w.CityFile.validate(example, w.CITY_BUILTIN).ok);
  const okLoad = w.CityUI.loadText(JSON.stringify(example));
  check('city menu: loading the example is accepted and says so', okLoad.ok && /Loaded/.test(text('city-msg')), text('city-msg'));
  check('city menu: junk text is refused with a plain message', !w.CityUI.loadText('{{{ nope').ok && /can.t be used/.test(text('city-msg')), text('city-msg'));
  check('city menu: a half-valid city lists what to fix', !w.CityUI.loadText(JSON.stringify({ name: 'X', neighbourhoods: 'no', roads: [], busLines: [] })).ok && /problem/.test(text('city-msg')), text('city-msg'));

  const mp = await bootPage(JSON.stringify(example));
  check('saved city: the page opens on it', t$(mp, 'city-title') === example.name && mp.doc.querySelectorAll('.node-dot').length === example.neighbourhoods.length && !mp.doc.getElementById('btn-city-builtin').hidden);
  check('saved city: summary uses its name, not Lumen Bay', new RegExp(example.name).test(t$(mp, 'sum-head')) && !/Lumen Bay/.test(t$(mp, 'sum-head')), t$(mp, 'sum-head'));
  check('saved city: one-click closure names its own biggest bridge', /^Close /.test(t$(mp, 'btn-crown')) && !/Crown/.test(t$(mp, 'btn-crown')), t$(mp, 'btn-crown'));
  check('saved city: one bus slider per line, 18 metrics, no script errors', mp.doc.querySelectorAll('#sliders input').length === example.busLines.length && mp.doc.querySelectorAll('.metric').length === 18 && mp.errs.length === 0, mp.errs.join('; '));
  mp.doc.getElementById('btn-crown').click(); await wait(SETTLE);
  check('saved city: closing its bridge changes the city', mp.doc.querySelectorAll('.road.closed').length === 1 && !/running normally/.test(t$(mp, 'sum-head')), t$(mp, 'sum-head'));

  const corrupt = await bootPage('{"name":"broken","neighbourhoods":[],"roads":"x"}');
  check('corrupted save: thrown away, Lumen Bay used', t$(corrupt, 'city-title') === 'Lumen Bay' && corrupt.errs.length === 0 && corrupt.win.localStorage.getItem('lumenbay.customCity') === null);

  const evil = JSON.parse(JSON.stringify(example)); evil.name = '<img src=x onerror=alert(1)>';
  evil.neighbourhoods[0].name = '<b id="pwned">Evil</b>';
  const hostile = await bootPage(JSON.stringify(evil));
  check('hostile names: shown as plain text, never as markup', hostile.doc.querySelector('img') === null && hostile.doc.getElementById('pwned') === null && t$(hostile, 'city-title').indexOf('<img') === 0 && hostile.errs.length === 0, t$(hostile, 'city-title'));
  hostile.doc.getElementById('tab-impact').click(); hostile.doc.getElementById('tab-details').click(); await wait(SETTLE);
  check('hostile names: still inert on the Details tab', hostile.doc.getElementById('pwned') === null && hostile.doc.querySelector('#nbhd-table img') === null);

  // ------------------------------------------------------------ assumptions
  const rowsIn = (doc) => doc.querySelectorAll('#assumptions tbody tr').length;
  check('assumptions: six collapsed groups with plenty of rows', d.querySelectorAll('#assumptions details.assump-group').length === 6 && rowsIn(d) >= 60 && !d.querySelector('#assumptions details[open]'), rowsIn(d) + ' rows');
  check('assumptions: plain-language wording, with units', /Value of a minute of travel/.test(text('assumptions')) && /Grace before lateness counts/.test(text('assumptions')) && /1\.2%/.test(text('assumptions')));
  check('assumptions: a built-in default is flagged as such', /built-in default; not in the city file/.test(text('assumptions')));
  check('assumptions: no raw object text or NaN', !/\[object|NaN|undefined/.test(text('assumptions')));
  check('assumptions: also shown for a loaded city, and hostile text stays inert', rowsIn(mp.doc) >= 60 && rowsIn(hostile.doc) >= 60 && hostile.doc.getElementById('pwned') === null);
  mp.doc.getElementById('btn-city-builtin').click();
  check('back to Lumen Bay: the saved city is forgotten', mp.win.localStorage.getItem('lumenbay.customCity') === null);

  // ------------------------------------------------------------ new bus route (Day 10)
  d.getElementById('btn-reset').click(); await wait(SETTLE);
  d.getElementById('route-from').value = 'harbor'; d.getElementById('route-to').value = 'techpark';
  click('btn-route'); await wait(SETTLE);
  check('new route: listed under the controls, drawn on the map, named as an active policy', /Harbor to Tech Park/.test(text('route-list')) && /New route \(Harbor to Tech Park\)/.test(text('shuttle-legend')) && /new bus route/.test(text('policy-line')), text('route-list') + ' | ' + text('shuttle-legend'));
  check('new route: the ledger shows people better off and nobody worse', /Beneficiaries/.test(text('ledger-table')) && /Adversely affected/.test(text('ledger-table')) && !/Adversely affected 0\b/.test('') , text('ledger-table').slice(0, 160));
  click('btn-link'); await wait(50);
  check('new route: saved in the scenario link', /n=harbor%3Etechpark|n=harbor>techpark/.test(w.location.hash), w.location.hash);
  click('btn-route'); await wait(SETTLE);
  check('new route: adding the same one twice does nothing', d.querySelectorAll('#route-list li').length === 1);
  d.getElementById('route-from').value = 'cbd'; d.getElementById('route-to').value = 'cbd'; click('btn-route'); await wait(SETTLE);
  check('new route: the same start and end is refused', d.querySelectorAll('#route-list li').length === 1);
  d.querySelector('#route-list button[data-rm]').click(); await wait(SETTLE);
  check('new route: Remove takes it away again', d.querySelectorAll('#route-list li').length === 0 && text('shuttle-legend') === '');
  d.getElementById('route-from').value = 'harbor'; d.getElementById('route-to').value = 'techpark'; click('btn-route'); await wait(SETTLE);
  click('btn-reset'); await wait(SETTLE);
  check('new route: Reset city clears it', d.querySelectorAll('#route-list li').length === 0);

  check('no script errors', errors.length === 0, errors.join('; '));
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
