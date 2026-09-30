#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
load_current_image
[[ -f backup.env ]] || { echo 'Missing backup configuration.' >&2; exit 2; }
source ./backup.env
: "${BACKUP_RECIPIENT:?Set the public encryption certificate path}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
[[ "$BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid retention.' >&2; exit 2; }
if [[ -n "${BACKUP_TARGET:-}" ]]; then
  [[ "$BACKUP_TARGET" != -* && "$BACKUP_TARGET" == *:* ]] || {
    echo 'Backup destination must be an off-server SSH path.' >&2; exit 2;
  }
fi
[[ -r "$BACKUP_RECIPIENT" ]] || { echo 'Missing public encryption certificate.' >&2; exit 2; }

mkdir -p backups
exec 8>"$DEPLOY_DIR/backup.lock"
flock -n 8 || { echo 'A backup is already running.' >&2; exit 1; }
temporary="$(mktemp "$DEPLOY_DIR/backups/.backup.XXXXXX")"
trap 'rm -f -- "$temporary"' EXIT
# CMS encrypts with a public certificate; the decryption key lives off-server.
# No plaintext dump is written to disk; pipefail propagates pg_dump failures.
compose exec -T db pg_dump -U gtd -d get_things_done --format=custom --no-owner --no-acl |
  openssl cms -encrypt -aes-256-gcm -binary -outform DER -out "$temporary" "$BACKUP_RECIPIENT"
destination="$DEPLOY_DIR/backups/gtd-$(date -u +%Y%m%dT%H%M%S)-$RANDOM.dump.cms"
mv "$temporary" "$destination"
# Optional push mode; the owner's chosen mode is periodic pull from their computer.
if [[ -n "${BACKUP_TARGET:-}" ]]; then
  scp -o BatchMode=yes -o StrictHostKeyChecking=yes -- "$destination" "$BACKUP_TARGET"
fi
find "$DEPLOY_DIR/backups" -type f -name 'gtd-*.dump.cms' -mtime "+$BACKUP_RETENTION_DAYS" -delete
echo 'Encrypted backup saved; synchronize the off-server copy from your computer.'
