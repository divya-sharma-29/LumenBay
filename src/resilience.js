/*
 * Transparent resilience scoring for the modeled city.
 * Each dimension is normalized to 0–100 from model outputs; the composite is
 * an unweighted mean so its interpretation is explicit and stable.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Resilience = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function clamp(x) { return Math.max(0, Math.min(100, x)); }
  function ratio(now, base) { return base > 0 ? clamp(now / base * 100) : 100; }
  function evaluate(data, city, reference, service, equity, projection) {
    var ref = reference || city, t = city.summary, rt = ref.summary;
    var hospital = service && service.city && service.city.hospital;
    var refHospital = service && service.reference && service.reference.city && service.reference.city.hospital;
    var reserve = projection && projection.minReserve;
    var reserveScale = Math.max(1, data.budget.dailyReserve || 1);
    var dims = [
      { id: 'transport', label: 'Transportation', value: ratio(rt.commute, t.commute), basis: 'reference commute / current commute' },
      { id: 'health', label: 'Healthcare access', value: hospital && refHospital ? ratio(hospital.share, refHospital.share) : 100, basis: 'residents within the modeled hospital travel-time limit' },
      { id: 'economy', label: 'Economic stability', value: ratio(city.econ.totals.revenue, ref.econ.totals.revenue), basis: 'daily business revenue / reference revenue' },
      { id: 'equity', label: 'Social equity', value: equity ? clamp(100 * (1 - equity.worseShare)) : 100, basis: '100 − share of residents classified as worse off' },
      { id: 'infrastructure', label: 'Infrastructure', value: clamp(100 * (1 - Math.max(city.econ.power.shortfall || 0, city.econ.water.shortfall || 0, t.shares.none || 0))), basis: '100 − worst of utility shortfall and no-work-route share' },
      { id: 'finance', label: 'Financial sustainability', value: reserve == null ? 100 : clamp(50 + 50 * reserve / reserveScale), basis: 'reserve floor, scaled against one day of city reserve' }
    ];
    var score = dims.reduce(function (sum, d) { return sum + d.value; }, 0) / dims.length;
    return { score: Math.round(score), dimensions: dims };
  }
  return { evaluate: evaluate };
});
