import { describe, it, expect } from 'vitest';
import { safeRedirect } from './redirect.js';

const O = 'https://csm.fs0ciety.org';

describe('safeRedirect', () => {
	it('garde les chemins internes', () => {
		expect(safeRedirect('/bus?x=1', O)).toBe('/bus?x=1');
		expect(safeRedirect('/profil', O)).toBe('/profil');
	});
	it('refuse les redirections externes', () => {
		for (const t of [
			'//evil.com',
			'/\\evil.com',
			'\\\\evil.com',
			'https://evil.com',
			'/\t/evil.com',
			'',
			null
		]) {
			expect(safeRedirect(t, O)).toBe('/accueil');
		}
	});
});
