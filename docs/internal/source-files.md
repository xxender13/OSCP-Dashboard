# Excel source reorganization — 2026-11-07

All 11 original workbooks are retained under one `data/` directory. All 21 worksheets were read before and after the move. No source workbook was loaded and saved; every SHA-256 checksum is unchanged, which also preserves formulas, cached values, formatting, validations, workbook properties and embedded content.

## Original-to-current mapping

| Original path (provenance only) | Current path | Contents / period | Nonempty data rows | Pipeline input |
| --- | --- | --- | --- | --- |
| `data/OSCP_DESE_Cohort_Master_2025_2026.xlsx` | `data/master/oscp_dese_cohort_master_2025_2026.xlsx` | Curated OSCP cohort master; 7 worksheets; 2025 outcomes; 2025–26 preliminary enrollment; history 2007–2025 | Cohort Master: 7; Building Cohort: 14; MAP 2025: 40; Historical Demographics: 96; QA Checks: 6; Source Register: 8; Review Gaps: 8 | Yes |
| `data2/District Demographic Data (2).xlsx` | `data/enrollment_demographics/dese_district_demographics_1991_2025.xlsx` | District/charter annual demographics; 1991–2025 | Sheet1: 19,137 | No; retained source |
| `data2/Building Demographic Data 2006 to Current (1).xlsx` | `data/enrollment_demographics/dese_building_demographics_2006_2025.xlsx` | Building annual demographics; 2006–2025 | Sheet1: 54,089 | No; retained source |
| `data2/School Building List (1).xlsx` | `data/enrollment_demographics/dese_school_building_directory_undated.xlsx` | 14 building directory records; actual headers on row 4; Not stated in worksheet; no year inferred from download or master register | School Building List: 14 | No; retained source |
| `data2/2025 State_content area all and disag.xlsx` | `data/assessments/dese_map_2025_state_content_area.xlsx` | State-level MAP subject/student-group aggregates; 2025 | Sheet1: 48 | No; retained source |
| `data/2025 District_Content Area All and Disag.xlsx` | `data/assessments/dese_map_2025_district_content_area.xlsx` | District/charter-level MAP subject/student-group aggregates; 2025 | Sheet1: 15,855 | Yes |
| `data/2025 School_content area all and disag.xlsx` | `data/assessments/dese_map_2025_school_content_area.xlsx` | School/building-level MAP subject/student-group aggregates; 2025 | Sheet1: 50,303 | Yes |
| `data2/Supporting District Report (1).xlsx` | `data/accountability/dese_apr_2025_district_supporting.xlsx` | District APR supporting measures; 154 columns; 2025 | Sheet1: 553 | No; retained source |
| `data2/Summary Building Report (1).xlsx` | `data/accountability/dese_apr_2025_building_summary.xlsx` | Building APR summary; 16 columns; 2025 | Sheet1: 2,139 | No; retained source |
| `data2/Supporting Building Report (1).xlsx` | `data/accountability/dese_apr_2025_building_supporting.xlsx` | Building APR supporting measures; 130 columns; 2025 | Sheet1: 2,139 | No; retained source |
| `data/SLU_Gala_Sponsorship_Tracker_with_Dropdowns.xlsx` | `data/sponsorships/oscp_gala_sponsorship_tracker.xlsx` | Main sponsorship tracker and FY24–FY27 worksheets; Mixed tracker tabs; fiscal-year attribution unverified | Gala Sponsorship Tracker: 16; FY27: 20; FY26: 15; FY25: 15; FY24: 0 | Yes |

Row counts exclude detected column headers and empty rows. The master Cohort Master sheet has six school rows plus a populated annotation row. Tracker sheet counts include any populated nonbusiness rows; the existing pipeline separately identifies 26 normalized business records and 39 duplicate business rows. FY24 remains an empty worksheet.

## Naming decisions and reporting levels

- The district demographic file contains YEAR values 1991–2025; the building demographic file contains 2006–2025.
- The directory has a preamble and real headers on row 4, with 14 building records. No reporting year is stated. Its canonical name is `dese_school_building_directory_undated.xlsx`; neither the download date nor the master source-register reference proves a 2026 reporting period.
- MAP files have the same 22-column schema but distinct State, District and School reporting levels. They are not interchangeable or additive.
- APR district supporting (154 columns), building supporting (130 columns), and building summary (16 columns) describe accountability points and performance indices, not MAP Proficient + Advanced percentages.
- The cohort master is a curated derivative; source extracts and derived worksheets are retained independently.

## Duplicates and overlaps

- Byte-identical workbook duplicate groups: 0. Cell-identical workbook duplicate groups: 0.
- Cohort Master versus newly downloaded demographic extracts: 48 compared cells, 0 differences, 0 missing source matches. Suppressed/missing values were normalized for comparison only, never changed in the workbooks.
- Building Cohort versus newly downloaded demographic extracts: 112 compared cells, 0 differences, 0 missing source matches. Suppressed/missing values were normalized for comparison only, never changed in the workbooks.
- Historical Demographics versus newly downloaded demographic extracts: 768 compared cells, 0 differences, 0 missing source matches. Suppressed/missing values were normalized for comparison only, never changed in the workbooks.
- APR building summary: 2,139 rows match the shared fields in the 2,139-row building supporting file, with 0 differing cells. This is an overlapping projection; both workbooks are retained.

Workbook counts are not event counts: the repeated fiscal-year worksheets remain untouched, and the existing event-row audit is unchanged.

## Files removed or archived

- Workbook files deleted: none. Workbook files archived: none.
- All originals were renamed/moved, with original-to-current paths and exact checksums preserved in `docs/source-files.json`.
- The empty `data2/` directory was removed after its seven files were moved. No recursive deletion was used.

## Pipeline and output preservation

- `build.py` now uses an explicit four-workbook `SOURCE_PATHS` registry; seven newly catalogued downloads do not silently enter existing dashboard calculations.
- Public JSON keys, record order, numerical values, suppression, definitions and calculations match the pre-migration baseline. Only `generated_at`, `assessments[].source_file` and `data_inventory[].file` change.
- The 14-sheet public data inventory continues to describe the same four pipeline workbooks; the complete 21-sheet source inventory lives in the local source audit.
- Original filenames embedded in the unchanged master Source Register are historical provenance labels, not executable filesystem references. They deliberately remain in the JSON Source Register; this catalog maps supplied originals to their canonical locations.
- Dashboard HTML, CSS and JavaScript SHA-256 checksums match the baseline. Raw workbooks, private audits, and directory contact fields are not added to the public bundle.

## Validation results

- Before move: existing build passed, 6 data tests passed, JavaScript syntax passed, Chrome QA passed at 320 / 768 / 1440px with filters, CSV, keyboard focus and CDN fallback.
- After move: build and 8 data tests passed; complete workbook byte/worksheet audit passed; normalized dashboard payload equality passed; JavaScript syntax passed.
- Post-move browser results are recorded in `qa/browser-results.json`; the before results are retained in `qa/source-reorganization/baseline-browser-results.json`.
- Preserved totals: 6 schools; 3,953 preliminary K–12 students; 14 building records; 96 historical school-years; 516 MAP slices; 26 normalized tracker records and 39 duplicate rows.
- No dashboard design change, Git commit, push or deployment is part of this cleanup.

## Detailed workbook inventory

Full column names and observed reporting values for every sheet are retained in the ignored `qa/source-reorganization/before.json` and `after.json` files. `docs/source-files.json` provides a compact tracked catalog.

### `data/master/oscp_dese_cohort_master_2025_2026.xlsx`

SHA-256: `6b54712ef9fe40c4cc7b5517ed52a483f5ca01afd0bee9e5fb93751fcfb3cf59`

| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |
| --- | --- | --- | --- | --- | --- |
| Cohort Master | 1 | 7 | 24 | 2 | Enrollment period: 2025–26 preliminary; Demographics year: 2025; MAP year: 2025 |
| Building Cohort | 1 | 14 | 17 | 0 | Enrollment period: 2025–26 preliminary; Demographics year: 2025 |
| MAP 2025 | 1 | 40 | 11 | 0 | Year: 2025 |
| Historical Demographics | 1 | 96 | 11 | 0 | Year: 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025 |
| QA Checks | 1 | 6 | 7 | 0 | No explicit reporting-year column |
| Source Register | 1 | 8 | 5 | 0 | Reporting period: 2025, 2025–26 preliminary, 2026–27 directory, Mixed |
| Review Gaps | 1 | 8 | 3 | 0 | No explicit reporting-year column |

### `data/enrollment_demographics/dese_district_demographics_1991_2025.xlsx`

SHA-256: `72f8dcff976dc9bf90241782dd2ff565cf140c34fd6c791b17231baac00896fd`

| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |
| --- | --- | --- | --- | --- | --- |
| Sheet1 | 1 | 19,137 | 29 | 0 | YEAR: 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025 |

### `data/enrollment_demographics/dese_building_demographics_2006_2025.xlsx`

SHA-256: `32444645613e9e9b46794856a76f503e629c4be233d997d26481c338b1b0b681`

| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |
| --- | --- | --- | --- | --- | --- |
| Sheet1 | 1 | 54,089 | 33 | 0 | YEAR: 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025 |

### `data/enrollment_demographics/dese_school_building_directory_undated.xlsx`

SHA-256: `81e75d9a9fc3cd82d63fc59929b939d493ca6fedb5b776d39eed15cb391310b5`

| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |
| --- | --- | --- | --- | --- | --- |
| School Building List | 4 | 14 | 34 | 0 | No explicit reporting-year column |

### `data/assessments/dese_map_2025_state_content_area.xlsx`

SHA-256: `77358f05c75aca1766c33bb1c800d19699fc31e5467fc3d8cde30db27cbd1a8a`

| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |
| --- | --- | --- | --- | --- | --- |
| Sheet1 | 1 | 48 | 22 | 0 | YEAR: 2025 |

### `data/assessments/dese_map_2025_district_content_area.xlsx`

SHA-256: `131bb2663088efa9dd10fb1f80ca71b77bf82ce7688a4170b386c87a328c8461`

| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |
| --- | --- | --- | --- | --- | --- |
| Sheet1 | 1 | 15,855 | 22 | 0 | YEAR: 2025 |

### `data/assessments/dese_map_2025_school_content_area.xlsx`

SHA-256: `4220ffe86c4fe14403a68bee62421e256eecf7d127b3f8a58fa5ed6e08d7c5da`

| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |
| --- | --- | --- | --- | --- | --- |
| Sheet1 | 1 | 50,303 | 22 | 0 | YEAR: 2025 |

### `data/accountability/dese_apr_2025_district_supporting.xlsx`

SHA-256: `ed44ba45aba915e6874f2b4fbebea138b5fb8c287e0c3145cf6403017e82347c`

| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |
| --- | --- | --- | --- | --- | --- |
| Sheet1 | 1 | 553 | 154 | 0 | YEAR: 2025 |

### `data/accountability/dese_apr_2025_building_summary.xlsx`

SHA-256: `017677966f82e7488763265036cfa14220cbb577f1fc3d21f3974c5dd36ff458`

| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |
| --- | --- | --- | --- | --- | --- |
| Sheet1 | 1 | 2,139 | 16 | 0 | YEAR: 2025 |

### `data/accountability/dese_apr_2025_building_supporting.xlsx`

SHA-256: `1500ad880fc7733f622d2eafc624990976a94fb72fa2c31bb7a886d4e3ed0375`

| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |
| --- | --- | --- | --- | --- | --- |
| Sheet1 | 1 | 2,139 | 130 | 0 | YEAR: 2025 |

### `data/sponsorships/oscp_gala_sponsorship_tracker.xlsx`

SHA-256: `797831dada1aff700f32a41e548a9be895bb06a01e3c6003351fd1ffee558ccd`

| Worksheet | Header row | Data rows | Columns | Formulas | Observed reporting values |
| --- | --- | --- | --- | --- | --- |
| Gala Sponsorship Tracker | 1 | 16 | 15 | 0 | No explicit reporting-year column |
| FY27 | 1 | 20 | 15 | 0 | No explicit reporting-year column |
| FY26 | 1 | 15 | 15 | 0 | No explicit reporting-year column |
| FY25 | 1 | 15 | 15 | 0 | No explicit reporting-year column |
| FY24 | None | 0 | 0 | 0 | No explicit reporting-year column |

## Independent public-reference supplement

The original 11-workbook catalog and hashes remain unchanged. Additional official grade-level MAP exports and dated publications are downloaded separately to ignored `data/research/`. Their hashes, URLs, complete row inventories and cohort aggregate extracts are tracked in `reference-data/dese-2025-independent.json`; see [independent audit](independent-data-audit.md) for refresh commands, decisions and reporting populations.
