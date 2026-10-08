import { describe, it, expect } from 'vitest';
import { sanitize, renderMarkdown, sanitizeHighlight } from './sanitize.js';

describe('sanitize', () => {
	it('supprime les scripts et handlers', () => {
		const out = sanitize('<img src=x onerror="alert(1)"><script>alert(2)</script><b>ok</b>');
		expect(out).not.toContain('onerror');
		expect(out).not.toContain('<script');
		expect(out).toContain('<b>ok</b>');
	});

	it('gère null/undefined', () => {
		expect(sanitize(null)).toBe('');
		expect(renderMarkdown(undefined)).toBe('');
	});
});

describe('renderMarkdown', () => {
	it('rend le markdown et neutralise le HTML dangereux', () => {
		const out = renderMarkdown(
			'**gras** <a href="javascript:alert(1)">x</a> <iframe src="//evil"></iframe>'
		);
		expect(out).toContain('<strong>gras</strong>');
		expect(out).not.toContain('javascript:');
		expect(out).not.toContain('<iframe');
	});
});

describe('sanitizeHighlight', () => {
	it('ne garde que les balises de surlignage', () => {
		expect(sanitizeHighlight('<mark>Mons</mark><a href="x">lien</a>')).toBe(
			'<mark>Mons</mark>lien'
		);
	});
});
