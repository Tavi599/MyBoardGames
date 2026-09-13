# -*- coding: utf-8 -*-
"""Локальний сервер «Полиці настілок».

Єдине джерело правди — «ratings.json» у цій теці. Сервер віддає сторінку,
приймає від неї зміни, зливає їх за часовою міткою і сам комітить у git.

Запуск:
    python "server.py"              звичайно
    python "server.py" --пуш        ще й відправляти коміти на GitHub
    python "server.py" --порт 9000  інший порт

Сторінка сама знаходить сервер: відкрита через http — пише сюди, відкрита
подвійним кліком з диска — живе своєю localStorage-копією. Телефон у тій
самій мережі відкриває адресу, яку сервер друкує при старті; якщо мережі
немає, зміни лягають у чергу в телефоні й доїдуть, щойно зв'язок з'явиться.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import re
import socket
import subprocess
import sys
import threading
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import bgg
import check

ТЕКА = Path(__file__).parent
ДАНІ = ТЕКА / "ratings.json"
ДЖЕРЕЛА = ТЕКА / "src"
ЗІБРАНЕ = ТЕКА / "index.html"
СТАТИКА = {
    "/manifest.webmanifest": "application/manifest+json; charset=utf-8",
    "/icon-192.png": "image/png",
    "/icon-512.png": "image/png",
}
ЗБІРКА = ТЕКА / "build.py"

# Формат даних. Міграції живуть у сторінці («01-core.js»); сервер лише
# не дає номеру загубитися при перезаписі файла. Число береться з
# «check.py», а не пишеться тут удруге: доки воно лежало в обох
# файлах, сервер тихо ставив на свіжі дані давній номер, і перевірка
# після цього падала на рівному місці.
ВЕРСІЯ_ДАНИХ = check.ВЕРСІЯ_ДАНИХ

ПАУЗА_ДО_КОМІТУ = 90        # секунд тиші після останньої правки
замок = threading.Lock()
таймер: threading.Timer | None = None
пушити = False
# BGG просить не частіше за раз на секунду, та й одного запитання за раз
# з полиці цілком досить. Мережу тримаємо поза «замком»: чужий сервер не
# має права затримувати збереження оцінок.
опитування = threading.Lock()


# ── чия це сторінка ─────────────────────────────────────────────────
# Сервер слухає 0.0.0.0 навмисно — телефон має до нього дістатися. Але це
# означає, що й будь-яка сторінка, відкрита в тому самому браузері, може
# постукати на localhost:8777. Відповіді вона не прочитає (жодних заголовків
# CORS ми не віддаємо), а от записати — записала б: для запису читати не
# потрібно. І сервер сам би те записане закомітив та відправив у публічний
# репозиторій.
#
# Три замки, кожен від свого:
#   Host         від «DNS rebinding»: чужий домен, наведений на 127.0.0.1,
#                для браузера стає нашим власним. Свої адреси — localhost,
#                числовий IP локальної мережі та імена «….local».
#   Origin       браузер сам каже, чия сторінка стукає, і підмінити це зі
#                самої сторінки не можна.
#   Content-Type «application/json» без preflight не поставити, тож проста
#                міжсайтова форма до нас не дотягнеться взагалі.
#
# Своїм вважається ім'я, яке не буває в інтернеті: без жодної крапки
# («localhost», ім'я машини), числова адреса — або домашній суфікс, який
# роздає роутер. Публічний домен завжди має крапку й завжди закінчується
# інакше, тож підмінити себе нашим іменем він не може.
СВОЇ_ХОСТИ = re.compile(
    r"^(?:"
    r"[^.:\[\]]+"                                   # localhost, ім'я машини
    r"|[0-9]{1,3}(?:\.[0-9]{1,3}){3}"               # 192.168.1.14
    r"|\[[0-9a-f:]+\]"                              # [::1]
    r"|[^:\[\]]+\.(?:local|lan|internal|home|home\.arpa)"
    r")(?::[0-9]+)?$", re.IGNORECASE)


def свій_хост(хост: str) -> bool:
    return bool(СВОЇ_ХОСТИ.match((хост or "localhost").strip()))


def своя_сторінка(джерело: str | None, хост: str) -> bool:
    """Чи прийшов запит зі сторінки, яку віддали ми самі.

    Порожній Origin — це не чужа сторінка: браузер ставить його на кожен
    POST і на кожне міжсайтове читання. Немає його в навігації, у службовому
    робітнику й у curl, а їм ми не відмовляємо."""
    if not джерело:
        return True
    хост = (хост or "").strip()
    return джерело in ("http://" + хост, "https://" + хост)


# ── дані ────────────────────────────────────────────────────────────

def зараз() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def прочитати() -> dict:
    if not ДАНІ.exists():
        return {"app": "полиця настілок", "version": ВЕРСІЯ_ДАНИХ,
                "saved": зараз(), "games": []}
    try:
        return json.loads(ДАНІ.read_text(encoding="utf-8"))
    except json.JSONDecodeError as помилка:
        # Краще зупинитися, ніж мовчки затерти файл із оцінками.
        raise SystemExit(f"«{ДАНІ.name}» пошкоджено ({помилка}). Візьми копію з git: "
                         f'git checkout -- "{ДАНІ.name}"')


def записати(стан: dict) -> None:
    стан["version"] = ВЕРСІЯ_ДАНИХ
    стан["saved"] = зараз()
    стан["games"] = sorted(стан.get("games", []), key=lambda г: г.get("id", ""))
    текст = json.dumps(стан, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    тимчасовий = ДАНІ.with_suffix(".json.tmp")
    тимчасовий.write_text(текст, encoding="utf-8")
    os.replace(тимчасовий, ДАНІ)


def злити(поточні: list[dict], вхідні: list[dict]) -> tuple[list[dict], int]:
    """Свіжіший запис перемагає. Порівнюємо за полем updated."""
    за_id = {г.get("id"): г for г in поточні if г.get("id")}
    змінено = 0
    for гра in вхідні:
        ід = гра.get("id")
        if not ід:
            continue
        стара = за_id.get(ід)
        якщо_новіша = стара is None or (гра.get("updated") or "") >= (стара.get("updated") or "")
        if якщо_новіша and гра != стара:
            за_id[ід] = гра
            змінено += 1
    return list(за_id.values()), змінено


def живі(ігри: list[dict]) -> list[dict]:
    """Видалені лишаються у файлі як мітки, але сторінці їх не показуємо:
    інакше стара копія в телефоні воскресила б викинуту гру."""
    return [г for г in ігри if not г.get("deleted")]


def знайти(ігри: list[dict], ід: str) -> dict | None:
    for г in ігри:
        if г.get("id") == ід and not г.get("deleted"):
            return г
    return None


def добрати(стан: dict, ід: str, свіже: dict) -> tuple[list[str], tuple[int, str] | None]:
    """Кладе в коробку чужі числа — або не кладе жодних.

    Пробуємо на копії й підміняємо запис у стані аж тоді, коли перевірка
    сказала, що нових вад від цього не з'явилося; якщо з'явилися — старий
    запис вертається на місце.

    Раніше відкату як такого не було: стан щоразу перечитувався з диска, тож
    зіпсоване просто не записували, і правка зникала сама. Працювало це
    бездоганно — і трималося на умові, якої ніде не написано. Перший, хто
    вирішив би не ходити на диск на кожен запит (а спокуса очевидна), зламав
    би все мовчки: у пам'яті лишилася б коробка з числами, які перевірка
    щойно відхилила.

    Повертає (змінені поля, вада). Вада не None — стан такий самий, як був.
    """
    ігри = стан.get("games") or []
    місце = next((і for і, г in enumerate(ігри)
                  if г.get("id") == ід and not г.get("deleted")), None)
    if місце is None:
        return [], (404, "коробку прибрали, поки я питав")

    старе = ігри[місце]
    нове = copy.deepcopy(старе)
    поля = bgg.застосувати(нове, свіже, освіжати=True)
    if not поля:
        return [], None

    # Що у файлі було не так до нас — не наша провина й не привід
    # відмовлятися: інакше одна крива коробка зупинила б добирання для всіх
    # інших, ще й звинувативши в цьому BGG.
    було = check.перевірити(стан)[0]
    ігри[місце] = нове
    нові = [р for р in check.перевірити(стан)[0] if р not in було]
    if нові:
        ігри[місце] = старе
        return [], (502, "BGG віддав те, що не проходить перевірку: " + нові[0])
    return поля, None


# ── git ─────────────────────────────────────────────────────────────

def git(*аргументи: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *аргументи], cwd=ТЕКА, capture_output=True,
                          text=True, encoding="utf-8", errors="replace")


def закомітити() -> None:
    if not (ТЕКА / ".git").exists():
        return
    with замок:
        стан = прочитати()
        помилки, _ = check.перевірити(стан)
        кількість = len(живі(стан.get("games", [])))
    # На диск ми пишемо завжди: правку, яку щойно зробили, не викидають через
    # те, що в файлі знайшлася вада. А в репозиторій зламане не поїде — там
    # воно лишиться назавжди, і публічно.
    if помилки:
        print(f"Коміту не буде: перевірка знайшла {len(помилки)} "
              f"{'помилку' if len(помилки) == 1 else 'помилок'}.")
        for р in помилки[:5]:
            print("  ✗", р)
        print('  Полагодь і запусти: python "check.py"')
        return
    git("add", "--", ДАНІ.name)
    if git("diff", "--cached", "--quiet", "--", ДАНІ.name).returncode == 0:
        return
    підсумок = git("commit", "-m", f"Оцінки: {кількість} ігор на полиці")
    if підсумок.returncode != 0:
        print("Коміт не вдався:", підсумок.stderr.strip() or підсумок.stdout.strip())
        return
    print("Закомічено.")
    if пушити:
        відправлення = git("push")
        print("Відправлено." if відправлення.returncode == 0
              else "Пуш не вдався: " + (відправлення.stderr.strip() or "невідомо"))


def запланувати_коміт() -> None:
    global таймер
    if таймер is not None:
        таймер.cancel()
    таймер = threading.Timer(ПАУЗА_ДО_КОМІТУ, закомітити)
    таймер.daemon = True
    таймер.start()


# ── сторінка ────────────────────────────────────────────────────────

def зібрати_сторінку() -> bytes:
    """Тримаємо зібраний файл свіжим, щоб офлайнова копія й та, що віддається
    в мережу, ніколи не розходились."""
    if ЗБІРКА.exists() and ДЖЕРЕЛА.is_dir():
        # Джерел тепер багато — дивимось на найсвіжіше з них.
        правлено = max((ф.stat().st_mtime for ф in ДЖЕРЕЛА.rglob("*") if ф.is_file()),
                       default=0)
        if not ЗІБРАНЕ.exists() or ЗІБРАНЕ.stat().st_mtime < правлено:
            subprocess.run([sys.executable, str(ЗБІРКА)], cwd=ТЕКА, capture_output=True)
    return ЗІБРАНЕ.read_bytes()


# ── HTTP ────────────────────────────────────────────────────────────

class Обробник(BaseHTTPRequestHandler):
    # Латиницею: заголовки HTTP кодуються latin-1, кирилиця тут падає.
    server_version = "Polytsia"
    sys_version = ""

    def log_message(self, формат, *аргументи):  # тихіше за типовий лог
        pass

    def _відповісти(self, код: int, тіло: bytes, тип: str) -> None:
        self.send_response(код)
        self.send_header("Content-Type", тип)
        self.send_header("Content-Length", str(len(тіло)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(тіло)

    def _json(self, дані: dict, код: int = 200) -> None:
        self._відповісти(код, json.dumps(дані, ensure_ascii=False).encode("utf-8"),
                         "application/json; charset=utf-8")

    def _свій(self) -> bool:
        """Пускаємо лише те, що прийшло з нашої ж сторінки. Див. коментар
        біля СВОЇ_ХОСТИ — це три замки від чужої сторінки в тому самому
        браузері."""
        хост = self.headers.get("Host") or ""
        if not свій_хост(хост):
            return False
        return своя_сторінка(self.headers.get("Origin"), хост)

    def do_GET(self):
        шлях = self.path.split("?")[0]
        if not self._свій():
            self._відповісти(403, b"not yours", "text/plain")
            return
        if шлях in ("/", "/index.html"):
            try:
                self._відповісти(200, зібрати_сторінку(), "text/html; charset=utf-8")
            except OSError as помилка:
                self._відповісти(500, str(помилка).encode("utf-8"), "text/plain; charset=utf-8")
        elif шлях == "/api/state":
            with замок:
                self._json({"games": живі(прочитати().get("games", []))})
        elif шлях in СТАТИКА:
            файл = ТЕКА / шлях.lstrip("/")
            if файл.exists():
                self._відповісти(200, файл.read_bytes(), СТАТИКА[шлях])
            else:
                self._відповісти(404, b"nope", "text/plain")
        else:
            self._відповісти(404, b"nope", "text/plain")

    def do_POST(self):
        шлях = self.path.split("?")[0]
        if шлях not in ("/api/save", "/api/bgg"):
            self._відповісти(404, b"nope", "text/plain")
            return
        if not self._свій():
            self._відповісти(403, b"not yours", "text/plain")
            return
        # Третій замок: простий міжсайтовий запит такого типу не поставить, а
        # щойно він спробує — браузер спершу спитає дозволу (preflight), якого
        # ми не даємо.
        тип = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if тип != "application/json":
            self._json({"error": "потрібен Content-Type: application/json"}, 415)
            return
        довжина = int(self.headers.get("Content-Length") or 0)
        if довжина > 8 * 1024 * 1024:
            self._json({"error": "завелике тіло запиту"}, 413)
            return
        try:
            вхід = json.loads(self.rfile.read(довжина).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json({"error": "не JSON"}, 400)
            return
        if not isinstance(вхід, dict):
            self._json({"error": "чекав об'єкт"}, 400)
            return
        if шлях == "/api/bgg":
            self._добрати_з_bgg(вхід)
            return

        ігри = вхід.get("games")
        if not isinstance(ігри, list):
            self._json({"error": "немає списку games"}, 400)
            return

        with замок:
            стан = прочитати()
            стан["games"], змінено = злити(стан.get("games", []), ігри)
            if змінено:
                записати(стан)
            назовні = живі(стан["games"])
            # Комітити зламане ми відмовимося вже потім, і тихо — а сторінці
            # краще сказати одразу, поки видно, що саме щойно правили.
            вади, _ = check.перевірити(стан) if змінено else ([], [])
        if змінено:
            print(f"Прийнято змін: {змінено}")
            запланувати_коміт()
        відповідь = {"games": назовні, "merged": змінено}
        if вади:
            відповідь["вада"] = вади[0]
        self._json(відповідь)

    def _добрати_з_bgg(self, вхід: dict) -> None:
        """Чужі числа для однієї коробки — на вимогу, а не за розкладом.

        На GitHub Pages те саме щоночі робить дія в репозиторії; тут кнопка
        в картці, бо вдома чекати до ночі немає сенсу. Мітку updated не
        піднімаємо — з тієї самої причини, що й у «bgg.py»: інакше цей запис
        переміг би правку, що чекає в черзі на телефоні."""
        ід = вхід.get("id")
        if not isinstance(ід, str) or not ід:
            self._json({"error": "немає id коробки"}, 400)
            return
        with замок:
            гра = знайти(прочитати().get("games", []), ід)
            номер = str((гра or {}).get("bggId") or "")
        if гра is None:
            self._json({"error": "такої коробки немає"}, 404)
            return
        # Номер іде просто в адресу запиту, тож приймаємо тільки цифри:
        # рядок із даних не має права стати частиною чужого посилання.
        if not номер.isdigit():
            self._json({"error": "у цієї коробки немає числового bggId — "
                                 "його проставляє імпорт CSV («··· → Оцінки BGG»)"}, 400)
            return
        if not опитування.acquire(blocking=False):
            self._json({"error": "уже питаю BGG — за мить спробуй ще"}, 429)
            return
        try:
            свіже = bgg.дістати(номер)
        except Exception as помилка:                      # noqa: BLE001
            self._json({"error": f"BGG не відповів ({type(помилка).__name__})"}, 502)
            return
        finally:
            опитування.release()

        with замок:
            стан = прочитати()          # поки ми ходили, файл могли переписати
            поля, вада = добрати(стан, ід, свіже)
            if вада:
                код, текст = вада
                self._json({"error": текст}, код)
                return
            if поля:
                записати(стан)
            назовні = dict(знайти(стан.get("games", []), ід) or {})
        if поля:
            print(f"BGG → {назовні.get('name')}: {', '.join(поля)}")
            запланувати_коміт()
        self._json({"game": назовні, "fields": поля})


# ── запуск ──────────────────────────────────────────────────────────

def адреса_в_мережі() -> str:
    """IP, яким машину видно з телефона. Нічого нікуди не надсилає —
    ядро просто каже, який інтерфейс обрало б для виходу назовні."""
    сокет = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        сокет.connect(("10.255.255.255", 1))
        return сокет.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        сокет.close()


def main() -> None:
    global пушити
    розбір = argparse.ArgumentParser(description="Локальний сервер «Полиці настілок»")
    розбір.add_argument("--порт", type=int, default=8777)
    розбір.add_argument("--пуш", action="store_true",
                        help="після коміту відправляти на GitHub")
    розбір.add_argument("--без-браузера", action="store_true")
    аргументи = розбір.parse_args()
    пушити = аргументи.пуш

    кількість = len(живі(прочитати().get("games", [])))
    сервер = ThreadingHTTPServer(("0.0.0.0", аргументи.порт), Обробник)
    свій = f"http://localhost:{аргументи.порт}/"
    мережа = f"http://{адреса_в_мережі()}:{аргументи.порт}/"

    print(f"Полиця настілок — {кількість} ігор у «{ДАНІ.name}»")
    print(f"  тут:       {свій}")
    print(f"  з телефона: {мережа}")
    print(f"  коміт через {ПАУЗА_ДО_КОМІТУ} с тиші" + (", далі пуш" if пушити else ""))
    print("  Ctrl+C — зупинити")

    if not аргументи.без_браузера:
        threading.Timer(0.6, lambda: webbrowser.open(свій)).start()
    try:
        сервер.serve_forever()
    except KeyboardInterrupt:
        print("\nЗупиняюся…")
    finally:
        if таймер is not None:
            таймер.cancel()
        закомітити()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
