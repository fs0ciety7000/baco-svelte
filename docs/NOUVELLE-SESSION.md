# Message de lancement — session CSM v2 n° 4

À copier tel quel dans une nouvelle session Claude Code, sur le dépôt `fs0ciety7000/baco-svelte`, dans
l'environnement cloud **CSM**.

**Avant de lancer** (côté utilisateur) :
- dans l'environnement CSM, une variable par ligne : `CSM_PB_URL=https://pb-test-csm.fs0ciety.org`,
  `CSM_PB_ADMIN_EMAIL` / `CSM_PB_ADMIN_PASSWORD` (valeurs de `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` de `csm-pocketbase`
  dans Coolify) ;
- domaines autorisés : ceux de `docs/ENVIRONNEMENT-CLOUD.md` (dont `pb-test-csm.fs0ciety.org`) ;
- si ce n'est pas fait : bucket R2 + variables `CSM_BACKUP_S3_*` (`docs/DEPLOIEMENT-V2.md` §3), fiche Chrome Web Store
  (`extension/dicos-connector/README.md`).

---

Tu reprends **CSM — Client Solutions Management Tool**, le successeur de BACO : outil métier ferroviaire SNCB de l'équipe
Client Solutions (commandes de bus et de taxis, missions PMR et groupes synchronisés depuis DICOS, export ALEA, Journal,
trains en direct iRail, annuaire et données, équipe, administration). Utilisé toute la journée par une trentaine
d'opérateurs.

**Point de départ.** La session 3 a travaillé sur `claude/csm-session-3-2lkadk`. Récupère-la et crée ta branche de session
à partir d'elle. Lis, dans l'ordre :
1. `CLAUDE.md` (§0 à §8) : état, variables, contraintes, **pièges**, journal ;
2. `web/CLAUDE.md` et `pocketbase/CLAUDE.md` : conventions du code ;
3. `docs/CSM-V2.md` (§7 feuille de route à jour) ;
4. `docs/DEPLOIEMENT-V2.md` : Coolify, variables, sauvegardes, secrets CI ;
5. `docs/DESIGN-DIRECTION.md` et `docs/design/AUDIT-INTERFACE.md` ;
6. `docs/DPO-CONSERVATION.md` et `extension/dicos-connector/README.md`.

**Où on en est (fin de session 3, 9 octobre 2026)**
- https://test-csm.fs0ciety.org en ligne, données BACO du 8 octobre importées (données personnelles réelles).
- Modules validés : Commandes, PMR, Opérations (Journal compris), Missions PMR / Groupes (DICOS, ALEA « Obligatoire »,
  temps d'arrêt ATMS), Annuaire et données. **Équipe et Admin livrés, à valider.**
- Interface : 11 thèmes, motion GSAP, tutoiement, mobile 5 onglets + Plus.
- Extension DICOS 1.7.0 (Chrome / Edge en `.zip`, Firefox **signé**) ; jetons de connecteur personnels, vue admin des
  appareils connectés (`/admin/extension`) ; alerte cloche si aucune synchro DICOS depuis 1 h pendant le service
  (cron `dicos-stale`, 6-22 h). Publication Chrome Web Store prête (job `publish-chrome`, secrets `CWS_*` à poser).
- Sauvegardes : PocketBase 2 h (local tant que R2 n'est pas configuré) + volume Coolify 2 h 30 ; R2 prêt
  (`pb_hooks/backups.pb.js`).

**Décisions déjà prises (ne pas les rediscuter)** : Next.js + PocketBase sur Coolify ; navigateur → domaine CSM
uniquement ; migration des données **en une fois à la bascule** ; e-mail = brouillon `.eml` ; gamification supprimée ;
missions PMR en lecture seule depuis DICOS ; tutoiement.

**Règles de base**
- **BACO reste en production et on n'y touche pas.** Supabase en **lecture seule**. Le SvelteKit à la racine ne se modifie pas.
- Mobile obligatoire (1440×900 et 390×844, Playwright 1.56.1, Chromium de `/opt/pw-browsers`).
- Garde de droits dans chaque `page.tsx` ; données par `src/server/data` avec le jeton de l'agent ; Server Actions zod.
- Données personnelles jamais dans Git, une capture ou un artefact publié.
- Coolify : projet **CSM** seulement ; un push redéploie déjà (jamais de `POST /deploy` en plus) ; changer la branche
  déployée vers ta branche de session en début de session. **Jamais le marqueur d'omission de CI dans un message de commit.**
- `git pull` avant de pousser (le job `sign-firefox` commite le `.xpi` signé).
- Tenir à jour dans le même commit `CLAUDE.md`, `web/CLAUDE.md`, `pocketbase/CLAUDE.md`, `docs/CSM-V2.md`,
  `docs/DEPLOIEMENT-V2.md` et ce fichier.

**Ce que je veux dans cette session : préparer la bascule (étape 9)**
1. Recueillir la validation d'Équipe et Admin et corriger les retours.
2. Rendre l'import des référentiels reproductible (aujourd'hui un script de scratchpad) dans `csm-import`.
3. Répétition complète de la bascule sur une copie : gel de BACO, sauvegarde Supabase, import, vérifications chiffrées,
   liste de contrôle `docs/BASCULE.md`, domaine de production (`csm.fs0ciety.org`), plan de retour arrière.
4. Restreindre l'accès à `pb-test-csm` (Cloudflare Access ou IP) et tester une restauration depuis R2.

Rappels à me faire en début de session : correctifs SQL BACO non appliqués (`20261008130000_hotfix_followup.sql`,
`20261008140000_pn_data_update_fix.sql`), protection des mots de passe compromis, réponses du DPO, retrait de
`CSM_DICOS_TOKEN` quand toutes les extensions sont en 1.7.0, jeton DICOS et cookies ATMS collés en conversation à invalider.
