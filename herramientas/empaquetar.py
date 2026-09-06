#!/usr/bin/env python3
"""Empaqueta la app móvil en un solo archivo HTML.

Uso: python3 herramientas/empaquetar.py   (necesita Pillow para los logos)

Mete estilos, código e imágenes dentro de CookiePlay.html, que funciona abierto
como archivo local en el teléfono. Esa es la gracia: al no ser una página https,
el navegador sí le deja reproducir vídeo http, que es como sirven casi todos
los paneles IPTV.
"""
import base64
import io
import re
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent


def data_uri(ruta: Path, ancho: int) -> str:
    imagen = Image.open(ruta).convert("RGBA")
    alto = int(imagen.height * ancho / imagen.width)
    imagen = imagen.resize((ancho, alto), Image.LANCZOS)
    memoria = io.BytesIO()
    imagen.save(memoria, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(memoria.getvalue()).decode()


def main() -> None:
    css = (RAIZ / "movil/estilo.css").read_text(encoding="utf-8")
    js = (RAIZ / "movil/app.js").read_text(encoding="utf-8")

    # Un archivo suelto no puede usar módulos.
    js = re.sub(r"^export (async function|function|const|let|class)", r"\1", js, flags=re.M)
    js = js.replace("src: 'icons/logo.png'", "src: LOGO_INCRUSTADO")
    js = js.replace("src: 'icons/wordmark.png'", "src: LOGOTIPO_INCRUSTADO")
    logos = (
        f"const LOGO_INCRUSTADO = '{data_uri(RAIZ / 'movil/icons/logo.png', 220)}';\n"
        f"const LOGOTIPO_INCRUSTADO = '{data_uri(RAIZ / 'movil/icons/wordmark.png', 420)}';\n\n"
    )

    destino = RAIZ / "CookiePlay.html"
    html = destino.read_text(encoding="utf-8")
    inicio, fin = html.index("<style>") + len("<style>"), html.index("</style>")
    html = html[:inicio] + "\n" + css + "\n" + html[fin:]
    inicio, fin = html.index("<script>") + len("<script>"), html.rindex("</script>")
    html = html[:inicio] + "\n" + logos + js + "\n" + html[fin:]
    destino.write_text(html, encoding="utf-8")
    print(f"CookiePlay.html regenerado ({len(html) // 1024} KB)")


if __name__ == "__main__":
    main()
