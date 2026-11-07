"""Extract reproducible public reference facts and cohort-only grade aggregates.

Requires the official downloads from fetch_independent_sources.py. The tracked
snapshot contains school aggregates and citations only, never directory staff.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys
import openpyxl
from pypdf import PdfReader
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from reporting import code


def run():
    baseline=json.loads((ROOT/'dashboard-data.json').read_text(encoding='utf-8'))
    codes={s['DESE LEA'] for s in baseline['schools']}
    keys={(r['lea'],r['building']) for r in baseline['directory']}
    manifest=json.loads((ROOT/'qa/independent/public-downloads.json').read_text(encoding='utf-8'))
    for item in manifest:
        assert hashlib.sha256((ROOT/item['local_path']).read_bytes()).hexdigest()==item['sha256'], item['local_path']
    sources={Path(r['local_path']).name:r for r in manifest}
    grade_records=[];inventories=[]
    for level,filename in [('State','dese_map_2025_state_grade.xlsx'),('Charter','dese_map_2025_district_grade.xlsx'),('Building','dese_map_2025_school_grade.xlsx')]:
        book=openpyxl.load_workbook(ROOT/'data/research'/filename,read_only=True,data_only=True)
        it=iter(book.active.values);headers=next(it);count=0;selected=0
        for rowno,values in enumerate(it,2):
            count+=1;raw=dict(zip(headers,values));lea=code(raw['COUNTY_DISTRICT']);building=code(raw['SCHOOL_CODE'],4) if level=='Building' else None
            if level=='Charter' and lea not in codes or level=='Building' and (lea,building) not in keys:continue
            assert raw['YEAR']==2025
            record={k:(v.strip() if isinstance(v,str) else v) for k,v in raw.items()}
            record.update(lea=lea,building=building,level=level,source_file=filename,source_row=rowno)
            grade_records.append(record);selected+=1
        book.close();inventories.append({'file':filename,'rows':count,'selected_rows':selected,'columns':list(headers),'year':2025})
        print(level,count,'rows read;',selected,'cohort/reference rows retained',flush=True)
    # Extract only the public school-directory fields from the dated PDF.
    pdf=PdfReader(ROOT/'data/research/dese_statistics_directory_2026.pdf')
    active=None;directory={}
    for pageno,page in enumerate(pdf.pages,1):
        text=page.extract_text() or ''
        county=re.search(r'County-District Code:\s*(\d{3})-(\d{3})',text)
        if county:active=''.join(county.groups())
        if active not in codes:continue
        hits=list(re.finditer(r'(?m)^([^\n]+?)\s*\((\d{4})\)\s*',text))
        for i,match in enumerate(hits):
            building=match[2];key=(active,building)
            if key not in keys:continue
            block=text[match.end():hits[i+1].start() if i+1<len(hits) else len(text)]
            grade=re.search(r'Grade Span:\s*([A-Za-z0-9]+\s*-\s*[A-Za-z0-9]+)',block)
            address=re.split(r'Phone:|Grade Span:',block)[0]
            address=' '.join(address.split())
            assert grade, (key,block[:300])
            directory[key]={'lea':active,'building':building,'name':match[1].strip(),'grades':grade[1].replace(' ',''),
                'address_verbatim':address,'as_of':'2026-06-30','source_file':'dese_statistics_directory_2026.pdf','source_page':pageno,
                'source_url':sources['dese_statistics_directory_2026.pdf']['url']}
    assert set(directory)==keys,(keys-set(directory))
    openings=[]
    for filename in ['dese_kansas_city_charters.html','dese_st_louis_charters.html']:
        text=BeautifulSoup((ROOT/'data/research'/filename).read_text(encoding='utf-8'),'html.parser').get_text('\n',strip=True)
        for lea in codes:
            display=lea[:3]+'-'+lea[3:];at=text.find(display)
            if at<0:continue
            opened=re.search(r'Opened:\s*(\d{4}-\d{4})',text[at:at+900])
            if opened:openings.append({'lea':lea,'opened_school_year':opened[1],'source_url':sources[filename]['url'],'scope':'Charter network, not each individual building'})
    assert len(openings)==6
    stats=PdfReader(ROOT/'data/research/dese_statistics_2024_2025.pdf').pages[0].extract_text()
    assert '2024-2025' in stats and all(v in stats for v in ['580,175','276,047','856,222'])
    assert 580175+276047==856222
    profile=PdfReader(ROOT/'data/research/dese_special_education_profile_2024_2025.pdf').pages[2].extract_text(extraction_mode='layout')
    compact=' '.join(profile.split())
    assert re.search(r'Total\s+119,234\s+2,272\s+13\.93%',compact)
    assert 'Incidence rate = Total / K-12 district enrollment' in compact
    # Row location of this full-population racial table is verified from its
    # labelled PDF table, not by reconstructing any suppressed district values.
    assert re.search(r'67\.0%\s+15\.3%\s+9\.0%\s+2\.2%\s+0\.4%\s+0\.4%\s+5\.8%\s+100\.0%',compact)
    snapshot=BeautifulSoup((ROOT/'data/research/dese_snapshot_2024_2025.html').read_text(encoding='utf-8'),'html.parser').get_text(' ',strip=True)
    assert '2024-2025 Public Education Snapshot' in snapshot and '49.3%' in snapshot
    renewal=PdfReader(ROOT/'data/research/dese_atlas_renewal_2026.pdf').pages[4].extract_text()
    assert '2025 Demographics' in renewal and 'English Learners * 14.0% 5.0%' in renewal
    result={'sources':manifest,'grade_inventory':inventories,'grade_records':grade_records,'directory':list(directory.values()),'network_openings':openings,
        'official_state':{
            'enrollment':{'value':856222,'year':'2024–25','source_url':sources['dese_statistics_2024_2025.pdf']['url'],'source_page':1,'formula':'580175 K–8 + 276047 grades 9–12','population':'Fall K–12 enrollment'},
            'black':{'value':15.3,'year':'2024–25','numerator':None,'denominator':None,'method':'official_published_percent','source_url':sources['dese_special_education_profile_2024_2025.pdf']['url'],'source_page':3,'table':'Percent of Students by Race/Ethnicity: Total Enrollment (K–12)','population':'Statewide K–12; published rounded percentage, underlying race count not printed'},
            'frl':{'value':49.3,'year':'2024–25','numerator':None,'denominator':None,'method':'official_published_percent','source_url':sources['dese_snapshot_2024_2025.html']['url'],'table':'Who we serve','population':'DESE published FRL statewide percentage; count and exact denominator not printed on the snapshot. No implied count or percentage-point gap is calculated.'},
            'iep':{'value':13.93,'year':'2024–25','numerator':119234,'denominator':None,'method':'official_published_percent','source_url':sources['dese_special_education_profile_2024_2025.pdf']['url'],'source_page':3,'table':'Child Count (5k–21): Total incidence rate','population':'December 1 school-age child count / K–12 district enrollment. Profile prints the formula and rounded rate but not the denominator count; no denominator is reverse-engineered.'},
            'el':{'value':5.0,'year':'2025','numerator':None,'denominator':None,'method':'official_published_percent','source_url':sources['dese_atlas_renewal_2026.pdf']['url'],'source_page':5,'table':'2025 Demographics: Missouri','population':'Published statewide contextual EL percentage; underlying count and exact denominator are not printed.'},
        },
        'source_conflicts':[
            {'keys':['048914/1910','048914/1920'],'detail':'DESE Kansas City charter webpage reverses the Armour IMS/IHS codes; dated directory PDF, cohort workbook and APR agree on IMS=1910 and IHS=1920. Those verified data identifiers are preserved.','url':sources['dese_kansas_city_charters.html']['url']},
            {'keys':['115911/6956'],'detail':'DESE St. Louis charter webpage lists 6966 for City Garden EAEC; dated directory PDF, cohort, demographic, MAP and APR sources use 6956. Do not substitute the webpage code.','url':sources['dese_st_louis_charters.html']['url']},
            {'keys':['048925/6985'],'detail':'The dated directory and DESE charter webpage identify 2800 E. Linwood Boulevard, replacing the undated workbook address 6409 Agnes Ave. The webpage building grade label K–4 conflicts with PDF PK–05; dated directory grades are shown separately from 2025 APR grades.','url':sources['dese_kansas_city_charters.html']['url']},
            {'keys':['048914/1920'],'detail':'Dated PDF retains ZIP 64113-1205 for IHS while the charter webpage uses 64111 for Armour. Street-address sharing is recognized without resolving this ZIP discrepancy.','url':sources['dese_kansas_city_charters.html']['url']},
            {'keys':['115911/6956'],'detail':'Dated PDF repeats 1618 Tower Grove as a second address for the Folsom building. Primary Folsom address is corroborated by the charter page; secondary line is retained as a source conflict, not a second campus.','url':sources['dese_st_louis_charters.html']['url']}],
        'rejected_sources':[{'url':sources['dese_snapshot_2024_2025.html']['url'],'claim':'896,167 labelled K–12 students','reason':'Conflicts with explicit 2024–25 statistics fall K–12 total 856,222; snapshot enrollment is not used as the K–12 denominator.'}]}
    for field,value,label in [('white',67.0,'White'),('hispanic',9.0,'Hispanic'),('multiracial',5.8,'Multiracial'),('asian',2.2,'Asian'),('american_indian',0.4,'American Indian'),('pacific_islander',0.4,'Pacific Islander')]:
        result['official_state'][field]={**result['official_state']['black'],'value':value,'population':f'Statewide K–12 {label}; published rounded percentage, underlying race count not printed'}
    result['source_conflicts'].append({'keys':['048922/3935','048922/6975','048914/6941'],'detail':'Charter webpage grade spans differ from dated PDF: Frontier 3935 webpage 4–8 vs PDF 06–08; Frontier 6975 webpage PK–3 vs PDF PK–05; Académie Lafayette 6941 webpage K–5 vs PDF PK–05. Dated PDF spans control the displayed directory.','url':sources['dese_kansas_city_charters.html']['url']})
    result['building_history']=[
        {'lea':'048914','building':'1920','date':'2020–21','scope':'High-school program first instructional year; not building construction or network opening','source_url':sources['academie_official_schools.html']['url']},
        {'lea':'115911','building':'6956','date':'January 2022','scope':'New Folsom facility opening; not network founding','source_url':sources['city_garden_official_facility_2022.html']['url']}]
    school_text=BeautifulSoup((ROOT/'data/research/academie_official_schools.html').read_text(encoding='utf-8'),'html.parser').get_text(' ',strip=True)
    facility_text=BeautifulSoup((ROOT/'data/research/city_garden_official_facility_2022.html').read_text(encoding='utf-8'),'html.parser').get_text(' ',strip=True)
    assert 'In its first year (2020–21)' in school_text
    assert 'January of this year' in facility_text and '2022' in facility_text
    out=ROOT/'reference-data';out.mkdir(exist_ok=True)
    (out/'dese-2025-independent.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
    print('Saved independently extracted reference snapshot; 14 dated directory records and 6 network opening years.')


if __name__=='__main__':run()
