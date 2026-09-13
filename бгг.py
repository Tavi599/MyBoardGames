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
    python "бгг.py"                 добрати те, чого бракує
    python "бгг.py" --усі           ще й освіжити наявне: оцінка й ранг пливуть
    python "бгг.py" --лише g-seed-01 g-calico
    python "бгг.py" --показати      нічого не писати, лише показати різницю
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

ТЕКА = pathlib.Path(__file__).parent
ДАНІ = ТЕКА / "оцінки.json"

ПРО_РІЧ = "https://api.geekdo.com/api/geekitems?objectid={ід}&objecttype=thing"
ЖИВЕ = "https://api.geekdo.com/api/dynamicinfo?objectid={ід}&objecttype=thing"
# Чемність: BGG просить не частіше за раз на секунду. Дві адреси на коробку,
# тож пауза між коробками — і між спробами, якщо сервер попросив зачекати.
ПАУЗА = 1.5
СПРОБИ = 3
ЗАГОЛОВКИ = {"User-Agent": "polytsia-shelf/1.0 (+https://github.com/Tavi599/MyBoardGames)",
             "Accept": "application/json"}
# Опитування спільноти зводиться до складів 1..10 — далі це вже не про стіл.
# Те саме число стоїть у «перевірка.py»: воно там і перевіряється.
СТЕЛЯ_ОПИТУВАННЯ = 10
# Це не жанри, а службові позначки BGG: «доповнення до базової гри». У нас
# для цього є своя галочка в картці, а в стрічці жанрів такий чип був би
# шумом — та ще й без українського підпису.
НЕ_ЖАНРИ = {"expansion-for-base-game", "fan-expansion-for-base-game"}
# Єдине поле, яке освіження має право стерти: гра, що вибула з рейтингу,
# не має рангу, і давнє число тут було б неправдою. Решту не чистимо
# ніколи — див. коментар у застосувати().
СТИРАЄТЬСЯ = {"bggRank"}

# Поле в записі → звідки його брати. Порядок тут же й порядок показу.
ЧУЖІ_ПОЛЯ = ["bggMin", "bggMax", "bggTimeMin", "bggTimeMax", "bggRating",
             "bggRank", "bggWeight", "bggBest", "bggRec",
             "bggFamily", "bggGenres", "bggMech"]


def взяти(url: str) -> dict:
    """Одна відповідь BGG. Тимчасову відмову перечікуємо, решту віддаємо далі."""
    остання = None
    for спроба in range(СПРОБИ):
        try:
            запит = urllib.request.Request(url, headers=ЗАГОЛОВКИ)
            with urllib.request.urlopen(запит, timeout=30) as відповідь:
                return json.loads(відповідь.read())
        except urllib.error.HTTPError as помилка:
            остання = помилка
            # 429 — «занадто часто», 5xx — «мені зараз зле». І те, і те минає.
            if помилка.code not in (429, 500, 502, 503, 504):
                raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as помилка:
            остання = помилка
        time.sleep(ПАУЗА * (спроба + 2))
    raise остання


def слуг(href: str) -> str:
    """«/boardgamecategory/1002/card-game» → «card-game». Беремо саме з адреси:
    підпис на BGG перейменовують, слуг лишається."""
    return (href or "").rstrip("/").rsplit("/", 1)[-1]


def слуги(links: dict, вид: str) -> list[str]:
    return sorted({слуг(л.get("href")) for л in (links.get(вид) or [])
                   if слуг(л.get("href")) and слуг(л.get("href")) not in НЕ_ЖАНРИ})


def ціле(v) -> int | None:
    """BGG віддає числа рядками, а невідоме — нулем чи порожнім рядком."""
    try:
        n = int(str(v).strip())
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def склади(діапазони) -> list[int]:
    """[{min:3, max:4}] → [3, 4]. Це відповіді на «на скількох найкраще»."""
    набір = set()
    for д in діапазони or []:
        від, до = ціле(д.get("min")), ціле(д.get("max"))
        if від is None:
            continue
        for n in range(від, (до or від) + 1):
            if n <= СТЕЛЯ_ОПИТУВАННЯ:
                набір.add(n)
    return sorted(набір)


def десятина(v) -> float | None:
    """Чужа середня — з одним знаком після коми: більше вона не означає."""
    try:
        f = round(float(v), 1)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def дістати(ід: str) -> dict:
    """Усе, що знає BGG про цю коробку, — уже в наших полях і назвах."""
    річ = взяти(ПРО_РІЧ.format(ід=ід)).get("item") or {}
    живе = взяти(ЖИВЕ.format(ід=ід)).get("item") or {}
    links = річ.get("links") or {}
    опитування = (живе.get("polls") or {})
    свіже = {
        "bggMin": ціле(річ.get("minplayers")),
        "bggMax": ціле(річ.get("maxplayers")),
        "bggTimeMin": ціле(річ.get("minplaytime")),
        "bggTimeMax": ціле(річ.get("maxplaytime")),
        "bggRating": десятина((живе.get("stats") or {}).get("average")),
        "bggRank": рангГри(живе.get("rankinfo")),
        "bggWeight": десятина((опитування.get("boardgameweight") or {}).get("averageweight")),
        "bggBest": склади((опитування.get("userplayers") or {}).get("best")),
        "bggRec": склади((опитування.get("userplayers") or {}).get("recommended")),
        "bggFamily": слуги(links, "boardgamesubdomain"),
        "bggGenres": слуги(links, "boardgamecategory"),
        "bggMech": слуги(links, "boardgamemechanic"),
        "cover": (річ.get("images") or {}).get("square200") or None,
        "назва": річ.get("name"),
    }
    # Порожній список — це не «нічого не знайшли», а «BGG про це мовчить».
    # Різниця важлива: перезаписувати наявне порожнечею не можна.
    return {к: v for к, v in свіже.items() if v not in (None, [], "")}


def рангГри(rankinfo) -> int | None:
    """Загальний ранг серед усіх ігор. Підрозділові ранги («серед сімейних»)
    пропускаємо: у даних живе саме той, що на сторінці гри найбільший."""
    for р in rankinfo or []:
        if str(р.get("rankobjectid")) == "1":
            return ціле(р.get("rank"))
    return None


def стеляОпитування(гра: dict) -> int:
    """Вище за стелю самої коробки опитування не читається.

    В опитуванні BGG є кошик «більше за стількох»: у «Діксіті» на шістьох
    голосують і за «6+», і воно приїжджає сімкою, а в «Жаху Аркхема» на
    двох — трійкою. Це не помилка BGG, це його спосіб питати; але в даних
    склад, якого коробка не дозволяє, — просто неправда, і перевірка
    справедливо на ньому спиняється."""
    стеля = гра.get("bggMax") or СТЕЛЯ_ОПИТУВАННЯ
    return min(стеля, СТЕЛЯ_ОПИТУВАННЯ)


def застосувати(гра: dict, свіже: dict, освіжати: bool) -> list[str]:
    """Кладе чужі числа в запис. Повертає назви полів, які справді змінилися."""
    змінені = []
    for поле in ЧУЖІ_ПОЛЯ:
        нове = свіже.get(поле)
        було = гра.get(поле)
        if поле in ("bggBest", "bggRec") and нове:
            # bggMax у списку йде раніше, тож стеля тут уже свіжа.
            нове = [n for n in нове if n <= стеляОпитування(гра)] or None
        if нове is None:
            # BGG про це мовчить. Стираємо лише ранг: гра могла вибути з
            # рейтингу, і давнє число стало б неправдою. Решту лишаємо як є —
            # у даних трапляється те, чого BGG не має (тривалість доповнення,
            # підрозділ, успадкований від базової гри), і це не сміття, а
            # свідомо проставлене. Освіження добирає числа, а не прибирає їх.
            if освіжати and поле in СТИРАЄТЬСЯ and поле in гра:
                del гра[поле]
                змінені.append("−" + поле)
            continue
        if поле in гра and гра[поле] is not None and not освіжати:
            continue
        if було != нове:
            гра[поле] = нове
            змінені.append(поле)
    # Обкладинку ставимо лише на порожнє місце й ніколи не міняємо: там може
    # стояти твоя, вибрана свідомо, і чуже посилання її не переб'є.
    if свіже.get("cover") and not гра.get("cover"):
        гра["cover"] = свіже["cover"]
        змінені.append("cover")
    return змінені


def бракує(гра: dict) -> bool:
    return any(гра.get(поле) in (None, [], "") for поле in ЧУЖІ_ПОЛЯ) \
        or not гра.get("cover")


def читати() -> tuple[dict, str]:
    текст = ДАНІ.read_text(encoding="utf-8")
    # Кінці рядків лишаємо ті, що були: у Windows-копії вони свої, і міняти
    # їх означало б переписати весь файл заради нічого.
    кінець = "\r\n" if "\r\n" in текст else "\n"
    return json.loads(текст), кінець


def писати(стан: dict, кінець: str) -> None:
    """Ключі не перевпорядковуємо: файл пишуть троє — сторінка, сервер і ми,
    і кожне зайве перетасовування ключів робить коміт нечитним."""
    текст = json.dumps(стан, ensure_ascii=False, indent=2) + "\n"
    if кінець != "\n":
        текст = текст.replace("\n", кінець)
    ДАНІ.write_text(текст, encoding="utf-8", newline="")


def головне(аргументи=None) -> int:
    розбір = argparse.ArgumentParser(description="Числа з BGG для полиці")
    розбір.add_argument("--усі", action="store_true",
                        help="освіжити й те, що вже є: оцінка й ранг пливуть")
    розбір.add_argument("--лише", nargs="+", metavar="ID",
                        help="тільки ці коробки, за id у даних")
    розбір.add_argument("--показати", action="store_true",
                        help="нічого не писати, лише показати різницю")
    н = розбір.parse_args(аргументи)

    стан, кінець = читати()
    ігри = стан.get("games") or []
    без_ід, оброблено, змінено = [], 0, []

    for гра in ігри:
        if гра.get("deleted"):
            continue
        if н.лише and гра.get("id") not in н.лише:
            continue
        if not гра.get("bggId"):
            без_ід.append(гра.get("name") or гра.get("id"))
            continue
        if not н.усі and not н.лише and not бракує(гра):
            continue
        назва = гра.get("name") or гра.get("id")
        try:
            свіже = дістати(str(гра["bggId"]))
        except Exception as помилка:                      # noqa: BLE001
            print(f"  ✗ {назва}: {type(помилка).__name__} {помилка}")
            continue
        оброблено += 1
        поля = застосувати(гра, свіже, освіжати=bool(н.усі or н.лише))
        if поля:
            змінено.append(назва)
            print(f"  · {назва}: {', '.join(поля)}")
        time.sleep(ПАУЗА)

    print(f"Опитано коробок: {оброблено}; змінено: {len(змінено)}.")
    if без_ід:
        print(f"Без bggId (їх не чіпаємо): {len(без_ід)} — {', '.join(без_ід[:5])}"
              + ("…" if len(без_ід) > 5 else ""))
    if змінено and not н.показати:
        писати(стан, кінець)
        print(f"Записано в {ДАНІ.name}.")
    elif н.показати:
        print("Показ без запису: файл не чіпали.")
    return 0


if __name__ == "__main__":
    sys.exit(головне())
