"""Generate a local planning report from configuration and existing source outputs."""
from collections import Counter
import csv
import json
from pathlib import Path
import re
import sys

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt

ROOT = Path(__file__).resolve().parents[1]
DEMO = ('FRL %','EL %','IEP incidence %','Black %','Hispanic %','Multiracial %','White %')
ROLES = {'download':'Research fellow (DESE download)','leadership':'OSCP leadership','programs':'OSCP program staff'}
KEY = {'withheld':'Not published (DESE *)','not_applicable':'Not tested','not_supplied':'Not available','ready':'Data exists, not yet shown','input':'Awaiting OSCP input'}

def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8'))

def sources():
    configuration=read('config/dashboards.json')
    public=read('summary.json')
    full=read('docs/internal/dashboard-data.json')
    missing=read('qa/missing-data-audit.json')
    requests=read('qa/event-audit.json')
    templates={}
    for p in sorted((ROOT/'data/inputs').glob('*.csv')):
        with p.open(encoding='utf-8-sig',newline='') as stream:templates[p.stem]=list(csv.DictReader(stream))
    return configuration,public,full,missing,requests,templates

def evidence(full,missing,requests):
    cells=[r for r in missing['cells'] if r['metric'] in DEMO]
    school_cells=[r for r in cells if r['level']=='School']
    building_cells=[r for r in cells if r['level']=='Building']
    schools={s['DESE LEA']:s['School'] for s in full['schools']}
    buildings={(b['lea'],b['building']):b['name'] for b in full['directory']}
    rows=[r['record'] for r in requests['records']]
    tracker={k:sum(r.get(k) not in (None,'') for r in rows) for k in rows[0]}
    tracker.update(unique=len(rows),raw=sum(len(r['origins']) for r in requests['records']),requested_total=sum(r.get('Amount Requested') or 0 for r in rows))
    withheld_schools=[(schools[r['lea']],r['metric']) for r in school_cells if r['status']=='withheld']
    withheld_buildings=[(buildings[r['lea'],r['building']],r['metric']) for r in building_cells if r['status']=='withheld']
    absent=[name for name in ('District-Charter Preliminary Enrollment.xlsx','Building Preliminary Enrollment.xlsx') if not (ROOT/'data/enrollment_demographics'/name).exists()]
    map_rows={subject:sum(r['level']=='Building' and r['subject']==subject for r in full['three_levels']['map_rows']) for subject in full['kpi_metrics']['map']}
    return {'school_cells':len(school_cells),'building_cells':len(building_cells),'school_withheld':withheld_schools,'building_withheld':withheld_buildings,'tracker':tracker,'absent_preliminary':absent,'map_building_rows':map_rows,'map_years':sorted({r['year'] for r in full['assessments']}),'growth_years':sorted({r['year'] for r in full['growth']}),'growth_eligible':{subject:sum(r['eligible'] for r in full['growth'] if r['subject']==subject) for subject in full['kpi_metrics']['growth']}}

def option_labels(source,public,full,templates):
    if source.startswith(('support.','engagement.')):
        packet=read('support-data.json')
        sponsor=packet['sponsorships']['rows'];engage=packet['engagement']['rows']
        return {'support.fiscal_years':sorted({r['fiscal_year'] for r in sponsor if r['fiscal_year']}) or ['Not available'],
                'support.organizations':sorted({r['organization'] for r in sponsor if r['organization']}),
                'support.statuses':sorted({r['status'] for r in sponsor}),
                'engagement.statuses':sorted({r['status'] for r in engage}),
                'engagement.categories':sorted({r['category'] for r in engage}),
                'engagement.types':sorted({r['participation_type'] for r in engage}),
                'engagement.sizes':['All activities','Up to 1,000'],
                'support.search':['Free-text search of both sections']}.get(source,['See selected report'])
    if source=='schools.names':return ['All schools']+[s['School'] for s in public['schools']]
    if source=='directory.cities':return ['All cities']+sorted({r['city'] for r in public['directory']})
    if source=='directory.names':return ['Free text: school or school building name']
    if source=='levels.education':return ['Schools','School buildings']
    if source=='history.years':return [str(y) for y in full['demographics_explorer']['years']]
    if source=='history.measures':return [r['label'] for r in full['demographics_explorer']['metrics'].values()]
    if source=='matched_map.grades':return sorted({str(r['grade']) for r in full['matched_map']['grade_slices']})
    if source=='assessments.student_groups':return sorted({r['group'] for r in full['assessments']})
    if source in ('assessments.subjects','growth.subjects'):return sorted(full['kpi_metrics']['map'])
    if source=='assessments.all_subjects':return sorted({r['subject'] for r in full['assessments']})
    if source=='assessments.measures':return list(read('config/dashboards.json')['assessment_measures'].values())
    if source=='reference.toggle':return ['Shown by default','Hidden']
    if source=='programs.types':return ['All areas']+[k.replace('_',' ').title() for k in public['programs']]
    if source=='programs.confirmed':return ['Confirmed items only']
    if source=='programs.years':return sorted({r.get('fiscal_year') or r.get('award_year') or r.get('reporting_period') for area in public['programs'].values() for r in area if r.get('fiscal_year') or r.get('award_year') or r.get('reporting_period')}) or ['Not available']
    return ['See selected report']

def readiness(dashboard,proof,public):
    topics=dashboard['data_topics']
    if 'support' in topics:
        support=read('support-data.json')
        return ('Partly ready',f"{support['sponsorships']['summary']['unique_entries']} distinct workbook entries; decisions and fiscal years absent. {support['engagement']['summary']['activities']} provisional engagement activities; unique students and independent attendance not available.")
    if 'programs' in topics:
        count=sum(len(rows) for rows in public['programs'].values())
        return ('Ready' if count else 'Not ready',f'{count} confirmed items; '+KEY['input'])
    gaps=[]
    if 'demographics' in topics:gaps.append(f"{len(proof['school_withheld'])} school and {len(proof['building_withheld'])} school building demographic cells: {KEY['withheld']}")
    if 'map' in topics:gaps.append('Unpublished MAP components; only '+', '.join(map(str,proof['map_years']))+' held')
    if ('directory' in topics or 'demographics' in topics) and proof['absent_preliminary']:gaps.append(f"{len(proof['absent_preliminary'])} raw preliminary enrollment files: {KEY['not_supplied']}")
    return ('Partly ready' if gaps else 'Ready','; '.join(gaps) or 'Applicable reported measures are available; non-tested grades remain distinct.')

def add_table(document,headers,rows):
    table=document.add_table(rows=1,cols=len(headers));table.style='Light Shading Accent 1'
    for cell,text in zip(table.rows[0].cells,headers):cell.text=str(text)
    for row in rows:
        for cell,text in zip(table.add_row().cells,row):cell.text=str(text)
    return table

def generate(output=None):
    config,public,full,missing,requests,templates=sources()
    proof=evidence(full,missing,requests)
    document=Document();section=document.sections[0];section.orientation=WD_ORIENT.LANDSCAPE;section.page_width=Inches(11);section.page_height=Inches(8.5)
    section.top_margin=section.bottom_margin=Inches(.55);section.left_margin=section.right_margin=Inches(.6)
    style=document.styles['Normal'];style.font.name='Arial';style.font.size=Pt(10)
    footer=section.footer.paragraphs[0];footer.add_run('OSCP internal planning · Page ')
    field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');footer._p.append(field)
    document.add_heading('OSCP Dashboard Report',0)
    document.add_paragraph('This local report describes the existing data, dashboard configuration, applicable filters and remaining data requests. It is generated from repository sources; it is not a public dashboard export.')
    document.add_heading('Missing-data key',1)
    add_table(document,['Type','Meaning'],[(KEY['withheld'],'The raw DESE cell is *; no reason is inferred.'),(KEY['not_applicable'],'No tested grades for the measure.'),(KEY['not_supplied'],'Blank value or original raw file is not in the repository.'),(KEY['ready'],'Source data is available for an additional supported view.'),(KEY['input'],'No complete confirmed program input is available.')])
    document.add_heading('OSCP goals mapped to dashboards',1)
    goals=[('Show which schools OSCP sponsors and where','Home; Schools'),('Show who the students are','Students'),('Show how students perform and grow','Learning; Growth'),('Show what OSCP provides beyond oversight','OSCP Sponsorships'),('Be transparent and free of causal claims','Home; Explore Data; About')]
    add_table(document,['Goal','Dashboards'],goals)
    document.add_heading('The four levels',1)
    add_table(document,['Level','Meaning','Count','Colour'],[(r['name'],r['meaning'].format(schools=len(public['schools']),school_buildings=len(public['directory'])),len(public['schools']) if r['id']=='schools' else len(public['directory']) if r['id']=='school-buildings' else 'Comparison' if r['id']=='missouri' else 'Confirmed items only',r['colour']) for r in config['levels']])
    document.add_heading('Readiness at a glance',1)
    add_table(document,['Dashboard','Readiness','Main gap'],[(d['nav_label'],*readiness(d,proof,public)) for d in config['dashboards']])
    document.add_heading('Verified source findings',1)
    document.add_paragraph(f"District demographics: {len(proof['school_withheld'])} of {proof['school_cells']} checked cells are *.")
    add_table(document,['School','Measure','Type'],[(name,metric,KEY['withheld']) for name,metric in proof['school_withheld']])
    document.add_paragraph(f"Building demographics: {len(proof['building_withheld'])} of {proof['building_cells']} checked cells are null; all carry the source * status.")
    add_table(document,['School building','Measure','Type'],[(name,metric,KEY['withheld']) for name,metric in proof['building_withheld']])
    document.add_paragraph('MAP school building rows: '+', '.join(f'{subject}: {count} of {len(public["directory"])}' for subject,count in proof['map_building_rows'].items())+'.')
    unpublished={r['name'] for r in full['assessments'] if r['level']=='Charter' and r['category']=='MSIP Total' and r['subject'] in full['kpi_metrics']['map'] and r['PROFICIENT'] is None and r['ADVANCED'] is None}
    document.add_paragraph('Proficient/Advanced components are * for: '+', '.join(sorted(unpublished))+'. No suppressed component is reconstructed.')
    not_tested=[r['name'] for r in full['growth'] if not r['eligible']]
    document.add_paragraph('Not tested: '+', '.join(sorted(set(not_tested)))+'. Growth eligibility: '+', '.join(f'{s}: {n} of {len(public["directory"])}' for s,n in proof['growth_eligible'].items())+'.')
    tracker=proof['tracker'];document.add_paragraph(f"Sponsorship requests: {tracker['raw']} rows reduce to {tracker['unique']} unique records; {tracker['Amount Requested']} have a requested amount, totalling ${tracker['requested_total']:,.0f}. This is a request log, not confirmed sponsorship.")
    add_table(document,['Field','Unique entries with a value'],[(k,v) for k,v in tracker.items() if k not in ('raw','unique','requested_total')])
    event_text=' '.join(str(r['record'].get('Event Name') or '') for r in requests['records']).casefold()
    document.add_paragraph('Named program checks: '+ '; '.join(f"{name}: {'present' if name.casefold() in event_text else 'not present'}" for name in ('Spelling Bee','Summer Learning Institute','GAINS'))+'.')
    document.add_paragraph('Raw preliminary files absent: '+', '.join(proof['absent_preliminary'])+'.')
    all_filter_ids=[]
    for dashboard in config['dashboards']:
        document.add_page_break();document.add_heading(dashboard['nav_label'],1)
        document.add_paragraph('Goal: '+dashboard['goal']);document.add_paragraph('Purpose: '+dashboard['question'])
        document.add_paragraph('Levels: '+', '.join(next(r['name'] for r in config['levels'] if r['id']==level) for level in dashboard['levels']))
        document.add_heading('What the reader sees',2);document.add_paragraph('KPI tiles: '+(', '.join(dashboard['kpis']) or 'Not applicable')+'. Panels: '+', '.join(dashboard['panels'])+'.')
        document.add_heading('Filters',2)
        rows=[]
        for f in dashboard['filters']:
            all_filter_ids.append(dashboard['id']+'.'+f['id'])
            options=option_labels(f['options_source'],public,full,templates)
            ready=KEY['input'] if dashboard['id']=='sponsorships' and not sum(map(len,public['programs'].values())) else 'Ready for the available source scope; unpublished options remain disabled.'
            rows.append((f['label']+' ['+f['id']+']',f['help'],'; '.join(options),f['options_source'],ready))
        add_table(document,['Filter','What it does','Options','Data behind it','Data ready?'],rows or [('None','This dashboard has no filters.','','','Ready')])
        document.add_heading('Data we have',2)
        document.add_paragraph(f"{len(public['schools'])} sponsored schools; {len(public['directory'])} separately reported school buildings. Demographic history years: {min(full['demographics_explorer']['years'])}–{max(full['demographics_explorer']['years'])}. MAP years: {proof['map_years']}; growth years: {proof['growth_years']}.")
        document.add_heading('What is missing and why',2);document.add_paragraph(readiness(dashboard,proof,public)[1])
        if 'map' in dashboard['data_topics'] or 'growth' in dashboard['data_topics']:document.add_paragraph(KEY['not_supplied']+': earlier requested trend years are absent. The public Learning and Growth dashboards do not imply trends.')
        if 'programs' in dashboard['data_topics']:document.add_paragraph('; '.join(f'{area}: {len(rows)} input rows; {len(public["programs"].get(area,[]))} confirmed rows' for area,rows in templates.items() if area in public['programs']))
        document.add_heading('Data we need',2);document.add_paragraph(f"Role: {ROLES['programs'] if any(t in dashboard['data_topics'] for t in ('programs','support','engagement')) else ROLES['download']}. Priority: high for the gaps above; optional descriptive additions remain lower priority.")
    document.add_page_break();document.add_heading('Consolidated data-request list',1)
    requests_list=[('Raw preliminary school and school building enrollment files from DESE MCDS','download','High'),('MAP school, school building and Missouri data for earlier requested trend years','download','High'),('APR growth supporting data for earlier requested trend years','download','High'),('Headline K–12 or PK–12 definition and source of the unresolved OSCP overview total','leadership','High'),('Physical campus counts, separately defined from school buildings and addresses','leadership','Medium'),('Verify opened and joined years against the approved school list','leadership','Medium'),('Scholarship counts, amounts and the iSCORE per-award versus program-total question','programs','High'),('Event dates, attendance and approved photos','programs','High'),('Partnership reach with a documented overlap rule','programs','High'),('Support/compliance hours and team experience','leadership','Medium'),('Decision status and approved amounts for unique requests, only if funding will be shown','leadership','Medium'),('Public citation line and contact','leadership','Medium'),('Optional school descriptions','programs','Low'),('Optional grade-level enrollment','download','Low')]
    for text,role,priority in requests_list:document.add_paragraph(f'{text} · {ROLES[role]} · {priority}',style='List Number')
    years_needed=sorted(set(range(min(proof['map_years'])-3,min(proof['map_years'])))-set(proof['map_years']))
    document.add_paragraph('Earlier MAP years requested: '+', '.join(map(str,years_needed))+'. Earlier APR years requested: '+', '.join(map(str,sorted(set(years_needed)-set(proof['growth_years']))))+'.')
    bridge=full['three_levels']['bridge'];legacy=(ROOT/'docs/internal/previous-changelog.md').read_text(encoding='utf-8')
    overview_match=re.search(r'unresolved \*\*([\d,]+) overview figure',legacy,re.I)
    unresolved=overview_match.group(1) if overview_match else 'Not available: definition needed'
    scholarship_notes=' '.join(r.get('notes','') for r in templates.get('scholarships',[]));currency=re.search(r'\$[\d,]+',scholarship_notes)
    document.add_paragraph('Unresolved overview total: '+unresolved+'. iSCORE amount requiring definition: '+(currency.group(0) if currency else 'Not available')+'. These are questions, not public metric inputs.')
    document.add_heading('Number reconciliation',1)
    add_table(document,['Value','Population / use'],[(f'{bridge[k]:,}',text) for k,text in [('k12','K–12 preliminary'),('reported_pk','Reported preschool'),('pk12_as_reported','PK–12 as reported; partial preschool coverage'),('race_population','Reported K–12 population for race percentages'),('january_membership','January membership for lunch percentages')]]+[(unresolved,'OSCP overview total; matches no identified DESE series; definition required')])
    document.add_heading('Rules every dashboard follows',1)
    for rule in ('Keep Missouri separate from school totals and school buildings.','Use published counts with compatible denominators; no partial demographic pooling.','MAP pooled results are the explicit published-school exception and carry coverage labels.','Never reconstruct suppressed values or normalize incomplete race categories.','Keep missing values nonnumeric; show level, year, source and reporting coverage.','Show confirmed program inputs only; requests do not establish events or funding.','Use descriptive language, keyboard controls, tables and public source citations.','Keep this report and internal processing outputs outside the deployment bundle.'):
        document.add_paragraph(rule,style='List Bullet')
    output=Path(output) if output else ROOT/'docs/internal/OSCP_Dashboard_Report.docx';output.parent.mkdir(parents=True,exist_ok=True);document.save(output)
    manifest={'dashboard_ids':[d['id'] for d in config['dashboards']],'filters':all_filter_ids,'panels':{d['id']:d['panels'] for d in config['dashboards']},'evidence':proof,'report':str(output.relative_to(ROOT)) if output.is_relative_to(ROOT) else str(output)}
    (ROOT/'qa/report-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Internal report generated:',output)
    return manifest

if __name__=='__main__':generate()
