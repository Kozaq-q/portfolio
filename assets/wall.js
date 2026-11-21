// Wall layouts, shared by the public site (assets/site.js) and the Studio preview (admin/admin.js),
// so what you arrange in Studio is exactly what visitors see.
//
// Homepage — packGrid: every tile has a WIDTH (a share of the screen width). Tiles fill rows left
// to right; a row's height comes from its widest tile, which always keeps its full frame (the others
// are trimmed top/bottom to match). Changing a tile's width changes that tile, immediately.
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

// homepage grid
export function packGrid(items, { W, seam, vw, vh }) {
  const phone = vw <= PHONE;
  const explicit = (c) => (phone ? SHARE[c.size] : DESK[deskSize(c.size)]);
  const auto = (c) => (phone ? (c.ratio < 1 ? 1 / 2 : 1) : c.ratio < 0.9 ? 1 / 4 : c.ratio < 1.3 ? 1 / 3 : 1 / 2);
  const cap = vh * (phone ? 0.8 : 0.92);

  const rows = [];
  let row = [], sum = 0;
  const close = () => { if (row.length) rows.push(row); row = []; sum = 0; };
  for (const c of items) {
    const fixed = explicit(c);
    const sh = fixed || auto(c);
    if (row.length && (c.br || sum + sh > 1.001)) close();
    row.push({ c, sh, fixed: !!fixed });
    sum += sh;
    if (sum >= 0.999) close();
  }
  close();

  const unit = W + seam; // one full row, counting one trailing seam, so columns line up between rows
  return rows.map((r) => {
    let total = r.reduce((a, x) => a + x.sh, 0);
    // a short row: automatic tiles grow to close it; tiles with a set width keep it (row is centred)
    const autoSum = r.reduce((a, x) => a + (x.fixed ? 0 : x.sh), 0);
    if (total < 0.999 && autoSum > 0) {
      const k = (autoSum + 1 - total) / autoSum;
      r.forEach((x) => { if (!x.fixed) x.sh *= k; });
      total = 1;
    }
    let widths = r.map((x) => x.sh * unit - seam);
    // the widest tile sets the height and keeps its whole frame
    let a = 0;
    widths.forEach((w, i) => { if (w > widths[a] + 0.5) a = i; });
    const natural = widths[a] / r[a].c.ratio;
    const height = Math.min(natural, cap);
    if (height < natural) widths = widths.map((w) => w * height / natural); // very tall: shrink the row, keep the frame
    return { items: r.map((x) => x.c), height, widths, full: total >= 0.999 && height === natural };
  });
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
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const W = el.clientWidth - pad * 2;
    const vp = { vw: innerWidth, vh: innerHeight };
    const list = typeof cells === 'function' ? cells(vp.vw) : cells;
    const key = `${Math.round(W)}x${Math.round(vp.vh / 40)}x${list.length}${list === lastList}`; // ignore tiny height jitter (mobile URL bar)
    if ((key === lastKey && list === lastList) || W <= 0) return;
    lastKey = key; lastList = list;
    renderRows(el, (grid ? packGrid : packRows)(list, { W, seam, ...vp }));
  };
  layout();
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { requestAnimationFrame(layout); setTimeout(layout, 60); }) : null;
  if (ro) ro.observe(el); else addEventListener('resize', layout);
  return { layout: () => { lastKey = ''; layout(); }, stop: () => ro?.disconnect() };
}
