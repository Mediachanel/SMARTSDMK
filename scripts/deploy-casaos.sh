#!/usr/bin/env sh
set -eu

APP_NAME="${APP_NAME:-sisdmk2}"
PROJECTS_ROOT="${PROJECTS_ROOT:-/media/devmon/Local Disk/projects}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECTS_ROOT/backup}"
UPLOADS_DIR="${UPLOADS_DIR:-$PROJECTS_ROOT/uploads/si-kepegawaian}"
POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-$PROJECTS_ROOT/postgres/data}"
DOCKER_DIR="${DOCKER_DIR:-$PROJECTS_ROOT/docker}"
APP_PORT="${APP_PORT:-8091}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.casaos.yml}"
ENV_FILE="${ENV_FILE:-.env.casaos}"
NETWORK_NAME="${NETWORK_NAME:-sisdmk2-network}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-sisdmk-postgres}"
POSTGRES_HOST="${POSTGRES_HOST:-$POSTGRES_CONTAINER}"
POSTGRES_HOSTS="${POSTGRES_HOSTS:-$POSTGRES_CONTAINER,host.docker.internal,172.17.0.1,postgres,db,127.0.0.1}"
POSTGRES_DATABASE="${POSTGRES_DATABASE:-si_data}"
POSTGRES_DATABASES="${POSTGRES_DATABASES:-si_data}"
POSTGRES_USER="${POSTGRES_USER:-sisdmk_admin}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_CONNECT_TIMEOUT_MS="${POSTGRES_CONNECT_TIMEOUT_MS:-5000}"
POSTGRES_IDLE_TIMEOUT_MS="${POSTGRES_IDLE_TIMEOUT_MS:-30000}"
POSTGRES_POOL_MAX="${POSTGRES_POOL_MAX:-10}"
POSTGRES_POOL_VERIFY_INTERVAL_MS="${POSTGRES_POOL_VERIFY_INTERVAL_MS:-15000}"
POSTGRES_APPLICATION_NAME="${POSTGRES_APPLICATION_NAME:-sisdmk2-app}"
DASHBOARD_CACHE_TTL_MS="${DASHBOARD_CACHE_TTL_MS:-30000}"
DASHBOARD_DATA_CACHE_TTL_MS="${DASHBOARD_DATA_CACHE_TTL_MS:-30000}"
APP_ORIGIN="${APP_ORIGIN:-}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}"
JWT_SECRET="${JWT_SECRET:-}"
ALLOW_INSECURE_LOCAL_HTTP="${ALLOW_INSECURE_LOCAL_HTTP:-}"
COOKIE_SECURE="${COOKIE_SECURE:-}"
TRUST_PROXY_HEADERS="${TRUST_PROXY_HEADERS:-true}"
UKPD_DEFAULT_PASSWORD="${UKPD_DEFAULT_PASSWORD:-}"
FORCE_ENV="${FORCE_ENV:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_DB_CHECK="${SKIP_DB_CHECK:-0}"

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Deploy SI Kepegawaian ke CasaOS/STB Armbian dari folder source project.

Jalankan di server dari:
  /media/devmon/Local Disk/projects/si-kepegawaian/source

Contoh:
  sh scripts/deploy-casaos.sh --app-origin http://IP-CASAOS:8091 --postgres-password PASSWORD_DB

Options:
  --app-port PORT             Port host aplikasi, default 8091
  --app-origin URL            URL aplikasi, contoh http://192.168.1.10:8091
  --jwt-secret VALUE          JWT secret production
  --trust-proxy-headers true|false Percaya header Cloudflare/proxy, default true
  --ukpd-default-password VALUE Password default untuk reset UKPD
  --postgres-container NAME   Nama container PostgreSQL existing, default sisdmk-postgres
  --postgres-host HOST        Host PostgreSQL untuk app
  --postgres-database NAME    Nama database, default si_data
  --postgres-user NAME        User PostgreSQL, default sisdmk_admin
  --postgres-password VALUE   Password PostgreSQL
  --force-env                 Tulis ulang .env.casaos
  --skip-build                Lewati docker compose build
  --skip-db-check             Lewati npm run check:postgres di container
  -h, --help                  Tampilkan bantuan

Environment variable juga bisa dipakai, misalnya:
  APP_ORIGIN=http://192.168.1.10:8091 POSTGRES_PASSWORD=secret sh scripts/deploy-casaos.sh
USAGE
}

need_value() {
  [ $# -ge 2 ] || die "Argumen $1 butuh nilai."
}

while [ $# -gt 0 ]; do
  case "$1" in
    --app-port)
      need_value "$@"
      APP_PORT="$2"
      shift 2
      ;;
    --app-origin)
      need_value "$@"
      APP_ORIGIN="$2"
      shift 2
      ;;
    --jwt-secret)
      need_value "$@"
      JWT_SECRET="$2"
      shift 2
      ;;
    --trust-proxy-headers)
      need_value "$@"
      TRUST_PROXY_HEADERS="$2"
      shift 2
      ;;
    --ukpd-default-password)
      need_value "$@"
      UKPD_DEFAULT_PASSWORD="$2"
      shift 2
      ;;
    --postgres-container)
      need_value "$@"
      POSTGRES_CONTAINER="$2"
      POSTGRES_HOST="$2"
      POSTGRES_HOSTS="$2,host.docker.internal,172.17.0.1,postgres,db,127.0.0.1"
      shift 2
      ;;
    --postgres-host)
      need_value "$@"
      POSTGRES_HOST="$2"
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
    --force-env)
      FORCE_ENV="1"
      shift
      ;;
    --skip-build)
      SKIP_BUILD="1"
      shift
      ;;
    --skip-db-check)
      SKIP_DB_CHECK="1"
      shift
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

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command_exists docker-compose; then
    docker-compose "$@"
  else
    die "Docker Compose tidak ditemukan."
  fi
}

generate_secret() {
  if command_exists openssl; then
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

detect_app_origin() {
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [ -z "$host_ip" ]; then
    host_ip="127.0.0.1"
  fi
  printf 'http://%s:%s\n' "$host_ip" "$APP_PORT"
}

write_env_file() {
  if [ -f "$ENV_FILE" ] && [ "$FORCE_ENV" != "1" ]; then
    log "Memakai env yang sudah ada: $ENV_FILE"
    return
  fi

  if [ -z "$APP_ORIGIN" ]; then
    APP_ORIGIN="$(detect_app_origin)"
  fi

  if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET="$(generate_secret)"
  fi

  if [ -z "$ALLOWED_ORIGINS" ]; then
    ALLOWED_ORIGINS="$APP_ORIGIN"
  fi

  if [ -z "$POSTGRES_PASSWORD" ]; then
    die "POSTGRES_PASSWORD wajib diisi. Pakai --postgres-password atau set env POSTGRES_PASSWORD."
  fi

  if [ -z "${COOKIE_SECURE:-}" ]; then
    case "$APP_ORIGIN" in
      https://*) COOKIE_SECURE="true" ;;
      *) COOKIE_SECURE="false" ;;
    esac
  fi

  if [ -z "${ALLOW_INSECURE_LOCAL_HTTP:-}" ]; then
    case "$APP_ORIGIN" in
      https://*) ALLOW_INSECURE_LOCAL_HTTP="false" ;;
      *) ALLOW_INSECURE_LOCAL_HTTP="true" ;;
    esac
  fi

  mkdir -p "$PROJECTS_ROOT" "$BACKUP_DIR" "$UPLOADS_DIR" "$POSTGRES_DATA_DIR" "$DOCKER_DIR"
  umask 077
  cat >"$ENV_FILE" <<EOF
PROJECTS_ROOT="$PROJECTS_ROOT"
BACKUP_DIR="$BACKUP_DIR"
UPLOADS_DIR="$UPLOADS_DIR"
POSTGRES_DATA_DIR="$POSTGRES_DATA_DIR"
DOCKER_DIR="$DOCKER_DIR"
APP_PORT=$APP_PORT
POSTGRES_PORT=$POSTGRES_PORT
POSTGRES_CONNECT_TIMEOUT_MS=$POSTGRES_CONNECT_TIMEOUT_MS
POSTGRES_IDLE_TIMEOUT_MS=$POSTGRES_IDLE_TIMEOUT_MS
POSTGRES_POOL_MAX=$POSTGRES_POOL_MAX
POSTGRES_POOL_VERIFY_INTERVAL_MS=$POSTGRES_POOL_VERIFY_INTERVAL_MS
POSTGRES_APPLICATION_NAME=$POSTGRES_APPLICATION_NAME
DASHBOARD_CACHE_TTL_MS=$DASHBOARD_CACHE_TTL_MS
DASHBOARD_DATA_CACHE_TTL_MS=$DASHBOARD_DATA_CACHE_TTL_MS

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
POSTGRES_DATABASE=$POSTGRES_DATABASE
POSTGRES_DATABASES=$POSTGRES_DATABASES
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
EOF
  log "Env production ditulis ke $ENV_FILE"
}

ensure_network() {
  if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    log "Network Docker sudah ada: $NETWORK_NAME"
  else
    docker network create "$NETWORK_NAME" >/dev/null
    log "Network Docker dibuat: $NETWORK_NAME"
  fi

  if docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
    if docker inspect "$POSTGRES_CONTAINER" --format '{{json .NetworkSettings.Networks}}' | grep -q "\"$NETWORK_NAME\""; then
      log "Container database sudah terhubung ke $NETWORK_NAME"
    else
      docker network connect "$NETWORK_NAME" "$POSTGRES_CONTAINER" || true
      log "Container database dihubungkan ke $NETWORK_NAME"
    fi
  else
    log "Container database '$POSTGRES_CONTAINER' tidak ditemukan, app tetap memakai fallback POSTGRES_HOSTS."
  fi
}

main() {
  [ -f "$COMPOSE_FILE" ] || die "File compose tidak ditemukan: $COMPOSE_FILE"
  [ -f Dockerfile ] || die "Dockerfile tidak ditemukan. Jalankan script dari root project."
  command_exists docker || die "Docker tidak ditemukan."

  write_env_file
  ensure_network

  if [ "$SKIP_BUILD" = "1" ]; then
    log "Lewati build image karena --skip-build aktif."
  else
    log "Build image Docker aplikasi..."
    docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build app
  fi

  log "Menjalankan container aplikasi..."
  docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d app

  if [ "$SKIP_DB_CHECK" = "1" ]; then
    log "Lewati cek database karena --skip-db-check aktif."
  else
    log "Cek koneksi PostgreSQL dari container app..."
    docker exec sisdmk2-app npm run check:postgres
  fi

  log ""
  log "Deploy selesai."
  log "Aplikasi: $APP_ORIGIN"
  log "Container: sisdmk2-app"
  log "Compose: $COMPOSE_FILE"
}

main
