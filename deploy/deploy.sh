#!/usr/bin/env bash
# =====================================================================
#  Despliegue del ERP Jamaroff con un solo comando (se corre como root):
#
#      erp-jamaroff-deploy            -> trae lo nuevo de GitHub y despliega
#      erp-jamaroff-deploy --force    -> recompila y reinicia aunque no haya cambios
#
#  Qué hace:
#   1. Revisa si hay cambios en GitHub (si no hay, no toca nada)
#   2. Respalda la base de datos (guarda los últimos 15 respaldos)
#   3. git pull, pnpm install, migraciones y build (como el usuario erpjamaroff)
#   4. Actualiza los servicios systemd si cambiaron en el repo y reinicia
#   5. Verifica que la API y la web respondan
#   Si algo falla después del pull, vuelve solo a la versión anterior.
# =====================================================================
set -Eeuo pipefail

APP_USER=erpjamaroff
APP_DIR=/home/erpjamaroff/erp-jamaroff
BACKUP_DIR=/home/erpjamaroff/backups
KEEP_BACKUPS=15
SERVICES=(erp-jamaroff-api erp-jamaroff-web)
LOG_FILE=/var/log/erp-jamaroff-deploy.log
LOCK_FILE=/run/erp-jamaroff-deploy.lock

# El script se copia a /tmp antes de correr: así "git pull" puede cambiar
# este mismo archivo sin romper el despliegue que está en curso.
if [[ "${ERP_DEPLOY_COPY:-}" != "1" ]]; then
  tmp=$(mktemp /tmp/erp-jamaroff-deploy.XXXXXX)
  cp "$(readlink -f "$0")" "$tmp"
  chmod 700 "$tmp"
  ERP_DEPLOY_COPY=1 exec bash "$tmp" "$@"
fi
trap 'rm -f "$0"' EXIT

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

# ---------- utilidades ----------
c_ok=$'\e[32m'; c_err=$'\e[31m'; c_step=$'\e[36m'; c_off=$'\e[0m'
log()  { echo "${c_step}==>${c_off} $*"; }
ok()   { echo "${c_ok}✔${c_off} $*"; }
fail() { echo "${c_err}✘ $*${c_off}" >&2; }

# Corre un comando como erpjamaroff, dentro del proyecto y con su pnpm
as_app() {
  sudo -u "$APP_USER" -H env PATH="/home/$APP_USER/.local/bin:/usr/local/bin:/usr/bin:/bin" \
    bash -c "cd '$APP_DIR' && $*"
}

env_value() { grep -E "^$1=" "$APP_DIR/.env" | tail -1 | cut -d= -f2-; }

# Espera hasta que la API y la web respondan (máx ~60 s)
health_check() {
  local api_port web_port
  api_port=$(env_value API_PORT); web_port=$(env_value WEB_PORT)
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${api_port:-4101}/api/health" | grep -q '"connected":true' &&
       curl -fsS -o /dev/null "http://127.0.0.1:${web_port:-3101}/login"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

restart_services() {
  # Si los archivos de servicio cambiaron en el repo, se reinstalan
  local changed=0
  for s in "${SERVICES[@]}"; do
    if ! cmp -s "$APP_DIR/deploy/$s.service" "/etc/systemd/system/$s.service"; then
      cp "$APP_DIR/deploy/$s.service" "/etc/systemd/system/$s.service"
      changed=1
    fi
  done
  if (( changed )); then
    systemctl daemon-reload
    ok "Servicios systemd actualizados"
  fi
  systemctl restart "${SERVICES[@]}"
}

# ---------- comienzo ----------
[[ $EUID -eq 0 ]] || { fail "Córrelo como root (sudo erp-jamaroff-deploy)"; exit 1; }

exec > >(tee -a "$LOG_FILE") 2>&1
echo
echo "================ Despliegue $(date '+%Y-%m-%d %H:%M:%S') ================"

# Un solo despliegue a la vez
exec 9>"$LOCK_FILE"
flock -n 9 || { fail "Ya hay un despliegue en curso"; exit 1; }

cd "$APP_DIR"

# 1. ¿Hay cambios?
log "Revisando GitHub"
as_app "git fetch --quiet origin"
BRANCH=$(as_app "git rev-parse --abbrev-ref HEAD")
PREV=$(as_app "git rev-parse HEAD")
NEXT=$(as_app "git rev-parse origin/$BRANCH")

if [[ -n "$(as_app "git status --porcelain --untracked-files=no")" ]]; then
  fail "Hay archivos modificados a mano en el VPS. Revisa con: sudo -iu $APP_USER git -C $APP_DIR status"
  exit 1
fi

if [[ "$PREV" == "$NEXT" && $FORCE -eq 0 ]]; then
  ok "No hay cambios nuevos en GitHub. (Usa --force para recompilar igual)"
  exit 0
fi

if [[ "$PREV" != "$NEXT" ]]; then
  echo "Cambios que se van a desplegar:"
  as_app "git log --oneline --no-decorate $PREV..$NEXT" | sed 's/^/   • /'
fi

# 2. Base de datos arriba y respaldo
log "Revisando la base de datos"
docker compose up -d postgres >/dev/null
for _ in $(seq 1 30); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q postgres)")" == "healthy" ]] && break
  sleep 2
done

log "Respaldando la base de datos"
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/erp-$(date +%Y%m%d-%H%M%S)-${PREV:0:7}.dump"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP"
ok "Respaldo: $BACKUP ($(du -h "$BACKUP" | cut -f1))"
ls -1t "$BACKUP_DIR"/erp-*.dump | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f

# Si algo falla desde aquí, se vuelve a la versión anterior
rollback() {
  trap - ERR
  fail "El despliegue falló. Volviendo a la versión anterior (${PREV:0:7})…"
  as_app "git reset --hard --quiet $PREV" &&
  as_app "pnpm install --frozen-lockfile --reporter=silent" &&
  as_app "pnpm build" >/dev/null &&
  restart_services &&
  health_check && ok "Se restauró la versión anterior y está funcionando." ||
    fail "No se pudo restaurar sola. Revisa: journalctl -u erp-jamaroff-api -n 50"
  echo "Respaldo de la base antes del intento: $BACKUP"
  exit 1
}
trap rollback ERR

# 3. Código, dependencias, migraciones y build
log "Bajando cambios"
as_app "git merge --ff-only --quiet origin/$BRANCH"

log "Instalando dependencias"
as_app "pnpm install --frozen-lockfile --reporter=append-only"

log "Aplicando migraciones"
as_app "pnpm db:migrate"

log "Compilando (shared, API y web)"
as_app "pnpm build"

# 4. Reiniciar
log "Reiniciando servicios"
restart_services

# 5. Verificar
log "Verificando que todo responda"
if ! health_check; then
  fail "La API o la web no responden después del reinicio"
  false   # dispara el rollback
fi

trap - ERR
ok "Desplegado: ${NEXT:0:7} — https://erp.jamaroff.cl"