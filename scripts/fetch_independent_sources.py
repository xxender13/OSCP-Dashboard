"""Download official public DESE sources through its public-application entry.

No credentials or protected/student-level reports are used. Originals in the
organized source folders are never replaced. Provenance includes URL and hash.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT/'data/research'
QA = ROOT/'qa/independent'


def run():
    DEST.mkdir(exist_ok=True);QA.mkdir(exist_ok=True)
    session = requests.Session()
    page = session.get('https://apps.dese.mo.gov/MCDS/Home.aspx',timeout=45);page.raise_for_status()
    if '/WebLogin/' in page.url:
        soup = BeautifulSoup(page.text,'html.parser')
        fields = {tag['name']:tag.get('value','') for tag in soup.select('input[type=hidden][name]')}
        fields['ctl00$ContentPlaceHolder1$btnPublic']='View Public Applications'
        page = session.post(page.url,data=fields,timeout=45);page.raise_for_status()
    assert '/MCDS/' in page.url, 'Public entry did not reach MCDS'
    students=session.get('https://apps.dese.mo.gov/MCDS/home.aspx?categoryid=2&view=2',timeout=45);students.raise_for_status()
    links=[urljoin(page.url,t['href']) for markup in (page.text,students.text) for t in BeautifulSoup(markup,'html.parser').select('a[href]')]
    specs=[
        ('2025 State Content Area and Grade All and Disag.xlsx','dese_map_2025_state_grade.xlsx'),
        ('2025 District_content area and grade all and disag.xlsx','dese_map_2025_district_grade.xlsx'),
        ('2025 School_content Area and Grade All and Disag.xlsx','dese_map_2025_school_grade.xlsx'),
        ('Missouri School Statistics 24-25.pdf','dese_statistics_2024_2025.pdf'),
        ('2026_Missouri_School_Statistics_and_Directory.pdf','dese_statistics_directory_2026.pdf'),
    ]
    resources=[]
    for title,name in specs:
        matches=[u for u in links if u.endswith(title)]
        assert len(set(matches))==1, (title,matches)
        resources.append((matches[0],name))
    resources += [('https://dese.mo.gov/sites/g/files/zuston521/files/media/pdf/2026/05/OSE_State-Profile_2024-25.pdf','dese_special_education_profile_2024_2025.pdf'),
        ('https://dese.mo.gov/quality-schools/charter-schools/kansas-city','dese_kansas_city_charters.html'),
        ('https://dese.mo.gov/quality-schools/charter-schools/st-louis','dese_st_louis_charters.html'),
        ('https://dese.mo.gov/communications/snapshot','dese_snapshot_2024_2025.html'),
        ('https://dese.mo.gov/sites/g/files/zuston521/files/media/pdf/2026/03/Atlas%20Public%20Schools%20_%20Renewal%20SY26%20FINAL.pdf','dese_atlas_renewal_2026.pdf'),
        ('https://academielafayette.org/our-schools/','academie_official_schools.html'),
        ('https://citygardenschool.org/aug-2022-community-newsletter','city_garden_official_facility_2022.html')]
    def download(resource):
        url,name=resource
        response=requests.get(url,cookies=session.cookies.get_dict(),timeout=120);response.raise_for_status()
        if name.endswith('.xlsx'):assert response.content.startswith(b'PK'), f'Not an Excel export: {name}'
        if name.endswith('.pdf'):assert response.content.startswith(b'%PDF'), f'Not a PDF: {name}'
        path=DEST/name;path.write_bytes(response.content)
        result={'url':url,'local_path':path.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(response.content).hexdigest(),
            'bytes':len(response.content),'retrieved_at':datetime.now(timezone.utc).isoformat(timespec='seconds')}
        print(name,len(response.content),flush=True)
        return result
    with ThreadPoolExecutor(max_workers=4) as pool:
        manifest=list(pool.map(download,resources))
    (QA/'public-downloads.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print('Downloaded',len(manifest),'official public resources; original 11 workbooks unchanged.')


if __name__=='__main__':run()
