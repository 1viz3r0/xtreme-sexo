"""Standalone HTTP behavior tests; these do not prove container isolation."""
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path
from server import make_handler


class TargetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.flag = "NET0ZE{linux-permissions-test-run-only}"
        root.joinpath("config.json").write_text(json.dumps({"flag": self.flag}), encoding="utf-8")
        self.httpd = HTTPServer(("127.0.0.1", 0), make_handler(root))
        self.thread = threading.Thread(target=self.httpd.serve_forever)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.httpd.server_port}"

    def tearDown(self):
        self.httpd.shutdown(); self.thread.join(); self.httpd.server_close(); self.temp.cleanup()

    def request(self, path, data=None):
        request = urllib.request.Request(self.base + path, data=data, headers={"Content-Type": "application/json"} if data else {})
        with urllib.request.urlopen(request, timeout=2) as response:
            return response.status, response.headers.get_content_type(), response.read()

    def test_review_surface_is_coherent_and_flag_is_server_validated(self):
        self.assertIn(b"Ledger Sync", self.request("/")[2])
        self.assertIn(b"least privilege", self.request("/review")[2])
        service = json.loads(self.request("/api/service")[2])
        inventory = json.loads(self.request("/api/files")[2])["files"]
        self.assertEqual(service["user"], "ledger")
        self.assertIn("docker", service["supplementary_groups"])
        backup = next(item for item in inventory if "latest.sql.gz" in item["path"])
        self.assertEqual(backup["mode"], "0644")
        self.assertNotIn(self.flag.encode(), self.request("/api/service")[2])
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request("/api/submit", json.dumps({"flag": "wrong"}).encode())
        self.assertEqual(error.exception.code, 403)
        error.exception.close()
        status, _, body = self.request("/api/submit", json.dumps({"flag": self.flag}).encode())
        self.assertEqual((status, json.loads(body)["accepted"]), (200, True))

    def test_surface_is_bounded_read_only_and_has_no_arbitrary_file_access(self):
        for path in ("/config.json", "/etc/passwd", "/api/files?path=/etc/passwd", "/execute", "/upload", "/../config.json"):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request(path)
            self.assertEqual(error.exception.code, 404); error.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request("/", b"command=id")
        self.assertEqual(error.exception.code, 404); error.exception.close()


if __name__ == "__main__":
    unittest.main()
