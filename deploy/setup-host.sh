#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "$EUID" == 0 ]] || { echo 'Run this host setup with sudo.' >&2; exit 1; }
peer="${1:?Pass the dedicated GitHub WireGuard public key}"
[[ "$peer" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { echo 'Invalid WireGuard public key.' >&2; exit 2; }
root=/srv/get-things-done
interface=wg0
config="/etc/wireguard/$interface.conf"
[[ -f "$config" ]] || { echo 'WireGuard wg0 configuration missing.' >&2; exit 1; }
wg show "$interface" >/dev/null
address=10.8.0.250/32
existing="$(wg show "$interface" allowed-ips | awk -v ip="$address" '$2 == ip {print $1}')"
[[ -z "$existing" || "$existing" == "$peer" ]] || {
  echo 'The planned deployment VPN address is already in use.' >&2; exit 1;
}
# Preserve existing peers and never print private WireGuard configuration.
if ! grep -Fqx "PublicKey = $peer" "$config"; then
  cp -p "$config" "$config.before-gtd-$(date -u +%Y%m%dT%H%M%S)"
  printf '\n# GitHub Actions deployment peer\n[Peer]\nPublicKey = %s\nAllowedIPs = %s\n' "$peer" "$address" >> "$config"
fi
wg set "$interface" peer "$peer" allowed-ips "$address"
install -m 644 "$root/gtd-backup.service" /etc/systemd/system/gtd-backup.service
install -m 644 "$root/gtd-backup.timer" /etc/systemd/system/gtd-backup.timer
systemctl daemon-reload
systemctl enable --now docker
# Activate after the first successful deployment, when PostgreSQL exists.
wg show "$interface" public-key > "$root/wireguard-server-public-key"
wg show "$interface" listen-port > "$root/wireguard-server-port"
chown ullop:ullop "$root/wireguard-server-public-key" "$root/wireguard-server-port"
chmod 644 "$root/wireguard-server-public-key" "$root/wireguard-server-port"
echo 'Dedicated VPN peer and backup units installed. Enable gtd-backup.timer after deployment.'
