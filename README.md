# Get Things Done

## Démarrage local

Prérequis : Node.js 24, pnpm via Corepack et Docker Compose.

```sh
corepack enable pnpm
pnpm install
cp .env.example .env
docker compose up -d --wait db
pnpm db:migrate
pnpm dev
```

L'application est disponible sur `http://localhost:5173`. La base PostgreSQL
locale écoute uniquement sur `127.0.0.1:5432` et ses données restent dans le
volume Docker `postgres_data`. Après la première installation, `pnpm dev`
démarre automatiquement la base locale avant l'application. `pnpm dev:app`
démarre seulement l'application si une autre base est déjà disponible.

Pour préparer l'authentification GitHub, créer une OAuth App avec l'URL de
callback `http://localhost:5173/api/auth/callback/github`, puis renseigner
`BETTER_AUTH_URL=http://localhost:5173`, `BETTER_AUTH_SECRET`,
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` et l'ID numérique stable du
propriétaire dans `OWNER_GITHUB_ID` dans `.env`. Ne pas commiter ce fichier.
La session reste valide pendant 30 jours et son expiration est prolongée lors
d'un usage régulier.

Si l'application répond `500` avec `ECONNREFUSED 127.0.0.1:5432`, relancer
`pnpm dev` pour démarrer la base. `pnpm check` valide le code et le build,
mais ne démarre pas la base locale.

Pour arrêter la base :

```sh
docker compose down
```

`docker compose down` conserve le volume et les données.

Pour remettre à zéro uniquement la base locale de développement et réappliquer
toutes les migrations :

```sh
pnpm db:reset:dev
```

Cette commande efface définitivement les données de `get_things_done`, y compris
les Tasks, Projects, comptes et sessions. Elle refuse une `DATABASE_URL` différente de la base locale Docker
attendue ; il faut ensuite se reconnecter à l'application. Les autres bases et
volumes Docker ne sont pas supprimés.

Après une modification d'un schéma dans `src/lib/server/db/`, générer
une migration avec `pnpm db:generate`, relire son SQL dans
`drizzle/migrations/`, puis l'appliquer avec `pnpm db:migrate`.

`pnpm check` exécute le lint, le typecheck, les tests unitaires et le build.
La CI exécute ces contrôles et applique les migrations sur un PostgreSQL neuf.

## Vérifications de la slice quality

```sh
pnpm check
pnpm test:integration
pnpm exec playwright install --with-deps chromium webkit
pnpm test:e2e
```

Les tests d'intégration utilisent `DATABASE_URL` et nettoient leurs propres objets.
Les E2E utilisent exclusivement une base locale nommée `get_things_done_e2e`, créée
et migrée automatiquement sur le PostgreSQL local. Ils **effacent le contenu de cette
base de test avant chaque scénario**, sans toucher à la base de développement.
Pour changer les identifiants ou le port PostgreSQL, définir `E2E_DATABASE_URL` ;
le lanceur refuse tout hôte distant ou nom de base différent. Le compte PostgreSQL
doit pouvoir créer cette base, ou elle doit déjà exister.

Playwright lance le build Node sur `127.0.0.1:4173`, avec Chromium desktop, Chromium
mobile et WebKit. Ce port doit être libre. Les scénarios injectent des sessions
Better Auth signées et des comptes GitHub de test, puis passent par les protections
serveur normales. Ils vérifient aussi le refus des sessions anonymes et non propriétaires.
L'échange OAuth réel avec GitHub n'est pas automatisé. Un module chargé uniquement
par le lanceur de tests simule les réponses OpenRouter ; aucune clé réelle n'est utilisée
et aucun mode de contournement n'est ajouté à l'application.

Pour relancer un scénario sur le dernier build :

```sh
pnpm exec playwright test --project=desktop --grep 'Collector'
pnpm exec playwright show-report
```

Les rapports conservent les captures et traces des échecs, ainsi que les mesures
de navigation sur un jeu de 100 Tasks et 20 Checkpoints. La CI exécute les trois
profils et conserve ces artefacts pendant sept jours. Ces mesures servent à détecter
des lenteurs observables, sans imposer de budget dépendant de la machine de test.

Les raccourcis sont disponibles sans modifier la saisie dans les champs :

- `Ctrl/Cmd + K` : ouvrir la recherche, naviguer ou créer depuis la palette ;
- `/` : revenir au Collector et le focaliser ;
- `↑/↓` sur un bouton « Modifier » ou une carte Project : passer à l'objet voisin ;
- `Tab`, `Maj + Tab`, `Entrée` : atteindre et activer les actions ;
- `Échap` : fermer une modale ou le calendrier, avec retour du focus ;
- Collector : `Entrée` capture, `Maj + Entrée` insère une nouvelle ligne.

La palette focalise les champs de création et les objets ouverts depuis les résultats.
Les mêmes opérations restent accessibles au tactile.

## Diagnostic et supervision

`GET /health` est public et renvoie `200` lorsque le processus sert des requêtes.
`GET /ready` est public et renvoie `200` si PostgreSQL répond, ou `503` en cas
d'échec ou après trois secondes d'attente. Ces réponses ne sont pas mises en cache.

Pour vérifier la connexion, les migrations et l'intégrité métier :

```sh
pnpm run doctor
pnpm run doctor --verbose
```

Le mot `run` est nécessaire : `pnpm doctor` exécute le diagnostic intégré à pnpm.
La commande de l'application charge `.env` et respecte les variables déjà définies
dans l'environnement. Elle vérifie les liens entre objets, les dates et récurrences,
les positions et les classifications, dans une transaction PostgreSQL en lecture
seule. Les liens historiques de Revue vers des objets supprimés sont acceptés.
Le mode verbose affiche les IDs concernés, sans titre, description ou capture.

Codes de sortie : `0` si les contrôles passent, `1` si une incohérence est détectée,
`2` si le diagnostic ne peut pas s'exécuter ou si les arguments sont invalides.
Si les migrations ne correspondent pas aux fichiers du dépôt, les contrôles métier
sont suspendus jusqu'à l'alignement du schéma. La commande ne répare aucune donnée
et n'est pas une condition du démarrage de l'application.

Les logs serveur sont des lignes JSON avec timestamp, niveau, événement et, pour
les requêtes HTTP, identifiant de requête, route, statut et durée. L'en-tête
`x-request-id` permet de retrouver une réponse dans les logs ; Jev conserve le
même identifiant pendant son traitement en arrière-plan. Les logs n'incluent ni
paramètres de recherche, ni contenu utilisateur, ni secrets.

## Organisation du code

Les règles métier pures iront dans `src/lib/domain/`. Les cas d'usage serveur
iront dans `src/lib/server/application/`, la persistance dans
`src/lib/server/repositories/`, et le schéma ainsi que la connexion Drizzle
dans `src/lib/server/db/`. Les dossiers métier seront remplis au fil des
slices qui les utilisent.
