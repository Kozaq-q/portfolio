const doc = document.documentElement;
const ROOT = doc.dataset.root || '';
const PAGE = doc.dataset.page || 'home';
const SLUG = doc.dataset.slug || '';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const src = (p) => (!p ? '' : /^(https?:|blob:|data:)/.test(p) ? p : ROOT + p);
const projectUrl = (slug) => `${ROOT}work/${slug}/`;
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

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
    if (e.isIntersecting) {
      if (!v.src) v.src = v.dataset.src;
      v.play().catch(() => {});
    } else if (!v.paused) v.pause();
  }
}, { rootMargin: '150px 0px' }) : null;

function frame(m, { maxH } = {}) {
  const f = document.createElement('div');
  f.className = 'frame';
  f.style.aspectRatio = m.ratio || 16 / 9;
  if (maxH) f.style.width = `min(100%, calc(${maxH} * ${m.ratio || 16 / 9}))`;
  if (m.type === 'video' && !REDUCED) {
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.preload = 'none';
    if (m.poster) v.poster = src(m.poster);
    v.dataset.src = src(m.src);
    v.classList.add('ready'); // poster shows immediately
    if (io) io.observe(v); else { v.src = v.dataset.src; v.autoplay = true; }
    f.append(v);
  } else {
    const img = new Image();
    img.decoding = 'async'; img.loading = 'lazy'; img.alt = '';
    img.onload = () => img.classList.add('ready');
    img.src = src(m.type === 'video' ? m.poster : m.src);
    if (img.complete) img.classList.add('ready');
    f.append(img);
  }
  return f;
}

/* ---------- masonry: shortest column first, order preserved left→right ---------- */
function masonry(el, items, render) {
  const cols = () => (innerWidth <= 860 ? 1 : innerWidth >= 2000 ? 3 : 2);
  let n = 0;
  const nodes = items.map(render);
  const layout = () => {
    const c = cols();
    if (c === n) return;
    n = c;
    el.replaceChildren();
    const colEls = Array.from({ length: c }, () => { const d = document.createElement('div'); d.className = 'col'; el.append(d); return d; });
    const heights = new Array(c).fill(0);
    items.forEach((it, i) => {
      const k = heights.indexOf(Math.min(...heights));
      colEls[k].append(nodes[i]);
      heights[k] += 1 / (it.m.ratio || 16 / 9) + 0.02;
    });
  };
  layout();
  addEventListener('resize', layout);
}

/* ---------- side column ---------- */
function side(site) {
  const s = site.settings;
  const aside = h(`
    <aside class="side">
      <a class="id" href="${ROOT || './'}"><b>${esc(s.name)}</b><span>${esc(s.role)}</span></a>
      <button class="menu" aria-expanded="false">Index</button>
      <nav class="index ${PAGE === 'project' ? 'has-current' : ''}" aria-label="Projects">
        <ol>${site.projects.map((p) => `
          <li><a href="${projectUrl(p.slug)}" data-p="${esc(p.slug)}"${p.slug === SLUG ? ' aria-current="page"' : ''}>
            <span class="t">${esc(p.title)}</span><span class="y">${esc(p.year)}</span></a></li>`).join('')}
        </ol>
      </nav>
      <section class="info" hidden>
        <button class="back">← Index</button>
        ${(s.bio || '').split(/\n{2,}/).map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`).join('')}
      </section>
      <div class="links">
        ${s.showreel ? '<button data-reel>Showreel</button>' : ''}
        <button data-info aria-pressed="false">Information</button>
        ${s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : ''}
        ${s.instagram ? `<a href="${esc(s.instagram.startsWith('http') ? s.instagram : 'https://instagram.com/' + s.instagram.replace('@', ''))}" target="_blank" rel="noopener">Instagram</a>` : ''}
      </div>
    </aside>`);

  const nav = aside.querySelector('.index');
  const info = aside.querySelector('.info');
  const infoBtn = aside.querySelector('[data-info]');
  const toggleInfo = (on) => {
    info.hidden = !on; nav.hidden = on;
    infoBtn.setAttribute('aria-pressed', on);
  };
  infoBtn.onclick = () => toggleInfo(info.hidden);
  aside.querySelector('.back').onclick = () => toggleInfo(false);
  if (location.hash === '#info') toggleInfo(true);

  const menu = aside.querySelector('.menu');
  menu.onclick = () => {
    const open = aside.classList.toggle('open');
    menu.textContent = open ? 'Close' : 'Index';
    menu.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };

  const reelBtn = aside.querySelector('[data-reel]');
  if (reelBtn) reelBtn.onclick = () => openReel(s.showreel);
  return aside;
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
  el.querySelector('.close').focus();
}

/* hovering a title isolates its shots; hovering a shot marks its title */
function linkHover(aside, stage) {
  const links = [...aside.querySelectorAll('.index a')];
  const tiles = () => [...stage.querySelectorAll('.tile')];
  if (!matchMedia('(hover: hover)').matches) return;
  for (const a of links) {
    a.addEventListener('mouseenter', () => {
      const p = a.dataset.p;
      const mine = tiles().filter((t) => t.dataset.p === p);
      if (!mine.length) return;
      stage.classList.add('focusing');
      tiles().forEach((t) => t.classList.toggle('on', t.dataset.p === p));
    });
    a.addEventListener('mouseleave', () => stage.classList.remove('focusing'));
  }
  stage.addEventListener('mouseover', (e) => {
    const t = e.target.closest('.tile');
    links.forEach((a) => a.classList.toggle('hl', !!t && a.dataset.p === t.dataset.p));
  });
  stage.addEventListener('mouseleave', () => links.forEach((a) => a.classList.remove('hl')));
}

/* ---------- pages ---------- */
function tile(site, it) {
  const p = site.projects.find((x) => x.slug === it.p);
  const a = document.createElement('a');
  a.className = 'tile';
  a.href = projectUrl(it.p);
  a.dataset.p = it.p;
  a.setAttribute('aria-label', p ? `${p.title}, ${p.year}` : '');
  a.append(frame(it.m));
  if (p) a.append(h(`<span class="cap"><span>${esc(p.title)}</span><i>${esc(p.type)}, ${esc(p.year)}</i></span>`));
  return a;
}

function home(site, stage) {
  const items = (site.home || []).map(({ p, m }) => {
    const pr = site.projects.find((x) => x.slug === p);
    const media = pr?.media.find((x) => x.id === m);
    return media ? { p, m: media } : null;
  }).filter(Boolean);
  const grid = document.createElement('div');
  grid.className = 'grid';
  stage.append(grid);
  masonry(grid, items, (it) => tile(site, it));
}

function project(site, stage) {
  const i = site.projects.findIndex((x) => x.slug === SLUG);
  const p = site.projects[i];
  if (!p) { stage.innerHTML = `<p class="mute">Project not found. <a href="${ROOT || './'}">Back to index</a></p>`; return; }
  const [hero, ...rest] = p.media || [];
  const next = site.projects[(i + 1) % site.projects.length];
  const crew = (p.crew || []).filter((c) => c.role || c.name);
  const el = h(`
    <article class="project">
      <header class="p-head">
        <div>
          <p class="kind small">${esc([p.type, p.year].filter(Boolean).join(', '))}</p>
          <h1>${esc(p.title)}</h1>
        </div>
        ${crew.length ? `<dl class="credits">${crew.map((c) => `<dt>${esc(c.role)}</dt><dd>${esc(c.name)}</dd>`).join('')}</dl>` : '<div></div>'}
        <div class="p-text">
          ${(p.description || '').split(/\n{2,}/).filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join('')}
          ${p.festivals?.length ? `<ul class="festivals">${p.festivals.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        </div>
      </header>
    </article>`);
  if (hero) { const f = h('<figure class="hero"></figure>'); f.append(frame(hero, { maxH: '86vh' })); el.append(f); }
  if (p.film) {
    const poster = hero ? src(hero.type === 'video' ? hero.poster : hero.src) : '';
    const btn = h(`<button class="film" aria-label="Watch ${esc(p.title)}">
        ${poster ? `<img src="${esc(poster)}" alt="" class="ready">` : ''}
        <span class="play"><span>Watch the film</span><span>→</span></span></button>`);
    btn.onclick = () => {
      btn.replaceWith(h(`<div class="film"><iframe src="${esc(embedUrl(p.film))}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`));
    };
    el.append(btn);
  }
  if (rest.length) {
    const g = h('<div class="grid p-grid"></div>');
    el.append(g);
    masonry(g, rest.map((m) => ({ p: p.slug, m })), (it) => { const d = document.createElement('div'); d.className = 'tile'; d.append(frame(it.m)); return d; });
  }
  if (next && next !== p) {
    el.append(h(`<nav class="next small"><a href="${ROOT || './'}">Index</a><a href="${projectUrl(next.slug)}">Next — <b>${esc(next.title)}</b></a></nav>`));
  }
  stage.append(el);
}

async function main() {
  const res = await fetch(`${ROOT}content/site.json`, { cache: 'no-cache' });
  const site = await res.json();
  doc.dataset.theme = site.settings.theme || 'light';
  const app = document.getElementById('app');
  const aside = side(site);
  const stage = document.createElement('main');
  stage.className = 'stage';
  app.replaceChildren(aside, stage);
  (PAGE === 'project' ? project : home)(site, stage);
  linkHover(aside, stage);
}

if (document.getElementById('app')) main();
