# OSCP Impact Dashboard | 2026–2027

Static, responsive reporting for Saint Louis University's Office of School and Community Partnerships. The edition is **2026–2027**. Enrollment is **2025–26 preliminary K–12**; demographics, MAP and APR are **2025**. Historical records span **2007–2025**, with variable coverage. The directory is **undated**.

Live site: https://xxender13.github.io/OSCP-Dashboard/

## Six linked KPI cards

Each card opens and focuses its detailed report, works with Enter on a keyboard, and respects reduced-motion preferences. Cards use three desktop columns, two tablet columns and one mobile column. They describe the full portfolio independently of each report's filters.

| Card | Display and formula | Source year / denominator |
| --- | --- | --- |
| Students Served | **3,953**; sum unique charter-network K–12 preliminary enrollment | 2025–26 preliminary; six networks; excludes preschool and unverified partnerships |
| Student Demographics | **32.07% identifying as Black** = 1,255 / 3,913 × 100 | 2025 district demographic counts; all six networks; not an unweighted percentage average |
| Free/Reduced Lunch Students Served | **2,330; 61.06%** = 2,330 / 3,816 × 100 | 2025 reported FRL count / January membership; never divided by 3,953 preliminary enrollment |
| Sponsored Schools | **14** distinct `(CTYDIST, SCHNUM)` pairs across six networks | Supplied directory, reporting year unavailable; not verified 2026 records or 14 unique physical campuses |
| MAP Scores | **ELA 46.95%** = 823 / 1,753 × 100; **Math 49.69%** = 877 / 1,765 × 100 | 2025 Charter Total P+A; same three reportable networks per subject; suppressed networks excluded |
| Growth | **ELA 53.85%** = 7 / 13 × 100; **Math 38.46%** = 5 / 13 × 100 | 2025 APR building ALL growth measures: eligible buildings with designation Target; not percentage of students growing |

Exact workbook paths, source columns, independent checks, state references and limitations are in [KPI definitions and QA](docs/kpi-definitions.md). The full private trace is generated at `qa/kpi-calculations.json`.

## Missouri comparisons

- State Total MAP P+A uses `(PROFICIENT + ADVANCED) / REPORTABLE × 100`: ELA **44.00%** (198,659 / 451,477), Math **42.63%** (193,897 / 454,818), Science **39.98%** (78,294 / 195,818), Social Studies **40.98%** (27,239 / 66,470). All four total rows are independently checked against their four fully published achievement-count sums. Rounded source percentages are not added or averaged.
- State MAP files contain all-tested-grades aggregates, not matched grade spans. State references appear as separate context. A grade-matched percentage of schools exceeding Missouri is **Unavailable***, and no school-specific official proficiency goal is invented.
- Black enrollment reference: **16.90%** = 130,504 / 772,194 × 100 over **295/564 paired reportable district records**. This is not a complete statewide population rate.
- FRL reference: **47.20%** = 379,352.2 / 803,686.09 × 100 over **536/564 usable district records**. Excludes 10 missing/nonpositive pairs and 18 count/membership inconsistencies, including precision differences. Raw values are never clamped, imputed or changed. Source membership counts may be fractional.
- APR reference: ELA **24.99%** (498 / 1,993), Math **24.67%** (492 / 1,994) eligible buildings designated Target. The building supporting file contains 2,139 unique source buildings. Positive growth points possible plus reported earned points and designation define eligibility; Participation stays in the denominator. On-Track is not Target. Optional source-grade-span filtering restricts both cohort and state denominators.
- No state benchmark is invented for IEP incidence or another measure without a verified compatible denominator. District and building populations are never added together.

## Interactive reports and missingness

Existing demographic, milestone, MAP, history, coverage, directory and enrollment reports remain. New reports show FRL counts/January membership, the 14 directory identifiers, and APR growth. Filters are independent, with Reset chart, Reset all reports, accessible data tables, matching legends, source captions, and CSV exports of filtered values/context. CSV exports include a missing-data explanation.

`Unavailable*` means the numerical field remains null, with a separate `missingness` object explaining the source. A raw `*` is suppression; the supplied extracts do not state why, so small group size is not inferred. Blank, NULL or NA is not reported/unavailable. Missing records are shown in relevant tables, excluded from numeric charts/calculations, and included in coverage explanations. Historical gaps stay disconnected and do not imply a causal sponsorship effect.

No confirmed scholarship awards, approved community-event totals or unduplicated additional partnership reach are supplied. Those sections remain explanatory and contain no invented outcome totals. Private tracker notes, invite lists, directory contacts and personnel fields are not published.

## Source layout and build

All **11 unchanged workbooks / 21 worksheets** are under `data/`, organized by master, enrollment_demographics, assessments, accountability, and sponsorships. See the [original-to-canonical catalog](docs/source-files.md) and checksum manifest [source-files.json](docs/source-files.json). `build.py` explicitly registers these inputs in `SOURCE_PATHS`. The completed earlier cleanup audit is historical evidence; current feature reporting intentionally adds new datasets and schema fields while preserving existing numerical records.

```powershell
python -m pip install -r requirements.txt
python build.py
python -m http.server 8000 --directory dist
```

Open http://localhost:8000. Python extracts, validates and transforms data at build time; Pages requires no backend. Rebuild after changes to inputs or web assets. `dist/` contains only `index.html`, `styles.css`, `app.js`, and aggregate `dashboard-data.json`. Asset paths are relative for repository-subpath hosting.

## Checks and refresh

```powershell
python build.py
python -m unittest test_data.py test_reporting.py
node --check app.js
python scripts/audit_excel_sources.py verify
```

Optional browser QA requires installed Chrome on Windows and test-only dependencies `requests` and `websocket-client`:

```powershell
python -m pip install requests websocket-client
python test_dashboard.py
python scripts/write_kpi_report.py
```

The 16 tests include independently reopened State MAP, district demographics and building APR sources; exact numerators/denominators; six network / 14 identifier checks; source byte hashes; suppression; original metric preservation; and asset references. Chrome tests exercise all six keyboard card anchors, responsive 3/2/1-column layouts, existing and new filters, grade-span/eligibility cases, search, CSV, resets, missingness footnotes and blocked-CDN table fallback. Results and screenshots go to ignored `qa/`. The test stops its own browser and temporary server.

Generated local QA includes `QA-report.md`, `kpi-calculations.json`, `workbook-inventory.json`, `event-audit.json`, and `browser-results.json`. Original cleanup evidence remains in `qa/source-reorganization/`. `scripts/audit_excel_sources.py verify` checks original bytes without requiring a later feature release to match the old dashboard design/schema. Do not rerun the one-time migration script.

## GitHub Pages

The existing `.github/workflows/pages.yml` publishes only `dist/` on applicable pushes to `main`. GitHub Pages uses GitHub Actions. Commit intended source files, documentation, tests and regenerated public artifacts. Raw `data/`, local `qa/` and caches stay ignored; source workbooks are not needed in the deployment job.

After a push, confirm remote `main` equals local HEAD, check the Pages workflow's terminal result, and verify live HTML/JSON against the local public bundle. A successful push alone does not establish deployment success. No force push or repository-secret change is required.

## Remaining data limitations

Directory reporting year and unique campus counts; current 2026–27 enrollment; complete unsuppressed statewide demographic counts; grade-matched state MAP results and official school-specific proficiency targets; confirmed scholarship/event records; other-partnership counts and deduplication rules; and a verified statewide IEP-incidence denominator remain unavailable.
