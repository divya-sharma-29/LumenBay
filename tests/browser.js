// Drives the real page in Chromium: hostile scenario links, then rapid and conflicting actions.
// Needs Playwright (npm install --no-save playwright). Run with:  node tests/browser.js
const { chromium } = require('playwright');
const createServer = require('../scripts/serve');
const server = createServer();
let PAGE;
const hashes = ['', '#', '#garbage', '#c=__proto__', '#c=constructor,toString,e3', '#b=__proto__:0.5,L1:abc,L2:-5,L3:999', '#r=__proto__,constructor,shuttle', '#r=%E0%A4%A', '#d=0', '#d=99', '#d=abc', '#f=1&h=1&s=1&c=e3&b=L1:0,L2:0,L3:0&d=14',
  '#c=<img src=x onerror=alert(1)>', '#r=<script>alert(1)</script>', '#a=0&a=1&f=1', '#t=__proto__', '#t=respond&c=e3', '#t=impact&f=1', '#' + 'c=e3,'.repeat(5000)];

async function hostile() {
  const b = await chromium.launch(); let bad = 0;
  for (const h of hashes) {
    const p = await b.newPage(); const errs = []; let dialog = false;
    p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { dialog = true; d.dismiss(); });
    await p.goto(PAGE + h);
    await p.waitForTimeout(1500);
    const st = await p.evaluate(() => ({ metrics: document.querySelectorAll('.metric').length, head: document.getElementById('sum-head').textContent.slice(0, 60), sc: JSON.stringify(window.LumenBay.getScenario().closedRoads), nan: /NaN|undefined|Infinity/.test(document.body.innerText) }));
    const ok = !errs.length && !dialog && st.metrics === 18 && !st.nan && !/__proto__|constructor|toString/.test(st.sc);
    if (!ok) bad++;
    console.log((ok ? 'ok   ' : 'BAD  ') + JSON.stringify(h.slice(0, 50)), ok ? '' : JSON.stringify({ errs, dialog, st }));
    await p.close();
  }
  await b.close(); console.log(bad ? bad + ' BAD' : 'all hostile links handled'); if (bad) process.exitCode = 1;
}

async function stress() {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(PAGE);
  await p.waitForTimeout(1200);
  const sane = () => p.evaluate(() => ({ metrics: document.querySelectorAll('.metric').length, bad: /NaN|undefined|Infinity/.test(document.body.innerText), head: document.getElementById('sum-head').textContent }));
  let problems = [];
  const t0 = Date.now();
  // 1. 25 surprises in a row, with a random click in between
  for (let i = 0; i < 25; i++) {
    await p.click('#btn-surprise');
    if (i % 3 === 0) await p.click('.hit >> nth=' + (i % 11), { force: true });
    if (i % 4 === 0) await p.fill('#view-day', String(1 + (i % 14)), { force: true }).catch(() => {});
    await p.waitForTimeout(260);
    const s = await sane();
    if (s.metrics !== 18 || s.bad) problems.push('surprise ' + i + ' ' + JSON.stringify(s));
  }
  console.log('25 surprises in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  // 2. start a comparison, change the event while it runs, start another
  await p.click('#btn-reset'); await p.click('#btn-flood'); await p.click('#btn-heat');
  await p.click('#tab-respond'); await p.click('#btn-compare');
  await p.waitForTimeout(1500);
  await p.click('#tab-city'); await p.click('#btn-strike');   // event changes mid-search
  await p.waitForFunction(() => /^Compared/.test(document.getElementById('cmp-status').textContent), null, { timeout: 90000 });
  await p.waitForFunction(() => document.getElementById('cmp-bar').hidden, null, { timeout: 90000 });
  await p.click('#tab-respond');
  const stale = await p.evaluate(() => /changed since this comparison/.test(document.getElementById('cmp-results').textContent));
  if (!stale) problems.push('comparison not marked stale after the event changed during it');
  // 3. range check, then change scenario mid-run
  await p.click('#tab-city');
  await p.click('#btn-range'); await p.waitForTimeout(300); await p.click('#btn-flood');
  await p.waitForTimeout(1500);
  const rangeState = await p.evaluate(() => ({ txt: document.getElementById('btn-range').textContent, dis: document.getElementById('btn-range').disabled, out: document.getElementById('sum-range').textContent }));
  if (rangeState.dis || /Checking/.test(rangeState.txt)) problems.push('range button stuck: ' + JSON.stringify(rangeState));
  if (/Across/.test(rangeState.out)) problems.push('range shown for a scenario that changed: ' + rangeState.out.slice(0, 80));
  // 4. play, then edit mid-play, then play to the end
  await p.click('#btn-play'); await p.waitForTimeout(1700); await p.click('#btn-crown');
  const playing = await p.evaluate(() => document.getElementById('btn-play').textContent);
  if (/Pause/.test(playing)) problems.push('play kept going after the scenario changed');
  await p.click('#btn-reset'); await p.click('#btn-flood'); await p.click('#btn-play');
  await p.waitForFunction(() => document.getElementById('view-day').value === '14', null, { timeout: 30000 });
  await p.waitForTimeout(1200);
  const endBtn = await p.evaluate(() => document.getElementById('btn-play').textContent);
  if (/Pause/.test(endBtn)) problems.push('play did not stop at day 14');
  // 5. hammer the same button
  for (let i = 0; i < 30; i++) await p.click('#btn-heat');
  await p.waitForTimeout(600);
  const s5 = await sane(); if (s5.metrics !== 18 || s5.bad) problems.push('after 30 clicks ' + JSON.stringify(s5));
  // 6. two compares back to back, second cancels the first
  await p.click('#btn-reset'); await p.click('#btn-crown'); await p.click('#tab-respond'); await p.click('#btn-compare'); await p.waitForTimeout(800);
  await p.evaluate(() => document.getElementById('btn-compare').click());
  await p.waitForFunction(() => /re-run in/.test(document.getElementById('cmp-status').textContent), null, { timeout: 120000 });
  const finalBar = await p.evaluate(() => ({ hidden: document.getElementById('cmp-bar').hidden, btn: document.getElementById('btn-compare').disabled }));
  if (!finalBar.hidden || finalBar.btn) problems.push('compare left in a stuck state ' + JSON.stringify(finalBar));
  if (errs.length) problems.push('page errors: ' + [...new Set(errs)].join(' | '));
  console.log(problems.length ? problems.length + ' PROBLEMS\n - ' + problems.join('\n - ') : 'stress test clear');
  if (problems.length) process.exitCode = 1;
  await b.close();
}

(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  PAGE = 'http://127.0.0.1:' + server.address().port + '/index.html';
  try {
    await hostile();
    await stress();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => { console.error(e); process.exit(1); });
