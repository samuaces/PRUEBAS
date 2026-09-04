#!/usr/bin/env python3
"""Genera los iconos PNG de la app (sin dependencias externas).

Uso: python3 tools/generar-iconos.py
Dibuja un cuadrado redondeado con degradado azul y un triangulo de play,
con supermuestreo 4x para que los bordes queden suaves.
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'public' / 'icons'
SS = 4  # supermuestreo

# Degradado de la marca (mismo azul/violeta que la interfaz)
C1 = (10, 132, 255)
C2 = (94, 92, 230)


def rounded_rect_alpha(x, y, w, h, radius):
    """1 si el punto esta dentro del cuadrado redondeado."""
    cx = min(max(x, radius), w - radius)
    cy = min(max(y, radius), h - radius)
    dx, dy = x - cx, y - cy
    return (dx * dx + dy * dy) <= radius * radius


def in_triangle(px, py, tri):
    (ax, ay), (bx, by), (cx, cy) = tri
    d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
    d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
    d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
    neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (neg and pos)


def render(size, padding_ratio=0.0, radius_ratio=0.22):
    """Devuelve filas RGBA del icono. padding_ratio deja margen (iconos maskable)."""
    pad = size * padding_ratio
    box = size - 2 * pad
    radius = box * radius_ratio
    # Triangulo de play centrado en la caja
    t = box * 0.30
    tri = [
        (pad + box * 0.38, pad + box * 0.28),
        (pad + box * 0.38, pad + box * 0.72),
        (pad + box * 0.76, pad + box * 0.50)
    ]
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    fx = px + (sx + 0.5) / SS
                    fy = py + (sy + 0.5) / SS
                    if not rounded_rect_alpha(fx - pad, fy - pad, box, box, radius):
                        continue
                    mix = ((fx - pad) / box * 0.35) + ((fy - pad) / box * 0.65)
                    cr = int(C1[0] + (C2[0] - C1[0]) * mix)
                    cg = int(C1[1] + (C2[1] - C1[1]) * mix)
                    cb = int(C1[2] + (C2[2] - C1[2]) * mix)
                    if in_triangle(fx, fy, tri):
                        cr = cg = cb = 255
                    r += cr
                    g += cg
                    b += cb
                    a += 255
        # media de las muestras cubiertas
            n = SS * SS
            if a:
                covered = a / 255
                row += bytes((int(r / covered), int(g / covered), int(b / covered), int(a / n)))
            else:
                row += b'\x00\x00\x00\x00'
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + row for row in rows)

    def chunk(tag, data):
        payload = tag + data
        return struct.pack('>I', len(data)) + payload + struct.pack('>I', zlib.crc32(payload) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    path.write_bytes(png)
    print(f'{path.name}  {size}x{size}  {len(png) / 1024:.1f} KB')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / 'icon-192.png', 192, render(192))
    write_png(OUT / 'icon-512.png', 512, render(512))
    write_png(OUT / 'icon-maskable-512.png', 512, render(512, padding_ratio=0.12, radius_ratio=0.5))
    write_png(OUT / 'apple-touch-icon.png', 180, render(180, radius_ratio=0.0))


if __name__ == '__main__':
    main()
