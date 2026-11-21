// Wall layouts, shared by the public site (assets/site.js) and the Studio preview (admin/admin.js),
// so what you arrange in Studio is exactly what visitors see.
//
// Homepage — packGrid: free masonry, see below.
// Project pages — packRows: plain justified rows, no settings.
//
// Each item: { ratio, w (size in % of the page), size (older saved sizes), br (start below) }

// crop a tile to a fixed shape on the homepage ('' = the shot's own shape)
export const SHAPES = [['', 'Original'], ['2.39', '2.39 : 1'], ['1.78', '16 : 9'], ['1.33', '4 : 3'], ['1', '1 : 1'], ['0.8', '4 : 5']];

// Crop of a homepage tile: a rectangle [x, y, w, h] in fractions of the whole shot.
// Saved as `crop`; older tiles may carry a preset shape `r` with a framing point fx/fy (0–100).
export function cropRect(t, mr) {
  if (Array.isArray(t.crop) && t.crop.length === 4) {
    const [x, y, w, h] = t.crop.map(Number);
    if (w > 0 && h > 0) return [x, y, w, h];
  }
  const r = +t.r;
  if (!r || !mr) return null;
  const vw = r < mr ? r / mr : 1, vh = r > mr ? mr / r : 1;
  return [(1 - vw) * (t.fx ?? 50) / 100, (1 - vh) * (t.fy ?? 50) / 100, vw, vh];
}
// tile proportions after cropping
export const croppedRatio = (rect, mr) => (rect ? (mr * rect[2]) / rect[3] : mr);
// show only the cropped part of the shot inside its tile (no distortion: the shot keeps its ratio)
export function applyCrop(media, rect) {
  const st = media.style;
  if (!rect) { st.inset = ''; st.left = st.top = st.width = st.height = st.objectFit = ''; return; }
  const [x, y, w, h] = rect;
  st.inset = 'auto';
  st.left = `${(-x / w) * 100}%`;
  st.top = `${(-y / h) * 100}%`;
  st.width = `${100 / w}%`;
  st.height = `${100 / h}%`;
  st.objectFit = 'fill';
  st.objectPosition = '';
}

export const PHONE = 860; // widths at or below this use the phone layout

// homepage: free masonry.
// A tile is never cropped unless you pick a shape for it: it keeps the proportions of its shot.
// Its SIZE is how wide it is, in % of the page (any value; presets ¼ … Full). Tiles drop, in order,
// into the highest spot where they fit — next to a neighbour or against the page edge — so rows
// break naturally: a big shot can reach lower than its neighbour and the next shots tuck in around it.
// Gaps between neighbours are always one seam wide. "Start below" begins below everything above.
export const PRESETS = [['', 'Auto'], [25, '¼'], [33.33, '⅓'], [50, '½'], [66.67, '⅔'], [100, 'Full']];
const LEGACY_PCT = { q: 25, t: 33.33, h: 50, tt: 66.67, tq: 75, f: 100, xs: 25, s: 33.33, l: 100, xl: 100 };
const PHONE_PCT = { s: 33.33, m: 50, l: 100 };
// size of a tile in % of the page width; '' = automatic by shape
export function sizePct(c, phone) {
  if (c.w) return Math.min(100, Math.max(8, +c.w));
  if (phone && PHONE_PCT[c.size]) return PHONE_PCT[c.size];
  if (!phone && LEGACY_PCT[c.size]) return LEGACY_PCT[c.size];
  if (phone) return c.ratio < 1 ? 50 : 100;
  return c.ratio < 0.9 ? 25 : c.ratio < 1.3 ? 33.33 : 50;
}

export function packGrid(items, { W, seam, vw, vh }) {
  const phone = vw <= PHONE;
  const cap = vh * (phone ? 0.8 : 0.92);   // a very tall shot is made narrower, never cropped
  const boxes = [];
  const floorAt = (x, w) => {
    let y = 0;
    for (const b of boxes) if (b.x < x + w + seam - 0.5 && b.x + b.w + seam > x + 0.5) y = Math.max(y, b.y + b.h + seam);
    return y;
  };
  let below = 0; // "start below": nothing may go above this line any more
  items.forEach((c) => {
    let w = (sizePct(c, phone) / 100) * (W + seam) - seam;
    let h = w / c.ratio;
    if (h > cap) { h = cap; w = h * c.ratio; }
    w = Math.min(w, W);
    if (c.br) below = boxes.reduce((m, b) => Math.max(m, b.y + b.h + seam), 0);
    // candidate spots: page edges, and flush against every placed tile
    const xs = new Set([0, W - w]);
    for (const b of boxes) { xs.add(b.x + b.w + seam); xs.add(b.x - seam - w); }
    let best = null;
    for (let x of xs) {
      if (x < -0.5 || x + w > W + 0.5) continue;
      x = Math.max(0, Math.min(W - w, x));
      const y = Math.max(below, floorAt(x, w));
      const score = [Math.round(y), Math.round(x)]; // highest spot first, then leftmost
      if (!best || score[0] < best.s[0] || (score[0] === best.s[0] && score[1] < best.s[1])) best = { x, y, s: score };
    }
    // nearly touching the page edge: grow a touch (in proportion, nothing cropped) so the edge is
    // straight and every gap stays one seam wide
    let { x, y } = best;
    const room = W - (x + w);
    if (room > 0.5 && room < W * 0.06 && floorAt(x + w + seam, room - seam) <= y + 0.5) { w += room; h = w / c.ratio; }
    boxes.push({ item: c, x, y, w, h });
  });
  const height = boxes.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  return { height, boxes };
}

// Places a packGrid result. pad = gap around the wall; k scales everything (Studio preview).
export function renderGrid(el, grid, seam, k = 1) {
  el.style.position = 'relative';
  el.style.display = 'block';
  el.style.padding = '0';
  el.style.height = `${(grid.height + seam * 2) * k}px`;
  const keep = new Set(grid.boxes.map((b) => b.item.el));
  [...el.children].forEach((n) => { if (!keep.has(n)) n.remove(); });
  for (const b of grid.boxes) {
    const s = b.item.el.style;
    s.position = 'absolute';
    s.flex = '';
    s.left = `${(b.x + seam) * k}px`;
    s.top = `${(b.y + seam) * k}px`;
    s.width = `${b.w * k}px`;
    s.height = `${b.h * k}px`;
    if (b.item.el.parentNode !== el) el.append(b.item.el);
  }
}

// W: inner width, seam: gap px, vw/vh: viewport size (decides phone vs desktop and caps height)
export function packRows(items, { W, seam, vw, vh }) {
  const phone = vw <= PHONE;
  const base = phone ? W * 0.75 : Math.max(240, Math.min(vh * 0.46, W * 0.3));
  const cap = vh * (phone ? 0.8 : 0.92);
  const fits = (row) => (W - seam * (row.length - 1)) / row.reduce((a, c) => a + c.ratio, 0);
  const target = () => base;
  const off = (h, t) => Math.abs(Math.log(Math.min(h, cap) / t));

  const rows = [];
  // a short leftover row is folded into the previous one (or stretched) so the wall stays closed
  const flush = (row) => {
    if (!row.length) return;
    const prev = rows[rows.length - 1];
    if (fits(row) <= target(row) * 1.6 || row[0].br || !prev || prev.solo) rows.push(row);
    else if (fits([...prev, ...row]) >= target(prev) * 0.55) rows[rows.length - 1] = [...prev, ...row];
    else rows.push(row);
  };

  let row = [];
  for (const c of items) {
    if (c.br && row.length) { flush(row); row = []; }
    const next = [...row, c];
    if (fits(next) <= target(next)) {
      // close the row at whichever count lands nearest the wanted height
      if (row.length && off(fits(row), target(row)) < off(fits(next), target(next))) { rows.push(row); row = [c]; }
      else { rows.push(next); row = []; }
    } else row = next;
  }
  flush(row);

  return rows.map((r) => {
    const natural = fits(r);
    const height = Math.min(natural, cap);
    return { items: r, height, stretch: height === natural };
  });
}

// Puts packed rows into a container. k scales everything (Studio shows a smaller copy of the page).
export function renderRows(el, rows, k = 1) {
  el.replaceChildren();
  for (const r of rows) {
    const div = document.createElement('div');
    div.className = 'row';
    if (!r.stretch && !r.full) div.style.justifyContent = 'center';
    div.style.height = `${r.height * k}px`;
    r.items.forEach((c, i) => {
      if (r.widths) { c.el.style.flex = 'none'; c.el.style.width = `${r.widths[i] * k}px`; }
      else {
        c.el.style.flex = r.stretch ? `${c.ratio} 1 0` : 'none';
        c.el.style.width = r.stretch ? '' : `${r.height * c.ratio * k}px`;
      }
      div.append(c.el);
    });
    el.append(div);
  }
}

// Lays rows of { el, ratio, size, br } into a container and keeps them fitted on resize.
// cells can also be a function (viewportWidth) => cells, e.g. a separate list for phones.
export function mountWall(el, cells, { grid = false } = {}) {
  let lastKey = '', lastList = null;
  const layout = () => {
    const seam = parseFloat(getComputedStyle(el).rowGap) || 3;
    if (grid) el.style.padding = '0';
    const pad = grid ? seam : parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const W = el.clientWidth - pad * 2;
    const vp = { vw: innerWidth, vh: innerHeight };
    const list = typeof cells === 'function' ? cells(vp.vw) : cells;
    const key = `${Math.round(W)}x${Math.round(vp.vh / 40)}x${list.length}${list === lastList}`; // ignore tiny height jitter (mobile URL bar)
    if ((key === lastKey && list === lastList) || W <= 0) return;
    lastKey = key; lastList = list;
    if (grid) renderGrid(el, packGrid(list, { W, seam, ...vp }), seam);
    else renderRows(el, packRows(list, { W, seam, ...vp }));
  };
  layout();
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { requestAnimationFrame(layout); setTimeout(layout, 60); }) : null;
  if (ro) ro.observe(el); else addEventListener('resize', layout);
  return { layout: () => { lastKey = ''; layout(); }, stop: () => ro?.disconnect() };
}
