# -*- coding: utf-8 -*-
"""Добирає з BGG числа для коробок, у яких є bggId.

Що саме звідти береться: склад столу, тривалість, «вага», середня оцінка,
ранг, жанри, механіки, підрозділ і обкладинка. Тобто рівно те, що є чужим
довідником; своїх полів (minP, maxP, minutes, weight, оцінки, теги,
нотатки, свій «family») цей файл не торкається ніколи.

Чому за id, а не за назвою. Пошук BGG закрив для всіх: «xmlapi2/search» і
пошук на самому сайті віддають 403 навіть із браузерним заголовком, інших
кінців просто немає. Зате звернення за числовим id працює. Ті id вже лежать
у даних — їх проставив імпорт вивантаженого з BGG CSV («··· → Оцінки BGG»),
і саме він лишається способом дістати id для нової коробки.

Чому не чіпаємо `updated`. Злиття всюди одне: свіжіший запис перемагає, а
при однаковій мітці перемагає той, що приїхав. Якби цей скрипт піднімав
мітку, він переміг би правку, яка чекає в черзі на телефоні, — і оцінка,
поставлена без мережі, зникла б. Не піднімаючи мітки, ми в найгіршому разі
втрачаємо власну роботу: телефон перезапише запис своєю копією без цих
чисел, а наступний запуск їх спокійно поверне.

Запуск:
    python "bgg.py"                 добрати те, чого бракує
    python "bgg.py" --all           ще й освіжити наявне: оцінка й ранг пливуть
    python "bgg.py" --only g-seed-01 g-calico
    python "bgg.py" --show          нічого не писати, лише показати різницю

Давні назви прапорців («--усі», «--лише», «--показати») працюють і далі:
ними користуються заплановані запуски.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

# Не в «__main__»: цей файл імпортує й сервер, і тести, і вивід має бути
# читним однаково. hasattr — бо потік може бути й не текстовим.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = pathlib.Path(__file__).parent
DATA_FILE = ROOT_DIR / "ratings.json"

ITEM_URL = "https://api.geekdo.com/api/geekitems?objectid={bgg_id}&objecttype=thing"
DYNAMIC_URL = "https://api.geekdo.com/api/dynamicinfo?objectid={bgg_id}&objecttype=thing"
# Чемність: BGG просить не частіше за раз на секунду. Дві адреси на коробку,
# тож пауза між коробками — і між спробами, якщо сервер попросив зачекати.
REQUEST_PAUSE_SECONDS = 1.5
MAX_ATTEMPTS = 3
REQUEST_HEADERS = {"User-Agent": "polytsia-shelf/1.0 (+https://github.com/Tavi599/MyBoardGames)",
                   "Accept": "application/json"}
# Опитування спільноти зводиться до складів 1..10 — далі це вже не про стіл.
# Те саме число стоїть у «check.py»: воно там і перевіряється.
POLL_PLAYER_CEILING = 10
# Це не жанри, а службові позначки BGG: «доповнення до базової гри». У нас
# для цього є своя галочка в картці, а в стрічці жанрів такий чип був би
# шумом — та ще й без українського підпису.
NON_GENRE_SLUGS = {"expansion-for-base-game", "fan-expansion-for-base-game"}
# Єдине поле, яке освіження має право стерти: гра, що вибула з рейтингу,
# не має рангу, і давнє число тут було б неправдою. Решту не чистимо
# ніколи — див. коментар у apply_fresh_data().
ERASABLE_FIELDS = {"bggRank"}

# Поле в записі → звідки його брати. Порядок тут же й порядок показу.
BGG_FIELDS = ["bggMin", "bggMax", "bggTimeMin", "bggTimeMax", "bggRating",
              "bggRank", "bggWeight", "bggBest", "bggRec",
              "bggFamily", "bggGenres", "bggMech"]
# За чим упізнаємо коробку, яку BGG ще не бачив. Решта полів законно буває
# порожньою назавжди: рангу не має жодне доповнення, підрозділ адміністратори
# проставляють руками й не всім, а в свіжого запису може не бути й категорій.
# Якби «неповною» вважалася кожна така коробка, щоденний захід щодня марно
# перепитував би два десятки незмінних сторінок. Те, що BGG колись таки
# додасть, добере місячне освіження.
CORE_FIELDS = ["bggMin", "bggMax", "bggRating"]


def fetch_json(url: str) -> dict:
    """Одна відповідь BGG. Тимчасову відмову перечікуємо, решту віддаємо далі."""
    last_error = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            request = urllib.request.Request(url, headers=REQUEST_HEADERS)
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            last_error = error
            # 429 — «занадто часто», 5xx — «мені зараз зле». І те, і те минає.
            if error.code not in (429, 500, 502, 503, 504):
                raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
        time.sleep(REQUEST_PAUSE_SECONDS * (attempt + 2))
    raise last_error


def slug_from_href(href: str) -> str:
    """«/boardgamecategory/1002/card-game» → «card-game». Беремо саме з адреси:
    підпис на BGG перейменовують, слуг лишається."""
    return (href or "").rstrip("/").rsplit("/", 1)[-1]


def link_slugs(links: dict, kind: str) -> list[str]:
    return sorted({slug_from_href(link.get("href")) for link in (links.get(kind) or [])
                   if slug_from_href(link.get("href"))
                   and slug_from_href(link.get("href")) not in NON_GENRE_SLUGS})


def positive_int(value) -> int | None:
    """BGG віддає числа рядками, а невідоме — нулем чи порожнім рядком."""
    try:
        number = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def expand_player_ranges(ranges) -> list[int]:
    """[{min:3, max:4}] → [3, 4]. Це відповіді на «на скількох найкраще»."""
    counts = set()
    for player_range in ranges or []:
        lowest = positive_int(player_range.get("min"))
        highest = positive_int(player_range.get("max"))
        if lowest is None:
            continue
        for count in range(lowest, (highest or lowest) + 1):
            if count <= POLL_PLAYER_CEILING:
                counts.add(count)
    return sorted(counts)


def one_decimal(value) -> float | None:
    """Чужа середня — з одним знаком після коми: більше вона не означає."""
    try:
        number = round(float(value), 1)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def fetch_game(bgg_id: str) -> dict:
    """Усе, що знає BGG про цю коробку, — уже в наших полях і назвах."""
    # Номер іде просто в адресу, тож приймаємо тільки цифри. Він приходить із
    # даних, а дані бувають імпортовані з чужого файла: рядок звідти не має
    # права дописати собі шлях чи ще один параметр запиту.
    if not str(bgg_id).isdigit():
        raise ValueError(f"bggId має бути числом, а не {bgg_id!r}")
    item = fetch_json(ITEM_URL.format(bgg_id=bgg_id)).get("item") or {}
    dynamic = fetch_json(DYNAMIC_URL.format(bgg_id=bgg_id)).get("item") or {}
    links = item.get("links") or {}
    polls = (dynamic.get("polls") or {})
    fresh = {
        "bggMin": positive_int(item.get("minplayers")),
        "bggMax": positive_int(item.get("maxplayers")),
        "bggTimeMin": positive_int(item.get("minplaytime")),
        "bggTimeMax": positive_int(item.get("maxplaytime")),
        "bggRating": one_decimal((dynamic.get("stats") or {}).get("average")),
        "bggRank": overall_rank(dynamic.get("rankinfo")),
        "bggWeight": one_decimal((polls.get("boardgameweight") or {}).get("averageweight")),
        "bggBest": expand_player_ranges((polls.get("userplayers") or {}).get("best")),
        "bggRec": expand_player_ranges((polls.get("userplayers") or {}).get("recommended")),
        "bggFamily": link_slugs(links, "boardgamesubdomain"),
        "bggGenres": link_slugs(links, "boardgamecategory"),
        "bggMech": link_slugs(links, "boardgamemechanic"),
        "cover": (item.get("images") or {}).get("square200") or None,
        "name": item.get("name"),
    }
    # Порожній список — це не «нічого не знайшли», а «BGG про це мовчить».
    # Різниця важлива: перезаписувати наявне порожнечею не можна.
    return {field: value for field, value in fresh.items() if value not in (None, [], "")}


def overall_rank(rankinfo) -> int | None:
    """Загальний ранг серед усіх ігор. Підрозділові ранги («серед сімейних»)
    пропускаємо: у даних живе саме той, що на сторінці гри найбільший."""
    for rank in rankinfo or []:
        if str(rank.get("rankobjectid")) == "1":
            return positive_int(rank.get("rank"))
    return None


def poll_ceiling(game: dict) -> int:
    """Вище за стелю самої коробки опитування не читається.

    В опитуванні BGG є кошик «більше за стількох»: у «Діксіті» на шістьох
    голосують і за «6+», і воно приїжджає сімкою, а в «Жаху Аркхема» на
    двох — трійкою. Це не помилка BGG, це його спосіб питати; але в даних
    склад, якого коробка не дозволяє, — просто неправда, і перевірка
    справедливо на ньому спиняється."""
    ceiling = game.get("bggMax") or POLL_PLAYER_CEILING
    return min(ceiling, POLL_PLAYER_CEILING)


def apply_fresh_data(game: dict, fresh: dict, refresh: bool) -> list[str]:
    """Кладе чужі числа в запис. Повертає назви полів, які справді змінилися."""
    changed_fields = []
    for field in BGG_FIELDS:
        new_value = fresh.get(field)
        old_value = game.get(field)
        if field in ("bggBest", "bggRec") and new_value:
            # bggMax у списку йде раніше, тож стеля тут уже свіжа.
            new_value = [count for count in new_value if count <= poll_ceiling(game)] or None
        if new_value is None:
            # BGG про це мовчить. Стираємо лише ранг: гра могла вибути з
            # рейтингу, і давнє число стало б неправдою. Решту лишаємо як є —
            # у даних трапляється те, чого BGG не має (тривалість доповнення,
            # підрозділ, успадкований від базової гри), і це не сміття, а
            # свідомо проставлене. Освіження добирає числа, а не прибирає їх.
            if refresh and field in ERASABLE_FIELDS and field in game:
                del game[field]
                changed_fields.append("−" + field)
            continue
        if field in game and game[field] is not None and not refresh:
            continue
        if old_value != new_value:
            game[field] = new_value
            changed_fields.append(field)
    # Обкладинку ставимо лише на порожнє місце й ніколи не міняємо: там може
    # стояти твоя, вибрана свідомо, і чуже посилання її не переб'є.
    if fresh.get("cover") and not game.get("cover"):
        game["cover"] = fresh["cover"]
        changed_fields.append("cover")
    return changed_fields


def is_incomplete(game: dict) -> bool:
    """Чи є сенс іти по цю коробку в щоденному заході."""
    return any(game.get(field) in (None, [], "") for field in CORE_FIELDS) \
        or not game.get("cover")


def detect_newline(path: pathlib.Path = DATA_FILE) -> str:
    """Кінці рядків лишаємо ті, що були: у Windows-копії вони свої, і міняти
    їх означало б переписати весь файл заради нічого.

    newline="" тут обов'язковий, і саме через це стара перевірка мовчала:
    без нього python зводить віндові кінці до звичайних ще при читанні,
    тож шукати їх у прочитаному — марна праця. Кількох кілобайтів досить:
    кінець рядка в файлі один на всіх."""
    try:
        with open(path, encoding="utf-8", newline="") as file:
            return "\r\n" if "\r\n" in file.read(4096) else "\n"
    except OSError:
        return "\n"


def read_state() -> tuple[dict, str]:
    with open(DATA_FILE, encoding="utf-8", newline="") as file:
        text = file.read()
    return json.loads(text), "\r\n" if "\r\n" in text else "\n"


def write_state(state: dict, newline: str, path: pathlib.Path = DATA_FILE) -> None:
    """Єдине місце, де оцінки лягають на диск: звідси пишуть і щоденне
    добирання, і сервер.

    Ключі не перевпорядковуємо. Файл пишуть троє — сторінка, сервер і ми,
    — а сторінка сортувати їх не вміє й не буде: вона віддає записи в тому
    порядку, в якому їх прочитала. Тож варто комусь одному «навести лад»,
    як наступне збереження з телефона поверне все назад, а коміт між ними
    буде на весь файл замість одного рядка з оцінкою.

    Через тимчасовий файл: заміна, перервана на середині, лишила б замість
    ста п'ятдесяти кілобайтів оцінок обрізок."""
    text = json.dumps(state, ensure_ascii=False, indent=2) + "\n"
    if newline != "\n":
        text = text.replace("\n", newline)
    temp_path = path.with_suffix(".json.tmp")
    temp_path.write_text(text, encoding="utf-8", newline="")
    os.replace(temp_path, path)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Числа з BGG для полиці")
    parser.add_argument("--all", "--усі", dest="refresh_all", action="store_true",
                        help="освіжити й те, що вже є: оцінка й ранг пливуть")
    parser.add_argument("--only", "--лише", dest="only_ids", nargs="+", metavar="ID",
                        help="тільки ці коробки, за id у даних")
    parser.add_argument("--show", "--показати", dest="show_only", action="store_true",
                        help="нічого не писати, лише показати різницю")
    options = parser.parse_args(argv)

    state, newline = read_state()
    games = state.get("games") or []
    names_without_bgg_id, fetched_count, changed_names = [], 0, []

    for game in games:
        if game.get("deleted"):
            continue
        if options.only_ids and game.get("id") not in options.only_ids:
            continue
        if not game.get("bggId"):
            names_without_bgg_id.append(game.get("name") or game.get("id"))
            continue
        if not options.refresh_all and not options.only_ids and not is_incomplete(game):
            continue
        name = game.get("name") or game.get("id")
        try:
            fresh = fetch_game(str(game["bggId"]))
        except Exception as error:                        # noqa: BLE001
            print(f"  ✗ {name}: {type(error).__name__} {error}")
            continue
        fetched_count += 1
        changed_fields = apply_fresh_data(
            game, fresh, refresh=bool(options.refresh_all or options.only_ids))
        if changed_fields:
            changed_names.append(name)
            print(f"  · {name}: {', '.join(changed_fields)}")
        time.sleep(REQUEST_PAUSE_SECONDS)

    print(f"Опитано коробок: {fetched_count}; змінено: {len(changed_names)}.")
    if names_without_bgg_id:
        print(f"Без bggId (їх не чіпаємо): {len(names_without_bgg_id)} — "
              f"{', '.join(names_without_bgg_id[:5])}"
              + ("…" if len(names_without_bgg_id) > 5 else ""))
    if changed_names and not options.show_only:
        write_state(state, newline)
        print(f"Записано в {DATA_FILE.name}.")
    elif options.show_only:
        print("Показ без запису: файл не чіпали.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
