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
volume Docker `postgres_data`.

Pour arrêter la base :

```sh
docker compose down
```

`docker compose down` conserve le volume et les données.

Après une modification du schéma dans `src/lib/server/db/schema.ts`, générer
une migration avec `pnpm db:generate`, relire son SQL dans
`drizzle/migrations/`, puis l'appliquer avec `pnpm db:migrate`.

## Organisation du code

Les règles métier pures iront dans `src/lib/domain/`. Les cas d'usage serveur
iront dans `src/lib/server/application/`, la persistance dans
`src/lib/server/repositories/`, et le schéma ainsi que la connexion Drizzle
dans `src/lib/server/db/`. Les dossiers métier seront remplis au fil des
slices qui les utilisent.
