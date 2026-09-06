#!/bin/bash
# Ejecuta este archivo (doble clic o ./iniciar-cookie-play.sh) para abrir Cookie Play.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Falta Node.js. Instálalo (paquete nodejs, versión 20 o superior) y vuelve a intentarlo."
  echo ""
  read -r -p "  Pulsa Intro para cerrar."
  exit 1
fi

echo ""
echo "  🍪  Cookie Play — arrancando…"
exec node iniciar.mjs "$@"
