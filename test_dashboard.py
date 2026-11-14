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
    (ROOT/'qa'/'ui-redesign').mkdir(parents=True,exist_ok=True)
    (ROOT/'qa'/'demographics-explorer').mkdir(parents=True,exist_ok=True)
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
            requested=[]

            def cdp(method, params=None):
                nonlocal message_id
                message_id += 1
                connection.send(json.dumps({'id': message_id, 'method': method, 'params': params or {}}))
                while True:
                    result = json.loads(connection.recv())
                    if result.get('method')=='Network.requestWillBeSent':requested.append(result['params']['request']['url'])
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
                    if js("!document.getElementById('dashboard')?.hidden"):
                        return
                    time.sleep(.1)
                raise AssertionError(js('document.body.innerText'))

            cdp('Runtime.enable')
            cdp('Page.enable')
            cdp('Network.enable')
            cdp('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'reduce'}]})
            cdp('Page.navigate', {'url': url})
            wait_loaded()
            assert js("document.querySelector('h1').textContent")=='SLU OSCP Charter Partnerships Dashboard'
            assert not any('explorer-' in r and r.endswith('.json') for r in requested),requested
            assert js("document.getElementById('fiveThings').textContent.includes('3,953')")
            assert js("document.getElementById('enrollmentBridge').textContent.includes('4,150')")
            assert js("document.querySelectorAll('#objectiveKpis .kpi').length")==8
            assert js("document.getElementById('citySplit').textContent.includes('3,247')")
            assert js("document.getElementById('compositionView').textContent.includes('Withheld by DESE')")
            assert js("document.getElementById('programPanels').textContent.includes('Awaiting confirmation')")
            assert js("document.querySelectorAll('#navLinks a').length")==7
            for level in ['Missouri','School','Building']:
                js(f"document.querySelector('#globalLevel [data-level={level}]').click()")
                assert js('globalLevel')==level
            js("document.querySelector('#globalLevel [data-level=School]').click()")
            for width in [320,375,768,1024,1440]:
                cdp('Emulation.setDeviceMetricsOverride',{'width':width,'height':1000,'deviceScaleFactor':1,'mobile':False})
                time.sleep(.1)
                assert js('document.documentElement.scrollWidth')<=width, width
                for target in ['overview','student-demographics','academic-performance','community','data-quality']:
                    js(f"document.getElementById('{target}').scrollIntoView()")
                    shot=cdp('Page.captureScreenshot',{'captureBeyondViewport':False})
                    folder=ROOT/'qa'/'three-levels';folder.mkdir(exist_ok=True)
                    (folder/f'{target}-{width}.png').write_bytes(base64.b64decode(shot['data']))
            cdp('Emulation.setDeviceMetricsOverride',{'width':1920,'height':1080,'deviceScaleFactor':1,'mobile':False})
            js("document.getElementById('presentationButton').click()")
            assert js("document.body.classList.contains('present')")
            assert js("parseFloat(getComputedStyle(document.querySelector('.deck-slide p')).fontSize)")>=28
            cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'ArrowRight','code':'ArrowRight','windowsVirtualKeyCode':39})
            assert js("document.getElementById('slideCounter').textContent.startsWith('2 /')")
            shot=cdp('Page.captureScreenshot',{'captureBeyondViewport':False});(ROOT/'qa/three-levels/presentation.png').write_bytes(base64.b64decode(shot['data']))
            cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
            assert not js("document.body.classList.contains('present')")
            cdp('Page.addScriptToEvaluateOnNewDocument',{'source':"window.sentHeights=[];window.postMessage=(message,origin)=>window.sentHeights.push({message,origin})"})
            cdp('Page.navigate',{'url':url+'?embed=1'});wait_loaded()
            assert js("window.sentHeights.some(x=>x.message.type==='oscp-dashboard-height'&&x.message.height>0&&x.origin==='https://www.slu.edu')")
            assert js("getComputedStyle(document.querySelector('.masthead')).display")=='none'
            assert js("getComputedStyle(document.querySelector('footer')).display")=='none'
            cdp('Page.navigate',{'url':url+'explorer.html'});wait_loaded();time.sleep(.5)
            assert js("document.getElementById('dxFilters')!==null")
            assert js("document.querySelectorAll('.report').length")==11
            assert js("document.getElementById('requestLog').textContent.includes('26')") or js("data.requests.distinct_records")==26
            for level in ['Charter','Building']:
                js(f"document.getElementById('demoLevel').value='{level}';document.getElementById('demoLevel').dispatchEvent(new Event('change'))")
                assert js("document.querySelectorAll('#demographicsData tbody tr').length")>=6
            js("document.getElementById('dxNetwork').value='115911';document.getElementById('dxNetwork').dispatchEvent(new Event('change'))")
            assert js("[...document.getElementById('dxBuilding').options].every(o=>o.value==='all'||o.value.startsWith('115911/'))")
            js("window.testBlob=null;window.oldURL=URL.createObjectURL;window.oldClick=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{window.testBlob=b;return 'blob:test'};HTMLAnchorElement.prototype.click=function(){};document.querySelector('[data-export=assessment]').click()")
            csv=js('window.testBlob.text()');assert 'Level' in csv and 'Year' in csv and 'Withheld' in js("document.body.textContent")
            js("document.querySelector('[data-visual-png=assessmentPanel]').click()")
            time.sleep(.2)
            assert js('window.testBlob.type')=='image/png'
            assert js('window.testBlob.size')>1000
            js("URL.createObjectURL=window.oldURL;HTMLAnchorElement.prototype.click=window.oldClick")
            for width in [320,375,768,1024,1440]:
                cdp('Emulation.setDeviceMetricsOverride',{'width':width,'height':1000,'deviceScaleFactor':1,'mobile':False});time.sleep(.1)
                assert js('document.documentElement.scrollWidth')<=width,('explorer',width)
            cdp('Network.setBlockedURLs',{'urls':['*cdn.jsdelivr.net*']});cdp('Page.reload',{'ignoreCache':True});wait_loaded();assert js('!!window.Chart')
            cdp('Network.setBlockedURLs',{'urls':['*vendor/chart.umd.min.js*']});cdp('Network.setCacheDisabled',{'cacheDisabled':True});cdp('Page.reload',{'ignoreCache':True});wait_loaded();time.sleep(.2)
            assert not js('!!window.Chart')
            assert js("document.getElementById('chartFallback').hidden")==False
            assert js("document.querySelectorAll('#assessmentData tbody tr').length")>0
            assert not errors,errors
            print(json.dumps({'passed':True,'widths':[320,375,768,1024,1440],'presentation':[1920,1080],'checks':['summary-only main','level switcher','fixtures','dependent explorer filters','CSV level/year','embed','presentation keyboard','self-hosted chart CDN block','no-chart tables','no browser exceptions']},indent=2))
        finally:
            if connection:connection.close()
            process.terminate();process.wait(timeout=20);server.shutdown()

if __name__=='__main__':run()
