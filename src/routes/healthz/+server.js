import { json } from '@sveltejs/kit';

/** Sonde de santé pour Docker / Coolify. Ne touche pas la base. */
export function GET() {
	return json(
		{ status: 'ok', uptime: Math.round(process.uptime()) },
		{ headers: { 'cache-control': 'no-store' } }
	);
}
