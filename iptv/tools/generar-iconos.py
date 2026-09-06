#!/usr/bin/env python3
"""Genera los iconos de la app a partir del logo de Cookie Play.

Uso: python3 tools/generar-iconos.py   (necesita Pillow: pip install Pillow)

Toma public/icons/logo.png (el logo con fondo transparente) y compone los
tamaños que piden iOS, Android y los navegadores, sobre el degradado cian-azul
de la marca.
"""
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    raise SystemExit('Falta Pillow. Instálalo con:  pip install Pillow')

ICONS = Path(__file__).resolve().parent.parent / 'public' / 'icons'
LOGO = ICONS / 'logo.png'

CYAN = (17, 203, 241)
AZUL = (27, 133, 200)


def fondo(size, radio_ratio):
    """Cuadrado redondeado con el degradado de la marca."""
    ss = 4
    grande = size * ss
    base = Image.new('RGBA', (grande, grande), (0, 0, 0, 0))
    degradado = Image.new('RGBA', (grande, grande))
    px = degradado.load()
    for y in range(grande):
        for x in range(grande):
            mezcla = (x / grande) * 0.35 + (y / grande) * 0.65
            px[x, y] = (
                int(CYAN[0] + (AZUL[0] - CYAN[0]) * mezcla),
                int(CYAN[1] + (AZUL[1] - CYAN[1]) * mezcla),
                int(CYAN[2] + (AZUL[2] - CYAN[2]) * mezcla),
                255
            )
    mascara = Image.new('L', (grande, grande), 0)
    ImageDraw.Draw(mascara).rounded_rectangle(
        [0, 0, grande - 1, grande - 1], radius=int(grande * radio_ratio), fill=255)
    base.paste(degradado, (0, 0), mascara)
    return base.resize((size, size), Image.LANCZOS)


def componer(size, radio_ratio=0.225, ocupacion=0.74):
    lienzo = fondo(size, radio_ratio)
    logo = Image.open(LOGO).convert('RGBA')
    ancho = int(size * ocupacion)
    alto = int(logo.height * ancho / logo.width)
    if alto > size * ocupacion:
        alto = int(size * ocupacion)
        ancho = int(logo.width * alto / logo.height)
    logo = logo.resize((ancho, alto), Image.LANCZOS)
    lienzo.alpha_composite(logo, ((size - ancho) // 2, (size - alto) // 2))
    return lienzo


def main():
    salidas = [
        ('icon-192.png', componer(192)),
        ('icon-512.png', componer(512)),
        # El icono maskable deja margen: Android le recorta las esquinas.
        ('icon-maskable-512.png', componer(512, radio_ratio=0.5, ocupacion=0.58)),
        ('apple-touch-icon.png', componer(180, radio_ratio=0.0, ocupacion=0.76)),
    ]
    for nombre, imagen in salidas:
        destino = ICONS / nombre
        imagen.save(destino)
        print(f'{nombre}  {imagen.size[0]}x{imagen.size[1]}  {destino.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main()
