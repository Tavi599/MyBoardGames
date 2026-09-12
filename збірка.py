# -*- coding: utf-8 -*-
"""Загортає «сторінка.html» у самодостатній «index.html».

«сторінка.html» — джерело: воно ж іде на публікацію як Artifact, тому в ньому
немає ні doctype, ні <head> (їх додає claude.ai). Готовій сторінці вони
потрібні, насамперед через <meta charset> — без нього браузер може прочитати
кирилицю кракозябрами.

Один і той самий «index.html» служить трьом місцям і сам розуміє, де він:
  * GitHub Pages          → пише оцінки просто в репозиторій;
  * локальний сервер      → пише в «оцінки.json» на диску;
  * подвійний клік з диска → окрема копія в пам'яті браузера.

Запуск:  python "збірка.py"
"""
from pathlib import Path

ТЕКА = Path(__file__).parent
ДЖЕРЕЛО = ТЕКА / "сторінка.html"
ЦІЛЬ = ТЕКА / "index.html"

ОБГОРТКА = """<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0E5E58">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="icon-192.png">
<style>
:root{{color-scheme:light dark}}
body{{margin:0; background:#fafaf9; font:14px system-ui, sans-serif}}
img{{max-width:100%}}
[hidden]{{display:none !important}}
</style>
</head>
<body>
{вміст}
<script>
// Застосунок на телефоні: сторінка має відкриватися й без мережі.
if ("serviceWorker" in navigator && location.protocol === "https:") {{
  addEventListener("load", function () {{
    navigator.serviceWorker.register("sw.js").catch(function () {{}});
  }});
}}
</script>
</body>
</html>
"""


def main() -> None:
    вміст = ДЖЕРЕЛО.read_text(encoding="utf-8")
    ЦІЛЬ.write_text(ОБГОРТКА.format(вміст=вміст), encoding="utf-8")
    print("Зібрано:", ЦІЛЬ.name, f"({ЦІЛЬ.stat().st_size / 1024:.0f} КБ)")


if __name__ == "__main__":
    main()
