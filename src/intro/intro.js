/* Photo tour for src/intro.html. Plain JavaScript, no dependencies, works from a double-click (file://).
   Page design adapted from Kage (MIT), see docs/intro.md. */
(function () {
  'use strict';
  var doc = document, body = doc.body;
  body.classList.remove('no-js');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* which photograph sits behind each section (data-cam 0..6) */
  var LAYER = ['overview', 'clock', 'overview', 'flood', 'hospital', 'riverside', 'harbor'];
  var OVERLAY = [false, false, true, true, false, false, false];
  var layers = {}; $$('.layer').forEach(function (l) { layers[l.getAttribute('data-l')] = l; });
  var secs = $$('[data-cam]');
  var cur = -1;
  function show(i) {
    if (i === cur) return; cur = i;
    Object.keys(layers).forEach(function (k) { layers[k].classList.toggle('on', k === LAYER[i]); layers[k].classList.toggle('show-ov', k === LAYER[i] && OVERLAY[i]); });
    $$('button', rail).forEach(function (b, j) { b.classList.toggle('on', j === i); });
  }

  /* reveal on scroll */
  function wireReveals() {
    var els = $$('[data-rv], .mask-line');
    if (!('IntersectionObserver' in window) || reduce) { els.forEach(function (e) { e.classList.add('rv-in'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* nav */
  var nav = $('#nav'), burger = $('#burger'), last = 0;
  function onScroll() {
    var y = scrollY; nav.classList.toggle('stuck', y > 40);
    nav.classList.toggle('hide', y > last && y > 240 && !body.classList.contains('menu-open')); last = y;
    pick();
  }
  burger.addEventListener('click', function () { var o = body.classList.toggle('menu-open'); burger.setAttribute('aria-expanded', o ? 'true' : 'false'); });
  $$('.nav-link').forEach(function (a) { a.addEventListener('click', function () { body.classList.remove('menu-open'); burger.setAttribute('aria-expanded', 'false'); }); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') { body.classList.remove('menu-open'); burger.setAttribute('aria-expanded', 'false'); } });

  var rail = $('#rail');
  secs.forEach(function (s, i) {
    var b = doc.createElement('button'); b.setAttribute('aria-label', 'Go to section ' + (i + 1)); b.innerHTML = '<i></i>';
    b.addEventListener('click', function () { scrollTo({ top: s.getBoundingClientRect().top + scrollY, behavior: reduce ? 'auto' : 'smooth' }); });
    rail.appendChild(b);
  });
  var links = $$('.nav-link[href^="#"]');
  function pick() {
    var mid = innerHeight * 0.5, best = 0, bd = 1e9;
    secs.forEach(function (s, i) { var r = s.getBoundingClientRect(); var d = (r.top <= mid && r.bottom >= mid) ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid)); if (d < bd) { bd = d; best = i; } });
    show(best);
    var id = secs[best].id; links.forEach(function (l) { l.classList.toggle('on', l.getAttribute('href') === '#' + id); });
  }
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', pick);

  /* gentle pointer parallax on the active photograph */
  if (!reduce) {
    var tx = 0, ty = 0, cx = 0, cy = 0;
    addEventListener('pointermove', function (e) { tx = (e.clientX / innerWidth - 0.5) * -22; ty = (e.clientY / innerHeight - 0.5) * -14; }, { passive: true });
    (function loop() {
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      $$('.frame').forEach(function (f) { f.style.transform = 'translate(calc(-50% + ' + cx.toFixed(1) + 'px), calc(-50% + ' + cy.toFixed(1) + 'px)) scale(1.06)'; });
      requestAnimationFrame(loop);
    })();
  }

  /* preloader: wait for the first photograph */
  var fill = $('#pre-fill'), pct = $('#pre-pct'), done = false;
  function progress(p) { fill.style.right = (100 - p) + '%'; pct.textContent = Math.round(p); }
  function finish() { if (done) return; done = true; progress(100); setTimeout(function () { $('#pre').classList.add('done'); body.classList.remove('is-locked'); }, 300); }
  body.classList.add('is-locked'); wireReveals(); progress(15);
  var imgs = $$('#stage img'), loaded = 0;
  function one() { loaded++; progress(15 + 85 * loaded / imgs.length); if (loaded === imgs.length) finish(); }
  imgs.forEach(function (im) { if (im.complete) one(); else { im.addEventListener('load', one); im.addEventListener('error', one); } });
  setTimeout(finish, 6000);
  onScroll();
})();
