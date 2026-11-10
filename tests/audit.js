// Real-browser audit (Day 15): five screen sizes x light and dark, all four tabs, with a bridge closed.
// Fails on any accessibility violation (axe-core, WCAG 2 A/AA and best practice), sideways scrolling,
// script errors, or a copy-link that does not reopen the same scenario.
// Needs: npm install --no-save playwright axe-core     Run with:  node tests/audit.js
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const PAGE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');
const profiles = [
  ['desktop 1440', { viewport: { width: 1440, height: 900 } }],
  ['laptop 1024', { viewport: { width: 1024, height: 768 } }],
  ['iPhone 14', devices['iPhone 14']],
  ['Pixel 7', devices['Pixel 7']],
  ['small phone 320', { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true }],
];
(async () => {
  const b = await chromium.launch(); let bad = 0;
  const fail = (m) => { bad++; console.log('FAIL ' + m); };
  for (const scheme of ['light', 'dark']) {
    for (const [name, opts] of profiles) {
      const ctx = await b.newContext({ ...opts, colorScheme: scheme, permissions: ['clipboard-read', 'clipboard-write'] });
      const p = await ctx.newPage(); const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(PAGE); await p.waitForTimeout(900);
      await p.click('#btn-crown'); await p.waitForTimeout(400);
      for (const t of ['city', 'impact', 'respond', 'details']) {
        await p.click('#tab-' + t); await p.waitForTimeout(350);
        const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
        if (m.sw > m.vw + 1) fail(name + ' ' + scheme + ' ' + t + ': sideways scroll (' + m.sw + ' > ' + m.vw + ')');
        await p.evaluate(axeSrc);
        const v = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations.map((x) => x.id + ' x' + x.nodes.length + ' ' + x.nodes[0].target.join(' ')));
        v.forEach((x) => fail(name + ' ' + scheme + ' ' + t + ': ' + x));
      }
      if (scheme === 'light') {
        await p.click('#tab-city'); await p.click('#btn-link'); await p.waitForTimeout(300);
        const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
        const q = await ctx.newPage(); await q.goto(clip); await q.waitForTimeout(900);
        const same = await q.evaluate(() => JSON.stringify(window.LumenBay.getScenario().closedRoads));
        if (same !== '["e3"]') fail(name + ': copied link did not reopen the same scenario (' + clip + ')');
        await q.close();
      }
      if (errs.length) fail(name + ' ' + scheme + ': script errors ' + errs.join('; '));
      console.log('ok   ' + name + ' / ' + scheme);
      await ctx.close();
    }
  }
  await b.close();
  console.log(bad ? bad + ' problem(s)' : 'audit clean'); if (bad) process.exitCode = 1;
})();
