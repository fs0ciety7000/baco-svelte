# Message de lancement — session CSM v2 n° 5

À copier tel quel dans une nouvelle session Claude Code, sur le dépôt `fs0ciety7000/baco-svelte`, dans
l'environnement cloud **CSM**.

**Avant de lancer** (côté utilisateur) :
- **Cloudflare Access** sur `pb-csm.fs0ciety.org` (PocketBase de production) ;
- **SMTP** (Brevo conseillé) : variables `CSM_SMTP_HOST`, `CSM_SMTP_PORT`, `CSM_SMTP_USER`, `CSM_SMTP_PASSWORD`,
  `CSM_MAIL_SENDER` (+ `CSM_MAIL_SENDER_NAME`) sur `csm-pocketbase-prod` (et sur `csm-pocketbase` pour la preview), puis
  redéploiement ; domaine d'envoi authentifié (DKIM / SPF / DMARC dans Cloudflare) ;
- domaines autorisés de l'environnement : ceux de `docs/ENVIRONNEMENT-CLOUD.md` + `csm.fs0ciety.org`, `pb-csm.fs0ciety.org`.

---

Tu reprends **CSM v2**, en **production depuis le 10 octobre 2026** : https://csm.fs0ciety.org (branche `csm-prod`) ;
la preview https://test-csm.fs0ciety.org suit la branche de session. Lis d'abord `CLAUDE.md` (§1 état, §6 contraintes,
§7 pièges — en particulier « deux instances » et « bucket R2 = une instance »), `docs/DEPLOIEMENT-V2.md` (§1 prod),
`web/CLAUDE.md`, `pocketbase/CLAUDE.md`.

Règles : on développe et on valide sur la **preview** ; la prod n'avance (avance rapide de `csm-prod`) que sur demande de
l'utilisateur ; jamais de test destructif, de données fictives, de `test-rules.mjs` ni d'E2E contre `pb-csm` ; Supabase
reste en lecture seule ; BACO n'est plus mis à jour (gel à confirmer par l'utilisateur).

À faire / en attente :
1. **Après le SMTP** : envoi test puis envoi de la campagne « BACO devient CSM » (Administration › Campagnes) — décision
   de l'utilisateur ; tester le « mot de passe oublié » en prod.
2. Accompagner les agents : reconnexion de l'extension DICOS (nouveaux jetons en prod), passkeys à recréer sur
   `csm.fs0ciety.org`.
3. **Lot suivant proposé : Quinyx** (tableau de service → qui est en poste) : cadrer l'accès (API Quinyx avec
   identifiants délivrés par l'IT, ou flux iCal par agent), stockage minimal (pas de données RH superflues), DPO.
4. Restes connus : E2E dédiés aux sessions / statut / campagnes, correctifs BACO non appliqués (`supabase/migrations/
   20261008130000_*`, `20261008140000_*`) devenus sans objet si BACO est gelé.
