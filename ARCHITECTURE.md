# ARCHITECTURE.md

> Architecture technique V1. `PRD.md` reste la source de vérité produit.

## 1. Principes et stack

-   TypeScript end-to-end.
-   SvelteKit + Node.js LTS + pnpm + `@sveltejs/adapter-node`.
-   Web responsive + PWA installable, **online-only**.
-   Monolithe modulaire, server-authoritative ; le navigateur ne parle
    jamais directement à PostgreSQL.
-   PostgreSQL + Drizzle ; migrations SQL versionnées et relues.
-   Better Auth + GitHub OAuth uniquement ; allowlist par GitHub user ID
    stable ; aucun signup.
-   Tailwind CSS + Bits UI + Lucide Svelte ; JetBrains Mono comme
    direction initiale.
-   Zod aux frontières ; règles métier dans domain/application.
-   Temporal pour les calculs calendaires.
-   Vitest + PostgreSQL réel + Playwright ; ESLint + Prettier +
    `svelte-check`.
-   Docker Compose en production sur le serveur privé du propriétaire ;
    PostgreSQL auto-hébergé avec stockage persistant et sauvegardes hors serveur.
-   CI/CD GitHub Actions ; images de production publiées sur GHCR.
-   Jev via l'API Decisions d'OpenRouter, appelé uniquement par le
    serveur pour classifier les captures du Collector.

## 2. Architecture logique

``` text
Browser/PWA
  -> SvelteKit routes/UI
  -> application use cases
  -> domain rules
  -> repositories
  -> Drizzle
  -> PostgreSQL

application use cases
  -> Jev client (server-only)
  -> OpenRouter Decisions API
```

Dépendances : `routes/UI -> application -> domain` et
`application -> repositories -> database`. Le domaine ne dépend ni de
SvelteKit, ni de Drizzle, ni du réseau. Repository pattern léger, sans
abstractions spéculatives. Pas de microservices, monorepo, GraphQL, tRPC
ou API REST générale V1.

## 3. Repository

``` text
src/
  routes/
  lib/
    components/
    domain/{tasks,projects,checkpoints,recurrence}/
    server/{application,repositories,db,auth,search}/
  hooks.server.ts
tests/{integration,e2e}/
scripts/doctor.ts
drizzle/migrations/
static/
PRD.md
ARCHITECTURE.md
docker-compose.yml
Dockerfile
package.json
```

Tests unitaires colocalisables avec le code.

## 4. Client / serveur

Chargement serveur lorsque pertinent, notamment Home : compte des
classifications à revoir et des captures en échec, Late, In Progress,
Today. Aucun state manager/cache global V1.

Mutations : UI réactive mais succès seulement après confirmation serveur
:

``` text
action -> Saving… -> server OK -> Saved
                     server KO -> Save failed · Retry
```

Le contenu local saisi n'est jamais perdu sur échec. La confirmation de
persistance de l'Entry autorise le vidage du Collector même si Jev échoue
ensuite. Le navigateur suit séparément l'état du classement pour afficher
une notification du type et du rattachement éventuel ; l'échec reste
visible et relançable depuis le Collector ou la section « Non classées » de Revue.

## 5. Validation et invariants

Zod valide formulaires/payloads/params. Il ne porte pas les règles
métier.

Invariants simples : domaine/application + contraintes PostgreSQL
(`CHECK`, FK, `NOT NULL`) quand lisibles. Invariants relationnels
complexes : use cases transactionnels. **Aucun trigger métier.**

## 6. Modèle de données

Quatre tables métier : `entries`, `projects`, `checkpoints`, `tasks`.

Le schéma initial est régénéré pendant la slice de simplification. Les
environnements de développement existants sont recréés avec
`pnpm db:reset:dev` : cette opération efface toutes leurs données, y
compris les sessions. Elle n'est pas une migration de production.

Absents : routines, occurrences, subtasks, checklist items, tags,
workspaces, memberships, priorities, dépendances.

### entries

`id`, `capture_request_id UUID? UNIQUE`, `raw_content TEXT`,
`requested_due_date DATE?`,
`classification_state(pending|failed|classified)`,
`classification_source(jev|manual)?`, `task_id?`, `project_id?`,
`classified_at?`, `reviewed_at?`, `jev_model?`,
`type_probability?`, `relation_probability?`, `created_at`,
`updated_at`, `deleted_at?`.

Une Entry est conservée après classification. Parmi `task_id` et
`project_id`, exactement un est renseigné si l'état est
`classified`, aucun sinon. Ces deux colonnes sont des FK vers les
objets métier et le `CHECK` correspondant rend l'association vérifiable
en base. `classification_source` et `classified_at` sont renseignés si
et seulement si l'état est `classified`. `reviewed_at` n'est renseigné
que pour une Entry classifiée par Jev. Les probabilités stockées sont
comprises entre 0 et 1.

`capture_request_id` est fourni par le navigateur et sert de clé
d'idempotence, y compris pour un choix manuel. Les anciennes Entries
peuvent garder `NULL` ; aucune capture historique déjà supprimée lors
d'une ancienne classification ne peut être reconstituée. Pas de
`source_entry_id` sur les deux tables cibles.

`requested_due_date` est une intention facultative de la capture, pas
une date d'exécution de l'Entry. Le navigateur retire le préfixe slash
du texte, calcule la date locale et envoie les deux valeurs séparément.
La clé d'idempotence doit retrouver le même texte et la même date.

Les requêtes ordinaires de la section « Non classées » de Revue ne prennent que les Entries
`pending|failed` non supprimées ; la Revue prend les Entries
`classified` par Jev, y compris celles avec `reviewed_at`, sauf si la
Task ou le Project lié est `done` ou `cancelled`. Le compteur des
classifications à revoir applique le même filtre. L’Entry reste persistée
et redevient visible si l’objet est rouvert.

### projects

`id`, `title`, `description?`,
`status(planned|active|paused|done|cancelled)`, `start_date?`,
`due_date?`, `started_at?`, `completed_at?`, timestamps, `deleted_at?`.

`TO_BUILD` est calculé : Project ouvert sans Task ni Checkpoint.

### checkpoints

`id`, `project_id NOT NULL`, `title`, `description?`,
`status(open|done|cancelled)`, `target_date?`, `position`,
`completed_at?`, timestamps, `deleted_at?`.

### tasks

`id`, `project_id?`, `checkpoint_id?`, `title`, `description?`,
`status(todo|in_progress|done|cancelled)`, `scheduled_date?`,
`scheduled_time?`, `due_date?`, `due_time?`, `recurrence_rule JSONB?`,
`recurrence_anchor_date?`, `position?`, `completed_at?`,
`cancelled_at?`, timestamps, `deleted_at?`.

Intentions utilisateur : PostgreSQL `DATE + TIME?`. Historique système :
`TIMESTAMPTZ`.

Contraintes : - `scheduled_time => scheduled_date` -
`due_time => due_date` - `recurrence_rule => scheduled_date` -
`recurrence_rule => due_date IS NULL AND due_time IS NULL` - si
`checkpoint_id`, son Project doit être celui de la Task (use case
transactionnel).

## 7. Ordre et transactions

`position` est un ordre visuel local au Project, jamais une priorité.
Task autonome : `position = NULL`. Entiers simples V1.

Opérations multi-écritures atomiques : - `moveTask`: changer Project,
retirer Checkpoint incompatible, ajuster position ; - `deleteProject`:
soft-delete Project, détacher Tasks, soft-delete Checkpoints ; -
`classifyEntry`: créer objet cible + marquer et lier l'Entry ; -
`correctJevClassification`: remplacer l'objet cible si le type change,
mettre à jour l'Entry et soft-delete l'ancien objet. Aucun appel réseau
n'a lieu dans une transaction PostgreSQL.

## 8. Trash

Soft delete via `deleted_at TIMESTAMPTZ NULL`. Restore : `NULL`. Purge :
suppression physique confirmée.

-   delete Project -\> Tasks autonomes, Checkpoints
    supprimés/soft-deleted
-   delete Checkpoint -\> Tasks conservées, `checkpoint_id=NULL`
-   delete Task -\> Task uniquement

Repositories normaux excluent les soft-deleted.

Une Entry de Revue garde son lien vers un objet soft-deleted et affiche
son état supprimé. Lors de la purge physique d'un objet classifié, la
transaction purge aussi toute Entry liée après confirmation, afin de ne
pas laisser de FK orpheline. La correction de type utilise un soft delete de
l'ancien objet ; cette ancienne version relève ensuite des règles de
Trash.

## 9. `pnpm doctor`

Diagnostic **read-only**, jamais dépendance du boot :

``` text
pnpm doctor
pnpm doctor --verbose
```

Vérifie connexion/migrations, liens orphelins, cohérence
Task/Project/Checkpoint, invariants récurrence/dates, références vers
soft-deleted hors liens historiques de Revue, positions invalides et
cohérence Entry/objet classifié.
`--verbose` donne les IDs. `--fix`
hors scope V1.

## 10. Récurrence

Aucun cron, worker, queue, scheduler, table/historique d'occurrences.
Une seule instance courante.

`recurrence_rule` : union TypeScript restreinte stockée en JSONB : -
daily + interval - weekly + interval + weekdays - monthly + interval +
day

Pas de RRULE complète.

`recurrence_anchor_date` est distincte de `scheduled_date` afin qu'un
postpone ne déplace jamais la cadence.

Moteur pur sans I/O :

``` text
getNextRecurrenceDate({ rule, anchorDate, currentScheduledDate, completionDate })
```

Calcul avec `Temporal.PlainDate`.

Tests exhaustifs : daily, weekdays, N weeks, changements mois/année,
28/29/30/31, février/bissextile, avance, retard important, postpone,
cancel/reopen. Jour mensuel inexistant -\> dernier jour du mois. Retard
important -\> prochain créneau futur conforme à l'ancre.

## 11. Recherche

PostgreSQL uniquement. `searchGlobal(query)` sur `title + description`
de Tasks/Projects/Checkpoints ; Entries hors recherche globale.

V1 : `ILIKE`, titre prioritaire, pas de fuzzy garanti. Command palette
avec debounce et résultats limités par type. Repository conçu pour
évoluer vers FTS/GIN/`pg_trgm` sans changer l'UI. Aucun
Meilisearch/Typesense/Elastic.

## 12. Markdown

Source Markdown stockée telle quelle. V1 : textarea/éditeur léger +
rendu sécurisé. Pas de WYSIWYG lourd ; HTML brut désactivé.

Support : headings, paragraphes, emphase, liens, listes, task lists,
inline/code blocks.

Checkbox interactive = transformation pure du texte `- [ ]` \<-\>
`- [x]`, puis autosave. Aucun `ChecklistItem`; aucune influence sur le
statut parent.

## 13. UI

Tailwind pour le style ; Bits UI seulement pour primitives complexes ;
Lucide unique pour les icônes ; JetBrains Mono initialement global.

Les deux palettes sont définies par les variables de couleur Tailwind sur
`html[data-theme]`. Le document démarre en mode sombre ; un court script dans
`app.html` rétablit le choix `localStorage` avant le premier rendu. Un contrôle
partagé sur la connexion et le shell change le thème sans requête serveur.

`Cmd/Ctrl+K` : recherche/navigation/actions limitées : Revue, Tasks,
Projects, New Task/Project, recherche. Pas de système de
plugins.

La navigation principale mène à `Revue`, qui expose un filtre « Non classées »
quand une capture attend un classement. Le traitement manuel reste dans cette
page ; aucune route Inbox distincte n'est conservée.

## 14. Auth et sécurité

GitHub OAuth + Better Auth :

``` text
GitHub identity -> stable ID == OWNER_GITHUB_ID ? session : 403
```

HTTPS, cookies sécurisés HttpOnly/SameSite adaptés, CSRF, authorization
server-side sur toutes routes/actions privées, aucun secret client,
security headers. Pas de `user_id` artificiel sur chaque table métier.

## 15. Tests et CI/CD

Vitest : domaine/récurrence/invariants/Markdown. Intégration : vrai
PostgreSQL, migrations/transactions/use cases (`classifyEntry`,
`correctJevClassification`, `retryJevClassification`,
`deleteProject`, `restoreProject`, `moveTask`, `completeRecurringTask`,
`searchGlobal`). Playwright : login, capture-\>Revue, correction de
classification, échec Jev-\>section « Non classées » de Revue-\>Retry, Project+Task,
Done, récurrence, traitement séquentiel des captures non classées, Cmd+K, smoke mobile.

Les tests Jev en CI injectent un faux client : réponse valide, réponse
invalide, erreur réseau, timeout, décision incertaine, IDs candidats
invalides, relance et requêtes concurrentes. Un smoke test manuel avec
clé réelle est optionnel ; aucune clé n'est stockée dans le dépôt ou CI.

Pas de tests composants systématiques ni objectif global de coverage.
Toute règle métier non triviale a un test ; tout bug métier corrigé
reçoit un test de régression.

CI :

``` text
install -> lint -> typecheck -> unit
-> PostgreSQL -> migrations -> integration
-> build -> E2E desktop/mobile/WebKit
```

`pnpm check` agrège les checks locaux. La CI s'exécute sur les runners
hébergés par GitHub pour les pushes et pull requests, avec une base de
test isolée et sans secrets de production.

Après réussite de tous les contrôles sur un commit de `main`, GitHub
Actions construit et teste l'image Docker, puis la publie dans GitHub
Container Registry (GHCR) avec le SHA du commit. Le déploiement utilise
son digest immuable et conserve le digest de la version précédente.
Le build ne reçoit aucun secret applicatif de production.

Le job CD utilise un runner hébergé par GitHub, connecté au VPN privé
par un pair WireGuard dédié (`10.8.0.250/32`) ; il rejoint le serveur
par SSH sur `10.8.0.1`. Aucun runner auto-hébergé n'est enregistré sur
ce dépôt public. Aucun job de pull request ne reçoit les secrets de
déploiement ; seuls les commits validés de `main` peuvent déclencher
un déploiement. Le tunnel est fermé et sa configuration supprimée en
fin de job. Les permissions GitHub et SSH sont limitées aux besoins de
publication et de déploiement ; la clé hôte SSH est vérifiée.

Les déploiements sont sérialisés : un seul à la fois, sans interrompre
une migration en cours. Une relance manuelle via GitHub Actions permet
de redéployer une image déjà validée. La publication GHCR suit la
[documentation GitHub](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).

## 16. Observabilité

Logs structurés : timestamp, level, request_id, event, duration, error.
Ne pas logger titres/descriptions/contenu utilisateur.

Sentry ou équivalent seulement quand l'usage prod le justifie.

-   `/health` : processus vivant
-   `/ready` : app + DB accessibles
-   `pnpm doctor` : intégrité métier

## 17. PWA / offline

PWA installable mais online-only. Aucun cache métier offline, queue de
mutations, sync différée ou résolution de conflits. Une saisie n'est
jamais effacée avant confirmation de persistance.

## 18. Déploiement

SvelteKit `adapter-node` dans une image Docker multi-stage Node.js 24,
exécutée sans privilèges. Docker Compose orchestre l'application et
PostgreSQL sur le serveur privé du propriétaire, accessible depuis sa
machine par l'alias SSH `ssh-maison`. Cet alias local n'est pas supposé
exister sur le runner : l'accès de déploiement y est configuré séparément.

Environnements : `local`, `CI`, `production`; pas de staging permanent.
Local : PostgreSQL via Docker, app native avec `pnpm dev`. En production,
PostgreSQL utilise un volume persistant et un réseau Docker privé ; son
port n'est pas exposé à Internet. Le déploiement ne supprime aucun volume.

Un reverse proxy termine HTTPS et transmet les requêtes à l'application.
L'accès utilisateur est limité au VPN WireGuard existant. Nginx dans
Compose termine HTTPS sur `10.8.0.1:443`, avec un certificat signé par
une CA privée dont le certificat public doit être approuvé sur les
appareils du propriétaire. Les clés privées de cette CA restent hors
serveur. Aucun port applicatif n'est ouvert sur l'adresse publique. Les accès desktop et
mobile, l'URL de callback GitHub OAuth, `ORIGIN` et `BETTER_AUTH_URL`
doivent être cohérents avec l'URL HTTPS retenue.

### Séquence de déploiement et retour arrière

1. Télécharger l'image GHCR par digest et conserver la référence précédente.
2. Vérifier la sauvegarde et appliquer les migrations versionnées dans
   un conteneur ponctuel de la nouvelle image, avant de remplacer l'app.
3. Arrêter le déploiement si une migration échoue ; ne pas remplacer l'app.
4. Démarrer la nouvelle version et vérifier `/ready` avec une attente bornée,
   puis un smoke test HTTP via le proxy HTTPS.
5. En cas d'échec après remplacement, rétablir l'image précédente si le
   schéma reste compatible, vérifier sa disponibilité et signaler l'échec
   dans GitHub Actions. Au premier déploiement, l'absence de version
   précédente est signalée explicitement.

Le retour arrière de l'application ne restaure pas PostgreSQL. Les
migrations doivent rester compatibles avec la version précédente ; une
migration incompatible demande une procédure explicite de maintenance
et de récupération avant déploiement. Aucun reset de développement ni
migration inverse automatique en production.

### Sauvegardes et exploitation

Sauvegarde PostgreSQL quotidienne automatisée avec `pg_dump`, et avant
une migration de production. Les archives sont chiffrées en CMS avec
AES-256-GCM et un certificat RSA public ; la clé privée de déchiffrement
reste sur l’ordinateur du propriétaire, hors du serveur. Les archives
sont conservées 30 jours sur le serveur. Le propriétaire synchronise
les copies chiffrées sur son ordinateur lorsqu’il est connecté, via
`scripts/pull-backups.sh` ; une copie immédiate hors serveur ne bloque
pas le déploiement. Jusqu’à cette synchronisation, une panne du disque
du serveur peut perdre les dernières sauvegardes. Les copies téléchargées
sont conservées jusqu’à suppression explicite par le propriétaire.
Une restauration est testée sur une base isolée avant clôture de la
slice, sans écraser la production. L'automatisation des sauvegardes est
une tâche d'exploitation, indépendante du moteur de récurrence métier.

La disponibilité dépend du serveur et de son réseau. Documenter les
procédures de déploiement manuel, retour arrière, sauvegarde,
restauration et diagnostic. `/health` contrôle le processus ; `/ready`
contrôle aussi PostgreSQL ; `pnpm run doctor` reste un diagnostic en
lecture seule, pas une dépendance du démarrage.

Secrets applicatifs uniquement sur le serveur via environnement ou
fichier protégé, jamais dans Git, l'image ou les logs : `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
`OWNER_GITHUB_ID`, `OPENROUTER_API_KEY`. `.env` non commité ;
`.env.example` sans secrets. Les identifiants de déploiement et de lecture
GHCR sont distincts des secrets applicatifs et configurés avec les
permissions minimales nécessaires.

## 19. Infrastructure retenue

- Serveur privé existant du propriétaire pour l'application et PostgreSQL.
- GitHub Actions pour les vérifications, la publication et le déploiement.
- GHCR pour les images Docker versionnées.
- Runner CD GitHub hébergé, avec pair WireGuard dédié et accès SSH au serveur.

Aucun PaaS ni PostgreSQL managé requis pour la V1. Le VPN WireGuard
existant assure l’accès privé ; Nginx assure HTTPS ; l’ordinateur du
propriétaire conserve les copies de sauvegarde hors serveur. La localisation du serveur et des sauvegardes est documentée
pendant la slice ; aucune région n'est présumée à partir de l'alias SSH.

## 20. Décisions explicitement rejetées

V1 n'utilise pas : - Next.js ; - frontend parlant directement à un
BaaS/DB ; - microservices ; - monorepo ; - API REST générale, GraphQL ou
tRPC ; - Prisma ; - multi-tenancy / `user_id` partout ; - signup public
; - moteurs de recherche externes ; - cron/workers pour la récurrence
; - RRULE complète ; - state manager/cache client global ; - WYSIWYG
lourd ; - triggers SQL métier ; - SQLite pour simuler PostgreSQL en
tests ; - staging permanent.

## 21. Points volontairement ouverts

À décider au bootstrap/déploiement, sans changer l'architecture : -
endpoint public et port UDP du pair WireGuard CD ; - approbation de
la CA privée sur les appareils ; - fréquence de synchronisation des
sauvegardes sur l’ordinateur du propriétaire ; - durée exacte de rétention Trash ; - durée
exacte du debounce recherche ; - package Markdown précis ; - nécessité
effective du polyfill Temporal ; - moment d'introduction de Sentry ; -
budgets de performance chiffrés.

## 22. Ordre d'implémentation recommandé

Vertical slices :

1.  bootstrap repo/outillage/PostgreSQL/migrations ;
2.  auth propriétaire + protection serveur ;
3.  shell responsive/PWA/navigation ;
4.  Collector + Entries + traitement des captures non classées dans Revue ;
    - slice `04a` : Jev sur les captures du Collector + Revue avec traitement des captures non classées ;
5.  Tasks ponctuelles + autosave + statuts + dates ;
6.  Projects + relations Tasks + `TO_BUILD` ;
7.  Checkpoints ;
8.  simplification du modèle de classification et régénération du schéma initial ;
9.  Home `Late / In Progress / Today` et règles d'exposition ;
10. récurrence simple + tests exhaustifs ;
11. recherche globale + Cmd/Ctrl+K ;
12. Markdown rendu/checkboxes ;
13. Trash/restore/purge + Undo ;
14. `doctor`, health/ready, logs ;
15. E2E, responsive/mobile polish, keyboard-first ;
16. Docker Compose + serveur privé + CI/CD GitHub Actions/GHCR + backups testés.

Chaque slice doit inclure migration éventuelle, domaine/use case,
repository, UI et tests pertinents. Pas de couche construite longtemps
avant son premier usage réel.

## 23. Classification automatique Jev et Revue

### Intégration

Le serveur appelle l'[API Decisions d'OpenRouter](https://openrouter.ai/blog/insights/what-is-jev/) via
`POST https://openrouter.ai/api/alpha/decisions` avec
`OPENROUTER_API_KEY` et le modèle épinglé `typesafe/jev-1.13`. L'appel
utilise `fetch` natif dans un petit client server-only ; aucun SDK, appel
depuis le navigateur ou endpoint de chat générique n'est requis. Le
client vérifie la réponse avec Zod et isole la forme de cette API alpha
du domaine. Un changement de modèle est explicite et accompagné de
tests, pas suivi automatiquement par un alias `latest`.

Jev reçoit uniquement `raw_content` et, pour le rattachement, les
identifiants/titres des candidats admissibles. Ni session, ni clé, ni
contenu d'autres objets n'est envoyé. Les logs contiennent l'ID de
l'Entry, le modèle, la durée, un code d'erreur et éventuellement le coût,
jamais le texte de la capture ou les titres des candidats.
L'auto-hébergement de l'app et de la base ne détermine pas la région
de traitement de ce service externe ; cette condition doit être
vérifiée avant le déploiement en production.

### Décisions bornées

Une question `choice` sélectionne `task` ou `project`. Tout
choix valide est appliqué directement, même si sa probabilité est basse ;
la Revue permet de le corriger ensuite. Une réponse absente, invalide ou
hors des choix laisse l'Entry non classifiée.

Une seconde décision `choice` n'est utile que pour `task` :
elle choisit parmi les Projects `planned|active` non supprimés. Le choix
`none` est toujours présent. Les candidats sont bornés ; si la liste
complète ne peut pas être présentée de façon sûre, aucun rattachement
automatique n'est tenté. L'application vérifie l'ID choisi et l'état du
parent une nouvelle fois dans la transaction de création. La politique
initiale ne rattache que si la probabilité du choix est au moins `0.9`
et supérieure à celle de `none` ; ce seuil est à recalibrer avec un
échantillon de captures françaises du propriétaire. Aucun choix Jev ne
crée de Project supplémentaire.

La règle pure `splitCapture` garde la responsabilité du titre et de la
description. Jev ne génère ni texte, ni date, ni statut métier.

### Persistance et relance

Le cas d'usage de capture crée d'abord une Entry avec
`capture_request_id` et l'éventuelle `requested_due_date`, puis répond dès cette persistance confirmée avec
`saved_pending_classification`. Il lance Jev dans le processus serveur,
hors transaction et sans bloquer la réponse HTTP. Une fois la décision
obtenue, il verrouille l'Entry et crée l'objet ainsi que son éventuel
lien dans une transaction qui renseigne la FK cible et
`classification_state=classified`. Une
date demandée est transférée à la `due_date` de la Task ou du Project
dans cette transaction ; la classification manuelle fait de même. La
relance avec la même clé retrouve l'Entry existante et, si elle est
encore en attente ou en échec, peut reprendre la classification sans
créer un second objet, même si la réponse HTTP précédente s'est perdue. La
transaction n'applique jamais une réponse Jev à une Entry déjà
classifiée ou corrigée.

Un timeout, une erreur fournisseur ou une réponse invalide passe l'Entry
à `failed` et laisse son texte intact. Le navigateur interroge le statut
de l'Entry après la réponse de capture et affiche une notification visible
avec le type et le titre du parent éventuel, ou une action `Retry` en cas
d'échec. Une Entry laissée `pending` par une interruption du processus est
marquée `failed` lors d'un contrôle de statut après 60 secondes et peut
être relancée. Si la connexion au serveur échoue avant confirmation, le
Collector conserve le texte et sa clé d'idempotence. Aucun cron, worker
ou autre service de traitement n'est ajouté pour cette slice.

Le traitement manuel des captures non classées dans Revue crée l'objet et
marque l'Entry `classified` avec `classification_source=manual` dans
une transaction ; ces Entries ne figurent pas parmi les classifications Jev.

### Correction

`confirmJevClassification` renseigne `reviewed_at` sans modifier
l'objet. `correctJevClassification` verrouille l'Entry et l'objet lié.
Une correction de rattachement valide le parent et les invariants du
domaine. Une correction de type crée le nouvel objet avec le titre, la
description et la `due_date` courants, met à jour l'Entry, puis soft-delete l'ancien
objet dans la même transaction. Elle est limitée aux objets issus de
Jev depuis la Revue ; elle échoue clairement si l'ancien objet porte des
enfants ou des champs spécifiques qui seraient perdus. Aucun enfant
n'est déplacé ni supprimé silencieusement. Une correction humaine ne
déclenche pas un nouvel appel à Jev et ne peut pas être écrasée par un
Retry tardif.
