#!/usr/bin/env bash
set -Eeuo pipefail

PROJECTS_ROOT="${PROJECTS_ROOT:-/media/devmon/Local Disk/projects}"
APP_DIR="${APP_DIR:-$PROJECTS_ROOT/si-kepegawaian}"
SOURCE_DIR="${SOURCE_DIR:-$APP_DIR/source}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECTS_ROOT/backup}"

APP_CONTAINER="${APP_CONTAINER:-sisdmk2-app}"
CONTAINER_IMPORT_DIR="${CONTAINER_IMPORT_DIR:-/tmp/sisdmk2-import}"
SHEET_NAME="${SHEET_NAME:-${2:-Mei 2026}}"
INPUT_FILE="${1:-}"

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

print_section() {
  printf '\n%s==== %s ====%s\n' "$C_YELLOW" "$1" "$C_RESET" >&2
}

usage() {
  cat <<USAGE
Import data PLT/PLH Excel ke PostgreSQL server CasaOS.

Usage:
  scripts/import-plt-server.sh "/path/file-monitoring.xlsx" "Mei 2026"

Default:
  APP_DIR=$APP_DIR
  SOURCE_DIR=$SOURCE_DIR
  ENV_FILE=$ENV_FILE
  APP_CONTAINER=$APP_CONTAINER
  SHEET_NAME=$SHEET_NAME

Contoh upload dari komputer lokal ke server:
  scp "MONITORING PLT-PLH (1).xlsx" admin@IP_SERVER_ONLINE:'/media/devmon/Local Disk/projects/backup/'

Contoh import di server:
  cd '/media/devmon/Local Disk/projects/si-kepegawaian/source'
  ./scripts/import-plt-server.sh "/media/devmon/Local Disk/projects/backup/MONITORING PLT-PLH (1).xlsx" "Mei 2026"
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

load_env_file() {
  [ -f "$ENV_FILE" ] || {
    fail "Env file tidak ditemukan: $ENV_FILE"
    return 1
  }

  while IFS='=' read -r key value; do
    key="$(printf '%s' "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    value="$(printf '%s' "${value:-}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    value="${value#\"}"
    value="${value%\"}"
    value="${value#\'}"
    value="${value%\'}"
    case "$key" in
      POSTGRES_HOST|POSTGRES_PORT|POSTGRES_DATABASE|POSTGRES_USER|POSTGRES_PASSWORD)
        if [ -z "${!key:-}" ]; then
          printf -v "$key" '%s' "$value"
          export "$key"
        fi
        ;;
    esac
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE")

  POSTGRES_HOST="${POSTGRES_HOST:-sisdmk-postgres}"
  POSTGRES_PORT="${POSTGRES_PORT:-5432}"
  POSTGRES_DATABASE="${POSTGRES_DATABASE:-si_data}"
  POSTGRES_USER="${POSTGRES_USER:-sisdmk_admin}"
  POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-$POSTGRES_HOST}"

  [ -n "${POSTGRES_PASSWORD:-}" ] || {
    fail "POSTGRES_PASSWORD tidak ditemukan di $ENV_FILE"
    return 1
  }
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    fail "Command '$1' tidak ditemukan."
    return 1
  }
}

diagnostics() {
  exit_code=$?
  fail "Import PLT/PLH gagal pada line ${BASH_LINENO[0]} dengan exit code $exit_code."

  print_section "docker ps"
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' >&2 || true

  print_section "docker logs $APP_CONTAINER"
  docker logs --tail "$LOG_LINES" "$APP_CONTAINER" >&2 || true

  print_section "File backup tersedia"
  ls -lh "$BACKUP_DIR" >&2 || true

  exit "$exit_code"
}

trap diagnostics ERR

ensure_prerequisites() {
  need_cmd docker
  need_cmd gzip

  [ -n "$INPUT_FILE" ] || {
    usage
    fail "Path file Excel wajib diisi."
    return 1
  }

  [ -f "$INPUT_FILE" ] || {
    fail "File Excel tidak ditemukan: $INPUT_FILE"
    warn "Upload dulu ke server, contoh:"
    warn "scp \"MONITORING PLT-PLH (1).xlsx\" admin@IP_SERVER_ONLINE:'/media/devmon/Local Disk/projects/backup/'"
    return 1
  }

  [ -d "$SOURCE_DIR" ] || {
    fail "Source dir tidak ditemukan: $SOURCE_DIR"
    return 1
  }

  docker inspect "$APP_CONTAINER" >/dev/null 2>&1 || {
    fail "Container app tidak ditemukan: $APP_CONTAINER"
    return 1
  }

  docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1 || {
    fail "Container PostgreSQL tidak ditemukan: $POSTGRES_CONTAINER"
    warn "Jika nama container berbeda, jalankan:"
    warn "POSTGRES_CONTAINER=nama_container ./scripts/import-plt-server.sh \"$INPUT_FILE\" \"$SHEET_NAME\""
    return 1
  }
}

backup_table() {
  mkdir -p "$BACKUP_DIR"
  stamp="$(date '+%Y%m%d_%H%M%S')"
  backup_file="$BACKUP_DIR/pejabat_plt_plh_before_import_$stamp.sql.gz"

  if ! table_exists; then
    warn "Tabel public.pejabat_plt_plh belum ada, backup tabel dilewati."
    return 0
  fi

  log "Backup tabel public.pejabat_plt_plh ke $backup_file"
  docker exec \
    -e PGPASSWORD="$POSTGRES_PASSWORD" \
    "$POSTGRES_CONTAINER" \
    pg_dump \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DATABASE" \
      --table public.pejabat_plt_plh \
      --clean \
      --if-exists \
      --no-owner \
      --no-privileges \
    | gzip > "$backup_file"

  ok "Backup selesai: $backup_file"
}

table_exists() {
  docker exec -i \
    -e PGPASSWORD="$POSTGRES_PASSWORD" \
    "$POSTGRES_CONTAINER" \
    psql \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DATABASE" \
      -tAc "SELECT to_regclass('public.pejabat_plt_plh') IS NOT NULL;" \
    | grep -q t
}

count_rows() {
  label="$1"
  print_section "$label"

  if ! table_exists; then
    warn "Tabel public.pejabat_plt_plh belum ada."
    return 0
  fi

  docker exec -i \
    -e PGPASSWORD="$POSTGRES_PASSWORD" \
    "$POSTGRES_CONTAINER" \
    psql \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DATABASE" \
      -v ON_ERROR_STOP=1 \
      -c "SELECT jenis_penugasan, COUNT(*) AS total FROM public.pejabat_plt_plh GROUP BY jenis_penugasan ORDER BY jenis_penugasan;"
}

import_excel() {
  base_name="$(basename "$INPUT_FILE")"
  container_file="$CONTAINER_IMPORT_DIR/$base_name"

  log "Menyalin Excel ke container app: $container_file"
  docker exec "$APP_CONTAINER" mkdir -p "$CONTAINER_IMPORT_DIR"
  docker cp "$INPUT_FILE" "$APP_CONTAINER:$container_file"

  log "Menjalankan import PLT/PLH dari sheet: $SHEET_NAME"
  docker exec \
    -e NODE_ENV=production \
    "$APP_CONTAINER" \
    npm run import:plt-plh -- "$container_file" "$SHEET_NAME"

  ok "Import script selesai."
}

cleanup_container_file() {
  [ -n "${container_file:-}" ] || return 0
  docker exec "$APP_CONTAINER" rm -f "$container_file" >/dev/null 2>&1 || true
}

show_summary() {
  print_section "docker logs $APP_CONTAINER"
  docker logs --tail 40 "$APP_CONTAINER" || true

  cat <<SUMMARY

Import PLT/PLH selesai.
- File Excel     : $INPUT_FILE
- Sheet          : $SHEET_NAME
- App container  : $APP_CONTAINER
- DB container   : $POSTGRES_CONTAINER
- Database       : $POSTGRES_DATABASE
- User           : $POSTGRES_USER
- Backup folder  : $BACKUP_DIR
SUMMARY
}

main() {
  load_env_file
  ensure_prerequisites
  count_rows "Jumlah data sebelum import"
  backup_table
  import_excel
  cleanup_container_file
  count_rows "Jumlah data setelah import"
  show_summary
}

main "$@"
