#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"

candidate="${1:-}"
valid_image "$candidate" || { echo 'Expected this repository’s GHCR image digest.' >&2; exit 2; }
[[ -f production.env && -f app.env && -f backup.env && -f smoke.env ]] || {
  echo 'Missing production, application, backup or smoke configuration.' >&2; exit 2;
}
# These are operator-owned shell configuration files, never workflow input.
source ./smoke.env
[[ "${SMOKE_URL:-}" == https://* ]] || { echo 'HTTPS smoke URL required.' >&2; exit 2; }

# This lock also protects manual runs; GitHub concurrency alone is insufficient.
exec 9>"$DEPLOY_DIR/deploy.lock"
flock -n 9 || { echo 'A deployment is already running.' >&2; exit 1; }
load_current_image
previous="${APP_IMAGE:-}"
export APP_IMAGE="$candidate"
compose config --quiet
compose pull app
compose up -d --wait --wait-timeout 90 db
# Do not replace the running application if backup or migration fails.
export APP_IMAGE="$candidate"
"$DEPLOY_DIR/backup.sh"
compose run --rm --no-deps app node scripts/migrate.mjs

rollback() {
  if [[ -n "$previous" ]]; then
    export APP_IMAGE="$previous"
    if compose up -d --no-deps --wait --wait-timeout 120 app && smoke; then
      echo 'Previous application image restored; database was not rolled back.' >&2
    else
      echo 'Rollback failed; operator intervention required.' >&2
    fi
  else
    compose stop app || true
    echo 'First deployment failed; no previous image exists.' >&2
  fi
}

if ! compose up -d --no-deps --wait --wait-timeout 120 app; then
  rollback
  exit 1
fi
if ! compose up -d --no-deps --force-recreate proxy; then
  rollback
  exit 1
fi
healthy=0
for attempt in {1..12}; do
  if smoke; then healthy=1; break; fi
  sleep 5
done
if [[ "$healthy" != 1 ]]; then
  rollback
  exit 1
fi

# Persist state only after both readiness and HTTPS checks succeed.
if [[ -n "$previous" ]]; then
  printf '%s\n' "$previous" > previous-image.tmp
  mv previous-image.tmp previous-image
fi
printf '%s\n' "$candidate" > current-image.tmp
mv current-image.tmp current-image
echo 'Deployment ready.'
