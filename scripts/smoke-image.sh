#!/usr/bin/env bash
set -euo pipefail
image="${1:?Pass the image to test}"
project="gtd-image-test-$$"
temporary="$(mktemp -d)"
cleanup() {
  docker rm -f "$project-app" "$project-db" >/dev/null 2>&1 || true
  docker network rm "$project" >/dev/null 2>&1 || true
  rm -rf -- "$temporary"
}
trap cleanup EXIT
docker network create "$project" >/dev/null
docker run -d --name "$project-db" --network "$project" --network-alias db \
  -e POSTGRES_PASSWORD=smoke-only -e POSTGRES_DB=get_things_done \
  postgres:17-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$project-db" pg_isready -U postgres -d get_things_done >/dev/null 2>&1; then break; fi
  sleep 1
done
cat > "$temporary/app.env" <<'ENV'
DATABASE_URL=postgresql://postgres:smoke-only@db:5432/get_things_done
BETTER_AUTH_SECRET=smoke-only-secret-29d207e7cc894f469e047dc37d917b37
BETTER_AUTH_URL=http://127.0.0.1:3000
ORIGIN=http://127.0.0.1:3000
GITHUB_CLIENT_ID=smoke-unused
GITHUB_CLIENT_SECRET=smoke-unused
OWNER_GITHUB_ID=123456789
ENV
docker run --rm --network "$project" --env-file "$temporary/app.env" \
  "$image" node scripts/migrate.mjs
# A repeated migration must be harmless.
docker run --rm --network "$project" --env-file "$temporary/app.env" \
  "$image" node scripts/migrate.mjs
docker run --rm --network "$project" --env-file "$temporary/app.env" \
  "$image" node scripts/doctor.mjs
docker run -d --name "$project-app" --network "$project" --env-file "$temporary/app.env" \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  "$image" >/dev/null
healthy=0
for attempt in {1..30}; do
  if docker exec "$project-app" node --input-type=module -e '
    const base = "http://127.0.0.1:3000";
    for (const path of ["/health", "/ready", "/login"]) {
      const r = await fetch(base + path, {signal: AbortSignal.timeout(5000)});
      if (r.status !== 200) process.exit(1);
    }
    const r = await fetch(base + "/", {redirect: "manual"});
    if (r.status !== 303 || r.headers.get("location") !== "/login") process.exit(1);
    if (process.getuid() === 0) process.exit(1);
  '; then healthy=1; break; fi
  sleep 1
done
[[ "$healthy" == 1 ]]
# Verify persistent DB data across an application replacement.
docker restart "$project-app" >/dev/null
docker exec "$project-app" node scripts/doctor.mjs
docker run --rm --entrypoint sh "$image" -c 'test ! -e /app/.env && test ! -d /app/.git && test ! -d /app/tests'
# Exercise the real encrypted PostgreSQL format and restore path, not only mocks.
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$temporary/recipient.key" \
  -out "$temporary/recipient.crt" -days 1 -subj '/CN=image-smoke-backup' >/dev/null 2>&1
docker exec "$project-db" pg_dump -U postgres -d get_things_done --format=custom --no-owner --no-acl |
  openssl cms -encrypt -aes-256-gcm -binary -outform DER \
    -out "$temporary/backup.cms" "$temporary/recipient.crt"
bash "$(dirname "$0")/test-restore.sh" "$image" "$temporary/backup.cms" "$temporary/recipient.key"
echo 'Image smoke passed: migrations, doctor, HTTP, owner protection, restart, non-root runtime and encrypted restore.'
