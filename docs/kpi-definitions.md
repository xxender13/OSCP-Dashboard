# Current independently verified reporting

See [independent data audit](independent-data-audit.md) for current official statewide context, June 30, 2026 directory verification, grade-specific MAP comparisons and limitations. The original numerical cohort KPI calculations below remain valid; older unavailable/state-subset statements are historical and superseded by that audit.

# Candi feedback: definitions and validation

Dashboard edition: 2026–2027. Enrollment remains 2025–26 preliminary; demographics, MAP and APR use 2025 source data. Directory reporting year is not stated.

| KPI | Definition / value | Year | Denominator and limitations |
| --- | --- | --- | --- |
| Students served | 3,953 preliminary K–12 students | 2025–26 preliminary | Six unique charter networks; preschool and unverified partnerships excluded |
| Student demographics | 1,255 / 3,913 = 32.072579% identifying as Black | 2025 | Sum ENROLLMENT_BLACK / ENROLLMENT_GRADES_K_12; all six unique charter records |
| FRL | 2,330 / 3,816 = 61.058700% | 2025 | LUNCH_COUNT_FREE_REDUCED / JANUARY_MEMBERSHIP; all six networks, independently reproduces source rates to 0.051 percentage point |
| Sponsored schools | 14 directory building identifiers across six charter networks | Undated | No 2026 release confirmation, no physical-campus claim |
| MAP Eng. Language Arts | 823 / 1753 = 46.948089% P+A | 2025 | 3/6 reportable charter networks; no grade-matched above-state classification |
| MAP Mathematics | 877 / 1765 = 49.688385% P+A | 2025 | 3/6 reportable charter networks; no grade-matched above-state classification |
| APR growth Eng. Language Arts | 7 / 13 = 53.846154% designated Target | 2025 | Eligible building ALL growth measures only; not a student growth percentage |
| APR growth Mathematics | 5 / 13 = 38.461538% designated Target | 2025 | Eligible building ALL growth measures only; not a student growth percentage |

Source sheet for every raw extract: Sheet1, except directory School Building List (headers row 4). Demographic files supply YEAR, COUNTY_DISTRICT_CODE, counts and corresponding denominators; no school percentages are averaged.

## Missouri reference values
- MAP Eng. Language Arts: (198659) / 451477 × 100 = 44.002020%; dese_map_2025_state_content_area.xlsx, Sheet1 row 46, columns PROFICIENT, ADVANCED, REPORTABLE. Independently checked against sum of all four published achievement counts = REPORTABLE. No missing component is derived.
- MAP Mathematics: (193897) / 454818 × 100 = 42.631778%; dese_map_2025_state_content_area.xlsx, Sheet1 row 47, columns PROFICIENT, ADVANCED, REPORTABLE. Independently checked against sum of all four published achievement counts = REPORTABLE. No missing component is derived.
- MAP Science: (78294) / 195818 × 100 = 39.983045%; dese_map_2025_state_content_area.xlsx, Sheet1 row 48, columns PROFICIENT, ADVANCED, REPORTABLE. Independently checked against sum of all four published achievement counts = REPORTABLE. No missing component is derived.
- MAP Social Studies: (27239) / 66470 × 100 = 40.979389%; dese_map_2025_state_content_area.xlsx, Sheet1 row 49, columns PROFICIENT, ADVANCED, REPORTABLE. Independently checked against sum of all four published achievement counts = REPORTABLE. No missing component is derived.
- Demographic Black: 130504 / 772194 × 100 = 16.900416%; 295/564 paired reportable district records. This is a reportable-district subset, not a complete statewide rate.
- Demographic FRL: 379352.2 / 803686.09 × 100 = 47.201539%; 536/564 paired reportable district records. This is a reportable-district subset, not a complete statewide rate.
- FRL reference exclusions: 10 missing/nonpositive pairs and 18 records with count greater than membership (including source precision differences). These raw values are not corrected, clamped or added to the reference. Exact source codes/counts are in kpi-calculations.json.
- APR Eng. Language Arts: 498 / 1993 × 100 = 24.987456% Target; 146 of 2139 building records excluded as ineligible/unreported; dese_apr_2025_building_supporting.xlsx, Sheet1, columns ELA_ALL_GROWTH_POINTS_POSSIBLE, ELA_ALL_GROWTH_POINTS_EARNED, ELA_ALL_GROWTH_PERFORMANCE_DESIGNATION. District APR rows are not added.
- APR Mathematics: 492 / 1994 × 100 = 24.674022% Target; 145 of 2139 building records excluded as ineligible/unreported; dese_apr_2025_building_supporting.xlsx, Sheet1, columns MATH_ALL_GROWTH_POINTS_POSSIBLE, MATH_ALL_GROWTH_POINTS_EARNED, MATH_ALL_GROWTH_PERFORMANCE_DESIGNATION. District APR rows are not added.

Missingness: raw * is documented as suppressed without inferring small cell size. Blank master/history cells do not prove a suppression cause. No suppressed value is reconstructed.
Unresolved: directory reporting year, matched-grade MAP state records, official school-specific MAP targets, complete unsuppressed statewide demographic counts, verified scholarships/events, other-partnership deduplication and current 2026–27 enrollment.

## Exact workbook paths

- Network demographic and FRL counts: `data/enrollment_demographics/dese_district_demographics_1991_2025.xlsx`, Sheet1; only YEAR=2025, one row per COUNTY_DISTRICT_CODE.
- Building demographic and FRL detail: `data/enrollment_demographics/dese_building_demographics_2006_2025.xlsx`, Sheet1; YEAR=2025, unique county/district + building keys.
- Preliminary enrollment and existing longitudinal reports: `data/master/oscp_dese_cohort_master_2025_2026.xlsx`; Cohort Master, Building Cohort and Historical Demographics.
- Directory: `data/enrollment_demographics/dese_school_building_directory_undated.xlsx`; School Building List, actual headers row 4. Only school names, identifier pairs, grade spans and source row are exported; contact/personnel fields are excluded.
- State MAP: `data/assessments/dese_map_2025_state_content_area.xlsx`, Sheet1. State Total ELA row 46, Math row 47, Science row 48, Social Studies row 49.
- Charter MAP: `data/assessments/dese_map_2025_district_content_area.xlsx`, Sheet1. Only six cohort LEAs feed network MAP aggregates; building rows are never added.
- Building MAP: `data/assessments/dese_map_2025_school_content_area.xlsx`, Sheet1. Existing reports retain suppression and use only cohort building keys.
- APR: `data/accountability/dese_apr_2025_building_supporting.xlsx`, Sheet1. Cohort shared totals are checked against the building summary. District supporting rows are read but never added to building growth denominators.

## Comparison interpretation

- No arithmetic average of school percentages is used for a KPI or state reference.
- The MAP card reports P+A across the same three reportable charter networks, not all six. ELA and Math retain separate tested denominators. No grade-matched above-state percentage or official school-specific goal is invented.
- State all-tested-grades MAP is displayed separately as context, with subject and student group matched. No difference/above-state classification is calculated without grade-specific state data.
- State demographic values are reportable-district subset summaries. For Black enrollment, 269 records lack usable paired values. For FRL, 10 lack usable pairs and 18 have a reported count greater than membership, sometimes because of source precision differences. No count is clamped or imputed.
- APR Target means the exact source designation. Eligibility requires positive points possible plus reported earned points and designation; Participation is included and On-Track is not Target. The statewide denominator counts unique building records only. The optional grade-span filter restricts both the selected cohort and state reference to the same source grade span.
- Small-group suppression is not inferred. * is suppression with unspecified cause in these extracts; blank/NULL/NA is not reported. Numeric fields remain null with separate missingness metadata. Unavailable* labels and footnotes explain the display.

## Verification and refresh

Run `python build.py`, `python -m unittest test_data.py test_reporting.py`, `node --check app.js`, `python test_dashboard.py`, then `python scripts/write_kpi_report.py`. Source byte preservation can be verified with `python scripts/audit_excel_sources.py verify`.

- Before feedback: build, 8 data tests, JavaScript syntax and existing Chrome QA passed.
- After feedback: build, 16 data/calculation tests and JavaScript syntax passed. Independent tests reopen the source demographic, State MAP and APR workbooks and recalculate the denominators.
- Browser executed: True; Chart.js CDN loaded: True; viewport widths: [320, 768, 1440].
- Browser: repository-subpath loading
- Browser: independent filters
- Browser: six school and two reporting level filters
- Browser: all demographic and MAP measure filters
- Browser: student group and subject filters
- Browser: historical year range
- Browser: filtered CSV content
- Browser: search
- Browser: reset
- Browser: missing metric exclusion
- Browser: MAP suppression coverage
- Browser: six keyboard card anchors
- Browser: 1/2/3 column card layouts
- Browser: growth and FRL filters
- Browser: ineligible growth missing values
- Browser: missingness footnotes
- Browser: state reference limitations
- Browser: keyboard filter focus
- Browser: no page overflow
- Browser: CDN failure tables
- Browser: no browser exceptions

Historical source-cleanup evidence remains in docs/source-files.md and ignored qa/source-reorganization/. Subsequent reporting extensions intentionally add new fields; the current regression tests preserve old numerical records rather than asserting the entire earlier schema is frozen.

GitHub deployment is verified separately after push: remote main must equal local HEAD, Pages workflow must succeed, and live JSON/HTML must match the local public bundle. Never use push success alone as proof of deployment.
