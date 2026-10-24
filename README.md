# OSCP Impact Dashboard | 2026–2027

A static, responsive SLU-inspired reporting workspace. The edition is 2026–2027; source enrollment is **2025–26 preliminary K–12**, demographics / MAP are **2025**, and historical data covers **2007–2025** with variable school-year coverage. No runtime Python or backend is needed.

## Interactive reports

Each report has independent filters and its own Reset chart, legend, source caption, accessible values table, and Download CSV control. CSV files include the current filter context and generation time. Reset all reports restores the entire workspace. The three overview cards always describe all six schools.

- **Student demographics:** school, charter/building level, available student characteristic and sorting. Incomplete race/ethnicity categories remain separate comparisons.
- **Partnership milestones:** school opening versus SLU sponsorship start, with school and milestone selectors. Legend shapes match the plotted markers.
- **MAP outcomes:** all four available subjects, student groups, published achievement-level counts/percentages, reportable/accountable counts, and calculated P+A where both components are published. Filter by school, reporting level, group, measure and subject. Groups and subjects overlap and are never summed. The source's undefined “Student Group” label is disclosed explicitly.
- **Historical trends:** all 96 supplied school-year records, school/measure/from/to filters, disconnected missing values, distinct school marker shapes. Metrics unavailable in the selected period are omitted from its selector. These records may predate SLU sponsorship and do not establish effects of sponsorship.
- **Coverage matrix:** school/building source values, explicitly distinguished from unavailable/suppressed cells; no missing-to-zero conversion.
- **Directory:** search school names/LEAs and choose focused column groups or all available fields.
- **Enrollment:** school, charter/building level, period/measure and sorting. K–12 and reportable preschool are separate choices. Partial preschool totals are labeled as reportable records only, not complete enrollment.

The public JSON includes 14 building records, 96 historical school-years, and 516 matched assessment slices. Other LEAs, private tracker notes and unconfirmed sponsorships remain excluded. Inventory metadata covers every worksheet, including the empty FY24 tracker tab.

## Build and preview

Keep the four supplied `.xlsx` workbooks in `data/` with their existing filenames.

```powershell
python -m pip install -r requirements.txt
python build.py
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. Run the build again after editing source data or web assets. `dist/` contains only the four deployable public files. Root web files remain the editable source.

## Validation

The build reads all 14 worksheets in four workbooks and fails on mismatched school identifiers, duplicate LEAs/building identifiers, invalid percentages, inconsistent reporting periods, enrollment reconciliation failures, or MAP values that disagree with the supplied raw district / building records. Do not run Python with `-O`, which disables assertions.

Generated local review files (excluded from Git):

- `qa/QA-report.md`: exclusions, missing metrics, coverage and reconciliation.
- `qa/workbook-inventory.json`: every worksheet, column name and nonempty row count.
- `qa/event-audit.json`: normalized tracker records, source sheet/row lineage and duplicate decisions. Keep private.

Optional browser tests require Google Chrome on Windows and test-only packages `requests` and `websocket-client`:

```powershell
python -m pip install requests websocket-client
node --check app.js
python test_dashboard.py
python -m unittest test_data.py
```

Browser tests exercise independent report filters, all six schools and both reporting levels, demographic/MAP measures, student groups, subjects, year ranges, search, filtered CSV content, reset controls, timeline labels, keyboard focus, repository-subpath loading, 320px / 768px / 1440px widths, JavaScript errors and blocked-CDN fallback tables. Screenshots and results go to `qa/`. Chrome runs headlessly and the test stops its own browser and temporary HTTP server, leaving a separately launched preview running.

## GitHub Pages

Commit source web assets, build script, generated `dashboard-data.json`, and **all four files in `dist/`**. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions**. The included `.github/workflows/pages.yml` publishes only `dist/` on pushes to `main` that change public artifacts; it can also be run manually. It deliberately does not require private workbooks in CI. Relative asset paths support a repository subpath. Deployment has not been performed from this workspace.

`data/` and `qa/` are ignored. Ignoring files does not remove previously tracked files: check repository history before making a repository public. Do not publish raw workbooks or tracker audit notes. If branch-based hosting is preferred, copy only the contents of `dist/` into the publishing branch root.

## Data rules and limitations

- Six unique charter records reconcile to **3,953 preliminary K–12 students**; preschool is excluded. This is not an unduplicated count of all OSCP participants.
- Source school names and LEAs are retained. School comparisons are charter-level; DESE buildings are used for validation, not physical campus counts.
- MAP P+A is `(published Proficient + published Advanced) / Reportable × 100`, rounded to two decimals. Both components must be reportable. Suppressed or absent values remain null; no subtraction or reconstruction.
- Three schools have paired reportable ELA / Math values. Coverage is shown with every comparison. Metrics unavailable for a selected school disappear from the selector.
- Demographic percentages and preliminary enrollment are taken from the cohort master. Original demographic / enrollment extracts listed in its source register were not supplied, so those values are not independently verified against the originals.
- Racial/ethnic fields are incomplete; individual categories can be compared, but no complete-composition chart or inferred remainder is shown.
- No verified locations or grade spans are supplied; no location filter, grade field or physical-campus total is displayed. Historical records have their own year-range filters and are not mixed with preliminary enrollment or current 2025 outcomes.
- No confirmed scholarship awards or approved events are supplied. These sections acknowledge pending verification without numerical KPIs or request tables. Duplicate tracker tabs never establish multiple events or fiscal-year attribution. A future confirmed event record intentionally stops the build until its public presentation is reviewed.
- Chart.js is pinned to a CDN version. If unavailable, labeled tables retain every reportable value and filtering continues. Tables are always available for screen readers. Text branding uses no official logo asset.
