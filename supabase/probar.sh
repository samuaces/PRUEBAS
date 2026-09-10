#!/usr/bin/env bash
# Prueba el esquema y sus permisos en un Postgres de usar y tirar, sin tocar
# Supabase ni internet. Sirve para no descubrir un fallo del esquema después de
# haberlo pegado en el proyecto de verdad.
#
#   ./supabase/probar.sh
#
# Hace falta Postgres instalado (en Ubuntu: apt install postgresql).
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$BIN" ] || BIN="$(dirname "$(command -v initdb)")"
[ -x "$BIN/initdb" ] || { echo "No encuentro Postgres. En Ubuntu: apt install postgresql"; exit 1; }

BASE="$(mktemp -d)"
PUERTO="${PGPORT_PRUEBA:-5433}"
limpia() { "$BIN/pg_ctl" -D "$BASE/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap limpia EXIT

# initdb no se deja ejecutar como root; si lo somos, se usa un usuario aparte.
CORRE=""
if [ "$(id -u)" = "0" ]; then
  id pgprueba >/dev/null 2>&1 || useradd -m pgprueba
  chown -R pgprueba "$BASE"
  CORRE="su pgprueba -c"
fi
lanza() { if [ -n "$CORRE" ]; then su pgprueba -c "$1"; else bash -c "$1"; fi; }

echo "· levantando un Postgres de usar y tirar…"
lanza "$BIN/initdb -D $BASE/data -U postgres --auth=trust" >/dev/null
lanza "$BIN/pg_ctl -D $BASE/data -l $BASE/log -o '-p $PUERTO -k $BASE' start" >/dev/null

export PGHOST="$BASE" PGPORT="$PUERTO" PGUSER=postgres
psql -q -c "create database pizarra" postgres

echo "· montando lo mínimo de Supabase (auth.users, auth.uid, roles)…"
psql -q -v ON_ERROR_STOP=1 -d pizarra -f "$AQUI/postgres-pelado.sql" >/dev/null

echo "· ejecutando schema.sql…"
psql -q -v ON_ERROR_STOP=1 -d pizarra -f "$AQUI/schema.sql" >/dev/null

echo "· ejecutándolo otra vez, que tiene que poder repetirse…"
psql -q -v ON_ERROR_STOP=1 -d pizarra -f "$AQUI/schema.sql" >/dev/null

echo "· probando los permisos:"
salida="$(psql -q -d pizarra -f "$AQUI/permisos.test.sql" 2>&1)" || {
  echo "$salida" | grep -E "FALLA|ERROR" || echo "$salida" | tail -5
  echo; echo "RESULTADO: HAY FALLOS"; exit 1; }

echo "$salida" | grep -oE "PASA .*" | sed 's/^/    /'
echo
echo "RESULTADO: TODO CORRECTO ($(echo "$salida" | grep -c "PASA") comprobaciones)"
