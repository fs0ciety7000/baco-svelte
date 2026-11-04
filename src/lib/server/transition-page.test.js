import { describe, it, expect } from 'vitest';
import { transitionPage, CSM_URL } from './transition-page.js';

describe('page de transition BACO → CSM', () => {
	it('mène à CSM et ne charge aucune ressource externe ni script', () => {
		const html = transitionPage({ frozen: true });
		expect(html).toContain('BACO</span> devient CSM');
		expect(html).toContain(`href="${CSM_URL}"`);
		expect(html).toContain('<p class="who">Nicolas</p>');
		expect(html).not.toContain('Thomas');
		expect(html).toContain('SNCB et d’Infrabel');
		expect(html).not.toMatch(/<script/i);
		const external = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)]
			.map((m) => m[1])
			.filter((u) => !u.startsWith(CSM_URL));
		expect(external).toEqual([]);
	});

	it("n'affiche le bandeau d'aperçu que tant que BACO n'est pas gelé", () => {
		expect(transitionPage({ frozen: false })).toContain('class="preview"');
		expect(transitionPage({ frozen: true })).not.toContain('class="preview"');
	});

	it('respecte prefers-reduced-motion et prefers-color-scheme', () => {
		const html = transitionPage();
		expect(html).toContain('prefers-reduced-motion:reduce');
		expect(html).toContain('prefers-color-scheme:dark');
	});
});
