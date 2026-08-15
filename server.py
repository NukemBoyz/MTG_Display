#!/usr/bin/env python3
"""
MTG Display - LAN scoreboard server (Windows build).

Behaviour matches the Linux original. Windows-specific changes:
  - state.json lives in %LOCALAPPDATA%\\MTG_Display
  - LAN address detection ranks network adapters instead of trusting the
    default route, so VPNs (Tailscale, WireGuard) and virtual adapters
    (Hyper-V, VirtualBox, Docker) do not hijack the QR codes
  - friendly message instead of a traceback when the port is taken

Flags:
  --ip 192.168.1.50   force the address used in QR codes
  --port 8090         listen on a different port
  --no-browser        do not open the board automatically
"""
import json
import mimetypes
import os
import platform
import re
import socket
import sys
import threading
import webbrowser
from copy import deepcopy
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

HOST = "0.0.0.0"
PORT = 8080
MATCH_COUNT = 20
STARTING_LIFE = 20
APP_NAME = "MTG_Display"

LIFE_MODES = {"mtg": 20, "yugioh": 8000}
DEFAULT_LIFE_MODE = "mtg"

IS_WINDOWS = platform.system() == "Windows"
ASSET_ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))

FORCED_IP = None  # set by --ip


def state_dir():
    if IS_WINDOWS:
        base = os.environ.get("LOCALAPPDATA")
        if base:
            return Path(base) / APP_NAME
        return Path.home() / "AppData" / "Local" / APP_NAME
    return Path.home() / ".local" / "share" / APP_NAME


STATE_DIR = state_dir()
STATE_FILE = STATE_DIR / "state.json"
state_lock = threading.Lock()


# ---------------------------------------------------------------- networking

def describe_ip(ip):
    """Human label for why an address scored the way it did."""
    try:
        parts = [int(p) for p in ip.split(".")]
        a, b, c = parts[0], parts[1], parts[2]
    except Exception:
        return "unrecognised"
    if a == 127:
        return "loopback, this PC only"
    if a == 169 and b == 254:
        return "no DHCP - cable unplugged or Wi-Fi not joined"
    if a == 100 and 64 <= b <= 127:
        return "VPN or carrier NAT (Tailscale uses this) - not your Wi-Fi"
    if a == 192 and b == 168 and c == 56:
        return "VirtualBox host-only adapter"
    if a == 192 and b == 168 and c == 137:
        return "Windows hotspot / internet sharing"
    if a == 192 and b == 168:
        return "home network - phones can reach this"
    if a == 10:
        return "private network - phones can probably reach this"
    if a == 172 and 17 <= b <= 20:
        return "Docker or Hyper-V virtual adapter"
    if a == 172 and 16 <= b <= 31:
        return "private network"
    return "public address - unusual for a home LAN"


def score_ip(ip):
    """Higher means more likely to be the address phones can actually reach."""
    try:
        parts = [int(p) for p in ip.split(".")]
        if len(parts) != 4 or any(p < 0 or p > 255 for p in parts):
            return -1
    except Exception:
        return -1
    a, b, c = parts[0], parts[1], parts[2]

    if a == 127:
        return -1
    if a == 169 and b == 254:
        return 1
    if a == 100 and 64 <= b <= 127:
        return 5
    if a == 192 and b == 168:
        if c in (56, 137, 99):
            return 25
        return 100
    if a == 10:
        return 85
    if a == 172 and 16 <= b <= 31:
        return 30 if b in (17, 18, 19, 20) else 65
    if a == 198 and b == 18:
        return 2
    return 20


def candidate_ips():
    found = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except Exception:
        pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(0.5)
            s.connect(("8.8.8.8", 80))
            found.add(s.getsockname()[0])
    except Exception:
        pass
    return sorted(found)


def ranked_ips():
    return sorted(
        ((score_ip(ip), ip) for ip in candidate_ips() if score_ip(ip) >= 0),
        key=lambda pair: (-pair[0], pair[1]),
    )


def get_lan_ip():
    if FORCED_IP:
        return FORCED_IP
    ranked = ranked_ips()
    return ranked[0][1] if ranked else "127.0.0.1"


# -------------------------------------------------------------------- state

def default_state():
    return {
        "lifeMode": DEFAULT_LIFE_MODE,
        "matches": [
            {
                "title": f"#{i + 1}",
                "hidden": False,
                "players": [
                    {"name": "Player 1", "life": STARTING_LIFE},
                    {"name": "Player 2", "life": STARTING_LIFE},
                ],
            }
            for i in range(MATCH_COUNT)
        ],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def parse_life(value):
    try:
        return int(value)
    except Exception:
        return STARTING_LIFE


def normalize_text(value, fallback):
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def normalize_state(payload):
    safe = default_state()
    if not isinstance(payload, dict) or not isinstance(payload.get("matches"), list):
        return safe

    life_mode = payload.get("lifeMode")
    life_mode = life_mode if life_mode in LIFE_MODES else DEFAULT_LIFE_MODE

    matches = []
    for index in range(MATCH_COUNT):
        src = payload["matches"][index] if index < len(payload["matches"]) else {}
        players = src.get("players") if isinstance(src, dict) else None
        players = players if isinstance(players, list) else []
        p1 = players[0] if len(players) > 0 and isinstance(players[0], dict) else {}
        p2 = players[1] if len(players) > 1 and isinstance(players[1], dict) else {}
        matches.append(
            {
                "title": normalize_text(src.get("title") if isinstance(src, dict) else None, f"#{index + 1}"),
                "hidden": bool(src.get("hidden")) if isinstance(src, dict) else False,
                "players": [
                    {"name": normalize_text(p1.get("name"), "Player 1"), "life": parse_life(p1.get("life"))},
                    {"name": normalize_text(p2.get("name"), "Player 2"), "life": parse_life(p2.get("life"))},
                ],
            }
        )

    return {
        "lifeMode": life_mode,
        "matches": matches,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def load_state():
    if not STATE_FILE.exists():
        return default_state()
    try:
        with STATE_FILE.open("r", encoding="utf-8") as f:
            return normalize_state(json.load(f))
    except Exception:
        return default_state()


def save_state(current):
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = STATE_FILE.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(current, f, ensure_ascii=True, indent=2)
        tmp.replace(STATE_FILE)
    except Exception as exc:
        print(f"[warn] could not save state: {exc}")


state = load_state()


def parse_match_number(value):
    try:
        n = int(value)
    except Exception:
        return None
    return n if 1 <= n <= MATCH_COUNT else None


# ------------------------------------------------------------------- server

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        path = unquote(self.path.split("?", 1)[0])

        if path == "/api/state":
            with state_lock:
                self.send_json(200, deepcopy(state))
            return

        if path == "/api/server-info":
            ip = get_lan_ip()
            self.send_json(200, {
                "lan_ip": ip,
                "port": PORT,
                "lan_origin": f"http://{ip}:{PORT}",
                "candidates": [{"ip": i, "note": describe_ip(i)} for _, i in ranked_ips()],
            })
            return

        if path == "/":
            self.serve_file("index.html")
            return

        m = re.fullmatch(r"/match/(\d+)", path)
        if m and parse_match_number(m.group(1)) is not None:
            self.serve_file("match.html")
            return

        m = re.fullmatch(r"/match/(\d+)/player/([1-2])", path)
        if m and parse_match_number(m.group(1)) is not None:
            self.serve_file("match.html")
            return

        self.serve_static(path)

    def do_POST(self):
        path = unquote(self.path.split("?", 1)[0])

        if path == "/api/state":
            payload = self.read_json()
            if payload is None:
                self.send_json(400, {"error": "invalid JSON"})
                return
            with state_lock:
                state.update(normalize_state(payload))
                state["updated_at"] = datetime.now(timezone.utc).isoformat()
                save_state(state)
                self.send_json(200, deepcopy(state))
            return

        m = re.fullmatch(r"/api/match/(\d+)/adjust", path)
        if m and parse_match_number(m.group(1)) is not None:
            payload = self.read_json()
            if payload is None:
                self.send_json(400, {"error": "invalid JSON"})
                return
            idx = parse_match_number(m.group(1)) - 1
            try:
                player = int(payload.get("player", 1))
                delta = int(payload.get("delta", 0))
            except Exception:
                self.send_json(400, {"error": "bad payload"})
                return
            pi = 0 if player != 2 else 1
            with state_lock:
                cur = parse_life(state["matches"][idx]["players"][pi]["life"])
                state["matches"][idx]["players"][pi]["life"] = cur + delta
                state["updated_at"] = datetime.now(timezone.utc).isoformat()
                save_state(state)
                self.send_json(200, deepcopy(state))
            return

        m = re.fullmatch(r"/api/match/(\d+)/set-life", path)
        if m and parse_match_number(m.group(1)) is not None:
            payload = self.read_json()
            if payload is None:
                self.send_json(400, {"error": "invalid JSON"})
                return
            idx = parse_match_number(m.group(1)) - 1
            try:
                player = int(payload.get("player", 1))
            except Exception:
                player = 1
            pi = 0 if player != 2 else 1
            with state_lock:
                state["matches"][idx]["players"][pi]["life"] = parse_life(payload.get("life"))
                state["updated_at"] = datetime.now(timezone.utc).isoformat()
                save_state(state)
                self.send_json(200, deepcopy(state))
            return

        m = re.fullmatch(r"/api/match/(\d+)/names", path)
        if m and parse_match_number(m.group(1)) is not None:
            payload = self.read_json()
            if payload is None:
                self.send_json(400, {"error": "invalid JSON"})
                return
            idx = parse_match_number(m.group(1)) - 1
            p1 = normalize_text(payload.get("player1"), "Player 1")
            p2 = normalize_text(payload.get("player2"), "Player 2")
            with state_lock:
                state["matches"][idx]["players"][0]["name"] = p1
                state["matches"][idx]["players"][1]["name"] = p2
                state["updated_at"] = datetime.now(timezone.utc).isoformat()
                save_state(state)
                self.send_json(200, deepcopy(state))
            return

        m = re.fullmatch(r"/api/match/(\d+)/reset", path)
        if m and parse_match_number(m.group(1)) is not None:
            idx = parse_match_number(m.group(1)) - 1
            with state_lock:
                reset_life = LIFE_MODES.get(state.get("lifeMode"), STARTING_LIFE)
                state["matches"][idx]["players"][0]["life"] = reset_life
                state["matches"][idx]["players"][1]["life"] = reset_life
                state["updated_at"] = datetime.now(timezone.utc).isoformat()
                save_state(state)
                self.send_json(200, deepcopy(state))
            return

        self.send_json(404, {"error": "not found"})

    def serve_static(self, path):
        safe = path.lstrip("/")
        if not safe:
            self.send_json(404, {"error": "not found"})
            return
        if ".." in safe.split("/"):
            self.send_json(400, {"error": "bad path"})
            return
        self.serve_file(safe)

    def serve_file(self, relative_path):
        abs_path = (ASSET_ROOT / relative_path.replace("/", os.sep)).resolve()
        base = ASSET_ROOT.resolve()
        if base not in abs_path.parents and abs_path != base:
            self.send_json(403, {"error": "forbidden"})
            return
        if not abs_path.exists() or not abs_path.is_file():
            self.send_json(404, {"error": "not found"})
            return
        ctype = mimetypes.guess_type(str(abs_path))[0] or "application/octet-stream"
        try:
            data = abs_path.read_bytes()
        except Exception:
            self.send_json(500, {"error": "read failed"})
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(data)
        except Exception:
            pass

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return None

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def log_message(self, fmt, *args):
        return


# ------------------------------------------------------------------ console

def banner(chosen):
    ranked = ranked_ips()
    line = "=" * 62
    print("")
    print(line)
    print("  MTG DISPLAY - running")
    print(line)
    print("")
    print(f"  Open the board on this PC:   http://{chosen}:{PORT}/")
    print("")
    print(f"  QR codes will point phones at:  {chosen}")
    if FORCED_IP:
        print("  (forced with --ip)")
    print("")

    if len(ranked) > 1:
        print("  This PC has more than one network address:")
        print("")
        for score, ip in ranked:
            mark = "  <-- using" if ip == chosen else ""
            print(f"    {ip:<16} {describe_ip(ip)}{mark}")
        print("")
        print("  If phones cannot reach the QR address, restart with the")
        print("  right one, for example:")
        print(f"      MTG_Display.exe --ip {ranked[0][1]}")
        print("")

    print(f"  Matches:     /match/1  through  /match/{MATCH_COUNT}")
    print(f"  Save file:   {STATE_FILE}")
    print("")
    print("  Phones must be on the SAME Wi-Fi as this PC.")
    print("  Keep this window open. Ctrl+C stops the server.")
    print(line)
    print("")


def port_help():
    print("")
    print("!" * 62)
    print(f"  Cannot start: port {PORT} is already in use.")
    print("!" * 62)
    print("")
    print("  Another program on this PC has that port.")
    print("")
    print("  See what has it:")
    print(f"      netstat -ano | findstr :{PORT}")
    print("")
    print("  Or just use a different port:")
    print("      MTG_Display.exe --port 8090")
    print("")
    if IS_WINDOWS:
        print("  Hyper-V and WSL sometimes reserve port ranges. Check with:")
        print("      netsh interface ipv4 show excludedportrange protocol=tcp")
        print("")


def read_flag(name):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return None


def main():
    global PORT, FORCED_IP

    raw_port = read_flag("--port")
    if raw_port:
        try:
            PORT = int(raw_port)
        except ValueError:
            print(f"[warn] --port needs a number, got '{raw_port}'. Using {PORT}.")

    raw_ip = read_flag("--ip")
    if raw_ip:
        if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", raw_ip) and score_ip(raw_ip) != -1:
            FORCED_IP = raw_ip
        else:
            print(f"[warn] --ip '{raw_ip}' is not a usable address. Auto-detecting instead.")

    STATE_DIR.mkdir(parents=True, exist_ok=True)

    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as exc:
        if getattr(exc, "errno", None) in (48, 98, 10048):
            port_help()
        else:
            print(f"\nCould not start server: {exc}\n")
        input("Press Enter to close...")
        return 1

    chosen = get_lan_ip()
    banner(chosen)

    if "--no-browser" not in sys.argv:
        # Open via the LAN address so the board's own address bar is already
        # correct - script.js uses it for QR codes when it is not loopback.
        threading.Timer(1.0, lambda: webbrowser.open(f"http://{chosen}:{PORT}/")).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        server.shutdown()
        server.server_close()
        print("Stopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
