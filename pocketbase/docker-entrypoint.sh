#!/bin/sh
# Démarrage de PocketBase CSM : applique les migrations (au démarrage de serve) et, si PB_ADMIN_EMAIL et
# PB_ADMIN_PASSWORD sont fournis par Coolify, crée ou met à jour le compte superuser (jamais dans l'image).
# Sortie du démarrage gardée dans /pb_data/startup.log. Diagnostic (journaux Coolify non lisibles par l'API) :
# avec PB_DEBUG_HOLD=1, un échec au démarrage laisse le conteneur en vie (aucun port ouvert) pour l'examiner par des
# tâches planifiées Coolify exécutées une fois (le statut reflète le code de retour). À retirer après le diagnostic.
set -u
ARGS="--dir=/pb_data --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks"
LOG=/pb_data/startup.log

fail() {
  echo "ÉCHEC : $1" >>"$LOG"
  tail -n 60 "$LOG" >&2
  if [ "${PB_DEBUG_HOLD:-}" = "1" ]; then
    exec tail -f /dev/null
  fi
  exit 1
}

date -u "+%F %T démarrage" >"$LOG" 2>/dev/null || LOG=/tmp/startup.log
if [ -n "${PB_ADMIN_EMAIL:-}" ] && [ -n "${PB_ADMIN_PASSWORD:-}" ]; then
  # shellcheck disable=SC2086
  pocketbase migrate up $ARGS >>"$LOG" 2>&1 || fail "migrate up"
  # shellcheck disable=SC2086
  pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" $ARGS >/dev/null 2>>"$LOG" || fail "superuser upsert"
fi
if [ "${PB_DEBUG_HOLD:-}" = "1" ]; then
  # shellcheck disable=SC2086
  pocketbase serve --http=0.0.0.0:8090 $ARGS >>"$LOG" 2>&1 || fail "serve"
  exit 0
fi
# shellcheck disable=SC2086
exec pocketbase serve --http=0.0.0.0:8090 $ARGS
