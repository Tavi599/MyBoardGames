# -*- coding: utf-8 -*-
"""Загортає «сторінка.html» у самодостатній офлайновий файл.

«сторінка.html» — джерело: воно ж іде на публікацію як Artifact, тому в ньому
немає ні doctype, ні <head> (їх додає claude.ai). Локальній копії вони потрібні,
насамперед через <meta charset> — без нього браузер може прочитати кирилицю
кракозябрами. Тут же дублюється той самий скид стилів, що додає claude.ai,
щоб обидві копії виглядали однаково.

Запуск:  python "збірка.py"
"""
from pathlib import Path

ТЕКА = Path(__file__).parent
ДЖЕРЕЛО = ТЕКА / "сторінка.html"
ЦІЛЬ = ТЕКА / "Полиця настілок.html"

ОБГОРТКА = """<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{{color-scheme:light}}
body{{margin:0; background:#fafaf9; font:14px system-ui, sans-serif}}
img{{max-width:100%}}
[hidden]{{display:none !important}}
</style>
</head>
<body>
{вміст}
</body>
</html>
"""

def main() -> None:
    вміст = ДЖЕРЕЛО.read_text(encoding="utf-8")
    ЦІЛЬ.write_text(ОБГОРТКА.format(вміст=вміст), encoding="utf-8")
    print("Зібрано:", ЦІЛЬ.name, f"({ЦІЛЬ.stat().st_size / 1024:.0f} КБ)")


if __name__ == "__main__":
    main()
