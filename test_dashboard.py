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

            cdp('Runtime.enable');cdp('Page.enable');cdp('Network.enable')
            cdp('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'reduce'}]})
            shots=ROOT/'qa'/'navigation-redesign';shots.mkdir(parents=True,exist_ok=True)
            def viewport(w,h=1000):
                cdp('Emulation.setDeviceMetricsOverride',{'width':w,'height':h,'deviceScaleFactor':1,'mobile':False})
            def navigate(path=''):
                cdp('Page.navigate',{'url':url+path});wait_loaded();time.sleep(.25)
            def route_to(path):
                js('location.hash='+json.dumps(path));time.sleep(.3)
            def screenshot(name):
                (shots/(name+'.png')).write_bytes(base64.b64decode(cdp('Page.captureScreenshot',{'format':'png'})['data']))
            viewport(1440,900);navigate()
            assert js("document.querySelectorAll('.kpi').length")==6
            assert js("getComputedStyle(document.getElementById('objectiveKpis')).gridTemplateColumns.split(' ').length")==3
            assert js("document.querySelector('.tabs').getBoundingClientRect().bottom")<900
            assert js("document.querySelector('header').getBoundingClientRect().height")<=80
            assert not any('explorer-' in r and r.endswith('.json') for r in requested)
            screenshot('start')
            assert js("document.getElementById('panel-students').textContent.includes('4,150')")
            assert js("document.getElementById('cities').textContent.includes('3,247')")
            for topic in ['overview','schools','students','learning','growth','programs','explore','about']:
                route_to(topic)
                for _ in range(80):
                    if topic!='explore' or js("!!document.getElementById('reportFilters')"):break
                    time.sleep(.1)
                assert js("document.querySelectorAll('#dashboard>[role=tabpanel]:not([hidden])').length")==1
                assert js(f"document.getElementById('tab-{topic}').getAttribute('aria-selected')")=='true'
                if topic in ['students','learning','growth']:
                    assert js(f"document.querySelectorAll('#panel-{topic} .level-legend .level').length")==3
                    assert js(f"document.querySelectorAll('#panel-{topic} [data-switch]').length")==2
                    js(f"document.querySelector('#panel-{topic} [data-level=Building]').click()")
                    assert js(f"levels.{topic}")=='Building'
                    js(f"document.querySelector('#panel-{topic} [data-level=School]').click()")
                js('scrollTo(0,document.getElementById("panel-'+topic+'").offsetTop-80)');screenshot(topic)
                visible=js("document.getElementById('panel-'+active).innerText")
                assert js("[...document.querySelectorAll('#panel-'+active+' canvas')].every(c=>{let text=c.closest('.card').querySelector('.caption:last-of-type')?.textContent;return /20\\d{2}/.test(text)&&/Schools|School buildings|Missouri/.test(text)})")
                import re
                assert not re.search(r'\b(network|LEA|district|record)\b|campus count',visible,re.I),visible[:300]
            for report in ['history','groups','map','grades','growth','directory']:
                route_to('explore/'+report)
                assert js("document.querySelectorAll('#reportHost [role=tabpanel]').length")==1
                assert js("document.getElementById('reportFilters').innerText.includes('Reset filters')")
                assert js("document.querySelector('#reportOutput table tbody tr')!==null"),report
            # A reportable, exact same-grade comparison stays available.
            route_to('explore/grades')
            js("var f=document.getElementById('reportFilters');f.elements.level.value='Building';f.elements.grade.value='3';f.dispatchEvent(new Event('change'))")
            assert js("document.getElementById('reportOutput').textContent.includes('Missouri, same grade')")
            assert js("document.querySelectorAll('#reportOutput tbody tr').length")==7
            # Real keyboard events exercise roving focus.
            route_to('overview');js("document.getElementById('tab-overview').focus()")
            cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'ArrowRight','code':'ArrowRight'});time.sleep(.2)
            assert js('location.hash')=='#schools'
            route_to('students');route_to('growth');js('history.back()');time.sleep(.3)
            assert js('active')=='students'
            route_to('academic-performance');assert js('location.hash')=='#learning/reading'
            assert js("document.getElementById('reading').classList.contains('highlight')")
            for i in range(6):
                js(f"document.querySelectorAll('.kpi')[{i}].click()");time.sleep(.2)
                assert js("document.querySelector(location.hash.split('/')[1]?'#'+location.hash.split('/')[1]:'#facts').classList.contains('highlight')")
            for query in ['academie','Acad\u00e9mie','city garden','hope','frontier excellence']:
                js("var s=document.getElementById('search');s.value="+json.dumps(query)+";s.dispatchEvent(new Event('input'))")
                assert js("document.querySelectorAll('#matches li').length")>0,query
                js("document.getElementById('search').focus()")
                cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'ArrowDown','code':'ArrowDown'})
                cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'Enter','code':'Enter'});time.sleep(.2)
                assert js('active')=='schools'
            # Export the exact visible source table and a PNG.
            route_to('learning/reading')
            js("window.testBlob=null;window.oldURL=URL.createObjectURL;window.oldClick=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{window.testBlob=b;return 'blob:test'};HTMLAnchorElement.prototype.click=function(){};document.querySelector('[data-csv=reading]').click()")
            assert 'School' in js('window.testBlob.text()')
            js("document.querySelector('[data-png=reading]').click()");time.sleep(.2)
            assert js('window.testBlob.type')=='image/png'
            js('URL.createObjectURL=window.oldURL;HTMLAnchorElement.prototype.click=window.oldClick')
            for width in [320,375,390,768,1024,1440]:
                viewport(width);route_to('overview');js('scrollTo(0,0)');time.sleep(.1)
                assert js('document.documentElement.scrollWidth')<=width,('page',width)
                assert js("getComputedStyle(document.getElementById('objectiveKpis')).gridTemplateColumns.split(' ').length")==(1 if width<600 else 2 if width<1200 else 3)
                for topic in ['schools','students','learning','growth','programs','explore','about']:
                    route_to(topic);assert js('document.documentElement.scrollWidth')<=width,(topic,width)
                if width==390:route_to('students');screenshot('mobile-students');route_to('overview');js('scrollTo(0,0)');screenshot('mobile-start')
            viewport(1920,1080);navigate('?present=1')
            assert js("document.querySelectorAll('.deck-active').length")==1
            screenshot('presentation')
            cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'ArrowRight','code':'ArrowRight'})
            assert js('deckIndex')==1
            cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'Escape','code':'Escape'})
            assert not js('presenting')
            viewport(1440,900);navigate('?embed=1')
            assert js("getComputedStyle(document.querySelector('header')).display")=='none'
            height_message=js("new Promise(resolve=>{var f=document.createElement('iframe');f.id='embed-test';window.addEventListener('message',function receive(e){if(e.source===f.contentWindow){window.removeEventListener('message',receive);resolve(e.data)} });f.src=location.origin+location.pathname+'?embed=1';document.body.appendChild(f);setTimeout(()=>resolve(null),5000)})")
            assert height_message and height_message['type']=='oscp-dashboard-height' and height_message['height']>0
            js("document.getElementById('embed-test').remove()")
            cdp('Emulation.setEmulatedMedia',{'media':'print'})
            assert js("[...document.querySelectorAll('#dashboard>[role=tabpanel]')].every(n=>getComputedStyle(n).display!=='none')")
            cdp('Emulation.setEmulatedMedia',{'media':'screen'})
            cdp('Network.setBlockedURLs',{'urls':['*cdn.jsdelivr.net*']});navigate()
            assert js('!!window.Chart')
            cdp('Network.setBlockedURLs',{'urls':['*vendor/chart.umd.min.js*']});cdp('Network.setCacheDisabled',{'cacheDisabled':True});navigate('?charts=blocked#learning')
            assert not js('!!window.Chart')
            assert js("document.querySelector('#reading table tbody tr')!==null")
            assert js("document.querySelector('#reading .plot').hidden")
            navigate('explorer.html#explore/map')
            for _ in range(80):
                if js("!!document.getElementById('reportFilters')"):break
                time.sleep(.1)
            assert js('active')=='explore'
            assert js("document.querySelector('#reportOutput tbody tr')!==null")
            assert not errors,errors
            result={'passed':True,'widths':[320,375,390,768,1024,1440],'presentation':[1920,1080],'checks':['eight tabs','six reports','keyboard tabs','hash and back','legacy hashes','tile highlight','search','levels','CSV/PNG','print','embed','CDN fallback','direct Explorer']}
            (shots/'results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
        finally:
            if connection:connection.close()
            process.terminate();process.wait(timeout=20);server.shutdown()

if __name__=='__main__':run()
