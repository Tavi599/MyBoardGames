# -*- coding: utf-8 -*-
"""Тести на перевірку даних: чи ловить вона те, заради чого написана.

Перевірка, яка завжди каже «добре», гірша за її відсутність — вона ще й
заспокоює. Тут кожна вада підкладається навмисне, і тест падає, якщо
перевірка її проґавила.

Запуск:  python tests.py
"""
import copy
import sys

sys.stdout.reconfigure(encoding="utf-8")

import check

ЗРАЗОК = {
    "version": check.ВЕРСІЯ_ДАНИХ,
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
ВАДИ = [
    ("оцінка понад стелю", lambda с: с["games"][0].update(score=11), "score"),
    ("чверть бала", lambda с: с["games"][0].update(score=8.25), "половинки"),
    ("оцінка BGG на два знаки", lambda с: с["games"][0].update(bggRating=7.65), "знак"),
    # Адреси й номери, які підставляються в сторінку чи в чужий запит.
    ("обкладинка як javascript:",
     lambda с: с["games"][0].update(cover="javascript:alert(1)"), "не http(s)"),
    ("bggId не число", lambda с: с["games"][0].update(bggId="1&objecttype=x"),
     "bggId має бути числом"),
    ("від'ємні партії", lambda с: с["games"][0].update(plays=-1), "plays"),
    ("партії дробом", lambda с: с["games"][0].update(plays=1.5), "plays"),
    ("порожня назва", lambda с: с["games"][0].update(name="  "), "назва"),
    ("id повторюється", lambda с: с["games"][1].update(id="g-base"), "зайнятий"),
    ("немає statuses", lambda с: с["games"][0].pop("statuses"), "statuses"),
    ("вигаданий статус", lambda с: с["games"][0].update(statuses=["мрію"], status="мрію"),
     "невідомі статуси"),
    ("статус повторюється",
     lambda с: с["games"][0].update(statuses=["колекція", "колекція"]), "повторюється"),
    ("дзеркало status розійшлося", lambda с: с["games"][0].update(status="позбувся"),
     "перший у statuses"),
    ("склад столу на трьох з половиною",
     lambda с: с["games"][0]["byCount"].update({"7": 6}), "зайві склади"),
    ("склад «6+» замість сталого «5+»",
     lambda с: с["games"][0]["byCount"].update({"6+": 6}), "зайві склади"),
    ("оцінка складу понад стелю",
     lambda с: с["games"][0]["byCount"].update({"2": 12}), "byCount"),
    ("від більше за до", lambda с: с["games"][0].update(minP=5, maxP=2), "більше за maxP"),
    ("склад з BGG навиворіт",
     lambda с: с["games"][0].update(bggMin=6, bggMax=2), "більше за bggMax"),
    ("час з BGG навиворіт",
     lambda с: с["games"][0].update(bggTimeMin=90, bggTimeMax=45), "більше за bggTimeMax"),
    ("вага BGG понад стелю", lambda с: с["games"][0].update(bggWeight=6.2), "від 0 до 5"),
    ("вага BGG на два знаки", lambda с: с["games"][0].update(bggWeight=2.85), "знак"),
    ("опитування не списком", lambda с: с["games"][0].update(bggBest="2-3"), "списком"),
    ("опитування дробом", lambda с: с["games"][0].update(bggBest=[2, 3.5]), "цілих"),
    ("опитування з повтором", lambda с: с["games"][0].update(bggRec=[1, 2, 2]),
     "без повторів"),
    ("опитування не за порядком", lambda с: с["games"][0].update(bggRec=[3, 1, 2]),
     "зростаючий"),
    ("опитування вище за стелю коробки",
     lambda с: с["games"][0].update(bggBest=[2, 9]), "поза межами"),
    ("жанри не списком", lambda с: с["games"][0].update(bggGenres="fantasy"),
     "списком рядків"),
    ("жанр не слугом", lambda с: с["games"][0].update(bggGenres=["Card Game"]),
     "не слуги"),
    ("жанр повторюється",
     lambda с: с["games"][0].update(bggGenres=["card-game", "card-game"]), "без повторів"),
    ("жанри не за абеткою",
     lambda с: с["games"][0].update(bggGenres=["fantasy", "card-game"]), "впорядкований"),
    ("родина не слугом", lambda с: с["games"][0].update(bggFamily=["Strategy Games"]),
     "не слуги"),
    ("прив'язка в нікуди", lambda с: с["games"][0].update(withExp=["g-нема"]),
     "неіснуючу"),
    ("прив'язка до не-доповнення",
     lambda с: (с["games"][1].pop("expansion"), None)[1], "не доповнення"),
    ("доповнення тягне доповнення",
     lambda с: с["games"][1].update(withExp=["g-exp"]), "не може тягнути"),
    ("дата поламана", lambda с: с["games"][0].update(updated="учора"), "не читається"),
    ("надгробок без дати", lambda с: с["games"][2].pop("updated"), "немає updated"),
    ("теги не списком", lambda с: с["games"][0].update(tags="євро"), "tags"),
    ("expansion рядком", lambda с: с["games"][1].update(expansion="так"), "true/false"),
    ("немає games", lambda с: с.pop("games"), "games"),
    ("немає version", lambda с: с.pop("version"), "version"),
    ("version із майбутнього", lambda с: с.update(version=99), "чекає"),
    ("правила не списком", lambda с: с["games"][0].update(rules={}), "rules"),
    ("правила без посилання",
     lambda с: с["games"][0]["rules"][0].pop("url"), "потрібне посилання"),
    ("правила на файл із диска",
     lambda с: с["games"][0]["rules"][0].update(url="file:///C:/rules.pdf"),
     "потрібне посилання"),
    ("вигаданий вид правил",
     lambda с: с["games"][0]["rules"][0].update(kind="шпаргалка"), "невідомий вид"),
    ("те саме посилання двічі",
     lambda с: с["games"][0]["rules"].append(dict(с["games"][0]["rules"][0])),
     "вже є"),
    ("журнал не списком", lambda с: с["games"][0].update(log={}), "log"),
    ("партія без дати", lambda с: с["games"][0]["log"][0].pop("on"), "YYYY-MM-DD"),
    ("день, якого немає",
     lambda с: с["games"][0]["log"][0].update(on="2026-02-31"), "такого дня немає"),
    ("дата навиворіт",
     lambda с: с["games"][0]["log"][0].update(on="30.08.2026"), "YYYY-MM-DD"),
    ("журнал не за порядком",
     lambda с: с["games"][0].update(log=list(reversed(с["games"][0]["log"]))),
     "від давнішої"),
    ("склад партії вигаданий",
     lambda с: с["games"][0]["log"][0].update(count="7"), "не склад столу"),
    ("нотатка не рядком",
     lambda с: с["games"][0]["log"][0].update(note=7), "note"),
    # Найважливіше з усього журналу: записів не може бути більше за партії.
    ("записів більше, ніж партій",
     lambda с: с["games"][0].update(plays=1), "лічильник каже"),
]


# ── розбір відповіді BGG ───────────────────────────────────────────────
# «bgg.py» ходить у мережу, але переклад чужого JSON у наші поля — річ
# чиста, і саме в ньому легко помилитися тихо: не той ключ, не та стеля,
# зайва службова позначка серед жанрів. Тому шматок відповіді тут
# підкладений, а мережі не треба.
ВІДПОВІДЬ_РЕЧІ = {
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
ВІДПОВІДЬ_ЖИВОГО = {
    "item": {
        "stats": {"average": "7.5754"},
        "polls": {"boardgameweight": {"averageweight": 1.7167235494880546},
                  "userplayers": {"best": [{"min": 3, "max": 4}],
                                  "recommended": [{"min": 2, "max": 5}]}},
        "rankinfo": [{"rankobjectid": 1, "rank": "279"},
                     {"rankobjectid": 5497, "rank": "12"}],
    }
}


def бгг_тести():
    """Повертає список рядків про провали; порожній — усе добре."""
    import bgg
    зле = []

    def так(назва, було, треба):
        if було != треба:
            зле.append(f"✗ {назва}: маю {було!r}, чекав {треба!r}")

    так("слуг із адреси", bgg.слуг("/boardgamecategory/1002/card-game"), "card-game")
    так("порожня адреса", bgg.слуг(None), "")
    так("нуль — це «невідомо»", bgg.ціле("0"), None)
    так("число рядком", bgg.ціле("45"), 45)
    так("не число", bgg.ціле("кілька"), None)
    так("діапазони розгортаються", bgg.склади([{"min": 3, "max": 4}]), [3, 4])
    так("склади злипаються без повторів",
        bgg.склади([{"min": 1, "max": 2}, {"min": 2, "max": 3}]), [1, 2, 3])
    так("стеля опитування", bgg.склади([{"min": 9, "max": 40}]), [9, 10])
    так("середня — з одним знаком", bgg.десятина("7.5754"), 7.6)

    # Той самий шлях, що й у мережі, лише відповіді підкладені.
    справжнє = bgg.взяти
    bgg.взяти = lambda url: ВІДПОВІДЬ_РЕЧІ if "geekitems" in url else ВІДПОВІДЬ_ЖИВОГО
    try:
        свіже = bgg.дістати("1")
    finally:
        bgg.взяти = справжнє

    так("склад столу", (свіже.get("bggMin"), свіже.get("bggMax")), (2, 5))
    так("тривалість", (свіже.get("bggTimeMin"), свіже.get("bggTimeMax")), (30, 45))
    так("оцінка", свіже.get("bggRating"), 7.6)
    так("вага", свіже.get("bggWeight"), 1.7)
    так("ранг беремо загальний, а не підрозділовий", свіже.get("bggRank"), 279)
    так("найкраще на", свіже.get("bggBest"), [3, 4])
    так("годиться на", свіже.get("bggRec"), [2, 3, 4, 5])
    так("жанри за абеткою й без службових позначок",
        свіже.get("bggGenres"), ["card-game", "fantasy"])
    так("механіки", свіже.get("bggMech"), ["hand-management"])
    так("підрозділ", свіже.get("bggFamily"), ["family-games"])

    # Порожньої коробки не буває: те, чого BGG не знає, просто не приходить.
    порожньо = bgg.дістати.__doc__ is not None
    if not порожньо:
        зле.append("✗ bgg.дістати без опису")

    # Що і як лягає в запис.
    гра = {"bggMin": 2, "bggRating": 7.0, "cover": "https://своя/картинка.jpg",
           "minP": 3, "score": 9}
    змінені = bgg.застосувати(dict(гра), свіже, освіжати=False)
    так("без освіження чуже не переписується", "bggRating" in змінені, False)
    так("а порожнє добирається", "bggMax" in змінені, True)

    з_освіженням = dict(гра)
    bgg.застосувати(з_освіженням, свіже, освіжати=True)
    так("освіження оновлює оцінку", з_освіженням["bggRating"], 7.6)
    так("своїх полів не чіпає", (з_освіженням["minP"], з_освіженням["score"]), (3, 9))
    так("своєї обкладинки не переб'є",
        з_освіженням["cover"], "https://своя/картинка.jpg")

    голяк = {}
    bgg.застосувати(голяк, свіже, освіжати=False)
    так("порожній коробці обкладинка стає",
        голяк.get("cover"), "https://cf.geekdo-images.com/x__square200/pic1.jpg")

    # Кошик «6+» в опитуванні BGG: у коробки на двох звідти приїжджає
    # трійка. Складу, якого коробка не дозволяє, у даних бути не може —
    # на ньому справедливо спиняється «check.py».
    вузька = {}
    bgg.застосувати(вузька, {"bggMax": 2, "bggBest": [1, 2], "bggRec": [1, 2, 3]},
                    освіжати=True)
    так("опитування не перестрибує стелю коробки", вузька.get("bggRec"), [1, 2])
    так("а те, що в межах, лишається", вузька.get("bggBest"), [1, 2])
    зовсім = {}
    bgg.застосувати(зовсім, {"bggMax": 2, "bggBest": [5, 6]}, освіжати=True)
    так("опитування цілком поза межами просто не пишеться",
        "bggBest" in зовсім, False)

    # Кого щоденний захід узагалі бере в роботу. Помилитися тут дорого в
    # обидва боки: надто широко — і він щодня марно перепитує два десятки
    # незмінних сторінок, надто вузько — і нова коробка лишається порожньою.
    так("щойно додана коробка — неповна", bgg.бракує({"bggId": "1"}), True)
    повна = {"bggMin": 2, "bggMax": 4, "bggRating": 7.1, "cover": "https://x/1.jpg"}
    так("повна — повна", bgg.бракує(повна), False)
    так("без обкладинки — ще ні", bgg.бракує({k: v for k, v in повна.items()
                                              if k != "cover"}), True)
    без_рангу = dict(повна, bggFamily=None, bggRank=None, bggGenres=[])
    так("доповнення без рангу й підрозділу повним лишається",
        bgg.бракує(без_рангу), False)

    # Мовчання BGG не стирає того, що вже є, — крім рангу.
    мовчазне = {"bggTimeMax": 40, "bggFamily": ["thematic-games"], "bggRank": 900}
    bgg.застосувати(мовчазне, {"bggMin": 2}, освіжати=True)
    так("тривалість лишається", мовчазне.get("bggTimeMax"), 40)
    так("підрозділ лишається", мовчазне.get("bggFamily"), ["thematic-games"])
    так("а ранг, якого вже нема, зникає", "bggRank" in мовчазне, False)
    return зле


def безпека_тести():
    """Три замки локального сервера і межа, за яку не пускаємо bggId.

    Сервер слухає всю мережу, щоб до нього дійшов телефон, — а це означає, що
    постукати може й чужа сторінка з того самого браузера. Тести тут саме на
    те, що вона нікуди не дістукається, а своє все працює: інакше «захист»
    виявиться або дірявим, або таким, що ламає телефон.
    """
    import server
    import bgg
    зле = []

    def так(назва, було, треба):
        if було != треба:
            зле.append(f"✗ {назва}: маю {було!r}, чекав {треба!r}")

    # Свої адреси — ті, з яких полицею справді користуються.
    for хост in ("localhost:8777", "127.0.0.1:8777", "192.168.1.14:8777",
                 "[::1]:8777", "tavi-pc.local:8777", "localhost",
                 "TAVI-PC:8777", "полиця.lan:8777"):
        так(f"свій хост {хост}", server.свій_хост(хост), True)
    # А ці — ознака того, що браузер привели до нас чужим ім'ям.
    for хост in ("evil.example:8777", "полиця.zip", "localhost.evil.com",
                 "attacker.local.evil.com", "tavi-pc.local.evil.com",
                 "192.168.1.14.evil.com"):
        так(f"чужий хост {хост}", server.свій_хост(хост), False)

    так("Origin зі своєї ж адреси",
        server.своя_сторінка("http://192.168.1.14:8777", "192.168.1.14:8777"), True)
    так("Origin чужої сторінки",
        server.своя_сторінка("http://evil.example", "localhost:8777"), False)
    так("порожній Origin — це не браузерна сторінка",
        server.своя_сторінка(None, "localhost:8777"), True)
    # Найпідліший випадок: адреса, яка лише починається як наша.
    так("Origin, схожий на свій",
        server.своя_сторінка("http://localhost:8777.evil.com", "localhost:8777"), False)

    # bggId іде просто в адресу запиту, а в даних він — рядок з чужого CSV.
    for кривий in ("1&objecttype=x", "../../etc", "13 ", "", "13; rm -rf"):
        try:
            bgg.дістати(кривий)
            зле.append(f"✗ bggId {кривий!r} пропустили в адресу запиту")
        except ValueError:
            pass
        except Exception as помилка:                       # noqa: BLE001
            зле.append(f"✗ bggId {кривий!r}: чекав ValueError, маю {помилка!r}")
    return зле


def головне():
    впало = 0
    зроблено = 0

    зроблено += 1
    зле = бгг_тести()
    if зле:
        впало += len(зле)
        for р in зле:
            print("  ", р)
    else:
        print("✓ розбір відповіді BGG")

    зроблено += 1
    зле = безпека_тести()
    if зле:
        впало += len(зле)
        for р in зле:
            print("  ", р)
    else:
        print("✓ замки локального сервера")

    зроблено += 1
    п, з = check.перевірити(copy.deepcopy(ЗРАЗОК))
    if п:
        print("✗ чистий зразок не проходить перевірку:")
        for р in п:
            print("    ", р)
        впало += 1
    else:
        print("✓ чистий зразок проходить" + (f" (застережень: {len(з)})" if з else ""))

    # Жанр без українського підпису — не помилка: дані цілі, просто сторінка
    # покаже слуг як є. Але мовчати про це не можна, інакше новий жанр
    # заїде в інтерфейс англійською й ніхто не помітить.
    зроблено += 1
    с = copy.deepcopy(ЗРАЗОК)
    с["games"][0]["bggGenres"] = ["card-game", "quantum-ballet"]
    п, з = check.перевірити(с)
    if п:
        впало += 1
        print(f"✗ невідомий жанр став помилкою, а мав лишитися застереженням: {п}")
    elif any("немає українського підпису" in р for р in з):
        print("✓ спіймано: жанр без підпису — застереженням, не помилкою")
    else:
        впало += 1
        print(f"✗ ПРОҐАВЛЕНО: жанр без українського підпису; застереження: {з}")

    # Давніший номер формату — теж застереження: так виглядає файл, який
    # востаннє зберіг телефон із кешованою сторінкою. Дані цілі, коміт має
    # проходити. А от новіший номер лишається помилкою — див. ВАДИ.
    зроблено += 1
    с = copy.deepcopy(ЗРАЗОК)
    с["version"] = check.ВЕРСІЯ_ДАНИХ - 1
    п, з = check.перевірити(с)
    if п:
        впало += 1
        print(f"✗ давній номер формату став помилкою, а мав бути застереженням: {п}")
    elif any("давнішого зразка" in р for р in з):
        print("✓ спіймано: давній номер формату — застереженням, не помилкою")
    else:
        впало += 1
        print(f"✗ ПРОҐАВЛЕНО: давній номер формату; застереження: {з}")

    for назва, зіпсувати, очікую in ВАДИ:
        зроблено += 1
        с = copy.deepcopy(ЗРАЗОК)
        зіпсувати(с)
        п, _ = check.перевірити(с)
        якщо_є = any(очікую in р for р in п)
        if якщо_є:
            print(f"✓ спіймано: {назва}")
        else:
            впало += 1
            print(f"✗ ПРОҐАВЛЕНО: {назва} — чекав «{очікую}», а маю: {п or 'жодної помилки'}")

    print()
    if впало:
        print(f"✗ Провалено перевірок: {впало}")
        return 1
    print(f"✓ Усі {зроблено} перевірок пройдено")
    return 0


if __name__ == "__main__":
    sys.exit(головне())
