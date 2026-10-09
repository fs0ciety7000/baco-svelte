/// <reference path="../pb_data/types.d.ts" />
// Sauvegardes hors serveur (Cloudflare R2, API S3) réglées depuis les variables d'environnement de csm-pocketbase,
// à chaque démarrage (demande du 9 oct. 2026). Les secrets ne sont jamais dans Git ni dans une migration.
// - CSM_BACKUP_S3_ENDPOINT (https://<compte>.r2.cloudflarestorage.com), CSM_BACKUP_S3_BUCKET,
//   CSM_BACKUP_S3_ACCESS_KEY, CSM_BACKUP_S3_SECRET : toutes présentes → sauvegardes planifiées envoyées dans R2 ;
// - CSM_BACKUP_S3=off → retour aux sauvegardes locales (/pb_data/backups) ;
// - sinon (rien de défini) : réglage laissé tel quel.
// CSM_BACKUP_KEEP (défaut 14) : nombre de sauvegardes conservées par la planification (2 h UTC).
onBootstrap((e) => {
	e.next();
	const env = (k) => String($os.getenv(k) || '').trim();
	const s3 = {
		endpoint: env('CSM_BACKUP_S3_ENDPOINT'),
		bucket: env('CSM_BACKUP_S3_BUCKET'),
		accessKey: env('CSM_BACKUP_S3_ACCESS_KEY'),
		secret: env('CSM_BACKUP_S3_SECRET'),
	};
	const off = env('CSM_BACKUP_S3') === 'off';
	const complete = !!(s3.endpoint && s3.bucket && s3.accessKey && s3.secret);
	const keep = parseInt(env('CSM_BACKUP_KEEP'), 10);
	if (!off && !complete && !(keep > 0)) return;
	try {
		const settings = e.app.settings();
		if (keep > 0 && keep <= 90) settings.backups.cronMaxKeep = keep;
		if (off) {
			settings.backups.s3.enabled = false;
		} else if (complete) {
			if (!/^https:\/\//.test(s3.endpoint)) throw new Error('CSM_BACKUP_S3_ENDPOINT doit commencer par https://');
			settings.backups.s3.enabled = true;
			settings.backups.s3.endpoint = s3.endpoint;
			settings.backups.s3.bucket = s3.bucket;
			settings.backups.s3.region = env('CSM_BACKUP_S3_REGION') || 'auto';
			settings.backups.s3.accessKey = s3.accessKey;
			settings.backups.s3.secret = s3.secret;
			settings.backups.s3.forcePathStyle = true;
		}
		e.app.save(settings);
		console.log(
			`sauvegardes : ${settings.backups.s3.enabled ? `R2 (${s3.bucket || 'réglage existant'})` : 'locales'}, ${settings.backups.cronMaxKeep} conservées`,
		);
	} catch (err) {
		// Une erreur de réglage ne doit pas empêcher le démarrage : les sauvegardes restent comme avant.
		console.log('sauvegardes : réglage S3 ignoré :', String(err));
	}
});
