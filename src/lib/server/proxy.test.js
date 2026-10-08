import { describe, it, expect } from 'vitest';
import { resolveProxyTarget, hardenStorageHeaders } from './proxy.js';

const BASE = 'https://ref.supabase.co';
const ok = (p, s = '') => resolveProxyTarget(BASE, p, s)?.toString() ?? null;

describe('resolveProxyTarget', () => {
	it('autorise REST, Storage et le rafraîchissement de jeton', () => {
		expect(ok('rest/v1/taxis', '?select=*')).toBe('https://ref.supabase.co/rest/v1/taxis?select=*');
		expect(ok('storage/v1/object/public/avatars/a.png')).not.toBeNull();
		expect(ok('auth/v1/token', '?grant_type=refresh_token')).not.toBeNull();
		expect(ok('auth/v1/user')).not.toBeNull();
	});

	it('refuse connexion par mot de passe, inscription et services non listés', () => {
		expect(ok('auth/v1/token', '?grant_type=password')).toBeNull();
		expect(ok('auth/v1/signup')).toBeNull();
		expect(ok('auth/v1/otp')).toBeNull();
		expect(ok('functions/v1/x')).toBeNull();
		expect(ok('graphql/v1')).toBeNull();
	});

	it('refuse les contournements par normalisation', () => {
		expect(ok('rest/v1/.\t./.\t./auth/v1/signup')).toBeNull(); // tabulation (%09)
		expect(ok('rest/v1/.\n./.\n./auth/v1/signup')).toBeNull(); // saut de ligne
		expect(ok('rest/v1/../../auth/v1/signup')).toBeNull();
		expect(ok('rest/v1/%2e%2e/%2e%2e/auth/v1/signup')).toBeNull();
		expect(ok('rest/v1\\..\\..\\auth/v1/signup')).toBeNull();
		expect(ok('/evil.com/rest/v1/x')).toBeNull(); // //evil.com
	});
});

describe('hardenStorageHeaders', () => {
	it('sandbox + téléchargement forcé pour SVG/HTML', () => {
		const h = new Headers({ 'content-type': 'image/svg+xml' });
		hardenStorageHeaders(h);
		expect(h.get('content-security-policy')).toContain('sandbox');
		expect(h.get('content-disposition')).toBe('attachment');
	});
	it('affichage en ligne conservé pour PNG/PDF', () => {
		const h = new Headers({ 'content-type': 'application/pdf' });
		hardenStorageHeaders(h);
		expect(h.get('content-disposition')).toBeNull();
	});
});
