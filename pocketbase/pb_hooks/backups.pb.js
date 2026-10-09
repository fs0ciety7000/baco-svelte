/// <reference path="../pb_data/types.d.ts" />
// Sauvegardes hors serveur (Cloudflare R2, API S3) réglées depuis les variables d'environnement de csm-pocketbase,
// à chaque démarrage de `serve` (demande du 9 oct. 2026). Les secrets ne sont jamais dans Git ni dans une migration.
// Les variables sont la SEULE source de vérité :
// - CSM_BACKUP_S3_ENDPOINT (https://<compte>.r2.cloudflarestorage.com), CSM_BACKUP_S3_BUCKET,
//   CSM_BACKUP_S3_ACCESS_KEY, CSM_BACKUP_S3_SECRET : toutes présentes → sauvegardes planifiées envoyées dans R2 ;
// - sinon → S3 coupé et secret effacé (sauvegardes locales dans /pb_data/backups). Ainsi une copie restaurée ailleurs
//   (local, répétition de bascule) n'écrit jamais dans le bucket de production ni n'y purge de sauvegardes.
// CSM_BACKUP_KEEP (défaut 14, max 90) : nombre de sauvegardes conservées par la planification (2 h UTC).
// Rien n'est réglé pour les autres commandes (`migrate`, `superuser`, `csm-import`).
onBootstrap((e) => {
	e.next();
	const args = $os.args || [];
	let serve = false;
	for (let i = 0; i < args.length; i++) if (String(args[i]) === 'serve') serve = true;
	if (!serve) return;
	const env = (k) => String($os.getenv(k) || '').trim();
	const s3 = {
		endpoint: env('CSM_BACKUP_S3_ENDPOINT'),
		bucket: env('CSM_BACKUP_S3_BUCKET'),
		accessKey: env('CSM_BACKUP_S3_ACCESS_KEY'),
		secret: env('CSM_BACKUP_S3_SECRET'),
	};
	let complete = !!(s3.endpoint && s3.bucket && s3.accessKey && s3.secret);
	if (complete && !/^https:\/\/[^\s/]+/.test(s3.endpoint)) {
		console.log('sauvegardes : CSM_BACKUP_S3_ENDPOINT doit commencer par https:// — sauvegardes locales');
		complete = false;
	}
	const rawKeep = parseInt(env('CSM_BACKUP_KEEP'), 10);
	const keep = rawKeep > 0 && rawKeep <= 90 ? rawKeep : 14;
	try {
		// Copie : un enregistrement refusé ne laisse pas de réglage à moitié appliqué en mémoire.
		const settings = e.app.settings().clone();
		settings.backups.cronMaxKeep = keep;
		if (complete) {
			settings.backups.s3.enabled = true;
			settings.backups.s3.endpoint = s3.endpoint;
			settings.backups.s3.bucket = s3.bucket;
			settings.backups.s3.region = env('CSM_BACKUP_S3_REGION') || 'auto';
			settings.backups.s3.accessKey = s3.accessKey;
			settings.backups.s3.secret = s3.secret;
			settings.backups.s3.forcePathStyle = true;
		} else {
			settings.backups.s3.enabled = false;
			settings.backups.s3.accessKey = '';
			settings.backups.s3.secret = '';
		}
		e.app.save(settings);
		console.log(`sauvegardes : ${complete ? `R2 (${s3.bucket})` : 'locales'}, ${keep} conservées`);
	} catch (err) {
		// Une erreur de réglage ne doit pas empêcher le démarrage : les sauvegardes restent comme avant.
		console.log('sauvegardes : réglage ignoré :', String(err));
	}
});
