import json
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from tempfile import TemporaryDirectory
from http.server import ThreadingHTTPServer
import sys
sys.path.insert(0, str(Path(__file__).parent))
import server

class TargetTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(); self.root = Path(self.temp.name); self.original = server.ROOT
        (self.root / "config.json").write_text(json.dumps({"flag": "NET0ZE{first-contact-test}"}), encoding="utf-8"); server.ROOT = self.root
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), server.handler()); self.thread = threading.Thread(target=self.http.serve_forever); self.thread.start(); self.port = self.http.server_port
    def tearDown(self): self.http.shutdown(); self.thread.join(); self.temp.cleanup(); server.ROOT = self.original
    def get(self, path):
        conn = HTTPConnection("127.0.0.1", self.port); conn.request("GET", path); response = conn.getresponse(); body = response.read(); conn.close(); return response.status, body
    def test_beginner_path_and_validation(self):
        self.assertEqual(self.get("/health")[0], 200); self.assertIn(b"/welcome.txt", self.get("/clue")[1]); self.assertIn(b"NET0ZE{first-contact-test}", self.get("/welcome.txt")[1]); self.assertIn(b'"valid": true', self.get("/verify?flag=NET0ZE%7Bfirst-contact-test%7D")[1])
    def test_read_only_surface(self): self.assertEqual(self.get("/config.json")[0], 404)

if __name__ == "__main__": unittest.main()
