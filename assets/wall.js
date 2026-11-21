// Wall layouts, shared by the public site (assets/site.js) and the Studio preview (admin/admin.js),
// so what you arrange in Studio is exactly what visitors see.
//
// Homepage — packGrid: sections of columns (width you set × shape of the shot), see below.
// Project pages — packRows: plain justified rows, no settings.
//
// Each item: { ratio, size, br }   br: true = this tile starts a new row

// desktop widths ('' = automatic, by the shot's shape)
export const SIZES = [['', 'Auto'], ['q', '¼'], ['t', '⅓'], ['h', '½'], ['tt', '⅔'], ['tq', '¾'], ['f', 'Full']];
const DESK = { q: 1 / 4, t: 1 / 3, h: 1 / 2, tt: 2 / 3, tq: 3 / 4, f: 1 };
// sizes saved by earlier versions of Studio
const LEGACY = { xs: 'q', s: 't', m: '', l: 'f', xl: 'f' };
export const deskSize = (s) => (s in DESK ? s : LEGACY[s] ?? '');
// crop a tile to a fixed shape on the homepage ('' = the shot's own shape)
export const SHAPES = [['', 'Original'], ['2.39', '2.39 : 1'], ['1.78', '16 : 9'], ['1.33', '4 : 3'], ['1', '1 : 1'], ['0.8', '4 : 5']];

// phone widths (no size = automatic: landscape shots full width, vertical ones two in a row)
export const PHONE_SIZES = [['', 'Auto'], ['s', '⅓'], ['m', '½'], ['l', 'Full']];
const SHARE = { s: 1 / 3, m: 1 / 2, l: 1 };

export const PHONE = 860; // widths at or below this use the phone layout

// homepage: sections of columns.
// Every tile has the width you set and the exact shape of its shot (or the crop you chose).
// Tiles build a SECTION of side-by-side columns: a tile whose width isn't in the section yet opens
// a new column next to the others; a tile whose width already has a column drops into the shortest
// such column — so a big square can sit beside a stack of panoramas, and panoramas that don't fit
// on the right continue under the square. "Auto" tiles go into whichever column is shortest.
// A section closes when a tile can't join it (a width it has no column for and no room left, a Full
// tile, or "start below"). On closing, the columns meet halfway in height (shots slightly trimmed
// top/bottom, spread over the column) so the section ends in one straight line, and a section that
// doesn't reach across the whole width is widened to fill it. Columns are solid strips, so there are never empty holes.
export function packGrid(items, { W, seam, vw, vh }) {
  const phone = vw <= PHONE;
  const explicit = (c) => (phone ? SHARE[c.size] : DESK[deskSize(c.size)]);
  const auto = (c) => (phone ? (c.ratio < 1 ? 1 / 2 : 1) : c.ratio < 0.9 ? 1 / 4 : c.ratio < 1.3 ? 1 / 3 : 1 / 2);
  const cap = vh * (phone ? 0.8 : 0.92);
  const unit = W + seam;
  const out = [];
  let top = 0;      // y where the current section starts
  let cols = [];    // { share, tiles: [{ c, h }] }
  const used = () => cols.reduce((a, k) => a + k.share, 0);
  const colH = (k) => k.tiles.reduce((a, t) => a + t.h + seam, 0);

  const close = () => {
    if (!cols.length) return;
    // fill the width: scale the columns up if the section is short
    const f = 1 / used();
    if (f > 1.001) for (const k of cols) {
      k.share *= f;
      const w = k.share * unit - seam;
      for (const t of k.tiles) t.h = Math.min(w / t.c.ratio, cap);
    }
    // one straight bottom edge, met halfway: short columns grow a little, tall ones give a little,
    // spread evenly over every shot in the column, so no single frame is cropped hard
    const hs = cols.map(colH);
    const bottom = cols.length > 1 ? Math.sqrt(Math.min(...hs) * Math.max(...hs)) : hs[0];
    let x = 0;
    for (const k of cols) {
      const gaps = seam * k.tiles.length, have = colH(k) - gaps, f = (bottom - gaps) / have;
      for (const t of k.tiles) t.h *= f;
      let y = top;
      const w = k.share * unit - seam;
      for (const t of k.tiles) { out.push({ item: t.c, x, y, w, h: t.h }); y += t.h + seam; }
      x += k.share * unit;
    }
    top += bottom;
    cols = [];
  };

  for (const c of items) {
    const want = explicit(c);
    const share = want || auto(c);
    if (c.br || share >= 0.999) close();
    let col = null;
    // stacking under a column only makes sense while there is a gap to fill: if the shot would
    // stick out below the tallest column by more than half its own height, start a new section
    const fitsUnder = (k) => {
      const h = Math.min((k.share * unit - seam) / c.ratio, cap);
      return colH(k) + h - Math.max(...cols.map(colH)) <= h * 0.5;
    };
    if (!want && cols.length && used() >= 0.999) {
      const k = cols.reduce((a, q) => (colH(q) < colH(a) - 0.5 ? q : a)); // auto: shortest column
      if (fitsUnder(k)) col = k; else close();
    } else if (cols.length && used() + share > 1.001) {
      const same = cols.filter((k) => Math.abs(k.share - share) < 0.01);
      const k = same.length ? same.reduce((a, q) => (colH(q) < colH(a) - 0.5 ? q : a)) : null;
      if (k && fitsUnder(k)) col = k; else close();
    }
    if (!col) { col = { share, tiles: [] }; cols.push(col); }
    const w = col.share * unit - seam;
    col.tiles.push({ c, h: Math.min(w / c.ratio, cap) });
    if (share >= 0.999) close();
  }
  close();
  return { height: Math.max(0, top - seam), boxes: out };
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
