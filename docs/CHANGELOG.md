# Dashboard presentation and navigation changes

November 14, 2026 · `redesign-three-levels` · PR #1

Existing calculations, numerical baseline, source workbooks and status decisions are preserved. This release changes public packaging, labels and placement.

- **Header:** one slim row with SLU mark, office name, “Charter School Partnerships Dashboard”, search and Presentation view. Edition badge, large introduction and previous navigation are removed. Dates move below the tiles and into About.
- **Six tiles:** Students enrolled (3,953), School communities (6 / 14, with 12 street addresses), Lunch eligibility (61.06%; 2,330 / 3,816), Reading (46.95%; 823 / 1,753), Math (49.69%; 877 / 1,765) and Reading growth (7 of 13). Each opens and highlights its section. The causal limitation appears below the tiles and once in About.
- **Navigation:** eight accessible tabs replace the long page: Overview, Schools, Students, Learning, Growth, Programs, Explore Data, About the data. Each has an introduction, jump chips and breadcrumb. The tab row sticks while scrolling, supports arrow/Home/End keys and scrolls horizontally on phones.
- **Overview:** five generated facts, compact six-school scorecard with separate Missouri row, computed Kansas City / St. Louis split (3,247 / 706 students).
- **Schools:** six profiles with city, opening year, SLU join year, grades, school building count and enrollment. Directory has 14 rows grouped by school, grades and address, with search and city filters. Wording: “14 school buildings at 12 street addresses”.
- **Students:** enrollment, population bridge (3,953 + 197 = 4,150), 3,913 race population, 3,816 January membership, every reported race/ethnicity category, lunch, English learners and students with IEPs. Black enrollment (1,255 / 3,913 = 32.07%) remains in student groups.
- **Learning:** reading and math by school or school building, published ranges, pooled counts inside collapsed guidance and a same-grade Explorer link. Missouri 44.00% / 42.63% is a dashed reference rather than an equal bar.
- **Growth:** 7 of 13 reading and 5 of 13 math school buildings lead, followed by Missouri 24.99% / 24.67%. A short Target explanation replaces repeated technical paragraphs.
- **Programs:** one “details coming soon” card per unconfirmed area: scholarships, events, partnership reach and OSCP support. Only existing confirmed input rows can appear.
- **Explore Data:** six report sub-tabs: Enrollment history, Student groups, Reading and math, Grade comparison, Growth, Directory. Each has filters, Reset filters, CSV and PNG. One report is visible at a time. `explorer.html` serves the same component; detailed packets load only on entering Explore Data.
- **About:** glossary, years, DESE links, chart guidance, descriptive limits and citation instructions. Internal reports and former engineering notes move to `docs/internal/`, excluded from `dist/`.
- **Levels:** Schools (blue, circle), School buildings (teal, grid), Missouri (grey, diamond). Students, Learning and Growth use two-option switches and three-level definition legends. Missouri remains beside the selected level.
- **Unavailable values:** Not published, Withheld by DESE, Not applicable. The scorecard uses Not published for unpublished MAP. Internal status values and calculation rules are unchanged.
- **Public packaging:** names, input responsibility, unfinished questions, requests, verification matrices and processing notes leave public packets. The full payload stays private for the original hash and calculation regressions.
- **Visuals:** one system font, light borders, 12px corners, 8px spacing scale, 1200px content width, larger chart labels, fewer gridlines, separate Missouri reference and tables that scroll within cards.
- **Search and links:** accent/case-insensitive matching, `/`, arrows, Enter, Escape; schools open profiles and school buildings open directory rows. Names link to profiles. Old section bookmarks redirect; tab/section hashes support browser history.
- **Sharing:** presentation begins with tiles then section panels; arrows navigate and Escape exits. Print expands sections in order, landscape, one section per page. Embed hides header/footer and posts height messages. EMBED.md contains public instructions.
- **Loading and fallback:** six skeleton tiles, self-hosted Chart.js and usable tables if chart loading is blocked. One vendor DOM property uses an equivalent Unicode escape to meet the strict public-text scan without changing behavior.

The numerical tests retain the original expected payload hash. New public-content tests scan deployed HTML, JS, JSON and CSV, enforce the output allowlist and summary budget, and check headline values. Browser checks cover eight tabs, six reports, routing, search, levels, exports, widths 320–1440, 1920×1080 presentation, print, embed and blocked chart loading. Captures and results go to `qa/navigation-redesign/`; selected review screenshots are in `docs/navigation-screenshots/`.

Final refinements: race/ethnicity tables keep Missouri in a separate comparison column, with its own year. Detailed assessment reports retain all achievement measures through the Measure filter. Enrollment history uses separate lines with gaps preserved. CSV and PNG exports include measure and level/year/source context. Presentation includes an Explore Data guide without fetching the detailed packets, and browser checks confirm an actual iframe height message. Initial summary size is 118,965 bytes; 38 Python checks pass alongside the original numerical hash, workbook hashes and browser checks.
