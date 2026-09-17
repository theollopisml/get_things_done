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
-   Docker en production ; PaaS et PostgreSQL managé en Europe.

## 2. Architecture logique

``` text
Browser/PWA
  -> SvelteKit routes/UI
  -> application use cases
  -> domain rules
  -> repositories
  -> Drizzle
  -> PostgreSQL
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
    domain/{tasks,projects,visions,checkpoints,recurrence}/
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

Chargement serveur lorsque pertinent, notamment Home : Inbox count,
Late, In Progress, Today. Aucun state manager/cache global V1.

Mutations : UI réactive mais succès seulement après confirmation serveur
:

``` text
action -> Saving… -> server OK -> Saved
                     server KO -> Save failed · Retry
```

Le contenu local saisi n'est jamais perdu sur échec.

## 5. Validation et invariants

Zod valide formulaires/payloads/params. Il ne porte pas les règles
métier.

Invariants simples : domaine/application + contraintes PostgreSQL
(`CHECK`, FK, `NOT NULL`) quand lisibles. Invariants relationnels
complexes : use cases transactionnels. **Aucun trigger métier.**

## 6. Modèle de données

Cinq tables métier : `entries`, `visions`, `projects`, `checkpoints`,
`tasks`.

Absents : routines, occurrences, subtasks, checklist items, tags,
workspaces, memberships, priorities, dépendances.

### entries

`id`, `raw_content TEXT`, `created_at`, `updated_at`, `deleted_at?`.

Classification transactionnelle : créer `Task|Project|Vision`, puis
retirer l'Entry de l'Inbox. Pas de `source_entry_id`.

### visions

`id`, `title`, `description?`, `status(active|paused|archived)`,
timestamps, `deleted_at?`. Pas de dates métier.

### projects

`id`, `vision_id?`, `title`, `description?`,
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
`classifyEntry`: créer objet cible + retirer Entry.

## 8. Trash

Soft delete via `deleted_at TIMESTAMPTZ NULL`. Restore : `NULL`. Purge :
suppression physique confirmée.

-   delete Vision -\> Projects conservés, `vision_id=NULL`
-   delete Project -\> Tasks autonomes, Checkpoints
    supprimés/soft-deleted
-   delete Checkpoint -\> Tasks conservées, `checkpoint_id=NULL`
-   delete Task -\> Task uniquement

Repositories normaux excluent les soft-deleted.

## 9. `pnpm doctor`

Diagnostic **read-only**, jamais dépendance du boot :

``` text
pnpm doctor
pnpm doctor --verbose
```

Vérifie connexion/migrations, liens orphelins, cohérence
Task/Project/Checkpoint, invariants récurrence/dates, références vers
soft-deleted, positions invalides. `--verbose` donne les IDs. `--fix`
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
de Tasks/Projects/Visions/Checkpoints ; Entries hors recherche globale.

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

`Cmd/Ctrl+K` : recherche/navigation/actions limitées : Inbox, Tasks,
Projects, Visions, New Task/Project/Vision, recherche. Pas de système de
plugins.

## 14. Auth et sécurité

GitHub OAuth + Better Auth :

``` text
GitHub identity -> stable ID == OWNER_GITHUB_ID ? session : 403
```

HTTPS, cookies sécurisés HttpOnly/SameSite adaptés, CSRF, authorization
server-side sur toutes routes/actions privées, aucun secret client,
security headers. Pas de `user_id` artificiel sur chaque table métier.

## 15. Tests et CI

Vitest : domaine/récurrence/invariants/Markdown. Intégration : vrai
PostgreSQL, migrations/transactions/use cases (`classifyEntry`,
`deleteProject`, `restoreProject`, `moveTask`, `completeRecurringTask`,
`searchGlobal`). Playwright : login, capture-\>Inbox, classification,
Project+Task, Done, récurrence, Process Inbox, Cmd+K, smoke mobile.

Pas de tests composants systématiques ni objectif global de coverage.
Toute règle métier non triviale a un test ; tout bug métier corrigé
reçoit un test de régression.

CI :

``` text
install -> lint -> typecheck -> unit
-> PostgreSQL -> migrations -> integration
-> build -> E2E selon contexte
```

`pnpm check` agrège les checks locaux.

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

SvelteKit `adapter-node` dans Docker, PaaS plutôt que VPS V1. PostgreSQL
managé. App + DB en Europe, idéalement même région.

Environnements : `local`, `CI`, `production`; pas de staging permanent.

Local : PostgreSQL via Docker, app native avec `pnpm dev`. Toute
évolution de schéma passe par migration versionnée. Backups automatiques
du fournisseur DB obligatoires ; export/`pg_dump` possible. Second
backup externe chiffré éventuel plus tard.

Secrets uniquement via environnement/secret manager : `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
`OWNER_GITHUB_ID`. `.env` non commité ; `.env.example` sans secrets.

## 19. Fournisseurs

Le fournisseur exact n'est pas couplé au code. Critères app :
Docker/Node, Git deploy, secrets, healthchecks, domaine custom, faible
coût, région EU. Critères DB : PostgreSQL standard, région EU, backups,
export facile, pooling si nécessaire.

Railway/Render/Fly et Neon/Supabase/autres seront comparés sur leurs
offres **au moment du choix**.

## 20. Décisions explicitement rejetées

V1 n'utilise pas : - Next.js ; - frontend parlant directement à un
BaaS/DB ; - microservices ; - monorepo ; - API REST générale, GraphQL ou
tRPC ; - Prisma ; - multi-tenancy / `user_id` partout ; - signup public
; - moteurs de recherche externes ; - cron/workers pour la récurrence
; - RRULE complète ; - state manager/cache client global ; - WYSIWYG
lourd ; - triggers SQL métier ; - SQLite pour simuler PostgreSQL en
tests ; - staging permanent ; - VPS/self-hosted PostgreSQL comme choix
initial.

## 21. Points volontairement ouverts

À décider au bootstrap/déploiement, sans changer l'architecture : -
version Node LTS exacte ; - PaaS exact ; - fournisseur PostgreSQL exact
; - région EU exacte ; - durée exacte de rétention Trash ; - durée
exacte du debounce recherche ; - package Markdown précis ; - nécessité
effective du polyfill Temporal ; - moment d'introduction de Sentry ; -
budgets de performance chiffrés.

## 22. Ordre d'implémentation recommandé

Vertical slices :

1.  bootstrap repo/outillage/PostgreSQL/migrations ;
2.  auth propriétaire + protection serveur ;
3.  shell responsive/PWA/navigation ;
4.  Collector + Entries + Inbox + Process Inbox ;
5.  Tasks ponctuelles + autosave + statuts + dates ;
6.  Projects + relations Tasks + `TO_BUILD` ;
7.  Checkpoints ;
8.  Visions ;
9.  Home `Late / In Progress / Today` et règles d'exposition ;
10. récurrence simple + tests exhaustifs ;
11. recherche globale + Cmd/Ctrl+K ;
12. Markdown rendu/checkboxes ;
13. Trash/restore/purge + Undo ;
14. `doctor`, health/ready, logs ;
15. E2E, responsive/mobile polish, keyboard-first ;
16. Docker + production EU + backups.

Chaque slice doit inclure migration éventuelle, domaine/use case,
repository, UI et tests pertinents. Pas de couche construite longtemps
avant son premier usage réel.
