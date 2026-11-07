"""Move verified original workbook bytes into the reviewed source directory layout."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'qa' / 'source-reorganization' / 'before.json'
CATALOG = ROOT / 'docs' / 'source-files.json'
PLAN = [
    ('data/OSCP_DESE_Cohort_Master_2025_2026.xlsx', 'data/master/oscp_dese_cohort_master_2025_2026.xlsx', 'Curated OSCP cohort master; 7 worksheets', '2025 outcomes; 2025–26 preliminary enrollment; history 2007–2025', True),
    ('data2/District Demographic Data (2).xlsx', 'data/enrollment_demographics/dese_district_demographics_1991_2025.xlsx', 'District/charter annual demographics', '1991–2025', False),
    ('data2/Building Demographic Data 2006 to Current (1).xlsx', 'data/enrollment_demographics/dese_building_demographics_2006_2025.xlsx', 'Building annual demographics', '2006–2025', False),
    ('data2/School Building List (1).xlsx', 'data/enrollment_demographics/dese_school_building_directory_undated.xlsx', '14 building directory records; actual headers on row 4', 'Not stated in worksheet; no year inferred from download or master register', False),
    ('data2/2025 State_content area all and disag.xlsx', 'data/assessments/dese_map_2025_state_content_area.xlsx', 'State-level MAP subject/student-group aggregates', '2025', False),
    ('data/2025 District_Content Area All and Disag.xlsx', 'data/assessments/dese_map_2025_district_content_area.xlsx', 'District/charter-level MAP subject/student-group aggregates', '2025', True),
    ('data/2025 School_content area all and disag.xlsx', 'data/assessments/dese_map_2025_school_content_area.xlsx', 'School/building-level MAP subject/student-group aggregates', '2025', True),
    ('data2/Supporting District Report (1).xlsx', 'data/accountability/dese_apr_2025_district_supporting.xlsx', 'District APR supporting measures; 154 columns', '2025', False),
    ('data2/Summary Building Report (1).xlsx', 'data/accountability/dese_apr_2025_building_summary.xlsx', 'Building APR summary; 16 columns', '2025', False),
    ('data2/Supporting Building Report (1).xlsx', 'data/accountability/dese_apr_2025_building_supporting.xlsx', 'Building APR supporting measures; 130 columns', '2025', False),
    ('data/SLU_Gala_Sponsorship_Tracker_with_Dropdowns.xlsx', 'data/sponsorships/oscp_gala_sponsorship_tracker.xlsx', 'Main sponsorship tracker and FY24–FY27 worksheets', 'Mixed tracker tabs; fiscal-year attribution unverified', True),
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run():
    before = json.loads(AUDIT.read_text(encoding='utf-8'))
    originals = {item['path']: item for item in before['workbooks']}
    assert set(originals) == {row[0] for row in PLAN}, 'Migration plan must cover exactly the inspected workbook set'
    if CATALOG.exists():
        raise RuntimeError('Migration catalog already exists; use the audit after command to verify the completed move.')
    catalog = []
    # Validate every source and destination before the first move.
    for old, new, role, period, active in PLAN:
        src, dst = (ROOT / old).resolve(), (ROOT / new).resolve()
        assert src.is_relative_to(ROOT) and dst.is_relative_to(ROOT)
        assert src.is_file() and not dst.exists(), f'Source missing or destination occupied: {old} -> {new}'
        assert sha(src) == originals[old]['sha256'], f'Source changed after inspection: {old}'
        catalog.append({'original_path': old, 'path': new, 'role': role, 'reporting_period': period,
            'dashboard_input': active, 'sha256': originals[old]['sha256'], 'bytes': originals[old]['bytes'],
            'sheets': [{'name': s['name'], 'header_row': s['header_row'], 'records': s['records'], 'columns': len(s['columns'])} for s in originals[old]['sheets']]})
    for entry in catalog:
        src, dst = ROOT / entry['original_path'], ROOT / entry['path']
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)  # No workbook load/save: formulas, formatting and ZIP bytes remain intact.
        assert sha(dst) == entry['sha256']
        print(entry['original_path'], '->', entry['path'])
    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    CATALOG.write_text(json.dumps({'workbooks': catalog, 'removed_workbooks': [], 'archived_workbooks': []}, ensure_ascii=False, indent=2), encoding='utf-8')
    obsolete = (ROOT / 'data2').resolve()
    assert obsolete.is_relative_to(ROOT) and obsolete.name == 'data2'
    if obsolete.exists() and not any(obsolete.iterdir()):
        obsolete.rmdir()  # Empty directory only; never recursive deletion.
    print('Moved all 11 original files without changing their bytes. No workbook deleted or archived.')


if __name__ == '__main__':
    run()
