/*
 * Report, recommendation and saved experiments (Day 11)
 *
 * Pure functions, no page needed:
 *   Report.recommend(c)      plain-English advice built from the numbers of a finished comparison
 *   Report.html(snapshot)    a stand-alone, printable report (outcomes, costs, who gains and loses, assumptions)
 *   Report.historyAdd/Parse  the list of saved experiments (capped, and safe to load from anything)
 *
 * Every sentence the assistant writes comes from a number it is given. It does not know anything the
 * simulation did not compute, and it says so.
 *
 * Works in the browser (window.Report) and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Report = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_SAVED = 20;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function k(n) { return Math.round(Math.abs(n) / 1000).toLocaleString('en-US') + 'k'; }
  function whole(n) { return Math.round(n).toLocaleString('en-US'); }
  function fin(n) { return typeof n === 'number' && isFinite(n); }

  // ------------------------------------------------------------ recommend

  /**
   * c = { budget, best, nothing, overall, rows, ledger, sample }
   *   best     the top option that fits the budget ({ name, ids, oneOff, harm:{total}, vsNothing })
   *   nothing  the "do nothing" row
   *   overall  the top option whatever it costs
   *   rows     every option that fits the budget, best first
   *   ledger   Ledger.compare of the best option against doing nothing (or null)
   *   sample   { wins, n } from the 10-city check, or null
   * Returns { headline, points: [text], caveats: [text] }.
   */
  function recommend(c) {
    var best = c.best, nothing = c.nothing, points = [], caveats = [];
    if (!best || !best.ids || !best.ids.length) {
      return {
        headline: 'No response beats doing nothing within this budget.',
        points: ['Each option costs more than the harm it prevents, or none fits a budget of ' + k(c.budget) + '. Raise the budget or change the event and compare again.'],
        caveats: ['Model estimates over 14 days.']
      };
    }
    var saved = nothing.harm.total - best.harm.total;
    var pct = nothing.harm.total > 0 ? Math.round(saved / nothing.harm.total * 100) : 0;
    var headline = 'Recommended: ' + best.name + '. It cuts 14-day harm from ' + k(nothing.harm.total) + ' to ' + k(best.harm.total) +
      ' (' + pct + '% less) for ' + k(best.oneOff) + ' to start.';

    var L = c.ledger;
    if (L && fin(L.better)) {
      points.push('Compared with doing nothing, it leaves ' + whole(L.better) + ' residents better off and ' + whole(L.worse) + ' worse off' +
        (L.worse < 1 ? ' (nobody loses)' : '') + '.');
      var still = (L.flagged || []);
      if (still.length) points.push('Still flagged as worse off than doing nothing: ' + still.join(', ') + '. Check these areas before adopting the plan.');
      else if (L.equity && L.equity.worstDistrict && L.worse >= 1) points.push('The losses fall most on ' + L.equity.worstDistrict + '.');
    }

    // A cheaper plan that gets most of the benefit.
    var cheap = (c.rows || []).filter(function (r) {
      return r !== best && r.ids.length && r.oneOff < best.oneOff * 0.6 && nothing.harm.total - r.harm.total >= 0.8 * saved;
    }).sort(function (a, b) { return a.oneOff - b.oneOff; })[0];
    if (cheap) {
      points.push('A cheaper option, ' + cheap.name + ', gets ' + Math.round((nothing.harm.total - cheap.harm.total) / saved * 100) + '% of that benefit for ' +
        k(cheap.oneOff) + ' to start instead of ' + k(best.oneOff) + '.');
    } else if (c.rows && c.rows.some(function (r) { return r !== best && r.ids.length; })) {
      points.push('No cheaper option within the budget gets close to this benefit.');
    }

    if (c.overall && c.overall !== best && c.overall.ids.length && c.overall.oneOff > c.budget) {
      points.push('With more money, ' + c.overall.name + ' would cut harm further (to ' + k(c.overall.harm.total) + ') but needs ' + k(c.overall.oneOff) + ' to start.');
    }

    var bad = (c.rows || []).filter(function (r) { return r.ids.length === 1 && r.vsNothing > 0; }).map(function (r) { return r.name; });
    if (bad.length) points.push('On their own these add more harm than they prevent here: ' + bad.join(', ') + '.');

    if (c.sample && c.sample.n) {
      if (c.sample.wins === c.sample.n) caveats.push('It came out best in all ' + c.sample.n + ' simulated cities.');
      else caveats.push('It was best in ' + c.sample.wins + ' of ' + c.sample.n + ' simulated cities, so treat the top options as close.');
    } else caveats.push('The robustness check across 10 simulated cities has not been run for this ranking.');
    caveats.push('These are model estimates over 14 days, using the assumptions listed in the report. They are not forecasts.');
    return { headline: headline, points: points, caveats: caveats };
  }

  // ----------------------------------------------------------------- html

  function table(head, rows, cls) {
    return '<table' + (cls ? ' class="' + cls + '"' : '') + '><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  /** A stand-alone page. Everything is escaped, so a hostile city file cannot put markup in the report. */
  function html(s) {
    var o = [];
    o.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(s.title) + '</title><style>' +
      'body{font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif;color:#1b2430;max-width:860px;margin:24px auto;padding:0 16px}' +
      'h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:26px 0 8px;border-bottom:1px solid #d9dee5;padding-bottom:4px}' +
      'table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13.5px}th,td{border:1px solid #d9dee5;padding:5px 8px;text-align:left;vertical-align:top}' +
      'th{background:#f1f4f8}.muted{color:#5b6573}.rec{background:#eef6ff;border-left:4px solid #2a6fdb;padding:10px 14px;border-radius:6px}' +
      '.warn{background:#fff7e6;border-left:4px solid #d98e04;padding:8px 12px;border-radius:6px;font-size:13.5px}' +
      '@media print{h2{break-after:avoid}table{break-inside:avoid}}</style></head><body>');
    o.push('<h1>' + esc(s.title) + '</h1><p class="muted">' + esc(s.city) + ' &middot; generated ' + esc(s.generated) + '</p>');
    o.push('<h2>The scenario</h2><p><b>Event:</b> ' + esc(s.event) + '.<br><b>Responses in force:</b> ' + esc(s.responses || 'none') +
      '.<br><b>Austerity rule:</b> ' + (s.austerity ? 'on (bus service is cut when the reserve runs out)' : 'off') + '.</p>');

    if (s.recommendation) {
      var r = s.recommendation;
      o.push('<h2>Recommendation</h2><div class="rec"><p><b>' + esc(r.headline) + '</b></p>' +
        (r.points.length ? '<ul>' + r.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '') + '</div>' +
        '<p class="muted">' + r.caveats.map(esc).join(' ') + '</p>');
    }
    if (s.options && s.options.length) {
      o.push('<h2>Responses compared (same city, same budget, same 14 days)</h2>' +
        table(['Option', 'Spend now', '14-day harm', 'vs do nothing', 'Range across 10 cities'],
          s.options.map(function (x) { return [x.name, x.oneOff ? k(x.oneOff) : '-', k(x.harm), x.ids ? (x.vs < 0 ? '-' : '+') + k(x.vs) : '-', x.range || '-']; })) +
        '<p class="muted">Harm = business output lost + extra travel time + extra bus spending + repair bills + response cost, against the unchanged city.</p>');
    }

    if (s.sensitivity) {
      o.push('<h2>How sensitive is this to our assumptions?</h2>' + (s.sensitivity.summary || []).map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
        table(s.sensitivity.head, s.sensitivity.rows) + '<p class="muted">Each row re-runs the same event with one rule of the model pushed down or up. Numbers are 14-day harm.</p>');
    }
    o.push('<h2>Outcomes</h2>' + table(['Measure', 'Normal city', 'This scenario'],
      (s.metrics || []).map(function (m) { return [m.label, m.base, m.now]; })));

    var L = s.ledger;
    if (L) {
      o.push('<h2>Policy Impact Ledger: who gains and who loses</h2><p>Compared with ' + esc(L.vs) + ', of ' + whole(L.residents) + ' simulated residents: <b>' +
        whole(L.better) + '</b> better off, <b>' + whole(L.worse) + '</b> worse off, <b>' + whole(L.unchanged) + '</b> unchanged. Each resident is counted in exactly one group.</p>');
      if (L.equity) o.push('<p>' + esc(L.equity) + '</p>');
      o.push(table(['District', 'Residents', 'Better off', 'Worse off', 'Unchanged', 'Flag'],
        (L.districts || []).map(function (d) { return [d.name, whole(d.residents), whole(d.better), whole(d.worse), whole(d.unchanged), d.flagged ? 'worse off' : '']; })));
      if (L.spend) o.push('<p><b>Public spending over 14 days:</b> ' + esc(L.spend) + '</p>');
    }
    if (s.notes && s.notes.length) o.push('<h2>Notes</h2><ul>' + s.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>');

    o.push('<h2>Assumptions the model used</h2>');
    (s.assumptions || []).forEach(function (g) {
      o.push('<h3>' + esc(g.title) + '</h3>' + table(['Setting', 'Value', 'What it does'], g.rows.map(function (x) { return [x.label, x.value, x.note]; })));
    });
    if (s.link) o.push('<p class="muted">Reopen this exact scenario: ' + esc(s.link) + '</p>');
    o.push('</body></html>');
    return o.join('');
  }

  // -------------------------------------------------------------- history

  /** A saved experiment: { id, name, state, savedAt, headline, numbers }. */
  function cleanEntry(e) {
    if (!e || typeof e !== 'object') return null;
    if (typeof e.state !== 'string' || e.state.length > 2000 || !/^[\w=&:,.>%-]*$/.test(e.state)) return null;
    var n = e.numbers && typeof e.numbers === 'object' ? e.numbers : {};
    var out = { id: String(e.id || '').slice(0, 40), name: String(e.name || 'Experiment').slice(0, 80), state: e.state,
      savedAt: String(e.savedAt || '').slice(0, 40), headline: String(e.headline || '').slice(0, 200), numbers: {} };
    ['commute', 'output', 'balance', 'worse', 'better', 'harm'].forEach(function (key) { if (fin(n[key])) out.numbers[key] = n[key]; });
    if (!out.id) return null;
    return out;
  }

  /** The saved list from storage text. Anything unreadable or odd is dropped, never thrown. */
  function historyParse(text) {
    var list;
    try { list = JSON.parse(text); } catch (e) { return []; }
    if (!Array.isArray(list)) return [];
    return list.map(cleanEntry).filter(Boolean).slice(0, MAX_SAVED);
  }
  /** Add an experiment at the top; the same state saved again replaces the older copy; the list is capped. */
  function historyAdd(list, entry) {
    var e = cleanEntry(entry);
    if (!e) return list.slice();
    return [e].concat(list.filter(function (x) { return x.state !== e.state && x.id !== e.id; })).slice(0, MAX_SAVED);
  }

  return { recommend: recommend, html: html, esc: esc, historyParse: historyParse, historyAdd: historyAdd, MAX_SAVED: MAX_SAVED };
});
