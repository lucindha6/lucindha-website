/* Gentle scroll reveal: elements fade and rise into place once, as they come into view. */
(function () {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.getAttribute('data-motion') === 'reduced') return;
  document.documentElement.classList.add('js');
  var sel = '.hero-text > *, .hero-logo, .head, .grid > li, .ticks > li, .areas > li, .split > *, .cta, .area-panel, .news-list > li, .site-footer .cols > *';
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
    else if (y > lastY + 6 && !header.contains(document.activeElement) && !header.classList.contains('menu-open')) header.classList.add('is-hidden');
    else if (y < lastY - 6) header.classList.remove('is-hidden');
    header.classList.toggle('is-raised', y > 10);
    lastY = y; ticking = false;
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });
})();

/* Header drop-downs (Community Work, Media) - keyboard and screen-reader friendly. */
(function () {
  var css = document.createElement('style');
  css.textContent =
    '.dd{position:relative;display:inline-flex;align-items:center}' +
    '.dd-btn{background:none;border:0;color:inherit;cursor:pointer;min-width:26px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:0;margin-left:2px;margin-right:-6px}' +
    '.dd-btn svg{transition:transform .2s ease}.dd.open .dd-btn svg{transform:rotate(180deg)}' +
    '.dd-btn:focus-visible{outline:3px solid #CBAB74;outline-offset:2px}' +
    '.dd-menu{display:none;position:absolute;top:100%;left:-12px;width:236px;max-width:calc(100vw - 32px);margin:6px 0 0;padding:6px;list-style:none;background:var(--area,#0B1F33);border:1px solid rgba(168,121,40,.5);border-radius:16px;box-shadow:0 16px 36px rgba(0,0,0,.45);z-index:60}' +
    '.dd-menu::before{content:"";position:absolute;left:0;right:0;top:-10px;height:10px}' +
    '.dd.open .dd-menu{display:block}' +
    '@media (hover:hover){.dd:hover .dd-menu{display:block}.dd:hover .dd-btn svg{transform:rotate(180deg)}}' +
    '.dd-menu a{display:flex!important;align-items:center;gap:10px;padding:10px 12px!important;min-height:44px;box-sizing:border-box;border-radius:10px;color:#F7F3E8!important;text-decoration:none!important;font-family:"Atkinson Hyperlegible",Arial,sans-serif;font-size:1.05rem;line-height:1.25;font-weight:400!important}' +
    '.dd-menu a:hover,.dd-menu a:focus-visible{background:rgba(168,121,40,.16)}' +
    '.dd-menu a[aria-current="page"]{background:rgba(168,121,40,.22)}' +
    '.dd-menu .sw{width:12px;height:12px;border-radius:50%;border:1.5px solid #A87928;flex:none}' +
    '.dd-menu .hub{font-size:.98rem;color:#CBAB74!important;border-top:1px solid rgba(168,121,40,.3);border-radius:0 0 10px 10px;margin-top:4px}' +
    '#dd-media{left:auto;right:-12px}' +
    '@media (prefers-reduced-motion:reduce){.dd-btn svg{transition:none}}';
  document.head.appendChild(css);
  var here = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');

  function dropdown(pattern, id, label, items) {
    var link = Array.prototype.find.call(document.querySelectorAll('header nav a'), function (a) { return pattern.test(a.getAttribute('href') || ''); });
    if (!link) return;
    var wrap = document.createElement('div'); wrap.className = 'dd';
    link.parentNode.insertBefore(wrap, link); wrap.appendChild(link);
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dd-btn';
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', id);
    btn.setAttribute('aria-label', label);
    btn.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBAB74" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>';
    var menu = document.createElement('ul'); menu.id = id; menu.className = 'dd-menu';
    items.forEach(function (it) {
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = it[0];
      if (it[2]) { var sw = document.createElement('span'); sw.className = 'sw'; sw.setAttribute('aria-hidden', 'true'); sw.style.background = it[2]; a.appendChild(sw); }
      else if (it[3]) a.className = 'hub';
      a.appendChild(document.createTextNode(it[1]));
      if (it[0].indexOf('#') < 0 && here === it[0].replace(/\.html$/, '')) a.setAttribute('aria-current', 'page');
      li.appendChild(a); menu.appendChild(li);
    });
    wrap.appendChild(btn); wrap.appendChild(menu);
    function setOpen(o) { wrap.classList.toggle('open', o); btn.setAttribute('aria-expanded', o ? 'true' : 'false'); }
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); setOpen(!wrap.classList.contains('open')); });
    document.addEventListener('click', function (ev) { if (!wrap.contains(ev.target)) setOpen(false); });
    wrap.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && wrap.classList.contains('open')) { setOpen(false); btn.focus(); } });
    wrap.addEventListener('focusout', function (ev) { if (!wrap.contains(ev.relatedTarget)) setOpen(false); });
  }

  dropdown(/(^|\/)community(\.html)?$/, 'dd-community', 'Show Community Work pages',
    [['sport.html', 'Sport & Coaching', '#2A3D3B'], ['speaking.html', 'Public Speaking', '#4A3046'], ['workshops.html', 'Workshops', '#343B40'], ['community.html', 'All Community Work', '', true]]);
  dropdown(/(^|\/)media(\.html)?$/, 'dd-media', 'Show Media pages',
    [['news.html', 'In the news'], ['media.html#appear-title', 'TV & video appearances'], ['media.html#bio-title', 'Press kit'], ['media.html', 'All media', '', true]]);
})();


/* Display settings: colour (Navy / Light / Yellow), text size and motion. Saved in this browser only. */
(function () {
  var root = document.documentElement, KEY = 'll-display';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  var state = load();
  var reducedOS = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var groups = [
    ['theme', 'Colours', [['navy', 'Navy'], ['light', 'Light'], ['yellow', 'Yellow']], 'navy'],
    ['text', 'Text size', [['normal', 'Normal'], ['large', 'Large'], ['xlarge', 'Extra large']], 'normal'],
    ['motion', 'Animations', [['full', 'On'], ['reduced', 'Off']], reducedOS ? 'reduced' : 'full']
  ];
  var bar = document.createElement('div'); bar.className = 'display-bar';
  var html = '<div class="wrap"><button type="button" class="display-btn" aria-expanded="false" aria-controls="display-panel">' +
    '<span class="aa" aria-hidden="true">Aa</span> Display settings</button></div>' +
    '<div id="display-panel" class="display-panel" hidden><div class="wrap"><h2 class="display-title">Display settings</h2><div class="display-groups">';
  groups.forEach(function (g) {
    var cur = state[g[0]] || g[3];
    html += '<fieldset class="display-group"><legend>' + g[1] + '</legend><div class="seg">';
    g[2].forEach(function (o) {
      var id = 'ds-' + g[0] + '-' + o[0];
      html += '<input type="radio" id="' + id + '" name="ds-' + g[0] + '" value="' + o[0] + '"' + (cur === o[0] ? ' checked' : '') + '>' +
              '<label for="' + id + '" class="seg-' + g[0] + '-' + o[0] + '">' + o[1] + '</label>';
    });
    html += '</div></fieldset>';
  });
  html += '</div><div class="display-actions"><button type="button" class="display-reset">Reset to default</button>' +
          '<button type="button" class="display-close">Close</button></div></div></div>';
  bar.innerHTML = html;
  var skip = document.querySelector('.skip');
  document.body.insertBefore(bar, skip ? skip.nextSibling : document.body.firstChild);
  var btn = bar.querySelector('.display-btn'), panel = bar.querySelector('.display-panel');
  function setOpen(o) { panel.hidden = !o; btn.setAttribute('aria-expanded', o ? 'true' : 'false'); }
  btn.addEventListener('click', function () { setOpen(panel.hidden); if (!panel.hidden) { var c = panel.querySelector('input:checked'); if (c) c.focus(); } });
  bar.querySelector('.display-close').addEventListener('click', function () { setOpen(false); btn.focus(); });
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
  function apply(k, v, def) { if (v === def) root.removeAttribute('data-' + k); else root.setAttribute('data-' + k, v); }
  panel.addEventListener('change', function (e) {
    var k = e.target.name.replace('ds-', ''), g = groups.filter(function (x) { return x[0] === k; })[0];
    state[k] = e.target.value; apply(k, e.target.value, g[3]); save(state);
  });
  bar.querySelector('.display-reset').addEventListener('click', function () {
    state = {}; save(state);
    groups.forEach(function (g) { root.removeAttribute('data-' + g[0]); var r = panel.querySelector('#ds-' + g[0] + '-' + g[3]); if (r) r.checked = true; });
  });
})();


/* Phones and tablets: a "Menu" button and a compact "Aa" display-settings button in the header row. */
(function () {
  var header = document.querySelector('.site-header'), nav = header && header.querySelector('.nav');
  if (!header || !nav) return;
  nav.id = nav.id || 'site-nav';
  var box = document.createElement('div'); box.className = 'header-actions';
  box.innerHTML =
    '<button type="button" class="hdr-btn aa-btn" aria-label="Display settings"><span aria-hidden="true">Aa</span></button>' +
    '<button type="button" class="hdr-btn menu-btn" aria-expanded="false" aria-controls="' + nav.id + '">' +
    '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path class="l1" d="M4 7h16"/><path class="l2" d="M4 12h16"/><path class="l3" d="M4 17h16"/></svg>' +
    '<span class="menu-label">Menu</span></button>';
  nav.parentNode.insertBefore(box, nav);
  header.classList.add('has-menu');
  var mbtn = box.querySelector('.menu-btn'), label = box.querySelector('.menu-label');
  function setOpen(o) { header.classList.toggle('menu-open', o); mbtn.setAttribute('aria-expanded', o ? 'true' : 'false'); label.textContent = o ? 'Close' : 'Menu'; }
  mbtn.addEventListener('click', function () { setOpen(!header.classList.contains('menu-open')); });
  header.addEventListener('keydown', function (e) { if (e.key === 'Escape' && header.classList.contains('menu-open')) { setOpen(false); mbtn.focus(); } });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  box.querySelector('.aa-btn').addEventListener('click', function () {
    var b = document.querySelector('.display-btn'); if (!b) return;
    b.click(); window.scrollTo(0, 0);
    var p = document.getElementById('display-panel'); if (p && !p.hidden) { var c = p.querySelector('input:checked'); if (c) c.focus(); }
  });
})();


/* Phone menu: Community Work and Media sub-links fold open one at a time. */
(function () {
  var header = document.querySelector('.site-header.has-menu');
  if (!header) return;
  var mq = matchMedia('(max-width:900px)');
  var dds = Array.prototype.slice.call(header.querySelectorAll('.nav .dd'));
  dds.forEach(function (dd) {
    var link = dd.querySelector(':scope > a'), menu = dd.querySelector('.dd-menu');
    var t = document.createElement('button');
    t.type = 'button'; t.className = 'sub-toggle';
    t.setAttribute('aria-expanded', 'false'); t.setAttribute('aria-controls', menu.id);
    t.setAttribute('aria-label', 'Show ' + link.textContent.trim() + ' pages');
    t.innerHTML = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
    var row = document.createElement('div'); row.className = 'sub-row';
    dd.insertBefore(row, link); row.appendChild(link); row.appendChild(t);
    t.addEventListener('click', function () {
      var open = !dd.classList.contains('sub-open');
      dds.forEach(function (o) { o.classList.remove('sub-open'); var b = o.querySelector('.sub-toggle'); if (b) b.setAttribute('aria-expanded', 'false'); });
      dd.classList.toggle('sub-open', open); t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
})();
