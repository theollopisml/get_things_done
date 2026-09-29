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
les sessions. Elle refuse une `DATABASE_URL` différente de la base locale Docker
attendue ; il faut ensuite se reconnecter à l'application. Les autres bases et
volumes Docker ne sont pas supprimés.

Après une modification d'un schéma dans `src/lib/server/db/`, générer
une migration avec `pnpm db:generate`, relire son SQL dans
`drizzle/migrations/`, puis l'appliquer avec `pnpm db:migrate`.

`pnpm check` exécute le lint, le typecheck, les tests unitaires et le build.
La CI exécute ces contrôles et applique les migrations sur un PostgreSQL neuf.

## Organisation du code

Les règles métier pures iront dans `src/lib/domain/`. Les cas d'usage serveur
iront dans `src/lib/server/application/`, la persistance dans
`src/lib/server/repositories/`, et le schéma ainsi que la connexion Drizzle
dans `src/lib/server/db/`. Les dossiers métier seront remplis au fil des
slices qui les utilisent.
