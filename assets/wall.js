// Wall layout: justified rows that fill the width exactly.
// Shared by the public site (assets/site.js) and the Studio preview (admin/admin.js),
// so what you arrange in Studio is exactly what visitors see.
//
// Each item: { ratio, size, br }
//   size: 'xs' | 's' | 'm' (default) | 'l' | 'xl' (a row of its own, full width)
//   br:   true = this tile starts a new row

export const SIZES = { xs: 'XS', s: 'S', m: 'M', l: 'L', xl: 'Full' };
// crop a tile to a fixed shape on the homepage ('' = the shot's own shape)
export const SHAPES = [['', 'Original'], ['2.39', '2.39 : 1'], ['1.78', '16 : 9'], ['1.33', '4 : 3'], ['1', '1 : 1'], ['0.8', '4 : 5']];
const FACTOR = { xs: 0.42, s: 0.66, m: 1, l: 1.5 };

// Phone: sizes are shares of the row width, so each step is clearly different.
// (no size = automatic: landscape shots full width, vertical ones two in a row)
export const PHONE_SIZES = [['', 'Auto'], ['s', '⅓'], ['m', '½'], ['l', 'Full']];
const SHARE = { s: 1 / 3, m: 1 / 2, l: 1 };

export const PHONE = 860; // widths at or below this use the phone layout

// W: inner width, seam: gap px, vw/vh: viewport size (decides phone vs desktop and caps height)
export function packRows(items, { W, seam, vw, vh }) {
  const phone = vw <= PHONE;
  if (phone) return packPhone(items, { W, seam, vh });
  const base = phone ? W * 0.75 : Math.max(240, Math.min(vh * 0.46, W * 0.3));
  const cap = vh * (phone ? 0.8 : 0.92);
  const fits = (row) => (W - seam * (row.length - 1)) / row.reduce((a, c) => a + c.ratio, 0);
  const target = (row) => {
    const f = row.map((c) => FACTOR[c.size] || 1);
    const hi = Math.max(...f), lo = Math.min(...f);
    return base * (hi > 1 ? hi : lo);
  };
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
    if (c.size === 'xl') {
      flush(row); row = [];
      const r = [c]; r.solo = true; rows.push(r);
      continue;
    }
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

function packPhone(items, { W, seam, vh }) {
  const fits = (row) => (W - seam * (row.length - 1)) / row.reduce((a, c) => a + c.ratio, 0);
  const share = (c) => SHARE[c.size] || (c.ratio < 1 ? 1 / 2 : 1);
  const rows = [];
  let row = [], sum = 0;
  const close = () => { if (row.length) rows.push({ row, sum }); row = []; sum = 0; };
  for (const c of items) {
    const sh = share(c);
    if (row.length && (c.br || sum + sh > 1.01)) close();
    row.push(c); sum += sh;
    if (sum >= 0.99) close();
  }
  close();
  const cap = vh * 0.8;
  // a row that isn't full keeps its tiles at their chosen share instead of stretching them
  return rows.map(({ row: r, sum: f }) => {
    const natural = fits(r);
    const full = f >= 0.99;
    const height = Math.min(full ? natural : (W * Math.min(1, f) - seam * (r.length - 1)) / r.reduce((a, c) => a + c.ratio, 0), cap);
    return { items: r, height, stretch: full && height === natural };
  });
}

// Puts packed rows into a container. k scales everything (Studio shows a smaller copy of the page).
export function renderRows(el, rows, k = 1) {
  el.replaceChildren();
  for (const r of rows) {
    const div = document.createElement('div');
    div.className = 'row';
    if (!r.stretch) div.style.justifyContent = 'center';
    div.style.height = `${r.height * k}px`;
    for (const c of r.items) {
      c.el.style.flex = r.stretch ? `${c.ratio} 1 0` : 'none';
      c.el.style.width = r.stretch ? '' : `${r.height * c.ratio * k}px`;
      div.append(c.el);
    }
    el.append(div);
  }
}

// Lays rows of { el, ratio, size, br } into a container and keeps them fitted on resize.
// cells can also be a function (viewportWidth) => cells, e.g. a separate list for phones.
export function mountWall(el, cells) {
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
    renderRows(el, packRows(list, { W, seam, ...vp }));
  };
  layout();
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => requestAnimationFrame(layout)) : null;
  if (ro) ro.observe(el); else addEventListener('resize', layout);
  return { layout: () => { lastKey = ''; layout(); }, stop: () => ro?.disconnect() };
}
