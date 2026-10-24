"""Real Chrome checks for static loading, filters, responsive layout and CDN failure.

Requires an installed Chrome plus requests and websocket-client (test-only).
"""
import base64
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import requests
import websocket

ROOT = Path(__file__).resolve().parent


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run():
    chrome = Path(os.environ.get('PROGRAMFILES', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
    if not chrome.exists():
        raise RuntimeError('Chrome is required for browser tests; update the executable path for your system.')
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/dist/'
    assert requests.get(url, timeout=10).status_code == 200
    with tempfile.TemporaryDirectory(prefix='oscp-browser-') as profile:
        process = subprocess.Popen([str(chrome), '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--remote-debugging-port=0', f'--user-data-dir={profile}', 'about:blank'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        connection = None
        try:
            port_file = Path(profile) / 'DevToolsActivePort'
            for _ in range(100):
                if port_file.exists():
                    break
                time.sleep(.1)
            port = int(port_file.read_text().splitlines()[0])
            for attempt in range(30):
                targets = requests.get(f'http://127.0.0.1:{port}/json', timeout=10).json()
                target = next((t for t in targets if t.get('type') == 'page'), None)
                if target:
                    try:
                        connection = websocket.create_connection(target['webSocketDebuggerUrl'], timeout=20, suppress_origin=True)
                        break
                    except websocket.WebSocketBadStatusException:
                        pass
                time.sleep(.2)
            assert connection, 'Unable to attach to a Chrome page'
            message_id = 0
            errors = []

            def cdp(method, params=None):
                nonlocal message_id
                message_id += 1
                connection.send(json.dumps({'id': message_id, 'method': method, 'params': params or {}}))
                while True:
                    result = json.loads(connection.recv())
                    if result.get('method') == 'Runtime.exceptionThrown':
                        errors.append(result['params'])
                    if result.get('id') == message_id:
                        assert 'error' not in result, result
                        return result.get('result', {})

            def js(expression):
                result = cdp('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
                assert 'exceptionDetails' not in result, result
                return result['result'].get('value')

            def wait_loaded():
                for _ in range(100):
                    if js("!document.getElementById('dashboard')?.hidden && !!document.getElementById('reachCount')?.textContent"):
                        return
                    time.sleep(.1)
                raise AssertionError(js('document.body.innerText'))

            cdp('Runtime.enable')
            cdp('Page.enable')
            cdp('Page.navigate', {'url': url})
            wait_loaded()
            assert js("document.getElementById('reachCount').textContent") == '3,953'
            assert js("document.querySelectorAll('#schoolTable tbody tr').length") == 6
            assert js("document.querySelectorAll('#mapData tbody tr').length") == 3
            chart_loaded = js('Boolean(window.Chart)')
            js("document.getElementById('schoolSelect').focus()")
            cdp('Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'Tab', 'code': 'Tab', 'windowsVirtualKeyCode': 9})
            cdp('Input.dispatchKeyEvent', {'type': 'keyUp', 'key': 'Tab', 'code': 'Tab', 'windowsVirtualKeyCode': 9})
            assert js('document.activeElement.id') == 'metricSelect'
            for school in json.loads((ROOT / 'dashboard-data.json').read_text(encoding='utf-8'))['schools']:
                lea = school['DESE LEA']
                js(f"document.getElementById('schoolSelect').value={json.dumps(lea)};document.getElementById('schoolSelect').dispatchEvent(new Event('change'))")
                assert js("document.getElementById('reachCount').textContent") == f"{school['2025–26 K–12']:,}"
                assert js("document.querySelectorAll('#schoolTable tbody tr').length") == 1
                assert js("document.getElementById('mapPanel').hidden") == (school['MAP ELA P+A %'] is None)
                for field in js("Array.from(document.getElementById('metricSelect').options,o=>o.value)"):
                    assert isinstance(school.get(field), (int, float)), f'Unavailable metric exposed: {field}'
                    js(f"document.getElementById('metricSelect').value={json.dumps(field)};document.getElementById('metricSelect').dispatchEvent(new Event('change'))")
                    assert js("document.querySelectorAll('#comparisonData tbody tr').length") == 1
            js("document.getElementById('filters').reset()")
            time.sleep(.1)
            assert js("document.getElementById('reachCount').textContent") == '3,953'
            for field in js("Array.from(document.getElementById('metricSelect').options,o=>o.value)"):
                js(f"document.getElementById('metricSelect').value={json.dumps(field)};document.getElementById('metricSelect').dispatchEvent(new Event('change'))")
                assert js("document.querySelectorAll('#comparisonData tbody tr').length") >= 3
            js("document.getElementById('filters').reset()")
            time.sleep(.1)
            for width in (320, 768, 1440):
                cdp('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
                time.sleep(.3)
                dimensions = js('({width:innerWidth,content:document.documentElement.scrollWidth})')
                assert dimensions['content'] <= width, f'Page overflow at {width}: {dimensions}'
                screenshot = cdp('Page.captureScreenshot', {'captureBeyondViewport': False})
                (ROOT / 'qa' / f'dashboard-{width}.png').write_bytes(base64.b64decode(screenshot['data']))
                js("document.getElementById('comparisonTitle').scrollIntoView()")
                time.sleep(.1)
                screenshot = cdp('Page.captureScreenshot', {'captureBeyondViewport': False})
                (ROOT / 'qa' / f'charts-{width}.png').write_bytes(base64.b64decode(screenshot['data']))
                js('window.scrollTo(0,0)')
            # Exercise the actual CDN failure path, without changing application code.
            cdp('Network.enable')
            cdp('Network.setBlockedURLs', {'urls': ['*cdn.jsdelivr.net*']})
            cdp('Network.setCacheDisabled', {'cacheDisabled': True})
            cdp('Page.reload', {'ignoreCache': True})
            time.sleep(.5)
            wait_loaded()
            assert js('Boolean(window.Chart)') is False
            assert js("document.getElementById('chartFallback').hidden") is False
            assert js("document.querySelectorAll('#comparisonData tbody tr').length") == 6
            assert not errors, errors
            result = {'passed': True, 'chart_cdn_loaded': chart_loaded, 'viewports': [320, 768, 1440],
                'checks': ['repository-subpath loading', 'six school filters', 'all available metric filters', 'reset',
                    'missing metric exclusion', 'MAP suppression coverage', 'keyboard filter focus', 'no page overflow', 'CDN failure tables', 'no browser exceptions']}
            (ROOT / 'qa' / 'browser-results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
            print(json.dumps(result, indent=2))
        finally:
            if connection:
                connection.close()
            process.terminate()
            process.wait(timeout=20)
            server.shutdown()


if __name__ == '__main__':
    run()
