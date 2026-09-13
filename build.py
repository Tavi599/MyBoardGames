# -*- coding: utf-8 -*-
"""Склеює «src/» в самодостатній «index.html».

Чому склейка, а не модулі ES: сторінка має відкриватися і з диска подвійним
кліком (file://), а туди import не пускає браузер. Склеювання на збірці дає
поділ на файли без жодної залежності — ні npm, ні збирачки.

Порядок склеювання = порядок у СКЛАД. Файли коду нумеровані, бо вони
виконуються згори вниз і залежать від оголошень попередніх.

Один і той самий «index.html» служить трьом місцям і сам розуміє, де він:
  * GitHub Pages          → пише оцінки просто в репозиторій;
  * локальний сервер      → пише в «ratings.json» на диску;
  * подвійний клік з диска → окрема копія в пам'яті браузера.

Запуск:  python "build.py"
"""
import json
from pathlib import Path

ТЕКА = Path(__file__).parent
ДЖЕРЕЛА = ТЕКА / "src"
ЦІЛЬ = ТЕКА / "index.html"
ЦІЛЬ_ТЕСТІВ = ТЕКА / "tests.html"
# Підписи жанрів: спільне джерело для сторінки й для «check.py».
СЛОВНИК = ДЖЕРЕЛА / "genres.json"

# Файли, які нічого не роблять під час завантаження: самі оголошення, жоден
# обробник не чіпляється до розмітки сторінки. Саме їх можна перевіряти
# окремо. Node у системі немає, тож тести живуть у власній сторінці.
#
# «04-list.js» тут заради поновити(): звіряння списку з даними — це те
# місце, де помилка тиха (не падає, а лишає зайвий рядок або переставляє
# два), тож без тестів його тримати не варто.
#
# «02-storage.js» довго стояв осторонь, бо «він же про мережу». Насправді
# мережа в ньому — це три функції, а решта чиста: черга, злиття, «чия
# правка перемогла». Тобто рівно той код, від якого залежить, чи не зникне
# оцінка, поставлена без зв'язку, — і він єдиний був без жодного тесту.
# При завантаженні файл нічого не робить: самі оголошення, boot() кличе
# «08-menu.js», якого на сторінці тестів немає.
ЧИСТА_ЛОГІКА = ["01-core.js", "02-storage.js", "03-filter.js", "04-list.js"]

# Випадки злиття — спільні для сторінки й для «tests.py»: правило одне, а
# реалізацій три. Тут вони стають константою на сторінці тестів; python
# читає той самий файл.
ВИПАДКИ_ЗЛИТТЯ = ДЖЕРЕЛА / "merge-cases.json"

# Розділ → файли. Код береться за іменами, відсортованими за номером.
СКЛАД = {
    "голова": ["head.html"],
    "стилі": ["styles.css"],
    "розмітка": ["markup.html"],
}

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


def файли_коду() -> list[Path]:
    return sorted((ДЖЕРЕЛА / "js").glob("*.js"))


def джерела() -> list[Path]:
    """Усе, від чого залежить збірка, — щоб сервер знав, коли перезбирати."""
    свої = [ДЖЕРЕЛА / і for імена in СКЛАД.values() for і in імена]
    return свої + файли_коду() + [СЛОВНИК, ВИПАДКИ_ЗЛИТТЯ, Path(__file__)]


def словник_жанрів() -> str:
    """Підписи жанрів лежать окремим JSON, бо їх читає не лише сторінка, а й
    перевірка даних. Тут вони стають двома константами на початку коду —
    раніше за все, що ними користується."""
    дані = json.loads(читати(СЛОВНИК))
    return ('/* Згенеровано збіркою з «src/genres.json» — правити там. */\n'
            '"use strict";\n'
            "const РОДИНИ = " + json.dumps(дані["родини"], ensure_ascii=False) + ";\n"
            "const ЖАНРИ = " + json.dumps(дані["жанри"], ensure_ascii=False) + ";\n"
            "const КЛЮЧОВІ = " + json.dumps(дані["ключові"], ensure_ascii=False) + ";\n")


def читати(шлях: Path) -> str:
    if not шлях.exists():
        raise FileNotFoundError(f"немає {шлях.relative_to(ТЕКА)}")
    return шлях.read_text(encoding="utf-8")


def сторінка() -> str:
    """Голова, стилі, розмітка й код — в одну сторінку."""
    голова = "".join(читати(ДЖЕРЕЛА / і) for і in СКЛАД["голова"])
    стилі = "".join(читати(ДЖЕРЕЛА / і) for і in СКЛАД["стилі"])
    розмітка = "".join(читати(ДЖЕРЕЛА / і) for і in СКЛАД["розмітка"])
    код = словник_жанрів() + "".join(читати(ф) for ф in файли_коду())
    return (голова + "\n<style>\n" + стилі + "</style>\n\n"
            + розмітка + "\n<script>\n" + код + "</script>\n")


СТОРІНКА_ТЕСТІВ = """<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Полиця — тести логіки</title>
<style>
body{{margin:0; padding:24px; font:14px/1.5 ui-monospace,monospace; background:#F5F6F2;
  color:#14181A}}
h1{{margin:0 0 4px; font-size:18px}}
#сума{{display:inline-block; padding:6px 12px; border-radius:6px; font-weight:700;
  background:#0E5E58; color:#F5F6F2}}
body.зле #сума{{background:#A3402D}}
ul{{list-style:none; padding:0; margin:18px 0 0}}
li{{padding:3px 0; border-bottom:1px solid #DFE3DC}}
li.ok b{{color:#0E5E58}} li.no b{{color:#A3402D}}
li i{{display:block; padding-left:18px; color:#A3402D; font-style:normal}}
</style>
</head>
<body>
<h1>Полиця настілок — тести логіки</h1>
<p><span id="сума">рахую…</span></p>
<ul id="список"></ul>
<script>
{код}
</script>
</body>
</html>
"""


def випадки_злиття() -> str:
    """Випадки злиття — константою на сторінці тестів. Той самий файл читає
    «tests.py»: правило одне, реалізацій три, тож нехай хоч перевіряються
    вони по одному переліку."""
    дані = json.loads(читати(ВИПАДКИ_ЗЛИТТЯ))
    return ("/* Згенеровано збіркою з «src/merge-cases.json» — правити там. */\n"
            "const ВИПАДКИ_ЗЛИТТЯ = "
            + json.dumps(дані["випадки"], ensure_ascii=False) + ";\n")


def сторінка_тестів() -> str:
    код = (словник_жанрів() + випадки_злиття()
           + "".join(читати(ДЖЕРЕЛА / "js" / і) for і in ЧИСТА_ЛОГІКА))
    return СТОРІНКА_ТЕСТІВ.format(код=код + читати(ДЖЕРЕЛА / "tests.js"))


def main() -> None:
    ЦІЛЬ.write_text(ОБГОРТКА.format(вміст=сторінка()), encoding="utf-8")
    ЦІЛЬ_ТЕСТІВ.write_text(сторінка_тестів(), encoding="utf-8")
    скільки = len(файли_коду())
    print(f"Зібрано: {ЦІЛЬ.name} ({ЦІЛЬ.stat().st_size / 1024:.0f} КБ), "
          f"файлів коду: {скільки}; плюс {ЦІЛЬ_ТЕСТІВ.name}")


if __name__ == "__main__":
    main()
