// Generates the static HTML shell for every public page.
// Used by the admin panel on publish and by tools/build.mjs locally.
// The page content itself is rendered by assets/site.js from content/site.json.

// Bump when assets/*.js or *.css change so browsers fetch the new code instead of a cached copy.
export const V = '31';

// Typefaces the site can use (Google Fonts). Chosen in Studio → Settings.
const G = 'https://fonts.googleapis.com/css2?display=swap&family=';
export const FONTS = {
  general: { label: 'General Sans — favourite so far', url: 'https://api.fontshare.com/v2/css?f[]=general-sans@400,500&display=swap' },
  synonym: { label: 'Synonym — same family feel, a bit narrower', url: 'https://api.fontshare.com/v2/css?f[]=synonym@400,500&display=swap' },
  mona: { label: 'Mona Sans — refined neo-grotesk', url: G + 'Mona+Sans:wght@400;500' },
  rethink: { label: 'Rethink Sans — calm, slightly geometric', url: G + 'Rethink+Sans:ital,wght@0,400;0,500;1,400' },
  funnel: { label: 'Funnel Sans — plain, modern', url: G + 'Funnel+Sans:ital,wght@0,400;0,500;1,400' },
  wix: { label: 'Wix Madefor Display — soft neutral', url: G + 'Wix+Madefor+Display:wght@400;500' },
  golos: { label: 'Golos Text — sober, even', url: G + 'Golos+Text:wght@400;500' },
  intertight: { label: 'Inter Tight — Inter, tighter and more elegant', url: G + 'Inter+Tight:ital,wght@0,400;0,500;1,400' },
  epilogue: { label: 'Epilogue — clean with a slight edge', url: G + 'Epilogue:ital,wght@0,400;0,500;1,400' },
  satoshi: { label: 'Satoshi', url: 'https://api.fontshare.com/v2/css?f[]=satoshi@400,500&display=swap' },
  switzer: { label: 'Switzer — current', url: 'https://api.fontshare.com/v2/css?f[]=switzer@400,500,401&display=swap' },
};
export const fontOf = (s) => (FONTS[s?.font] ? s.font : 'switzer');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function pageShell(site, project) {
  const s = site.settings || {};
  const root = project ? '../../' : '';
  const base = (s.siteUrl || '').replace(/\/+$/, '');
  const title = project ? `${project.title} — ${s.name}` : `${s.name} — ${s.role}`;
  const description = project
    ? [project.type, project.year].filter(Boolean).join(', ') + (project.description ? '. ' + project.description : '')
    : s.description || '';
  const cover = project ? (project.media || []).find((m) => m.id === project.cover) || project.media?.[0] : null;
  const imgPath = cover ? (cover.type === 'video' ? cover.poster : cover.src) : '';
  const image = !imgPath ? '' : imgPath.startsWith('r2:') ? (s.mediaBase ? `${s.mediaBase.replace(/\/+$/, '')}/${imgPath.slice(3)}` : '') : base ? `${base}/${imgPath}` : '';
  const canonical = base ? `${base}/${project ? `work/${project.slug}/` : ''}` : '';

  return `<!doctype html>
<html lang="en" data-root="${root}" data-page="${project ? 'project' : 'home'}" data-slug="${project ? esc(project.slug) : ''}" data-theme="${esc(s.theme || 'light')}" data-font="${fontOf(s)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>${s.hidden !== false || project?.hidden ? '\n<meta name="robots" content="noindex, nofollow">' : ''}
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
