"""Read supplied workbooks, validate aggregates and package a static public dashboard."""
from pathlib import Path
from datetime import date, datetime, timezone
import json
import math
import shutil
import openpyxl

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
MASTER = 'OSCP_DESE_Cohort_Master_2025_2026.xlsx'
GALA = 'SLU_Gala_Sponsorship_Tracker_with_Dropdowns.xlsx'
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
    for path in sorted(DATA.glob('*.xlsx')):
        workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
        tables[path.name] = {}
        for sheet in workbook:
            iterator = iter(sheet.values)
            headers = [str(v).strip() if v is not None else '' for v in next(iterator, ())]
            records = []
            for row_number, values in enumerate(iterator, 2):
                if any(clean(v) is not None for v in values):
                    records.append({'_row': row_number, **{k: clean(v) for k, v in zip(headers, values) if k}})
            tables[path.name][sheet.title] = records
            inventory.append({'file': path.name, 'sheet': sheet.title, 'columns': headers, 'nonempty_rows': len(records)})
        workbook.close()
    return tables, inventory


def build():
    tables, inventory = read_workbooks()
    master = tables[MASTER]
    schools = [{k: v for k, v in r.items() if k != '_row'} for r in master['Cohort Master'] if r.get('DESE LEA')]
    assert len(schools) == 6 and {code(s['DESE LEA']) for s in schools} == CODES, 'School codes do not match the six-school cohort'
    assert len({s['DESE LEA'] for s in schools}) == len(schools), 'Duplicate school'
    checks, exclusions = [], []
    raw_district = tables['2025 District_Content Area All and Disag.xlsx']['Sheet1']
    raw_building = tables['2025 School_content area all and disag.xlsx']['Sheet1']
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
            record = {k: v for k, v in row.items() if k != '_row'}
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
    payload = {'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'dashboard_year': '2026–2027',
        'schools': schools, 'metrics': metrics, 'sources': [{k:v for k,v in s.items() if k!='_row'} for s in master['Source Register']],
        'definitions': {'enrollment': 'Preliminary K–12 enrollment; preschool excluded. Not finalized 2026–27 enrollment.',
            'map': '2025 charter-level MAP Proficient + Advanced counts divided by reportable students × 100. Suppressed components are never reconstructed.',
            'demographics': '2025 DESE charter-level percentages from the supplied cohort master. IEP incidence is the source field, not independently recalculated.'},
        'confirmed_events': confirmed}
    (ROOT / 'dashboard-data.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    qa_dir = ROOT / 'qa'
    qa_dir.mkdir(exist_ok=True)
    (qa_dir / 'workbook-inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding='utf-8')
    (qa_dir / 'event-audit.json').write_text(json.dumps({'records': events, 'duplicates': duplicates}, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    gaps = ['No verified location or grade-span fields: omitted from filters and school table.',
        'No verified physical campus counts; DESE building records are used only for validation.',
        'No finalized 2026–27 enrollment; only 2025–26 preliminary enrollment is shown.',
        'No confirmed scholarship awards or unduplicated additional partnership counts.',
        'Race/ethnicity categories are incomplete; separate category comparisons only. No inferred remainder.',
        'Historical demographics are inspected but omitted: incomplete cohort coverage and incompatible enrollment periods.',
        'Original enrollment and demographic extracts listed in Source Register were not supplied; values are traceable to the cohort master, not independently verified against those absent originals.',
        'No confirmed community events; blank approval fields do not establish approval. Requested amounts, private notes, and invite lists are excluded from public JSON.']
    report = ['# Data quality report', '', f"Generated: {payload['generated_at']}", '',
        f"PASS: {len(schools)} unique LEAs; {sum(s[ENROLL] for s in schools):,} preliminary K–12 enrollment; {map_checks} MAP records matched to raw DESE district/building sources.",
        f"Inspected {len(inventory)} worksheets across {len(tables)} workbooks. Every nonempty row read; column names in workbook-inventory.json.",
        f"Tracker: {len(events)} distinct normalized records; {len(duplicates)} duplicate rows logged. No confirmed events. No year assigned from tab names.",
        '', '## Enrollment reconciliation', *['- ' + c for c in checks], '', '## Unavailable metrics and exclusions',
        *['- ' + x for x in gaps + exclusions], '', '## Calculation and publication rules',
        '- Null, blank, NA, NULL, and * remain unavailable; no missing-to-zero conversion.',
        '- MAP percentages require both published component counts and a positive reportable denominator. No subtraction to reconstruct suppressed counts.',
        '- Public totals sum unique charter enrollment only. Building enrollment is a reconciliation check, never additional reach.',
        '- Each public school retains its source name, LEA, and Cohort Master source row. All comparative records use charter-level 2025 metrics.',
        '- Public deployment folder contains only HTML, CSS, JavaScript and aggregate JSON. Keep qa/ and data/ private.']
    (qa_dir / 'QA-report.md').write_text('\n'.join(report) + '\n', encoding='utf-8')
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    for name in ('index.html', 'styles.css', 'app.js', 'dashboard-data.json'):
        shutil.copy2(ROOT / name, dist / name)
    print(f'Build passed: {len(schools)} schools, {sum(s[ENROLL] for s in schools):,} preliminary students; public files in dist/; audit in qa/.')


if __name__ == '__main__':
    build()
