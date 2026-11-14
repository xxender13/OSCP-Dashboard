# Current KPI definitions and reporting levels

School means one of the six sponsored charter Schools; Building means one of 14 DESE identifiers. Missouri is a reference only. The data layer retains `lea` and original source field names. See the page glossary for School (charter network / DESE district).

| Measure | Exact calculation | Level | Period and coverage |
| --- | --- | --- | --- |
| Students enrolled in sponsored schools | Sum unique School preliminary K-12 = 3,953 | School | 2025-26 preliminary; all six Schools; PK excluded |
| Buildings | 14 unique LEA/Building identifier pairs | Building | Directory June 30, 2026; 12 street addresses, two sharing pairs; physical campus count awaiting Candi |
| Black enrollment, composition panel | 1,255 / 3,913 x 100 = 32.072579% | School | 2025 K-12 population; all six School rows |
| Free/reduced lunch | 2,330 / 3,816 x 100 = 61.058700% | School | January 2025 membership; not preliminary enrollment |
| Pooled MAP English language arts | 823 / 1,753 x 100 = 46.948089% | School | Three reportable Schools; 1,753 / 2,002 = 87.56% of tested students |
| Pooled MAP mathematics | 877 / 1,765 x 100 = 49.688385% | School | Three reportable Schools; 1,765 / 2,014 = 87.64% of tested students |
| APR ELA growth Target | 7 / 13 = 53.846154% | Building | 2025 eligible Buildings; one ECEC row not applicable |
| APR math growth Target | 5 / 13 = 38.461538% | Building | Same eligibility definition; one ECEC row not applicable |

The Black figure remains inside composition and exports, not a primary KPI tile. Pooled MAP figures are secondary to individual School/Building views. Growth leads with eligible Building counts, not student percentages. All original numeric source values remain unchanged; see the original-hash regression in `test_ui.py`.

## Enrollment populations

The reported PK counts are 18 + 93 + 58 + 15 + 13 = 197. The Biome PK is Not in supplied source. Adding reported PK to 3,953 gives 4,150 PK-12 **as reported**, not a complete verified PK-12 census. All School PK-12 master totals are blank; the bridge is an explicitly labelled addition, not a recovered source total. The headline stays K-12 pending Candi's decision.

Raw preliminary district/charter and Building workbooks are absent. The build warns and traces enrollment to the reconciled Cohort Master. Once both raw files are supplied, the strict header/identifier/value validator in `three_levels.py` must reproduce the master values or fail. Harshil owns these files.

## Raw-source status rules

- **Reported:** supplied numeric values, including a genuine zero.
- **Withheld by DESE:** the raw extract supplies *. The cause is not inferred.
- **Not applicable:** City Garden ECEC has no tested-grade MAP row and blank APR growth fields.
- **Not in supplied source:** missing source files or unreported source fields, including The Biome PK.
- **Awaiting confirmation:** internal program/operations/campus figures without complete confirmed input provenance.

The raw demographic audit checks all 42 School measure cells (five withheld) and 98 Building cells (ten withheld), matching exact identifier/measure fixtures. The Biome, Genesis and Hope have withheld MAP Proficient and Advanced components. Combined P+A is never recovered from Below Basic, Basic or Reportable counts. Actual component counts remain accessible in the Explorer.

## Missouri reference values

Official rounded demographic context: Black 15.3%, FRL 49.3%, EL 5.0%, IEP incidence 13.93%; publication periods and populations are retained beside the figure. No missing underlying counts or percentage-point differences are inferred. Older incomplete district-subset rates remain provenance in the full legacy JSON, not current statewide benchmarks.

State MAP Total P+A: ELA 198,659 / 451,477 = 44.002020%; math 193,897 / 454,818 = 42.631778%; science 78,294 / 195,818 = 39.983045%; social studies 27,239 / 66,470 = 40.979389%. These all-tested-grade aggregates are context, not individual School goals. Grade-matched comparisons remain in the Explorer with exact year/subject/grade/subgroup matching and suppression safeguards.

State APR: ELA 498 / 1,993 = 24.987456%; math 492 / 1,994 = 24.674022% eligible Buildings designated Target. Eligibility requires positive possible points, reported earned points and designation. Participation remains eligible. On-Track is not Target. District rows are not added to Building rows.

## Exact source files

- `data/master/oscp_dese_cohort_master_2025_2026.xlsx`: Cohort Master, Building Cohort, Historical Demographics, source register and reconciliation.
- `data/enrollment_demographics/dese_district_demographics_1991_2025.xlsx`: Sheet1, 2025 School counts and historical rows; FRL denominator JANUARY_MEMBERSHIP, race/EL denominator ENROLLMENT_GRADES_K_12.
- `data/enrollment_demographics/dese_building_demographics_2006_2025.xlsx`: Sheet1, same fields at Building level.
- `data/assessments/dese_map_2025_{state,district,school}_content_area.xlsx`: Sheet1, MSIP Total / Total; published Proficient, Advanced and Reportable only.
- `data/accountability/dese_apr_2025_building_supporting.xlsx`: Sheet1, subject ALL_GROWTH_POINTS_POSSIBLE / EARNED / PERFORMANCE_DESIGNATION; summary cross-check retained.
- Dated directory and grade-specific public references: exact URLs/hashes in the tracked independent reference snapshot and [independent audit](independent-data-audit.md).
- `data/inputs/*.csv`: confirmed-only programs, operations and physical campus inputs; [schema/owners](../data/inputs/README.md).

The Gala tracker is a separate request log: 26 distinct records / 65 source rows, zero decision statuses and zero approved amounts. Those are completeness counts, never confirmed events or funded sponsorships. No private tracker notes or invitations are published.

Current missingness audit: [missing-data-audit.md](missing-data-audit.md). Relabelled figures, branch publication constraints and QA: [CHANGELOG.md](CHANGELOG.md). The 11 original workbooks / 21 worksheets are unchanged; no one-time migration is rerun.
