#!/bin/bash
# Doble clic para abrir Cookie Play y crear un enlace https que funciona
# desde cualquier móvil, sin cuentas y sin coste.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Falta Node.js, que es lo único que necesita esta app."
  echo "  Descárgalo (versión LTS) en https://nodejs.org y vuelve a hacer doble clic aquí."
  echo ""
  read -r -p "  Pulsa Intro para cerrar."
  exit 1
fi

echo ""
echo "  🍪  Cookie Play — creando tu enlace…"
exec node iniciar.mjs --publico "$@"
