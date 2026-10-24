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
            assert js("document.querySelectorAll('#directoryData tbody tr').length") == 6
            assert js("document.querySelectorAll('#historyData tbody tr').length") == 96
            chart_loaded = js('Boolean(window.Chart)')
            if chart_loaded:
                assert js('charts.timeline.scales.y.ticks.filter(t=>t.label.length).length') == 6
                assert js('charts.timeline.scales.y.getLabelForValue(0)') == 'Acad\u00e9mie Lafayette'

            def choose(id, value):
                js(f"document.getElementById({json.dumps(id)}).value={json.dumps(str(value))};document.getElementById({json.dumps(id)}).dispatchEvent(new Event('change',{{bubbles:true}}))")

            def values(id):
                return js(f"Array.from(document.getElementById({json.dumps(id)}).options,o=>o.value)")

            snapshot = js("document.getElementById('assessmentContext').textContent")
            schools = json.loads((ROOT / 'dashboard-data.json').read_text(encoding='utf-8'))['schools']
            for school in schools:
                snapshot = js("document.getElementById('assessmentContext').textContent")
                choose('enrollSchool', school['DESE LEA'])
                choose('enrollLevel', 'Charter')
                choose('enrollMetric', '2025–26 K–12')
                assert js("document.getElementById('reachCount').textContent") == f"{school['2025–26 K–12']:,}"
                assert js("document.getElementById('assessmentContext').textContent") == snapshot, 'Filters must stay independent'
                choose('demoSchool', school['DESE LEA'])
                for level in ('Charter', 'Building'):
                    choose('demoLevel', level)
                    for metric in values('demoMetric'):
                        choose('demoMetric', metric)
                        assert js("document.querySelectorAll('#demographicsData tbody tr').length") >= 1
                choose('mapSchool', school['DESE LEA'])
                for level in ('Charter', 'Building'):
                    choose('mapLevel', level)
                    assert js("document.querySelectorAll('#assessmentData tbody tr').length") >= 1
                    assert js("document.getElementById('mapMetric').value") != ''
            choose('mapSchool', 'all')
            for level in ('Charter', 'Building'):
                choose('mapLevel', level)
                for group in values('mapGroup'):
                    choose('mapGroup', group)
                    assert js("document.querySelectorAll('#assessmentData tbody tr').length") >= 1
                choose('mapGroup', json.dumps(['MSIP Total', 'Total'], separators=(',', ':')))
                for metric in values('mapMetric'):
                    choose('mapMetric', metric)
                    assert js("document.querySelectorAll('#assessmentData tbody tr').length") >= 1
                for subject in values('mapSubject'):
                    choose('mapSubject', subject)
                    assert js("document.querySelectorAll('#assessmentData tbody tr').length") >= 1
            choose('historySchool', '048914')
            choose('historyStart', 2010)
            choose('historyEnd', 2015)
            assert js("document.querySelectorAll('#historyData tbody tr').length") == 6
            choose('directorySchool', '048914')
            js("document.getElementById('directorySearch').value='not-a-school';document.getElementById('directorySearch').dispatchEvent(new Event('input'))")
            assert js("document.querySelectorAll('#directoryData tbody tr').length") == 0
            # Check CSV content without writing a browser download to the user's Downloads folder.
            js("window.testExport=null;URL.createObjectURL=(blob)=>{window.testExport=blob;return 'blob:test'};HTMLAnchorElement.prototype.click=function(){};document.querySelector('[data-export=history]').click()")
            export = js('window.testExport.text()')
            assert 'Historical Demographics' in export and '2010' in export and 'Filter context' in export
            js("document.getElementById('resetAll').click()")
            time.sleep(.1)
            assert js("document.getElementById('reachCount').textContent") == '3,953'
            assert js("document.getElementById('mapGroup').value") == '["MSIP Total","Total"]'
            assert js("document.querySelectorAll('#historyData tbody tr').length") == 96
            assert js("document.querySelectorAll('#directoryData tbody tr').length") == 6
            js("document.getElementById('demoSchool').focus()")
            cdp('Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'Tab', 'code': 'Tab', 'windowsVirtualKeyCode': 9})
            cdp('Input.dispatchKeyEvent', {'type': 'keyUp', 'key': 'Tab', 'code': 'Tab', 'windowsVirtualKeyCode': 9})
            assert js('document.activeElement.id') == 'demoLevel'
            for width in (320, 768, 1440):
                cdp('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
                time.sleep(.3)
                dimensions = js('({width:innerWidth,content:document.documentElement.scrollWidth})')
                assert dimensions['content'] <= width, f'Page overflow at {width}: {dimensions}'
                js('window.scrollTo(0,0)')
                screenshot = cdp('Page.captureScreenshot', {'captureBeyondViewport': False})
                (ROOT / 'qa' / f'dashboard-{width}.png').write_bytes(base64.b64decode(screenshot['data']))
                for report in ('demographics', 'assessment', 'history', 'timeline'):
                    js(f"document.getElementById('{report}Title').scrollIntoView()")
                    time.sleep(.1)
                    screenshot = cdp('Page.captureScreenshot', {'captureBeyondViewport': False})
                    (ROOT / 'qa' / f'{report}-{width}.png').write_bytes(base64.b64decode(screenshot['data']))
                    js(f"document.getElementById('{report}Legend').scrollIntoView()")
                    time.sleep(.1)
                    screenshot = cdp('Page.captureScreenshot', {'captureBeyondViewport': False})
                    (ROOT / 'qa' / f'{report}-plot-{width}.png').write_bytes(base64.b64decode(screenshot['data']))
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
            assert js("document.querySelectorAll('#demographicsData tbody tr').length") == 6
            assert not errors, errors
            result = {'passed': True, 'chart_cdn_loaded': chart_loaded, 'viewports': [320, 768, 1440],
                'checks': ['repository-subpath loading', 'independent filters', 'six school and two reporting level filters', 'all demographic and MAP measure filters', 'student group and subject filters', 'historical year range', 'filtered CSV content', 'search', 'reset',
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
