"""Publish aggregate calculation definitions without distributing private QA inputs."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    qa = json.loads((ROOT/'qa/kpi-calculations.json').read_text(encoding='utf-8'))
    browser = json.loads((ROOT/'qa/browser-results.json').read_text(encoding='utf-8'))
    lines = ['# Candi feedback: definitions and validation', '',
        'Dashboard edition: 2026–2027. Enrollment remains 2025–26 preliminary; demographics, MAP and APR use 2025 source data. Directory reporting year is not stated.', '',
        qa['markdown'], '', '## Exact workbook paths', '',
        '- Network demographic and FRL counts: `data/enrollment_demographics/dese_district_demographics_1991_2025.xlsx`, Sheet1; only YEAR=2025, one row per COUNTY_DISTRICT_CODE.',
        '- Building demographic and FRL detail: `data/enrollment_demographics/dese_building_demographics_2006_2025.xlsx`, Sheet1; YEAR=2025, unique county/district + building keys.',
        '- Preliminary enrollment and existing longitudinal reports: `data/master/oscp_dese_cohort_master_2025_2026.xlsx`; Cohort Master, Building Cohort and Historical Demographics.',
        '- Directory: `data/enrollment_demographics/dese_school_building_directory_undated.xlsx`; School Building List, actual headers row 4. Only school names, identifier pairs, grade spans and source row are exported; contact/personnel fields are excluded.',
        '- State MAP: `data/assessments/dese_map_2025_state_content_area.xlsx`, Sheet1. State Total ELA row 46, Math row 47, Science row 48, Social Studies row 49.',
        '- Charter MAP: `data/assessments/dese_map_2025_district_content_area.xlsx`, Sheet1. Only six cohort LEAs feed network MAP aggregates; building rows are never added.',
        '- Building MAP: `data/assessments/dese_map_2025_school_content_area.xlsx`, Sheet1. Existing reports retain suppression and use only cohort building keys.',
        '- APR: `data/accountability/dese_apr_2025_building_supporting.xlsx`, Sheet1. Cohort shared totals are checked against the building summary. District supporting rows are read but never added to building growth denominators.', '',
        '## Comparison interpretation', '',
        '- No arithmetic average of school percentages is used for a KPI or state reference.',
        '- The MAP card reports P+A across the same three reportable charter networks, not all six. ELA and Math retain separate tested denominators. No grade-matched above-state percentage or official school-specific goal is invented.',
        '- State all-tested-grades MAP is displayed separately as context, with subject and student group matched. No difference/above-state classification is calculated without grade-specific state data.',
        '- State demographic values are reportable-district subset summaries. For Black enrollment, 269 records lack usable paired values. For FRL, 10 lack usable pairs and 18 have a reported count greater than membership, sometimes because of source precision differences. No count is clamped or imputed.',
        '- APR Target means the exact source designation. Eligibility requires positive points possible plus reported earned points and designation; Participation is included and On-Track is not Target. The statewide denominator counts unique building records only. The optional grade-span filter restricts both the selected cohort and state reference to the same source grade span.',
        '- Small-group suppression is not inferred. * is suppression with unspecified cause in these extracts; blank/NULL/NA is not reported. Numeric fields remain null with separate missingness metadata. Unavailable* labels and footnotes explain the display.', '',
        '## Verification and refresh', '',
        'Run `python build.py`, `python -m unittest test_data.py test_reporting.py`, `node --check app.js`, `python test_dashboard.py`, then `python scripts/write_kpi_report.py`. Source byte preservation can be verified with `python scripts/audit_excel_sources.py verify`.', '',
        '- Before feedback: build, 8 data tests, JavaScript syntax and existing Chrome QA passed.',
        '- After feedback: build, 16 data/calculation tests and JavaScript syntax passed. Independent tests reopen the source demographic, State MAP and APR workbooks and recalculate the denominators.',
        f"- Browser executed: {browser['passed']}; Chart.js CDN loaded: {browser['chart_cdn_loaded']}; viewport widths: {browser['viewports']}.",
        *['- Browser: '+check for check in browser['checks']], '',
        'Historical source-cleanup evidence remains in docs/source-files.md and ignored qa/source-reorganization/. Subsequent reporting extensions intentionally add new fields; the current regression tests preserve old numerical records rather than asserting the entire earlier schema is frozen.', '',
        'GitHub deployment is verified separately after push: remote main must equal local HEAD, Pages workflow must succeed, and live JSON/HTML must match the local public bundle. Never use push success alone as proof of deployment.', '']
    (ROOT/'docs/kpi-definitions.md').write_text('\n'.join(lines), encoding='utf-8')
    print('Wrote docs/kpi-definitions.md')


if __name__ == '__main__':
    main()
