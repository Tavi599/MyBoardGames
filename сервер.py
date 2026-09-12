# -*- coding: utf-8 -*-
"""Локальний сервер «Полиці настілок».

Єдине джерело правди — «оцінки.json» у цій теці. Сервер віддає сторінку,
приймає від неї зміни, зливає їх за часовою міткою і сам комітить у git.

Запуск:
    python "сервер.py"              звичайно
    python "сервер.py" --пуш        ще й відправляти коміти на GitHub
    python "сервер.py" --порт 9000  інший порт

Сторінка сама знаходить сервер: відкрита через http — пише сюди, відкрита
подвійним кліком з диска — живе своєю localStorage-копією. Телефон у тій
самій мережі відкриває адресу, яку сервер друкує при старті; якщо мережі
немає, зміни лягають у чергу в телефоні й доїдуть, щойно зв'язок з'явиться.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import threading
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ТЕКА = Path(__file__).parent
ДАНІ = ТЕКА / "оцінки.json"
ДЖЕРЕЛА = ТЕКА / "джерела"
ЗІБРАНЕ = ТЕКА / "index.html"
СТАТИКА = {
    "/manifest.webmanifest": "application/manifest+json; charset=utf-8",
    "/icon-192.png": "image/png",
    "/icon-512.png": "image/png",
}
ЗБІРКА = ТЕКА / "збірка.py"

# Формат даних. Міграції живуть у сторінці («01-основа.js»); сервер лише
# не дає номеру загубитися при перезаписі файла.
ВЕРСІЯ_ДАНИХ = 3

ПАУЗА_ДО_КОМІТУ = 90        # секунд тиші після останньої правки
замок = threading.Lock()
таймер: threading.Timer | None = None
пушити = False


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


# ── git ─────────────────────────────────────────────────────────────

def git(*аргументи: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *аргументи], cwd=ТЕКА, capture_output=True,
                          text=True, encoding="utf-8", errors="replace")


def закомітити() -> None:
    if not (ТЕКА / ".git").exists():
        return
    with замок:
        кількість = len(живі(прочитати().get("games", [])))
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

    def do_GET(self):
        шлях = self.path.split("?")[0]
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
        if self.path.split("?")[0] != "/api/save":
            self._відповісти(404, b"nope", "text/plain")
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
        if змінено:
            print(f"Прийнято змін: {змінено}")
            запланувати_коміт()
        self._json({"games": назовні, "merged": змінено})


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
