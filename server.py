# -*- coding: utf-8 -*-
"""Локальний сервер «Полиці настілок».

Єдине джерело правди — «ratings.json» у цій теці. Сервер віддає сторінку,
приймає від неї зміни, зливає їх за часовою міткою і сам комітить у git.

Запуск:
    python "server.py"              звичайно
    python "server.py" --push       ще й відправляти коміти на GitHub
    python "server.py" --port 9000  інший порт
    python "server.py" --no-browser не відкривати сторінку в браузері

Давні назви прапорців («--пуш», «--порт», «--без-браузера») працюють і далі.

Сторінка сама знаходить сервер: відкрита через http — пише сюди, відкрита
подвійним кліком з диска — живе своєю localStorage-копією. Телефон у тій
самій мережі відкриває адресу, яку сервер друкує при старті; якщо мережі
немає, зміни лягають у чергу в телефоні й доїдуть, щойно зв'язок з'явиться.
"""
from __future__ import annotations

import argparse
import copy
import json
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

ROOT_DIR = Path(__file__).parent
DATA_FILE = ROOT_DIR / "ratings.json"
SOURCE_DIR = ROOT_DIR / "src"
BUILT_PAGE = ROOT_DIR / "index.html"
STATIC_FILES = {
    "/manifest.webmanifest": "application/manifest+json; charset=utf-8",
    "/icon-192.png": "image/png",
    "/icon-512.png": "image/png",
}
BUILD_SCRIPT = ROOT_DIR / "build.py"

# Формат даних. Міграції живуть у сторінці; сервер лише не дає номеру
# загубитися при перезаписі файла. Число береться з «check.py» (а той читає
# «src/schema.json»), а не пишеться тут удруге: доки воно лежало в обох
# файлах, сервер тихо ставив на свіжі дані давній номер, і перевірка
# після цього падала на рівному місці.
SCHEMA_VERSION = check.SCHEMA_VERSION

COMMIT_DELAY_SECONDS = 90   # секунд тиші після останньої правки
state_lock = threading.Lock()
commit_timer: threading.Timer | None = None
push_enabled = False
# BGG просить не частіше за раз на секунду, та й одного запитання за раз
# з полиці цілком досить. Мережу тримаємо поза «state_lock»: чужий сервер не
# має права затримувати збереження оцінок.
bgg_lock = threading.Lock()


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
OWN_HOST_PATTERN = re.compile(
    r"^(?:"
    r"[^.:\[\]]+"                                   # localhost, ім'я машини
    r"|[0-9]{1,3}(?:\.[0-9]{1,3}){3}"               # 192.168.1.14
    r"|\[[0-9a-f:]+\]"                              # [::1]
    r"|[^:\[\]]+\.(?:local|lan|internal|home|home\.arpa)"
    r")(?::[0-9]+)?$", re.IGNORECASE)


def is_own_host(host: str) -> bool:
    return bool(OWN_HOST_PATTERN.match((host or "localhost").strip()))


def is_own_page(origin: str | None, host: str) -> bool:
    """Чи прийшов запит зі сторінки, яку віддали ми самі.

    Порожній Origin — це не чужа сторінка: браузер ставить його на кожен
    POST і на кожне міжсайтове читання. Немає його в навігації, у службовому
    робітнику й у curl, а їм ми не відмовляємо."""
    if not origin:
        return True
    host = (host or "").strip()
    return origin in ("http://" + host, "https://" + host)


# ── дані ────────────────────────────────────────────────────────────

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def read_state() -> dict:
    if not DATA_FILE.exists():
        return {"app": "полиця настілок", "version": SCHEMA_VERSION,
                "saved": utc_now(), "games": []}
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        # Краще зупинитися, ніж мовчки затерти файл із оцінками.
        raise SystemExit(f"«{DATA_FILE.name}» пошкоджено ({error}). Візьми копію з git: "
                         f'git checkout -- "{DATA_FILE.name}"')


def write_state(state: dict) -> None:
    state["version"] = SCHEMA_VERSION
    state["saved"] = utc_now()
    state["games"] = sorted(state.get("games", []), key=lambda game: game.get("id", ""))
    # Кладе на диск «bgg.py» — той самий код, що й у щоденному заході. Поки
    # сервер писав по-своєму (з sort_keys і з CRLF), одне збереження тут
    # перетрушувало файл, а наступне збереження з телефона перетрушувало
    # його назад: два коміти на сотні рядків замість двох рядків по суті.
    bgg.write_state(state, bgg.detect_newline(DATA_FILE), DATA_FILE)


def merge_games(current: list[dict], incoming: list[dict]) -> tuple[list[dict], int]:
    """Свіжіший запис перемагає. Порівнюємо за полем updated."""
    games_by_id = {game.get("id"): game for game in current if game.get("id")}
    changed_count = 0
    for game in incoming:
        game_id = game.get("id")
        if not game_id:
            continue
        existing = games_by_id.get(game_id)
        is_newer = existing is None or (game.get("updated") or "") >= (existing.get("updated") or "")
        if is_newer and game != existing:
            games_by_id[game_id] = game
            changed_count += 1
    return list(games_by_id.values()), changed_count


def live_games(games: list[dict]) -> list[dict]:
    """Видалені лишаються у файлі як мітки, але сторінці їх не показуємо:
    інакше стара копія в телефоні воскресила б викинуту гру."""
    return [game for game in games if not game.get("deleted")]


def find_game(games: list[dict], game_id: str) -> dict | None:
    for game in games:
        if game.get("id") == game_id and not game.get("deleted"):
            return game
    return None


def apply_bgg_data(state: dict, game_id: str,
                   fresh: dict) -> tuple[list[str], tuple[int, str] | None]:
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
    games = state.get("games") or []
    position = next((index for index, game in enumerate(games)
                     if game.get("id") == game_id and not game.get("deleted")), None)
    if position is None:
        return [], (404, "коробку прибрали, поки я питав")

    old_game = games[position]
    new_game = copy.deepcopy(old_game)
    changed_fields = bgg.apply_fresh_data(new_game, fresh, refresh=True)
    if not changed_fields:
        return [], None

    # Що у файлі було не так до нас — не наша провина й не привід
    # відмовлятися: інакше одна крива коробка зупинила б добирання для всіх
    # інших, ще й звинувативши в цьому BGG.
    errors_before = check.validate(state)[0]
    games[position] = new_game
    new_errors = [error for error in check.validate(state)[0] if error not in errors_before]
    if new_errors:
        games[position] = old_game
        return [], (502, "BGG віддав те, що не проходить перевірку: " + new_errors[0])
    return changed_fields, None


# ── git ─────────────────────────────────────────────────────────────

def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT_DIR, capture_output=True,
                          text=True, encoding="utf-8", errors="replace")


def commit_data() -> None:
    if not (ROOT_DIR / ".git").exists():
        return
    with state_lock:
        state = read_state()
        errors, _ = check.validate(state)
        game_count = len(live_games(state.get("games", [])))
    # На диск ми пишемо завжди: правку, яку щойно зробили, не викидають через
    # те, що в файлі знайшлася вада. А в репозиторій зламане не поїде — там
    # воно лишиться назавжди, і публічно.
    if errors:
        print(f"Коміту не буде: перевірка знайшла {len(errors)} "
              f"{'помилку' if len(errors) == 1 else 'помилок'}.")
        for error in errors[:5]:
            print("  ✗", error)
        print('  Полагодь і запусти: python "check.py"')
        return
    git("add", "--", DATA_FILE.name)
    if git("diff", "--cached", "--quiet", "--", DATA_FILE.name).returncode == 0:
        return
    # Саме цей файл і нічого більше: без шляху коміт забрав би все, що вже
    # лежить в індексі, — чужу незавершену роботу під назвою «Оцінки».
    commit_result = git("commit", "-m", f"Оцінки: {game_count} ігор на полиці",
                        "--", DATA_FILE.name)
    if commit_result.returncode != 0:
        print("Коміт не вдався:", commit_result.stderr.strip() or commit_result.stdout.strip())
        return
    print("Закомічено.")
    if push_enabled:
        push_result = git("push")
        print("Відправлено." if push_result.returncode == 0
              else "Пуш не вдався: " + (push_result.stderr.strip() or "невідомо"))


def schedule_commit() -> None:
    global commit_timer
    if commit_timer is not None:
        commit_timer.cancel()
    commit_timer = threading.Timer(COMMIT_DELAY_SECONDS, commit_data)
    commit_timer.daemon = True
    commit_timer.start()


# ── сторінка ────────────────────────────────────────────────────────

def fresh_page() -> bytes:
    """Тримаємо зібраний файл свіжим, щоб офлайнова копія й та, що віддається
    в мережу, ніколи не розходились."""
    if BUILD_SCRIPT.exists() and SOURCE_DIR.is_dir():
        # Джерел тепер багато — дивимось на найсвіжіше з них.
        latest_change = max((path.stat().st_mtime for path in SOURCE_DIR.rglob("*")
                             if path.is_file()), default=0)
        if not BUILT_PAGE.exists() or BUILT_PAGE.stat().st_mtime < latest_change:
            subprocess.run([sys.executable, str(BUILD_SCRIPT)], cwd=ROOT_DIR,
                           capture_output=True)
    return BUILT_PAGE.read_bytes()


# ── HTTP ────────────────────────────────────────────────────────────

class RequestHandler(BaseHTTPRequestHandler):
    # Латиницею: заголовки HTTP кодуються latin-1, кирилиця тут падає.
    server_version = "Polytsia"
    sys_version = ""

    def log_message(self, format, *args):  # тихіше за типовий лог
        pass

    def _respond(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, payload: dict, status: int = 200) -> None:
        self._respond(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                      "application/json; charset=utf-8")

    def _is_own_request(self) -> bool:
        """Пускаємо лише те, що прийшло з нашої ж сторінки. Див. коментар
        біля OWN_HOST_PATTERN — це три замки від чужої сторінки в тому самому
        браузері."""
        host = self.headers.get("Host") or ""
        if not is_own_host(host):
            return False
        return is_own_page(self.headers.get("Origin"), host)

    def do_GET(self):
        path = self.path.split("?")[0]
        if not self._is_own_request():
            self._respond(403, b"not yours", "text/plain")
            return
        if path in ("/", "/index.html"):
            try:
                self._respond(200, fresh_page(), "text/html; charset=utf-8")
            except OSError as error:
                self._respond(500, str(error).encode("utf-8"), "text/plain; charset=utf-8")
        elif path == "/api/state":
            with state_lock:
                self._json({"games": live_games(read_state().get("games", []))})
        elif path in STATIC_FILES:
            file_path = ROOT_DIR / path.lstrip("/")
            if file_path.exists():
                self._respond(200, file_path.read_bytes(), STATIC_FILES[path])
            else:
                self._respond(404, b"nope", "text/plain")
        else:
            self._respond(404, b"nope", "text/plain")

    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in ("/api/save", "/api/bgg"):
            self._respond(404, b"nope", "text/plain")
            return
        if not self._is_own_request():
            self._respond(403, b"not yours", "text/plain")
            return
        # Третій замок: простий міжсайтовий запит такого типу не поставить, а
        # щойно він спробує — браузер спершу спитає дозволу (preflight), якого
        # ми не даємо.
        content_type = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if content_type != "application/json":
            self._json({"error": "потрібен Content-Type: application/json"}, 415)
            return
        # Нечислова довжина кинула б виняток, а від'ємна змусила б читати до
        # кінця з'єднання й повісила б потік — тож обидві відсікаємо тут.
        try:
            content_length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            content_length = -1
        if content_length < 0:
            self._json({"error": "незрозумілий Content-Length"}, 400)
            return
        if content_length > 8 * 1024 * 1024:
            self._json({"error": "завелике тіло запиту"}, 413)
            return
        try:
            request_body = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json({"error": "не JSON"}, 400)
            return
        if not isinstance(request_body, dict):
            self._json({"error": "чекав об'єкт"}, 400)
            return
        if path == "/api/bgg":
            self._fetch_from_bgg(request_body)
            return

        incoming_games = request_body.get("games")
        if not isinstance(incoming_games, list):
            self._json({"error": "немає списку games"}, 400)
            return

        with state_lock:
            state = read_state()
            state["games"], changed_count = merge_games(state.get("games", []), incoming_games)
            if changed_count:
                write_state(state)
            visible_games = live_games(state["games"])
            # Комітити зламане ми відмовимося вже потім, і тихо — а сторінці
            # краще сказати одразу, поки видно, що саме щойно правили.
            errors, _ = check.validate(state) if changed_count else ([], [])
        if changed_count:
            print(f"Прийнято змін: {changed_count}")
            schedule_commit()
        response = {"games": visible_games, "merged": changed_count}
        if errors:
            # Сторінка покаже це сповіщенням: правку збережено на диск, але в
            # репозиторій дані не поїдуть, доки ваду не полагодять.
            response["warning"] = errors[0]
        self._json(response)

    def _fetch_from_bgg(self, request_body: dict) -> None:
        """Чужі числа для однієї коробки — на вимогу, а не за розкладом.

        На GitHub Pages те саме щоночі робить дія в репозиторії; тут кнопка
        в картці, бо вдома чекати до ночі немає сенсу. Мітку updated не
        піднімаємо — з тієї самої причини, що й у «bgg.py»: інакше цей запис
        переміг би правку, що чекає в черзі на телефоні."""
        game_id = request_body.get("id")
        if not isinstance(game_id, str) or not game_id:
            self._json({"error": "немає id коробки"}, 400)
            return
        with state_lock:
            game = find_game(read_state().get("games", []), game_id)
            bgg_id = str((game or {}).get("bggId") or "")
        if game is None:
            self._json({"error": "такої коробки немає"}, 404)
            return
        # Номер іде просто в адресу запиту, тож приймаємо тільки цифри:
        # рядок із даних не має права стати частиною чужого посилання.
        if not bgg_id.isdigit():
            self._json({"error": "у цієї коробки немає числового bggId — "
                                 "його проставляє імпорт CSV («··· → Оцінки BGG»)"}, 400)
            return
        if not bgg_lock.acquire(blocking=False):
            self._json({"error": "уже питаю BGG — за мить спробуй ще"}, 429)
            return
        try:
            fresh = bgg.fetch_game(bgg_id)
        except Exception as error:                        # noqa: BLE001
            self._json({"error": f"BGG не відповів ({type(error).__name__})"}, 502)
            return
        finally:
            bgg_lock.release()

        with state_lock:
            state = read_state()        # поки ми ходили, файл могли переписати
            changed_fields, failure = apply_bgg_data(state, game_id, fresh)
            if failure:
                status, message = failure
                self._json({"error": message}, status)
                return
            if changed_fields:
                write_state(state)
            updated_game = dict(find_game(state.get("games", []), game_id) or {})
        if changed_fields:
            print(f"BGG → {updated_game.get('name')}: {', '.join(changed_fields)}")
            schedule_commit()
        self._json({"game": updated_game, "fields": changed_fields})


# ── запуск ──────────────────────────────────────────────────────────

def lan_address() -> str:
    """IP, яким машину видно з телефона. Нічого нікуди не надсилає —
    ядро просто каже, який інтерфейс обрало б для виходу назовні."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("10.255.255.255", 1))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def main() -> None:
    global push_enabled
    parser = argparse.ArgumentParser(description="Локальний сервер «Полиці настілок»")
    parser.add_argument("--port", "--порт", dest="port", type=int, default=8777)
    parser.add_argument("--push", "--пуш", dest="push", action="store_true",
                        help="після коміту відправляти на GitHub")
    parser.add_argument("--no-browser", "--без-браузера", dest="no_browser",
                        action="store_true")
    options = parser.parse_args()
    push_enabled = options.push

    game_count = len(live_games(read_state().get("games", [])))
    httpd = ThreadingHTTPServer(("0.0.0.0", options.port), RequestHandler)
    local_url = f"http://localhost:{options.port}/"
    lan_url = f"http://{lan_address()}:{options.port}/"

    print(f"Полиця настілок — {game_count} ігор у «{DATA_FILE.name}»")
    print(f"  тут:       {local_url}")
    print(f"  з телефона: {lan_url}")
    print(f"  коміт через {COMMIT_DELAY_SECONDS} с тиші" + (", далі пуш" if push_enabled else ""))
    print("  Ctrl+C — зупинити")

    if not options.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(local_url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nЗупиняюся…")
    finally:
        if commit_timer is not None:
            commit_timer.cancel()
        commit_data()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
