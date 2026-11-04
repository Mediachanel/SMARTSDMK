#!/usr/bin/env bash
set -Eeuo pipefail

PROJECTS_ROOT="${PROJECTS_ROOT:-/media/devmon/Local Disk/projects}"
APP_DIR="${APP_DIR:-$PROJECTS_ROOT/si-kepegawaian}"
SOURCE_DIR="${SOURCE_DIR:-$APP_DIR/source}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
BRANCH="${BRANCH:-main}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECTS_ROOT/backup}"
UPLOADS_DIR="${UPLOADS_DIR:-$PROJECTS_ROOT/uploads/si-kepegawaian}"

CONTAINER_NAME="${CONTAINER_NAME:-sisdmk2-app}"
IMAGE_NAME="${IMAGE_NAME:-sisdmk2-app:latest}"
BUILD_PULL="${BUILD_PULL:-0}"

PUBLIC_HOST="${PUBLIC_HOST:-0.0.0.0}"
PUBLIC_PORT="${PUBLIC_PORT:-8091}"
INTERNAL_PORT="${INTERNAL_PORT:-3000}"
LAN_IP="${LAN_IP:-172.31.254.175}"
DOMAIN="${DOMAIN:-https://dinkes.kepegawaian.media}"

HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_SLEEP_SECONDS="${HEALTH_SLEEP_SECONDS:-3}"
LOG_LINES="${LOG_LINES:-160}"

if [ -t 1 ]; then
  C_RESET="$(printf '\033[0m')"
  C_RED="$(printf '\033[31m')"
  C_GREEN="$(printf '\033[32m')"
  C_YELLOW="$(printf '\033[33m')"
  C_BLUE="$(printf '\033[34m')"
else
  C_RESET=""
  C_RED=""
  C_GREEN=""
  C_YELLOW=""
  C_BLUE=""
fi

log() {
  printf '%s[%s]%s %s\n' "$C_BLUE" "$(date '+%Y-%m-%d %H:%M:%S')" "$C_RESET" "$*"
}

ok() {
  printf '%s[OK]%s %s\n' "$C_GREEN" "$C_RESET" "$*"
}

warn() {
  printf '%s[WARN]%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2
}

fail() {
  printf '%s[FAIL]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    fail "Command '$1' tidak ditemukan."
    return 1
  }
}

run_step() {
  log "$*"
  "$@"
}

print_section() {
  printf '\n%s==== %s ====%s\n' "$C_YELLOW" "$1" "$C_RESET" >&2
}

show_port_conflicts() {
  print_section "Port yang memakai :$PUBLIC_PORT"
  if command -v ss >/dev/null 2>&1; then
    ss -tulpn 2>/dev/null | grep -E "(:|\\*)$PUBLIC_PORT\\b|:$PUBLIC_PORT[[:space:]]" >&2 || true
  else
    warn "Command 'ss' tidak tersedia, melewati cek port detail."
  fi

  print_section "Container dengan publish port $PUBLIC_PORT"
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
    | grep -E "(NAMES|0\\.0\\.0\\.0:$PUBLIC_PORT|127\\.0\\.0\\.1:$PUBLIC_PORT|:$PUBLIC_PORT->)" >&2 || true
}

diagnostics() {
  exit_code=$?
  fail "Redeploy gagal pada line ${BASH_LINENO[0]} dengan exit code $exit_code."

  print_section "docker ps"
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' >&2 || true

  print_section "docker logs $CONTAINER_NAME"
  docker logs --tail "$LOG_LINES" "$CONTAINER_NAME" >&2 || true

  print_section "ss -tulpn"
  if command -v ss >/dev/null 2>&1; then
    ss -tulpn >&2 || true
  else
    warn "Command 'ss' tidak tersedia."
  fi

  print_section "docker images"
  docker images "$IMAGE_NAME" >&2 || true
  docker images | grep -E '^(REPOSITORY|sisdmk2-app[[:space:]])' >&2 || true

  show_port_conflicts
  exit "$exit_code"
}

trap diagnostics ERR

usage() {
  cat <<USAGE
Redeploy SI Kepegawaian untuk CasaOS/DietPi dengan docker run production style.

Usage:
  scripts/redeploy-casaos.sh

Default:
  APP_DIR=$APP_DIR
  SOURCE_DIR=$SOURCE_DIR
  ENV_FILE=$ENV_FILE
  BRANCH=$BRANCH
  CONTAINER_NAME=$CONTAINER_NAME
  IMAGE_NAME=$IMAGE_NAME
  PORT=$PUBLIC_HOST:$PUBLIC_PORT->$INTERNAL_PORT/tcp
  DOMAIN=$DOMAIN

Override via environment variable, contoh:
  PUBLIC_PORT=8092 LAN_IP=172.31.254.175 scripts/redeploy-casaos.sh
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

ensure_prerequisites() {
  need_cmd git
  need_cmd docker
  need_cmd curl
  mkdir -p "$PROJECTS_ROOT" "$BACKUP_DIR" "$UPLOADS_DIR"

  [ -d "$SOURCE_DIR/.git" ] || {
    fail "Source dir bukan repository git: $SOURCE_DIR"
    return 1
  }

  [ -f "$SOURCE_DIR/Dockerfile" ] || {
    fail "Dockerfile tidak ditemukan di $SOURCE_DIR"
    return 1
  }

  [ -f "$ENV_FILE" ] || {
    fail "Env file wajib ada: $ENV_FILE"
    return 1
  }

  if [ "$(id -u)" -ne 0 ] && ! docker ps >/dev/null 2>&1; then
    fail "User ini tidak bisa mengakses Docker. Jalankan dengan root atau user anggota group docker."
    return 1
  fi
}

sync_source() {
  cd "$SOURCE_DIR"

  run_step git fetch --prune origin

  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    run_step git checkout "$BRANCH"
  else
    run_step git checkout -b "$BRANCH" "origin/$BRANCH"
  fi

  run_step git pull --ff-only origin "$BRANCH"
  ok "Source sudah sinkron dengan origin/$BRANCH."
}

build_image() {
  cd "$SOURCE_DIR"
  if [ "$BUILD_PULL" = "1" ]; then
    run_step docker build --pull -t "$IMAGE_NAME" .
  else
    run_step docker build -t "$IMAGE_NAME" .
  fi
  ok "Image terbaru selesai dibuild: $IMAGE_NAME"
}

remove_old_container() {
  if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
    log "Menghentikan container lama: $CONTAINER_NAME"
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true

    log "Menghapus container lama: $CONTAINER_NAME"
    docker rm "$CONTAINER_NAME" >/dev/null
    ok "Container lama sudah dibersihkan."
  else
    ok "Tidak ada container lama bernama $CONTAINER_NAME."
  fi
}

assert_port_available() {
  if command -v ss >/dev/null 2>&1 && ss -tulpn 2>/dev/null | grep -qE "(:|\\*)$PUBLIC_PORT\\b|:$PUBLIC_PORT[[:space:]]"; then
    show_port_conflicts
    fail "Port $PUBLIC_PORT masih dipakai setelah container lama dibersihkan."
    return 1
  fi
}

run_new_container() {
  log "Menjalankan container baru dengan bind publik $PUBLIC_HOST:$PUBLIC_PORT->$INTERNAL_PORT/tcp"
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --env-file "$ENV_FILE" \
    -e NODE_ENV=production \
    -e PORT="$INTERNAL_PORT" \
    -e HOSTNAME=0.0.0.0 \
    --add-host=host.docker.internal:host-gateway \
    -v "$UPLOADS_DIR:/app/storage" \
    -p "$PUBLIC_HOST:$PUBLIC_PORT:$INTERNAL_PORT" \
    "$IMAGE_NAME" >/dev/null

  ok "Container baru berjalan: $CONTAINER_NAME"
}

assert_not_localhost_bind() {
  ports="$(docker port "$CONTAINER_NAME" "$INTERNAL_PORT/tcp" 2>/dev/null || true)"

  printf '%s\n' "$ports" | grep -Fxq "0.0.0.0:$PUBLIC_PORT" || {
    fail "Port mapping tidak sesuai. Ditemukan:"
    printf '%s\n' "$ports" >&2
    fail "Wajib: 0.0.0.0:$PUBLIC_PORT->$INTERNAL_PORT/tcp"
    return 1
  }

  if printf '%s\n' "$ports" | grep -q "127.0.0.1:$PUBLIC_PORT"; then
    fail "Container bind ke localhost, ini tidak kompatibel dengan reverse proxy CasaOS."
    printf '%s\n' "$ports" >&2
    return 1
  fi

  ok "Port mapping valid: 0.0.0.0:$PUBLIC_PORT->$INTERNAL_PORT/tcp"
}

curl_head() {
  url="$1"
  curl -fsS -I --max-time 8 "$url"
}

wait_for_health() {
  local_url="http://127.0.0.1:$PUBLIC_PORT"
  lan_url="http://$LAN_IP:$PUBLIC_PORT"

  log "Menunggu aplikasi hidup: $local_url dan $lan_url"

  attempt=1
  while [ "$attempt" -le "$HEALTH_RETRIES" ]; do
    if curl_head "$local_url" >/dev/null 2>&1 && curl_head "$lan_url" >/dev/null 2>&1; then
      ok "Health check berhasil."
      print_section "curl -I $local_url"
      curl_head "$local_url"
      print_section "curl -I $lan_url"
      curl_head "$lan_url"
      return 0
    fi

    status="$(docker inspect -f '{{.State.Status}} {{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || true)"
    warn "Aplikasi belum siap ($attempt/$HEALTH_RETRIES). Container: ${status:-unknown}"
    sleep "$HEALTH_SLEEP_SECONDS"
    attempt=$((attempt + 1))
  done

  fail "Health check gagal untuk $local_url atau $lan_url."
  return 1
}

show_success_summary() {
  print_section "docker ps"
  docker ps --filter "name=$CONTAINER_NAME" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

  print_section "docker logs $CONTAINER_NAME"
  docker logs --tail 40 "$CONTAINER_NAME" || true

  print_section "ss -tulpn"
  if command -v ss >/dev/null 2>&1; then
    ss -tulpn | grep -E "(State|(:|\\*)$PUBLIC_PORT\\b|:$PUBLIC_PORT[[:space:]])" || true
  else
    warn "Command 'ss' tidak tersedia."
  fi

  print_section "docker images"
  docker images "$IMAGE_NAME"

  cat <<SUMMARY

Deploy selesai.
- Container : $CONTAINER_NAME
- Image     : $IMAGE_NAME
- Branch    : $BRANCH
- Port      : 0.0.0.0:$PUBLIC_PORT->$INTERNAL_PORT/tcp
- Local     : http://127.0.0.1:$PUBLIC_PORT
- CasaOS RP : http://$LAN_IP:$PUBLIC_PORT
- Domain    : $DOMAIN
SUMMARY
}

main() {
  ensure_prerequisites
  sync_source
  build_image
  remove_old_container
  assert_port_available
  run_new_container
  assert_not_localhost_bind
  wait_for_health
  show_success_summary
}

main "$@"
