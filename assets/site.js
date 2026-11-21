import { mountWall, PHONE } from './wall.js?v=12';
import { FONTS } from './shell.js?v=12';

const doc = document.documentElement;
const ROOT = doc.dataset.root || '';
const PAGE = doc.dataset.page || 'home';
const SLUG = doc.dataset.slug || '';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HOME = ROOT || './';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 'r2:…' = a file in the video storage (Cloudflare R2), served from settings.mediaBase
let MEDIA = '';
const src = (p) => (!p ? '' : /^(https?:|blob:|data:)/.test(p) ? p : p.startsWith('r2:') ? MEDIA + p.slice(3) : ROOT + p);
const projectUrl = (slug) => `${ROOT}work/${slug}/`;
// hidden projects stay in content but are left out of the index, the homepage and "next project"
const listed = (site) => site.projects.filter((p) => !p.hidden);
const kind = (p) => [p.type, p.year].filter(Boolean).join(', ');
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const posterOf = (m) => (m ? src(m.type === 'video' ? m.poster : m.src) : '');

/* ---------- embeds ---------- */
export function embedUrl(link, autoplay = true) {
  if (!link) return '';
  const a = autoplay ? 1 : 0;
  let m = link.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-z0-9]+))?/i);
  if (m) {
    const hash = m[2] || new URL(link, location.href).searchParams.get('h');
    return `https://player.vimeo.com/video/${m[1]}?autoplay=${a}&dnt=1${hash ? `&h=${hash}` : ''}`;
  }
  m = link.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=${a}&rel=0`;
  return link;
}

/* ---------- media: videos play only while on screen ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target;
    if (e.isIntersecting && !v.dataset.hold) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); }
    else if (!v.paused) v.pause();
  }
}, { rootMargin: '120px 0px' }) : null;

function frame(m, { observe = true } = {}) {
  const f = document.createElement('div');
  f.className = 'frame';
  if (m.type === 'video' && !REDUCED) {
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.preload = 'none';
    if (m.poster) v.poster = src(m.poster);
    v.dataset.src = src(m.src);
    v.classList.add('ready');
    if (observe && io) io.observe(v);
    f.append(v);
  } else {
    const img = new Image();
    img.decoding = 'async'; img.loading = 'lazy'; img.alt = '';
    img.onload = () => img.classList.add('ready');
    img.src = posterOf(m);
    if (img.complete) img.classList.add('ready');
    f.append(img);
  }
  return f;
}
const playIn = (f, on) => {
  const v = f.querySelector('video');
  if (!v) return;
  if (on) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause();
};

function cell(m, p, linked = true, opt = {}) {
  const el = document.createElement(linked ? 'a' : 'div');
  el.className = 'cell';
  if (linked) {
    el.href = projectUrl(p.slug);
    el.setAttribute('aria-label', `${p.title}, ${kind(p)}`);
  }
  el.append(frame(m));
  if (linked) el.append(h(`<span class="label"><span>${esc(p.title)}</span><i>${esc(kind(p))}</i></span>`));
  // no size = automatic (desktop treats it as M; phones pick full width or half by shape)
  return { el, ratio: +opt.r || m.ratio || 16 / 9, size: opt.s || '', br: !!opt.br };
}

/* ---------- header + overlays ---------- */
function chrome(site) {
  const s = site.settings;
  const bar = h(`
    <header class="bar">
      <a class="name" href="${HOME}">${esc(s.name)}</a>
      <nav>
        <button data-open="index">Index</button>
        ${s.showreel ? '<button data-reel>Showreel</button>' : ''}
        <button data-open="info">Contact</button>
      </nav>
    </header>`);

  const index = h(`
    <div class="sheet index" hidden role="dialog" aria-label="Index">
      <ol>${listed(site).map((p, i) => `
        <li><a href="${projectUrl(p.slug)}" data-i="${i}">${esc(p.title)}<small>${esc(kind(p))}</small></a></li>`).join('')}
      </ol>
      <div class="preview"></div>
    </div>`);
  const preview = index.querySelector('.preview');
  const previews = listed(site).map((p) => {
    const m = p.media.find((x) => x.type === 'video') || p.media[0];
    if (!m) return null;
    const f = frame(m, { observe: false });
    f.style.aspectRatio = m.ratio;
    f.style.width = `min(100%, calc(min(70vh, 640px) * ${m.ratio}))`;
    preview.append(f);
    return f;
  });
  let shown = null;
  index.querySelectorAll('li a').forEach((a) => a.addEventListener('mouseenter', () => {
    const f = previews[+a.dataset.i];
    if (shown && shown !== f) { shown.classList.remove('on'); playIn(shown, false); }
    if (f) { f.classList.add('on'); playIn(f, true); }
    shown = f;
  }));

  const bio = (s.bio || '').split(/\n{2,}/).filter(Boolean).map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('');
  const insta = s.instagram ? (s.instagram.startsWith('http') ? s.instagram : `https://instagram.com/${s.instagram.replace('@', '')}`) : '';
  const ph = s.portrait;
  const info = h(`
    <div class="sheet info" hidden role="dialog" aria-label="Contact">
      <div class="wrap${ph?.src ? '' : ' nophoto'}">
        ${ph?.src ? `<figure class="portrait" style="--r:${+ph.ratio || 0.8}">
          <div class="frame"><img src="${esc(src(ph.src))}" alt="${esc(s.name)}" loading="lazy" decoding="async" onload="this.classList.add('ready')"></div>
          ${s.portraitCredit ? `<figcaption>Photo: ${esc(s.portraitCredit)}</figcaption>` : ''}
        </figure>` : ''}
        <div class="text">
          <div class="bio">${bio}</div>
          <dl class="links">
            ${s.email ? `<dt>Email</dt><dd><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></dd>` : ''}
            ${insta ? `<dt>Instagram</dt><dd><a href="${esc(insta)}" target="_blank" rel="noopener">${esc(insta.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, ''))}</a></dd>` : ''}
            ${s.showreel ? '<dt>Showreel</dt><dd><a href="#" data-reel>Watch →</a></dd>' : ''}
          </dl>
        </div>
      </div>
    </div>`);

  const sheets = { index, info };
  const buttons = [...bar.querySelectorAll('[data-open]')];
  let open = null;
  const set = (name) => {
    open = open === name ? null : name;
    for (const [k, el] of Object.entries(sheets)) el.hidden = k !== open;
    buttons.forEach((b) => (b.textContent = b.dataset.open === open ? 'Close' : b.dataset.open === 'index' ? 'Index' : 'Contact'));
    document.body.classList.toggle('locked', !!open);
    if (!open && shown) { shown.classList.remove('on'); playIn(shown, false); shown = null; }
  };
  buttons.forEach((b) => (b.onclick = () => set(b.dataset.open)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) set(open); });
  if (/^#(info|contact)$/.test(location.hash)) set('info');

  for (const b of [...bar.querySelectorAll('[data-reel]'), ...info.querySelectorAll('[data-reel]')]) {
    b.addEventListener('click', (e) => { e.preventDefault(); openReel(s.showreel); });
  }
  return [bar, index, info];
}

function openReel(link) {
  const el = h(`<div class="reel" role="dialog" aria-label="Showreel">
      <button class="close">Close</button>
      <div class="box"><iframe src="${esc(embedUrl(link))}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>
    </div>`);
  const close = () => { el.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  el.querySelector('.close').onclick = close;
  el.onclick = (e) => e.target === el && close();
  addEventListener('keydown', onKey);
  document.body.append(el);
}

/* ---------- pages ---------- */
function home(site, main) {
  const cells = (list, sized) => (list || []).map(({ p, m, s, r, br }) => {
    const pr = site.projects.find((x) => x.slug === p && !x.hidden);
    const media = pr?.media.find((x) => x.id === m);
    return media ? cell(media, pr, true, sized ? { s, r, br } : { r }) : null;
  }).filter(Boolean);
  const desk = cells(site.home, true);
  // phones get their own order and sizes when set up in Studio, otherwise the desktop order with automatic sizes
  let phone = null;
  const items = (vw) => vw <= PHONE ? (phone ||= site.homePhone ? cells(site.homePhone, true) : cells(site.home, false)) : desk;
  const w = document.createElement('div');
  w.className = 'wall';
  main.append(w);
  mountWall(w, items);

  const s = site.settings;
  main.append(h(`
    <footer class="foot">
      <span class="line">${esc(s.description || s.role)}</span>
      <span class="contact small">
        ${s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : ''}
        <span>© ${new Date().getFullYear()} ${esc(s.name)}</span>
      </span>
    </footer>`));
}

function project(site, main) {
  const i = site.projects.findIndex((x) => x.slug === SLUG);
  const p = site.projects[i];
  if (!p) { main.append(h(`<p class="intro">Project not found.&nbsp;<a href="${HOME}">Back to the work</a></p>`)); return; }
  const [first, ...rest] = p.media || [];
  const crew = (p.crew || []).filter((c) => c.role || c.name);

  if (first) {
    const hero = h('<section class="hero"></section>');
    const f = frame(first);
    f.style.aspectRatio = first.ratio || 16 / 9;
    f.style.width = `min(100%, calc(${CSS.supports('height', '100svh') ? '100svh' : '100vh'} * ${first.ratio || 16 / 9}))`;
    hero.append(f);
    main.append(hero);
  }

  main.append(h(`
    <section class="intro">
      <p class="kind small">${esc(kind(p))}</p>
      <h1>${esc(p.title)}</h1>
      <div class="about">
        ${(p.description || '').split(/\n{2,}/).filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join('')}
        ${crew.length ? `<dl class="credits">${crew.map((c) => `<dt>${esc(c.role)}</dt><dd>${esc(c.name)}</dd>`).join('')}</dl>` : ''}
        ${p.festivals?.length ? `<ul class="festivals">${p.festivals.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      </div>
    </section>`));

  if (p.film) {
    const btn = h(`<button class="film" aria-label="Watch ${esc(p.title)}">
        ${first ? `<img src="${esc(posterOf(first))}" alt="" class="ready">` : ''}
        <span class="play">Watch the film →</span></button>`);
    btn.onclick = () => btn.replaceWith(h(`<div class="film"><iframe src="${esc(embedUrl(p.film))}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`));
    main.append(btn);
  }

  if (rest.length) {
    const w = document.createElement('div');
    w.className = 'wall';
    main.append(w);
    mountWall(w, rest.map((m) => cell(m, p, false)));
  }

  // next visible project after this one (wrapping round); a hidden page still links onward
  const order = site.projects;
  let next = null;
  for (let k = 1; k < order.length && !next; k++) { const q = order[(i + k) % order.length]; if (!q.hidden) next = q; }
  if (next && next !== p) {
    const m = next.media.find((x) => x.type === 'video') || next.media[0];
    const a = h(`<a class="next" href="${projectUrl(next.slug)}"><span class="txt"><b>${esc(next.title)}</b><span>Next project →</span></span></a>`);
    if (m) a.prepend(frame(m));
    main.append(a);
  }
}

async function main() {
  const res = await fetch(`${ROOT}content/site.json`, { cache: 'no-cache' });
  const site = await res.json();
  doc.dataset.theme = site.settings.theme || 'light';
  MEDIA = (site.settings.mediaBase || '').replace(/\/*$/, '/');
  const app = document.getElementById('app');
  const mainEl = document.createElement('main');
  app.replaceChildren(...chrome(site), mainEl);
  (PAGE === 'project' ? project : home)(site, mainEl);
}

/* try fonts without publishing: add ?font=garamond (or any key of FONTS) to the address */
function fontTry() {
  let f = new URLSearchParams(location.search).get('font');
  try { if (f) sessionStorage.setItem('fontTry', f); else f = sessionStorage.getItem('fontTry'); } catch {}
  if (!f || !FONTS[f]) return;
  const use = (k) => {
    if (!document.querySelector(`link[data-try="${k}"]`)) document.head.append(h(`<link rel="stylesheet" href="${FONTS[k].url}" data-try="${k}">`));
    doc.dataset.font = k;
    try { sessionStorage.setItem('fontTry', k); } catch {}
    bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.f === k));
  };
  const bar = h(`<div class="fonttry">${Object.keys(FONTS).map((k) => `<button data-f="${k}" title="${esc(FONTS[k].label)}">${esc(FONTS[k].label.split(' — ')[0])}</button>`).join('')}</div>`);
  bar.querySelectorAll('button').forEach((b) => (b.onclick = () => use(b.dataset.f)));
  document.body.append(bar);
  use(f);
}

if (document.getElementById('app')) { main(); fontTry(); }
