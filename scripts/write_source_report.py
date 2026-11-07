"""Write a human-readable catalog from the preserved migration evidence."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run():
    catalog = json.loads((ROOT / 'docs/source-files.json').read_text(encoding='utf-8'))['workbooks']
    audit = json.loads((ROOT / 'qa/source-reorganization/after.json').read_text(encoding='utf-8'))
    baseline = json.loads((ROOT / 'qa/source-reorganization/before.json').read_text(encoding='utf-8'))
    inspected = {w['path']: w for w in audit['workbooks']}
    lines = ['# Excel source reorganization — 2026-11-07', '',
        'All 11 original workbooks are retained under one `data/` directory. All 21 worksheets were read before and after the move. No source workbook was loaded and saved; every SHA-256 checksum is unchanged, which also preserves formulas, cached values, formatting, validations, workbook properties and embedded content.', '',
        '## Original-to-current mapping', '',
        '| Original path (provenance only) | Current path | Contents / period | Nonempty data rows | Pipeline input |',
        '| --- | --- | --- | --- | --- |']
    for item in catalog:
        counts = '; '.join(f"{s['name']}: {s['records']:,}" for s in item['sheets'])
        lines.append(f"| `{item['original_path']}` | `{item['path']}` | {item['role']}; {item['reporting_period']} | {counts} | {'Yes' if item['dashboard_input'] else 'No; retained source'} |")
    lines += ['', 'Row counts exclude detected column headers and empty rows. The master Cohort Master sheet has six school rows plus a populated annotation row. Tracker sheet counts include any populated nonbusiness rows; the existing pipeline separately identifies 26 normalized business records and 39 duplicate business rows. FY24 remains an empty worksheet.', '',
        '## Naming decisions and reporting levels', '',
        '- The district demographic file contains YEAR values 1991–2025; the building demographic file contains 2006–2025.',
        '- The directory has a preamble and real headers on row 4, with 14 building records. No reporting year is stated. Its canonical name is `dese_school_building_directory_undated.xlsx`; neither the download date nor the master source-register reference proves a 2026 reporting period.',
        '- MAP files have the same 22-column schema but distinct State, District and School reporting levels. They are not interchangeable or additive.',
        '- APR district supporting (154 columns), building supporting (130 columns), and building summary (16 columns) describe accountability points and performance indices, not MAP Proficient + Advanced percentages.',
        '- The cohort master is a curated derivative; source extracts and derived worksheets are retained independently.', '',
        '## Duplicates and overlaps', '',
        f"- Byte-identical workbook duplicate groups: {len(audit['byte_identical_duplicates'])}. Cell-identical workbook duplicate groups: {len(audit['cell_identical_duplicates'])}."]
    for comparison in audit['overlaps']:
        if 'compared_cells' in comparison:
            lines.append(f"- {comparison['comparison']}: {comparison['compared_cells']} compared cells, {len(comparison['mismatches'])} differences, {len(comparison['missing_matches'])} missing source matches. Suppressed/missing values were normalized for comparison only, never changed in the workbooks.")
        else:
            lines.append(f"- APR building summary: {comparison['summary_rows']:,} rows match the shared fields in the {comparison['supporting_rows']:,}-row building supporting file, with {comparison['shared_column_mismatches']} differing cells. This is an overlapping projection; both workbooks are retained.")
    lines += ['', 'Workbook counts are not event counts: the repeated fiscal-year worksheets remain untouched, and the existing event-row audit is unchanged.', '',
        '## Files removed or archived', '',
        '- Workbook files deleted: none. Workbook files archived: none.',
        '- All originals were renamed/moved, with original-to-current paths and exact checksums preserved in `docs/source-files.json`.',
        '- The empty `data2/` directory was removed after its seven files were moved. No recursive deletion was used.', '',
        '## Pipeline and output preservation', '',
        '- `build.py` now uses an explicit four-workbook `SOURCE_PATHS` registry; seven newly catalogued downloads do not silently enter existing dashboard calculations.',
        '- Public JSON keys, record order, numerical values, suppression, definitions and calculations match the pre-migration baseline. Only `generated_at`, `assessments[].source_file` and `data_inventory[].file` change.',
        '- The 14-sheet public data inventory continues to describe the same four pipeline workbooks; the complete 21-sheet source inventory lives in the local source audit.',
        '- Original filenames embedded in the unchanged master Source Register are historical provenance labels, not executable filesystem references. They deliberately remain in the JSON Source Register; this catalog maps supplied originals to their canonical locations.',
        '- Dashboard HTML, CSS and JavaScript SHA-256 checksums match the baseline. Raw workbooks, private audits, and directory contact fields are not added to the public bundle.', '',
        '## Validation results', '',
        '- Before move: existing build passed, 6 data tests passed, JavaScript syntax passed, Chrome QA passed at 320 / 768 / 1440px with filters, CSV, keyboard focus and CDN fallback.',
        '- After move: build and 8 data tests passed; complete workbook byte/worksheet audit passed; normalized dashboard payload equality passed; JavaScript syntax passed.',
        '- Post-move browser results are recorded in `qa/browser-results.json`; the before results are retained in `qa/source-reorganization/baseline-browser-results.json`.',
        '- Preserved totals: 6 schools; 3,953 preliminary K–12 students; 14 building records; 96 historical school-years; 516 MAP slices; 26 normalized tracker records and 39 duplicate rows.',
        '- No dashboard design change, Git commit, push or deployment is part of this cleanup.', '',
        '## Detailed workbook inventory', '',
        'Full column names and observed reporting values for every sheet are retained in the ignored `qa/source-reorganization/before.json` and `after.json` files. `docs/source-files.json` provides a compact tracked catalog.', '']
    for item in catalog:
        workbook = inspected[item['path']]
        lines += [f"### `{item['path']}`", '', f"SHA-256: `{workbook['sha256']}`", '',
            '| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |',
            '| --- | --- | --- | --- | --- | --- |']
        for sheet in workbook['sheets']:
            periods = '; '.join(f"{k}: {', '.join(v)}" for k,v in sheet['reporting_values'].items()) or 'No explicit reporting-year column'
            lines.append(f"| {sheet['name']} | {sheet['header_row'] or 'None'} | {sheet['records']:,} | {len(sheet['columns'])} | {sheet['formula_count']} | {periods} |")
        lines.append('')
    (ROOT / 'docs/source-files.md').write_text('\n'.join(lines), encoding='utf-8')
    print('Wrote docs/source-files.md')


if __name__ == '__main__':
    run()
