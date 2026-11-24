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

// homepage, free canvas (optional): every tile stands where you put it.
// pos = [x, y] as fractions of the page width (one unit = width + one seam), so the canvas scales
// with the screen. When tiles would overlap, the lower one is pushed down — never pulled up — so
// gaps stay only where you leave them. Phones don't get the canvas: they flow the tiles in
// reading order (top to bottom, left to right), or use their own phone layout.
export const REF = { W: 1434, seam: 3, vw: 1440, vh: 900 }; // the desktop the canvas is drawn on

export function packCanvas(items, { W, seam, vw, vh }, fixed = null) {
  if (vw <= PHONE) {
    const key = (c) => (c.pos ? c.pos[1] * 1e4 + c.pos[0] : Infinity);
    return packGrid([...items].sort((a, b) => key(a) - key(b)), { W, seam, vw, vh });
  }
  // always laid out on the reference desktop, then scaled to this screen: every screen (and the
  // phone mirror) gets exactly the same arrangement, only bigger or smaller
  const sc = W / REF.W;
  if (Math.abs(sc - 1) > 1e-6) {
    const g = packCanvas(items, { W: REF.W, seam: seam / sc, vw: REF.vw, vh: REF.vh }, fixed);
    return { height: g.height * sc, boxes: g.boxes.map((b) => Object.assign(b, { x: b.x * sc, y: b.y * sc, w: b.w * sc, h: b.h * sc })) };
  }
  const U = W + seam;
  const boxes = items.map((c) => {
    const w = Math.min(W, (sizePct(c, false) / 100) * U - seam);
    const h = w / c.ratio;
    const p = c.pos;
    return { item: c, w, h, x: p ? Math.min(W - w, Math.max(0, p[0] * U)) : null, y: p ? Math.max(0, p[1] * U) : null };
  });
  return compact(settle(boxes, fixed, seam, W), fixed, seam, W);
}

// Gravity, so the canvas stays tidy: every tile rises as high as it can (top to bottom, the one
// being dragged stays put) and never leaves a hole above it. A tile below a gap it fits into, at
// the same size, hops over into that gap. Tiles never get bigger, smaller or cropped.
export function compact(g, fixed, seam, W) {
  const TOL = 0.5;
  // bottoms that differ by a hair (photo proportions) count as one line: the tile below lies flush
  // on the higher one and covers those few pixels instead of leaving a thin stripe of background
  const VT = W * 0.005;
  const placed = [];
  const f = fixed && g.boxes.find((b) => b.item === fixed);
  if (f) placed.push(f);
  const clash = (x, y, b) => placed.filter((p) => p.x < x + b.w + seam - TOL && x < p.x + p.w + seam - TOL && p.y < y + b.h + seam - VT && y < p.y + p.h + seam - VT);
  const rise = (x, b) => {
    let y = 0;
    for (let n = 0; n < 400; n++) {
      const hit = clash(x, y, b);
      if (!hit.length) break;
      y = Math.max(...hit.map((p) => p.y + p.h + seam));
    }
    // rest on the highest of the bottoms just under it, when the others are only a hair lower
    const under = placed.filter((p) => p.x < x + b.w - TOL && x < p.x + p.w - TOL && Math.abs(p.y + p.h + seam - y) < VT);
    return under.length ? Math.min(...under.map((p) => p.y + p.h + seam)) : y;
  };
  for (const b of g.boxes.filter((q) => q !== f).sort((a, c) => a.y - c.y || a.x - c.x)) {
    let y = rise(b.x, b), x = b.x;
    // a gap elsewhere that it fits into: hop only when that is clearly higher (no fidgeting)
    const xs = new Set([0, W - b.w]);
    for (const p of placed) { xs.add(p.x); xs.add(p.x + p.w + seam); xs.add(p.x + p.w - b.w); xs.add(p.x - seam - b.w); }
    // a few pixels off an edge or a neighbour: line it up
    let near = null;
    for (const cx of xs) if (cx > -TOL && cx + b.w < W + TOL && Math.abs(cx - b.x) < W * 0.04 && (near == null || Math.abs(cx - b.x) < Math.abs(near - b.x))) near = cx;
    if (near != null) { const ny = rise(near, b); if (ny <= y + TOL) { x = near; y = ny; } }
    for (const cx of xs) {
      if (cx < -TOL || cx + b.w > W + TOL) continue;
      const cy = rise(cx, b);
      if (cy < y - Math.max(40, b.h * 0.3)) { y = cy; x = cx; }
    }
    b.x = x; b.y = y;
    placed.push(b);
  }
  g.height = g.boxes.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  return g;
}

// push overlapping tiles down (the fixed one — the tile being dragged — keeps its place)
export function settle(boxes, fixed, seam, W) {
  const TOL = 3; // ignore overlaps of a few pixels (rounding between screen sizes)
  const hits = (a, b) => a.x < b.x + b.w + seam - TOL && b.x < a.x + a.w + seam - TOL && a.y < b.y + b.h + seam - TOL && b.y < a.y + a.h + seam - TOL;
  const placed = [];
  const order = boxes.filter((b) => b.y != null).sort((a, b) => a.y - b.y || a.x - b.x);
  const f = fixed && order.find((b) => b.item === fixed);
  if (f) { order.splice(order.indexOf(f), 1); order.unshift(f); }
  for (const b of order) {
    for (let g = 0; g < 400; g++) {
      const hit = placed.filter((p) => hits(p, b));
      if (!hit.length) break;
      b.y = Math.max(...hit.map((p) => p.y + p.h + seam));
    }
    placed.push(b);
  }
  // tiles without a place yet (just added): a row below everything
  let y = placed.reduce((m, b) => Math.max(m, b.y + b.h + seam), 0), x = 0, rowH = 0;
  for (const b of boxes.filter((q) => q.y == null)) {
    if (x > 0 && x + b.w > W + 0.5) { x = 0; y += rowH + seam; rowH = 0; }
    b.x = x; b.y = y; x += b.w + seam; rowH = Math.max(rowH, b.h);
  }
  return { height: boxes.reduce((m, b) => Math.max(m, b.y + b.h), 0), boxes };
}

// Phones without their own layout: the desktop layout, scaled down to the phone's width —
// same places, same sizes relative to the page, only the seams stay a real seam wide.
export function packMirror(items, { W, seam }, canvas = false) {
  if (canvas) return packCanvas(items, { W, seam, vw: REF.vw, vh: REF.vh });
  const s = W / REF.W;
  const g = packGrid(items, { W: REF.W, seam: seam / s, vw: REF.vw, vh: REF.vh });
  return { height: g.height * s, boxes: g.boxes.map((b) => ({ ...b, x: b.x * s, y: b.y * s, w: b.w * s, h: b.h * s })) };
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
    // whole pixels, so neighbours meet exactly (no hairlines from half-pixel edges)
    const l = Math.round((b.x + seam) * k), t = Math.round((b.y + seam) * k);
    s.left = `${l}px`;
    s.top = `${t}px`;
    s.width = `${Math.round((b.x + b.w + seam) * k) - l}px`;
    s.height = `${Math.round((b.y + b.h + seam) * k) - t}px`;
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
export function mountWall(el, cells, { grid = false, canvas = false } = {}) {
  let lastKey = '', lastList = null;
  const layout = () => {
    const g = parseFloat(getComputedStyle(el).rowGap), seam = Number.isFinite(g) ? g : 3;
    if (grid) el.style.padding = '0';
    const pad = grid ? seam : parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const W = el.clientWidth - pad * 2;
    const vp = { vw: innerWidth, vh: innerHeight };
    const list = typeof cells === 'function' ? cells(vp.vw) : cells;
    const key = `${Math.round(W)}x${Math.round(vp.vh / 40)}x${list.length}${list === lastList}`; // ignore tiny height jitter (mobile URL bar)
    if ((key === lastKey && list === lastList) || W <= 0) return;
    lastKey = key; lastList = list;
    const pack = list.mirror && vp.vw <= PHONE ? (l, o) => packMirror(l, o, canvas) : canvas ? packCanvas : packGrid;
    if (grid) renderGrid(el, pack(list, { W, seam, ...vp }), seam);
    else renderRows(el, packRows(list, { W, seam, ...vp }));
  };
  layout();
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { requestAnimationFrame(layout); setTimeout(layout, 60); }) : null;
  if (ro) ro.observe(el); else addEventListener('resize', layout);
  return { layout: () => { lastKey = ''; layout(); }, stop: () => ro?.disconnect() };
}
