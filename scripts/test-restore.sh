#!/usr/bin/env bash
set -euo pipefail
image="${1:?Pass the application image}"
archive="${2:?Pass an encrypted CMS backup}"
private_key="${3:?Pass the off-server private decryption key}"
[[ -f "$archive" && -f "$private_key" ]]
project="gtd-restore-test-$$"
cleanup() {
  docker rm -f "$project-db" >/dev/null 2>&1 || true
  docker network rm "$project" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create "$project" >/dev/null
docker run -d --name "$project-db" --network "$project" --network-alias db \
  -e POSTGRES_PASSWORD=restore-only -e POSTGRES_DB=get_things_done \
  postgres:17-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$project-db" pg_isready -h 127.0.0.1 -U postgres -d get_things_done >/dev/null 2>&1; then break; fi
  sleep 1
done
# Always restore into a newly created, isolated container, never a user-supplied DB URL.
openssl cms -decrypt -binary -inform DER -in "$archive" -inkey "$private_key" |
  docker exec -i "$project-db" pg_restore -U postgres -d get_things_done --no-owner --no-acl --exit-on-error
docker run --rm --network "$project" \
  -e DATABASE_URL=postgresql://postgres:restore-only@db:5432/get_things_done \
  "$image" node scripts/doctor.mjs
echo 'Backup restored and doctor passed in an isolated database.'
