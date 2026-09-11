"""Genera los iconos PNG de la app (Android, iPhone y maskable) con Pillow.

El icono es un autobús de frente con los faros amarillos: el mismo amarillo
de los descansos y un guiño a los servicios de madrugada.

Uso:  python tools/make-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"

BG = (17, 17, 20, 255)
BODY = (255, 255, 255, 255)
GLASS = (17, 17, 20, 255)
LIGHT = (255, 224, 98, 255)

# Geometría del autobús en un lienzo de 64 unidades (igual que icons/favicon.svg).
GLYPH = {
    "body": (12, 8, 52, 54, 9),          # x0, y0, x1, y1, radio
    "glass": (17, 15, 47, 30, 3),
    "lights": [(21, 42, 3.5), (43, 42, 3.5)],  # cx, cy, r
    "wheels": [(15, 54, 25, 59.5, 2), (39, 54, 49, 59.5, 2)],
    "mirrors": [(7, 20, 11, 30, 1.5), (53, 20, 57, 30, 1.5)],
}
GLYPH_CENTER = (32, 33.75)


def draw_bus(d, scale, cx, cy):
    """Dibuja el autobús centrado en (cx, cy); `scale` = píxeles por unidad."""
    def pt(x, y):
        return (cx + (x - GLYPH_CENTER[0]) * scale, cy + (y - GLYPH_CENTER[1]) * scale)

    def rr(box, radius, fill):
        (x0, y0), (x1, y1) = pt(box[0], box[1]), pt(box[2], box[3])
        d.rounded_rectangle((x0, y0, x1, y1), radius=radius * scale, fill=fill)

    for m in GLYPH["mirrors"]:
        rr(m[:4], m[4], BODY)
    for w in GLYPH["wheels"]:
        rr(w[:4], w[4], BODY)
    b = GLYPH["body"]
    rr(b[:4], b[4], BODY)
    g = GLYPH["glass"]
    rr(g[:4], g[4], GLASS)
    for (lx, ly, lr) in GLYPH["lights"]:
        (x, y) = pt(lx, ly)
        r = lr * scale
        d.ellipse((x - r, y - r, x + r, y + r), fill=LIGHT)


def render(size, rounded, glyph_fraction):
    """glyph_fraction = anchura del autobús respecto al lado (0.50 deja margen para máscaras)."""
    k = 4  # dibujar grande y reducir para suavizar bordes
    s = size * k
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    radius = int(s * 0.225) if rounded else 0
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=radius, fill=BG)
    scale = s * glyph_fraction / 50  # el glifo mide 50 unidades de ancho (de 7 a 57)
    draw_bus(d, scale, s / 2, s / 2)
    return im.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    render(192, True, 0.60).save(OUT / "icon-192.png")
    render(512, True, 0.60).save(OUT / "icon-512.png")
    render(512, False, 0.50).save(OUT / "icon-maskable-512.png")
    render(180, False, 0.60).convert("RGB").save(OUT / "apple-touch-icon.png")
    print("Iconos generados en", OUT)


if __name__ == "__main__":
    main()
