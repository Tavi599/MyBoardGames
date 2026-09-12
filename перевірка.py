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

СТАТУСИ = {"хочу", "колекція", "улюблена", "онлайн", "відклав", "позбувся"}
СКЛАДИ = {"2", "3", "4", "5"}
ПОЛЯ = {
    "id", "name", "nameEn", "statuses", "status", "score", "byCount", "weight",
    "plays", "minP", "maxP", "minutes", "tags", "comment", "cover", "expansion",
    "withExp", "bggId", "bggRating", "bggRank", "added", "updated", "deleted",
}

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


def чужа(де, поле, v):
    """Оцінка BGG — не твоя: там середнє з тисяч голосів, тож десяткова
    з одним знаком (7,6), а не половинка."""
    if v is None:
        return
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return біда(де, f"{поле} має бути числом, а не {type(v).__name__}")
    if not 0 < v <= 10:
        біда(де, f"{поле} = {v}, а має бути від 0 до 10")
    elif round(v, 1) != v:
        біда(де, f"{поле} = {v}: більше за один знак після коми")


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
        ціле(де, "plays", г.get("plays"), 0)
        ціле(де, "bggRank", г.get("bggRank"), 1)
        ціле(де, "minP", г.get("minP"), 1, 20)
        ціле(де, "maxP", г.get("maxP"), 1, 20)
        ціле(де, "minutes", г.get("minutes"), 1, 6000)
        if isinstance(г.get("minP"), int) and isinstance(г.get("maxP"), int) \
                and г["minP"] > г["maxP"]:
            біда(де, f"minP {г['minP']} більше за maxP {г['maxP']}")

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
