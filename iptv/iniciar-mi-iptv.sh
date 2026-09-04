#!/bin/bash
# Ejecuta este archivo (doble clic o ./iniciar-mi-iptv.sh) para abrir Mi IPTV.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Falta Node.js. Instálalo (paquete nodejs, versión 20 o superior) y vuelve a intentarlo."
  echo ""
  read -r -p "  Pulsa Intro para cerrar."
  exit 1
fi

echo ""
echo "  📺  Mi IPTV — arrancando…"
exec node iniciar.mjs "$@"
