import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

// <br> pour les sauts de ligne + GitHub Flavored Markdown (comportement historique du journal)
marked.use({ breaks: true, gfm: true });

/**
 * Nettoie du HTML avant un rendu via {@html}. Obligatoire pour tout contenu
 * provenant de la base ou d'un utilisateur.
 * @param {string | null | undefined} html
 * @returns {string}
 */
export function sanitize(html) {
	return DOMPurify.sanitize(html ?? '', { USE_PROFILES: { html: true } });
}

/**
 * Markdown -> HTML nettoyé.
 * @param {string | null | undefined} markdown
 * @returns {string}
 */
export function renderMarkdown(markdown) {
	return sanitize(/** @type {string} */ (marked.parse(markdown ?? '', { async: false })));
}

/**
 * Pour les surlignages de recherche : n'autorise que <mark>, <b>, <strong>, <em>.
 * @param {string | null | undefined} html
 * @returns {string}
 */
export function sanitizeHighlight(html) {
	return DOMPurify.sanitize(html ?? '', {
		ALLOWED_TAGS: ['mark', 'b', 'strong', 'em'],
		ALLOWED_ATTR: []
	});
}
