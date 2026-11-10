// Runs before the simulator starts. Decides which city to simulate: a city file the person loaded
// earlier (saved in the browser), or the built-in Lumen Bay. Anything saved is checked again here;
// a bad or stale file is thrown away and Lumen Bay is used.
(function () {
  'use strict';
  var KEY = 'lumenbay.customCity', PREFIX = 'lumenbay-city:';
  var builtin = window.CITY_DATA;
  window.CITY_BUILTIN = builtin;
  window.CITY_CUSTOM = false;

  // The built-in city's map decoration lives here because data/city.json has no "map" section.
  if (builtin && !builtin.map) {
    builtin.map = { river: { path: 'M0 43 C 20 38, 35 52, 55 46 S 85 40, 100 45', label: 'River', labelX: 3, labelY: 38.5, bandY0: 30, bandY1: 62 } };
  }

  function read() {
    try { var v = window.localStorage.getItem(KEY); if (v) return v; } catch (e) { /* storage blocked */ }
    try { if (typeof window.name === 'string' && window.name.indexOf(PREFIX) === 0) return window.name.slice(PREFIX.length); } catch (e) { /* ignore */ }
    return null;
  }
  function forget() {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    try { if (typeof window.name === 'string' && window.name.indexOf(PREFIX) === 0) window.name = ''; } catch (e) { /* ignore */ }
  }
  window.CityStore = {
    save: function (text) {
      var ok = false;
      try { window.localStorage.setItem(KEY, text); ok = true; } catch (e) { /* fall back to the tab */ }
      if (!ok) { try { window.name = PREFIX + text; ok = true; } catch (e) { /* ignore */ } }
      return ok;
    },
    forget: forget
  };

  var raw = read();
  if (raw && window.CityFile) {
    var p = window.CityFile.parse(raw), v = p.ok ? window.CityFile.validate(p.value, builtin) : null;
    if (v && v.ok) { window.CITY_DATA = v.data; window.CITY_CUSTOM = true; window.CITY_WARNINGS = v.warnings; }
    else forget();
  }
})();
