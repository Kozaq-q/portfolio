// Studio — content editor for the portfolio.
// Edits content/site.json and media in the GitHub repository through the GitHub API.
// Nothing is stored on a server: the access token lives only in this browser (localStorage).
import { allShells, FONTS } from '../assets/shell.js?v=9';
import { packRows, renderRows, SIZES, SHAPES, PHONE_SIZES } from '../assets/wall.js?v=9';

const CFG_KEY = 'studio.cfg';
const API = 'https://api.github.com';

const S = {
  cfg: load(CFG_KEY) || {},
  offline: false,
  site: null,        // working copy
  baseJson: '',      // last published JSON (for change detection)
  baseSlugs: [],     // slugs at last publish (to remove stale pages)
  files: new Map(),  // path -> { blob, url, uploaded }
  removed: new Set(),// media paths to delete on publish
  tab: 'projects',
  current: null,     // slug being edited
  busy: false,
  homeView: 'desktop',
  homeWall: null,
  homeSel: null,
};

/* ---------- helpers ---------- */
function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const slugify = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mediaUrl = (p) => (!p ? '' : S.files.get(p)?.url || (/^https?:/.test(p) ? p : '../' + p));
const project = () => S.site.projects.find((p) => p.slug === S.current);
const dirty = () => JSON.stringify(S.site) !== S.baseJson || [...S.files.values()].some((f) => !f.uploaded) || S.removed.size > 0;
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

function toast(msg, ms = 3200) {
  const t = h(`<div class="toast">${esc(msg)}</div>`);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------- GitHub API ---------- */
async function gh(path, opts = {}) {
  const { owner, repo } = S.cfg;
  const res = await fetch(`${API}/repos/${owner}/${repo}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${S.cfg.token}`,
      Accept: opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch {}
    const err = new Error(`GitHub: ${msg} (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return opts.raw ? res.text() : res.status === 204 ? null : res.json();
}

const b64 = (blob) => new Promise((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = bad;
  r.readAsDataURL(blob);
});

async function connect() {
  const info = await fetch(`${API}/repos/${S.cfg.owner}/${S.cfg.repo}`, {
    headers: { Authorization: `Bearer ${S.cfg.token}`, Accept: 'application/vnd.github+json' },
  });
  if (info.status === 404) throw new Error('Repository not found — check the owner/name, or the token has no access to it.');
  if (info.status === 401) throw new Error('The token was rejected. Create a new one and paste it again.');
  const repo = await info.json();
  if (repo.permissions && !repo.permissions.push) throw new Error('This token can read but not write. Give it “Contents: Read and write”.');
  S.cfg.branch = S.cfg.branch || repo.default_branch;
  const text = await gh(`/contents/content/site.json?ref=${encodeURIComponent(S.cfg.branch)}`, { raw: true });
  return JSON.parse(text);
}

async function publish() {
  if (S.offline) return toast('Preview mode — connect to GitHub to publish.');
  if (S.busy || !dirty()) return;
  S.busy = true; status('Preparing…');
  try {
    const { branch } = S.cfg;
    const ref = await gh(`/git/ref/heads/${branch}`);
    const head = await gh(`/git/commits/${ref.object.sha}`);
    const tree = [];

    // media still referenced by the site
    const used = new Set();
    for (const p of S.site.projects) for (const m of p.media) { used.add(m.src); if (m.poster) used.add(m.poster); }
    if (S.site.settings.portrait?.src) used.add(S.site.settings.portrait.src);
    const uploads = [...S.files.entries()].filter(([path, f]) => !f.uploaded && used.has(path));
    let i = 0;
    for (const [path, f] of uploads) {
      status(`Uploading ${++i}/${uploads.length} — ${mb(f.blob.size)}`);
      const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await b64(f.blob), encoding: 'base64' }) });
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    for (const path of S.removed) if (!used.has(path) && !S.files.has(path)) tree.push({ path, mode: '100644', type: 'blob', sha: null });

    // content + generated pages
    S.site.home = S.site.home.filter((t) => S.site.projects.find((x) => x.slug === t.p)?.media.some((x) => x.id === t.m));
    syncPhone();
    tree.push({ path: 'content/site.json', mode: '100644', type: 'blob', content: JSON.stringify(S.site, null, 2) + '\n' });
    for (const [path, html] of Object.entries(allShells(S.site))) tree.push({ path, mode: '100644', type: 'blob', content: html });
    const slugs = S.site.projects.map((p) => p.slug);
    for (const s of S.baseSlugs) if (!slugs.includes(s)) tree.push({ path: `work/${s}/index.html`, mode: '100644', type: 'blob', sha: null });

    status('Saving…');
    const newTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
    const commit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: 'Update site content (Studio)', tree: newTree.sha, parents: [head.sha] }) });
    await gh(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });

    for (const [, f] of uploads) f.uploaded = true;
    for (const [path, f] of S.files) if (!used.has(path)) { URL.revokeObjectURL(f.url); S.files.delete(path); }
    S.removed.clear();
    S.baseJson = JSON.stringify(S.site);
    S.baseSlugs = slugs;
    S.busy = false;
    status();
    toast('Published. The live site updates in about a minute.', 5000);
  } catch (e) {
    S.busy = false; status();
    if (e.status === 409 || e.status === 422) toast('The repository changed in the meantime. Reload Studio and try again.', 7000);
    else toast(e.message, 7000);
    console.error(e);
  }
}

/* ---------- media processing ---------- */
async function canvasBlob(canvas) {
  const webp = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.86));
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' };
  return { blob: await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88)), ext: 'jpg' };
}

function drawScaled(source, w, h, max) {
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c;
}

// iPhone photos (HEIC/HEIF): Safari reads them natively; other browsers get a decoder, loaded only when needed
const isHeic = (f) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
const isImage = (f) => f.type.startsWith('image/') || isHeic(f);
let heicLib = null;
const loadHeic = () => heicLib ||= new Promise((ok, bad) => {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
  s.onload = () => ok(window.heic2any);
  s.onerror = () => { heicLib = null; bad(new Error('Could not load the HEIC reader. Check your connection, or export the photo as JPEG.')); };
  document.head.append(s);
});
async function bitmapOf(file) {
  try { return await createImageBitmap(file); } catch (e) {
    if (!isHeic(file)) throw new Error(`This browser can't read “${file.name}”. Export it as JPEG or PNG.`);
  }
  const heic2any = await loadHeic();
  let out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
  if (Array.isArray(out)) out = out[0];
  return createImageBitmap(out);
}

async function processImage(file) {
  const bmp = await bitmapOf(file);
  const out = await canvasBlob(drawScaled(bmp, bmp.width, bmp.height, 2400));
  return { ...out, ratio: bmp.width / bmp.height };
}

function processVideo(file) {
  return new Promise((ok, bad) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.src = URL.createObjectURL(file);
    v.onerror = () => bad(new Error(`This browser can't read “${file.name}”. Export it as MP4 (H.264).`));
    v.onloadedmetadata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 3); };
    v.onseeked = async () => {
      const poster = await canvasBlob(drawScaled(v, v.videoWidth, v.videoHeight, 1920));
      URL.revokeObjectURL(v.src);
      ok({ ratio: v.videoWidth / v.videoHeight, poster, duration: v.duration });
    };
  });
}

function addFile(path, blob) {
  const url = URL.createObjectURL(blob);
  S.files.set(path, { blob, url, uploaded: false });
  return path;
}

async function addMedia(p, fileList) {
  const files = [...fileList];
  for (const [n, file] of files.entries()) {
    status(`Processing ${n + 1}/${files.length}…`);
    const base = `media/${p.slug}/${uid()}-${slugify(file.name.replace(/\.[^.]+$/, '')).slice(0, 40)}`;
    try {
      if (isImage(file)) {
        const img = await processImage(file);
        p.media.push({ id: uid(), type: 'image', src: addFile(`${base}.${img.ext}`, img.blob), ratio: +img.ratio.toFixed(4) });
      } else if (file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
        if (file.size > 95 * 1048576) { toast(`“${file.name}” is ${mb(file.size)} — the limit is 95 MB. Export a shorter or lighter version.`, 7000); continue; }
        if (file.size > 25 * 1048576 && !confirm(`“${file.name}” is ${mb(file.size)}.\n\nLoops work best under ~15 MB (720–1080p, H.264, 5–10 s, no audio). Heavy clips slow down the page.\n\nUpload anyway?`)) continue;
        const vid = await processVideo(file);
        const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'mp4').toLowerCase();
        p.media.push({
          id: uid(), type: 'video',
          src: addFile(`${base}.${ext}`, file),
          poster: addFile(`${base}-poster.${vid.poster.ext}`, vid.poster.blob),
          ratio: +vid.ratio.toFixed(4),
        });
      } else toast(`Skipped “${file.name}” — not an image or video.`);
    } catch (e) { toast(e.message, 6000); console.error(e); }
  }
  status();
  render();
}

function forgetMedia(m) {
  for (const path of [m.src, m.poster].filter(Boolean)) {
    const f = S.files.get(path);
    if (f && !f.uploaded) { URL.revokeObjectURL(f.url); S.files.delete(path); } else S.removed.add(path);
  }
}

/* ---------- UI ---------- */
function status(text) {
  const el = $('.status');
  if (!el) return;
  const btn = $('[data-publish]');
  if (text) { el.textContent = text; el.className = 'status'; if (btn) btn.disabled = true; return; }
  const d = dirty();
  el.textContent = S.offline ? 'Preview mode — not connected' : d ? 'Unpublished changes' : 'Everything is published';
  el.className = 'status ' + (S.offline ? '' : d ? 'warn' : 'ok');
  if (btn) btn.disabled = S.offline || !d || S.busy;
}

function move(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }
const updown = (i, n) => `<span class="updown"><button data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button data-down="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">↓</button></span>`;

function render() {
  if (S.homeWall) { S.homeWall.stop(); S.homeWall = null; }
  const app = $('#app');
  app.replaceChildren(h(`
    <div>
      <header class="top">
        <b>Studio</b>
        <nav class="tabs" role="tablist">
          ${[['projects', 'Projects'], ['home', 'Homepage'], ['settings', 'Settings']].map(([k, l]) =>
            `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join('')}
        </nav>
        <span class="spacer"></span>
        <span class="status"></span>
        <a class="btn quiet" href="../" target="_blank">View site ↗</a>
        <button class="btn primary" data-publish>Publish</button>
      </header>
      <div class="wrap"></div>
    </div>`));
  app.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; render(); }));
  $('[data-publish]').onclick = publish;
  const wrap = $('.wrap');
  ({ projects: viewProjects, home: viewHome, settings: viewSettings })[S.tab](wrap);
  status();
}

/* bind inputs with data-k="path.to.field" to an object without re-rendering */
function bind(root, obj, after) {
  root.querySelectorAll('[data-k]').forEach((el) => {
    const k = el.dataset.k;
    el.value = obj[k] ?? '';
    el.addEventListener('input', () => {
      obj[k] = el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value;
      after?.(k, el);
      status();
    });
  });
}

function viewProjects(wrap) {
  const ps = S.site.projects;
  if (!S.current || !project()) S.current = ps[0]?.slug || null;
  const el = h(`
    <div class="split">
      <div>
        <ul class="list">${ps.map((p, i) => `
          <li><button class="pick" data-pick="${esc(p.slug)}" aria-current="${p.slug === S.current}">${esc(p.title || 'Untitled')}<small>${esc(p.year)}</small></button>${updown(i, ps.length)}</li>`).join('')}
        </ul>
        <p><button class="btn" data-add>+ New project</button></p>
        <p class="hint">The order here is the order of the index on the site.</p>
      </div>
      <div class="editor"></div>
    </div>`);
  el.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { S.current = b.dataset.pick; render(); }));
  el.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => { move(ps, +b.dataset.up, -1); render(); }));
  el.querySelectorAll('[data-down]').forEach((b) => (b.onclick = () => { move(ps, +b.dataset.down, 1); render(); }));
  $('[data-add]', el).onclick = () => {
    let slug = 'new-project', n = 2;
    while (ps.some((p) => p.slug === slug)) slug = `new-project-${n++}`;
    ps.unshift({ slug, title: 'New project', type: 'Short film', year: new Date().getFullYear(), crew: [{ role: 'Director', name: '' }, { role: 'Cinematographer', name: S.site.settings.name }], description: '', festivals: [], film: '', media: [] });
    S.current = slug;
    render();
  };
  wrap.append(el);
  if (S.current) editor($('.editor', el), project());
  else $('.editor', el).append(h('<p class="empty">No projects yet.</p>'));
}

function editor(box, p) {
  const el = h(`
    <div class="form">
      <h2>${esc(p.title || 'Untitled')}</h2>
      <div class="row">
        <label><span>Title</span><input data-k="title"></label>
        <label><span>Type (small print on the page)</span><input data-k="type" list="types"></label>
        <label><span>Year</span><input data-k="year" type="number" min="1950" max="2100"></label>
      </div>
      <datalist id="types">${['Short film', 'Feature film', 'Documentary', 'Music video', 'Commercial', 'Fashion film'].map((t) => `<option value="${t}">`).join('')}</datalist>
      <label><span>Address of the page</span><input data-slug value="${esc(p.slug)}"><p class="hint">yoursite.com/work/<b>${esc(p.slug)}</b>/ — changes when you leave the field.</p></label>

      <div>
        <h3>Crew</h3>
        <div class="crew">${p.crew.map((c, i) => `
          <div class="line"><input data-crew="${i}" data-f="role" value="${esc(c.role)}" placeholder="Role"><input data-crew="${i}" data-f="name" value="${esc(c.name)}" placeholder="Name"><button class="btn quiet" data-rmcrew="${i}" aria-label="Remove">×</button></div>`).join('')}
        </div>
        <p><button class="btn quiet" data-addcrew>+ Add person</button></p>
      </div>

      <label><span>Description (optional)</span><textarea data-k="description" rows="4"></textarea></label>
      <label><span>Festivals &amp; awards — one per line (optional)</span><textarea data-fest rows="4">${esc((p.festivals || []).join('\n'))}</textarea></label>
      <label><span>Full film or trailer — Vimeo or YouTube link (optional)</span><input data-k="film" placeholder="https://vimeo.com/…"></label>

      <div>
        <h3>Shots &amp; stills — the first one opens the project page</h3>
        <div class="media">
          ${p.media.map((m, i) => mediaCard(p, m, i)).join('')}
          <label class="drop"><input type="file" accept="image/*,.heic,.heif,video/mp4,video/webm,video/quicktime" multiple hidden>Add photos or clips<br>click or drop files</label>
        </div>
        <p class="hint">Clips: MP4 (H.264), 5–10 s, no audio, ideally under 15 MB. Photos are resized automatically.</p>
      </div>

      <p><button class="btn danger" data-del>Delete project</button></p>
    </div>`);

  bind(el, p, (k) => { if (k === 'title') { $('h2', el).textContent = p.title || 'Untitled'; const b = $(`[data-pick="${CSS.escape(p.slug)}"]`); if (b) b.firstChild.textContent = p.title || 'Untitled'; } });

  const slugIn = $('[data-slug]', el);
  slugIn.onchange = () => {
    const next = slugify(slugIn.value);
    if (next === p.slug) return (slugIn.value = p.slug);
    if (S.site.projects.some((x) => x.slug === next)) { toast('Another project already uses this address.'); slugIn.value = p.slug; return; }
    [...S.site.home, ...(S.site.homePhone || [])].forEach((t) => { if (t.p === p.slug) t.p = next; });
    p.slug = next; S.current = next; render();
  };

  el.querySelectorAll('[data-crew]').forEach((inp) => inp.addEventListener('input', () => { p.crew[+inp.dataset.crew][inp.dataset.f] = inp.value; status(); }));
  el.querySelectorAll('[data-rmcrew]').forEach((b) => (b.onclick = () => { p.crew.splice(+b.dataset.rmcrew, 1); render(); }));
  $('[data-addcrew]', el).onclick = () => { p.crew.push({ role: '', name: '' }); render(); };
  $('[data-fest]', el).addEventListener('input', (e) => { p.festivals = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); status(); });

  el.querySelectorAll('[data-mleft],[data-mright]').forEach((b) => (b.onclick = () => { move(p.media, +(b.dataset.mleft ?? b.dataset.mright), b.dataset.mleft != null ? -1 : 1); render(); }));
  el.querySelectorAll('[data-mrm]').forEach((b) => (b.onclick = () => {
    const m = p.media[+b.dataset.mrm];
    if (!confirm('Remove this from the project?')) return;
    p.media.splice(+b.dataset.mrm, 1);
    S.site.home = S.site.home.filter((t) => !(t.p === p.slug && t.m === m.id));
    forgetMedia(m); render();
  }));
  el.querySelectorAll('[data-onhome]').forEach((c) => (c.onchange = () => {
    const id = c.dataset.onhome;
    if (c.checked) { S.site.home.push({ p: p.slug, m: id }); S.site.homePhone?.push({ p: p.slug, m: id }); }
    else S.site.home = S.site.home.filter((t) => !(t.p === p.slug && t.m === id));
    status();
  }));

  const drop = $('.drop', el), input = $('input[type=file]', drop);
  input.onchange = () => addMedia(p, input.files);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); addMedia(p, e.dataTransfer.files); };

  $('[data-del]', el).onclick = () => {
    if (!confirm(`Delete “${p.title}” with all its shots? (It disappears from the site when you publish.)`)) return;
    p.media.forEach(forgetMedia);
    S.site.home = S.site.home.filter((t) => t.p !== p.slug);
    S.site.projects = S.site.projects.filter((x) => x !== p);
    S.current = null; render();
  };
  box.append(el);
}

function mediaCard(p, m, i) {
  const onHome = S.site.home.some((t) => t.p === p.slug && t.m === m.id);
  const isNew = S.files.has(m.src) && !S.files.get(m.src).uploaded;
  const thumb = m.type === 'video'
    ? `<video src="${esc(mediaUrl(m.src))}" poster="${esc(mediaUrl(m.poster))}" muted loop playsinline preload="none" onmouseenter="this.play()" onmouseleave="this.pause()"></video>`
    : `<img src="${esc(mediaUrl(m.src))}" alt="" loading="lazy">`;
  return `
    <div class="m">
      <div class="thumb">${thumb}<span class="badge">${i === 0 ? 'Opening · ' : ''}${m.type === 'video' ? 'Clip' : 'Still'}</span>${isNew ? '<span class="badge new">new</span>' : ''}</div>
      <div class="bar">
        <label><input type="checkbox" data-onhome="${esc(m.id)}" ${onHome ? 'checked' : ''}> Homepage</label>
        <button class="btn quiet" data-mleft="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">←</button>
        <button class="btn quiet" data-mright="${i}" ${i === p.media.length - 1 ? 'disabled' : ''} aria-label="Move later">→</button>
        <button class="btn quiet" data-mrm="${i}" aria-label="Remove">×</button>
      </div>
    </div>`;
}

// the phone list only ever holds shots that are on the desktop homepage
function syncPhone() {
  if (!S.site.homePhone) return;
  S.site.homePhone = S.site.homePhone.filter((x) => S.site.home.some((t) => t.p === x.p && t.m === x.m));
}

function viewHome(wrap) {
  wrap.classList.add('wide');
  const home = S.site.home = S.site.home.filter((t) => S.site.projects.find((x) => x.slug === t.p)?.media.some((x) => x.id === t.m));
  syncPhone();
  const st = S.site.settings;
  const phone = S.homeView === 'phone';
  const own = !!S.site.homePhone;
  // what this view edits: the desktop list, the phone's own list, or (phone without its own list) a read-only copy
  const list = phone && own ? S.site.homePhone : home;
  const editable = !phone || own;
  const sized = editable;
  const el = h(`
    <div>
      <h2>Homepage</h2>
      <p class="hint" style="margin-bottom:18px">A smaller copy of your front page, in its real proportions. Drag tiles to reorder them. Click a tile to set its size and shape.
        Add or remove shots with the “Homepage” checkbox inside each project.</p>
      <div class="hometools">
        <span class="seg" role="group" aria-label="Preview">
          <button data-view="desktop" aria-pressed="${!phone}">Desktop</button><button data-view="phone" aria-pressed="${phone}">Phone</button>
        </span>
        <button class="btn" data-shuffle ${list.length < 2 || !editable ? 'disabled' : ''}>Shuffle</button>
        ${phone ? (own
          ? '<span class="pill">Own phone layout</span><button class="btn quiet" data-unown>Follow desktop again</button>'
          : '<button class="btn" data-own>Make a separate phone layout</button>') : ''}
        <span class="hint" data-scale style="margin:0 0 0 auto"></span>
      </div>
      ${home.length ? `
      <div class="homecols">
        <div class="stage">
          <div class="screen ${phone ? 'phone' : ''} ${st.theme === 'dark' ? 'dark' : ''}">
            <div class="sbar"><span>${esc(st.name)}</span><span>Index<i></i>Contact</span></div>
            <div class="hw"></div>
            <div class="fold"><span>end of the first screen</span></div>
            <div class="sfoot"><span>${esc(st.description || st.role)}</span></div>
          </div>
        </div>
        <aside class="insp"></aside>
      </div>` : '<p class="empty">No tiles yet — tick “Homepage” on a few shots in your projects.</p>'}
    </div>`);
  wrap.append(el);
  el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { S.homeView = b.dataset.view; render(); }));
  $('[data-shuffle]', el).onclick = () => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } update(); };
  const makeOwn = () => { S.site.homePhone = home.map((t) => ({ p: t.p, m: t.m, ...(t.r ? { r: t.r } : {}) })); S.homeSel = null; render(); toast('The phone now has its own order and sizes.'); };
  const ownBtn = $('[data-own]', el); if (ownBtn) ownBtn.onclick = makeOwn;
  const unown = $('[data-unown]', el);
  if (unown) unown.onclick = () => { if (!confirm('Drop the phone layout? Phones will follow the desktop order again, with automatic sizes.')) return; delete S.site.homePhone; S.homeSel = null; render(); };
  if (!home.length) return;

  const screen = $('.screen', el), hw = $('.hw', el), insp = $('.insp', el), fold = $('.fold', el), sbar = $('.sbar', el), sfoot = $('.sfoot', el);
  if (!list.includes(S.homeSel)) S.homeSel = null;

  // one tile element per homepage entry, reused across layouts so moves can animate
  const tiles = new Map();
  const tileFor = (t) => {
    if (tiles.has(t)) return tiles.get(t);
    const p = S.site.projects.find((x) => x.slug === t.p);
    const m = p.media.find((x) => x.id === t.m);
    const node = h(`<div class="ht" tabindex="0">
        <img src="${esc(mediaUrl(m.type === 'video' ? m.poster : m.src))}" alt="" draggable="false">
        <span class="tt"></span></div>`);
    const c = {
      el: node, t, p, m,
      get ratio() { return +t.r || m.ratio || 16 / 9; },
      get size() { return sized ? t.s || (phone ? '' : 'm') : ''; },
      get br() { return sized && !!t.br; },
    };
    dragable(c);
    tiles.set(t, c);
    return c;
  };

  let k = 1, vp;
  const lay = () => {
    vp = phone ? { vw: 390, vh: 844 } : { vw: Math.max(1024, innerWidth), vh: Math.max(560, innerHeight) };
    const seam = phone ? 2 : 3;
    k = screen.clientWidth / vp.vw;
    const cells = list.map(tileFor);
    cells.forEach((c, i) => {
      c.el.classList.toggle('sel', c.t === S.homeSel);
      $('.tt', c.el).textContent = `${i + 1}  ${c.p.title}`;
    });
    hw.style.padding = hw.style.gap = `${seam * k}px`;
    renderRows(hw, packRows(cells, { W: vp.vw - seam * 2, seam, ...vp }), k);
    // the header, footer and the fold, scaled like the page
    const pad = (phone ? 16 : 32) * k;
    sbar.style.cssText = `padding:${(phone ? 16 : 22) * k}px ${pad}px;font-size:${(phone ? 14 : 15) * k}px`;
    sfoot.style.cssText = `padding:${72 * k}px ${pad}px ${40 * k}px;font-size:${Math.min(54, Math.max(26, vp.vw * 0.034)) * k}px`;
    fold.style.top = `${vp.vh * k}px`;
    fold.hidden = hw.offsetHeight < vp.vh * k;
    $('[data-scale]', el).textContent = `Screen ${vp.vw} × ${vp.vh} shown at ${Math.round(k * 100)}%`;
  };

  // animate tiles from where they were to where they land
  const flip = (fn) => {
    const before = new Map([...tiles.values()].map((c) => [c.el, c.el.getBoundingClientRect()]));
    fn();
    for (const c of tiles.values()) {
      const a = before.get(c.el), b = c.el.getBoundingClientRect();
      if (!a || !b.width || c.el.classList.contains('lifted')) continue;
      const dx = a.left - b.left, dy = a.top - b.top, sx = a.width / b.width, sy = a.height / b.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < .01 && Math.abs(sy - 1) < .01) continue;
      c.el.animate([{ transformOrigin: '0 0', transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})` }, { transformOrigin: '0 0', transform: 'none' }],
        { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
  };
  const update = () => { flip(lay); inspector(); status(); };
  const moveTo = (t, to) => {
    const from = list.indexOf(t);
    to = Math.max(0, Math.min(list.length - 1, to));
    if (from === to) return;
    list.splice(from, 1); list.splice(to, 0, t);
    update();
  };

  // drag with the mouse or a finger; the other tiles make room as you go
  function dragable(c) {
    const node = c.el;
    node.onpointerdown = (e) => {
      if (e.button !== 0) return;
      if (!editable) { S.homeSel = c.t; lay(); inspector(); return; }
      const r0 = node.getBoundingClientRect();
      const off = { x: e.clientX - r0.left, y: e.clientY - r0.top };
      let ghost = null, last = '';
      node.setPointerCapture(e.pointerId);
      const onMove = (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 6) return;
          const r = node.getBoundingClientRect();
          const w = Math.min(r.width, 260), hgt = w * r.height / r.width;
          off.x *= w / r.width; off.y *= w / r.width;
          ghost = node.cloneNode(true);
          ghost.className = 'ht ghost';
          ghost.style.cssText = `width:${w}px;height:${hgt}px`;
          document.body.append(ghost);
          node.classList.add('lifted');
          document.body.classList.add('dragging');
        }
        ghost.style.transform = `translate(${ev.clientX - off.x}px, ${ev.clientY - off.y}px) rotate(-1.5deg)`;
        if (ev.clientY < 70) scrollBy(0, -14); else if (ev.clientY > innerHeight - 70) scrollBy(0, 14);
        const over = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x.classList?.contains('ht') && !x.classList.contains('ghost'));
        if (!over || over === node) return;
        const target = [...tiles.values()].find((x) => x.el === over);
        const rr = over.getBoundingClientRect();
        const after = ev.clientX > rr.left + rr.width / 2;
        const key = `${list.indexOf(target.t)}${after}`;
        if (key === last) return;
        last = key;
        let to = list.indexOf(target.t) + (after ? 1 : 0);
        if (list.indexOf(c.t) < to) to -= 1;
        moveTo(c.t, to);
      };
      const onUp = () => {
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', onUp);
        node.removeEventListener('pointercancel', onUp);
        if (ghost) {
          const g = ghost.getBoundingClientRect();
          node.classList.remove('lifted');
          document.body.classList.remove('dragging');
          const b = node.getBoundingClientRect();
          node.animate([{ transformOrigin: '0 0', transform: `translate(${g.left - b.left}px,${g.top - b.top}px) scale(${g.width / b.width})` }, { transformOrigin: '0 0', transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
          ghost.remove();
        }
        S.homeSel = c.t;
        lay(); inspector();
      };
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', onUp);
      node.addEventListener('pointercancel', onUp);
    };
    node.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.homeSel = c.t; lay(); inspector(); }
    };
  }

  function inspector() {
    const t = S.homeSel;
    if (!editable) {
      insp.innerHTML = `<p style="margin:0">On phones the homepage follows the desktop order, with sizes picked automatically.</p>
        <p class="hint">Make a separate phone layout to choose a different order, sizes and shots for phones. The desktop stays as it is.</p>
        <p><button class="btn primary" data-own2>Make a separate phone layout</button></p>`;
      $('[data-own2]', insp).onclick = makeOwn;
      return;
    }
    const hiddenOnPhone = phone ? home.filter((x) => !list.some((y) => y.p === x.p && y.m === x.m)) : [];
    const tray = hiddenOnPhone.length ? `<h3>Not shown on phones</h3><div class="tray">${hiddenOnPhone.map((x, n) => {
      const p = S.site.projects.find((q) => q.slug === x.p), m = p.media.find((q) => q.id === x.m);
      return `<button data-addph="${n}" title="Show “${esc(p.title)}” on phones"><img src="${esc(mediaUrl(m.type === 'video' ? m.poster : m.src))}" alt=""><span>+</span></button>`;
    }).join('')}</div>` : '';
    const bindTray = () => insp.querySelectorAll('[data-addph]').forEach((b) => (b.onclick = () => {
      const x = hiddenOnPhone[+b.dataset.addph];
      const n = { p: x.p, m: x.m, ...(x.r ? { r: x.r } : {}) };
      list.push(n); S.homeSel = n; update();
    }));
    if (!t) {
      insp.innerHTML = `<p class="hint" style="margin:0">Click a tile to change its size and shape.</p>
        <p class="hint">Drag tiles to put them in order — the others make room as you move.</p>
        <p class="hint">${phone
          ? 'On phones a size is a share of the screen width: ⅓, ½ or Full. Shots you hide here stay on the desktop.'
          : 'Sizes change how tall a row is, so neighbours adapt too. <b>Full</b> gives a shot the whole width.'}</p>${tray}`;
      bindTray();
      return;
    }
    const c = tiles.get(t), i = list.indexOf(t);
    insp.innerHTML = `
      <div class="ithumb" style="aspect-ratio:${c.ratio}"><img src="${esc(mediaUrl(c.m.type === 'video' ? c.m.poster : c.m.src))}" alt=""></div>
      <p class="ititle"><b>${esc(c.p.title)}</b><span>${i + 1} of ${list.length}${c.m.type === 'video' ? ' · clip' : ' · still'}</span></p>
      <h3>${phone ? 'Size on phones' : 'Size'}</h3>
      <div class="seg full">${(phone ? PHONE_SIZES : Object.entries(SIZES)).map(([key, l]) => `<button data-s="${key}" aria-pressed="${(t.s || (phone ? '' : 'm')) === key}">${l}</button>`).join('')}</div>
      <h3>Shape on the homepage</h3>
      <div class="shapes">${SHAPES.map(([key, l]) => `<button data-r="${key}" aria-pressed="${(t.r || '') === key}"><i style="aspect-ratio:${key || c.m.ratio || 1.78}"></i>${l}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" data-br ${t.br ? 'checked' : ''}> Start a new row with this shot</label>
      <h3>Position</h3>
      <div class="seg full"><button data-mv="first" title="Move to the start">First</button><button data-mv="-1" title="Earlier (← key)">←</button><button data-mv="1" title="Later (→ key)">→</button><button data-mv="last" title="Move to the end">Last</button></div>
      <p style="margin-top:22px;display:flex;justify-content:space-between">
        <button class="btn quiet" data-desel>Done</button>
        <button class="btn quiet danger" data-rm>${phone ? 'Hide on phones' : 'Remove from homepage'}</button></p>${tray}`;
    bindTray();
    insp.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { if (b.dataset.s === (phone ? '' : 'm')) delete t.s; else t.s = b.dataset.s; update(); }));
    insp.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { if (!b.dataset.r) delete t.r; else t.r = b.dataset.r; update(); }));
    $('[data-br]', insp).onchange = (e) => { if (e.target.checked) t.br = true; else delete t.br; update(); };
    insp.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => {
      const v = b.dataset.mv;
      moveTo(t, v === 'first' ? 0 : v === 'last' ? list.length - 1 : list.indexOf(t) + +v);
    }));
    $('[data-desel]', insp).onclick = () => { S.homeSel = null; lay(); inspector(); };
    $('[data-rm]', insp).onclick = () => {
      list.splice(list.indexOf(t), 1); tiles.get(t)?.el.remove(); tiles.delete(t); S.homeSel = null;
      if (!phone) syncPhone();
      if (!list.length) render(); else update();
    };
  }

  lay();
  inspector();
  S.homeKeys = (e) => {
    if (!S.homeSel || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (editable && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); moveTo(S.homeSel, list.indexOf(S.homeSel) + (e.key === 'ArrowLeft' ? -1 : 1)); }
    if (e.key === 'Escape') { S.homeSel = null; lay(); inspector(); }
  };
  addEventListener('keydown', S.homeKeys);
  const ro = new ResizeObserver(() => requestAnimationFrame(lay));
  ro.observe(screen);
  S.homeWall = { stop: () => { ro.disconnect(); removeEventListener('keydown', S.homeKeys); } };
}

function viewSettings(wrap) {
  const s = S.site.settings;
  const el = h(`
    <div class="form" style="max-width:680px">
      <h2>Settings</h2>
      <div class="row">
        <label><span>Name</span><input data-k="name"></label>
        <label><span>Role</span><input data-k="role"></label>
      </div>
      <div class="row">
        <label><span>Email</span><input data-k="email" type="email"></label>
        <label><span>Instagram (handle or link, optional)</span><input data-k="instagram" placeholder="@yourname"></label>
      </div>
      <label><span>Showreel — Vimeo or YouTube link (optional)</span><input data-k="showreel" placeholder="https://vimeo.com/…"></label>
      <h3>Contact page</h3>
      <div class="portraitbox">
        <div class="pthumb">${s.portrait?.src ? `<img src="${esc(mediaUrl(s.portrait.src))}" alt="">` : '<span>No photo</span>'}</div>
        <div class="form" style="gap:10px">
          <p style="margin:0"><button class="btn" data-pick>${s.portrait?.src ? 'Replace photo' : 'Add your photo'}</button>
            ${s.portrait?.src ? '<button class="btn quiet danger" data-norm>Remove</button>' : ''}</p>
          <p class="hint" style="margin:0">A portrait works best (vertical or square). JPEG, PNG or iPhone HEIC — it’s resized automatically.</p>
          <label><span>Photo credit (optional)</span><input data-k="portraitCredit" placeholder="Photographer’s name"></label>
          <input type="file" accept="image/*,.heic,.heif" data-file hidden>
        </div>
      </div>
      <label><span>Bio (empty line = new paragraph)</span><textarea data-k="bio" rows="6"></textarea></label>
      <label><span>Description for Google and link previews</span><input data-k="description"></label>
      <div class="row">
        <label><span>Site address (after the domain is connected)</span><input data-k="siteUrl" placeholder="https://yourname.com"></label>
        <label><span>Look</span><select data-k="theme"><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label><span>Typeface</span><select data-k="font">${Object.entries(FONTS).map(([k, f]) => `<option value="${k}">${esc(f.label)}</option>`).join('')}</select></label>
      </div>
      <label style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" data-hidden style="width:auto;margin-top:3px"${s.hidden !== false ? ' checked' : ''}>
        <span style="color:var(--fg);font-size:14px">Hide from Google and other search engines<br><small class="hint">Keep this on until the site is ready. The site still opens for anyone who has the link.</small></span></label>
      <h3>Connection</h3>
      <p class="hint">${S.offline ? 'Preview mode — not connected to GitHub.' : `Connected to <b>${esc(S.cfg.owner)}/${esc(S.cfg.repo)}</b> (${esc(S.cfg.branch)}).`}</p>
      <p><button class="btn" data-out>${S.offline ? 'Connect to GitHub' : 'Sign out on this device'}</button></p>
    </div>`);
  bind(el, s);
  $('[data-hidden]', el).onchange = (e) => { s.hidden = e.target.checked; status(); };
  const file = $('[data-file]', el);
  $('[data-pick]', el).onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0];
    if (!f || !isImage(f)) return;
    status('Processing…');
    try {
      const img = await processImage(f);
      if (s.portrait?.src) forgetMedia(s.portrait);
      s.portrait = { src: addFile(`media/about/${uid()}-portrait.${img.ext}`, img.blob), ratio: +img.ratio.toFixed(4) };
    } catch (e) { toast(e.message, 6000); }
    render();
  };
  const norm = $('[data-norm]', el);
  if (norm) norm.onclick = () => { forgetMedia(s.portrait); delete s.portrait; render(); };
  $('[data-out]', el).onclick = () => {
    if (dirty() && !confirm('You have unpublished changes. Leave anyway?')) return;
    delete S.cfg.token; save(CFG_KEY, S.cfg); location.reload();
  };
  wrap.append(el);
}

/* ---------- start ---------- */
async function localSite() {
  const r = await fetch('../content/site.json', { cache: 'no-cache' });
  return r.json();
}

function start(site, offline) {
  S.site = site;
  site.home ||= []; site.projects ||= [];
  S.offline = offline;
  S.baseJson = JSON.stringify(site);
  S.baseSlugs = site.projects.map((p) => p.slug);
  render();
}

async function login(errorMsg) {
  let defaults = {};
  try { defaults = (await localSite()).settings?.repo || {}; } catch {}
  const c = { owner: S.cfg.owner || defaults.owner || '', repo: S.cfg.repo || defaults.name || '', branch: S.cfg.branch || defaults.branch || 'main' };
  const el = h(`
    <div class="login">
      <h1>Studio</h1>
      <p class="hint">Edit projects, shots and texts of your site. Changes go live when you press Publish.</p>
      <ol class="hint">
        <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → Fine-grained token</a>.</li>
        <li>Repository access: <b>Only select repositories</b> → your site repository.</li>
        <li>Permissions → Repository → <b>Contents: Read and write</b>. Generate and paste below.</li>
      </ol>
      <form class="form">
        <div class="row">
          <label><span>GitHub user</span><input name="owner" value="${esc(c.owner)}" required></label>
          <label><span>Repository</span><input name="repo" value="${esc(c.repo)}" required></label>
        </div>
        <label><span>Access token</span><input name="token" type="password" autocomplete="off" required></label>
        <p class="hint">The token stays in this browser only. Use “Sign out” in Settings on shared computers.</p>
        ${errorMsg ? `<p class="status warn">${esc(errorMsg)}</p>` : ''}
        <p style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary">Connect</button><button type="button" class="btn quiet" data-preview>Look around without connecting</button></p>
      </form>
    </div>`);
  $('form', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    S.cfg = { owner: f.get('owner').trim(), repo: f.get('repo').trim(), branch: c.branch, token: f.get('token').trim() };
    try { const site = await connect(); save(CFG_KEY, S.cfg); start(site, false); }
    catch (err) { S.cfg.token = ''; login(err.message); }
  };
  $('[data-preview]', el).onclick = async () => start(await localSite(), true);
  $('#app').replaceChildren(el);
}

addEventListener('beforeunload', (e) => { if (S.site && !S.offline && dirty()) { e.preventDefault(); e.returnValue = ''; } });

(async () => {
  if (S.cfg.token) {
    try { start(await connect(), false); return; }
    catch (e) { return login(e.message); }
  }
  login();
})();
