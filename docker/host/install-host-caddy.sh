#!/usr/bin/env bash
# =============================================================================
# Aetheria — install host-level Caddy as the SHARED public-facing reverse
# proxy on the VPS. Run ONCE per host:
#
#   bash docker/host/install-host-caddy.sh
#
# After this Caddy claims ports 80 + 443, auto-provisions Let's Encrypt
# certificates, and routes both Aetheria and PrivateDatingLevel domains
# into their respective docker stacks bound to 127.0.0.1:1810x / :18080.
# =============================================================================
set -euo pipefail

CADDY_CONFIG_DIR=/etc/caddy
CADDY_CONFIG_FILE="${CADDY_CONFIG_DIR}/Caddyfile"
SRC_CADDYFILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/Caddyfile"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: must run as root (we touch /etc/caddy and systemd)." >&2
  exit 1
fi

# Refuse to clobber an existing reverse proxy that we did NOT install.
# Specifically guard against an active nginx/apache holding :80 or :443.
if ss -tlnp '( sport = :80 or sport = :443 )' 2>/dev/null | grep -qE 'LISTEN'; then
  occupant=$(ss -tlnp '( sport = :80 or sport = :443 )' | grep LISTEN | head -1)
  if ! grep -q 'caddy' <<<"$occupant"; then
    echo "ERROR: port 80 or 443 is already in use by something other than Caddy:" >&2
    echo "  $occupant" >&2
    echo "Refusing to continue — uninstall the existing proxy first or merge its config." >&2
    exit 1
  fi
fi

# Install Caddy from the official apt repo (signed). Reference:
# https://caddyserver.com/docs/install#debian-ubuntu-raspbian
if ! command -v caddy >/dev/null 2>&1; then
  echo "==> Installing Caddy from the official apt repo..."
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update
  apt-get install -y caddy
else
  echo "==> Caddy already installed: $(caddy version | head -1)"
fi

# Drop our Caddyfile into place. Preserve any pre-existing one as .bak so we
# never silently overwrite a manual edit.
mkdir -p "${CADDY_CONFIG_DIR}"
if [[ -f "${CADDY_CONFIG_FILE}" ]] && ! cmp -s "${SRC_CADDYFILE}" "${CADDY_CONFIG_FILE}"; then
  ts=$(date +%Y%m%d-%H%M%S)
  cp -a "${CADDY_CONFIG_FILE}" "${CADDY_CONFIG_FILE}.bak.${ts}"
  echo "==> Backed up existing Caddyfile to ${CADDY_CONFIG_FILE}.bak.${ts}"
fi
cp "${SRC_CADDYFILE}" "${CADDY_CONFIG_FILE}"

# Validate before reloading so a malformed config never kills the live proxy.
echo "==> Validating Caddyfile..."
caddy validate --config "${CADDY_CONFIG_FILE}" --adapter caddyfile

systemctl enable caddy
if systemctl is-active --quiet caddy; then
  echo "==> Reloading Caddy..."
  systemctl reload caddy
else
  echo "==> Starting Caddy..."
  systemctl start caddy
fi

echo
echo "==> Caddy status:"
systemctl status caddy --no-pager --lines=5 || true
echo
echo "Done. DNS must point each domain at this host's public IP. Once that's"
echo "live, Caddy will provision Let's Encrypt certificates on first request."
