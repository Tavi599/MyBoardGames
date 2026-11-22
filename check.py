# -*- coding: utf-8 -*-
"""Звіряє «ratings.json» зі схемою, перш ніж він поїде в репозиторій.

Дані тут — єдина річ, яку не відновиш із коду, тож ламати їх найдорожче.
Запускати перед комітом:  python check.py

Виходить із нулем, якщо все чисто; з одиницею, якщо є помилки.
Попередження (жовті) не валять перевірку, але їх варто читати.
"""
import json
import pathlib
import re
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = pathlib.Path(__file__).parent
DATA_FILE = ROOT_DIR / "ratings.json"

# Коли каталог доросте до цього розміру, час ділити його на каталог і
# журнал партій (шостий етап плану). Поріг тут, щоб про нього не забули.
SPLIT_THRESHOLD_BYTES = 250 * 1024

# Сталі формату даних живуть в одному файлі зі сторінкою: «build.py» вкладає
# «src/schema.json» у код константою SCHEMA, а ми читаємо його напряму. Доки
# номер версії та списки лежали у двох файлах під чесне слово, номер одного
# разу вже розійшовся, і сервер тихо ставив на свіжі дані давню позначку.
SCHEMA_FILE = ROOT_DIR / "src" / "schema.json"
SCHEMA = json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))

SCHEMA_VERSION = SCHEMA["version"]

# «хочу зіграти» й «відклав» скасовано на версії 3; «чужа» — коробка є,
# але не твоя. Міграція на сторінці викидає скасовані з давніх записів.
STATUSES = set(SCHEMA["statuses"])
# «5+» — це «більше за п'ятьох, скільки коробка дозволяє»; підпис до нього
# сторінка бере з bggMax кожної гри окремо. Ключ навмисне сталий: якби він
# залежав від стелі, зміна даних на BGG перейменовувала б чужі оцінки.
PLAYER_COUNTS = set(SCHEMA["playerCounts"])
RULE_KINDS = set(SCHEMA["ruleKinds"])

# Опитування спільноти зводиться до складів 1..10 — далі це вже не про стіл.
POLL_PLAYER_CEILING = 10
KNOWN_FIELDS = {
    "id", "name", "nameEn", "statuses", "status", "score", "byCount", "weight",
    "plays", "minP", "maxP", "minutes", "tags", "comment", "cover", "expansion",
    "withExp", "bggId", "bggRating", "bggRank", "added", "updated", "deleted",
    "rules", "bggMin", "bggMax", "bggBest", "bggRec", "bggTimeMin", "bggTimeMax",
    "bggWeight", "bggFamily", "bggGenres", "bggMech", "family", "log",
}

# Підписи жанрів живуть в одному файлі зі сторінкою: «build.py» вкладає
# його в код, а ми звіряємо з ним дані. Якби списки лежали окремо, вони б
# розійшлися першого ж разу, коли на полицю стане гра з новим жанром.
GENRES_FILE = ROOT_DIR / "src" / "genres.json"

found_errors: list[str] = []
found_warnings: list[str] = []


def add_error(where, message):
    found_errors.append(f"{where}: {message}")


def add_warning(where, message):
    found_warnings.append(f"{where}: {message}")


def check_own_score(where, field, value, ceiling):
    """Оцінки ходять із кроком у пів бала й не перестрибують стелю."""
    if value is None:
        return
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return add_error(where, f"{field} має бути числом, а не {type(value).__name__}")
    if not 0 < value <= ceiling:
        add_error(where, f"{field} = {value}, а має бути від 0 до {ceiling}")
    elif (value * 2) % 1:
        add_error(where, f"{field} = {value}: дозволені лише цілі та половинки")


def check_bgg_number(where, field, value, ceiling=10):
    """Число з BGG — не твоє: там середнє з тисяч голосів, тож десяткова
    з одним знаком (7,6), а не половинка."""
    if value is None:
        return
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return add_error(where, f"{field} має бути числом, а не {type(value).__name__}")
    if not 0 < value <= ceiling:
        add_error(where, f"{field} = {value}, а має бути від 0 до {ceiling}")
    elif round(value, 1) != value:
        add_error(where, f"{field} = {value}: більше за один знак після коми")


def check_poll(where, field, value, box_ceiling):
    """Склади, які спільнота назвала найкращими чи придатними: зростаючий
    список без повторів, у межах того, що коробка взагалі дозволяє."""
    if value is None:
        return
    if not isinstance(value, list):
        return add_error(where, f"{field} має бути списком")
    if not all(isinstance(count, int) and not isinstance(count, bool) for count in value):
        return add_error(where, f"{field} має бути списком цілих")
    if value != sorted(set(value)):
        add_error(where, f"{field} = {value}: має бути зростаючий список без повторів")
    limit = min(box_ceiling or POLL_PLAYER_CEILING, POLL_PLAYER_CEILING)
    out_of_range = [count for count in value if not 1 <= count <= limit]
    if out_of_range:
        add_error(where, f"{field} має склади поза межами 1..{limit}: {out_of_range}")


def check_play_log(where, value, plays):
    """Журнал партій: записи з датою, від давнішої до свіжішої, і їх ніколи
    не більше, ніж самих партій, — партія без запису буває (зіграли до
    журналу), запис без партії не буває."""
    if value is None:
        return
    if not isinstance(value, list):
        return add_error(where, "log має бути списком")
    dates = []
    today = datetime.now().strftime("%Y-%m-%d")
    for index, entry in enumerate(value):
        entry_where = f"{where} log[{index}]"
        if not isinstance(entry, dict):
            add_error(entry_where, "не об'єкт")
            continue
        unknown_keys = set(entry) - {"on", "count", "note"}
        if unknown_keys:
            add_warning(entry_where, "невідомі поля: " + ", ".join(sorted(unknown_keys)))
        played_on = entry.get("on")
        if not isinstance(played_on, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", played_on):
            add_error(entry_where, f"on = {played_on!r}: потрібен день у вигляді YYYY-MM-DD")
        else:
            try:
                datetime.fromisoformat(played_on)
                dates.append(played_on)
                if played_on > today:
                    add_warning(entry_where, f"партія {played_on} — у майбутньому")
            except ValueError:
                add_error(entry_where, f"on = {played_on!r} — такого дня немає")
        if "count" in entry and entry["count"] not in PLAYER_COUNTS:
            add_error(entry_where, f"count = {entry['count']!r}: це не склад столу")
        if "note" in entry and not isinstance(entry["note"], str):
            add_error(entry_where, "note має бути рядком")
    if dates != sorted(dates):
        add_error(where, "log має йти від давнішої партії до свіжішої")
    if len(value) > (plays or 0):
        add_error(where, f"у журналі {len(value)} партій, а лічильник каже {plays or 0}")


def check_integer(where, field, value, minimum=0, maximum=None):
    if value is None:
        return
    if not isinstance(value, int) or isinstance(value, bool):
        return add_error(where, f"{field} має бути цілим, а не {type(value).__name__}")
    if value < minimum or (maximum is not None and value > maximum):
        add_error(where, f"{field} = {value} поза межами {minimum}..{maximum or '∞'}")


def check_timestamp(where, field, value, required):
    if value is None:
        if required:
            add_error(where, f"немає {field}")
        return
    try:
        datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        add_error(where, f"{field} = {value!r} — не читається як дата")


def load_known_slugs():
    """Слуги жанрів, до яких є український підпис. Порожньо, якщо словника
    немає: перевірка даних не має падати через відсутній файл сторінки."""
    try:
        genres = json.loads(GENRES_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return {"bggFamily": set(genres.get("families", {})),
            "bggGenres": set(genres.get("genres", {}))}


def check_slugs(where, field, value, known_slugs):
    """Слуги з BGG: рядки-слуги, без повторів, і кожен із підписом."""
    if value is None:
        return
    if not isinstance(value, list) or not all(isinstance(slug, str) for slug in value):
        return add_error(where, f"{field} має бути списком рядків")
    if value != sorted(set(value)):
        add_error(where, f"{field} = {value}: має бути впорядкований список без повторів")
    malformed = [slug for slug in value
                 if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug)]
    if malformed:
        add_error(where, f"{field}: не слуги — {malformed}")
    if known_slugs is not None:
        unlabeled = sorted(set(value) - known_slugs[field])
        if unlabeled:
            # Не помилка: дані цілі, просто сторінка покаже слуг як є.
            add_warning(where, f"{field}: немає українського підпису — {', '.join(unlabeled)}")


def validate(state):
    """Повертає (помилки, застереження). Викликається і з тестів.

    Копії, а не самі списки: доки віддавалися самі, два виклики поспіль
    давали один і той самий об'єкт — і порівняння «що було до / що стало
    після» мовчки перетворювалося на порівняння списку із самим собою."""
    found_errors.clear()
    found_warnings.clear()
    _validate(state)
    return list(found_errors), list(found_warnings)


def _validate(state):
    games = state.get("games")
    if not isinstance(games, list):
        add_error("корінь", "немає списку games")
        return
    if not state.get("saved"):
        add_warning("корінь", "немає позначки saved")
    version = state.get("version")
    if version is None:
        add_error("корінь", "немає version: файл не пройшов міграцію")
    elif isinstance(version, int) and version < SCHEMA_VERSION:
        # Давніший номер — не біда, а слід: файл востаннє писала сторінка,
        # яка ще не оновилася (телефон із кешу, наприклад). Дані від того
        # не псуються — міграція доведе їх до пуття при першому ж читанні,
        # і номер підтягнеться сам. Валити на цьому коміт означало б
        # тримати полицю заручником браузерного кеша.
        add_warning("корінь", f"version = {version}, а програма вже на {SCHEMA_VERSION}: "
                              "файл писала сторінка давнішого зразка")
    elif version != SCHEMA_VERSION:
        # А от новіший номер — це вже справді біда: писала сторінка, яка
        # знає про дані більше за нас, і перезаписувати їх наосліп не можна.
        add_error("корінь", f"version = {version}, а програма чекає {SCHEMA_VERSION}")

    known_slugs = load_known_slugs()
    names_by_id = {}
    for index, game in enumerate(games):
        if not isinstance(game, dict):
            add_error(f"games[{index}]", "не об'єкт")
            continue
        game_id = game.get("id")
        where = f"«{game.get('name') or game_id or index}»"

        if not isinstance(game_id, str) or not game_id:
            add_error(where, "немає id")
        elif game_id in names_by_id:
            add_error(where, f"id {game_id} уже зайнятий грою «{names_by_id[game_id]}»")
        else:
            names_by_id[game_id] = game.get("name") or game_id

        # Надгробок — це запис про видалену коробку; решти полів у нього нема.
        if game.get("deleted"):
            check_timestamp(where, "updated", game.get("updated"), required=True)
            continue

        if not isinstance(game.get("name"), str) or not game["name"].strip():
            add_error(where, "порожня назва")
        for field in ("nameEn", "comment", "cover", "bggId"):
            if field in game and not isinstance(game[field], str):
                add_error(where, f"{field} має бути рядком")
        # Обкладинка йде в src, тому схема тут — питання не смаку, а безпеки:
        # «javascript:» у сторінці означає чужий код, а в сторінці лежить
        # ключ доступу до репозиторію. Сторінка такі адреси відкидає сама,
        # але в даних їм узагалі не місце.
        if game.get("cover"):
            cover_url = str(game["cover"])
            if not cover_url.startswith(("http://", "https://")):
                add_error(where, f"обкладинка не http(s): {cover_url[:40]!r}")
            elif not cover_url.startswith("https://"):
                add_warning(where, "обкладинка не через https")
        # Те саме з bggId: він підставляється просто в адресу запиту до BGG,
        # а приїжджає з чужого вивантаженого CSV.
        if game.get("bggId") and not str(game["bggId"]).isdigit():
            add_error(where, f"bggId має бути числом, а не {game['bggId']!r}")

        statuses = game.get("statuses")
        if statuses is None:
            add_error(where, "немає statuses (запис не пройшов міграцію?)")
        elif not isinstance(statuses, list) or not all(isinstance(key, str) for key in statuses):
            add_error(where, "statuses має бути списком рядків")
        else:
            unknown_statuses = set(statuses) - STATUSES
            if unknown_statuses:
                add_error(where, "невідомі статуси: " + ", ".join(sorted(unknown_statuses)))
            if len(set(statuses)) != len(statuses):
                add_error(where, "статус повторюється")
            # Старе поле лишається дзеркалом першого статусу — на нього
            # спирається сторінка, закешована до переходу на список.
            if statuses and game.get("status") != statuses[0]:
                add_error(where, f"status = {game.get('status')!r}, "
                                 f"а перший у statuses — {statuses[0]!r}")

        check_own_score(where, "score", game.get("score"), 10)
        check_own_score(where, "weight", game.get("weight"), 5)
        check_bgg_number(where, "bggRating", game.get("bggRating"))
        check_bgg_number(where, "bggWeight", game.get("bggWeight"), 5)
        check_integer(where, "plays", game.get("plays"), 0)
        check_play_log(where, game.get("log"), game.get("plays"))
        check_integer(where, "bggRank", game.get("bggRank"), 1)
        check_integer(where, "minP", game.get("minP"), 1, 100)
        check_integer(where, "maxP", game.get("maxP"), 1, 100)
        check_integer(where, "minutes", game.get("minutes"), 1, 6000)
        # Стеля тут аж 100: «Картографи» офіційно грають будь-яким натовпом,
        # і це не помилка даних, а справді така коробка.
        check_integer(where, "bggMin", game.get("bggMin"), 1, 100)
        check_integer(where, "bggMax", game.get("bggMax"), 1, 100)
        check_integer(where, "bggTimeMin", game.get("bggTimeMin"), 1, 6000)
        check_integer(where, "bggTimeMax", game.get("bggTimeMax"), 1, 6000)
        check_poll(where, "bggBest", game.get("bggBest"), game.get("bggMax"))
        check_poll(where, "bggRec", game.get("bggRec"), game.get("bggMax"))
        # Своя родина перевіряється тим самим словником, що й чужа:
        # вигаданий слуг тут був би так само невидимий у стрічці.
        check_slugs(where, "family", game.get("family"), known_slugs and
                    {"family": known_slugs["bggFamily"]})
        check_slugs(where, "bggFamily", game.get("bggFamily"), known_slugs)
        check_slugs(where, "bggGenres", game.get("bggGenres"), known_slugs)
        # Механіки перевіряємо лише за формою: їх на BGG сто двадцять,
        # а показуємо ми не їх, а зведені з них ключові жанри, тож
        # українських підписів до кожної тут немає й не треба.
        check_slugs(where, "bggMech", game.get("bggMech"), None)
        for lower_field, upper_field in (("minP", "maxP"), ("bggMin", "bggMax"),
                                         ("bggTimeMin", "bggTimeMax")):
            lower, upper = game.get(lower_field), game.get(upper_field)
            if isinstance(lower, int) and isinstance(upper, int) and lower > upper:
                add_error(where, f"{lower_field} {lower} більше за {upper_field} {upper}")

        scores_by_count = game.get("byCount")
        if scores_by_count is not None:
            if not isinstance(scores_by_count, dict):
                add_error(where, "byCount має бути об'єктом")
            else:
                unknown_counts = set(scores_by_count) - PLAYER_COUNTS
                if unknown_counts:
                    add_error(where, "byCount має зайві склади: "
                                     + ", ".join(sorted(unknown_counts)))
                for count, score in scores_by_count.items():
                    check_own_score(where, f"byCount[{count}]", score, 10)

        tags = game.get("tags")
        if tags is not None and (not isinstance(tags, list)
                                 or not all(isinstance(tag, str) for tag in tags)):
            add_error(where, "tags має бути списком рядків")

        if "expansion" in game and not isinstance(game["expansion"], bool):
            add_error(where, "expansion має бути true/false")

        rules = game.get("rules")
        if rules is not None:
            if not isinstance(rules, list):
                add_error(where, "rules має бути списком")
            else:
                seen_urls = set()
                for rule_index, rule in enumerate(rules):
                    rule_where = f"{where} rules[{rule_index}]"
                    if not isinstance(rule, dict):
                        add_error(rule_where, "не об'єкт")
                        continue
                    unknown_keys = set(rule) - {"title", "url", "kind"}
                    if unknown_keys:
                        add_warning(rule_where,
                                    "невідомі поля: " + ", ".join(sorted(unknown_keys)))
                    url = rule.get("url")
                    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
                        add_error(rule_where, f"url = {url!r}: потрібне посилання http(s)")
                    elif url in seen_urls:
                        add_error(rule_where, "те саме посилання вже є в цієї гри")
                    else:
                        seen_urls.add(url)
                    if rule.get("kind") not in RULE_KINDS:
                        add_error(rule_where, f"невідомий вид правил: {rule.get('kind')!r}")

        check_timestamp(where, "updated", game.get("updated"), required=True)
        check_timestamp(where, "added", game.get("added"), required=False)

        unknown_fields = set(game) - KNOWN_FIELDS
        if unknown_fields:
            add_warning(where, "невідомі поля: " + ", ".join(sorted(unknown_fields)))

    # Прив'язки перевіряємо другим проходом: вони можуть указувати вперед.
    expansion_ids = {game.get("id") for game in games if game.get("expansion")}
    for game in games:
        if game.get("deleted") or "withExp" not in game:
            continue
        where = f"«{game.get('name')}»"
        linked_ids = game["withExp"]
        if not isinstance(linked_ids, list):
            add_error(where, "withExp має бути списком")
            continue
        if game.get("expansion"):
            add_error(where, "доповнення не може тягнути за собою інші доповнення")
        for linked_id in linked_ids:
            if linked_id not in names_by_id:
                add_error(where, f"withExp вказує на неіснуючу коробку {linked_id}")
            elif linked_id not in expansion_ids:
                add_error(where, f"withExp вказує на {linked_id}, а та коробка не доповнення")
            elif linked_id == game.get("id"):
                add_error(where, "withExp вказує сам на себе")


def main():
    if not DATA_FILE.exists():
        print("Немає", DATA_FILE.name)
        return 1
    size = DATA_FILE.stat().st_size
    try:
        state = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        print(f"✗ {DATA_FILE.name} не читається як JSON: {error}")
        return 1

    errors, warnings = validate(state)

    game_count = len(state.get("games", []))
    print(f"Коробок: {game_count}. Розмір: {size / 1024:.0f} КБ.")
    if size > SPLIT_THRESHOLD_BYTES:
        print(f"\n▲ Каталог переріс {SPLIT_THRESHOLD_BYTES // 1024} КБ. Час ділити його на "
              "каталог і журнал партій — це шостий етап плану.")

    for line in warnings:
        print("  ~", line)
    for line in errors:
        print("  ✗", line)

    if errors:
        print(f"\n✗ Помилок: {len(errors)}. Комітити не варто.")
        return 1
    print("\n✓ Дані цілі" + (f", застережень: {len(warnings)}" if warnings else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
