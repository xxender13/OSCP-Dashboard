"""Real Chrome checks for static loading, filters, responsive layout and CDN failure.

Requires an installed Chrome plus requests and websocket-client (test-only).
"""
import base64
import io
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
from pypdf import PdfReader

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
            shots=ROOT/'qa'/'configured-dashboards';shots.mkdir(parents=True,exist_ok=True)
            def until(expression):
                for _ in range(120):
                    if js(expression):return
                    time.sleep(.05)
                raise AssertionError((expression,js("document.getElementById('loadStatus').textContent"),errors))
            def viewport(w,h=900):cdp('Emulation.setDeviceMetricsOverride',{'width':w,'height':h,'deviceScaleFactor':1,'mobile':False})
            def navigate(path=''):
                cdp('Page.navigate',{'url':url+path});time.sleep(.2);until("!!window.Dashboard && !!document.getElementById('canvas-'+active) && document.getElementById('loadStatus').hidden")
            def route_to(path):
                js('location.hash='+json.dumps(path));time.sleep(.18);until("document.getElementById('loadStatus').hidden && !!document.getElementById('canvas-'+active)")
            def change(selector,value,event='change'):
                js('(()=>{const n=document.querySelector('+json.dumps(selector)+');n.value='+json.dumps(value)+';n.dispatchEvent(new Event('+json.dumps(event)+',{bubbles:true}));})()');time.sleep(.18)
            def click(selector):js('document.querySelector('+json.dumps(selector)+').click()');time.sleep(.18)
            def screenshot(name,full=False):
                params={'format':'png'}
                if full:
                    size=cdp('Page.getLayoutMetrics')['cssContentSize'];params.update({'captureBeyondViewport':True,'clip':{'x':0,'y':0,'width':size['width'],'height':size['height'],'scale':1}})
                (shots/(name+'.png')).write_bytes(base64.b64decode(cdp('Page.captureScreenshot',params)['data']))
            def geometry(topic,width):
                report=js("""(()=>{const frame=document.getElementById('canvas-'+active);const nodes=[document.querySelector('.tabs'),frame.querySelector('.filter-dock')??frame.querySelector('.canvas-filters'),frame.querySelector('.kpi-strip,.home-kpis'),...frame.querySelectorAll('[data-panel]'),frame.querySelector('.definitions-band')].filter(n=>n&&getComputedStyle(n).display!=='none');let overlaps=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){let a=nodes[i].getBoundingClientRect(),b=nodes[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)overlaps.push([nodes[i].className,nodes[j].className]);}return {overlaps,canvas:[...frame.querySelectorAll('canvas')].filter(c=>c.offsetWidth&&c.offsetHeight).map(c=>{let a=c.getBoundingClientRect(),b=c.parentElement.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1}),labels:[...frame.querySelectorAll('.filter-field')].map(n=>{let r=n.getBoundingClientRect();return r.width>=100&&r.right<=innerWidth+1&&r.left>=-1}),panels:[...frame.querySelectorAll('[data-panel]')].map(n=>Math.round(n.getBoundingClientRect().height))}})()""")
                assert not report['overlaps'],(topic,width,report)
                assert all(report['canvas']),(topic,width,'canvas edges')
                assert all(report['labels']),(topic,width,'filter labels')
                if topic in ['students','learning','growth']:assert all(abs(h-(300 if width<600 else 320 if width<1100 else 360))<=1 for h in report['panels']),(topic,width,report['panels'])
                assert js('document.documentElement.scrollWidth')<=width,(topic,width,js('document.documentElement.scrollWidth'))
            viewport(1440);navigate()
            assert js('active')=='home'
            assert js("document.getElementById('home-intro').innerText")==js('dashboardConfig.intro')
            assert len(js('dashboardConfig.intro').split())<=60
            assert js("document.querySelectorAll('#canvas-home .home-level-key .level').length")==4
            assert js("document.querySelectorAll('#canvas-home .home-kpi').length")==6
            assert js("document.querySelectorAll('#home-scorecard tbody tr').length")==7
            assert js("document.querySelector('#home-scorecard tbody tr:last-child').className")=='state-row'
            assert js("document.querySelectorAll('#dashboard-directory article').length")==7
            for value in ['3,953','61.06%','32.07%','46.95%','49.69%','7 of 13','5 of 13']:
                assert value in js("document.getElementById('canvas-home').innerText"),value
            assert not any('explorer-' in r or 'canvas-' in r for r in requested if r.endswith('.json'))
            expected_coverage=js("Object.keys(data.kpi_metrics.map).map(subject=>Dashboard.coverage(subject))")
            assert expected_coverage==['3 of 6 schools published (about 88% of tested students)']*2
            assert expected_coverage[0] in js("document.querySelector('[data-home-tile=map]').innerText")
            assert expected_coverage[0] in js("document.getElementById('home-scorecard').innerText")
            # Numeric text must be traceable to a published payload value, its
            # displayed rounding, source collection size, or fixed scale endpoint.
            import re
            from decimal import Decimal, ROUND_HALF_UP
            source_numbers={Decimal(0),Decimal(100)}  # documented percent-axis endpoints
            def collect_numbers(value):
                if isinstance(value,dict):
                    for item in value.values():collect_numbers(item)
                elif isinstance(value,list):
                    source_numbers.add(Decimal(len(value)))
                    for item in value:collect_numbers(item)
                elif isinstance(value,(int,float)) and not isinstance(value,bool):
                    n=Decimal(str(value));source_numbers.update([n,n.quantize(Decimal('.01'),rounding=ROUND_HALF_UP),n.quantize(Decimal('1'),rounding=ROUND_HALF_UP)])
                elif isinstance(value,str):
                    for n in re.findall(r'\d[\d,]*(?:\.\d+)?',value):source_numbers.add(Decimal(n.replace(',','')))
            for packet in (ROOT/'dist').glob('*.json'):collect_numbers(json.loads(packet.read_text(encoding='utf-8')))
            # Coverage is a documented count-derived definition, independently recomputed.
            summary=json.loads((ROOT/'summary.json').read_text(encoding='utf-8'))
            for subject,metric in summary['kpi_metrics']['map'].items():
                rows=[r for r in summary['three_levels']['map_rows'] if r['level']=='Charter' and r['subject']==subject]
                total=sum(r.get('REPORTABLE') or 0 for r in rows)
                if total:source_numbers.add(Decimal(metric['denominator']*100/total).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
            destinations=js('dashboardConfig.dashboards.map(d=>d.id)')
            import re
            for topic in destinations:
                route_to(topic);js('scrollTo(0,0)');geometry(topic,1440)
                assert js("document.querySelector('[role=tab][aria-selected=true]').dataset.tab")==topic
                assert js("document.querySelectorAll('#dashboard>[role=tabpanel]:not([hidden])').length")==1
                assert js("document.querySelectorAll('#canvas-'+active+' .four-level-key .level').length")>=4
                visible=js("document.getElementById('canvas-'+active).innerText")
                unknown={n for n in re.findall(r'\d[\d,]*(?:\.\d+)?',visible) if Decimal(n.replace(',','')) not in source_numbers}
                assert not unknown,(topic,'numbers without source or fixed definition',unknown)
                if topic!='explore':
                    for f in js('Dashboard.definition(active).filters'):
                        assert js("!!document.querySelector('#canvas-'+active+' [data-config-filter='+"+json.dumps(f['id'])+"+']')"),(topic,f['id'])
                    for panel in js('Dashboard.definition(active).panels'):
                        assert js('!!document.getElementById('+json.dumps(panel)+')'),(topic,panel)
                visible=js("document.getElementById('panel-'+active).innerText")
                assert not re.search(r'\b(network|LEA|district|record|owner|awaiting|pending|best|worst|leading|success)\b|campus count|Withheld by DESE|Not applicable',visible,re.I),(topic,visible[:300])
                if topic in ['students','learning','growth']:
                    assert js("document.querySelectorAll('#canvas-'+active+' [data-panel]').length")==4
                    assert js('Analytics.renderMs')<200
                    assert js("[...document.querySelectorAll('#canvas-'+active+' [data-panel]')].every(n=>n.querySelector('.chart-summary')?.textContent&&n.querySelector('[data-panel-table]')&&n.querySelector('.panel-table table'))")
                    assert js("[...document.querySelectorAll('#canvas-'+active+' .panel-caption')].every(n=>/20[0-9][0-9]/.test(n.textContent)&&/Schools|School buildings/.test(n.textContent))")
                screenshot(topic+'-1440')
            # Every Home tile and directory link reaches the specified dashboard.
            for tile,topic,measure in [('enrollment','students',None),('schools','schools',None),('lunch','students','frl'),('black','students','black'),('map','learning',None),('growth','growth',None)]:
                route_to('home');click('[data-home-tile='+tile+']');assert js('active')==topic
                if measure:assert js('Analytics.state.students.measure')==measure
            for topic in destinations[1:]:
                route_to('home');click('#dashboard-directory a[href="#'+topic+'"]');assert js('active')==topic
            # Real school, city and directory search filters.
            route_to('schools');change('#canvas-schools [name=city]','St. Louis')
            assert js("[...document.querySelectorAll('#profiles>.card')].filter(n=>!n.hidden).length")==2
            assert js("document.querySelectorAll('#directoryTable tbody tr').length")==3
            click('#canvas-schools button[type=reset]');change('#canvas-schools [name=search]','frontier excellence')
            assert js("document.querySelectorAll('#directoryTable tbody tr').length")==2
            click('#canvas-schools button[type=reset]')
            # Demographic pooling, all-source categories and state references.
            route_to('students')
            assert js("document.querySelector('#canvas-students .kpi-strip').innerText.includes('32.07%')")
            assert js("document.querySelector('#canvas-students .kpi-strip').innerText.includes('1,255 of 3,913')")
            assert js("Analytics.models.get('bridge').datasets[0].data")==[3953,197,4150]
            for category in ['asian','american_indian','pacific_islander']:
                assert js("!!document.querySelector('#canvas-students [name=measure] option[value="+category+"]')")
            change('#canvas-students [name=school]','academie')
            assert js('Analytics.state.students.school')=='048914'
            click('#canvas-students [data-canvas-level=school-buildings]')
            assert js("Analytics.models.get('groups').labels.length")==4
            saved_hash=js('location.hash');navigate(saved_hash)
            assert js('Analytics.state.students.school')=='048914'
            assert js('Analytics.state.students.level')=='school-buildings'
            change('#canvas-students [name=year]','2024')
            assert js("Analytics.models.get('groups').year")=='2024'
            assert js("Analytics.models.get('needs-history').labels.at(-1)")==2024
            before=js("JSON.stringify(Analytics.models.get('groups').datasets[0].data)")
            click('#canvas-students [name=reference]');assert js("Analytics.models.get('groups').refs.length")==0
            assert js("JSON.stringify(Analytics.models.get('groups').datasets[0].data)")==before
            click('#canvas-students button[type=reset]');assert js('Analytics.state.students.school')=='all'
            js("Analytics.chartMap.get('needs-history').options.plugins.legend.onClick(null,{datasetIndex:0})");time.sleep(.2)
            assert js('Analytics.state.students.school')!='all'
            click('#canvas-students [data-remove-filter=school]');assert js('Analytics.state.students.school')=='all'
            # Exact-grade and student-group controls use only published source values.
            route_to('learning')
            assert js("document.querySelectorAll('#canvas-learning [data-pooled-map]').length")==2
            for node in js("[...document.querySelectorAll('#canvas-learning [data-pooled-map]')].map(n=>n.innerText)"):assert expected_coverage[0] in node
            assert js("document.querySelector('#canvas-learning [name=group]')!==null")
            assert js("document.querySelector('#canvas-learning [name=grade]')!==null")
            assert js("[...document.querySelectorAll('#canvas-learning option:disabled')].every(n=>n.title==='Not published')")
            assert js("document.querySelectorAll('#canvas-learning option:disabled').length")>0
            assert js("Analytics.models.get('reading').datasets[0].data.filter(v=>v===null).length")==3
            assert js("Analytics.models.get('performance').datasets.every(d=>d.data.filter(v=>v!==null).length===3)")
            published_group=js("[...document.querySelector('#canvas-learning [name=group]').options].find(o=>!o.disabled&&o.value!=='Total').value")
            change('#canvas-learning [name=group]',published_group)
            assert js('Analytics.state.learning.group')==published_group
            assert js("Analytics.models.get('reading').datasets[0].meta.every(r=>!r.category||Dashboard.matchesGroup(r,Analytics.state.learning.group))")
            change('#canvas-learning [name=group]','Total');click('#canvas-learning [data-canvas-level=school-buildings]')
            assert js("Analytics.models.get('grade-comparison').datasets[0].data.filter(v=>v!==null).length")==4
            change('#canvas-learning [name=school]','hope')
            assert js("Analytics.models.get('reading').datasets[0].data")==[None]
            assert js("document.querySelector('#reading .empty-panel').textContent")=='No published results for this selection'
            click('#canvas-learning button[type=reset]')
            for model_id in ['reading','math','grade-comparison','performance']:
                labels=js('Analytics.models.get('+json.dumps(model_id)+').labels');assert not any('Missouri' in label for label in labels)
                tips=js("(()=>{const m=Analytics.models.get("+json.dumps(model_id)+"),c=Analytics.chartMap.get(m.id);return m.datasets.flatMap((d,di)=>d.data.flatMap((v,i)=>v===null?[]:[c.options.plugins.tooltip.callbacks.label({dataset:d,datasetIndex:di,dataIndex:i,raw:v})]))})()")
                assert all('2025' in tip and ' of ' in tip and ('Schools' in tip or 'School buildings' in tip) for tip in tips)
            # Both menu and chart fit their frame; explicit anchors remain below sticky navigation.
            route_to('learning/reading');js("document.getElementById('reading').scrollIntoView({block:'start'})");time.sleep(.2)
            assert js("document.getElementById('reading').getBoundingClientRect().top")>=js("document.querySelector('.tabs').getBoundingClientRect().bottom")-1
            click('#reading .panel-menu summary')
            assert js("(()=>{let n=document.querySelector('#reading .panel-menu>div'),r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&getComputedStyle(n.closest('.analytic-canvas')).overflow!=='hidden'})()")
            click('#reading [data-panel-table]');assert js("document.getElementById('reading-table').open")
            click('#reading [data-panel-table]')
            # Capture actual files produced by panel and complete-view exports.
            js("window.testBlob=null;window.oldURL=URL.createObjectURL;window.oldClick=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{window.testBlob=b;return 'blob:test'};HTMLAnchorElement.prototype.click=function(){}")
            click('#reading [data-panel-csv]');assert 'Proficient' in js('window.testBlob.text()')
            js('window.testBlob=null');click('#reading [data-panel-png]');until("window.testBlob?.type==='image/png'");assert js('window.testBlob.size')>10000
            js('window.testBlob=null');click('#canvas-learning [data-canvas-export]');until("window.testBlob?.type==='image/png'");assert js('window.testBlob.size')>30000
            (shots/'learning-export.png').write_bytes(base64.b64decode(js("new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(window.testBlob)})")))
            js('URL.createObjectURL=window.oldURL;HTMLAnchorElement.prototype.click=window.oldClick')
            # Each configured Explorer filter appears in its applicable report.
            found=set()
            for report in ['history','groups','map','grades','growth','directory']:
                route_to('explore/'+report)
                found.update(js("[...document.querySelectorAll('#reportFilters [data-config-filter]')].map(n=>n.dataset.configFilter)"))
                assert js("document.querySelectorAll('#reportOutput .panel-menu button').length")==3
                assert js("document.querySelector('#reportOutput .panel-table table')!==null")
            assert set(js("Dashboard.definition('explore').filters.map(f=>f.id)"))<=found
            # Every required search spelling and old route is supported.
            for query in ['Academie','Acad\u00e9mie','city garden','hope','frontier excellence']:
                change('#search',query,'input');assert js("document.querySelectorAll('#matches li').length")>0
                js("document.getElementById('search').focus()")
                cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'ArrowDown','code':'ArrowDown'});cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'Enter','code':'Enter'});time.sleep(.2)
                assert js('active')=='schools'
            change('#search','','input')
            for legacy,target in [('overview','home'),('programs','sponsorships'),('Programs','sponsorships'),('academic-performance','learning'),('academic-growth','growth')]:
                route_to(legacy);assert js('active')==target
            route_to('students');route_to('growth');js('history.back()');time.sleep(.2);assert js('active')=='students'
            route_to('home');js("document.getElementById('tab-home').focus()")
            cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'ArrowRight','code':'ArrowRight'});time.sleep(.2);assert js('active')=='schools'
            assert js("getComputedStyle(document.activeElement).outlineStyle")!='none'
            for width,height in [(320,900),(375,900),(390,900),(768,900),(1024,900),(1440,900),(1920,1080)]:
                viewport(width,height)
                for topic in destinations:
                    route_to(topic);js('scrollTo(0,0)');time.sleep(.05);geometry(topic,width)
                    if topic in ['students','learning','growth']:
                        assert js("getComputedStyle(document.querySelector('#canvas-'+active+' .analytic-grid')).gridTemplateColumns.split(' ').length")==(1 if width<900 else 2)
                    if width==390:screenshot(topic+'-390',full=True)
            viewport(1920,1080);navigate('?present=1');until("presenting&&document.querySelector('.deck-active')?.id==='canvas-home'")
            assert js('deck.length')==len(destinations)
            for topic in destinations:
                js("deckIndex=deck.indexOf(document.getElementById("+json.dumps('canvas-'+topic)+"));showSlide()");time.sleep(.2)
                assert js("document.querySelectorAll('.deck-active').length")==1
                screenshot(topic+'-presentation')
            cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'Escape','code':'Escape'});time.sleep(.2);assert not js('presenting')
            # Landscape PDFs contain one complete dashboard per page.
            viewport(1440);js('Analytics.preparePresentation()')
            cdp('Emulation.setEmulatedMedia',{'media':'print'})
            for topic in destinations:
                js('document.body.dataset.printCanvas='+json.dumps(topic))
                output=base64.b64decode(cdp('Page.printToPDF',{'landscape':True,'printBackground':True,'preferCSSPageSize':True})['data'])
                (shots/(topic+'-print.pdf')).write_bytes(output);document=PdfReader(io.BytesIO(output));assert len(document.pages)==1,(topic,len(document.pages))
                printed=document.pages[0].extract_text()
                assert len(printed)>100,(topic,'blank or incomplete PDF')
                if topic=='home':
                    assert 'They do not show that SLU sponsorship caused them.' in printed
                    assert 'What the terms and data years mean.' in printed
                if topic=='schools':
                    assert '3,247' in printed and '706' in printed,(topic,'city totals clipped')
                if topic!='home':assert js('Dashboard.definition('+json.dumps(topic)+').nav_label') in printed,(topic,printed[:150])
            js('delete document.body.dataset.printCanvas');cdp('Emulation.setEmulatedMedia',{'media':'screen'})
            navigate('?embed=1');assert js("getComputedStyle(document.querySelector('header')).display")=='none'
            message=js("new Promise(resolve=>{let f=document.createElement('iframe');f.id='embed-test';window.addEventListener('message',function receive(e){if(e.source===f.contentWindow){window.removeEventListener('message',receive);resolve(e.data)}});f.src=location.origin+location.pathname+'?embed=1';document.body.appendChild(f);setTimeout(()=>resolve(null),5000)})")
            assert message and message['type']=='oscp-dashboard-height' and message['height']>0
            js("document.getElementById('embed-test').remove()")
            cdp('Network.setBlockedURLs',{'urls':['*cdn.jsdelivr.net*','*unpkg.com*']});navigate('?fallback=cdn#learning');assert js('!!window.Chart')
            cdp('Network.setBlockedURLs',{'urls':['*vendor/chart.umd.min.js*']});cdp('Network.setCacheDisabled',{'cacheDisabled':True});navigate('?fallback=chart#learning')
            assert not js('!!window.Chart');assert js("document.getElementById('reading-table').open")
            navigate('explorer.html#explore/map');assert js('active')=='explore'
            assert not errors,errors
            result={'passed':True,'widths':[320,375,390,768,1024,1440,1920],'presentation':[1920,1080],'checks':['configured eight dashboards','Home content and links','config filter/panel parity','MAP coverage labels','student group and course choices','source suppression','shared URL filters','school search and legacy routes','geometry and chart containment','dropdowns and anchors','CSV/PNG exports','one-dashboard presentation','one-dashboard PDF','embed height','self-hosted fallback']}
            (shots/'results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
        finally:
            if connection:connection.close()
            process.terminate();process.wait(timeout=20);server.shutdown()

if __name__=='__main__':run()
