// The "City file" menu: load a city from a file, try the example, download the current one, go back.
// Self-contained: it only needs the page elements below, CityFile and CityStore.
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var msg = $('city-msg');
  if (!msg) return;

  var data = window.CITY_DATA;
  $('city-title').textContent = data.name;
  document.title = data.name + ' City Simulator';
  $('city-menu-label').textContent = 'City: ' + data.name + (window.CITY_CUSTOM ? ' (loaded file)' : '');
  $('btn-city-builtin').hidden = !window.CITY_CUSTOM;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function show(kind, title, items) {
    msg.className = 'city-msg ' + kind;
    msg.innerHTML = '<b>' + esc(title) + '</b>' + (items && items.length ? '<ul>' + items.slice(0, 8).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') +
      (items.length > 8 ? '<li>…and ' + (items.length - 8) + ' more.</li>' : '') + '</ul>' : '');
  }

  // Check text as a city file; if it is good, remember it. Returns the check result (the click handlers reload).
  function loadText(text) {
    var p = window.CityFile.parse(text);
    if (!p.ok) { show('bad', 'That file can’t be used.', p.errors); return { ok: false, errors: p.errors }; }
    var v = window.CityFile.validate(p.value, window.CITY_BUILTIN);
    if (!v.ok) { show('bad', 'That city file has ' + v.errors.length + ' problem' + (v.errors.length > 1 ? 's' : '') + ' to fix:', v.errors); return v; }
    if (!window.CityStore.save(JSON.stringify(p.value))) {
      show('bad', 'Your browser would not let the page keep the file, so it can’t be loaded.', ['Try another browser, or allow site storage.']);
      return { ok: false, errors: ['storage blocked'] };
    }
    show('ok', 'Loaded “' + v.data.name + '”. Opening it…', v.warnings);
    return v;
  }
  function reload() { try { window.location.hash = ''; window.location.reload(); } catch (e) { /* ignore */ } }

  $('btn-city-load').addEventListener('click', function () { $('city-file').click(); });
  $('city-file').addEventListener('change', function (ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    if (f.size > window.CityFile.LIMITS.fileBytes) { show('bad', 'That file can’t be used.', ['It is larger than 1 MB, which is far more than a city needs.']); ev.target.value = ''; return; }
    var rd = new FileReader();
    rd.onload = function () { var r = loadText(String(rd.result)); ev.target.value = ''; if (r.ok) setTimeout(reload, r.warnings && r.warnings.length ? 2500 : 600); };
    rd.onerror = function () { show('bad', 'That file could not be read.', []); ev.target.value = ''; };
    rd.readAsText(f);
  });
  $('btn-city-example').addEventListener('click', function () {
    if (!window.CITY_EXAMPLE) { show('bad', 'The example city is not available.', []); return; }
    var r = loadText(JSON.stringify(window.CITY_EXAMPLE));
    if (r.ok) setTimeout(reload, 600);
  });
  $('btn-city-builtin').addEventListener('click', function () { window.CityStore.forget(); reload(); });
  $('btn-city-download').addEventListener('click', function () {
    try {
      var blob = new Blob([JSON.stringify(window.CITY_DATA, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      show('ok', 'Downloaded this city’s file. Edit it and load it back to try your own city.', []);
    } catch (e) { show('bad', 'The download did not start.', []); }
  });

  if (window.CITY_CUSTOM && window.CITY_WARNINGS && window.CITY_WARNINGS.length) show('warn', 'Notes about this city file:', window.CITY_WARNINGS);
  window.CityUI = { loadText: loadText };
})();
