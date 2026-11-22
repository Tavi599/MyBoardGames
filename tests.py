# -*- coding: utf-8 -*-
"""Тести на перевірку даних: чи ловить вона те, заради чого написана.

Перевірка, яка завжди каже «добре», гірша за її відсутність — вона ще й
заспокоює. Тут кожна вада підкладається навмисне, і тест падає, якщо
перевірка її проґавила.

Запуск:  python tests.py
"""
import copy
import json
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8")

import check

SAMPLE = {
    "version": check.SCHEMA_VERSION,
    "saved": "2026-09-12T10:00:00.000Z",
    "games": [
        {
            "id": "g-base", "name": "Основна", "nameEn": "Base",
            "statuses": ["колекція", "улюблена"], "status": "колекція",
            "score": 8.5, "weight": 3, "plays": 4,
            "log": [{"on": "2026-08-30", "count": "2"},
                    {"on": "2026-09-11", "note": "виграв Тарас"}],
            "byCount": {"1": 6, "2": 9, "4": 7.5, "5+": 5},
            "minP": 1, "maxP": 4, "minutes": 60,
            "bggMin": 1, "bggMax": 6, "bggBest": [2, 3], "bggRec": [1, 2, 3, 4],
            "bggTimeMin": 45, "bggTimeMax": 90, "bggWeight": 2.8,
            "bggFamily": ["strategy-games"], "bggGenres": ["card-game", "fantasy"],
            "tags": ["євро"], "comment": "",
            "cover": "https://example.test/a.jpg",
            "bggId": "1", "bggRating": 7.6, "bggRank": 120,
            "withExp": ["g-exp"],
            "rules": [{"title": "Правила", "kind": "офіційні",
                       "url": "https://example.test/rules.pdf"}],
            "added": "2026-09-01", "updated": "2026-09-12T10:00:00.000Z",
        },
        {
            "id": "g-exp", "name": "Доповнення", "nameEn": "Exp",
            "statuses": ["колекція"], "status": "колекція",
            "expansion": True, "plays": 0, "score": None, "byCount": {},
            "tags": [], "comment": "",
            "added": "2026-09-01", "updated": "2026-09-12T10:00:00.000Z",
        },
        {"id": "g-gone", "deleted": True, "updated": "2026-09-12T10:00:00.000Z"},
    ],
}

# Кожна вада: що зіпсувати і який шматок тексту має з'явитися в помилці.
DEFECTS = [
    ("оцінка понад стелю", lambda state: state["games"][0].update(score=11), "score"),
    ("чверть бала", lambda state: state["games"][0].update(score=8.25), "половинки"),
    ("оцінка BGG на два знаки",
     lambda state: state["games"][0].update(bggRating=7.65), "знак"),
    # Адреси й номери, які підставляються в сторінку чи в чужий запит.
    ("обкладинка як javascript:",
     lambda state: state["games"][0].update(cover="javascript:alert(1)"), "не http(s)"),
    ("bggId не число", lambda state: state["games"][0].update(bggId="1&objecttype=x"),
     "bggId має бути числом"),
    ("від'ємні партії", lambda state: state["games"][0].update(plays=-1), "plays"),
    ("партії дробом", lambda state: state["games"][0].update(plays=1.5), "plays"),
    ("порожня назва", lambda state: state["games"][0].update(name="  "), "назва"),
    ("id повторюється", lambda state: state["games"][1].update(id="g-base"), "зайнятий"),
    ("немає statuses", lambda state: state["games"][0].pop("statuses"), "statuses"),
    ("вигаданий статус",
     lambda state: state["games"][0].update(statuses=["мрію"], status="мрію"),
     "невідомі статуси"),
    ("статус повторюється",
     lambda state: state["games"][0].update(statuses=["колекція", "колекція"]),
     "повторюється"),
    ("дзеркало status розійшлося",
     lambda state: state["games"][0].update(status="позбувся"), "перший у statuses"),
    ("склад столу на трьох з половиною",
     lambda state: state["games"][0]["byCount"].update({"7": 6}), "зайві склади"),
    ("склад «6+» замість сталого «5+»",
     lambda state: state["games"][0]["byCount"].update({"6+": 6}), "зайві склади"),
    ("оцінка складу понад стелю",
     lambda state: state["games"][0]["byCount"].update({"2": 12}), "byCount"),
    ("від більше за до",
     lambda state: state["games"][0].update(minP=5, maxP=2), "більше за maxP"),
    ("склад з BGG навиворіт",
     lambda state: state["games"][0].update(bggMin=6, bggMax=2), "більше за bggMax"),
    ("час з BGG навиворіт",
     lambda state: state["games"][0].update(bggTimeMin=90, bggTimeMax=45),
     "більше за bggTimeMax"),
    ("вага BGG понад стелю",
     lambda state: state["games"][0].update(bggWeight=6.2), "від 0 до 5"),
    ("вага BGG на два знаки",
     lambda state: state["games"][0].update(bggWeight=2.85), "знак"),
    ("опитування не списком",
     lambda state: state["games"][0].update(bggBest="2-3"), "списком"),
    ("опитування дробом",
     lambda state: state["games"][0].update(bggBest=[2, 3.5]), "цілих"),
    ("опитування з повтором",
     lambda state: state["games"][0].update(bggRec=[1, 2, 2]), "без повторів"),
    ("опитування не за порядком",
     lambda state: state["games"][0].update(bggRec=[3, 1, 2]), "зростаючий"),
    ("опитування вище за стелю коробки",
     lambda state: state["games"][0].update(bggBest=[2, 9]), "поза межами"),
    ("жанри не списком",
     lambda state: state["games"][0].update(bggGenres="fantasy"), "списком рядків"),
    ("жанр не слугом",
     lambda state: state["games"][0].update(bggGenres=["Card Game"]), "не слуги"),
    ("жанр повторюється",
     lambda state: state["games"][0].update(bggGenres=["card-game", "card-game"]),
     "без повторів"),
    ("жанри не за абеткою",
     lambda state: state["games"][0].update(bggGenres=["fantasy", "card-game"]),
     "впорядкований"),
    ("родина не слугом",
     lambda state: state["games"][0].update(bggFamily=["Strategy Games"]), "не слуги"),
    ("прив'язка в нікуди",
     lambda state: state["games"][0].update(withExp=["g-нема"]), "неіснуючу"),
    ("прив'язка до не-доповнення",
     lambda state: (state["games"][1].pop("expansion"), None)[1], "не доповнення"),
    ("доповнення тягне доповнення",
     lambda state: state["games"][1].update(withExp=["g-exp"]), "не може тягнути"),
    ("дата поламана",
     lambda state: state["games"][0].update(updated="учора"), "не читається"),
    ("надгробок без дати", lambda state: state["games"][2].pop("updated"), "немає updated"),
    ("теги не списком", lambda state: state["games"][0].update(tags="євро"), "tags"),
    ("expansion рядком",
     lambda state: state["games"][1].update(expansion="так"), "true/false"),
    ("немає games", lambda state: state.pop("games"), "games"),
    ("немає version", lambda state: state.pop("version"), "version"),
    ("version із майбутнього", lambda state: state.update(version=99), "чекає"),
    ("правила не списком", lambda state: state["games"][0].update(rules={}), "rules"),
    ("правила без посилання",
     lambda state: state["games"][0]["rules"][0].pop("url"), "потрібне посилання"),
    ("правила на файл із диска",
     lambda state: state["games"][0]["rules"][0].update(url="file:///C:/rules.pdf"),
     "потрібне посилання"),
    ("вигаданий вид правил",
     lambda state: state["games"][0]["rules"][0].update(kind="шпаргалка"), "невідомий вид"),
    ("те саме посилання двічі",
     lambda state: state["games"][0]["rules"].append(dict(state["games"][0]["rules"][0])),
     "вже є"),
    ("журнал не списком", lambda state: state["games"][0].update(log={}), "log"),
    ("партія без дати", lambda state: state["games"][0]["log"][0].pop("on"), "YYYY-MM-DD"),
    ("день, якого немає",
     lambda state: state["games"][0]["log"][0].update(on="2026-02-31"), "такого дня немає"),
    ("дата навиворіт",
     lambda state: state["games"][0]["log"][0].update(on="30.08.2026"), "YYYY-MM-DD"),
    ("журнал не за порядком",
     lambda state: state["games"][0].update(log=list(reversed(state["games"][0]["log"]))),
     "від давнішої"),
    ("склад партії вигаданий",
     lambda state: state["games"][0]["log"][0].update(count="7"), "не склад столу"),
    ("нотатка не рядком",
     lambda state: state["games"][0]["log"][0].update(note=7), "note"),
    # Найважливіше з усього журналу: записів не може бути більше за партії.
    ("записів більше, ніж партій",
     lambda state: state["games"][0].update(plays=1), "лічильник каже"),
]


# ── розбір відповіді BGG ───────────────────────────────────────────────
# «bgg.py» ходить у мережу, але переклад чужого JSON у наші поля — річ
# чиста, і саме в ньому легко помилитися тихо: не той ключ, не та стеля,
# зайва службова позначка серед жанрів. Тому шматок відповіді тут
# підкладений, а мережі не треба.
ITEM_RESPONSE = {
    "item": {
        "name": "Проба",
        "minplayers": "2", "maxplayers": "5",
        "minplaytime": "30", "maxplaytime": "45",
        "images": {"square200": "https://cf.geekdo-images.com/x__square200/pic1.jpg"},
        "links": {
            "boardgamecategory": [
                {"name": "Fantasy", "href": "/boardgamecategory/1010/fantasy"},
                {"name": "Card Game", "href": "/boardgamecategory/1002/card-game"},
                {"name": "Expansion", "href": "/boardgamecategory/1042/expansion-for-base-game"},
            ],
            "boardgamemechanic": [
                {"name": "Hand Management", "href": "/boardgamemechanic/2040/hand-management"}],
            "boardgamesubdomain": [
                {"name": "Family Games", "href": "/boardgamesubdomain/5499/family-games"}],
        },
    }
}
DYNAMIC_RESPONSE = {
    "item": {
        "stats": {"average": "7.5754"},
        "polls": {"boardgameweight": {"averageweight": 1.7167235494880546},
                  "userplayers": {"best": [{"min": 3, "max": 4}],
                                  "recommended": [{"min": 2, "max": 5}]}},
        "rankinfo": [{"rankobjectid": 1, "rank": "279"},
                     {"rankobjectid": 5497, "rank": "12"}],
    }
}


def make_expect(failures):
    """Порівняння для групи тестів: розбіжність лягає рядком у failures."""
    def expect(name, actual, expected):
        if actual != expected:
            failures.append(f"✗ {name}: маю {actual!r}, чекав {expected!r}")
    return expect


def bgg_tests():
    """Повертає список рядків про провали; порожній — усе добре."""
    import bgg
    failures = []
    expect = make_expect(failures)

    expect("слуг із адреси", bgg.slug_from_href("/boardgamecategory/1002/card-game"),
           "card-game")
    expect("порожня адреса", bgg.slug_from_href(None), "")
    expect("нуль — це «невідомо»", bgg.positive_int("0"), None)
    expect("число рядком", bgg.positive_int("45"), 45)
    expect("не число", bgg.positive_int("кілька"), None)
    expect("діапазони розгортаються",
           bgg.expand_player_ranges([{"min": 3, "max": 4}]), [3, 4])
    expect("склади злипаються без повторів",
           bgg.expand_player_ranges([{"min": 1, "max": 2}, {"min": 2, "max": 3}]), [1, 2, 3])
    expect("стеля опитування", bgg.expand_player_ranges([{"min": 9, "max": 40}]), [9, 10])
    expect("середня — з одним знаком", bgg.one_decimal("7.5754"), 7.6)

    # Той самий шлях, що й у мережі, лише відповіді підкладені.
    real_fetch_json = bgg.fetch_json
    bgg.fetch_json = lambda url: ITEM_RESPONSE if "geekitems" in url else DYNAMIC_RESPONSE
    try:
        fresh = bgg.fetch_game("1")
    finally:
        bgg.fetch_json = real_fetch_json

    expect("склад столу", (fresh.get("bggMin"), fresh.get("bggMax")), (2, 5))
    expect("тривалість", (fresh.get("bggTimeMin"), fresh.get("bggTimeMax")), (30, 45))
    expect("оцінка", fresh.get("bggRating"), 7.6)
    expect("вага", fresh.get("bggWeight"), 1.7)
    expect("ранг беремо загальний, а не підрозділовий", fresh.get("bggRank"), 279)
    expect("найкраще на", fresh.get("bggBest"), [3, 4])
    expect("годиться на", fresh.get("bggRec"), [2, 3, 4, 5])
    expect("жанри за абеткою й без службових позначок",
           fresh.get("bggGenres"), ["card-game", "fantasy"])
    expect("механіки", fresh.get("bggMech"), ["hand-management"])
    expect("підрозділ", fresh.get("bggFamily"), ["family-games"])

    # Порожньої коробки не буває: те, чого BGG не знає, просто не приходить.
    has_docstring = bgg.fetch_game.__doc__ is not None
    if not has_docstring:
        failures.append("✗ bgg.fetch_game без опису")

    # Що і як лягає в запис.
    game = {"bggMin": 2, "bggRating": 7.0, "cover": "https://своя/картинка.jpg",
            "minP": 3, "score": 9}
    changed_fields = bgg.apply_fresh_data(dict(game), fresh, refresh=False)
    expect("без освіження чуже не переписується", "bggRating" in changed_fields, False)
    expect("а порожнє добирається", "bggMax" in changed_fields, True)

    refreshed = dict(game)
    bgg.apply_fresh_data(refreshed, fresh, refresh=True)
    expect("освіження оновлює оцінку", refreshed["bggRating"], 7.6)
    expect("своїх полів не чіпає", (refreshed["minP"], refreshed["score"]), (3, 9))
    expect("своєї обкладинки не переб'є",
           refreshed["cover"], "https://своя/картинка.jpg")

    blank = {}
    bgg.apply_fresh_data(blank, fresh, refresh=False)
    expect("порожній коробці обкладинка стає",
           blank.get("cover"), "https://cf.geekdo-images.com/x__square200/pic1.jpg")

    # Кошик «6+» в опитуванні BGG: у коробки на двох звідти приїжджає
    # трійка. Складу, якого коробка не дозволяє, у даних бути не може —
    # на ньому справедливо спиняється «check.py».
    two_player = {}
    bgg.apply_fresh_data(two_player, {"bggMax": 2, "bggBest": [1, 2], "bggRec": [1, 2, 3]},
                         refresh=True)
    expect("опитування не перестрибує стелю коробки", two_player.get("bggRec"), [1, 2])
    expect("а те, що в межах, лишається", two_player.get("bggBest"), [1, 2])
    all_out_of_range = {}
    bgg.apply_fresh_data(all_out_of_range, {"bggMax": 2, "bggBest": [5, 6]}, refresh=True)
    expect("опитування цілком поза межами просто не пишеться",
           "bggBest" in all_out_of_range, False)

    # Кого щоденний захід узагалі бере в роботу. Помилитися тут дорого в
    # обидва боки: надто широко — і він щодня марно перепитує два десятки
    # незмінних сторінок, надто вузько — і нова коробка лишається порожньою.
    expect("щойно додана коробка — неповна", bgg.is_incomplete({"bggId": "1"}), True)
    complete = {"bggMin": 2, "bggMax": 4, "bggRating": 7.1, "cover": "https://x/1.jpg"}
    expect("повна — повна", bgg.is_incomplete(complete), False)
    expect("без обкладинки — ще ні",
           bgg.is_incomplete({key: value for key, value in complete.items()
                              if key != "cover"}), True)
    without_rank = dict(complete, bggFamily=None, bggRank=None, bggGenres=[])
    expect("доповнення без рангу й підрозділу повним лишається",
           bgg.is_incomplete(without_rank), False)

    # Мовчання BGG не стирає того, що вже є, — крім рангу.
    silent = {"bggTimeMax": 40, "bggFamily": ["thematic-games"], "bggRank": 900}
    bgg.apply_fresh_data(silent, {"bggMin": 2}, refresh=True)
    expect("тривалість лишається", silent.get("bggTimeMax"), 40)
    expect("підрозділ лишається", silent.get("bggFamily"), ["thematic-games"])
    expect("а ранг, якого вже нема, зникає", "bggRank" in silent, False)
    return failures


def security_tests():
    """Три замки локального сервера і межа, за яку не пускаємо bggId.

    Сервер слухає всю мережу, щоб до нього дійшов телефон, — а це означає, що
    постукати може й чужа сторінка з того самого браузера. Тести тут саме на
    те, що вона нікуди не дістукається, а своє все працює: інакше «захист»
    виявиться або дірявим, або таким, що ламає телефон.
    """
    import server
    import bgg
    failures = []
    expect = make_expect(failures)

    # Свої адреси — ті, з яких полицею справді користуються.
    for host in ("localhost:8777", "127.0.0.1:8777", "192.168.1.14:8777",
                 "[::1]:8777", "tavi-pc.local:8777", "localhost",
                 "TAVI-PC:8777", "полиця.lan:8777"):
        expect(f"свій хост {host}", server.is_own_host(host), True)
    # А ці — ознака того, що браузер привели до нас чужим ім'ям.
    for host in ("evil.example:8777", "полиця.zip", "localhost.evil.com",
                 "attacker.local.evil.com", "tavi-pc.local.evil.com",
                 "192.168.1.14.evil.com"):
        expect(f"чужий хост {host}", server.is_own_host(host), False)

    expect("Origin зі своєї ж адреси",
           server.is_own_page("http://192.168.1.14:8777", "192.168.1.14:8777"), True)
    expect("Origin чужої сторінки",
           server.is_own_page("http://evil.example", "localhost:8777"), False)
    expect("порожній Origin — це не браузерна сторінка",
           server.is_own_page(None, "localhost:8777"), True)
    # Найпідліший випадок: адреса, яка лише починається як наша.
    expect("Origin, схожий на свій",
           server.is_own_page("http://localhost:8777.evil.com", "localhost:8777"), False)

    # bggId іде просто в адресу запиту, а в даних він — рядок з чужого CSV.
    for malformed_id in ("1&objecttype=x", "../../etc", "13 ", "", "13; rm -rf"):
        try:
            bgg.fetch_game(malformed_id)
            failures.append(f"✗ bggId {malformed_id!r} пропустили в адресу запиту")
        except ValueError:
            pass
        except Exception as error:                         # noqa: BLE001
            failures.append(f"✗ bggId {malformed_id!r}: чекав ValueError, маю {error!r}")
    return failures


def consistency_tests():
    """Дві домовленості, які тримаються не на увазі, а на цій перевірці."""
    failures = []
    expect = make_expect(failures)

    # Сталі формату лежать в одному файлі — «src/schema.json» — і його читають
    # і сторінка (через «build.py»), і перевірка. Звіряти дві копії номера
    # більше не треба; лишається переконатися, що сам файл придатний: без
    # номера чи з порожнім списком статусів перевірка мовчки пропускала б
    # усе або відхиляла б усе.
    schema = json.loads(check.SCHEMA_FILE.read_text(encoding="utf-8"))
    version = schema.get("version")
    expect("номер формату — додатне ціле",
           isinstance(version, int) and not isinstance(version, bool) and version > 0, True)
    expect("перевірка знає той самий номер, що й схема", check.SCHEMA_VERSION, version)
    expect("склади столу — непорожній список рядків без повторів",
           bool(schema.get("playerCounts"))
           and all(isinstance(count, str) for count in schema["playerCounts"])
           and len(set(schema["playerCounts"])) == len(schema["playerCounts"]), True)
    for section in ("statuses", "ruleKinds"):
        labels = schema.get(section)
        expect(f"{section}: непорожній словник «ключ → підпис»",
               isinstance(labels, dict) and bool(labels)
               and all(isinstance(label, str) and label for label in labels.values()), True)
    expect("скасований статус не є водночас чинним",
           set(schema.get("retiredStatuses") or []) & set(schema.get("statuses") or {}), set())

    # Перевірка віддає копії. Доки віддавала свої внутрішні списки, «що було
    # до» і «що стало після» були одним об'єктом, і різниця між ними завжди
    # виходила порожньою.
    sample = copy.deepcopy(SAMPLE)
    sample["games"][0]["score"] = 11
    first_errors, _ = check.validate(sample)
    sample["games"][0]["score"] = 8.5
    second_errors, _ = check.validate(sample)
    expect("два виклики — два різні списки", first_errors is second_errors, False)
    expect("перший список не переписався", len(first_errors), 1)
    expect("другий чистий", len(second_errors), 0)
    return failures


def merge_tests():
    """Ті самі випадки, що й у сторінці, — «src/merge-cases.json».

    Правило злиття одне, а реалізацій три: mergeNewestWins() і
    replaceShelf() у браузері, merge_games() тут. Поділити між ними код не
    можна, тож ділимо перелік випадків: розійдуться реалізації — впаде
    котрась зі сторін.
    """
    import server
    failures = []
    cases_file = pathlib.Path(__file__).parent / "src" / "merge-cases.json"
    cases = json.loads(cases_file.read_text(encoding="utf-8"))["cases"]
    if not cases:
        return ["✗ перелік випадків злиття порожній"]
    for case in cases:
        merged, _ = server.merge_games(copy.deepcopy(case["base"]),
                                       copy.deepcopy(case["incoming"]))
        actual = sorted(merged, key=lambda game: game.get("id", ""))
        expected = sorted(case["expected"], key=lambda game: game.get("id", ""))
        if actual != expected:
            failures.append(f"✗ злиття: {case['name']}: маю {actual!r}, чекав {expected!r}")
    return failures


def bgg_apply_tests():
    """apply_bgg_data(): або кладе чужі числа, або не міняє нічого.

    Раніше цю функцію не можна було перевірити взагалі — вона жила
    всередині обробника HTTP і трималася на тому, що стан щоразу
    перечитується з диска. Тепер це звичайна функція над станом, і
    відкат у ній видно, а не мається на увазі.
    """
    import server
    failures = []
    expect = make_expect(failures)

    # У відповіді завжди є ранг: на вимогу добираємо з освіженням, а воно
    # має право стерти ранг у гри, що вибула з рейтингу. Мовчазна відповідь
    # тут означала б «її вибули», і кожен випадок нижче ще й це перевіряв би.
    def bgg_answer(**fields):
        return dict({"bggRank": 120}, **fields)

    # Звичайний випадок: чужі числа лягають на місце.
    state = copy.deepcopy(SAMPLE)
    state["games"][0].pop("bggWeight", None)
    changed_fields, failure = server.apply_bgg_data(state, "g-base", bgg_answer(bggWeight=2.9))
    expect("поле добралося", changed_fields, ["bggWeight"])
    expect("і жодної вади", failure, None)
    expect("значення на місці", state["games"][0].get("bggWeight"), 2.9)

    # BGG віддав те, що перевірка не приймає (оцінка на два знаки). Стан
    # має лишитися байт у байт таким, яким був: саме це раніше трималося
    # на негласній умові «стан однаково прочитають наново».
    state = copy.deepcopy(SAMPLE)
    state_before = copy.deepcopy(state)
    changed_fields, failure = server.apply_bgg_data(state, "g-base", bgg_answer(bggRating=7.65))
    expect("зіпсованого не взяли", changed_fields, [])
    expect("і сказали чому", failure is not None and failure[0], 502)
    expect("стан не змінився", state, state_before)

    # Крива сусідка не має заважати: помилка, яка була у файлі до нас, —
    # не привід відмовляти в добиранні цій коробці.
    state = copy.deepcopy(SAMPLE)
    state["games"][1]["bggId"] = "1&objecttype=x"
    state["games"][0].pop("bggWeight", None)
    changed_fields, failure = server.apply_bgg_data(state, "g-base", bgg_answer(bggWeight=2.9))
    expect("давня чужа вада не заважає", (changed_fields, failure), (["bggWeight"], None))

    # Коробки вже немає — і стан ніхто не чіпав.
    state = copy.deepcopy(SAMPLE)
    state_before = copy.deepcopy(state)
    changed_fields, failure = server.apply_bgg_data(state, "g-немає", bgg_answer(bggWeight=2.9))
    expect("невідома коробка",
           (changed_fields, failure is not None and failure[0]), ([], 404))
    expect("і стан цілий", state, state_before)

    # BGG не сказав нічого нового — тоді й записувати нема чого.
    state = copy.deepcopy(SAMPLE)
    state_before = copy.deepcopy(state)
    changed_fields, failure = server.apply_bgg_data(
        state, "g-base", bgg_answer(bggWeight=state["games"][0]["bggWeight"]))
    expect("нічого не змінилося", (changed_fields, failure), ([], None))
    expect("і стан той самий", state, state_before)
    return failures


# Група тестів → що друкувати, коли вона вся зелена.
TEST_GROUPS = [
    (bgg_tests, "✓ розбір відповіді BGG"),
    (security_tests, "✓ замки локального сервера"),
    (consistency_tests, "✓ лад: схема формату й копії списків"),
    (merge_tests, "✓ злиття: ті самі випадки, що й у сторінці"),
    (bgg_apply_tests, "✓ добирання з BGG: або кладе, або нічого не міняє"),
]


def main():
    failed_count = 0
    run_count = 0

    for run_group, success_message in TEST_GROUPS:
        run_count += 1
        failures = run_group()
        if failures:
            failed_count += len(failures)
            for line in failures:
                print("  ", line)
        else:
            print(success_message)

    run_count += 1
    errors, warnings = check.validate(copy.deepcopy(SAMPLE))
    if errors:
        print("✗ чистий зразок не проходить перевірку:")
        for line in errors:
            print("    ", line)
        failed_count += 1
    else:
        print("✓ чистий зразок проходить"
              + (f" (застережень: {len(warnings)})" if warnings else ""))

    # Жанр без українського підпису — не помилка: дані цілі, просто сторінка
    # покаже слуг як є. Але мовчати про це не можна, інакше новий жанр
    # заїде в інтерфейс англійською й ніхто не помітить.
    run_count += 1
    state = copy.deepcopy(SAMPLE)
    state["games"][0]["bggGenres"] = ["card-game", "quantum-ballet"]
    errors, warnings = check.validate(state)
    if errors:
        failed_count += 1
        print(f"✗ невідомий жанр став помилкою, а мав лишитися застереженням: {errors}")
    elif any("немає українського підпису" in line for line in warnings):
        print("✓ спіймано: жанр без підпису — застереженням, не помилкою")
    else:
        failed_count += 1
        print(f"✗ ПРОҐАВЛЕНО: жанр без українського підпису; застереження: {warnings}")

    # Давніший номер формату — теж застереження: так виглядає файл, який
    # востаннє зберіг телефон із кешованою сторінкою. Дані цілі, коміт має
    # проходити. А от новіший номер лишається помилкою — див. DEFECTS.
    run_count += 1
    state = copy.deepcopy(SAMPLE)
    state["version"] = check.SCHEMA_VERSION - 1
    errors, warnings = check.validate(state)
    if errors:
        failed_count += 1
        print(f"✗ давній номер формату став помилкою, а мав бути застереженням: {errors}")
    elif any("давнішого зразка" in line for line in warnings):
        print("✓ спіймано: давній номер формату — застереженням, не помилкою")
    else:
        failed_count += 1
        print(f"✗ ПРОҐАВЛЕНО: давній номер формату; застереження: {warnings}")

    for name, break_state, expected_text in DEFECTS:
        run_count += 1
        state = copy.deepcopy(SAMPLE)
        break_state(state)
        errors, _ = check.validate(state)
        if any(expected_text in line for line in errors):
            print(f"✓ спіймано: {name}")
        else:
            failed_count += 1
            print(f"✗ ПРОҐАВЛЕНО: {name} — чекав «{expected_text}», "
                  f"а маю: {errors or 'жодної помилки'}")

    print()
    if failed_count:
        print(f"✗ Провалено перевірок: {failed_count}")
        return 1
    print(f"✓ Усі {run_count} перевірок пройдено")
    return 0


if __name__ == "__main__":
    sys.exit(main())
