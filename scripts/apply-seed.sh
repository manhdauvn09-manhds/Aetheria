#!/usr/bin/env bash
# Run on the server. Loads MYSQL_ROOT_PASSWORD from .env.prod and applies
# /tmp/02_seed.sql against the aetheria_mysql container.
set -e
PW=$(grep '^MYSQL_ROOT_PASSWORD=' /opt/apps/aetheria/src/.env.prod | sed 's/^[^=]*=//' | tr -d '\r')
export MYSQL_PWD="$PW"
docker exec -i -e MYSQL_PWD aetheria_mysql mysql -uroot aetheria < /tmp/02_seed.sql 2>&1 | grep -v 'Using a password'
echo '-- verify --'
docker exec -e MYSQL_PWD aetheria_mysql mysql -uroot aetheria -N -e 'SELECT id, level_number, name FROM levels ORDER BY level_number;' 2>&1 | grep -v 'Using a password'
