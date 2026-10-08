"""Standalone target behavior tests, NOT container isolation acceptance."""
import io
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zipfile
from http.server import HTTPServer
from pathlib import Path
from server import make_handler


class TargetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        root.joinpath("index.html").write_bytes(Path(__file__).with_name("index.html").read_bytes())
        self.flag = "NET0ZE{web-exposure-test-run-only}"
        root.joinpath("config.json").write_text(json.dumps({"application": "Harborline Dispatch", "flag": self.flag}))
        self.server = HTTPServer(("127.0.0.1", 0), make_handler(root))
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.temp.cleanup()

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=2) as response:
            return response.read()

    def test_discovery_chain_recovers_real_backup_config(self):
        landing = self.get("/")
        self.assertIn(b"Harborline Dispatch", landing)
        self.assertNotIn(self.flag.encode(), landing)
        self.assertIn(b"/support/exports/", self.get("/robots.txt"))
        release = json.loads(self.get("/api/releases"))
        directory = release["export_directory"]
        self.assertIn(release["deployment_export"].encode(), self.get(directory))
        with zipfile.ZipFile(io.BytesIO(self.get(directory + release["deployment_export"]))) as archive:
            config = json.loads(archive.read("deployment/config.json"))
        self.assertEqual(config["flag"], self.flag)
        self.assertEqual(json.loads(self.get(directory + release["config_backup"])), config)
        self.assertEqual(json.loads(self.get("/health")), {"healthy": True})

    def test_no_arbitrary_files_or_write_routes(self):
        for path in ["/config.json", "/etc/passwd", "/../config.json", "/support/exports/../../config.json", "/execute", "/upload"]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.get(path)
            self.assertEqual(error.exception.code, 404)
            error.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(urllib.request.Request(self.base + "/", data=b"command=id"), timeout=2)
        self.assertEqual(error.exception.code, 405)
        error.exception.close()


if __name__ == "__main__":
    unittest.main()
