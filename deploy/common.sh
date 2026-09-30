#!/usr/bin/env bash
set -euo pipefail
umask 077

DEPLOY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR"

compose() {
  docker compose --env-file "$DEPLOY_DIR/production.env" -f "$DEPLOY_DIR/compose.yaml" "$@"
}

valid_image() {
  [[ "$1" =~ ^ghcr\.io/theollopisml/get_things_done@sha256:[a-f0-9]{64}$ ]]
}

load_current_image() {
  unset APP_IMAGE
  if [[ -f "$DEPLOY_DIR/current-image" ]]; then
    IFS= read -r APP_IMAGE < "$DEPLOY_DIR/current-image"
    valid_image "$APP_IMAGE" || { echo 'Invalid saved image reference.' >&2; exit 1; }
    export APP_IMAGE
  fi
}

smoke() {
  # A trusted private CA is required: never disable TLS verification.
  curl --fail --silent --show-error --connect-timeout 5 --max-time 10 \
    --cacert "$DEPLOY_DIR/tls/ca.crt" "$SMOKE_URL/ready" >/dev/null &&
  curl --fail --silent --show-error --connect-timeout 5 --max-time 10 \
    --cacert "$DEPLOY_DIR/tls/ca.crt" "$SMOKE_URL/login" >/dev/null
}
