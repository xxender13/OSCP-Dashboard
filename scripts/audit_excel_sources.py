"""Read-only Excel inventory and byte/content verification for the source cleanup.

Run before before moving workbooks, then after after moving them. Review files
are local under ignored qa/source-reorganization; workbooks are never saved.
"""
from collections import Counter
from datetime import date, datetime
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'qa' / 'source-reorganization'
sys.path.insert(0, str(ROOT))
from build import clean, code, CODES


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value):
    if isinstance(value, (datetime, date)):
        return {'type': type(value).__name__, 'value': value.isoformat()}
    return {'type': type(value).__name__, 'value': value}


def packed(values):
    return json.dumps([encode(v) for v in values], ensure_ascii=False, separators=(',', ':'), default=str).encode('utf-8')


def inspect(path):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=False)
    sheets, selected = [], {}
    for sheet in workbook:
        content = hashlib.sha256()
        headers, header_row = [], None
        nonempty, records, formulas = 0, 0, 0
        years, levels, row_counts = {}, {}, Counter()
        period_text, subset = set(), []
        for row_number, row in enumerate(sheet.iter_rows(), 1):
            values = [cell.value for cell in row]
            while values and values[-1] is None:
                values.pop()
            content.update(packed([row_number, *values]))
            if not any(v is not None and str(v).strip() for v in values):
                continue
            nonempty += 1
            formulas += sum(getattr(cell, 'data_type', None) == 'f' for cell in row)
            if header_row is None:
                labels = [str(v).strip() if v is not None else '' for v in values]
                if row_number == 1 or {'CTYDIST', 'SCHNUM', 'SCHNAME'}.issubset(labels):
                    headers, header_row = labels, row_number
                    continue
                # Directory preamble ends at the real CTYDIST/SCHNUM header.
                if path.name.startswith('School Building List') or 'building_directory' in path.name:
                    if len(values) < 5:
                        continue
            if header_row is None:
                continue
            record = {h: v for h, v in zip(headers, values) if h}
            records += 1
            row_counts[hashlib.sha256(packed(values)).hexdigest()] += 1
            for h, v in record.items():
                if v is None:
                    continue
                if h.casefold() in {'year', 'demographics year', 'map year', 'enrollment period', 'reporting period'}:
                    years.setdefault(h, set()).add(str(v))
                if h == 'SUMMARY_LEVEL':
                    levels.setdefault(h, set()).add(str(v).strip())
                if isinstance(v, str) and re.search(r'(?:school\s+year|reporting\s+year|20\d\d\s*[-–/]\s*20\d\d)', v, re.I):
                    if len(v) < 120:
                        period_text.add(v)
            lea = record.get('COUNTY_DISTRICT_CODE', record.get('COUNTY_DISTRICT', record.get('DESE LEA')))
            if code(lea) in CODES or 'POINTS_EARNED' in ' '.join(headers):
                subset.append({h: clean(v) for h, v in record.items()} | {'_row': row_number})
        sheets.append({'name': sheet.title, 'header_row': header_row, 'columns': headers,
            'nonempty_rows_including_headers': nonempty, 'records': records, 'formula_count': formulas,
            'reporting_values': {h: sorted(v) for h, v in years.items()},
            'reporting_levels': {h: sorted(v) for h, v in levels.items()},
            'period_text': sorted(period_text), 'cell_values_sha256': content.hexdigest(),
            'record_multiset_sha256': hashlib.sha256(packed(sorted(row_counts.items()))).hexdigest()})
        selected[sheet.title] = subset
    workbook.close()
    return {'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size,
            'sha256': digest(path), 'sheets': sheets}, selected


def overlaps(subsets):
    master = next(v for k, v in subsets.items() if 'cohort_master' in k.lower())
    district = next(v['Sheet1'] for k, v in subsets.items() if 'district demographic' in k.lower() or 'district_demographics' in k)
    building = next(v['Sheet1'] for k, v in subsets.items() if 'building demographic' in k.lower() or 'building_demographics' in k)
    checks = []
    mapping = {'FRL %': 'LUNCH_COUNT_FREE_REDUCED_PCT', 'EL %': 'ELL_LEP_STUDENTS_ENROLLED_K_12_PCT',
        'IEP incidence %': 'IEP_INCIDENCE_RATE', 'Black %': 'ENROLLMENT_BLACK_PCT',
        'Hispanic %': 'ENROLLMENT_HISPANIC_PCT', 'Multiracial %': 'ENROLLMENT_MULTIRACIAL_PCT',
        'White %': 'ENROLLMENT_WHITE_PCT', '2025 K–12': 'ENROLLMENT_GRADES_K_12'}
    for sheet_name, source in [('Cohort Master', district), ('Building Cohort', building), ('Historical Demographics', district)]:
        count, mismatches, missing = 0, [], []
        index = {(code(r['COUNTY_DISTRICT_CODE']), str(r['YEAR']), code(r.get('SCHOOL_CODE'), 4) if sheet_name == 'Building Cohort' else None): r for r in source}
        fields = mapping if sheet_name != 'Historical Demographics' else {('K–12 enrollment' if k == '2025 K–12' else k):v for k,v in mapping.items()}
        for row in master[sheet_name]:
            key = (code(row['DESE LEA']), str(row.get('Year', 2025)), code(row.get('Building code'), 4) if sheet_name == 'Building Cohort' else None)
            raw = index.get(key)
            if raw is None:
                missing.append({'lea': key[0], 'year': key[1], 'building': key[2]})
                continue
            for field, raw_field in fields.items():
                count += 1
                if clean(row.get(field)) != clean(raw.get(raw_field)):
                    mismatches.append({'lea': key[0], 'year': key[1], 'building': key[2], 'field': field,
                        'master_value': row.get(field), 'download_value': raw.get(raw_field)})
        checks.append({'comparison': sheet_name + ' versus newly downloaded demographic extracts',
            'compared_cells': count, 'mismatches': mismatches, 'missing_matches': missing})
    summary = next(v['Sheet1'] for k, v in subsets.items() if 'summary building' in k.lower() or 'building_summary' in k)
    supporting = next(v['Sheet1'] for k, v in subsets.items() if 'supporting building' in k.lower() or 'building_supporting' in k)
    key = lambda r: (str(r['YEAR']), code(r['COUNTY_DISTRICT_CODE']), code(r['SCHOOL_CODE'], 4))
    index = {key(r): r for r in supporting}
    mismatch_count = sum(1 for row in summary for h,v in row.items() if h != '_row' and (key(row) not in index or index[key(row)].get(h) != v))
    checks.append({'comparison': 'APR building summary versus shared columns in building supporting report',
        'summary_rows': len(summary), 'supporting_rows': len(supporting), 'shared_column_mismatches': mismatch_count,
        'interpretation': 'Summary is an overlapping projection, not a duplicate workbook; retain both.'})
    return checks


def run(phase):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if phase == 'verify':
        catalog = json.loads((ROOT / 'docs/source-files.json').read_text(encoding='utf-8'))['workbooks']
        for item in catalog:
            path = ROOT / item['path']
            assert path.is_file() and digest(path) == item['sha256'], f"Original workbook bytes changed: {item['path']}"
        print(f"Verified unchanged original bytes for all {len(catalog)} workbooks; no historical dashboard/design equality is required for later feature releases.")
        return
    if phase == 'before':
        if (OUTPUT / 'before.json').exists():
            raise RuntimeError('Baseline already exists; do not overwrite the original audit.')
        shutil.copy2(ROOT / 'dashboard-data.json', OUTPUT / 'baseline-dashboard.json')
        shutil.copy2(ROOT / 'qa' / 'browser-results.json', OUTPUT / 'baseline-browser-results.json')
    paths = sorted(p for folder in ('data', 'data2') if (ROOT / folder).exists()
                   for p in (ROOT / folder).rglob('*') if p.suffix.lower() in {'.xlsx', '.xlsm'})
    inventories, subsets = [], {}
    for path in paths:
        inventory, subset = inspect(path)
        inventories.append(inventory)
        subsets[path.relative_to(ROOT).as_posix()] = subset
        print(inventory['path'], [(s['name'], s['records'], s['reporting_values']) for s in inventory['sheets']], flush=True)
    groups = {}
    for item in inventories:
        groups.setdefault(item['sha256'], []).append(item['path'])
    duplicate_groups = [v for v in groups.values() if len(v) > 1]
    cell_groups = {}
    for item in inventories:
        signature = tuple((s['name'], s['cell_values_sha256']) for s in item['sheets'])
        cell_groups.setdefault(signature, []).append(item['path'])
    result = {'phase': phase, 'workbooks': inventories, 'byte_identical_duplicates': duplicate_groups,
        'cell_identical_duplicates': [v for v in cell_groups.values() if len(v) > 1], 'overlaps': overlaps(subsets),
        'web_assets_sha256': {name: digest(ROOT / name) for name in ('index.html', 'app.js', 'styles.css')}}
    if phase == 'after':
        before = json.loads((OUTPUT / 'before.json').read_text(encoding='utf-8'))
        assert Counter(w['sha256'] for w in before['workbooks']) == Counter(w['sha256'] for w in inventories), 'Original workbook bytes changed or a file is missing'
        assert result['web_assets_sha256'] == before['web_assets_sha256'], 'Dashboard design files changed'
        result['byte_preservation_verified'] = True
        result['design_preservation_verified'] = True
        baseline = json.loads((OUTPUT / 'baseline-dashboard.json').read_text(encoding='utf-8'))
        catalog = json.loads((ROOT / 'docs' / 'source-files.json').read_text(encoding='utf-8'))['workbooks']
        renamed = {Path(w['original_path']).name: Path(w['path']).name for w in catalog}
        for row in baseline['assessments']:
            row['source_file'] = renamed[row['source_file']]
        for row in baseline['data_inventory']:
            row['file'] = renamed[row['file']]
        current = json.loads((ROOT / 'dashboard-data.json').read_text(encoding='utf-8'))
        baseline['generated_at'] = current['generated_at']
        assert baseline == current, 'Dashboard payload changed beyond source filenames and generation time'
        assert (ROOT / 'dashboard-data.json').read_bytes() == (ROOT / 'dist' / 'dashboard-data.json').read_bytes()
        result['dashboard_schema_and_values_preserved'] = True
        result['allowed_metadata_changes'] = ['generated_at', 'assessments[].source_file', 'data_inventory[].file']
    (OUTPUT / f'{phase}.json').write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    print('Inventory complete:', len(inventories), 'workbooks;', sum(len(i['sheets']) for i in inventories), 'worksheets;', len(duplicate_groups), 'byte-identical duplicate groups.')
    for comparison in result['overlaps']:
        print(comparison['comparison'], 'mismatches:', len(comparison.get('mismatches', [])), 'missing:', len(comparison.get('missing_matches', [])), 'shared differences:', comparison.get('shared_column_mismatches'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['before', 'after', 'verify'])
    run(parser.parse_args().phase)
