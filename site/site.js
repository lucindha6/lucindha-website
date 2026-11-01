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

/* Smart header: slides away when scrolling down, comes back when scrolling up. */
(function () {
  var header = document.querySelector('body > header, .site-header, header');
  if (!header) return;
  var css = document.createElement('style');
  css.textContent =
    '.smart-header{position:sticky;top:0;z-index:50;background-color:#0B1F33;transition:transform .35s ease,box-shadow .35s ease;will-change:transform}' +
    '.smart-header.is-hidden{transform:translateY(-100%)}' +
    '.smart-header.is-raised{box-shadow:0 10px 28px rgba(0,0,0,.35)}' +
    '@media (prefers-reduced-motion:reduce){.smart-header{transition:none}}';
  document.head.appendChild(css);
  header.classList.add('smart-header');
  var lastY = window.scrollY, ticking = false;
  function update() {
    var y = window.scrollY, h = header.offsetHeight;
    if (y <= h) header.classList.remove('is-hidden');
    else if (y > lastY + 6 && !header.contains(document.activeElement)) header.classList.add('is-hidden');
    else if (y < lastY - 6) header.classList.remove('is-hidden');
    header.classList.toggle('is-raised', y > 10);
    lastY = y; ticking = false;
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });
})();
