# Message de lancement — session CSM v2 n° 5

À copier tel quel dans une nouvelle session Claude Code, sur le dépôt `fs0ciety7000/baco-svelte`, dans
l'environnement cloud **CSM**.

**Avant de lancer** (côté utilisateur) : rien d'obligatoire. Cloudflare Access et SMTP (Stalwart) sont en place
depuis le 10 oct. ; pour la bascule, garder l'archive chiffrée de la sauvegarde Supabase du 10 oct. (base de
`csm-import-delta`).

---

Tu reprends **CSM v2**, en **production depuis le 10 octobre 2026** : https://csm.fs0ciety.org (branche `csm-prod`) ;
la preview https://test-csm.fs0ciety.org suit la branche **`csm-preview`** (y intégrer le travail de la session ; `csm-prod`
avance depuis `csm-preview`, sur demande). Lis d'abord `CLAUDE.md` (§1 état, §6 contraintes,
§7 pièges — en particulier « deux instances » et « bucket R2 = une instance »), `docs/DEPLOIEMENT-V2.md` (§1 prod),
`web/CLAUDE.md`, `pocketbase/CLAUDE.md`.

Règles : on développe et on valide sur la **preview** ; la prod n'avance (avance rapide de `csm-prod`) que sur demande de
l'utilisateur ; jamais de test destructif, de données fictives, de `test-rules.mjs` ni d'E2E contre `pb-csm` ; Supabase
reste en lecture seule ; BACO n'est plus mis à jour (gel à confirmer par l'utilisateur).

À faire / en attente :
1. **Bascule** : date de gel de BACO à fixer par l'utilisateur, puis import différentiel (`docs/DEPLOIEMENT-V2.md` §7 :
   sauvegarde Supabase en GET seuls, essai à blanc, revue, import réel sur accord) et campagne « BACO devient CSM ».
2. Accompagner les agents : reconnexion de l'extension DICOS (nouveaux jetons en prod), passkeys à recréer sur
   `csm.fs0ciety.org`.
3. **Lot suivant proposé : Quinyx** (tableau de service → qui est en poste) : cadrer l'accès (API Quinyx avec
   identifiants délivrés par l'IT, ou flux iCal par agent), stockage minimal (pas de données RH superflues), DPO.
4. Restes connus : E2E dédiés aux sessions / statut / campagnes, correctifs BACO non appliqués (`supabase/migrations/
   20261008130000_*`, `20261008140000_*`) devenus sans objet si BACO est gelé.
