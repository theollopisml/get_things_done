#!/usr/bin/env bash
set -euo pipefail
umask 077
destination="${1:?Pass a local backup directory outside the repository}"
mkdir -p "$destination"
destination="$(cd "$destination" && pwd)"
root="$(cd "$(dirname "$0")/.." && pwd)"
[[ "$destination" != "$root" && "$destination" != "$root/"* ]] || {
  echo 'Keep backups outside the repository.' >&2; exit 2;
}
# Reuse the existing WireGuard + SSH helper on the owner's computer.
# The read-only remote command streams only completed encrypted files.
temporary="$(mktemp "$destination/.download.XXXXXX")"
trap 'rm -f -- "$temporary"' EXIT
ssh-maison -o BatchMode=yes -o StrictHostKeyChecking=yes \
  'cd /srv/get-things-done/backups && tar -cf - -- gtd-*.dump.cms' > "$temporary"
# Accept only flat, encrypted archive names before extracting remote data.
while IFS= read -r name; do
  [[ "$name" =~ ^gtd-[0-9]{8}T[0-9]{6}-[0-9]+\.dump\.cms$ ]] || {
    echo 'Unexpected archive entry; download rejected.' >&2; exit 1;
  }
done < <(tar -tf "$temporary")
tar -xf "$temporary" -C "$destination" --no-same-owner --no-same-permissions
echo 'Encrypted backups copied to your computer. Keep the decryption key separately.'
