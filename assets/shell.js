// Generates the static HTML shell for every public page.
// Used by the admin panel on publish and by tools/build.mjs locally.
// The page content itself is rendered by assets/site.js from content/site.json.

// Bump when assets/*.js or *.css change so browsers fetch the new code instead of a cached copy.
export const V = '10';

// Typefaces the site can use (Google Fonts). Chosen in Studio → Settings.
const G = 'https://fonts.googleapis.com/css2?display=swap&family=';
export const FONTS = {
  grotesk: { label: 'Schibsted Grotesk — current', url: G + 'Schibsted+Grotesk:ital,wght@0,400;0,500;1,400' },
  switzer: { label: 'Switzer — quiet Swiss grotesk', url: 'https://api.fontshare.com/v2/css?f[]=switzer@400,500,401&display=swap' },
  jost: { label: 'Jost — classic geometric, Futura-like', url: G + 'Jost:ital,wght@0,400;0,500;1,400' },
  franklin: { label: 'Libre Franklin — old American grotesque', url: G + 'Libre+Franklin:ital,wght@0,400;0,500;1,400' },
  tenor: { label: 'Tenor Sans — soft, humanist, Optima-like', url: G + 'Tenor+Sans' },
  familjen: { label: 'Familjen Grotesk — Scandinavian, a little character', url: G + 'Familjen+Grotesk:ital,wght@0,400;0,500;1,400' },
};
export const fontOf = (s) => (FONTS[s?.font] ? s.font : 'grotesk');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function pageShell(site, project) {
  const s = site.settings || {};
  const root = project ? '../../' : '';
  const base = (s.siteUrl || '').replace(/\/+$/, '');
  const title = project ? `${project.title} — ${s.name}` : `${s.name} — ${s.role}`;
  const description = project
    ? [project.type, project.year].filter(Boolean).join(', ') + (project.description ? '. ' + project.description : '')
    : s.description || '';
  const cover = project ? project.media?.[0] : null;
  const imgPath = cover ? (cover.type === 'video' ? cover.poster : cover.src) : '';
  const image = !imgPath ? '' : imgPath.startsWith('r2:') ? (s.mediaBase ? `${s.mediaBase.replace(/\/+$/, '')}/${imgPath.slice(3)}` : '') : base ? `${base}/${imgPath}` : '';
  const canonical = base ? `${base}/${project ? `work/${project.slug}/` : ''}` : '';

  return `<!doctype html>
<html lang="en" data-root="${root}" data-page="${project ? 'project' : 'home'}" data-slug="${project ? esc(project.slug) : ''}" data-theme="${esc(s.theme || 'light')}" data-font="${fontOf(s)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>${s.hidden !== false ? '\n<meta name="robots" content="noindex, nofollow">' : ''}
<meta name="description" content="${esc(description).slice(0, 300)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description).slice(0, 300)}">
<meta property="og:type" content="website">${image ? `\n<meta property="og:image" content="${esc(image)}">` : ''}${canonical ? `\n<link rel="canonical" href="${esc(canonical)}">` : ''}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='5' fill='%23161616'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS[fontOf(s)].url}" rel="stylesheet">
<link rel="stylesheet" href="${root}assets/site.css?v=${V}">
</head>
<body>
<div id="app"></div>
<noscript><p style="padding:28px">${esc(s.name)} — ${esc(s.role)}. This site needs JavaScript to show the work.</p></noscript>
<script type="module" src="${root}assets/site.js?v=${V}"></script>
</body>
</html>
`;
}

// Every file the public site needs, derived from site.json: path -> html.
export function allShells(site) {
  const files = { 'index.html': pageShell(site, null) };
  for (const p of site.projects || []) files[`work/${p.slug}/index.html`] = pageShell(site, p);
  return files;
}
