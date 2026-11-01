/* Gentle scroll reveal: elements fade and rise into place once, as they come into view. */
(function () {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('js');
  var sel = '.hero-text > *, .hero-logo, .head, .grid > li, .ticks > li, .areas > li, .split > *, .cta, section .stack > h2, .site-footer .cols > *';
  var els = Array.prototype.slice.call(document.querySelectorAll(sel));
  els.forEach(function (el) {
    var sibs = Array.prototype.filter.call(el.parentElement.children, function (c) { return els.indexOf(c) > -1; });
    el.style.setProperty('--i', Math.min(sibs.indexOf(el), 6));
    el.classList.add('reveal');
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  els.forEach(function (el) { io.observe(el); });
})();
