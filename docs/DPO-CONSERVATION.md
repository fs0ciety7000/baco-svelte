# CSM — note pour le DPO : données personnelles et durées de conservation

> Rédigée le 9 octobre 2026 pour validation par le délégué à la protection des données (DPO). Les durées ci-dessous
> sont **appliquées automatiquement** dans CSM (tâches nocturnes `pmr-retention`, 3 h 15 UTC, et `journal-retention`,
> 3 h 50 UTC, ajoutée le 11 oct. 2026), mais restent **à confirmer**. Chaque point marqué « À valider » appelle une réponse.

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
| Horaires Quinyx (14 oct. 2026) | prénom, nom et identifiant Quinyx de l'agent ; jour, début et fin de ses prestations publiées PACO / RCCA / EXTRA (type et lieu, ex. « PACO_AM · PACO Mons ») ; compte CSM rattaché | agents PACO / RCCA (et collègues en EXTRA) | tous les agents de l'équipe (pas l'Invité ni l'Écran) ; configuration et rattachement : administrateurs |
| Horaires des agents de gare (planificateur PMR, 15 oct. 2026) | prénom, nom et identifiant Quinyx ; jour, début et fin des prestations publiées CPI / SPI / OPI / PA / EXTRA, poste et gare de base (déduits du type et de la section, ex. « CPI_AM · CPI MONS ») | agents de gare des dix gares de base (**sans compte CSM**) | agents avec `quinyx:read` (PACO/RCCA, modérateurs, administrateurs) ; le planificateur avec `planner:read` |
| Tâches du planificateur PMR (15 oct. 2026) | n° de dossier DICOS, gare, train, heure, type et nombre de voyageurs (donnée de santé : type d'assistance), agent de gare attribué ; **jamais** le nom ni les coordonnées du voyageur | voyageurs PMR (indirectement, par le n° de dossier) ; agents de gare | agents avec `planner:read` |

**Horaires Quinyx** : seules les prestations de travail publiées sont lues. Les repos, compensations, absences,
congés, visites médicales (IDEWE), commentaires, e-mails et téléphones de Quinyx sont **écartés dans le navigateur**
avant tout envoi, puis une seconde fois par le serveur. Finalité : savoir qui est en service et proposer à chacun son
district du jour (l'agent garde la main) ; aucune évaluation ni contrôle individuel.

**Horaires des agents de gare** (planificateur PMR, décision de l'utilisateur du 15 oct. 2026, revient sur « seulement
l'équipe CSM ») : pour les groupes Quinyx réglés « Gares » par un administrateur, les prestations publiées CPI, SPI,
OPI, PA et EXTRA de **tous** les agents du groupe sont gardées (ils n'ont pas de compte CSM). Même tri qu'au-dessus :
repos, congés, absences, formations et visites médicales (RW, CW, CV, RR, ADA, IDEV…) sont écartés dans le navigateur
puis par le serveur. Finalité : répartir les prises en charge PMR entre les agents en service (remplace les classeurs
Excel où ces horaires étaient recopiés à la main).

**Dossiers DICOS en attente** (planificateur PMR) : l'extension lit la liste « à vérifier » de DICOS et n'envoie que le
n° de dossier, son statut, les trains, gares, heures, sens, type et nombre de voyageurs et la vérification par gare ;
le client, les remarques et le point de rencontre ne quittent jamais DICOS.

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
| Journal d'exploitation (messages des agents et messages iRail, pièces jointes, lectures, historique des modifications) | **24 mois** après la publication du message (tâche `journal-retention`, chaque nuit à 3 h 50 UTC ; réglable par `CSM_JOURNAL_RETENTION_MONTHS`) | supprimés, pièces jointes comprises, avec leurs lignes du journal d'audit ; un message reste tant qu'une de ses réponses est plus récente, une consigne encore épinglée reste | ☐ **À valider** |
| Prestations Quinyx (horaires des agents) | **90 jours** après le jour de la prestation (tâche `quinyx-retention`, chaque nuit à 3 h 25 UTC) | supprimées | ☐ **À valider** |
| Fiche « agent Quinyx » (nom, identifiant Quinyx, compte CSM rattaché) | **180 jours** sans prestation reçue | supprimée avec son rattachement | ☐ |
| Tâches du planificateur PMR (n° de dossier, type et nombre de voyageurs, agent attribué) | **90 jours** après le jour de la tâche (tâche `planner-retention`, chaque nuit à 3 h 35 UTC) | supprimées | ☐ **À valider** |
| Journal des synchronisations DICOS, horaires ATMS | 60 jours | supprimés (aucune donnée personnelle) | — |
| Jetons de connecteur des agents | jusqu'à révocation par l'agent ou désactivation du compte | supprimés | ☐ |
| Sauvegardes de la base | 1 par nuit, 14 conservées (réglable, `CSM_BACKUP_KEEP`) ; copie hors serveur sur Cloudflare R2 une fois activée + copie locale du volume | écrasées ; une donnée effacée disparaît des sauvegardes après la dernière conservée (14 jours par défaut) | ☐ |

## 4. Mesures de protection

- Accès par compte nominatif ; droits vérifiés côté serveur et dans les règles de la base, pas seulement à l'écran.
- Les données nominatives PMR ne sont lues **que** par les agents qui ont le droit `pmr:read`. Depuis les rôles v2
  (11 oct. 2026), ce droit est donné par défaut aux rôles **PACO/RCCA** et **Modérateur** : les 14 anciens agents
  Otto (C3), qui n'y avaient pas accès dans BACO, y accèdent désormais (décision confirmée de l'utilisateur). L'admin
  peut le retirer compte par compte (droit « PMR nominatif : Lecture » retiré). L'**Invité** n'y a jamais accès.
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
6. Élargissement de l'accès au nominatif PMR aux agents C3 (rôles v2, voir §4) : à valider au regard du besoin
   d'en connaître.
7. Journal d'exploitation (ajouté le 11 oct. 2026) : les messages peuvent citer un voyageur, un agent ou un incident
   et porter des pièces jointes (photos, PDF). Durée proposée et appliquée : **24 mois** après la publication, puis
   suppression définitive (messages, pièces jointes, lectures, historique, audit). Cette durée couvre-t-elle le besoin
   (suivi des incidents, réclamations, retours d'expérience) sans excéder la finalité ? Une durée plus courte pour les
   pièces jointes est-elle souhaitable ?
8. Horaires Quinyx (ajoutés le 14 oct. 2026) : les prestations publiées des PACO / RCCA sont visibles de toute
   l'équipe dans CSM (comme dans Quinyx pour les membres du groupe). Durée proposée : **90 jours**, puis suppression.
   Faut-il une information des agents (note de service) ? La lecture se fait avec la session Quinyx d'un agent qui a
   déjà accès au planning de son groupe ; aucune donnée d'absence ni de santé n'est reprise. Seuls les horaires des
   agents qui ont un compte CSM de l'équipe (PACO/RCCA, modérateur, administrateur) sont gardés ; pour les autres
   agents du groupe Quinyx, seuls le prénom et le nom sont enregistrés (rattachement manuel par l'admin), fiche
   supprimée après 180 jours.
9. Planificateur de tâches PMR (15 oct. 2026) : les horaires des **agents de gare** (sans compte CSM) des groupes
   Quinyx « Gares » sont gardés 90 jours et visibles des PACO/RCCA qui planifient ; les tâches (n° de dossier, type
   d'assistance, agent attribué) sont gardées 90 jours. Faut-il informer les agents de gare (note de service) ? La durée
   de 90 jours est-elle adaptée (suivi d'une réclamation sur une prise en charge) ? Une feuille de tâches par agent
   (lien ou PDF, lot P4) pourra porter le nom du voyageur : à trancher.
