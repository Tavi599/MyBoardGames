# -*- coding: utf-8 -*-
"""Малює іконки застосунку: чотири стовпчики оцінок на темному тлі.

Мотив той самий, що й у списку — оцінка як позначка на шкалі.
Запуск:  python "icons.py"
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT_DIR = Path(__file__).parent
BACKGROUND_COLOR = (14, 94, 88)     # --petrol
BAR_COLOR = (233, 234, 229)         # --paper
BASELINE_COLOR = (10, 66, 62)
BAR_HEIGHTS = (0.34, 0.52, 0.76, 1.0)   # чотири стовпчики, як 2 / 3 / 4 / 5+


def draw_icon(size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BACKGROUND_COLOR + (255,))
    pen = ImageDraw.Draw(canvas)

    margin = size * 0.22
    inner_width = size - margin * 2
    step = inner_width / 4
    bar_width = step * 0.56
    bottom = size - margin
    tallest = inner_width * 0.92

    # ледь помітна лінія основи — «шкала»
    pen.rectangle([margin, bottom, size - margin, bottom + size * 0.018],
                  fill=BASELINE_COLOR + (255,))

    for index, fraction in enumerate(BAR_HEIGHTS):
        height = tallest * fraction
        left = margin + step * index + (step - bar_width) / 2
        top = bottom - height
        radius = bar_width * 0.28
        pen.rounded_rectangle([left, top, left + bar_width, bottom],
                              radius=radius, fill=BAR_COLOR + (255,))
    return canvas


def main() -> None:
    for size in (192, 512):
        path = ROOT_DIR / f"icon-{size}.png"
        draw_icon(size).save(path)
        print("Намальовано:", path.name)


if __name__ == "__main__":
    main()
