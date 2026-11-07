# OSCP impact dashboard: UI redesign

Baseline: verified commit `8473a2c`. This release changes presentation and interaction, not the data pipeline, original workbooks, calculations or public dataset schema. The existing static GitHub Pages architecture and four-file deployment remain.

## Problems addressed

The previous page placed eleven analytical reports, their filters, full source references and wide tables in a single reading flow. Six similarly styled KPI cards led into technical reports rather than an explanation. Reporting levels, MSIP populations, grade comparisons and APR eligibility competed for attention. Mobile navigation occupied multiple rows, and a first-time visitor needed to understand reporting vocabulary before finding the main findings.

## Information architecture and default journey

1. **Overview:** what the dashboard represents, its four reporting periods and six clickable measures. Preliminary enrollment receives primary visual emphasis; every card includes its population and period.
2. **Students & Schools:** the 3,953-student total, six enrollment bars and a searchable directory of 14 verified records. School details preserve network versus building opening distinctions and shared-address warnings.
3. **Student Demographics:** an approximate “61 out of every 100” interpretation of the FRL rate, followed by one characteristic at a time. Black enrollment, FRL, English learners and IEP incidence are explained separately.
4. **Academic Performance:** plain-language MAP and proficiency explanations, separate ELA/Math aggregate cards, and the exact-grade comparison. Its default is grade 3 ELA with four eligible schools and one above the matching Missouri rate.
5. **Academic Growth:** numerator-first ELA and Math cards, directly labelled sponsored/state eligible-building bars, and the definition of APR Target attainment.
6. **Explore Data:** ten expandable analytical reports preserve all existing datasets, independent controls, levels, subgroups, historical filters, source notes and CSV exports. The public grade comparison retains its complete independent filters as well.

Scholarships and community partnerships remain visibly pending verification. They have their own anchor links and do not present requests as confirmed awards or funding. The source register, definitions and coverage inventory remain accessible at the end of the page.

The intended first-time journey is to read the overview, recognize the reporting periods and six measures, and choose one story. Advanced controls are optional. The design targets a roughly 30-second first reading; this is a design objective, not a measured usability-study result.

## Visual and chart decisions

Restrained SLU-inspired blue, navy, white and light gray establish a university/public-sector identity. System sans-serif body text avoids an additional font dependency; Georgia headings provide an editorial hierarchy. The SLU text mark is a simple local typographic treatment, not an assertion of an official university logo asset. Icons are inline SVG, with decorative elements hidden from assistive technology.

| Information | Presentation | Reason |
| --- | --- | --- |
| Six verified measures | Numerator-first KPI cards | Main findings appear without chart interpretation |
| Enrollment by network | Labelled horizontal HTML bars | Six networks, readable values, no chart-library dependency |
| Demographic percentages | Horizontal bars on a 0–100% scale | One characteristic at a time; no misleading incomplete-composition pie |
| Lunch eligibility | Approximate per-100 interpretation plus exact counts | Plain language with the original January membership denominator |
| Grade-specific MAP | Paired horizontal bars | Same year, subject, grade/course and source subgroup |
| Growth | Directly labelled paired progress bars | Denominators remain explicit; eligible buildings are never described as students |
| Historical trends | Existing line explorer | Optional analytical detail, with disconnected missing years and separate preliminary periods |
| School directory | Searchable cards and expandable identifiers | Names, grades and locations appear before technical codes |

Sponsored results use blue. Missouri uses gray outlines in the MAP chart, so fill versus outline provides a second visual distinction. Growth pairs label both populations directly. Tables provide the full alternative to chart colors and geometry. Display rounding does not change calculation precision.

## Progressive disclosure and interactions

- Six sticky navigation links follow the public story, with an active-section indicator.
- The mobile menu uses a native button with `aria-expanded` and `aria-controls`. Enter opens it; Escape closes it and returns focus. Selecting a destination closes the menu and focuses the section.
- KPI cards are native keyboard-accessible links. Detailed-report links open the appropriate explorer before focusing it.
- Every analytical table is behind **View data table**. Each report has an independently expandable source/interpretation note.
- **Advanced filters** contains reporting level, subgroup and other secondary selections. Its summary displays the current hidden selections; the visible report context updates independently.
- The grade comparison keeps subject, grade/course and network controls visible. Its heading, eligible denominator and takeaway change together. Zero eligible comparisons produce an explanation rather than a fabricated rate.
- Public school search, network selection and reset are independent of analytical filters. Original DESE identifiers, directory conflicts and source links remain available in details.
- Print temporarily expands disclosure panels, then restores their previous state.

## Mobile, accessibility and performance

Tested widths: **320, 375, 768, 1024 and 1440px**. Cards move from three columns to two to one. The sticky navigation becomes a compact menu below 781px. Public bars stack labels above tracks on narrow screens; school cards become a single column. Wide analytical tables scroll inside bounded regions and do not enlarge the page.

The page has one H1, descriptive section headings, a skip link, visible keyboard focus, native controls, labelled inputs, reduced-motion support and real table headers/captions. Chart canvases reference their context and takeaway; tables remain available to assistive technology. No meaning depends on red/green status colors.

Public enrollment, demographic and growth bars use HTML and keep working if Chart.js fails. In the actual blocked-CDN test, analytical data disclosures open automatically and CSV exports remain available. Only the public matched-grade chart initializes by default; advanced charts initialize when their reports open. No backend, build framework, paid service, image service or new runtime dependency was introduced.

## Data safeguards

`test_ui.py` compares the complete normalized public payload against the verified baseline, excluding only the generation timestamp. It detects changes to any validated dataset, numerical KPI, missingness field, source reference or schema. All six KPI families remain unchanged. The original 11 workbook SHA-256 checks remain unchanged. `build.py`, `reporting.py`, `independent_reporting.py` and the tracked independent reference snapshot are unmodified by this redesign.

The public demographic bars use the existing validated count-derived Black/FRL ratios or existing source EL/IEP rates. They never average network percentages into a combined rate. Official Missouri references retain their own years/population notes and do not produce automatic percentage-point gaps. The existing MSIP aggregate MAP values remain distinct from grade-export comparisons. No school-specific target, 2026–27 enrollment, new campus count or causal impact claim is introduced.

## QA and screenshots

Run:

```text
python build.py
python -m unittest discover
node --check app.js
python scripts/audit_excel_sources.py verify
python test_dashboard.py
```

Python coverage includes the original calculation/source regressions and two new UI contract tests. Browser coverage preserves the existing independent-filter, all-subject/subgroup, missingness, CSV, historical, source and reset checks, and adds public filters/search, six section destinations, active navigation, keyboard mobile menu, report deep links, lazy chart initialization, progressive disclosure, dynamic MAP titles/takeaways and the blocked-CDN path. Source citations, school cards and all report plots are checked at the five required widths. Actual desktop, tablet and mobile images were reviewed during implementation.

Representative screenshots are retained in [ui-screenshots](ui-screenshots/). Complete local captures are generated under ignored `qa/`:

- `qa/ui-redesign/before-{320,768,1440}.png`
- `qa/dashboard-{320,375,768,1024,1440}.png`
- `qa/kpis-{320,375,768,1024,1440}.png`
- `qa/matchedMap-plot-{320,375,768,1024,1440}.png`
- `qa/ui-redesign/{networkStory,demographicsStory,growthStory,directory}-{width}.png`
- `qa/browser-results.json`

## Remaining limitations

Suppressed or unreported source values remain unavailable. The dashboard cannot show official school-specific proficiency targets, finalized 2026–27 enrollment, confirmed scholarships, confirmed sponsorships or unduplicated additional partnership participants without new verified records. Shared street addresses still do not establish physical campus counts. The complete analyst payload is retained; this release improves presentation and defers chart construction rather than changing that data contract. Manual screen-reader testing and a formal first-time-user study have not been performed.

The existing Pages workflow deploys only `dist/`. After pushing the release, verify workflow success and compare all four live files against the committed Git blobs; a successful push alone is not deployment verification.

## Final validation result

- Build passed; all four deployment files match their root source/generated files.
- `python -m unittest discover`: 22 tests passed.
- JavaScript syntax and Git whitespace checks passed.
- Original-workbook integrity: all 11 SHA-256 hashes unchanged.
- Browser checks passed at all five required widths, with Chart.js loaded and with the CDN explicitly blocked.
- Baseline-payload regression passed: every validated field is unchanged except the generation timestamp.

### Representative visual review

[Before, desktop](ui-screenshots/before-desktop.png) ? [After, desktop](ui-screenshots/after-desktop.png) ? [Six KPI cards](ui-screenshots/overview-cards.png) ? [Mobile](ui-screenshots/after-mobile.png) ? [Tablet growth](ui-screenshots/growth-tablet.png) ? [Mobile grade comparison](ui-screenshots/grade-comparison-mobile.png).
