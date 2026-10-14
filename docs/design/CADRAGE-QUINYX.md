# Cadrage — horaires Quinyx dans CSM

> Demande de l'utilisateur (14 oct. 2026) : « capturer les horaires depuis Quinyx, sans accès API. Dans un premier
> temps : les prestations alignées et publiées de tous les PACO / RCCA (`PACO_AM PACO MONS`, `RCCA_PM RCCA MONS`,
> `EXTRA OCC SO`…). But final : relier chaque horaire à un compte CSM, savoir quand l'agent travaille et déterminer
> son district automatiquement (il peut en changer). »

## 1. Contraintes

- **Aucun accès API** à Quinyx (pas de clé, pas de compte de service) : seule la session web d'un agent connecté.
- L'application `https://web.quinyx.com` appelle son API interne en même origine (`/extapi/v1/…`), authentifiée par
  des **cookies httpOnly** ; en-têtes envoyés : `x-app-version`, `x-current-group: <groupe>`, `x-requested-with: love`.
- Les identifiants Quinyx (groupes, employés) et les noms **n'entrent jamais dans Git** ni dans un artefact publié.
- Les cookies de session collés dans la conversation de référence (et présents dans les fichiers HAR transmis) ne
  sont **jamais utilisés** ; l'utilisateur est invité à se déconnecter de Quinyx pour les invalider.

## 2. Solution retenue : l'extension CSM (même principe que DICOS et ATMS)

L'extension déjà installée chez les agents (« CSM — Connecteur DICOS », **1.8.0**) reçoit un module Quinyx :

1. `src/quinyx-inject.js` (monde MAIN, `document_start`) relève la valeur de `x-app-version` envoyée par
   l'application (numéro de version, rien de secret) ; ni cookie ni corps lus.
2. `src/quinyx.js` (onglet Quinyx, même origine, `credentials: include`) lit pour chaque groupe :
   - `GET /extapi/v1/schedule/publish-date/by-group/<g>` → date de publication ;
   - `GET /extapi/v1/organisation/group/<g>/sections` → sections (« PACO Mons », « RCCA Mons ») ;
   - `GET /extapi/v1/schedule/shifttypes/by-group/<g>/with-cross-scheduling-local-shifttypes?startDateTime&endDateTime`
     → types de prestation (« PACO_AM », « PACO_N », « RCCA_PM », « EXTRA - OCC SO »…) ;
   - `GET /extapi/v1/shifts/by-group/<g>?startDate&endDate` → prestations (`id`, `groupId` = groupe ou section,
     `begin` / `end` en heure locale sans décalage, `shiftTypeId`, `status`, `employeeId`…) ;
   - `GET /extapi/v2/employee/workersof/by-group/<g>?startDate&endDate` → agents (seuls `id`, prénom, nom gardés).
   Période : de J-7 à la veille de la date de publication, 60 jours au plus.
3. **Tri dans le navigateur** : seulement les prestations `ASSIGNED` à un agent, de type PACO_… / RCCA_… / EXTRA…,
   avant la date de publication. Repos, compensations, absences, visites médicales (IDEWE), commentaires, e-mails et
   téléphones ne quittent jamais la page.
4. Le service worker demande à CSM la liste des groupes (`GET /api/equipe/quinyx/config`) et envoie un lot par groupe
   (`POST /api/equipe/quinyx/ingest`) avec le **jeton de connecteur personnel** existant (`x-dicos-token`).
5. Déclenchement : à l'ouverture d'une page de planning Quinyx (au plus toutes les 3 h) ou par le bouton
   « Synchroniser le planning Quinyx » du popup.

**Côté CSM** (source unique, testée) : `web/src/lib/quinyx/model.ts` retrie et convertit (`mapQuinyxBatch`) ; l'ingestion
(`web/src/server/quinyx-ingest.ts`) est idempotente (identifiant de prestation Quinyx unique), borne le corps (2 Mo, 5 000
prestations, 62 jours) et le débit (20 lots / min / jeton), refuse un groupe non configuré, et sur un lot complet
retire les prestations de la période disparues de Quinyx (désaffectées, supprimées, changées en repos), avec trois
garde-fous (revues du 14 oct.) : seulement pour les **agents que le compte Quinyx de l'expéditeur voit** (`visible`,
identifiants sans nom : un compte qui ne voit que ses prestations n'efface pas celles des collègues), seulement dans
les **sections reçues**, et jamais plus de **30 %** de la période d'un coup (au-delà : « retraits suspendus », rien
n'est retiré). Un lot tronqué (> 1 500 prestations) part `complete: false`. Un seul lot à la fois par groupe ; une
synchro avec une erreur ne met pas à jour la date « synchronisé il y a… ». Période acceptée : J-10 à J+70, 62 jours
au plus ; heures validées, prestation de plus de 24 h ignorée.

**Seulement l'équipe CSM** (précision de l'utilisateur, 14 oct.) : une prestation n'est gardée que si son agent est
rattaché à un compte CSM PACO/RCCA, Modérateur ou administrateur (ou, avant validation, proposé pour un tel compte par
le nom). Les autres (collègues sans compte CSM) : prénom et nom seuls, pour que l'admin puisse les rattacher à la main ;
leurs prestations déjà stockées sont retirées. Le popup affiche « N hors équipe CSM ».

**Partage** : les horaires synchronisés par un agent sont enregistrés dans CSM et visibles de toute l'équipe ; chaque
synchro les met à jour. Il suffit qu'un agent qui voit le planning complet du groupe ouvre Quinyx (au plus toutes les
3 h) pour que tous en profitent.

**Risque résiduel accepté** (comme pour DICOS) : tout agent qui a un jeton de connecteur (PACO / RCCA) peut envoyer un
lot forgé pour un groupe configuré ; les garde-fous ci-dessus en limitent l'effet (période bornée, 30 %, nom d'un agent
rattaché figé, rattachement validé par un admin). Un droit dédié « Quinyx » pourra être ajouté si besoin.

Écartés : lecture des cookies par l'extension ou par le serveur (interdit, non nécessaire) ; export iCal par agent (pas
de vue d'équipe, 1 lien par agent à gérer) ; saisie manuelle (doublon).

## 3. Données captées (minimum nécessaire)

| Donnée | Usage |
|---|---|
| agent : identifiant Quinyx, prénom, nom | correspondance avec le compte CSM |
| jour, début, fin (heure de Bruxelles → UTC) | qui est en service, fin de service réelle |
| code de prestation et section (« PACO_AM · PACO Mons ») | type (AM / PM / Nuit / Extra) et district |
| district (calculé) | district du jour proposé, filtre du planning |

Rien d'autre. Conservation : **90 jours** après la prestation, fiche agent supprimée après **180 jours** sans
prestation (`quinyx-retention`) — à valider par le DPO (`docs/DPO-CONSERVATION.md`).

## 4. Modèle de données (`1760004200_quinyx.js`)

- `quinyx_groups` : groupe Quinyx à lire (numéro saisi par un admin, jamais dans Git), nom, district par défaut,
  activé, état de la dernière synchro (écrit par le connecteur, qui ne peut pas changer le reste).
- `quinyx_places` : table « lieu → district », amorcée avec les réponses de l'utilisateur : **MONS → DSO,
  OCC SO → DSO, NAMUR → DSE, OCC SE → DSE**. District d'une prestation = le lieu le plus long trouvé en mots entiers
  dans « code + section », sinon dans le nom du groupe, sinon le district par défaut du groupe.
- `quinyx_agents` : identifiant Quinyx, prénom, nom, compte CSM **proposé** (nom complet identique, accents / casse /
  ordre ignorés, une seule correspondance) et compte **rattaché** + `confirmed` (admin seulement).
- `quinyx_shifts` : une fiche par prestation (identifiant Quinyx unique, groupe, agent, jour, début, fin, code,
  section, type, district).

Droits : planning lisible par tous les agents actifs **sauf Invité et Écran** ; écriture des horaires par le
connecteur seul (`connector` + `dicos:write`) ; configuration et rattachement par admin / sysop. 34 contrôles de
règles (`pocketbase/scripts/test-rules.mjs`).

## 5. Écrans

- **Équipe › Planning** (`/equipe/planning`) : vue **Jour** (blocs Matin / Après-midi / Nuit / Extra, nuit de la
  veille tant qu'elle n'est pas finie, « En service », district, « (toi) ») et **Semaine** (grille agents × jours en
  desktop, un bloc par jour en mobile), filtre district, veille / lendemain, fraîcheur par groupe (alerte au-delà de
  24 h).
- **Administration › Quinyx** (`/admin/quinyx`) : groupes (coller l'adresse `…/schedule/<n°>` suffit), lieux →
  districts, agents à rattacher (« Valider », « Valider les N propositions », « Détacher » ; un compte = un agent).
- **Accueil, widget « Fin de service »** : sans choix manuel, l'horaire réel du jour (« Selon Quinyx : PACO_AM · PACO
  Mons · 06:00 – 14:00 ») remplace les horaires supposés.
- **Districts du jour** : tant que l'agent n'a pas coché ses districts du jour, la fenêtre propose celui de sa
  prestation Quinyx (DSO / DSE / DCE) ; l'agent garde la main.

## 6. Limites connues

- Une prestation qui remonte par deux groupes configurés (groupe et une de ses sections) change de groupe à chaque
  synchro : ne configurer que le groupe parent (la page « schedule » de Quinyx).
- Le badge « En service » est calculé à l'ouverture de la page (pas de mise à jour à la minute) ; le widget « Fin de
  service » garde la prestation chargée à l'ouverture de l'accueil (recharger après minuit).
- Date de publication : la plus prudente de `publishDate` / `unitPublishDate`, traitée comme exclue (question 1).

## 7. Questions ouvertes pour l'utilisateur

1. **Date de publication** : Quinyx renvoie « publié jusqu'au 15/11 ». CSM la traite comme **exclue** (prestations du
   14/11 et avant). Le 15/11 est-il déjà publié ? (si oui, une ligne à changer.)
2. **EXTRA** : les prestations « EXTRA - OCC SO » de 9 h à 17 h comptent-elles comme « en service » ? (oui aujourd'hui.)
3. **Autres groupes** : OCC SE (DSE) à ajouter dans Administration › Quinyx ; d'autres districts (DCE…) et leurs lieux ?
4. **Horaires AM / PM / Nuit** : Quinyx donne 6-14 / 14-22 / 22-6 pour PACO_AM / PM / N — les heures supposées du
   widget étaient donc justes ; le widget prend maintenant l'horaire réel quand il existe.
5. **Visibilité** : le planning de toute l'équipe visible de tous les PACO / RCCA, comme dans Quinyx ? (oui aujourd'hui.)
6. Faut-il garder plus de J-7 en arrière (historique), ou au contraire moins de 90 jours ?
