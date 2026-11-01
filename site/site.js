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

/* Community Work drop-down in the header menu (works on every page, keyboard and screen-reader friendly). */
(function () {
  var link = Array.prototype.find.call(document.querySelectorAll('header nav a'), function (a) { return /(^|\/)community(\.html)?$/.test(a.getAttribute('href') || ''); });
  if (!link) return;
  var css = document.createElement('style');
  css.textContent =
    '.dd{position:relative;display:inline-flex;align-items:center}' +
    '.dd-btn{background:none;border:0;color:inherit;cursor:pointer;min-width:34px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:0 2px;margin-left:-2px}' +
    '.dd-btn svg{transition:transform .2s ease}.dd.open .dd-btn svg{transform:rotate(180deg)}' +
    '.dd-btn:focus-visible{outline:3px solid #CBAB74;outline-offset:2px}' +
    '.dd-menu{display:none;position:absolute;top:100%;left:-18px;width:290px;max-width:calc(100vw - 32px);margin:10px 0 0;padding:10px;list-style:none;background:var(--area,#0B1F33);border:1px solid rgba(168,121,40,.5);border-radius:20px;box-shadow:0 20px 44px rgba(0,0,0,.45);z-index:60}' +
    '.dd-menu::before{content:"";position:absolute;left:0;right:0;top:-12px;height:12px}' +
    '.dd.open .dd-menu{display:block}' +
    '@media (hover:hover){.dd:hover .dd-menu{display:block}.dd:hover .dd-btn svg{transform:rotate(180deg)}}' +
    '.dd-menu a{display:flex!important;align-items:center;gap:14px;padding:12px 14px!important;border-radius:14px;color:#F7F3E8!important;text-decoration:none!important;font-family:Fraunces,Georgia,serif;font-variation-settings:"SOFT" 100;font-size:1.15rem;font-weight:400!important}' +
    '.dd-menu a:hover,.dd-menu a:focus-visible{background:rgba(168,121,40,.16)}' +
    '.dd-menu a[aria-current="page"]{background:rgba(168,121,40,.22)}' +
    '.dd-menu .sw{width:16px;height:16px;border-radius:50%;border:1.5px solid #A87928;flex:none}' +
    '.dd-menu .hub{font-family:inherit;font-size:1rem;color:#CBAB74!important;border-top:1px solid rgba(168,121,40,.3);border-radius:0 0 12px 12px;margin-top:6px}' +
    '@media (prefers-reduced-motion:reduce){.dd-btn svg{transition:none}}';
  document.head.appendChild(css);

  var wrap = document.createElement('div'); wrap.className = 'dd';
  link.parentNode.insertBefore(wrap, link); wrap.appendChild(link);
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'dd-btn';
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'dd-community');
  btn.setAttribute('aria-label', 'Show Community Work pages');
  btn.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBAB74" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>';
  var menu = document.createElement('ul'); menu.id = 'dd-community'; menu.className = 'dd-menu';
  var here = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  [['sport.html', 'Sport & Coaching', '#2A3D3B'], ['speaking.html', 'Public Speaking', '#4A3046'], ['workshops.html', 'Workshops', '#343B40'], ['community.html', 'All Community Work', '']]
    .forEach(function (it) {
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = it[0];
      if (it[2]) { var sw = document.createElement('span'); sw.className = 'sw'; sw.setAttribute('aria-hidden', 'true'); sw.style.background = it[2]; a.appendChild(sw); }
      else a.className = 'hub';
      a.appendChild(document.createTextNode(it[1]));
      if (here === it[0].replace(/\.html$/, '')) a.setAttribute('aria-current', 'page');
      li.appendChild(a); menu.appendChild(li);
    });
  wrap.appendChild(btn); wrap.appendChild(menu);

  function setOpen(o) { wrap.classList.toggle('open', o); btn.setAttribute('aria-expanded', o ? 'true' : 'false'); }
  btn.addEventListener('click', function (ev) { ev.stopPropagation(); setOpen(!wrap.classList.contains('open')); });
  document.addEventListener('click', function (ev) { if (!wrap.contains(ev.target)) setOpen(false); });
  wrap.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && wrap.classList.contains('open')) { setOpen(false); btn.focus(); } });
  wrap.addEventListener('focusout', function (ev) { if (!wrap.contains(ev.relatedTarget)) setOpen(false); });
})();
