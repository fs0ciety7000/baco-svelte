# CSM — note pour le DPO : données personnelles et durées de conservation

> Rédigée le 9 octobre 2026 pour validation par le délégué à la protection des données (DPO). Les durées ci-dessous
> sont **appliquées automatiquement** dans CSM (tâche nocturne `pmr-retention`, 3 h 15 UTC), mais restent **à
> confirmer**. Chaque point marqué « À valider » appelle une réponse.

## 1. Contexte

CSM (Client Solutions Management, ex-BACO) est l'outil interne de l'équipe Client Solutions (SNCB) : commandes de bus et
de taxis de remplacement, missions d'assistance aux personnes à mobilité réduite (PMR) et aux groupes, journal
d'exploitation. Il est utilisé par des agents identifiés (compte nominatif, droits par rôle).

Les missions PMR et de groupe proviennent de **DICOS** : une extension de navigateur, installée par l'agent, lit les
missions dans sa session DICOS ouverte et les transmet à CSM. Aucun identifiant SNCB n'est stocké ; chaque agent
s'authentifie auprès de CSM avec un **jeton personnel révocable**.

## 2. Données personnelles traitées

| Catégorie | Données | Personnes concernées | Qui y accède |
|---|---|---|---|
| Voyageurs PMR (missions DICOS) | nom, prénom, téléphone, e-mail, langue, point de rencontre, voiture / porte, accompagnateur, conducteur, type d'assistance (ex. chaise roulante) | voyageurs assistés | agents avec le droit `pmr:read` |
| Fiches clients PMR | nom, téléphone, type d'assistance, remarques | voyageurs PMR réguliers | agents avec `pmr:read` |
| Taxis PMR | copie du nom, du téléphone et du motif sur le bon de commande | voyageurs PMR transportés | agents avec `pmr:read` (masqué sinon, y compris sur le PDF) |
| Groupes (DICOS) | nom, téléphone, e-mail du contact du groupe, point de rencontre | responsables de groupes (écoles…) | agents avec `pmr:read` |
| Comptes agents | nom, e-mail, fonction, district, rôle, empreinte du mot de passe (bcrypt) | agents | administrateurs |
| Journal d'audit | qui a modifié quoi et quand | agents | administrateurs |

Le **type d'assistance** décrit une situation de handicap : c'est une **donnée de santé** au sens de l'article 9 du RGPD.

Les exports (CSV de l'historique, ALEA) ne contiennent **aucun nom**. Aucune donnée personnelle n'est versionnée dans
le code source, ni présente dans les captures d'écran ou les documents de travail.

## 3. Durées de conservation appliquées

| Donnée | Durée | Ce qui se passe ensuite | À valider |
|---|---|---|---|
| Lien entre une mission PMR et une personne (client, réf. DICOS, remarque, motif, détail nominatif DICOS, notes d'historique, journal d'audit) | **12 mois** après le jour de la mission | effacé ; restent les compteurs anonymes (date, gare, type, nombre, statut) pour les statistiques | ☐ |
| Copie PMR sur un bon de taxi (nom, téléphone, motif) | **12 mois** après le trajet | effacée, avec le journal d'audit du bon | ☐ |
| Contact d'un groupe | **12 mois** après le jour du trajet | effacé ; restent les comptages (adultes, enfants, seniors) | ☐ |
| Fiche client PMR sans activité | **24 mois** sans mission ni taxi | **archivée** (masquée des listes, données conservées) ; journal d'audit de plus de 24 mois purgé | ☐ **Archiver ou supprimer ?** |
| Notifications aux agents | 30 jours après lecture, 90 jours au plus | supprimées | ☐ |
| Journal des synchronisations DICOS, horaires ATMS | 60 jours | supprimés (aucune donnée personnelle) | — |
| Jetons de connecteur des agents | jusqu'à révocation par l'agent ou désactivation du compte | supprimés | ☐ |
| Sauvegardes de la base | 1 par nuit, 14 conservées (réglable, `CSM_BACKUP_KEEP`) ; copie hors serveur sur Cloudflare R2 une fois activée + copie locale du volume | écrasées ; une donnée effacée disparaît des sauvegardes après la dernière conservée (14 jours par défaut) | ☐ |

## 4. Mesures de protection

- Accès par compte nominatif ; droits vérifiés côté serveur et dans les règles de la base, pas seulement à l'écran.
- Les données nominatives PMR ne sont lues **que** par les agents qui ont le droit `pmr:read`.
- Le navigateur ne parle qu'au serveur CSM (HTTPS, cookie de session `httpOnly`) ; la base n'est pas appelée directement.
- Compte désactivé : sessions et jetons de l'extension révoqués immédiatement.
- Journal d'audit des modifications (lecture réservée aux administrateurs, sans le détail des collections nominatives à l'export).

## 5. Questions pour le DPO

1. Les durées de 12 mois (lien nominatif des missions, taxis, contacts de groupe) sont-elles adaptées à la finalité
   (organisation de l'assistance, suivi des réclamations) ?
2. Fiches clients PMR inactives depuis 24 mois : **archivage** (actuel) ou **suppression** ?
3. Les agents avec `pmr:read` voient le texte libre (remarques) jusqu'à l'anonymisation : est-ce acceptable ?
4. Faut-il une mention d'information aux voyageurs PMR sur ce traitement (en complément de celle de DICOS) ?
5. Hébergement : serveur auto-hébergé (Coolify) — lieu d'hébergement et sous-traitance à documenter dans le registre ;
   sauvegardes hors serveur chez **Cloudflare R2** (sous-traitant, emplacement UE demandé) : à valider.
