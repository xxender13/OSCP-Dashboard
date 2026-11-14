# Changes: three reporting levels

Branch: `redesign-three-levels`. The request requires a pull request, not a merge. The existing Pages environment/workflow publishes `main`; that restriction is preserved. A separate read-only review workflow validates and uploads the branch bundle without publishing it.

## Labels and placement, with values unchanged

- **3,953** moves to “Students enrolled in sponsored schools, K–12, 2025–26 preliminary.” It is not total partnership reach.
- **14** means Buildings across **6 Schools**. The directory establishes **12 street addresses / two address-sharing pairs**, not a verified physical-campus count.
- **3,913**, **1,255**, **32.07%** remain in composition and exports, with 2025 K–12 as the race denominator; Black enrollment is no longer a main KPI tile.
- **2,330 / 3,816 / 61.06%** are the Free/reduced lunch tile and January 2025 roster ratio.
- **823 / 1,753 / 46.95% ELA** and **877 / 1,765 / 49.69% math** move to secondary pooled lines and Learning tiles; individual Schools/Buildings are the primary outcome view.
- The reportable shares are calculated as **1,753 / 2,002 = 87.56%** ELA and **1,765 / 2,014 = 87.64%** math; they are not six-School pooled proficiency rates.
- **7 / 13** ELA and **5 / 13** math lead the growth narrative; percentages remain available as Building rates.
- Missouri MAP **44.00%, 42.63%, 39.98%, 40.98%** and APR **24.99%, 24.67%** remain reference-only values. They never enter School/Building totals.
- The enrollment bridge adds the explicitly reported **197 PK** to **3,953** for **4,150 PK–12 as reported**; The Biome PK is not supplied, so this is not a complete verified PK–12 census. All existing source values are retained.
- City totals are computed: Kansas City **4 Schools / 11 Buildings / 3,247 K–12**; St. Louis **2 / 3 / 706**.
- Source join years remain Académie Lafayette/Hope **2022**, Frontier **2023**, The Biome/Genesis **2025**, City Garden **2008**. Years with SLU are explicitly calculated as of 2025, not the current date.
- **26** deduplicated Gala request records from **65** rows remain a requests log; **0 decision statuses / 0 approved amounts** are audit completeness counts, never approved events or funding.
- **20 proposed awards** and the **$2,500 iSCORE question** stay unresolved notes, never confirmed numerical input fields.
- The unresolved **4,081 overview figure** remains a confirmation question for Candi and never becomes an enrollment total.

## Architecture, status and tests

The main page uses `summary.json` only (under 400 KB). `explorer.html` fetches analytical packets and retains the shared existing JS report implementations. Five grouped workspaces consolidate related topics. Chart.js 4.4.8 is pinned and self-hosted with its MIT license; SHA-256 is `c40877e88de4df7201532014e14fb707f0f07a196a4ec63e070544b80184fb00`.

The raw build audit checks exact withheld-cell identifiers, not just counts. Shared statuses are Reported, Withheld by DESE, Not applicable, Not in supplied source and Awaiting confirmation. Every null has companion status metadata, validated before publication. Suppression causes are not inferred and combined MAP is never recovered by subtraction.

The previous numeric baseline is unchanged. `test_ui.py` now strips additive status metadata and selects the original contract fields before computing the original numeric/schema hash. This intentional structural update does not update the expected original hash. Existing workbook, assessment, demographic, history and KPI regression tests remain. Bundle-file and browser assertions intentionally reflect the separate Explorer, self-hosted vendor and summary-only main page.

New input tests cover empty templates, complete confirmations, invalid numeric input and unknown-overlap bounds. Browser checks cover five responsive widths, separate Explorer filters, level changes, CSV level/year, 1920×1080 presentation navigation, embedding, blocked CDN and fully blocked chart-library tables.

## Contradictions and unresolved review

Older README claims that the directory is undated and grade-matched MAP unavailable were stale; current source audits supersede them. Raw preliminary files are still absent, so 3,953 traces to the master until Harshil adds the original DESE extracts. Template loaders are strict about their supported headers rather than guessing an unfamiliar workbook layout. No values from Candi or Ryan are supplied. Local tests require the original workbooks; CI validates only the distributable public bundle because raw data stays out of the public repository.

Tracker classification uses explicit supplied-name aliases for City Garden, The Biome, Academie Lafayette, Genesis and Frontier. The outside organization Caring for Kids Network retains its exact source name in `source_organization`; its public log label is Caring for Kids. It is not renamed as a School.

## Local validation

Build passed with the expected raw-preliminary-source warning. All 33 Python tests passed; root and vendor JavaScript syntax checks passed; all 11 source hashes are unchanged. Browser checks passed at 320, 375, 768, 1024 and 1440px and 1920x1080 presentation, including embed height messages, source/year CSV, PNG generation, blocked CDN and blocked local chart fallback. Summary size: 287,483 bytes, below 400 KB.

QA screenshots: [overview](three-levels-screenshots/overview.png), [mobile students](three-levels-screenshots/students-mobile.png), [learning](three-levels-screenshots/learning.png), [presentation](three-levels-screenshots/presentation.png). Complete local captures are under ignored `qa/three-levels/`.

Historical metric nulls also trace their companion statuses to raw numerator/percentage columns: a withheld source component marks the unavailable derived metric Withheld by DESE, without recovering a count. The source-level and full browser regressions pass after this metadata refinement. The Pages environment was read and verified: its custom deployment branch policy permits `main` only. Live HTML and legacy JSON match current main and intentionally do not yet match this unmerged review branch.
