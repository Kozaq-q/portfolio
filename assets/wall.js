// Wall layout: justified rows that fill the width exactly.
// Shared by the public site (assets/site.js) and the Studio preview (admin/admin.js),
// so what you arrange in Studio is exactly what visitors see.
//
// Each item: { ratio, size }  size: 's' small, 'm' (default), 'l' large = a row of its own.

export const SIZES = { s: 'Small', m: 'Medium', l: 'Large' };
const FACTOR = { s: 0.62, m: 1 };

export const PHONE = 860; // widths at or below this use the phone layout

// W: inner width, seam: gap px, vw/vh: viewport size (decides phone vs desktop and caps height)
export function packRows(items, { W, seam, vw, vh }) {
  const phone = vw <= PHONE;
  const base = phone ? W * 0.75 : Math.max(240, Math.min(vh * 0.46, W * 0.3));
  const fits = (row) => (W - seam * (row.length - 1)) / row.reduce((a, c) => a + c.ratio, 0);
  const target = (row) => base * Math.min(...row.map((c) => FACTOR[c.size] || 1));

  const rows = [];
  // a short leftover row is folded into the previous one (or stretched) so the wall stays closed
  const flush = (row) => {
    if (!row.length) return;
    const prev = rows[rows.length - 1];
    const t = target(row);
    if (fits(row) <= t * 1.6) rows.push(row);
    else if (prev && !prev.large && fits([...prev, ...row]) >= target(prev) * 0.55) rows[rows.length - 1] = [...prev, ...row];
    else rows.push(row);
  };

  let row = [];
  for (const c of items) {
    if (c.size === 'l') {
      flush(row); row = [];
      const r = [c]; r.large = true; rows.push(r);
      continue;
    }
    row.push(c);
    if (fits(row) <= target(row)) { rows.push(row); row = []; }
  }
  flush(row);

  return rows.map((r) => {
    const natural = fits(r);
    const height = Math.min(natural, vh * (phone ? 0.8 : 0.92));
    return { items: r, height, stretch: height === natural };
  });
}

// Lays rows of { el, ratio, size } into a container and keeps them fitted on resize.
export function mountWall(el, cells, { viewport } = {}) {
  let lastKey = '';
  const layout = () => {
    const seam = parseFloat(getComputedStyle(el).rowGap) || 3;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const W = el.clientWidth - pad * 2;
    const vp = viewport ? viewport() : { vw: innerWidth, vh: innerHeight };
    const key = `${Math.round(W)}x${Math.round(vp.vh / 40)}`; // ignore tiny height jitter (mobile URL bar)
    if (key === lastKey || W <= 0) return;
    lastKey = key;
    const rows = packRows(cells, { W, seam, ...vp });
    el.replaceChildren();
    for (const r of rows) {
      const div = document.createElement('div');
      div.className = 'row';
      if (!r.stretch) div.style.justifyContent = 'center';
      div.style.height = `${r.height}px`;
      for (const c of r.items) {
        c.el.style.flex = r.stretch ? `${c.ratio} 1 0` : 'none';
        c.el.style.width = r.stretch ? '' : `${r.height * c.ratio}px`;
        div.append(c.el);
      }
      el.append(div);
    }
  };
  layout();
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => requestAnimationFrame(layout)) : null;
  if (ro) ro.observe(el); else addEventListener('resize', layout);
  return { layout: () => { lastKey = ''; layout(); }, stop: () => ro?.disconnect() };
}
