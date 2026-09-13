# -*- coding: utf-8 -*-
"""Тести на перевірку даних: чи ловить вона те, заради чого написана.

Перевірка, яка завжди каже «добре», гірша за її відсутність — вона ще й
заспокоює. Тут кожна вада підкладається навмисне, і тест падає, якщо
перевірка її проґавила.

Запуск:  python тести.py
"""
import copy
import sys

sys.stdout.reconfigure(encoding="utf-8")

import перевірка

ЗРАЗОК = {
    "version": перевірка.ВЕРСІЯ_ДАНИХ,
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


def головне():
    впало = 0

    п, з = перевірка.перевірити(copy.deepcopy(ЗРАЗОК))
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
    с = copy.deepcopy(ЗРАЗОК)
    с["games"][0]["bggGenres"] = ["card-game", "quantum-ballet"]
    п, з = перевірка.перевірити(с)
    if п:
        впало += 1
        print(f"✗ невідомий жанр став помилкою, а мав лишитися застереженням: {п}")
    elif any("немає українського підпису" in р for р in з):
        print("✓ спіймано: жанр без підпису — застереженням, не помилкою")
    else:
        впало += 1
        print(f"✗ ПРОҐАВЛЕНО: жанр без українського підпису; застереження: {з}")

    for назва, зіпсувати, очікую in ВАДИ:
        с = copy.deepcopy(ЗРАЗОК)
        зіпсувати(с)
        п, _ = перевірка.перевірити(с)
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
    print(f"✓ Усі {len(ВАДИ) + 1} перевірок пройдено")
    return 0


if __name__ == "__main__":
    sys.exit(головне())
