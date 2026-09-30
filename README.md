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
