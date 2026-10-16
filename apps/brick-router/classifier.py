from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        self.respond({"status": "ok"})

    def do_POST(self):
        if self.path != "/classify":
            self.send_error(404)
            return
        length = min(int(self.headers.get("content-length", "0")), 1_000_000)
        self.rfile.read(length)
        self.respond({"label": "medium", "confidence": 1.0})

    def respond(self, body):
        encoded = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format, *args):
        pass


ThreadingHTTPServer(("127.0.0.1", 8094), Handler).serve_forever()
