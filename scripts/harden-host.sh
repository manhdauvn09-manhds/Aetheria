#!/usr/bin/env bash
# =============================================================================
# Aetheria — host hardening one-shot.
# =============================================================================
# Run on the server (or via deploy.ps1) to apply:
#   - fail2ban with SSH jail (audit item #2)
#   - MySQL nightly backup cron        (audit item #5)
#
# Idempotent: re-running is safe. Each block checks current state and
# skips work that has already been done.
# =============================================================================
set -euo pipefail

log() { printf '%s\n' "==> $*"; }

# ─── #2  fail2ban + SSH jail ────────────────────────────────────────────
if ! command -v fail2ban-client >/dev/null 2>&1; then
  log "installing fail2ban"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban >/dev/null
else
  log "fail2ban already installed"
fi

# A small, well-known SSH jail. The defaults ship in fail2ban/jail.conf;
# we just enable the sshd jail and tighten the thresholds.
install -d -m 755 /etc/fail2ban/jail.d
# ignoreip lives inside the [sshd] section (NOT [DEFAULT] in a jail.d/ file)
# because fail2ban only inherits DEFAULT from jail.conf at load time — values
# in jail.d/*.local under [DEFAULT] won't propagate to already-defined jails.
# Listing the operator's static IP here makes fail2ban a no-op for our own
# SSH attempts during ops work.
cat >/etc/fail2ban/jail.d/sshd.local <<'CFG'
[sshd]
enabled  = true
port     = ssh
filter   = sshd
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
ignoreip = 127.0.0.1/8 ::1 172.16.0.0/12 10.0.0.0/8 219.105.121.69
CFG

systemctl enable fail2ban >/dev/null 2>&1 || true
if systemctl is-active --quiet fail2ban; then
  systemctl reload fail2ban
else
  systemctl start fail2ban
fi
log "fail2ban active: $(systemctl is-active fail2ban)"

# ─── #5  MySQL nightly backup ───────────────────────────────────────────
install -d -m 700 /var/backups/aetheria/mysql
cat >/usr/local/bin/aetheria-mysql-backup.sh <<'BACKUP'
#!/usr/bin/env bash
# Aetheria MySQL nightly dump. Keeps the last 14 days; older files are
# pruned. Writes to /var/backups/aetheria/mysql/aetheria-YYYY-MM-DD.sql.gz.
set -euo pipefail
DEST=/var/backups/aetheria/mysql
KEEP_DAYS=14
PW=$(grep '^MYSQL_ROOT_PASSWORD=' /opt/apps/aetheria/src/.env.prod | sed 's/^[^=]*=//' | tr -d '\r')
TS=$(date +%Y-%m-%d)
TMP="$DEST/aetheria-$TS.sql.gz.tmp"
OUT="$DEST/aetheria-$TS.sql.gz"
# mysqldump is the standard tool for full logical backups. --single-transaction
# gives a consistent snapshot of InnoDB tables without locking the whole DB.
docker exec -e MYSQL_PWD="$PW" aetheria_mysql mysqldump \
  --user=root --single-transaction --quick --routines --events \
  --hex-blob --default-character-set=utf8mb4 aetheria \
  | gzip -9 > "$TMP"
mv "$TMP" "$OUT"
chmod 600 "$OUT"
# Prune older than KEEP_DAYS.
find "$DEST" -name 'aetheria-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
BACKUP
chmod +x /usr/local/bin/aetheria-mysql-backup.sh

# Cron @ 03:15 daily so it doesn't clash with PLD's backup (peeked at
# /etc/cron.d/pld-backup; PLD runs at a different time).
cat >/etc/cron.d/aetheria-backup <<'CRON'
# Aetheria MySQL nightly backup
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root /usr/local/bin/aetheria-mysql-backup.sh >> /var/log/aetheria-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/aetheria-backup
log "MySQL backup cron installed (daily 03:15, keeps 14 days)"

# Run one immediate backup so we have at least one snapshot from day 1.
log "running first backup to seed the directory"
/usr/local/bin/aetheria-mysql-backup.sh || log "WARN: first backup failed, will retry tonight"
ls -la /var/backups/aetheria/mysql/

log "host hardening complete"
