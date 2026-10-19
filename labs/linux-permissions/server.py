"""Read-only Linux permission review training target.

This is a deliberately bounded simulation of a service/configuration review.
It never reads host paths, executes commands, accepts uploads, or makes
outbound requests. A deployment supplies the run-specific flag in config.json.
"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit


def make_handler(root):
    config = json.loads((root / "config.json").read_text(encoding="utf-8"))
    flag = config.get("flag")
    if not isinstance(flag, str) or not flag.startswith("NET0ZE{") or len(flag) > 256:
        raise ValueError("per-run deployment config is required")

    files = [
        {"path": "/etc/ledger-sync/ledger-sync.conf", "owner": "root", "group": "ledger", "mode": "0640", "purpose": "service connection settings", "finding": "review"},
        {"path": "/var/lib/ledger-sync/export/ledger.sqlite3", "owner": "ledger", "group": "ledger", "mode": "0600", "purpose": "local reconciliation data", "finding": "ok"},
        {"path": "/var/backups/ledger-sync/latest.sql.gz", "owner": "root", "group": "ledger", "mode": "0644", "purpose": "nightly database export", "finding": "high"},
        {"path": "/usr/local/bin/ledger-sync", "owner": "root", "group": "root", "mode": "0755", "purpose": "installed service binary", "finding": "ok"},
        {"path": "/etc/systemd/system/ledger-sync.service", "owner": "root", "group": "root", "mode": "0644", "purpose": "service unit and identity", "finding": "review"},
    ]
    service = {
        "name": "ledger-sync",
        "description": "Reconciles local shipment ledgers",
        "user": "ledger",
        "group": "ledger",
        "supplementary_groups": ["docker", "backup-operators"],
        "capabilities": ["CAP_NET_BIND_SERVICE"],
        "writable_paths": ["/var/lib/ledger-sync/export", "/var/backups/ledger-sync"],
        "network": "outbound HTTPS to the accounting relay",
        "unit_note": "The process does not need container administration or backup directory write access.",
    }
    config_view = {
        "service": "ledger-sync",
        "config_path": "/etc/ledger-sync/ledger-sync.conf",
        "runtime_directory": "/var/lib/ledger-sync/export",
        "backup_directory": "/var/backups/ledger-sync",
        "review_note": "Compare the service identity, supplementary groups, and write paths with its stated job.",
    }
    findings = {
        "docker_group": "A service account in docker can reach the container-control socket and is broader than this workload needs.",
        "backup_mode": "A world-readable database export defeats the confidentiality boundary of the ledger.",
        "least_privilege": "Keep only the identity, groups, capabilities, and write paths required by the service task.",
    }
    pages = {
        "/": """<p class='eyebrow'>LOCAL REVIEW / LINUX PERMISSIONS</p><h1>Ledger Sync</h1><p class='lead'>A read-only service review surface for checking ownership, modes, groups, and least privilege.</p><div class='grid'><section class='card'><span class='label'>SERVICE</span><strong>ledger-sync</strong><p>shipment reconciliation worker</p></section><section class='card'><span class='label'>REVIEW MODE</span><strong>READ ONLY</strong><p>all evidence is simulated</p></section><section class='card'><span class='label'>OBJECTIVE</span><strong>MINIMIZE</strong><p>find excessive access before release</p></section></div><section class='panel'><h2>Reviewer brief</h2><p>Use the service manifest and permission inventory to identify access that exceeds the worker's job. Confirm your conclusion through the submission endpoint.</p><p class='hint'>Start with <a href='/api/service'>service identity</a>, then compare it with the <a href='/api/files'>permission inventory</a>.</p></section>""",
        "/review": """<p class='eyebrow'>LOCAL REVIEW / WORKSHEET</p><h1>Permission review</h1><p class='lead'>Trace identity → groups → capabilities → writable paths → sensitive files.</p><section class='panel'><h2>Suggested questions</h2><ol><li>Which account runs the service?</li><li>Which supplementary group is unrelated to reconciliation?</li><li>Which file mode lets an unintended class read the export?</li><li>What is the smallest access set that keeps the service working?</li></ol><p class='hint'>Use least privilege: do not guess from filenames alone; compare owner, group, mode, and purpose together. Submit the flag you recover from your completed review.</p></section>""",
    }

    def payload(value):
        return json.dumps(value, separators=(",", ":")).encode("utf-8")

    class Handler(BaseHTTPRequestHandler):
        server_version = "LedgerReviewHTTP/1.0"
        sys_version = ""

        def setup(self):
            super().setup()
            self.connection.settimeout(2)

        def send_body(self, status, content_type, body):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            parsed = urlsplit(self.path)
            path = parsed.path
            if parsed.query:
                return self.send_body(404, "text/plain; charset=utf-8", b"Not found\n")
            if path in pages:
                shell = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Ledger Sync Review</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#091114;color:#dce7e8;font:15px ui-monospace,monospace}header,main,footer{max-width:1060px;margin:auto}header{padding:28px;border-bottom:1px solid #284149}header strong{color:#71d5bb;letter-spacing:.1em}nav{display:flex;gap:18px;flex-wrap:wrap;margin-top:20px}a{color:#8bd8ca}main{padding:48px 28px;min-height:640px;background:#101c20}.eyebrow,.label{color:#7b9ba0;font-size:11px;letter-spacing:.14em}.eyebrow{color:#71d5bb}h1{font:700 clamp(38px,7vw,72px) Georgia,serif;margin:12px 0 18px;color:#f1f6f5}h2{font:22px Georgia,serif}.lead{max-width:700px;color:#a9c0c0;font:20px/1.5 Georgia,serif}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:30px 0}.card,.panel{border:1px solid #2b484d;background:#132328;padding:21px}.card strong{display:block;margin-top:15px;color:#f1f6f5;font:700 25px Georgia,serif}.card p,.panel p,.panel li{color:#a9c0c0;line-height:1.65}.hint{border-left:3px solid #71d5bb;padding-left:14px}footer{padding:20px 28px;color:#71888c;font-size:11px}</style></head><body><header><strong>LEDGER SYNC / REVIEW CONSOLE</strong><nav><a href='/'>Overview</a><a href='/review'>Worksheet</a><a href='/api/service'>Service API</a><a href='/api/files'>Permission API</a><a href='/api/findings'>Review notes</a></nav></header><main>" + pages[path] + "</main><footer>LOCAL TRAINING TARGET · SIMULATED EVIDENCE · NO HOST FILE ACCESS</footer></body></html>"
                return self.send_body(200, "text/html; charset=utf-8", shell.encode())
            routes = {
                "/health": {"healthy": True},
                "/api/room": {"id": "linux-permissions", "name": "Ledger Sync Permission Review", "mode": "read-only", "difficulty": "intermediate", "flag_disclosed": False},
                "/api/challenge": {"id": "least-privilege-review", "version": "1", "stages": ["identify service identity", "inventory permissions", "separate required from excessive access", "submit the verified flag"], "answer_included": False},
                "/api/service": service,
                "/api/config": config_view,
                "/api/files": {"files": files},
                "/api/findings": findings,
            }
            if path in routes:
                return self.send_body(200, "application/json", payload(routes[path]))
            self.send_body(404, "text/plain; charset=utf-8", b"Not found\n")

        def do_POST(self):
            if urlsplit(self.path).path != "/api/submit":
                return self.send_body(404, "text/plain; charset=utf-8", b"Not found\n")
            length = int(self.headers.get("Content-Length", "0"))
            if length > 512:
                return self.send_body(413, "application/json", payload({"accepted": False, "message": "Request too large"}))
            try:
                body = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeDecodeError):
                return self.send_body(400, "application/json", payload({"accepted": False, "message": "Expected JSON"}))
            supplied = body.get("flag") if isinstance(body, dict) else None
            accepted = isinstance(supplied, str) and supplied == flag
            return self.send_body(200 if accepted else 403, "application/json", payload({"accepted": accepted, "message": "Review verified" if accepted else "Flag rejected"}))

        def log_message(self, *args):
            pass

    return Handler


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 8000), make_handler(Path(__file__).resolve().parent)).serve_forever()
