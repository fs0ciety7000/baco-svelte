import { describe, it, expect } from 'vitest';
import { canAccessRoute, isPublicRoute, requiredPermission } from './guards.js';

describe('isPublicRoute', () => {
	it('reconnaît les routes publiques sans faux positifs', () => {
		expect(isPublicRoute('/login')).toBe(true);
		expect(isPublicRoute('/healthz')).toBe(true);
		expect(isPublicRoute('/auth/callback')).toBe(true);
		expect(isPublicRoute('/loginx')).toBe(false);
		expect(isPublicRoute('/accueil')).toBe(false);
	});
});

describe('canAccessRoute', () => {
	const user = { role: 'user', permissions: {} };
	const admin = { role: 'admin', permissions: {} };
	const sysop = { role: 'sysop', permissions: {} };
	const otto = { role: 'otto_agent', permissions: {} };

	it('admin : tout', () => {
		expect(canAccessRoute('/admin', admin)).toBe(true);
		expect(canAccessRoute('/audit', admin)).toBe(true);
	});

	it('user : pas d’admin ni d’audit, mais les modules métier', () => {
		expect(canAccessRoute('/admin', user)).toBe(false);
		expect(canAccessRoute('/admin/utilisateur/123', user)).toBe(false);
		expect(canAccessRoute('/audit', user)).toBe(false);
		expect(canAccessRoute('/bus', user)).toBe(true);
		expect(canAccessRoute('/generateTaxi', user)).toBe(true);
	});

	it('otto_agent : uniquement otto et stats', () => {
		expect(canAccessRoute('/otto', otto)).toBe(true);
		expect(canAccessRoute('/stats', otto)).toBe(true);
		expect(canAccessRoute('/bus', otto)).toBe(false);
	});

	it('surcharge explicite de permission', () => {
		expect(canAccessRoute('/audit', { role: 'user', permissions: { 'audit:read': true } })).toBe(
			true
		);
		expect(canAccessRoute('/bus', { role: 'user', permissions: { 'bus:read': false } })).toBe(
			false
		);
	});

	it('sysop accède à /admin/sante', () => {
		expect(canAccessRoute('/admin/sante', sysop)).toBe(true);
	});

	it('routes non listées : ouvertes aux connectés, fermées sans profil si listées', () => {
		expect(requiredPermission('/accueil')).toBe(null);
		expect(canAccessRoute('/accueil', user)).toBe(true);
		expect(canAccessRoute('/bus', null)).toBe(false);
	});
});
