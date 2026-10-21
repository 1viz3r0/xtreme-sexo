"""Standalone tests for the fixed Signal Kiosk HTTP and TCP surfaces."""

import json
import socket
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from server import load_config, make_handler, serve_tcp


class TargetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.flag = "NET0ZE{header-trail-test-run-only}"
        root.joinpath("config.json").write_text(json.dumps({"flag": self.flag}), encoding="utf-8")
        self.config = load_config(root)
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(root, self.config))
        self.http_thread = threading.Thread(target=self.http.serve_forever); self.http_thread.start()
        self.stop, self.ready = threading.Event(), threading.Event()
        probe = socket.socket(); probe.bind(("127.0.0.1", 0)); port = probe.getsockname()[1]; probe.close()
        self.tcp_thread = threading.Thread(target=serve_tcp, args=(root, "127.0.0.1", port, self.ready, self.stop, self.config)); self.tcp_thread.start()
        self.assertTrue(self.ready.wait(2)); self.tcp_port = port
        self.base = f"http://127.0.0.1:{self.http.server_port}"

    def tearDown(self):
        self.stop.set(); self.http.shutdown(); self.http_thread.join(); self.http.server_close(); self.tcp_thread.join(timeout=2); self.temp.cleanup()

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=2) as response:
            return response.read()

    def test_discovery_and_server_validation(self):
        self.assertEqual(json.loads(self.get("/health"))["healthy"], True)
        self.assertIn(b"Signal Kiosk", self.get("/"))
        self.assertIn(b"/bulletin/", self.get("/robots.txt"))
        self.assertEqual(json.loads(self.get("/bulletin/check.json"))["flag"], self.flag)
        with socket.create_connection(("127.0.0.1", self.tcp_port), timeout=2) as connection:
            self.assertIn(b"SIGNAL-KIOSK", connection.recv(256)); connection.sendall(b"BULLETIN\n"); self.assertIn(b"check.json", connection.recv(512))
        self.assertFalse(json.loads(self.get("/verify?flag=wrong"))["valid"])
        self.assertTrue(json.loads(self.get("/verify?flag=" + self.flag))["valid"])

    def test_placeholder_is_replaced_per_run(self):
        isolated = tempfile.TemporaryDirectory()
        self.addCleanup(isolated.cleanup)
        root = Path(isolated.name)
        root.joinpath("config.json").write_text(json.dumps({"flag": "NET0ZE{replace-per-run}"}), encoding="utf-8")
        regenerated = load_config(root)
        self.assertNotEqual(regenerated["flag"], "NET0ZE{replace-per-run}")
        self.assertNotEqual(regenerated["flag"], self.config["flag"])
        self.assertTrue(regenerated["flag"].startswith("NET0ZE{header-trail-"))

    def test_surface_is_fixed_read_only(self):
        for path in ("/config.json", "/etc/passwd", "/execute", "/bulletin/../config.json"):
            with self.assertRaises(urllib.error.HTTPError) as error: self.get(path)
            self.assertEqual(error.exception.code, 404); error.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(urllib.request.Request(self.base + "/", data=b"command=id"), timeout=2)
        self.assertEqual(error.exception.code, 405); error.exception.close()
        self.assertNotIn(self.flag.encode(), self.get("/status"))


if __name__ == "__main__":
    unittest.main()
