# SLU OSCP Charter Partnerships Dashboard

Static Python-built dashboard for Saint Louis University Office of School and Community Partnerships. School means one of the six sponsored charter Schools; Building means one of 14 DESE identifiers. Missouri is a reference level only. See the glossary on the page for School (charter network / DESE district).

## Pages and data

- `index.html`: seven-part public summary, level switcher, source/year/coverage captions, eight KPI tiles grouped by objective, program confirmation status, presentation and PDF printing.
- `explorer.html`: five grouped analytical workspaces retaining the existing independent report filters, source tables and CSV, plus the coordinated demographic history and sponsorship requests log.
- Both pages use `app.js` and `styles.css`. Chart.js **4.4.8** is self-hosted in `vendor/` with its license; no runtime CDN dependency.
- `summary.json` is the only main-page data request and is validated under 400 KB. Explorer packets load on `explorer.html` and never on the summary page. The full legacy `dashboard-data.json` remains available for regression/provenance, but neither page fetches it.
- The 11 original workbooks / 21 worksheets are read-only under `data/`. No one-time migration is rerun.

## Confirmed inputs

Edit the validated templates in [data/inputs](data/inputs/README.md). Candi owns scholarships, operations and physical campuses; Ryan owns partnership reach; both supply events. Complete provenance and valid status are mandatory before a row contributes to any total. Proposed awards and request-log amounts are not approved funding. Run the build after changing input files; no code change is needed.

Unknown overlap on a counted confirmed partnership row yields reach bounds instead of a single total. Until data is provided, reach, scholarships, events and operations show Awaiting confirmation, never zero. The Gala tracker stays separate as a requests log.

Harshil must add `District-Charter Preliminary Enrollment.xlsx` and `Building Preliminary Enrollment.xlsx` to `data/enrollment_demographics/`. The build warns while absent and validates every supplied cohort K-12/PK value against the master when present. Supported explicit headers are in `three_levels.py`; unknown layouts fail rather than being guessed.

## Build and check

```text
python -m pip install -r requirements.txt
python build.py
python -m unittest discover
node --check app.js
python scripts/audit_excel_sources.py verify
python test_dashboard.py
python -m http.server 8000 --directory dist
```

Chrome browser tests use the optional dependencies in `requirements-audit.txt`. QA reports and screenshots go to ignored `qa/three-levels/`. Build outputs include the raw-source [missing-data audit](docs/missing-data-audit.md), machine-readable `qa/missing-data-audit.json` and [slide outline](docs/slide-outline.md). Every nullable field receives validated status metadata. Zero remains a valid supplied number.

## Presentation and embedding

Use Presentation view or `?present=1`; arrow keys/swipe move through panels, Escape exits. Print / Save as PDF expands the generated panels, landscape, one panel per page. Each chart has PNG/CSV export with title and level/year/source caption. Historical lines mark the School's SLU join year from the master. Read [EMBED.md](EMBED.md) before SLU Marketing approves an iframe; `?embed=1` hides masthead/footer and sends bounded origin-specific height messages.

## Review and publication

This change lives on `redesign-three-levels` and is submitted by pull request. The review workflow checks JS, public JSON/status integrity and artifact layout; it uploads the bundle for review. The unchanged Pages workflow publishes `dist/` on `main` only. A green review workflow is not a live deployment. After merging through normal controls, confirm the Pages workflow and compare live HTML/JSON to the committed bundle. Do not force-push or change Pages permissions to bypass branch review.

See [CHANGELOG](docs/CHANGELOG.md) for every relabelled or relocated regression figure, architectural changes, precise blockers and pending owners. [KPI definitions](docs/kpi-definitions.md), [independent data audit](docs/independent-data-audit.md) and [source catalog](docs/source-files.md) retain the source trace; current missingness labels and the changelog supersede older presentation wording.
