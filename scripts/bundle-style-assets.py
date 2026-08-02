"""Empacota as imagens dos estilos (de ~/.atelie) como assets do app.

Os originais são PNG de 2K — 131 MB no conjunto, o que pesaria no repositório e
no instalador. Aqui viram WebP com a borda longa em 1600px: mesmas imagens em
resolução de exibição (o card renderiza a ~300px, o modal a ~800px), ~15x menores.

Uso:  python scripts/bundle-style-assets.py
"""
import glob
import os
import sys

from PIL import Image

ATELIE = os.path.join(os.path.expanduser("~"), ".atelie", "styles")
DESTINO = os.path.join(os.path.dirname(__file__), "..", "assets", "style-covers")
BORDA_LONGA = 1600
QUALIDADE = 88

# Estilo do autor embarcado com TODAS as refs (ver src/styles/seedStyles.ts).
COM_REFS = {"aquarela-bosque"}


def converter(origem: str, destino: str) -> tuple[int, int]:
    im = Image.open(origem)
    # RGBA preservado: estilos de fundo transparente (sticker, logo-icone)
    # perderiam o recorte se fossem achatados para RGB.
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") and "A" in im.getbands() else "RGB")
    im.thumbnail((BORDA_LONGA, BORDA_LONGA), Image.LANCZOS)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    im.save(destino, "WEBP", quality=QUALIDADE, method=6)
    return os.path.getsize(origem), os.path.getsize(destino)


def main() -> int:
    if not os.path.isdir(ATELIE):
        print(f"nada em {ATELIE}", file=sys.stderr)
        return 1

    antes = depois = 0
    n = 0
    for pasta in sorted(glob.glob(os.path.join(ATELIE, "*"))):
        style_id = os.path.basename(pasta)
        if style_id in COM_REFS:
            arquivos = sorted(
                p for p in glob.glob(os.path.join(pasta, "*"))
                if os.path.splitext(p)[1].lower() in (".png", ".jpg", ".jpeg", ".webp")
            )
            saidas = [os.path.join(DESTINO, style_id, os.path.splitext(os.path.basename(p))[0] + ".webp") for p in arquivos]
        else:
            capa = os.path.join(pasta, "capa.png")
            if not os.path.exists(capa):
                continue
            arquivos, saidas = [capa], [os.path.join(DESTINO, style_id + ".webp")]

        for origem, destino in zip(arquivos, saidas):
            a, d = converter(origem, destino)
            antes += a
            depois += d
            n += 1

    print(f"{n} imagens: {antes/1048576:.1f} MB -> {depois/1048576:.1f} MB ({antes/max(depois,1):.0f}x menor)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
