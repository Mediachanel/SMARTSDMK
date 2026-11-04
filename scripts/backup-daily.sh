#!/bin/bash
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

USB_MOUNT="${USB_MOUNT:-/media/devmon/sdb2-scsi-1ExternalUSB3.0}"
ROOT="$USB_MOUNT/Backups/smart-sdmk"
APP=/DATA/AppData/sistem-informasi

if ! mountpoint -q "$USB_MOUNT"; then
  echo "Backup dibatalkan: USB tidak terpasang di $USB_MOUNT" >&2
  exit 1
fi

if [[ ! -w "$USB_MOUNT" ]]; then
  echo "Backup dibatalkan: USB tidak dapat ditulis di $USB_MOUNT" >&2
  exit 1
fi

mkdir -p "$ROOT"
exec 9>"$ROOT/.backup.lock"
flock -n 9 || exit 0
stamp=$(TZ=Asia/Jakarta date +%Y%m%d-%H%M%S)
stage="$ROOT/.partial-$stamp"
final="$ROOT/daily-$stamp"
mkdir "$stage"
exec >>"$stage/backup.log" 2>&1
trap 'echo "FAILED at $(date -Is), line $LINENO"' ERR
echo "Started $(date -Is) / $(TZ=Asia/Jakarta date -Is)"

# Preserve source, deployment secrets and actual runtime configuration.
tar --exclude=source/node_modules --exclude=source/.next -czf "$stage/system.tar.gz" -C "$APP" source
docker inspect sisdmk2-app-nextjs smart-sdmk-dev sisdmk2-postgres > "$stage/containers.json"
docker exec sisdmk2-postgres sh -ec 'pg_dumpall -U "$POSTGRES_USER" --globals-only' > "$stage/postgres-globals.sql"
docker exec sisdmk2-postgres sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname"' > "$stage/databases.txt"
while IFS= read -r database; do
  [[ "$database" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Unsupported database name'; exit 1; }
  docker exec sisdmk2-postgres sh -ec 'pg_dump -U "$POSTGRES_USER" -Fc -d "$1"' sh "$database" > "$stage/database-$database.dump"
  docker exec -i sisdmk2-postgres pg_restore --list < "$stage/database-$database.dump" > "$stage/database-$database.contents.txt"
done < "$stage/databases.txt"

tar -czf "$stage/uploads.tar.gz" -C /DATA AppData/sistem-informasi/storage SMART_HRM_UPLOADS
tar -tzf "$stage/system.tar.gz" > /dev/null
tar -tzf "$stage/uploads.tar.gz" > /dev/null
cat > "$stage/RESTORE.txt" <<'EOF'
Daily SMART SDMK backup. Contains confidential deployment settings and database roles.
system.tar.gz: extract into /DATA/AppData/sistem-informasi (source folder).
uploads.tar.gz: extract into /DATA (storage and SMART_HRM_UPLOADS folders).
postgres-globals.sql: PostgreSQL roles; review before restoring on an existing server.
database-*.dump: PostgreSQL custom format; restore using pg_restore into a prepared database.
containers.json: runtime settings and mount references (contains secrets).
Dependencies/build output excluded; rebuild the application from Dockerfile and package-lock.json.
Verify files first: sha256sum -c SHA256SUMS
Backup is made online; database dumps are consistent individually, uploads may change during backup.
EOF
(cd "$stage"; sha256sum system.tar.gz uploads.tar.gz containers.json postgres-globals.sql databases.txt database-* RESTORE.txt > SHA256SUMS; sha256sum -c SHA256SUMS)
touch "$stage/SUCCESS"
mv "$stage" "$final"
# Only delete completed daily backups older than seven days, after success.
while IFS= read -r -d '' old; do
  if [[ -f "$old/SUCCESS" ]] && [[ "$old" != "$final" ]]; then
    echo "Removing expired backup: $old"
    rm -rf -- "$old"
  fi
done < <(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name 'daily-*' -mmin +10080 -print0)
echo "Completed $(date -Is): $final"
