"""Small main-page contract and lazy analytical packets; original KPIs preserved."""
import json,csv,shutil,warnings
from pathlib import Path
from inputs import load_inputs
from status_audit import audit,annotate,validate_nulls,raw_status,LABELS

def check_preliminary(root,payload):
    import openpyxl
    files=['District-Charter Preliminary Enrollment.xlsx','Building Preliminary Enrollment.xlsx']
    paths=[root/'data/enrollment_demographics'/f for f in files]
    if not all(p.exists() for p in paths):
        warnings.warn('raw preliminary enrollment files missing; add them (owner: Harshil, source: DESE MCDS)')
        return 'not_supplied'
    # Explicit column aliases. Unknown DESE layouts fail rather than being guessed.
    aliases={'lea':['DESE LEA','COUNTY_DISTRICT_CODE','CTYDIST'],'building':['Building code','SCHOOL_CODE','SCHNUM'],'k12':['K-12','K–12','ENROLLMENT_GRADES_K_12'],'pk':['PK','ENROLLMENT_PK']}
    for path,level in zip(paths,['School','Building']):
        w=openpyxl.load_workbook(path,read_only=True,data_only=True);it=iter(w.active.values);headers=list(next(it));cols={}
        for field in ['lea','k12','pk']+(['building'] if level=='Building' else []):
            match=[headers.index(a) for a in aliases[field] if a in headers]
            if len(match)!=1:raise ValueError(f'{path.name}: supply an unambiguous {field} column; supported headers: {aliases[field]}')
            cols[field]=match[0]
        actual={};scoped=payload['schools'] if level=='School' else payload['buildings']
        for row in it:
            if not row[cols['lea']]:continue
            lea=str(row[cols['lea']]).zfill(6);key=(lea,str(row[cols['building']]).zfill(4)) if level=='Building' else lea
            if key in actual:raise ValueError(f'{path.name}: duplicate {key}')
            actual[key]=(row[cols['k12']],row[cols['pk']])
        for s in scoped:
            key=(s['DESE LEA'],str(s['Building code']).zfill(4)) if level=='Building' else s['DESE LEA']
            expected=(s['K–12 prelim'],s['PK prelim']) if level=='Building' else (s['2025–26 K–12'],s['2025–26 PK'])
            if actual.get(key)!=expected:raise ValueError(f'{path.name}: preliminary enrollment disagrees with master for {key}: {actual.get(key)} != {expected}')
        w.close()
    return 'reported'

def extend(payload,tables,events,root):
    cells=audit(payload,tables,root)
    pending=load_inputs(root/'data/inputs',payload['kpi_metrics']['students']['value'],root/'assets/events')
    prelim=check_preliminary(root,payload)
    pk=sum(s['2025–26 PK'] for s in payload['schools'] if s['2025–26 PK'] is not None)
    bridge={'k12':3953,'reported_pk':pk,'pk12_as_reported':3953+pk,'race_population':3913,'january_membership':3816,'level':'School','year':'2025–26 prelim','raw_preliminary_status':prelim,'limitation':'The Biome PK is not in the supplied source. PK–12 as reported is not a verified complete PK–12 census.'}
    assert (bridge['reported_pk'],bridge['pk12_as_reported'])==(197,4150)
    profiles=[];cities=[]
    for school in payload['schools']:
        buildings=[r for r in payload['directory'] if r['lea']==school['DESE LEA']];assert len({b['city'] for b in buildings})==1
        profiles.append({'lea':school['DESE LEA'],'city':buildings[0]['city'],'joined':school['SLU sponsor since'],'years_with_slu_as_of_2025':2025-school['SLU sponsor since'],'grades':sorted({b['grades'] for b in buildings}),'building_count':len(buildings)})
    for city in sorted({p['city'] for p in profiles}):
        leas={p['lea'] for p in profiles if p['city']==city}
        cities.append({'city':city,'schools':len(leas),'buildings':sum(p['building_count'] for p in profiles if p['city']==city),'enrollment':sum(s['2025–26 K–12'] for s in payload['schools'] if s['DESE LEA'] in leas),'level':'School','year':'2025–26 prelim'})
    demographics=[]
    categories={'Black':'ENROLLMENT_BLACK_PCT','Hispanic':'ENROLLMENT_HISPANIC_PCT','White':'ENROLLMENT_WHITE_PCT','Multiracial':'ENROLLMENT_MULTIRACIAL_PCT','Asian':'ENROLLMENT_ASIAN_PCT','American Indian':'ENROLLMENT_INDIAN_PCT','Pacific Islander':'ENROLLMENT_PACIFIC_ISLANDER_PCT'}
    for level,file in [('School','dese_district_demographics_1991_2025.xlsx'),('Building','dese_building_demographics_2006_2025.xlsx')]:
        for raw in tables[file]['Sheet1']:
            lea=str(raw['COUNTY_DISTRICT_CODE']).zfill(6);building=str(raw['SCHOOL_CODE']).zfill(4) if level=='Building' else None
            if raw['YEAR']!=2025 or lea not in {s['DESE LEA'] for s in payload['schools']} or building and (lea,building) not in {(b['lea'],b['building']) for b in payload['directory']}:continue
            race=[{'label':k,'value':raw[v],'status':raw_status(raw,v)} for k,v in categories.items() if k in ('Black','Hispanic','White','Multiracial') or raw[v] is not None or raw_status(raw,v)=='withheld']
            demographics.append({'lea':lea,'building':building,'name':raw.get('SCHOOL_NAME',raw['DISTRICT_NAME']),'level':level,'year':2025,'race':race,'source':file,'source_row':raw['_row']})
    map_rows=[r.copy() for r in payload['assessments'] if r['category']=='MSIP Total' and r['group']=='Total' and r['subject'] in ('Eng. Language Arts','Mathematics')]
    map_coverage={}
    for subject in ('Eng. Language Arts','Mathematics'):
        rows=[r for r in map_rows if r['level']=='Charter' and r['subject']==subject];known=sum(r['REPORTABLE'] for r in rows);used=payload['kpi_metrics']['map'][subject]['denominator']
        map_coverage[subject]={'reported_tested':used,'all_tested':known,'share':100*used/known}
    logs=[]
    # Explicit tracker aliases, not fuzzy inference of unrelated organizations.
    names={s['School'].casefold() for s in payload['schools']}|{'city garden','the biome','academie lafayette','genesis','frontier'}
    for event in events:
        raw=event['record'];org=raw.get('Organization Name') or '';funding=raw.get('Funding Source / Budget Line') or ''
        cat='placeholder' if org.casefold().startswith(('misc','tot')) else 'school budget line' if org.casefold() in names and funding.casefold()=='charter' else 'community request'
        logs.append({'organization':'Caring for Kids' if org=='Caring for Kids Network' else org,'source_organization':org,'category':cat,'requested':raw.get('Amount Requested'),'decision':raw.get('Decision Status'),'approved':raw.get('Amount Approved/ Provided'),'origins':event['origins'],'level':'School','year':'Not in supplied source'})
    tracker={'records':logs,'distinct_records':len(logs),'raw_rows':sum(len(e['origins']) for e in events),'with_decision':sum(bool(r['decision']) for r in logs),'with_approved_amount':sum(r['approved'] is not None for r in logs)}
    assert (tracker['distinct_records'],tracker['raw_rows'],tracker['with_decision'],tracker['with_approved_amount'])==(26,65,0,0)
    # No private notes, invitations, contacts or proposed numeric funding are published.
    public_inputs={k:{**v,'confirmed':[{f:a for f,a in r.items() if f!='notes'} for r in v['confirmed']],'pending':[{f:r.get(f) for f in ('program','award_year','event_name','category','program_name','measure','school','status','owner')} for r in v['pending']]} for k,v in pending.items() if k in ('scholarships','events','partnership_reach','oscp_operations','campus_counts')}
    public_inputs.update({k:pending[k] for k in ('total_reach','scholarship_totals')})
    payload['three_levels']={'bridge':bridge,'profiles':profiles,'cities':cities,'demographics':demographics,'map_rows':map_rows,'map_coverage':map_coverage,'inputs':public_inputs,'tracker':tracker,'coverage':cells}
    slides=[]
    def slide(visual,headline,numbers,level='School',year='2025',source='DESE source files',takeaway='Read the stated level, period and coverage before comparing.'):
        if takeaway.startswith('Read the stated') and isinstance(numbers,dict):takeaway=' · '.join(f'{k}: {round(v,2) if isinstance(v,float) else v}' for k,v in numbers.items() if isinstance(v,(int,float)))
        slides.append(dict(visual=visual,headline=headline,numbers=numbers,level=level,year=year,source=source,takeaway=takeaway,question='What do these records show for this population and reporting period?'))
    slide('fiveFacts','Five things to know',{'K12':3953,'Schools':6,'Buildings':14,'addresses':12,'FRL':2330,'January membership':3816,'ELA Target':7,'Math Target':5,'eligible':13},year='2025 / 2025–26 prelim')
    for i,name in enumerate(['Schools','Students','Learning','OSCP programs']):slide('objective'+str(i),name,({'Schools':6,'Buildings':14} if i==0 else {'K12':3953,'FRL':2330,'membership':3816} if i==1 else {'ELA':823/1753*100,'Math':877/1765*100} if i==2 else {'proposed awards':20}),year='2025 / 2025–26 prelim' if i<3 else '2026–27 proposed')
    for s,p in zip(payload['schools'],profiles):slide('profile'+p['lea'],s['School'],{'opened':s['Opened school year'],'grades':p['grades'],'joined':p['joined'],'years with SLU as of 2025':p['years_with_slu_as_of_2025'],'Buildings':p['building_count'],'preliminary K12':s['2025–26 K–12'],'FRL':s['FRL %']},year='2025 / 2025–26 prelim',source='Cohort Master and dated directory')
    slide('cities','Kansas City and St. Louis',cities,year='2025–26 prelim',source='Cohort Master and directory')
    slide('bridge','Enrollment populations',bridge,year='2025 / 2025–26 prelim',source='Cohort Master; raw preliminary files missing')
    for r in [r for r in demographics if r['level']=='School']:
        slide('composition','Who are the students? '+r['name'],{c['label']:{'value':c['value'],'status':c['status']} for c in r['race']},source=r['source'],takeaway='Each category keeps its published value or withheld marker; this is not an exhaustive composition.')
        slides[-1]['filter_name']=r['name']
    slide('mapELA','English language arts proficiency',{'P+A':823,'reportable':1753,'pooled_percent':100*823/1753,'Missouri_percent':next(r['value'] for r in payload['state_map'] if r['subject']=='Eng. Language Arts' and r['group']=='Total'),'all_tested':2002},source='Raw district / state MAP')
    slide('mapMath','Mathematics proficiency',{'P+A':877,'reportable':1765,'pooled_percent':100*877/1765,'Missouri_percent':193897/454818*100,'all_tested':2014},source='Raw district / state MAP')
    for s in slides:
        if s['visual'] in ('mapELA','mapMath'):
            subject='Eng. Language Arts' if s['visual']=='mapELA' else 'Mathematics'
            s['numbers']['School_rows']=[{'name':r['name'],'PA_PCT':r['PA_PCT'],'status':r['status'],'joined_SLU':next(p['joined'] for p in profiles if p['lea']==r['lea'])} for r in map_rows if r['level']=='Charter' and r['subject']==subject]
    slide('growthVisual','Growth Target attainment',{'ELA Target':7,'Math Target':5,'eligible Buildings':13,'Missouri ELA':498/1993*100,'Missouri Math':492/1994*100},level='Building',source='APR Building supporting')
    for key in ('scholarships','events','partnership_reach','oscp_operations'):
        values={'confirmed_rows':[{k:v for k,v in r.items() if k not in ('notes','public')} for r in public_inputs[key]['confirmed']]} if pending[key]['confirmed'] else {'status':'Awaiting confirmation'}
        if key=='scholarships' and not pending[key]['confirmed']:values.update(proposed_awards=20,iSCORE_question='$2,500 per award or program total? Awaiting Candi.')
        slide('program-'+key,key.replace('_',' ').title(),values,year='Awaiting confirmation',source='data/inputs/'+key+'.csv',takeaway='Only complete confirmed inputs enter totals. Pending values are status labels, never zero.')
    slide('quality','Data quality',{'School withheld':5,'School checked':42,'Building withheld':10,'Building checked':98,'workbooks':11,'worksheets':21},source='Raw-source audit')
    payload['three_levels']['slides']=slides
    text=['# Slide outline','','Generated from the same slide specifications used by Presentation view. Counts below are source/audit counts; pending program totals stay nonnumeric.']
    for i,s in enumerate(slides,1):text += [f"\n## {i}. {s['headline']}",s['takeaway'],f"Level: {s['level']} · Year: {s['year']} · Source: {s['source']}",'Exact values: `'+json.dumps(s['numbers'],ensure_ascii=False,default=str)+'`']
    (root/'docs/internal/slide-outline.md').write_text('\n'.join(text)+'\n',encoding='utf-8')
    annotate(payload);validate_nulls(payload)
    null_fields=[]
    def visit(v,path=''):
        if isinstance(v,list):
            for i,x in enumerate(v):visit(x,f'{path}/{i}')
        elif isinstance(v,dict):
            for k,x in v.items():
                if x is None:null_fields.append({'path':path+'/'+k,'status':v['statuses'][k]})
                elif k!='statuses':visit(x,path+'/'+k)
    visit(payload)
    audit_file=root/'qa/missing-data-audit.json';machine=json.loads(audit_file.read_text(encoding='utf-8'));machine['null_fields']=null_fields;audit_file.write_text(json.dumps(machine,indent=2),encoding='utf-8')

def package(payload,root):
    base={k:payload[k] for k in ('generated_at','dashboard_year','schools','buildings','directory','directory_summary','kpi_metrics','benchmarks','state_map','growth','sources','data_inventory','status_vocabulary','official_state_context')}
    base['three_levels']=dict(payload['three_levels']);tracker=base['three_levels'].pop('tracker');base['three_levels']['tracker_summary']={k:v for k,v in tracker.items() if k!='records'}
    base['public_sources']=payload['public_source_verification']['sources']
    packets={'explorer-core.json':{k:v for k,v in payload.items() if k not in ('assessments','matched_map','demographics_explorer','three_levels')},'explorer-map.json':{k:payload[k] for k in ('assessments','matched_map')},'explorer-demographics.json':{'demographics_explorer':payload['demographics_explorer']},'explorer-requests.json':{'tracker':tracker}}
    base['explorer_files']=list(packets)
    annotate(base);validate_nulls(base)
    encoded=json.dumps(base,ensure_ascii=False,separators=(',',':')).encode();assert len(encoded)<400000,f'summary.json too large: {len(encoded)}'
    (root/'summary.json').write_bytes(encoded)
    for name,packet in packets.items():(root/name).write_text(json.dumps(packet,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    for r in payload['three_levels']['inputs']['events']['confirmed']:
        if r.get('photo_available'):
            source=root/r['photo_path'];dest=root/'dist'/r['photo_path'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
    return base
