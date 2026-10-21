"""Standalone tests for the Copperline fixed HTTP/TCP room."""

import base64
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
        self.temp = tempfile.TemporaryDirectory(); root = Path(self.temp.name)
        self.flag = "NET0ZE{protocol-archive-test-run-only}"
        root.joinpath("config.json").write_text(json.dumps({"flag": self.flag}), encoding="utf-8")
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(root)); self.http_thread = threading.Thread(target=self.http.serve_forever); self.http_thread.start()
        self.stop, self.ready = threading.Event(), threading.Event(); probe = socket.socket(); probe.bind(("127.0.0.1", 0)); port = probe.getsockname()[1]; probe.close()
        self.tcp_thread = threading.Thread(target=serve_tcp, args=(root, "127.0.0.1", port, self.ready, self.stop)); self.tcp_thread.start(); self.assertTrue(self.ready.wait(2)); self.tcp_port = port
        self.base = f"http://127.0.0.1:{self.http.server_port}"

    def tearDown(self):
        self.stop.set(); self.http.shutdown(); self.http_thread.join(); self.http.server_close(); self.tcp_thread.join(timeout=2); self.temp.cleanup()

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=2) as response: return response.read()

    def test_protocol_pivot_and_encoded_flag_validation(self):
        self.assertEqual(json.loads(self.get("/health")), {"healthy": True, "mode": "read-only"})
        self.assertIn(b"Copperline", self.get("/")); self.assertIn(b"/archive/", self.get("/robots.txt"))
        self.assertEqual(json.loads(self.get("/archive/index.json"))["encoding"], "base64")
        with socket.create_connection(("127.0.0.1", self.tcp_port), timeout=2) as connection:
            self.assertIn(b"COPPERLINE", connection.recv(256)); connection.sendall(b"TRANSCRIPT\n"); self.assertIn(b"CPL-7", connection.recv(512))
        ledger = self.get("/archive/ledger.part").decode(); encoded = ledger.split("PAYLOAD=", 1)[1].strip()
        self.assertEqual(base64.b64decode(encoded).decode(), self.flag)
        self.assertFalse(json.loads(self.get("/verify?flag=wrong"))["valid"]); self.assertTrue(json.loads(self.get("/verify?flag=" + self.flag))["valid"])

    def test_invalid_config_and_fixed_read_only_boundaries(self):
        bad = Path(self.temp.name) / "bad"; bad.mkdir(); bad.joinpath("config.json").write_text('{"flag":"not-a-net0ze-flag"}', encoding="utf-8")
        with self.assertRaises(ValueError): load_config(bad)
        for path in ("/config.json", "/etc/passwd", "/execute", "/archive/../config.json"):
            with self.assertRaises(urllib.error.HTTPError) as error: self.get(path)
            self.assertEqual(error.exception.code, 404); error.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(urllib.request.Request(self.base + "/", data=b"upload=x"), timeout=2)
        self.assertEqual(error.exception.code, 405); error.exception.close()
        self.assertNotIn(self.flag.encode(), self.get("/catalog"))

    def test_missing_flag_is_generated_per_run_and_shared_by_both_services(self):
        generated = Path(self.temp.name) / "generated"
        generated.mkdir(); generated.joinpath("config.json").write_text('{"application":"Copperline"}', encoding="utf-8")
        config = load_config(generated)
        self.assertRegex(config["flag"], r"^NET0ZE\{protocol-archive-[0-9a-f]{32}\}$")
        self.assertNotEqual(config["flag"], load_config(generated)["flag"])
        handler = make_handler(generated, config)
        http = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=http.serve_forever); thread.start()
        try:
            base = f"http://127.0.0.1:{http.server_port}"
            ledger = urllib.request.urlopen(base + "/archive/ledger.part", timeout=2).read().decode()
            recovered = base64.b64decode(ledger.split("PAYLOAD=", 1)[1].strip()).decode()
            self.assertTrue(json.loads(urllib.request.urlopen(base + "/verify?flag=" + recovered, timeout=2).read())["valid"])
        finally:
            http.shutdown(); thread.join(); http.server_close()


if __name__ == "__main__":
    unittest.main()
