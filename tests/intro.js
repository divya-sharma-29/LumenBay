// Static checks for the 3D intro page (src/intro.html): every local file it points to exists, nothing is
// fetched from the internet at run time, the bundle is present, and the page links to the simulator.
// (A real-browser run of the page is done by hand and in docs/intro.md.)
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = path.join(__dirname, '..', 'src');
const html = fs.readFileSync(path.join(src, 'intro.html'), 'utf8');
let n = 0;
function ok(cond, msg) { assert(cond, msg); n++; console.log('PASS ' + msg); }

const refs = []; html.replace(/(?:src|href)="([^"#][^"]*)"/g, function (_, u) { refs.push(u); });
refs.filter(function (u) { return !/^https?:/.test(u); }).forEach(function (u) {
  const localPath = u.split('?')[0] === 'simulator.html' ? 'index.html' : u.split('?')[0];
  ok(fs.existsSync(path.join(src, localPath)), 'intro.html: local file or simulator route exists: ' + u);
});
ok(refs.some(function (u) { return u === 'simulator.html'; }), 'intro.html links to the deployed simulator route');
const pagesWorkflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'pages.yml'), 'utf8');
ok(/mv _site\/index\.html _site\/simulator\.html/.test(pagesWorkflow) &&
  /mv _site\/intro\.html _site\/index\.html/.test(pagesWorkflow),
  'GitHub Pages publishes the intro as home and simulator separately');
const visibleCopy = html.replace(/<[^>]*>/g, ' ');
ok(!/(AI-generated|concept art|fictional|not a real place|illustrative)/i.test(visibleCopy), 'intro has no artwork or fictional-city disclaimers');
ok(!/<(script|link|img)[^>]+(src|href)="https?:\/\/(?!github\.com)/.test(html), 'intro.html loads no script, style or image from the internet');
ok(!/url\(https?:/.test(html), 'intro.html CSS fetches nothing from the internet');
const bundle = fs.readFileSync(path.join(src, 'intro', 'intro.js'), 'utf8');
ok(bundle.length > 1000 && bundle.length < 60000, 'intro script present and small (' + Math.round(bundle.length / 1024) + ' KB, no 3D library)');
ok(!/THREE|WebGLRenderer/.test(bundle), 'intro script contains no 3D library');
ok(!/fetch\(|XMLHttpRequest/.test(bundle), 'intro script makes no network requests');
const city = require('../data/city.json');
['Crown Bridge', 'Kings Bridge', 'Tech Bridge'].forEach(function (nm) { ok(city.roads.some(function (r) { return r.name === nm; }) && html.indexOf(nm) >= 0, 'intro names a real bridge from city.json: ' + nm); });
['142%', '6.5%', '20.6%', '1,132k', '67.7%', '2,947k'].forEach(function (f) { ok(html.indexOf(f) >= 0, 'intro quotes verified simulator figure ' + f); });
const imgs = fs.readdirSync(path.join(src, 'intro', 'img'));
const bytes = imgs.reduce(function (s, f) { return s + fs.statSync(path.join(src, 'intro', 'img', f)).size; }, 0);
ok(bytes < 2.5 * 1024 * 1024, 'intro images total ' + Math.round(bytes / 1024) + ' KB (under 2.5 MB)');
console.log('\n' + n + ' intro checks passed');
