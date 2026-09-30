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


## Production privée et CI/CD

L'application et PostgreSQL tournent dans Docker Compose sur le serveur maison,
avec HTTPS accessible uniquement via WireGuard à `https://10.8.0.1`.
Les fichiers d'exploitation sont dans `deploy/` ; les secrets, certificats et
états déployés restent dans `/srv/get-things-done` sur le serveur et hors Git.

### Image et commandes de production

```sh
docker build -t gtd-production:test .
bash scripts/smoke-image.sh gtd-production:test
pnpm test:operations
```

Le smoke test crée ses propres conteneurs PostgreSQL, sans port exposé ni accès
à la base locale. Il applique deux fois les migrations, vérifie `doctor`, les
routes HTTP publiques, le refus des accès anonymes, le redémarrage et l'utilisateur
non-root, puis détruit uniquement ses conteneurs temporaires.
L'image ne contient ni `.env`, ni tests, ni clé de production. Elle inclut :

```sh
node scripts/migrate.mjs
node scripts/doctor.mjs
node build/index.js
```

Le Compose de production conserve PostgreSQL dans un volume et ne publie pas son
port. Nginx publie uniquement `10.8.0.1:443`. L'application peut joindre OpenRouter
via son réseau web ; le réseau PostgreSQL est interne.

### Installation initiale du serveur

Créer `/srv/get-things-done`, propriété de l'utilisateur d'exploitation, et copier
`compose.yaml`, `nginx.conf`, `common.sh`, `deploy.sh`, `backup.sh`, ainsi que les
unités de sauvegarde et `setup-host.sh`. Créer les fichiers suivants avec mode 600 :

- `production.env`, d'après `deploy/production.env.example` ;
- `app.env`, d'après `deploy/app.env.example` ;
- `backup.env`, d'après `deploy/backup.env.example` ;
- `smoke.env`, d'après `deploy/smoke.env.example`.

Utiliser un mot de passe PostgreSQL hexadécimal pour sa compatibilité avec l'URL.
`ORIGIN` et `BETTER_AUTH_URL` valent `https://10.8.0.1`. Le callback de l'OAuth App
GitHub de production doit être `https://10.8.0.1/api/auth/callback/github`.
Une OAuth App distincte permet de conserver celle de développement sur localhost.
`BETTER_AUTH_SECRET` est un secret aléatoire distinct de celui de développement.

Le dossier `tls/` contient `server.crt`, `server.key` et le certificat public
`ca.crt`. Le certificat serveur couvre l'adresse VPN. Approuver `ca.crt` sur le
navigateur/OS et le téléphone ; les clés privées de la CA restent sur l'ordinateur.
Sur iOS, l'installation du profil doit être suivie de l'activation de la confiance
pour cette CA. Renouveler le certificat serveur avant son expiration (un an).
Les scripts vérifient les certificats ; ils n'utilisent pas `curl -k`.

Créer une paire de clés WireGuard dédiée à la CD, sans réutiliser celle du PC.
Le serveur réserve `10.8.0.250/32` à ce pair. Le script root préserve les pairs
existants, refuse une adresse déjà utilisée et installe les unités systemd :

```sh
sudo bash /srv/get-things-done/setup-host.sh "$(cat /srv/get-things-done/deployment-wireguard.pub)"
```

La clé SSH dédiée à GitHub est autorisée pour l'utilisateur d'exploitation avec
`restrict,from="10.8.0.250"`. Vérifier la clé hôte du serveur avant de la stocker.
Ne jamais enregistrer de runner auto-hébergé pour ce dépôt public.

### Configuration GitHub Actions

La CI vérifie chaque push et pull request : lint, typecheck, unitaires, tests
opérationnels, migrations, doctor, intégration PostgreSQL et E2E desktop/mobile/WebKit.
Après ces contrôles, elle construit et teste l'image. Les pushes sur `main` la
publient sur GHCR sous `sha-<commit>` ; la CD utilise son digest immuable.
La publication est décrite dans la [documentation GitHub](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).

Configurer l'environnement GitHub `production`, limité à la branche `main`, avec :

- variable `DEPLOY_HOST` : `ullop@10.8.0.1` ;
- secret `DEPLOY_SSH_KEY` : clé SSH privée dédiée ;
- secret `DEPLOY_KNOWN_HOSTS` : clé hôte SSH vérifiée ;
- secret `DEPLOY_WIREGUARD_CONFIG` : configuration du pair CD, avec adresse
  `10.8.0.250/32`, clé serveur, Endpoint public UDP et `AllowedIPs = 10.8.0.1/32`.
  Reprendre l’Endpoint du client WireGuard existant : son port public peut différer
  du ListenPort du serveur à cause de la redirection du routeur.

La variable de dépôt `PRODUCTION_ENABLED` reste `false` pendant l'installation.
La passer à `true` lorsque le VPN, les configurations et les certificats sont prêts.
Les secrets applicatifs restent sur le serveur ; les pull requests n'ont aucun accès
aux secrets de déploiement. La CD installe un tunnel temporaire sur un runner GitHub,
vérifie le handshake WireGuard puis SSH avec une attente bornée, transfère les
scripts puis ferme le tunnel en fin de job.

### Déploiement et retour arrière

```sh
cd /srv/get-things-done
bash deploy.sh ghcr.io/theollopisml/get_things_done@sha256:DIGEST_VALIDE
```

Le déploiement verrouille les exécutions concurrentes, télécharge l'image, démarre
PostgreSQL, sauvegarde la base puis applique les migrations dans un conteneur
ponctuel. Une erreur de sauvegarde ou de migration empêche le remplacement de l'app.
Après remplacement, il attend le healthcheck et vérifie `/ready` et `/login` via HTTPS.
Le succès écrit `current-image` et conserve `previous-image`. Si l'app ou HTTPS échoue,
le script tente de remettre l'image précédente et retourne toujours un code d'échec.
Au premier déploiement, il n'existe pas de version précédente.

Le retour arrière ne restaure pas la base : les migrations doivent rester compatibles
avec l'application précédente. Les évolutions incompatibles demandent une procédure de
maintenance dédiée. Ne jamais lancer `db:reset:dev` ni `docker compose down -v` en production.

Le workflow **Redeploy a validated main commit** permet de relancer manuellement un
commit complet de `main` dont la CI a réussi, y compris pour revenir à une version
connue. Il vérifie ce commit et utilise l'image publiée ; il n'accepte pas un tag arbitraire.
Les déploiements GitHub sont sérialisés et une opération en cours n'est pas annulée
par un nouveau push. Le verrou serveur protège aussi les commandes manuelles.

### Sauvegardes et restauration

La sauvegarde est un export PostgreSQL au format custom, chiffré par OpenSSL CMS
AES-256-GCM avec un certificat RSA public. Le serveur reçoit uniquement
`backup-recipient.crt` ; la clé privée de déchiffrement reste hors serveur et hors Git.
Conserver une copie sûre de cette clé : sa perte rend les sauvegardes inutilisables.
Les archives locales sont gardées 30 jours ; les copies sur le PC ne sont pas supprimées
automatiquement. Les sauvegardes ne contiennent pas les secrets applicatifs ou les
certificats serveur, à conserver séparément.

Après le premier déploiement, activer les sauvegardes quotidiennes :

```sh
sudo systemctl enable --now gtd-backup.timer
systemctl status gtd-backup.timer
journalctl -u gtd-backup.service
```

Le timer exécute la sauvegarde chaque jour autour de 03:00 ; une sauvegarde précède
également chaque migration. Depuis l'ordinateur connecté au VPN :

```sh
bash scripts/pull-backups.sh "$HOME/.local/state/get-things-done/backups"
bash scripts/test-restore.sh gtd-production:test /chemin/gtd-date.dump.cms /chemin/backup-recipient.key
```

Le test de restauration crée une base isolée dans un conteneur temporaire,
déchiffre l'archive et vérifie l'intégrité avec `doctor`, puis nettoie ses conteneurs.
Il ne reçoit jamais d'URL de base de production. Tester une restauration avant de
considérer la slice terminée et après tout changement du mécanisme de sauvegarde.
En cas de sinistre, restaurer et vérifier une nouvelle base avant de reconfigurer l'app.
Jusqu'au téléchargement sur le PC, une panne du disque serveur peut perdre les
sauvegardes récentes. Synchroniser régulièrement ; aucun stockage cloud n'est requis.

### Diagnostic et Jev en production

```sh
cd /srv/get-things-done
export APP_IMAGE="$(cat current-image)"
docker compose --env-file production.env -f compose.yaml ps
docker compose --env-file production.env -f compose.yaml logs --tail 100 app proxy
docker compose --env-file production.env -f compose.yaml run --rm --no-deps app node scripts/doctor.mjs
```

Vérifier la connexion GitHub réelle et une capture Jev depuis les appareils du
propriétaire après installation. Les E2E ne remplacent pas ce contrôle OAuth réel.

Les captures et les IDs/titres des projets candidats sortent du serveur vers
OpenRouter et TypeSafe pour le classement. L'auto-hébergement ne garantit donc pas
un traitement uniquement européen. La [politique TypeSafe](https://typesafe.ai/legal/privacy-policy)
annonce un hébergement aux États-Unis, l'absence d'entraînement sur les entrées et
une rétention sans durée fixe ; la [politique OpenRouter](https://openrouter.ai/privacy)
s'applique également. Aucun engagement de traitement EU ou de rétention nulle n'est
présumé pour l'API Decisions alpha utilisée. Conditions consultées le 30 septembre 2026.
