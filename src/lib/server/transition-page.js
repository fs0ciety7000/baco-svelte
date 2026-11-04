// Page de transition « BACO devient CSM » (gel de BACO).
//
// Page HTML autonome, servie par `hooks.server.js` sans passer par la mise en page Svelte de BACO (pas d'appel Supabase,
// pas de JavaScript) :
//   - toujours sur /transition (aperçu avant le jour J) ;
//   - sur TOUTES les routes quand la variable d'environnement BACO_FROZEN=1 est posée (Vercel), voir hooks.server.js.
//
// Identité « Encre et sable » de CSM (jetons de web/src/design/tokens.ts, thèmes `jour` / `nuit`, police Onest auto-hébergée
// dans static/brand-csm/). Tracés du logo repris tels quels de web/src/components/brand/csm-logo.tsx (ne pas les redessiner).
// Icônes : Lucide (licence ISC). Aucune ressource externe.

export const CSM_URL = 'https://csm.fs0ciety.org';

const SYMBOL_LINES =
	'M16 66L40 66L40 76C40 81.523 44.477 86 50 86C55.523 86 60 81.523 60 76L60 67.999C62.429 69.824 64 72.728 64 76C64 81.523 59.523 86 54 86L16 86C10.477 86 6 81.523 6 76C6 70.477 10.477 66 16 66ZM50 14L84 14C89.523 14 94 18.477 94 24C94 29.523 89.523 34 84 34L60 34L60 24C60 18.477 55.523 14 50 14ZM46 14L50 14C44.477 14 40 18.477 40 24L40 32.001C37.571 30.176 36 27.272 36 24C36 18.477 40.477 14 46 14Z';
const SYMBOL_PASSAGE =
	'M50 14L50 14C55.523 14 60 18.477 60 24L60 76C60 81.523 55.523 86 50 86L50 86C44.477 86 40 81.523 40 76L40 24C40 18.477 44.477 14 50 14Z';
const LOCKUP_LINES =
	'M-192.973 77.778L-151.306 77.778L-151.306 95.139C-151.306 104.727 -143.533 112.5 -133.945 112.5C-124.356 112.5 -116.584 104.727 -116.584 95.139L-116.584 81.248C-112.367 84.417 -109.639 89.458 -109.639 95.139C-109.639 104.727 -117.412 112.5 -127 112.5L-192.973 112.5C-202.561 112.5 -210.334 104.727 -210.334 95.139C-210.334 85.55 -202.561 77.778 -192.973 77.778ZM-133.945 -12.5L-74.917 -12.5C-65.329 -12.5 -57.556 -4.727 -57.556 4.861C-57.556 14.45 -65.329 22.222 -74.917 22.222L-116.584 22.222L-116.584 4.861C-116.584 -4.727 -124.356 -12.5 -133.945 -12.5ZM-140.889 -12.5L-133.945 -12.5C-143.533 -12.5 -151.306 -4.727 -151.306 4.861L-151.306 18.752C-155.523 15.583 -158.25 10.542 -158.25 4.861C-158.25 -4.727 -150.478 -12.5 -140.889 -12.5Z';
const LOCKUP_PASSAGE =
	'M-133.945 -12.5L-133.945 -12.5C-124.356 -12.5 -116.584 -4.727 -116.584 4.861L-116.584 95.139C-116.584 104.727 -124.356 112.5 -133.945 112.5L-133.945 112.5C-143.533 112.5 -151.306 104.727 -151.306 95.139L-151.306 4.861C-151.306 -4.727 -143.533 -12.5 -133.945 -12.5Z';
const LOCKUP_WORDMARK =
	'M155.367 100L155.367 25.565L173.164 25.565L174.859 33.898Q177.684 29.944 181.144 27.895Q184.605 25.847 188.136 25.141Q191.667 24.435 194.633 24.435Q201.271 24.435 206.356 26.977Q211.441 29.52 214.548 35.169Q217.514 31.073 221.045 28.743Q224.576 26.412 228.531 25.424Q232.486 24.435 236.582 24.435Q245.198 24.435 250.494 28.037Q255.791 31.638 258.263 37.994Q260.734 44.35 260.734 52.825L260.734 100L240.96 100L240.96 58.051Q240.96 55.508 240.678 52.825Q240.395 50.141 239.336 47.74Q238.277 45.339 236.229 43.785Q234.181 42.232 230.508 42.232Q226.977 42.232 224.576 43.785Q222.175 45.339 220.763 47.952Q219.35 50.565 218.715 53.602Q218.079 56.638 218.079 59.746L218.079 100L198.305 100L198.305 57.91Q198.305 55.508 198.023 52.825Q197.74 50.141 196.751 47.74Q195.763 45.339 193.573 43.785Q191.384 42.232 187.571 42.232Q182.345 42.232 179.59 45.268Q176.836 48.305 175.989 52.472Q175.141 56.638 175.141 60.169L175.141 100ZM114.124 100.989Q108.898 100.989 103.39 99.859Q97.881 98.729 93.22 95.975Q88.559 93.22 85.311 88.489Q82.062 83.757 81.073 76.695L101.13 76.695Q101.977 79.237 104.167 81.073Q106.356 82.91 109.251 83.757Q112.147 84.605 115.113 84.605Q117.09 84.605 119.068 84.322Q121.045 84.04 122.74 83.192Q124.435 82.345 125.424 81.003Q126.412 79.661 126.412 77.542Q126.412 75.424 125.212 74.153Q124.011 72.881 121.893 72.105Q119.774 71.328 116.808 70.763Q113.842 70.056 110.593 69.492Q107.345 68.927 104.237 68.22Q98.87 66.808 94.068 64.477Q89.266 62.147 86.229 57.91Q83.192 53.672 83.192 46.751Q83.192 40.678 85.805 36.37Q88.418 32.062 92.797 29.379Q97.175 26.695 102.542 25.494Q107.91 24.294 113.559 24.294Q121.186 24.294 127.684 26.766Q134.181 29.237 138.418 34.393Q142.655 39.548 143.644 47.74L124.718 47.74Q124.153 44.633 120.904 42.655Q117.655 40.678 112.853 40.678Q111.158 40.678 109.251 41.031Q107.345 41.384 105.791 42.09Q104.237 42.797 103.249 43.997Q102.26 45.198 102.26 47.175Q102.26 48.729 103.178 50Q104.096 51.271 105.932 52.189Q107.768 53.107 110.311 53.672Q114.831 54.661 119.774 55.579Q124.718 56.497 128.531 57.627Q133.192 58.757 137.076 60.946Q140.96 63.136 143.432 67.02Q145.904 70.904 145.904 77.119Q145.904 84.181 143.079 88.771Q140.254 93.362 135.523 96.045Q130.791 98.729 125.212 99.859Q119.633 100.989 114.124 100.989ZM40.96 100.989Q29.52 100.989 21.469 96.328Q13.418 91.667 9.181 83.121Q4.944 74.576 4.944 62.994Q4.944 51.271 9.322 42.585Q13.701 33.898 21.963 29.096Q30.226 24.294 41.667 24.294Q50.847 24.294 57.91 27.542Q64.972 30.791 69.35 36.864Q73.729 42.938 74.435 51.836L55.085 51.836Q53.814 46.893 50.212 44.562Q46.61 42.232 41.667 42.232Q35.311 42.232 31.568 45.339Q27.825 48.446 26.201 53.249Q24.576 58.051 24.576 62.853Q24.576 68.079 26.271 72.74Q27.966 77.401 31.709 80.297Q35.452 83.192 41.525 83.192Q46.61 83.192 50.424 80.862Q54.237 78.531 55.367 73.588L75.141 73.588Q74.435 82.768 69.633 88.842Q64.831 94.915 57.345 97.952Q49.859 100.989 40.96 100.989Z';

/** Point de correspondance qui parcourt le symbole (CSS `offset-path`, rien en mouvement réduit). */
const dot = (path, r, cls = '') =>
	`<circle aria-hidden="true" class="csm-logo-dot${cls}" r="${r}" style="offset-path:path('${path}')"/>`;

const lockup = `<svg class="csm-logo" viewBox="-210.334 -12.5 471.068 125" role="img" aria-label="CSM">
<path d="${LOCKUP_LINES}" fill="var(--fg)"/><path d="${LOCKUP_PASSAGE}" fill="var(--sable)"/><path d="${LOCKUP_WORDMARK}" fill="var(--fg)"/>
${dot('M-64.5 4.9 L-133.9 4.9 L-133.9 95.1 L-203.4 95.1', 9.7)}</svg>`;

const symbol = `<svg class="csm-logo hero-symbol" viewBox="6 14 88 72" aria-hidden="true">
<path d="${SYMBOL_LINES}" fill="var(--fg)"/><path d="${SYMBOL_PASSAGE}" fill="var(--sable)"/>
${dot('M90 24 L50 24 L50 76 L10 76', 5.6, ' late')}</svg>`;

// Icônes Lucide (ISC), trait 2 px, couleur du texte.
const icon = (body) =>
	`<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
	accessibility: icon(
		'<circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>'
	),
	bus: icon(
		'<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>'
	),
	messages: icon(
		'<path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"/>'
	),
	train: icon(
		'<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>'
	),
	search: icon('<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>'),
	arrow: icon('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
	check: icon('<path d="M20 6 9 17l-5-5"/>')
};

const KEEP = [
	[
		'Ton identifiant et ton mot de passe',
		'Ceux de BACO, repris tels quels. Rien à créer, rien à réinitialiser.'
	],
	[
		'Tes données',
		'Bons de bus et de taxi, missions PMR, Journal, annuaire et procédures : tout a été repris dans CSM, rien n’est perdu.'
	]
];

const NEWS = [
	[
		'accessibility',
		'Missions PMR et Groupes',
		'Synchronisés automatiquement depuis DICOS, tu n’as rien à lancer : trajet, embarquement (IN) et débarquement (OUT), retard du train et Export ALEA prêt à encoder.'
	],
	[
		'bus',
		'Bus et taxis',
		'Brouillon → Terminé → Envoyé. « Valider l’envoi » prépare le brouillon Outlook avec le PDF joint ; lignes et arrêts proposés d’après les horaires.'
	],
	[
		'messages',
		'Journal et B201',
		'Le Journal en deux onglets, Infos et Perturbations (réponses, recherche, mentions @DSO), et la B201 avec des notes par district.'
	],
	[
		'search',
		'Tout retrouver avec Ctrl K',
		'Un train, une gare, un bon, un collègue ou une procédure, depuis n’importe quelle page.'
	],
	[
		'train',
		'Le réseau, de source officielle',
		'Numéros de train, relations (IC, L, S, P), lignes, gares et passages à niveau viennent directement des données officielles de la SNCB et d’Infrabel, mises à jour chaque jour. Trains en direct, retards et suppressions compris.'
	]
];

const CSS = `
@font-face{font-family:"Onest";src:url("/brand-csm/onest-latin.woff2") format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
:root{color-scheme:light dark;
--bg:#F5F2EB;--surface:#FDFCF9;--surface-2:#F0ECE3;--surface-3:#E8E3D8;--border:#E3DDD1;--border-strong:#CFC7B8;
--fg:#1C1B19;--muted:#5F5A51;--subtle:#857E72;--action:#1C1B19;--action-fg:#FBF9F4;--action-hover:#34322E;
--sable:#C9B48A;--sable-soft:#EFE7D6;--link:#7F664E;--ok:#08795E;--danger:#B4312B;--danger-soft:#F6E4E1;
--shadow:0 1px 2px rgba(28,27,25,.05),0 8px 24px -12px rgba(28,27,25,.18);
--ease:cubic-bezier(.22,1,.36,1)}
@media (prefers-color-scheme:dark){:root{
--bg:#141311;--surface:#1B1A17;--surface-2:#23211E;--surface-3:#2C2A26;--border:#33302B;--border-strong:#47433C;
--fg:#EDE8DD;--muted:#ABA393;--subtle:#8A8375;--action:#C9B48A;--action-fg:#141311;--action-hover:#D6C49F;
--sable-soft:#2E2A22;--link:#D9C7A3;--ok:#3FC6A0;--danger:#FE8477;--danger-soft:#3A2220;
--shadow:0 1px 2px rgba(0,0,0,.35),0 10px 28px -12px rgba(0,0,0,.6)}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font-family:"Onest",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
font-size:15px;line-height:1.5;font-feature-settings:"tnum";-webkit-font-smoothing:antialiased}
a{color:var(--link)}
:focus-visible{outline:2px solid var(--fg);outline-offset:3px;box-shadow:0 0 0 6px var(--sable-soft)}
.skip{position:absolute;left:16px;top:-60px;background:var(--action);color:var(--action-fg);padding:10px 16px;border-radius:999px;z-index:2}
.skip:focus{top:12px}
.preview{margin:0;padding:8px 16px;text-align:center;font-size:13.5px;background:var(--surface-3);color:var(--muted)}
.wrap{max-width:1120px;margin:0 auto;padding:0 16px}
@media (min-width:768px){.wrap{padding:0 28px}}
header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 0}
.csm-logo{display:block;overflow:visible}
header.top .csm-logo{height:30px;width:auto}
.was{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;color:var(--muted);border:1px solid var(--border);
background:var(--surface);border-radius:999px;padding:5px 12px;white-space:nowrap}
.was s{color:var(--subtle)}
.csm-logo-dot{fill:var(--bg);stroke:var(--fg);stroke-width:2.4px;vector-effect:non-scaling-stroke;offset-rotate:0deg;opacity:0;
animation:csm-logo-travel 1.6s cubic-bezier(.65,0,.35,1) .25s 1 both}
.csm-logo-dot.late{animation-delay:.9s;animation-duration:2s}
@keyframes csm-logo-travel{0%{offset-distance:0%;opacity:0}10%{opacity:1}85%{offset-distance:100%;opacity:1}100%{offset-distance:100%;opacity:0}}
.hero{display:grid;gap:20px;padding:12px 0 8px}
@media (min-width:900px){.hero{grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:28px;align-items:stretch;padding-top:28px}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow)}
.hero-main{padding:28px 22px}
@media (min-width:768px){.hero-main{padding:44px 44px 40px}}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:var(--danger);background:var(--danger-soft);
border-radius:999px;padding:4px 12px 4px 10px;margin:0 0 18px}
.eyebrow::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
h1{font-size:34px;line-height:1.1;font-weight:700;letter-spacing:-.02em;margin:0 0 16px}
@media (min-width:768px){h1{font-size:52px}}
h1 .from{color:var(--subtle)}
.lead{font-size:17px;line-height:1.55;color:var(--muted);margin:0 0 28px;max-width:38em}
.lead strong{color:var(--fg);font-weight:600}
.cta{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 28px;border-radius:999px;
background:var(--action);color:var(--action-fg);font-weight:600;font-size:17px;text-decoration:none;
transition:background-color .2s var(--ease),transform .2s var(--ease)}
.btn:hover{background:var(--action-hover)}
.btn:active{transform:translateY(1px)}
.btn .ico{width:20px;height:20px;transition:transform .3s var(--ease)}
.btn:hover .ico{transform:translateX(3px)}
.url{font-size:14px;color:var(--muted)}
.url a{color:var(--muted)}
@media (max-width:520px){.btn{width:100%}}
.hero-art{display:none;position:relative;overflow:hidden;background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:36px}
@media (min-width:900px){.hero-art{display:flex;flex-direction:column;justify-content:space-between}}
.hero-art .hero-symbol{width:72%;height:auto;margin:20px auto 0}
.hero-art p{margin:24px 0 0;font-size:13.5px;color:var(--muted)}
.hero-art .rails{position:absolute;inset:auto 0 0 0;height:1px;background:var(--border)}
section{padding:36px 0 0}
h2{font-size:22px;line-height:1.25;font-weight:650;letter-spacing:-.015em;margin:0 0 6px}
@media (min-width:768px){h2{font-size:24px}}
.sub{margin:0 0 18px;color:var(--muted)}
.keep{display:grid;gap:12px;list-style:none;margin:0;padding:0}
@media (min-width:768px){.keep{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}
.keep li{padding:18px 20px;display:flex;gap:14px;align-items:flex-start}
.keep .ico{flex:none;width:20px;height:20px;margin-top:2px;color:var(--ok)}
.keep h3,.news h3{font-size:16px;line-height:1.3;font-weight:650;margin:0 0 4px}
.keep p,.news p{margin:0;color:var(--muted);font-size:14.5px}
.news{display:grid;gap:12px;list-style:none;margin:0;padding:0}
@media (min-width:640px){.news{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}
.news li{padding:22px 22px 24px;position:relative}
@media (min-width:640px){.news li:last-child:nth-child(odd){grid-column:1/-1}}
.news .badge{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;
background:var(--sable-soft);color:var(--fg);margin:0 0 14px}
.news .ico{width:20px;height:20px}
.help{display:grid;gap:16px;padding:22px;margin:36px 0 0}
@media (min-width:768px){.help{padding:26px 30px}}
.help p{margin:0}
.sign{text-align:left}
.sign .bye{color:var(--muted);font-size:14px}
.sign .who{font-weight:650;font-size:18px;letter-spacing:-.01em}
footer{padding:28px 0 calc(28px + env(safe-area-inset-bottom));color:var(--subtle);font-size:13px;display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:space-between}
.rise{animation:rise .55s var(--ease) both}
.rise.d1{animation-delay:.05s}.rise.d2{animation-delay:.1s}.rise.d3{animation-delay:.15s}.rise.d4{animation-delay:.2s}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.csm-logo-dot,.rise{animation:none}.btn,.btn .ico{transition:none}}
`;

/** HTML complet de la page de transition (sans script, sans ressource externe). */
export function transitionPage({ frozen = false } = {}) {
	const keep = KEEP.map(
		([t, d]) => `<li class="card">${ICONS.check}<div><h3>${t}</h3><p>${d}</p></div></li>`
	).join('');
	const news = NEWS.map(
		([i, t, d]) =>
			`<li class="card"><span class="badge">${ICONS[i]}</span><h3>${t}</h3><p>${d}</p></li>`
	).join('');
	return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F5F2EB" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#141311" media="(prefers-color-scheme: dark)">
<meta name="robots" content="noindex">
<meta name="description" content="BACO est fermé : toute l'équipe Client Solutions travaille désormais dans CSM.">
<title>BACO devient CSM</title>
<link rel="icon" type="image/png" sizes="192x192" href="/brand-csm/csm-icon-192.png">
<link rel="apple-touch-icon" href="/brand-csm/csm-apple-touch-icon.png">
<link rel="preload" href="/brand-csm/onest-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="${CSM_URL}">Aller directement sur CSM</a>
${frozen ? '' : '<p class="preview" role="note">Aperçu de la page affichée le jour de la bascule. BACO est encore ouvert.</p>'}
<div class="wrap">
<header class="top">
${lockup}
<span class="was">Anciennement <s>BACO</s></span>
</header>
<main id="contenu">
<div class="hero">
<div class="card hero-main rise">
<p class="eyebrow">BACO est fermé</p>
<h1><span class="from">BACO</span> devient CSM</h1>
<p class="lead"><strong>BACO est fermé&nbsp;: plus aucune saisie n'y est possible.</strong> Toutes tes données t'attendent dans CSM, le nouvel outil de l'équipe Client Solutions. Mêmes missions, mêmes données, dans un outil plus rapide et plus complet.</p>
<div class="cta">
<a class="btn" href="${CSM_URL}">Ouvrir CSM ${ICONS.arrow}</a>
<span class="url">ou tape <a href="${CSM_URL}">csm.fs0ciety.org</a> dans ton navigateur</span>
</div>
</div>
<div class="hero-art rise d1" aria-hidden="true">
${symbol}
<p>Deux lignes, le train et le bus, reliées par une correspondance&nbsp;: c'est CSM.</p>
</div>
</div>

<section aria-labelledby="t-keep" class="rise d2">
<h2 id="t-keep">Ce qui ne change pas</h2>
<p class="sub">Tu te connectes comme avant.</p>
<ul class="keep">${keep}</ul>
</section>

<section aria-labelledby="t-news" class="rise d3">
<h2 id="t-news">Ce qui t'attend dans CSM</h2>
<p class="sub">Quelques nouveautés parmi d'autres. Toutes sont expliquées sur la page <a href="${CSM_URL}/changelog">Nouveautés</a> de CSM.</p>
<ul class="news">${news}</ul>
</section>

<div class="card help rise d4">
<div class="sign">
<p class="bye">Bonne prise en main et bon service&nbsp;!</p>
<p class="who">Nicolas</p>
</div>
</div>
</main>
<footer>
<span>BACO a laissé la place à CSM. Tes données y ont été reprises.</span>
<span>CSM · Client Solutions · SNCB</span>
</footer>
</div>
</body>
</html>`;
}
