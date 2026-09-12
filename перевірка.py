# -*- coding: utf-8 -*-
"""Звіряє «оцінки.json» зі схемою, перш ніж він поїде в репозиторій.

Дані тут — єдина річ, яку не відновиш із коду, тож ламати їх найдорожче.
Запускати перед комітом:  python перевірка.py

Виходить із нулем, якщо все чисто; з одиницею, якщо є помилки.
Попередження (жовті) не валять перевірку, але їх варто читати.
"""
import json
import pathlib
import re
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")

ФАЙЛ = pathlib.Path(__file__).parent / "оцінки.json"

# Коли каталог доросте до цього розміру, час ділити його на каталог і
# журнал партій (шостий етап плану). Поріг тут, щоб про нього не забули.
ПОРІГ_ПОДІЛУ = 250 * 1024

# Має збігатися з ВЕРСІЯ у «джерела/код/01-основа.js».
ВЕРСІЯ_ДАНИХ = 2

СТАТУСИ = {"хочу", "колекція", "улюблена", "онлайн", "відклав", "позбувся"}
# «5+» — це «більше за п'ятьох, скільки коробка дозволяє»; підпис до нього
# сторінка бере з bggMax кожної гри окремо. Ключ навмисне сталий: якби він
# залежав від стелі, зміна даних на BGG перейменовувала б чужі оцінки.
СКЛАДИ = {"1", "2", "3", "4", "5", "5+"}
# Опитування спільноти зводиться до складів 1..10 — далі це вже не про стіл.
СТЕЛЯ_ОПИТУВАННЯ = 10
ПОЛЯ = {
    "id", "name", "nameEn", "statuses", "status", "score", "byCount", "weight",
    "plays", "minP", "maxP", "minutes", "tags", "comment", "cover", "expansion",
    "withExp", "bggId", "bggRating", "bggRank", "added", "updated", "deleted",
    "rules", "bggMin", "bggMax", "bggBest", "bggRec", "bggTimeMin", "bggTimeMax",
    "bggWeight",
}

ВИДИ_ПРАВИЛ = {"офіційні", "соло", "памʼятка", "переклад", "інше"}

помилки: list[str] = []
застереження: list[str] = []


def біда(де, що):
    помилки.append(f"{де}: {що}")


def увага(де, що):
    застереження.append(f"{де}: {що}")


def оцінка(де, поле, v, стеля):
    """Оцінки ходять із кроком у пів бала й не перестрибують стелю."""
    if v is None:
        return
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return біда(де, f"{поле} має бути числом, а не {type(v).__name__}")
    if not 0 < v <= стеля:
        біда(де, f"{поле} = {v}, а має бути від 0 до {стеля}")
    elif (v * 2) % 1:
        біда(де, f"{поле} = {v}: дозволені лише цілі та половинки")


def чужа(де, поле, v, стеля=10):
    """Число з BGG — не твоє: там середнє з тисяч голосів, тож десяткова
    з одним знаком (7,6), а не половинка."""
    if v is None:
        return
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return біда(де, f"{поле} має бути числом, а не {type(v).__name__}")
    if not 0 < v <= стеля:
        біда(де, f"{поле} = {v}, а має бути від 0 до {стеля}")
    elif round(v, 1) != v:
        біда(де, f"{поле} = {v}: більше за один знак після коми")


def опитування(де, поле, v, стеля):
    """Склади, які спільнота назвала найкращими чи придатними: зростаючий
    список без повторів, у межах того, що коробка взагалі дозволяє."""
    if v is None:
        return
    if not isinstance(v, list):
        return біда(де, f"{поле} має бути списком")
    if not all(isinstance(x, int) and not isinstance(x, bool) for x in v):
        return біда(де, f"{поле} має бути списком цілих")
    if v != sorted(set(v)):
        біда(де, f"{поле} = {v}: має бути зростаючий список без повторів")
    межа = min(стеля or СТЕЛЯ_ОПИТУВАННЯ, СТЕЛЯ_ОПИТУВАННЯ)
    поза = [x for x in v if not 1 <= x <= межа]
    if поза:
        біда(де, f"{поле} має склади поза межами 1..{межа}: {поза}")


def ціле(де, поле, v, найменше=0, найбільше=None):
    if v is None:
        return
    if not isinstance(v, int) or isinstance(v, bool):
        return біда(де, f"{поле} має бути цілим, а не {type(v).__name__}")
    if v < найменше or (найбільше is not None and v > найбільше):
        біда(де, f"{поле} = {v} поза межами {найменше}..{найбільше or '∞'}")


def мить(де, поле, v, обов):
    if v is None:
        if обов:
            біда(де, f"немає {поле}")
        return
    try:
        datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        біда(де, f"{поле} = {v!r} — не читається як дата")


def перевірити(стан):
    """Повертає (помилки, застереження). Викликається і з тестів."""
    помилки.clear()
    застереження.clear()
    _перевірити(стан)
    return помилки, застереження


def _перевірити(стан):
    ігри = стан.get("games")
    if not isinstance(ігри, list):
        біда("корінь", "немає списку games")
        return
    if not стан.get("saved"):
        увага("корінь", "немає позначки saved")
    в = стан.get("version")
    if в is None:
        біда("корінь", "немає version: файл не пройшов міграцію")
    elif в != ВЕРСІЯ_ДАНИХ:
        біда("корінь", f"version = {в}, а програма чекає {ВЕРСІЯ_ДАНИХ}")

    бачені = {}
    for н, г in enumerate(ігри):
        if not isinstance(г, dict):
            біда(f"games[{н}]", "не об'єкт")
            continue
        ід = г.get("id")
        де = f"«{г.get('name') or ід or н}»"

        if not isinstance(ід, str) or not ід:
            біда(де, "немає id")
        elif ід in бачені:
            біда(де, f"id {ід} уже зайнятий грою «{бачені[ід]}»")
        else:
            бачені[ід] = г.get("name") or ід

        # Надгробок — це запис про видалену коробку; решти полів у нього нема.
        if г.get("deleted"):
            мить(де, "updated", г.get("updated"), обов=True)
            continue

        if not isinstance(г.get("name"), str) or not г["name"].strip():
            біда(де, "порожня назва")
        for поле in ("nameEn", "comment", "cover", "bggId"):
            if поле in г and not isinstance(г[поле], str):
                біда(де, f"{поле} має бути рядком")
        if г.get("cover") and not str(г["cover"]).startswith("https://"):
            увага(де, "обкладинка не через https")

        с = г.get("statuses")
        if с is None:
            біда(де, "немає statuses (запис не пройшов міграцію?)")
        elif not isinstance(с, list) or not all(isinstance(x, str) for x in с):
            біда(де, "statuses має бути списком рядків")
        else:
            чужі = set(с) - СТАТУСИ
            if чужі:
                біда(де, "невідомі статуси: " + ", ".join(sorted(чужі)))
            if len(set(с)) != len(с):
                біда(де, "статус повторюється")
            # Старе поле лишається дзеркалом першого статусу — на нього
            # спирається сторінка, закешована до переходу на список.
            if с and г.get("status") != с[0]:
                біда(де, f"status = {г.get('status')!r}, а перший у statuses — {с[0]!r}")

        оцінка(де, "score", г.get("score"), 10)
        оцінка(де, "weight", г.get("weight"), 5)
        чужа(де, "bggRating", г.get("bggRating"))
        чужа(де, "bggWeight", г.get("bggWeight"), 5)
        ціле(де, "plays", г.get("plays"), 0)
        ціле(де, "bggRank", г.get("bggRank"), 1)
        ціле(де, "minP", г.get("minP"), 1, 20)
        ціле(де, "maxP", г.get("maxP"), 1, 20)
        ціле(де, "minutes", г.get("minutes"), 1, 6000)
        # Стеля тут аж 100: «Картографи» офіційно грають будь-яким натовпом,
        # і це не помилка даних, а справді така коробка.
        ціле(де, "bggMin", г.get("bggMin"), 1, 100)
        ціле(де, "bggMax", г.get("bggMax"), 1, 100)
        ціле(де, "bggTimeMin", г.get("bggTimeMin"), 1, 6000)
        ціле(де, "bggTimeMax", г.get("bggTimeMax"), 1, 6000)
        опитування(де, "bggBest", г.get("bggBest"), г.get("bggMax"))
        опитування(де, "bggRec", г.get("bggRec"), г.get("bggMax"))
        for менше, більше in (("minP", "maxP"), ("bggMin", "bggMax"),
                              ("bggTimeMin", "bggTimeMax")):
            a, b = г.get(менше), г.get(більше)
            if isinstance(a, int) and isinstance(b, int) and a > b:
                біда(де, f"{менше} {a} більше за {більше} {b}")

        зк = г.get("byCount")
        if зк is not None:
            if not isinstance(зк, dict):
                біда(де, "byCount має бути об'єктом")
            else:
                чужі = set(зк) - СКЛАДИ
                if чужі:
                    біда(де, "byCount має зайві склади: " + ", ".join(sorted(чужі)))
                for к, v in зк.items():
                    оцінка(де, f"byCount[{к}]", v, 10)

        т = г.get("tags")
        if т is not None and (not isinstance(т, list)
                              or not all(isinstance(x, str) for x in т)):
            біда(де, "tags має бути списком рядків")

        if "expansion" in г and not isinstance(г["expansion"], bool):
            біда(де, "expansion має бути true/false")

        пр = г.get("rules")
        if пр is not None:
            if not isinstance(пр, list):
                біда(де, "rules має бути списком")
            else:
                адреси = set()
                for н, п in enumerate(пр):
                    хто = f"{де} rules[{н}]"
                    if not isinstance(п, dict):
                        біда(хто, "не об'єкт")
                        continue
                    зайві = set(п) - {"title", "url", "kind"}
                    if зайві:
                        увага(хто, "невідомі поля: " + ", ".join(sorted(зайві)))
                    url = п.get("url")
                    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
                        біда(хто, f"url = {url!r}: потрібне посилання http(s)")
                    elif url in адреси:
                        біда(хто, "те саме посилання вже є в цієї гри")
                    else:
                        адреси.add(url)
                    if п.get("kind") not in ВИДИ_ПРАВИЛ:
                        біда(хто, f"невідомий вид правил: {п.get('kind')!r}")

        мить(де, "updated", г.get("updated"), обов=True)
        мить(де, "added", г.get("added"), обов=False)

        зайві = set(г) - ПОЛЯ
        if зайві:
            увага(де, "невідомі поля: " + ", ".join(sorted(зайві)))

    # Прив'язки перевіряємо другим проходом: вони можуть указувати вперед.
    доповнення = {г.get("id") for г in ігри if г.get("expansion")}
    for г in ігри:
        if г.get("deleted") or "withExp" not in г:
            continue
        де = f"«{г.get('name')}»"
        в = г["withExp"]
        if not isinstance(в, list):
            біда(де, "withExp має бути списком")
            continue
        if г.get("expansion"):
            біда(де, "доповнення не може тягнути за собою інші доповнення")
        for ід in в:
            if ід not in бачені:
                біда(де, f"withExp вказує на неіснуючу коробку {ід}")
            elif ід not in доповнення:
                біда(де, f"withExp вказує на {ід}, а та коробка не доповнення")
            elif ід == г.get("id"):
                біда(де, "withExp вказує сам на себе")


def головне():
    if not ФАЙЛ.exists():
        print("Немає", ФАЙЛ.name)
        return 1
    розмір = ФАЙЛ.stat().st_size
    try:
        стан = json.loads(ФАЙЛ.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"✗ {ФАЙЛ.name} не читається як JSON: {e}")
        return 1

    перевірити(стан)

    ігор = len(стан.get("games", []))
    print(f"Коробок: {ігор}. Розмір: {розмір / 1024:.0f} КБ.")
    if розмір > ПОРІГ_ПОДІЛУ:
        print(f"\n▲ Каталог переріс {ПОРІГ_ПОДІЛУ // 1024} КБ. Час ділити його на "
              "каталог і журнал партій — це шостий етап плану.")

    for р in застереження:
        print("  ~", р)
    for р in помилки:
        print("  ✗", р)

    if помилки:
        print(f"\n✗ Помилок: {len(помилки)}. Комітити не варто.")
        return 1
    print("\n✓ Дані цілі" + (f", застережень: {len(застереження)}" if застереження else ""))
    return 0


if __name__ == "__main__":
    sys.exit(головне())
