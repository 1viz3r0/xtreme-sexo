"""Standalone tests for both fixed Northstar services."""

import json
import socket
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from server import make_handler, serve_tcp


class TargetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.flag = "NET0ZE{network-enumeration-test-run-only}"
        root.joinpath("config.json").write_text(json.dumps({"site": "Northstar Yard", "flag": self.flag}), encoding="utf-8")
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(root))
        self.http_thread = threading.Thread(target=self.http.serve_forever)
        self.http_thread.start()
        self.stop = threading.Event()
        self.ready = threading.Event()
        self.tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.tcp.bind(("127.0.0.1", 0))
        tcp_port = self.tcp.getsockname()[1]
        self.tcp.close()
        self.tcp_thread = threading.Thread(target=serve_tcp, args=(root, "127.0.0.1", tcp_port, self.ready, self.stop))
        self.tcp_thread.start()
        self.assertTrue(self.ready.wait(2))
        self.tcp_port = tcp_port
        self.base = f"http://127.0.0.1:{self.http.server_port}"

    def tearDown(self):
        self.stop.set()
        self.http.shutdown()
        self.http_thread.join()
        self.http.server_close()
        self.tcp_thread.join(timeout=2)
        self.temp.cleanup()

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=2) as response:
            return response.read()

    def test_http_and_tcp_discovery_reaches_server_validation(self):
        self.assertIn(b"Northstar Yard", self.get("/"))
        self.assertIn(b"/ops/", self.get("/robots.txt"))
        registry = json.loads(self.get("/api/registry"))
        self.assertEqual(registry["services"][1]["port"], 9000)
        self.assertIn(b"/ops/maintenance/export.json", self.get("/ops/maintenance.json"))
        export = json.loads(self.get("/ops/maintenance/export.json"))
        self.assertEqual(export["flag"], self.flag)
        with socket.create_connection(("127.0.0.1", self.tcp_port), timeout=2) as connection:
            banner = connection.recv(256)
            self.assertIn(b"NORTHSTAR-YARD", banner)
            connection.sendall(b"INFO\n")
            self.assertIn(b"maintenance", connection.recv(512))
        self.assertEqual(json.loads(self.get("/verify?flag=wrong"))["valid"], False)
        self.assertEqual(json.loads(self.get("/verify?flag=" + self.flag))["valid"], True)

    def test_fixed_read_only_boundaries(self):
        for path in ("/config.json", "/etc/passwd", "/execute", "/ops/../config.json"):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.get(path)
            self.assertEqual(error.exception.code, 404)
            error.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(urllib.request.Request(self.base + "/", data=b"command=id"), timeout=2)
        self.assertEqual(error.exception.code, 405)
        error.exception.close()
        self.assertNotIn(self.flag.encode(), self.get("/api/registry"))


if __name__ == "__main__":
    unittest.main()
