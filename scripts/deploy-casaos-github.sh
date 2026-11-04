#!/usr/bin/env sh
set -eu

PROJECTS_ROOT="${PROJECTS_ROOT:-/media/devmon/Local Disk/projects}"
REPO_URL="${REPO_URL:-https://github.com/Mediachanel/Si-SDMK2026.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-$PROJECTS_ROOT/si-kepegawaian}"
SOURCE_DIR="${SOURCE_DIR:-$APP_DIR/source}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECTS_ROOT/backup}"
UPLOADS_DIR="${UPLOADS_DIR:-$PROJECTS_ROOT/uploads/si-kepegawaian}"
POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-$PROJECTS_ROOT/postgres/data}"
DOCKER_DIR="${DOCKER_DIR:-$PROJECTS_ROOT/docker}"
APP_PORT="${APP_PORT:-8091}"
APP_BIND_HOST="${APP_BIND_HOST:-0.0.0.0}"
APP_ORIGIN="${APP_ORIGIN:-}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}"
JWT_SECRET="${JWT_SECRET:-}"
ALLOW_INSECURE_LOCAL_HTTP="${ALLOW_INSECURE_LOCAL_HTTP:-}"
COOKIE_SECURE="${COOKIE_SECURE:-}"
UKPD_DEFAULT_PASSWORD="${UKPD_DEFAULT_PASSWORD:-}"
TRUST_PROXY_HEADERS="${TRUST_PROXY_HEADERS:-true}"
NETWORK_NAME="${NETWORK_NAME:-sisdmk2-network}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-sisdmk-postgres}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-pgvector/pgvector:pg16}"
POSTGRES_ADMIN_USER="${POSTGRES_ADMIN_USER:-}"
POSTGRES_DATABASE="${POSTGRES_DATABASE:-si_data}"
POSTGRES_DATABASES="${POSTGRES_DATABASES:-si_data}"
POSTGRES_USER="${POSTGRES_USER:-sisdmk_admin}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
POSTGRES_HOST="${POSTGRES_HOST:-$POSTGRES_CONTAINER}"
POSTGRES_HOSTS="${POSTGRES_HOSTS:-$POSTGRES_CONTAINER,host.docker.internal,172.17.0.1,postgres,db,127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_CONNECT_TIMEOUT_MS="${POSTGRES_CONNECT_TIMEOUT_MS:-5000}"
POSTGRES_IDLE_TIMEOUT_MS="${POSTGRES_IDLE_TIMEOUT_MS:-30000}"
POSTGRES_POOL_MAX="${POSTGRES_POOL_MAX:-10}"
POSTGRES_POOL_VERIFY_INTERVAL_MS="${POSTGRES_POOL_VERIFY_INTERVAL_MS:-15000}"
POSTGRES_APPLICATION_NAME="${POSTGRES_APPLICATION_NAME:-sisdmk2-app}"
DASHBOARD_CACHE_TTL_MS="${DASHBOARD_CACHE_TTL_MS:-30000}"
DASHBOARD_DATA_CACHE_TTL_MS="${DASHBOARD_DATA_CACHE_TTL_MS:-30000}"
ENSURE_DATABASE="${ENSURE_DATABASE:-1}"
CREATE_POSTGRES_CONTAINER="${CREATE_POSTGRES_CONTAINER:-0}"
RESTORE_DUMP="${RESTORE_DUMP:-}"
RESTORE_USER="${RESTORE_USER:-}"
FORCE_ENV="${FORCE_ENV:-0}"
INSTALL_DEPS="${INSTALL_DEPS:-0}"
BUILD_NO_CACHE="${BUILD_NO_CACHE:-0}"
BUILD_PULL="${BUILD_PULL:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_HEALTH_CHECK="${SKIP_HEALTH_CHECK:-0}"
PREFLIGHT_ONLY="${PREFLIGHT_ONLY:-0}"
PRUNE_DOCKER_CACHE="${PRUNE_DOCKER_CACHE:-0}"
MIGRATE_PHASE1="${MIGRATE_PHASE1:-0}"
SEED_SUPER_ADMIN="${SEED_SUPER_ADMIN:-0}"
SEED_SUPER_ADMIN_USERNAME="${SEED_SUPER_ADMIN_USERNAME:-superadmin}"
SEED_SUPER_ADMIN_PASSWORD="${SEED_SUPER_ADMIN_PASSWORD:-}"
LOG_LINES="${LOG_LINES:-100}"

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Deploy SI Kepegawaian dari GitHub langsung di CasaOS/DietPi/STB Armbian.

Usage:
  sh scripts/deploy-casaos-github.sh [options]

Options:
  --repo-url URL              GitHub repo URL
  --branch NAME               Branch yang akan dideploy
  --app-dir PATH              Folder app, default /media/devmon/Local Disk/projects/si-kepegawaian
  --app-port PORT             Port host untuk aplikasi, default 8091
  --app-bind-host HOST        Bind host Docker, default 0.0.0.0
  --app-origin URL            URL publik aplikasi, contoh https://info.kepegawaian.media
  --allowed-origins VALUE     Daftar origin tambahan, default sama dengan app origin
  --jwt-secret VALUE          JWT secret production
  --ukpd-default-password VALUE Password default untuk reset UKPD
  --trust-proxy-headers true|false Percaya header Cloudflare/proxy, default true
  --network-name NAME         Docker network untuk app dan PostgreSQL
  --postgres-container NAME   Nama container PostgreSQL, default sisdmk-postgres
  --postgres-image IMAGE      Image PostgreSQL jika --create-postgres-container aktif
  --postgres-admin-user NAME  User admin PostgreSQL untuk membuat database
  --postgres-database NAME    Nama database aplikasi, default si_data
  --postgres-user NAME        User database aplikasi, default sisdmk_admin
  --postgres-password VALUE   Password user database aplikasi
  --create-postgres-container Buat container PostgreSQL khusus jika belum ada
  --skip-db-create            Jangan buat database PostgreSQL otomatis
  --restore-dump PATH         Restore dump .sql/.tgz yang sudah ada di server
  --restore-user NAME         User PostgreSQL untuk restore dump
  --force-env                 Tulis ulang .env.casaos
  --install-deps              Install git/ca-certificates via apt jika belum ada
  --no-cache                  Build image tanpa cache Docker
  --no-pull                   Jangan pull base image saat build, default aktif untuk STB
  --skip-build                Pull source dan restart tanpa build ulang
  --skip-health-check         Lewati validasi HTTP setelah container start
  --preflight-only            Validasi source/env/database/compose tanpa build/start app
  --prune-docker-cache        Bersihkan build cache dan dangling image sebelum build
  --migrate-phase1            Jalankan migration RBAC/app_users/audit_logs Phase 1
  --seed-super-admin          Buat/reset akun Super Admin setelah app start
  --super-admin-username NAME Username Super Admin, default superadmin
  --super-admin-password VALUE Password Super Admin, minimal 12 karakter
  -h, --help                  Tampilkan bantuan

Contoh:
  sh deploy-casaos-github.sh --install-deps --force-env --app-origin https://dinkes.kepegawaian.media --postgres-password 'PASSWORD_DB'
USAGE
}

need_value() {
  [ $# -ge 2 ] || die "Argumen $1 butuh nilai."
}

while [ $# -gt 0 ]; do
  case "$1" in
    --repo-url)
      need_value "$@"
      REPO_URL="$2"
      shift 2
      ;;
    --branch)
      need_value "$@"
      BRANCH="$2"
      shift 2
      ;;
    --app-dir)
      need_value "$@"
      APP_DIR="$2"
      SOURCE_DIR="$APP_DIR/source"
      shift 2
      ;;
    --app-port)
      need_value "$@"
      APP_PORT="$2"
      shift 2
      ;;
    --app-bind-host)
      need_value "$@"
      APP_BIND_HOST="$2"
      shift 2
      ;;
    --app-origin)
      need_value "$@"
      APP_ORIGIN="$2"
      shift 2
      ;;
    --allowed-origins)
      need_value "$@"
      ALLOWED_ORIGINS="$2"
      shift 2
      ;;
    --jwt-secret)
      need_value "$@"
      JWT_SECRET="$2"
      shift 2
      ;;
    --ukpd-default-password)
      need_value "$@"
      UKPD_DEFAULT_PASSWORD="$2"
      shift 2
      ;;
    --trust-proxy-headers)
      need_value "$@"
      TRUST_PROXY_HEADERS="$2"
      shift 2
      ;;
    --network-name)
      need_value "$@"
      NETWORK_NAME="$2"
      shift 2
      ;;
    --postgres-container)
      need_value "$@"
      POSTGRES_CONTAINER="$2"
      POSTGRES_HOST="$POSTGRES_CONTAINER"
      POSTGRES_HOSTS="$POSTGRES_CONTAINER,host.docker.internal,172.17.0.1,postgres,db,127.0.0.1"
      shift 2
      ;;
    --postgres-image)
      need_value "$@"
      POSTGRES_IMAGE="$2"
      shift 2
      ;;
    --postgres-admin-user)
      need_value "$@"
      POSTGRES_ADMIN_USER="$2"
      shift 2
      ;;
    --postgres-database)
      need_value "$@"
      POSTGRES_DATABASE="$2"
      POSTGRES_DATABASES="$2"
      shift 2
      ;;
    --postgres-user)
      need_value "$@"
      POSTGRES_USER="$2"
      shift 2
      ;;
    --postgres-password)
      need_value "$@"
      POSTGRES_PASSWORD="$2"
      shift 2
      ;;
    --create-postgres-container)
      CREATE_POSTGRES_CONTAINER="1"
      shift
      ;;
    --skip-db-create)
      ENSURE_DATABASE="0"
      shift
      ;;
    --restore-dump)
      need_value "$@"
      RESTORE_DUMP="$2"
      shift 2
      ;;
    --restore-user)
      need_value "$@"
      RESTORE_USER="$2"
      shift 2
      ;;
    --force-env)
      FORCE_ENV="1"
      shift
      ;;
    --install-deps)
      INSTALL_DEPS="1"
      shift
      ;;
    --no-cache)
      BUILD_NO_CACHE="1"
      shift
      ;;
    --no-pull)
      BUILD_PULL="0"
      shift
      ;;
    --skip-build)
      SKIP_BUILD="1"
      shift
      ;;
    --skip-health-check)
      SKIP_HEALTH_CHECK="1"
      shift
      ;;
    --preflight-only)
      PREFLIGHT_ONLY="1"
      shift
      ;;
    --prune-docker-cache)
      PRUNE_DOCKER_CACHE="1"
      shift
      ;;
    --migrate-phase1)
      MIGRATE_PHASE1="1"
      shift
      ;;
    --seed-super-admin)
      SEED_SUPER_ADMIN="1"
      shift
      ;;
    --super-admin-username)
      need_value "$@"
      SEED_SUPER_ADMIN_USERNAME="$2"
      shift 2
      ;;
    --super-admin-password)
      need_value "$@"
      SEED_SUPER_ADMIN_PASSWORD="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Argumen tidak dikenal: $1"
      ;;
  esac
done

install_deps() {
  [ "$INSTALL_DEPS" = "1" ] || return 0
  command -v apt-get >/dev/null 2>&1 || die "apt-get tidak tersedia untuk --install-deps."

  missing=""
  command -v git >/dev/null 2>&1 || missing="$missing git"
  command -v curl >/dev/null 2>&1 || missing="$missing curl"
  [ -d /etc/ssl/certs ] || missing="$missing ca-certificates"

  if [ -n "$missing" ]; then
    log "Menginstall dependency:$missing"
    apt-get update
    apt-get install -y $missing
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Command '$1' tidak ditemukan."
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
    return
  fi

  if [ -r /dev/urandom ]; then
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | dd bs=48 count=1 2>/dev/null
    printf '\n'
    return
  fi

  date +%s | sha256sum | awk '{print $1}'
}

docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    die "Docker Compose tidak ditemukan."
  fi
}

list_postgres_containers() {
  docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' \
    | awk 'BEGIN { found = 0 } tolower($0) ~ /postgres|pgvector/ { print "  " $0; found = 1 } END { if (found == 0) print "  (tidak ada container PostgreSQL terdeteksi)" }'
}

require_postgres_container() {
  if ! docker ps -a --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    log "Container PostgreSQL '$POSTGRES_CONTAINER' tidak ditemukan."
    log "Container PostgreSQL yang terdeteksi:"
    list_postgres_containers
    die "Set --postgres-container sesuai nama container yang benar, atau buat container PostgreSQL khusus SISDMK."
  fi

  if ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    die "Container PostgreSQL '$POSTGRES_CONTAINER' ada tapi tidak running. Start dulu container database di CasaOS/Docker."
  fi
}

create_postgres_container_if_requested() {
  if docker ps -a --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    return 0
  fi

  [ "$CREATE_POSTGRES_CONTAINER" = "1" ] || return 0

  if [ -z "$POSTGRES_PASSWORD" ]; then
    POSTGRES_PASSWORD="$(generate_secret)"
    log "Password PostgreSQL dibuat otomatis dan akan disimpan di .env.casaos."
  fi

  mkdir -p "$POSTGRES_DATA_DIR"
  docker network inspect "$NETWORK_NAME" >/dev/null 2>&1 || docker network create "$NETWORK_NAME" >/dev/null

  log "Membuat container PostgreSQL khusus: $POSTGRES_CONTAINER"
  docker run -d \
    --name "$POSTGRES_CONTAINER" \
    --restart unless-stopped \
    --network "$NETWORK_NAME" \
    -e POSTGRES_DB="$POSTGRES_DATABASE" \
    -e POSTGRES_USER="$POSTGRES_USER" \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -v "$POSTGRES_DATA_DIR:/var/lib/postgresql/data" \
    "$POSTGRES_IMAGE" >/dev/null

  tries=1
  while [ "$tries" -le 30 ]; do
    if docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" >/dev/null 2>&1; then
      log "Container PostgreSQL '$POSTGRES_CONTAINER' siap."
      return 0
    fi

    log "Menunggu PostgreSQL siap ($tries/30)..."
    tries=$((tries + 1))
    sleep 2
  done

  docker logs --tail "$LOG_LINES" "$POSTGRES_CONTAINER" || true
  die "Container PostgreSQL '$POSTGRES_CONTAINER' belum siap."
}

prune_docker_cache() {
  [ "$PRUNE_DOCKER_CACHE" = "1" ] || return 0

  log "Membersihkan Docker build cache dan dangling image..."
  docker builder prune -af
  docker image prune -f
}

remove_stale_app_container() {
  if docker ps -a --format '{{.Names}}' | grep -qx "sisdmk2-app"; then
    log "Menghapus container app lama agar tidak bentrok nama: sisdmk2-app"
    docker rm -f sisdmk2-app >/dev/null 2>&1 || true
  fi
}

validate_compose_config() {
  cd "$SOURCE_DIR"
  log "Validasi Docker Compose config..."
  if docker_compose --env-file .env.casaos -f docker-compose.casaos.yml config --quiet >/dev/null 2>&1; then
    return 0
  fi

  docker_compose --env-file .env.casaos -f docker-compose.casaos.yml config >/dev/null
}

container_env_value() {
  container_name="$1"
  env_key="$2"

  docker inspect "$container_name" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= -v key="$env_key" '$1 == key {sub(/^[^=]*=/, ""); print; exit}'
}

auto_detect_postgres_password() {
  [ -z "$POSTGRES_PASSWORD" ] || return 0

  if docker ps -a --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    detected_password="$(container_env_value "$POSTGRES_CONTAINER" POSTGRES_PASSWORD || true)"
    if [ -n "$detected_password" ]; then
      POSTGRES_PASSWORD="$detected_password"
      log "Password PostgreSQL otomatis dibaca dari env container '$POSTGRES_CONTAINER'."
    fi
  fi
}

detect_app_origin() {
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [ -z "$host_ip" ]; then
    host_ip="127.0.0.1"
  fi
  printf 'http://%s:%s\n' "$host_ip" "$APP_PORT"
}

write_env_file() {
  env_file="$APP_DIR/.env.casaos"

  if [ "$FORCE_ENV" != "1" ] && [ -f "$env_file" ]; then
    log "Memakai env yang sudah ada: $env_file"
    return
  fi

  if [ -z "$APP_ORIGIN" ]; then
    APP_ORIGIN="$(detect_app_origin)"
  fi

  if [ -z "$ALLOWED_ORIGINS" ]; then
    ALLOWED_ORIGINS="$APP_ORIGIN"
  fi

  if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET="$(generate_secret)"
  fi

  if [ -z "$POSTGRES_PASSWORD" ]; then
    POSTGRES_PASSWORD="$(generate_secret)"
  fi

  if [ -z "$COOKIE_SECURE" ]; then
    case "$APP_ORIGIN" in
      https://*) COOKIE_SECURE="true" ;;
      *) COOKIE_SECURE="false" ;;
    esac
  fi

  if [ -z "$ALLOW_INSECURE_LOCAL_HTTP" ]; then
    case "$APP_ORIGIN" in
      https://*) ALLOW_INSECURE_LOCAL_HTTP="false" ;;
      *) ALLOW_INSECURE_LOCAL_HTTP="true" ;;
    esac
  fi

  mkdir -p "$PROJECTS_ROOT" "$APP_DIR" "$SOURCE_DIR" "$BACKUP_DIR" "$UPLOADS_DIR" "$POSTGRES_DATA_DIR" "$DOCKER_DIR"
  umask 077
  cat > "$env_file" <<ENV
PROJECTS_ROOT="$PROJECTS_ROOT"
BACKUP_DIR="$BACKUP_DIR"
UPLOADS_DIR="$UPLOADS_DIR"
POSTGRES_DATA_DIR="$POSTGRES_DATA_DIR"
DOCKER_DIR="$DOCKER_DIR"
APP_PORT=$APP_PORT
APP_BIND_HOST=$APP_BIND_HOST
JWT_SECRET=$JWT_SECRET
APP_URL=$APP_ORIGIN
APP_ORIGIN=$APP_ORIGIN
ALLOWED_ORIGINS=$ALLOWED_ORIGINS
ALLOW_INSECURE_LOCAL_HTTP=$ALLOW_INSECURE_LOCAL_HTTP
COOKIE_SECURE=$COOKIE_SECURE
TRUST_PROXY_HEADERS=$TRUST_PROXY_HEADERS
UKPD_DEFAULT_PASSWORD=$UKPD_DEFAULT_PASSWORD
POSTGRES_HOST=$POSTGRES_HOST
POSTGRES_HOSTS=$POSTGRES_HOSTS
POSTGRES_PORT=$POSTGRES_PORT
POSTGRES_DATABASE=$POSTGRES_DATABASE
POSTGRES_DATABASES=$POSTGRES_DATABASES
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_CONNECT_TIMEOUT_MS=$POSTGRES_CONNECT_TIMEOUT_MS
POSTGRES_IDLE_TIMEOUT_MS=$POSTGRES_IDLE_TIMEOUT_MS
POSTGRES_POOL_MAX=$POSTGRES_POOL_MAX
POSTGRES_POOL_VERIFY_INTERVAL_MS=$POSTGRES_POOL_VERIFY_INTERVAL_MS
POSTGRES_APPLICATION_NAME=$POSTGRES_APPLICATION_NAME
DASHBOARD_CACHE_TTL_MS=$DASHBOARD_CACHE_TTL_MS
DASHBOARD_DATA_CACHE_TTL_MS=$DASHBOARD_DATA_CACHE_TTL_MS
ENV

  log "Menulis env: $env_file"
}

sync_source() {
  mkdir -p "$PROJECTS_ROOT" "$APP_DIR" "$BACKUP_DIR" "$UPLOADS_DIR" "$POSTGRES_DATA_DIR" "$DOCKER_DIR"

  if [ -d "$SOURCE_DIR/.git" ]; then
    log "Update source dari GitHub: $SOURCE_DIR"
    cd "$SOURCE_DIR"
    git remote set-url origin "$REPO_URL"
    git fetch --prune origin

    log "Reset source lokal ke origin/$BRANCH..."
    git checkout -B "$BRANCH" "origin/$BRANCH"
    git reset --hard "origin/$BRANCH"
  else
    if [ -e "$SOURCE_DIR" ]; then
      die "$SOURCE_DIR sudah ada tapi bukan repo git."
    fi

    log "Clone source dari GitHub ke $SOURCE_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$SOURCE_DIR"
    cd "$SOURCE_DIR"
  fi
}

cleanup_stale_source_artifacts() {
  cd "$SOURCE_DIR"
  log "Membersihkan sisa file/folder lama yang tidak perlu deploy..."

  for path in \
    .next \
    node_modules \
    out \
    deploy \
    backend \
    frontend \
    tmp \
    .pytest_cache \
    backup \
    proposal \
    "SPBE DATIIN" \
    stitch \
    sql \
    database
  do
    if [ -e "$path" ]; then
      rm -rf -- "$path"
      log "Dihapus: $path"
    fi
  done

  find . -maxdepth 1 -type f \
    \( -name '*.log' -o -name '*.docx' -o -name '*.xlsx' -o -name '*.pdf' -o -name '*.zip' -o -name '*.tgz' -o -name '*.tar.gz' \) \
    -delete
}

connect_container_to_network() {
  container_name="$1"

  if docker ps -a --format '{{.Names}}' | grep -qx "$container_name"; then
    docker network connect "$NETWORK_NAME" "$container_name" >/dev/null 2>&1 || true
    log "Container '$container_name' dipastikan terhubung ke network '$NETWORK_NAME'."
  else
    log "Peringatan: container '$container_name' tidak ditemukan."
  fi
}

connect_app_networks() {
  docker network inspect "$NETWORK_NAME" >/dev/null 2>&1 || docker network create "$NETWORK_NAME" >/dev/null

  connect_container_to_network "$POSTGRES_CONTAINER"
}

postgres_can_connect() {
  candidate_user="$1"
  candidate_db="$2"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$POSTGRES_CONTAINER" psql -U "$candidate_user" -d "$candidate_db" -tAc "SELECT 1" >/dev/null 2>&1
}

pick_admin_user() {
  for candidate in "$POSTGRES_ADMIN_USER" "$POSTGRES_USER" sisdmk_admin postgres; do
    [ -n "$candidate" ] || continue
    if postgres_can_connect "$candidate" postgres || postgres_can_connect "$candidate" "$POSTGRES_DATABASE"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

ensure_postgres_database() {
  if [ "$ENSURE_DATABASE" != "1" ]; then
    if postgres_can_connect "$POSTGRES_USER" "$POSTGRES_DATABASE"; then
      log "Database PostgreSQL '$POSTGRES_DATABASE' sudah bisa diakses oleh user '$POSTGRES_USER'."
      return 0
    fi

    die "--skip-db-create aktif, tetapi user '$POSTGRES_USER' belum bisa akses database '$POSTGRES_DATABASE'. Periksa --postgres-user, --postgres-database, dan password."
  fi

  if postgres_can_connect "$POSTGRES_USER" "$POSTGRES_DATABASE"; then
    log "Database PostgreSQL '$POSTGRES_DATABASE' sudah bisa diakses oleh user '$POSTGRES_USER'."
    return 0
  fi

  admin_user="$(pick_admin_user || true)"
  if [ -z "$admin_user" ]; then
    die "Tidak bisa login ke PostgreSQL. Coba jalankan dengan --postgres-admin-user USER_ADMIN_YANG_BENAR."
  fi

  admin_db="postgres"
  if ! postgres_can_connect "$admin_user" "$admin_db"; then
    admin_db="$POSTGRES_DATABASE"
  fi

  admin_privileges="$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$POSTGRES_CONTAINER" psql -U "$admin_user" -d "$admin_db" -tAc "SELECT CASE WHEN rolsuper OR (rolcreaterole AND rolcreatedb) THEN 'yes' ELSE 'no' END FROM pg_roles WHERE rolname = current_user" 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$admin_privileges" != "yes" ]; then
    die "User PostgreSQL '$admin_user' tidak punya hak CREATEROLE/CREATEDB. Pakai admin yang benar, buat DB/user manual lalu gunakan --skip-db-create, atau gunakan container PostgreSQL khusus SISDMK."
  fi

  sql_password="$(printf '%s' "$POSTGRES_PASSWORD" | sed "s/'/''/g")"

  log "Memastikan database PostgreSQL '$POSTGRES_DATABASE' dan user '$POSTGRES_USER' tersedia..."
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$admin_user" -d "$admin_db" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$POSTGRES_USER') THEN
    CREATE ROLE "$POSTGRES_USER" LOGIN PASSWORD '$sql_password';
  ELSE
    ALTER ROLE "$POSTGRES_USER" WITH LOGIN PASSWORD '$sql_password';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE "$POSTGRES_DATABASE" OWNER "$POSTGRES_USER"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$POSTGRES_DATABASE')\gexec

GRANT ALL PRIVILEGES ON DATABASE "$POSTGRES_DATABASE" TO "$POSTGRES_USER";
SQL
}

extract_restore_sql() {
  dump_path="$1"
  tmp_dir="$2"

  case "$dump_path" in
    *.tgz|*.tar.gz)
      tar -xzf "$dump_path" -C "$tmp_dir"
      find "$tmp_dir" -type f -name '*.sql' | head -n 1
      ;;
    *.sql)
      printf '%s\n' "$dump_path"
      ;;
    *)
      die "Format dump tidak dikenal. Pakai .sql, .tgz, atau .tar.gz."
      ;;
  esac
}

restore_dump() {
  [ -n "$RESTORE_DUMP" ] || return 0
  [ -f "$RESTORE_DUMP" ] || die "File dump tidak ditemukan: $RESTORE_DUMP"

  if ! docker ps -a --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    die "Container PostgreSQL '$POSTGRES_CONTAINER' tidak ditemukan untuk restore."
  fi

  restore_user="$RESTORE_USER"
  if [ -z "$restore_user" ]; then
    restore_user="$POSTGRES_ADMIN_USER"
  fi
  if [ -z "$restore_user" ]; then
    restore_user="$POSTGRES_USER"
  fi

  tmp_dir="$APP_DIR/tmp/sisdmk2-restore-$$"
  mkdir -p "$tmp_dir"
  sql_file="$(extract_restore_sql "$RESTORE_DUMP" "$tmp_dir")"
  [ -n "$sql_file" ] && [ -f "$sql_file" ] || die "File SQL tidak ditemukan di dump: $RESTORE_DUMP"

  log "Restore dump ke database '$POSTGRES_DATABASE' dari $sql_file"
  docker cp "$sql_file" "$POSTGRES_CONTAINER:/tmp/sisdmk2_restore.sql"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i "$POSTGRES_CONTAINER" psql -U "$restore_user" -d "$POSTGRES_DATABASE" -v ON_ERROR_STOP=1 -f /tmp/sisdmk2_restore.sql
  docker exec "$POSTGRES_CONTAINER" rm -f /tmp/sisdmk2_restore.sql >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}

check_app() {
  tries=1
  while [ "$tries" -le 12 ]; do
    if docker exec sisdmk2-app npm run check:postgres; then
      return 0
    fi

    log "Aplikasi belum berhasil konek database, coba lagi dalam 5 detik ($tries/12)..."
    tries=$((tries + 1))
    sleep 5
  done

  die "Cek koneksi PostgreSQL dari app gagal."
}

run_phase1_migration() {
  [ "$MIGRATE_PHASE1" = "1" ] || return 0

  log "Menjalankan migration Phase 1 RBAC/app_users/audit_logs..."
  docker exec sisdmk2-app npm run migrate:phase1
}

seed_super_admin() {
  [ "$SEED_SUPER_ADMIN" = "1" ] || return 0

  if [ -z "$SEED_SUPER_ADMIN_PASSWORD" ]; then
    die "Isi --super-admin-password atau env SEED_SUPER_ADMIN_PASSWORD untuk --seed-super-admin."
  fi

  if [ "${#SEED_SUPER_ADMIN_PASSWORD}" -lt 12 ]; then
    die "Password Super Admin minimal 12 karakter."
  fi

  log "Membuat/reset akun Super Admin '$SEED_SUPER_ADMIN_USERNAME'..."
  docker exec \
    -e SEED_SUPER_ADMIN_USERNAME="$SEED_SUPER_ADMIN_USERNAME" \
    -e SEED_SUPER_ADMIN_PASSWORD="$SEED_SUPER_ADMIN_PASSWORD" \
    sisdmk2-app npm run seed:phase1
}

build_and_start_app() {
  cd "$SOURCE_DIR"

  if [ "$SKIP_BUILD" = "1" ]; then
    log "Build Docker dilewati karena --skip-build aktif."
  elif [ "$BUILD_NO_CACHE" = "1" ] && [ "$BUILD_PULL" = "1" ]; then
    log "Build image Docker aplikasi dengan --pull --no-cache..."
    docker_compose --env-file .env.casaos -f docker-compose.casaos.yml build --pull --no-cache app
  elif [ "$BUILD_NO_CACHE" = "1" ]; then
    log "Build image Docker aplikasi dengan --no-cache..."
    docker_compose --env-file .env.casaos -f docker-compose.casaos.yml build --no-cache app
  elif [ "$BUILD_PULL" = "1" ]; then
    log "Build image Docker aplikasi dengan --pull..."
    docker_compose --env-file .env.casaos -f docker-compose.casaos.yml build --pull app
  else
    log "Build image Docker aplikasi..."
    docker_compose --env-file .env.casaos -f docker-compose.casaos.yml build app
  fi

  remove_stale_app_container

  log "Start/recreate container aplikasi..."
  docker_compose --env-file .env.casaos -f docker-compose.casaos.yml up -d --force-recreate app
}

wait_for_http_health() {
  [ "$SKIP_HEALTH_CHECK" = "1" ] && return 0

  health_url="http://127.0.0.1:$APP_PORT/api/health"
  tries=1

  log "Menunggu health check HTTP: $health_url"
  while [ "$tries" -le 30 ]; do
    if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 5 "$health_url" >/dev/null 2>&1; then
      log "Health check HTTP berhasil."
      return 0
    fi

    container_state="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' sisdmk2-app 2>/dev/null || true)"
    log "Aplikasi belum siap ($tries/30). Container: ${container_state:-unknown}"
    tries=$((tries + 1))
    sleep 3
  done

  docker logs --tail "$LOG_LINES" sisdmk2-app || true
  die "Health check HTTP gagal: $health_url"
}

show_summary() {
  log ""
  docker ps --filter "name=sisdmk2-app" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  log ""
  log "Deploy selesai."
  log "Source   : $SOURCE_DIR"
  log "Branch   : $BRANCH"
  log "Aplikasi : $APP_ORIGIN"
  log "Local    : http://127.0.0.1:$APP_PORT"
  log "Container: sisdmk2-app"
}

install_deps
require_command git
require_command docker
create_postgres_container_if_requested
require_postgres_container

sync_source
cleanup_stale_source_artifacts
auto_detect_postgres_password
write_env_file
cp "$APP_DIR/.env.casaos" "$SOURCE_DIR/.env.casaos"
cp "$APP_DIR/.env.casaos" "$SOURCE_DIR/.env"

connect_app_networks
ensure_postgres_database
restore_dump
validate_compose_config

if [ "$PREFLIGHT_ONLY" = "1" ]; then
  log "Preflight berhasil. Build/start app dilewati karena --preflight-only aktif."
  exit 0
fi

prune_docker_cache
build_and_start_app
check_app
run_phase1_migration
seed_super_admin
wait_for_http_health

show_summary
