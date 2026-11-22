# -*- coding: utf-8 -*-
"""Склеює «src/» в самодостатній «index.html».

Чому склейка, а не модулі ES: сторінка має відкриватися і з диска подвійним
кліком (file://), а туди import не пускає браузер. Склеювання на збірці дає
поділ на файли без жодної залежності — ні npm, ні збирачки.

Порядок склеювання = порядок у PAGE_PARTS. Файли коду нумеровані, бо вони
виконуються згори вниз і залежать від оголошень попередніх.

Один і той самий «index.html» служить трьом місцям і сам розуміє, де він:
  * GitHub Pages          → пише оцінки просто в репозиторій;
  * локальний сервер      → пише в «ratings.json» на диску;
  * подвійний клік з диска → окрема копія в пам'яті браузера.

Запуск:  python "build.py"
"""
import json
from pathlib import Path

ROOT_DIR = Path(__file__).parent
SOURCE_DIR = ROOT_DIR / "src"
OUTPUT_PAGE = ROOT_DIR / "index.html"
OUTPUT_TESTS_PAGE = ROOT_DIR / "tests.html"
# Сталі формату даних (версія, склади столу, статуси, види правил): спільне
# джерело для сторінки й для «check.py».
SCHEMA_FILE = SOURCE_DIR / "schema.json"
# Підписи жанрів: спільне джерело для сторінки й для «check.py».
GENRES_FILE = SOURCE_DIR / "genres.json"

# Файли без сторінки й мережі: самі оголошення, жоден обробник не чіпляється
# до розмітки. Саме їх можна перевіряти окремо, і саме від них залежить, чи
# не зникне оцінка, поставлена без зв'язку: модель запису, вибірка, злиття
# й черга. Усе з номером від 10 — це вже сховище й сама сторінка.
#
# Тести живуть у власній сторінці «tests.html»: так вони виконуються там
# само, де й код, — у браузері, без жодної залежності.
PURE_LOGIC_FILES = ["00-util.js", "01-model.js", "02-filters.js", "03-sync.js"]

# Випадки злиття — спільні для сторінки й для «tests.py»: правило одне, а
# реалізацій три. Тут вони стають константою на сторінці тестів; python
# читає той самий файл.
MERGE_CASES_FILE = SOURCE_DIR / "merge-cases.json"

# Розділ → файли. Код береться за іменами, відсортованими за номером.
PAGE_PARTS = {
    "head": ["head.html"],
    "styles": ["styles.css"],
    "markup": ["markup.html"],
}

PAGE_SHELL = """<!doctype html>
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
{content}
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


def script_files() -> list[Path]:
    return sorted((SOURCE_DIR / "js").glob("*.js"))


def build_dependencies() -> list[Path]:
    """Усе, від чого залежить збірка, — щоб сервер знав, коли перезбирати."""
    page_parts = [SOURCE_DIR / name for names in PAGE_PARTS.values() for name in names]
    return page_parts + script_files() + [SCHEMA_FILE, GENRES_FILE, MERGE_CASES_FILE,
                                          Path(__file__)]


def read_text(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"немає {path.relative_to(ROOT_DIR)}")
    return path.read_text(encoding="utf-8")


def js_constant(name: str, value) -> str:
    return f"const {name} = " + json.dumps(value, ensure_ascii=False) + ";\n"


def without_comment_keys(data: dict) -> dict:
    """Ключі з підкресленням на початку — це пояснення для людей, що читають
    JSON; сторінці вони не потрібні."""
    return {key: value for key, value in data.items() if not key.startswith("_")}


def generated_constants() -> str:
    """Сталі формату й підписи жанрів лежать окремими JSON, бо їх читає не
    лише сторінка, а й перевірка даних. Тут вони стають константами на
    початку коду — раніше за все, що ними користується."""
    schema = without_comment_keys(json.loads(read_text(SCHEMA_FILE)))
    genres = json.loads(read_text(GENRES_FILE))
    return ('/* Згенеровано збіркою з «src/schema.json» і «src/genres.json» '
            '— правити там. */\n'
            '"use strict";\n'
            + js_constant("SCHEMA", schema)
            + js_constant("FAMILY_LABELS", genres["families"])
            + js_constant("GENRE_LABELS", genres["genres"])
            + js_constant("KEY_GENRES", genres["keyGenres"]))


def build_page() -> str:
    """Голова, стилі, розмітка й код — в одну сторінку."""
    head = "".join(read_text(SOURCE_DIR / name) for name in PAGE_PARTS["head"])
    styles = "".join(read_text(SOURCE_DIR / name) for name in PAGE_PARTS["styles"])
    markup = "".join(read_text(SOURCE_DIR / name) for name in PAGE_PARTS["markup"])
    code = generated_constants() + "".join(read_text(path) for path in script_files())
    return (head + "\n<style>\n" + styles + "</style>\n\n"
            + markup + "\n<script>\n" + code + "</script>\n")


TESTS_PAGE_TEMPLATE = """<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Полиця — тести логіки</title>
<style>
body{{margin:0; padding:24px; font:14px/1.5 ui-monospace,monospace; background:#F5F6F2;
  color:#14181A}}
h1{{margin:0 0 4px; font-size:18px}}
#summary{{display:inline-block; padding:6px 12px; border-radius:6px; font-weight:700;
  background:#0E5E58; color:#F5F6F2}}
body.failed #summary{{background:#A3402D}}
ul{{list-style:none; padding:0; margin:18px 0 0}}
li{{padding:3px 0; border-bottom:1px solid #DFE3DC}}
li.ok b{{color:#0E5E58}} li.no b{{color:#A3402D}}
li i{{display:block; padding-left:18px; color:#A3402D; font-style:normal}}
</style>
</head>
<body>
<h1>Полиця настілок — тести логіки</h1>
<p><span id="summary">рахую…</span></p>
<ul id="results"></ul>
<script>
{code}
</script>
</body>
</html>
"""


def merge_cases_constant() -> str:
    """Випадки злиття — константою на сторінці тестів. Той самий файл читає
    «tests.py»: правило одне, реалізацій три, тож нехай хоч перевіряються
    вони по одному переліку."""
    data = json.loads(read_text(MERGE_CASES_FILE))
    return ("/* Згенеровано збіркою з «src/merge-cases.json» — правити там. */\n"
            + js_constant("MERGE_CASES", data["cases"]))


def build_tests_page() -> str:
    code = (generated_constants() + merge_cases_constant()
            + "".join(read_text(SOURCE_DIR / "js" / name) for name in PURE_LOGIC_FILES))
    return TESTS_PAGE_TEMPLATE.format(code=code + read_text(SOURCE_DIR / "tests.js"))


def main() -> None:
    OUTPUT_PAGE.write_text(PAGE_SHELL.format(content=build_page()), encoding="utf-8")
    OUTPUT_TESTS_PAGE.write_text(build_tests_page(), encoding="utf-8")
    script_count = len(script_files())
    print(f"Зібрано: {OUTPUT_PAGE.name} ({OUTPUT_PAGE.stat().st_size / 1024:.0f} КБ), "
          f"файлів коду: {script_count}; плюс {OUTPUT_TESTS_PAGE.name}")


if __name__ == "__main__":
    main()
