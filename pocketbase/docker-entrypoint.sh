#!/bin/sh
# Démarrage de PocketBase CSM : applique les migrations (au démarrage de serve) et, si PB_ADMIN_EMAIL et
# PB_ADMIN_PASSWORD sont fournis par Coolify, crée ou met à jour le compte superuser (jamais dans l'image).
set -eu
ARGS="--dir=/pb_data --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks"
if [ -n "${PB_ADMIN_EMAIL:-}" ] && [ -n "${PB_ADMIN_PASSWORD:-}" ]; then
  # shellcheck disable=SC2086
  pocketbase migrate up $ARGS >/dev/null
  # shellcheck disable=SC2086
  pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" $ARGS >/dev/null
fi
# shellcheck disable=SC2086
exec pocketbase serve --http=0.0.0.0:8090 $ARGS
