#!/bin/bash
# Abre Cookie Play y crea un enlace https que funciona desde cualquier móvil,
# sin cuentas y sin coste.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Falta Node.js. Instálalo (paquete nodejs, versión 20 o superior) y vuelve a intentarlo."
  echo ""
  read -r -p "  Pulsa Intro para cerrar."
  exit 1
fi

echo ""
echo "  🍪  Cookie Play — creando tu enlace…"
exec node iniciar.mjs --publico "$@"
