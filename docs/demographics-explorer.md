# Student Demographics Explorer

This is an opt-in analytical workspace inside **Student Demographics**. The existing homepage, six KPI cards, navigation, public summary charts and independent Explore Data reports remain intact. Select **Explore Student Demographics** to open it, or use the `#demographicsExplorer` anchor.

## Sources and reporting periods

The Python build adds one `demographics_explorer` dataset to the existing public JSON. It selects only the current six network identifiers and 14 verified building identifiers from the original DESE demographic workbooks:

| Source | Level | Cohort records | Actual cohort years |
| --- | --- | --- | --- |
| `data/enrollment_demographics/dese_district_demographics_1991_2025.xlsx`, Sheet1 | Network | 96 | 2007–2025, varying coverage |
| `data/enrollment_demographics/dese_building_demographics_2006_2025.xlsx`, Sheet1 | Building | 175 | 2007–2025, varying coverage |

The workbook-wide filename periods are not a claim that the selected cohort has records in every workbook year. Every extracted row preserves its level, year, source-era name, workbook, worksheet and original row number. Current directory names label historical identifiers; they do not establish that a building's name, facility or sponsorship was unchanged historically. Historical records can predate SLU sponsorship. The source workbooks are read-only and retain their original hashes.

The default is **Académie Lafayette / network totals / 2025 / Black enrollment**, giving a reportable single-network history and useful school peers. The 2026–27 dashboard edition remains separate. Historical 2025 K–12 enrollment across all six networks is **3,913**, whereas the existing preliminary 2025–26 KPI is **3,953**. Neither is substituted for the other, and preliminary enrollment is not appended to historical lines.

## Measures and calculations

| Measure | Single-unit value | Aggregation rule |
| --- | --- | --- |
| K–12 enrollment | Published `ENROLLMENT_GRADES_K_12` | Sum only when every selected unit reports a valid count in the same year/level |
| Black, Hispanic, White, Multiracial | Published category count / K–12 enrollment × 100 | Ratio of summed paired counts, only when every selected unit has a valid pair |
| Free/reduced-price lunch (FRL) | Reported FRL count / January membership × 100 | Same complete-pair rule; January membership is not fall enrollment |
| English learners (EL) | EL enrolled K–12 / K–12 enrollment × 100 | Same complete-pair rule; preschool EL counts are excluded |
| IEP incidence | Published `IEP_INCIDENCE_RATE` | Single network or building only; no combined denominator is verified |

IEP means Individualized Education Program. The IEP child count is preserved as a source numerator, but is never divided by a guessed denominator. A valid published percentage without a usable count pair may be displayed for one unit, but cannot contribute to an aggregate. No network/school percentages are averaged. District and building rows are never added together.

The compact KPI strip contains the eight measures above. It displays the selected year, applicable population/denominator and unavailable reason. For multi-unit summaries, missing source rows and missing pairs make the combined value unavailable; incomplete subset totals are not presented as full cohort totals. The existing 2025 cohort Black and FRL count ratios are independently reproduced by the new data.

## Shared state and dependent filters

`DemographicsExplorer` owns one state: network, building, year, measure, comparison level, sorting, visible needs series and optional enrollment comparison networks. Charts, KPIs, active-selection text, detailed rows and exports derive from it.

- **Network:** All six or one network. A network change clears an incompatible building, with a visible explanation.
- **School/building:** The list is limited to the selected network, or all 14 records when all networks are selected. Selecting a building also selects its network, with a notice. “All (use network totals)” explicitly restores network-level records; it does not add buildings to networks.
- **Year:** Only years with a reportable selected measure for the selected unit(s) are offered. If changing the population/measure makes the previous year unavailable, the latest reportable year is selected with an explicit notice. If no years exist, the year control is disabled and unavailable states remain visible. No chart retains another year's data behind the selected label.
- **Measure:** Four separately labelled race/ethnicity choices, FRL, EL or IEP. The measure drives year availability, school comparisons and Missouri context. The race panel and eight KPIs continue to show their own same-year source values, including missingness.
- **History:** Every line ends at the shared selected year. Earlier missing years are represented by null gaps, never interpolation.
- **Reset:** Restores the default explorer view, series and comparisons without changing other dashboard controls.

Current network/building, reporting level, year and measure are always visible. Dependent changes are announced through a status notice; active selections use a live region.

## Coordinated visualizations

1. **Reported racial/ethnic categories:** Four horizontal percentage bars with stable category colors, direct percentage labels and source-row tooltips. These categories are deliberately labelled incomplete; no pie, residual “other” category or complete-distribution claim is made.
2. **Student characteristics over time:** FRL, EL and IEP lines have different colors, dash patterns and point shapes. Labelled checkboxes toggle each series. Their denominator differences appear next to the chart and in tooltips. An explicit empty-selection message distinguishes hidden series from missing source data. Historical methodology changes cannot be fully established from these extracts, so no invariant-definition or causal trend claim is made.
3. **Historical K–12 enrollment:** One network/building by default. A network view may add up to two network lines; an All-networks view shows at most three lines. Building views disable network comparison lines to avoid mixed levels. Descriptions remain neutral because these extracts do not prove that every historical reporting method or population is invariant.
4. **Compare schools and networks:** Current-year values sorted descending or alphabetically, with reportable/total current-cohort record coverage. Automatic level shows building peers inside one network and network peers across all six. An explicit level control allows all 14 building records to be compared across networks, or a network-only comparison. Bars grow vertically to keep labels readable. Missing values are excluded from plotted bars but remain unavailable in selection buttons and source records.
5. **Missouri state context:** The verified 2025 context uses the audit's official Black, Hispanic, White, Multiracial, FRL, EL or IEP publication where available. Official publication year and population are displayed separately from the selected source year. Earlier selected years receive **“Missouri comparison unavailable for this measure and reporting period.”** The current state reference is never silently carried backward. There is no percentage-point gap or matched-comparison claim. A selected unavailable aggregate is not plotted at zero.

Clicking a reportable comparison bar selects its network or building and updates applicable panels. Labelled buttons provide a keyboard alternative, and the native shared dropdowns provide the same selection path. Chart redraw is deferred until Chart.js finishes handling the click to avoid destroying its tooltip/event handler mid-event. With a selected building, same-year sibling peers deliberately remain visible; this peer context is identified in text rather than mixed into the selected building's KPIs.

## Details, CSV and missingness

**View detailed data & source records** is collapsed by default and includes **Download filtered CSV**. The table shows historical selected units through the selected year, current-year peers and optional enrollment comparison histories. The **Used in** and **Level** columns distinguish those roles; rows are deduplicated by identifier/year and are never summed across roles.

CSV includes shared filter metadata and source-era names, year, reporting level, identifiers, metric, full-precision value, original numerator, denominator, published percentage, calculation method, population, missingness/limitation, exact source file/sheet/row and role. Display rounding does not change CSV precision. CSV formula-prefix protection is preserved. Numeric suppressed/unreported cells remain unavailable with their reason; no missing value becomes zero and no suppressed count is recovered through subtraction.

## Design, responsiveness and fallback

All new styles are scoped to the explorer and reuse the existing blue/navy/gray palette, system typography, spacing and native details/select/button components. The drawer is closed by default, so the existing homepage charts and layout remain. Five charts initialize only when the workspace opens. Desktop uses a compact filter bar, four-column KPI strip and two-column chart grid; smaller widths stack panels and filters, with two-column compact KPIs. Labels, legends and bounded data-table scrolling prevent horizontal page overflow.

Line series use color plus dash/point differences. Context bars distinguish blue sponsored values and outlined gray Missouri values. Canvas descriptions reference their question and interpretation, while detailed values remain accessible without interpreting chart geometry. With the Chart.js CDN explicitly blocked, each chart has a readable HTML value alternative, the data disclosure opens automatically, and filters, selection buttons, reset and CSV continue to work. No Tableau software, backend, paid service or additional runtime dependency is required.

## Verification and screenshots

Run:

```text
python build.py
python -m unittest discover
node --check app.js
python scripts/audit_excel_sources.py verify
python test_dashboard.py
```

Five new Python tests reopen the source files and verify every selected record's numerator, denominator, published percentage and calculation, population keys, null preservation, IEP restrictions and reconciliation with existing KPIs. The legacy payload regression excludes only the new additive dataset and build timestamp; every pre-existing validated field remains protected by its original baseline hash.

Browser regressions cover all network/measure selections, dependent schools, historical year changes, notices, all-14-building comparisons, sorting, line toggles, actual chart-click cross-filtering, keyboard selectors, reset, source-preserving CSV, unavailable historical state context and blocked-CDN alternatives. Existing homepage/navigation/filter/export checks still run at **320, 375, 768, 1024 and 1440px**. Rendered screenshots are generated under `qa/demographics-explorer/` for the header/KPIs and all five chart panels at each width. Representative screenshots are retained with this document.

## Known limitations

- The historical population is the current sponsored cohort's identifiers, not a reconstructed roster of all schools sponsored in every past year.
- Not every record or measure exists in every year; the earliest/latest reportable years differ by network, building and measure.
- No complete cohort-wide IEP rate is constructed; select one network/building for its published incidence.
- The four race categories are not exhaustive. Other source categories are not reconstructed or folded into these four.
- The seven current Missouri demographic reference rates are contextual publications; there is no historical statewide benchmark series in this feature.
- Source exports alone do not establish all historical definition changes. Enrollment/needs trends are descriptive and neutral.
- No attendance metric, finalized 2026–27 enrollment, physical campus total or new causal impact claim is introduced.

## Final verification results

- Python build passed; JavaScript syntax and Git whitespace checks passed.
- All 27 Python regression tests passed.
- All 11 original workbook hashes are unchanged.
- All pre-existing JSON fields match the previous release exactly apart from the build timestamp. Removing the new entry/drawer reproduces the prior HTML exactly; the original CSS remains an unchanged prefix followed by scoped explorer styles.
- Full Chrome regression passed at all five required widths, including physical chart clicks, keyboard alternatives, dependent year changes, CSV and explicit CDN failure. No browser exceptions or page overflow were observed.

[Desktop workspace](demographics-explorer-screenshots/desktop.png) ? [Mobile workspace](demographics-explorer-screenshots/mobile.png) ? [Mobile student-needs history](demographics-explorer-screenshots/student-needs-mobile.png) ? [Tablet comparison](demographics-explorer-screenshots/comparison-tablet.png) ? [Missouri context](demographics-explorer-screenshots/missouri-context.png).
