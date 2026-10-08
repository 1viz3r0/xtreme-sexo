"""Isolated native rendering smoke. Never drives the user's existing app or scans."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

root = Path(__file__).resolve().parent.parent
base = root / 'target/studio-ui-smoke'
base.mkdir(parents=True, exist_ok=True)
package = root / 'src-tauri/target/release/bundle/deb/NET0ZE_2.0.0_amd64.deb'
subprocess.run(['dpkg-deb', '-x', str(package), str(base / 'extracted')], check=True)
env = os.environ.copy()
env['GDK_BACKEND'] = 'x11'
for key, folder in [('XDG_DATA_HOME', 'data'), ('XDG_CONFIG_HOME', 'config'), ('XDG_CACHE_HOME', 'cache'), ('XDG_RUNTIME_DIR', 'runtime')]:
    directory = base / folder
    directory.mkdir(mode=0o700, exist_ok=True)
    directory.chmod(0o700)
    env[key] = str(directory)

if '--inside-display' not in __import__('sys').argv:
    subprocess.run(['xvfb-run', '-a', '-s', '-screen 0 1600x1000x24', __import__('sys').executable, str(Path(__file__).resolve()), '--inside-display'], env=env, check=True)
    raise SystemExit(0)

binary = base / 'extracted/usr/bin/netoze-desktop'
with (base / 'launch.log').open('w') as output:
    child = subprocess.Popen([str(binary)], env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        time.sleep(12)
        assert child.poll() is None, 'Native app exited before rendering check'
        ids = subprocess.check_output(['xdotool', 'search', '--pid', str(child.pid), '--name', 'NET0ZE'], text=True).split()
        assert ids, 'Native window not found'
        window = ids[-1]
        subprocess.run(['import', '-window', window, str(base / 'capture-workspace.png')], check=True)
        # Desktop view switches only: these coordinates must be checked against
        # the initial image before enabling any later interaction. No Start action.
        receipt = {'package_sha256': hashlib.sha256(package.read_bytes()).hexdigest(),
                   'startup_seconds': 12, 'native_window_found': True,
                   'screenshot': 'target/studio-ui-smoke/capture-workspace.png',
                   'capture_or_scan_started': False}
        (base / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps(receipt, indent=2))
    finally:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
