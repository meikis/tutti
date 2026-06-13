import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.environ.get("TUTTI_APP_HOST", "127.0.0.1")
PORT = int(os.environ["TUTTI_APP_PORT"])
PACKAGE_DIR = Path(os.environ["TUTTI_APP_PACKAGE_DIR"])
DATA_DIR = Path(os.environ["TUTTI_APP_DATA_DIR"])


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            self.write_json({"ok": True})
            return
        if self.path == "/api/state":
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            state_path = DATA_DIR / "state.json"
            if not state_path.exists():
                state_path.write_text(json.dumps({"items": []}), encoding="utf-8")
            self.write_json(json.loads(state_path.read_text(encoding="utf-8")))
            return
        self.serve_file("static/index.html", "text/html")

    def do_POST(self):
        if self.path == "/tutti/cli/ping":
            self.write_json({
                "kind": "json",
                "value": {
                    "ok": True,
                    "appId": os.environ.get("TUTTI_APP_ID", ""),
                },
            })
            return
        self.send_error(404)

    def serve_file(self, relative_path, content_type):
        data = (PACKAGE_DIR / relative_path).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def write_json(self, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        return


ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
