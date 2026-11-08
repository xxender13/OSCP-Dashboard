"""Read supplied workbooks, validate aggregates and package a static public dashboard."""
from pathlib import Path
from datetime import date, datetime, timezone
import json
import math
import shutil
import openpyxl

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
MASTER = 'oscp_dese_cohort_master_2025_2026.xlsx'
GALA = 'oscp_gala_sponsorship_tracker.xlsx'
MAP_DISTRICT = 'dese_map_2025_district_content_area.xlsx'
MAP_SCHOOL = 'dese_map_2025_school_content_area.xlsx'
MAP_STATE = 'dese_map_2025_state_content_area.xlsx'
DEMO_DISTRICT = 'dese_district_demographics_1991_2025.xlsx'
DEMO_BUILDING = 'dese_building_demographics_2006_2025.xlsx'
DIRECTORY = 'dese_school_building_directory_undated.xlsx'
APR_BUILDING = 'dese_apr_2025_building_supporting.xlsx'
APR_SUMMARY = 'dese_apr_2025_building_summary.xlsx'
APR_DISTRICT = 'dese_apr_2025_district_supporting.xlsx'
SOURCE_PATHS = {
    MASTER: DATA / 'master' / MASTER,
    GALA: DATA / 'sponsorships' / GALA,
    MAP_DISTRICT: DATA / 'assessments' / MAP_DISTRICT,
    MAP_SCHOOL: DATA / 'assessments' / MAP_SCHOOL,
    MAP_STATE: DATA / 'assessments' / MAP_STATE,
    DEMO_DISTRICT: DATA / 'enrollment_demographics' / DEMO_DISTRICT,
    DEMO_BUILDING: DATA / 'enrollment_demographics' / DEMO_BUILDING,
    DIRECTORY: DATA / 'enrollment_demographics' / DIRECTORY,
    APR_BUILDING: DATA / 'accountability' / APR_BUILDING,
    APR_SUMMARY: DATA / 'accountability' / APR_SUMMARY,
    APR_DISTRICT: DATA / 'accountability' / APR_DISTRICT,
}
ENROLL = '2025–26 K–12'
CODES = {'048914', '115926', '115911', '048922', '048905', '048925'}


def clean(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()[:10]
    if value is None or (isinstance(value, float) and not math.isfinite(value)):
        return None
    if isinstance(value, str):
        value = ' '.join(value.split())
        if value.upper() in {'', '*', 'NA', 'N/A', 'NULL', 'NONE'}:
            return None
    return value


def numeric(value):
    value = clean(value)
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def code(value, width=6):
    return str(value).strip().zfill(width)


def read_workbooks():
    """Inspect every sheet, header and nonempty row; retain source row numbers locally."""
    inventory, tables = [], {}
    for filename, path in sorted(SOURCE_PATHS.items()):
        workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
        tables[path.name] = {}
        for sheet in workbook:
            iterator = iter(sheet.values)
            header_row = 4 if filename == DIRECTORY else 1
            for _ in range(header_row - 1):
                next(iterator, ())
            headers = [str(v).strip() if v is not None else '' for v in next(iterator, ())]
            records = []
            for row_number, values in enumerate(iterator, header_row + 1):
                if any(clean(v) is not None for v in values):
                    from reporting import missing_reason
                    records.append({'_row': row_number, **{k: clean(v) for k, v in zip(headers, values) if k},
                        '_missingness': {k: missing_reason(v) for k,v in zip(headers,values) if k and clean(v) is None}})
            tables[path.name][sheet.title] = records
            inventory.append({'file': path.name, 'sheet': sheet.title, 'columns': headers, 'nonempty_rows': len(records)})
        workbook.close()
    return tables, inventory


def build():
    tables, inventory = read_workbooks()
    master = tables[MASTER]
    schools = [{k: v for k, v in r.items() if not k.startswith('_')} for r in master['Cohort Master'] if r.get('DESE LEA')]
    assert len(schools) == 6 and {code(s['DESE LEA']) for s in schools} == CODES, 'School codes do not match the six-school cohort'
    assert len({s['DESE LEA'] for s in schools}) == len(schools), 'Duplicate school'
    checks, exclusions = [], []
    raw_district = tables[MAP_DISTRICT]['Sheet1']
    raw_building = tables[MAP_SCHOOL]['Sheet1']
    map_checks = 0
    for school in schools:
        lea = code(school['DESE LEA'])
        school['DESE LEA'] = lea
        school['source_row'] = next(r['_row'] for r in master['Cohort Master'] if code(r.get('DESE LEA')) == lea)
        buildings = [r for r in master['Building Cohort'] if code(r['DESE LEA']) == lea]
        assert len({code(r['Building code'], 4) for r in buildings}) == len(buildings), 'Duplicate building code within LEA'
        assert len(buildings) == school['DESE buildings'], 'Building record mismatch'
        assert all(numeric(r.get('K–12 prelim')) is not None for r in buildings), 'Incomplete enrollment reconciliation'
        assert sum(r['K–12 prelim'] for r in buildings) == school[ENROLL], 'Enrollment does not reconcile'
        checks.append(f"{school['School']}: preliminary enrollment reconciles across {len(buildings)} DESE building records.")
        for key, value in school.items():
            if '%' in key and value is not None:
                assert numeric(value) is not None and 0 <= value <= 100, f'Invalid percentage: {key}'
        assert numeric(school[ENROLL]) is not None and school[ENROLL] >= 0
        assert str(school['Demographics year']) == '2025' and str(school['MAP year']) == '2025'
        assert school['Enrollment period'] == '2025–26 preliminary'
        for record in [r for r in master['MAP 2025'] if code(r['DESE LEA']) == lea]:
            source = raw_district if record['Level'] == 'Charter' else raw_building
            matches = [r for r in source if code(r['COUNTY_DISTRICT']) == lea
                       and str(r['TYPE']).strip() == 'Total' and str(r['CATEGORY']).strip() == 'MSIP Total'
                       and r['CONTENT_AREA'] == record['Subject'] and r['YEAR'] == 2025
                       and (record['Level'] == 'Charter' or code(r['SCHOOL_CODE'], 4) == code(record['Building code'], 4))]
            if not matches and all(record.get(k) is None for k in ('Reportable', 'Proficient count', 'Advanced count', 'Proficient+Advanced %')):
                exclusions.append(f"{school['School']} building {record['Building code']} {record['Subject']}: no matching raw Total record; master has no values. Excluded.")
                continue
            assert len(matches) == 1, f'MAP source match failed: {lea} {record}'
            raw = matches[0]
            components = [numeric(raw[k]) for k in ('PROFICIENT', 'ADVANCED', 'REPORTABLE')]
            expected = round(100 * (components[0] + components[1]) / components[2], 2) if all(v is not None for v in components) and components[2] > 0 else None
            actual = numeric(record['Proficient+Advanced %'])
            assert actual == expected, f'MAP value mismatch for {lea}'
            if record['Level'] == 'Charter':
                field = 'MAP ELA P+A %' if record['Subject'] == 'Eng. Language Arts' else 'MAP Math P+A %'
                assert school[field] == expected, 'Master MAP mismatch'
            map_checks += 1
        for key in ('EL %', 'FRL %', 'IEP incidence %', 'MAP ELA P+A %', 'MAP Math P+A %'):
            if school.get(key) is None:
                exclusions.append(f"{school['School']} — {key}: unavailable/suppressed; excluded from charts.")

    events, signatures, duplicates = [], {}, []
    for sheet, rows in tables[GALA].items():
        for row in rows:
            if not any(row.get(k) for k in ('Organization Name', 'Event Name', 'Event Date')):
                continue
            record = {k: v for k, v in row.items() if not k.startswith('_')}
            signature = json.dumps({k: v.casefold() if isinstance(v, str) else v for k, v in record.items() if v is not None}, sort_keys=True)
            origin = {'sheet': sheet, 'row': row['_row']}
            if signature in signatures:
                event = events[signatures[signature]]
                event['origins'].append(origin)
                duplicates.append({'kept': event['origins'][0], 'duplicate': origin, 'reason': 'Identical normalized populated business fields; no additional fiscal-year attribution'})
            else:
                signatures[signature] = len(events)
                events.append({'record': record, 'origins': [origin]})
    confirmed = []
    for event in events:
        r = event['record']
        status = str(r.get('Decision Status') or '').strip().casefold()
        if status in {'approved', 'completed', 'provided'} and r.get('Event Name') and r.get('Event Date') and r.get('Fiscal Year'):
            confirmed.append({k: r.get(k) for k in ('Organization Name', 'Event Name', 'Event Date', 'Fiscal Year', 'Decision Status', 'Amount Approved/ Provided')})
    assert not confirmed, 'Confirmed event data now exists: review and implement public event presentation before release'
    metrics = [{'id': ENROLL, 'label': 'K–12 enrollment', 'unit': 'students', 'period': '2025–26 preliminary'},
        *[{'id': k, 'label': label, 'unit': '%', 'period': '2025'} for k, label in [
            ('FRL %', 'Free / reduced-price lunch'), ('EL %', 'English learners'),
            ('IEP incidence %', 'Special education · IEP incidence'),
            ('MAP ELA P+A %', 'MAP ELA · Proficient + Advanced'), ('MAP Math P+A %', 'MAP Math · Proficient + Advanced'),
            ('Black %', 'Race/ethnicity · Black'), ('Hispanic %', 'Race/ethnicity · Hispanic'),
            ('Multiracial %', 'Race/ethnicity · Multiracial'), ('White %', 'Race/ethnicity · White')]]]
    metrics = [m for m in metrics if any(numeric(s.get(m['id'])) is not None for s in schools)]
    public_buildings = [{k: v for k, v in row.items() if not k.startswith('_')} | {'source_row': row['_row']} for row in master['Building Cohort']]
    public_history = [{k: v for k, v in row.items() if not k.startswith('_')} | {'source_row': row['_row']} for row in master['Historical Demographics']]
    for row in public_buildings + public_history:
        row['DESE LEA'] = code(row['DESE LEA'])
        assert row['DESE LEA'] in CODES
        for key, value in row.items():
            if '%' in key and value is not None:
                assert numeric(value) is not None and 0 <= value <= 100
            if ('enrollment' in key or 'prelim' in key) and numeric(value) is not None:
                assert value >= 0
    assert len({(r['DESE LEA'], r['Year']) for r in public_history}) == len(public_history), 'Duplicate historical school-year'
    building_keys = {(r['DESE LEA'], code(r['Building code'], 4)) for r in public_buildings}
    assessment, assessment_keys = [], set()
    for filename, level in [(MAP_DISTRICT, 'Charter'), (MAP_SCHOOL, 'Building')]:
        for row in tables[filename]['Sheet1']:
            lea, building = code(row['COUNTY_DISTRICT']), code(row['SCHOOL_CODE'], 4)
            if lea not in CODES or (level == 'Building' and (lea, building) not in building_keys):
                continue
            key = (lea, level, building, row['YEAR'], row['CATEGORY'], row['TYPE'], row['CONTENT_AREA'], row['GRADE_LEVEL'])
            assert key not in assessment_keys, 'Duplicate assessment slice'
            assessment_keys.add(key)
            record = {'lea': lea, 'level': level, 'building': building if level == 'Building' else None,
                'name': row['SCHOOL_NAME'] if level == 'Building' else next(s['School'] for s in schools if s['DESE LEA'] == lea),
                'year': row['YEAR'], 'category': row['CATEGORY'], 'group': row['TYPE'], 'subject': row['CONTENT_AREA'],
                'source_file': filename, 'source_row': row['_row']}
            for field in ('ACCOUNTABLE', 'REPORTABLE', 'LEVEL_NOT_DETERMINED', 'BELOW_BASIC', 'BASIC', 'PROFICIENT', 'ADVANCED',
                          'LEVEL_NOT_DETERMINED_PCT', 'BELOW_BASIC_PCT', 'BASIC_PCT', 'PROFICIENT_PCT', 'ADVANCED_PCT'):
                value = numeric(row[field])
                assert value is None or (0 <= value <= 100 if field.endswith('_PCT') else value >= 0)
                record[field] = value
            p, a, n = (record[f] for f in ('PROFICIENT', 'ADVANCED', 'REPORTABLE'))
            record['PA_PCT'] = round(100 * (p + a) / n, 2) if all(v is not None for v in (p, a, n)) and n > 0 else None
            record['grade_scope'] = row['GRADE_LEVEL'] or 'All tested grades in this reporting unit'
            record['missingness'] = {k: v for k,v in row['_missingness'].items() if k in record}
            if record['PA_PCT'] is None:
                record['missingness']['PA_PCT'] = {'reason': 'unavailable_components', 'detail': 'Combined proficiency requires published Proficient, Advanced and positive Reportable counts. No suppressed component is reconstructed.'}
            assert record['PA_PCT'] is None or 0 <= record['PA_PCT'] <= 100
            assessment.append(record)
    payload = {'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'dashboard_year': '2026–2027',
        'buildings': public_buildings, 'history': public_history, 'assessments': assessment,
        'data_inventory': [{'file': s['file'], 'sheet': s['sheet'], 'rows': s['nonempty_rows']} for s in inventory],
        'schools': schools, 'metrics': metrics, 'sources': [{k:v for k,v in s.items() if not k.startswith('_')} for s in master['Source Register']],
        'definitions': {'enrollment': 'Preliminary K–12 enrollment; preschool excluded. Not finalized 2026–27 enrollment.',
            'map': '2025 charter-level MAP Proficient + Advanced counts divided by reportable students × 100. Suppressed components are never reconstructed.',
            'demographics': '2025 DESE charter-level percentages from the supplied cohort master. IEP incidence is the source field, not independently recalculated.'},
        'confirmed_events': confirmed}
    from reporting import build_reporting
    reporting_qa = build_reporting(payload, tables)
    from independent_reporting import apply_independent_findings
    independent_qa = apply_independent_findings(payload, tables)
    from demographics_explorer import extract_demographic_history
    payload['demographics_explorer'] = extract_demographic_history(payload, tables)
    (ROOT / 'dashboard-data.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    qa_dir = ROOT / 'qa'
    qa_dir.mkdir(exist_ok=True)
    (qa_dir / 'workbook-inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding='utf-8')
    (qa_dir / 'event-audit.json').write_text(json.dumps({'records': events, 'duplicates': duplicates}, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    (qa_dir / 'kpi-calculations.json').write_text(json.dumps(reporting_qa, ensure_ascii=False, indent=2), encoding='utf-8')
    (qa_dir / 'independent-calculations.json').write_text(json.dumps(independent_qa, ensure_ascii=False, indent=2), encoding='utf-8')
    gaps = ['Directory independently verified against the official June 30, 2026 publication; original undated values remain retained for provenance.',
        'No verified physical campus counts; directory building identifiers are distinct school records, not physical campuses.',
        'No finalized 2026–27 enrollment; only 2025–26 preliminary enrollment is shown.',
        'No confirmed scholarship awards or unduplicated additional partnership counts.',
        'Race/ethnicity categories are incomplete; separate category comparisons only. No inferred remainder.',
        'Historical records are displayed separately for 2007–2025. School coverage varies by year; preliminary 2025–26 enrollment is not appended to the historical series.',
        'Demographic extracts, state MAP and APR inputs are now used for separately defined KPI reporting. Original preliminary enrollment extracts remain absent; existing 3,953 total is traced to the reconciled cohort master.',
        'No confirmed community events; blank approval fields do not establish approval. Requested amounts, private notes, and invite lists are excluded from public JSON.']
    report = ['# Data quality report', '', f"Generated: {payload['generated_at']}", '',
        f"PASS: {len(schools)} unique LEAs; {sum(s[ENROLL] for s in schools):,} preliminary K–12 enrollment; {map_checks} MAP records matched to raw DESE district/building sources.",
        f"Inspected {len(inventory)} worksheets across {len(tables)} workbooks. Every nonempty row read; column names in workbook-inventory.json.",
        f"Expanded reporting: {len(public_buildings)} building records, {len(public_history)} historical school-years, {len(assessment)} matched MAP subject/student-group slices. No summation across overlapping groups, subjects or reporting levels.",
        f"Tracker: {len(events)} distinct normalized records; {len(duplicates)} duplicate rows logged. No confirmed events. No year assigned from tab names.",
        '', '## Enrollment reconciliation', *['- ' + c for c in checks], '', '## Unavailable metrics and exclusions',
        *['- ' + x for x in gaps + exclusions], '', '## Calculation and publication rules',
        '- Null, blank, NA, NULL, and * remain unavailable; no missing-to-zero conversion.',
        '- MAP percentages require both published component counts and a positive reportable denominator. No subtraction to reconstruct suppressed counts.',
        '- Public totals sum unique charter enrollment only. Building enrollment is a reconciliation check, never additional reach.',
        '- Each public school retains its source name, LEA, and Cohort Master source row. Charter and building reporting levels remain separate; statewide demographic and APR denominators use only one level each.',
        '- Public deployment folder contains only HTML, CSS, JavaScript and aggregate JSON. Keep qa/ and data/ private.']
    report += ['', '## Candi feedback: KPI definitions, denominators and Missouri references', 'Historical calculation narrative retained below; current official references and scope decisions supersede it in docs/independent-data-audit.md.', reporting_qa['markdown']]
    (qa_dir / 'QA-report.md').write_text('\n'.join(report) + '\n', encoding='utf-8')
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    for name in ('index.html', 'styles.css', 'app.js', 'dashboard-data.json'):
        shutil.copy2(ROOT / name, dist / name)
    print(f'Build passed: {len(schools)} schools, {sum(s[ENROLL] for s in schools):,} preliminary students; public files in dist/; audit in qa/.')


if __name__ == '__main__':
    build()
