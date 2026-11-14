# Independent data audit

Audit date: November 7, 2026. Baseline calculations were reproduced before changes; see [baseline report](independent-data-baseline.md). Original workbook values, formulas, formatting and file bytes are preserved. This audit supersedes older claims that the directory is undated or that no grade-specific MAP comparison is possible.

## Completed work and figures

| Measure | Original | Verified result / decision |
| --- | --- | --- |
| Students | 3,953 | Unchanged: six unique networks, preliminary 2025–26 K–12; excludes preschool and unverified partnerships |
| Black enrollment | 1,255 / 3,913 = 32.072579% | Unchanged, 2025; statewide context updated from incomplete 16.900416% to official published 15.3% |
| FRL | 2,330 / 3,816 = 61.058700% | Unchanged, 2025; denominator is January membership, not preliminary fall enrollment. Missouri context updated from incomplete 47.201539% to published 49.3% |
| Sponsored schools | 14 identifiers, undated | 14 identifiers across six networks verified against June 30, 2026 directory; not 14 physical campuses |
| MAP ELA | 823 / 1,753 = 46.948089% | Unchanged legacy MSIP aggregate; 3/6 reportable networks |
| MAP Math | 877 / 1,765 = 49.688385% | Unchanged legacy MSIP aggregate; 3/6 reportable networks |
| APR ELA growth | 7 / 13 = 53.846154% | Independently reproduced; Missouri 498 / 1,993 = 24.987456% |
| APR Math growth | 5 / 13 = 38.461538% | Independently reproduced; Missouri 492 / 1,994 = 24.674022% |
| Missouri K–12 enrollment | Incomplete extract | Published 2024–25 fall total 856,222 = 580,175 K–8 + 276,047 grades 9–12 |
| Missouri EL | Unavailable | Official 2025 contextual percentage 5.0%; exact underlying count/denominator not printed |
| Missouri IEP | Unavailable | Published 2024–25 incidence 13.93%; December 1 school-age child count 119,234; underlying denominator not printed |
| Grade 3 MAP ELA above Missouri | Unavailable | 1 / 4 eligible buildings (25%); 7 building source records, 3 excluded for unavailable components |
| Grade 3 MAP Math above Missouri | Unavailable | 2 / 4 eligible buildings (50%); 7 building source records, 3 excluded for unavailable components |

The six large clickable KPI cards, existing chart reports, filters, navigation, CSV exports and responsive layouts remain. Added a separate grade/course MAP report with independent school/network, all four subjects, every available source subgroup and grade filters, paired school/state bars, explicit eligible denominators and unavailable reasons. The directory now includes dated source pages, addresses, shared-address filters, search and opening-year provenance.

## Statewide demographic methods

The 2025 district demographic extract has 564 unique district records, no statewide total row and six unavailable K–12 enrollment values. Published values sum to 855,931, an incomplete population. Do not subtract that sum from the statewide total to reconstruct suppression. The former Black benchmark used only 295/564 paired district records. The former FRL benchmark used 536/564, excluded 10 missing/nonpositive pairs and 18 count/membership conflicts, including rounding inconsistencies. These subsets remain under `benchmark_subsets` for provenance; they are no longer presented as complete state context.

Official rounded percentages replace these incomplete references. The dashboard prints their periods and population limitations, does not infer missing counts, does not average district percentages, and does not compute percentage-point gaps against differently defined populations. FRL membership, racial K–12 enrollment, and December 1 IEP incidence are distinct populations. The snapshot's 896,167 labelled K–12 figure conflicts with the explicit statistics publication's 856,222 and is rejected as the enrollment denominator; the snapshot's 49.3% FRL is independently corroborated by the DESE renewal report.

## MAP formulas, exclusions and reporting levels

Read every row of the three newly obtained 2025 content-area-and-grade exports: 716 state, 101,117 district and 163,162 school rows. The tracked reference retains 716 state, 946 cohort district and 1,136 cohort school aggregates, with source row identifiers. No individual student information is used.

For one exact year, subject, subgroup and grade/course, proficiency = 100 × (published Proficient + published Advanced) / positive Reportable. A school exceeds Missouri only when its rate is strictly greater than the exact state grade/group rate. Count each school once within the selected grade; numerator = eligible schools above state, denominator = schools with both complete published component counts and a matching reportable state row. Missing or suppressed components remain unavailable; never reconstruct them from totals or percentages. Do not add overlapping grades, subgroups, subjects or reporting levels into reach.

Grade-export Total and existing MSIP Total all-required-content populations differ, including optional EOC courses. A proposed whole-school grade-mix benchmark would be `100 × sum(N_school_grade × (P_state_grade + A_state_grade) / N_state_grade) / sum(N_school_grade)`, but is accepted only if every grade is complete and grade P, A and N sums exactly reconcile to the existing aggregate. No ELA/Math whole-school cohort aggregate passes these safeguards; its comparison remains `Unavailable*` with an explicit scope reason. Grade-specific comparisons remain independently valid. Exceeding a state benchmark does not mean meeting an official school proficiency goal; no school-specific goals are invented.

## Directory verification and opening years

All 14 unique LEA/building pairs match the six networks. The dated directory establishes names, codes, grade spans and address provenance. Original undated directory fields remain nested in the JSON and the source workbook is unchanged. Hope's address is updated from 6409 Agnes Avenue to 2800 E. Linwood Boulevard using the dated directory and DESE charter page.

Académie Lafayette IMS 048914/1910 and IHS 048914/1920 share 201 E. Armour; Frontier Middle 048922/3940 and High 048922/1920 share 5605 Troost. There are 12 normalized street-address groups, not a verified 12-campus count. Separate buildings, shared facilities, secondary addresses and time periods prevent treating address groups as physical-campus totals.

DESE charter pages verify network opening school years: Académie Lafayette 1999–2000, The Biome 2015–16, City Garden 2008–09, Frontier 2009–10, Genesis 1999–2000 and Hope 2011–12. These are network years, not individual building openings. Official school history additionally reports Académie Lafayette high-school instruction beginning 2020–21 and City Garden's new Folsom facility opening January 2022; program/facility dates are distinct and are not generalized to the other buildings.

Conflicts are preserved explicitly: the KC webpage reverses Armour IMS/IHS codes; St. Louis webpage lists EAEC 6966 instead of the consistently supported 6956; IHS ZIP differs; Folsom PDF repeats a secondary Tower Grove line; Hope webpage grades differ from dated PDF. The dated directory controls the displayed 2026 spans; 2025 APR grade spans remain separate. Charter webpages also show differing spans for Frontier 3935/6975 and Académie Lafayette 6941, so they are not substituted into dated records.

## APR growth verification

Use building-level 2025 ALL growth indicators only, positive points possible, reported earned points and designation. Numerator counts exact `Target` designations. `On-Track` is not Target; `Participation` remains eligible when the measure otherwise qualifies. The cohort has 13 eligible of 14 buildings for each subject. State source has 2,139 building records; ELA excludes 146 and Math excludes 145. Do not add district APR records to building records. Existing school/network filters and building tables preserve descriptive comparisons. APR target attainment is a share of eligible buildings designated Target, not the percentage of students experiencing growth and not evidence of sponsorship causing outcomes.

## Reproducibility and limitations

Ordinary builds are offline: `python build.py`. Refresh public references using `pip install -r requirements-audit.txt`, `python scripts/fetch_independent_sources.py`, then `python scripts/prepare_independent_reference.py` and rebuild. The downloader follows DESE's public-applications entry, uses no credentials, and saves additional sources separately under ignored `data/research/`. Original 11 workbooks are never overwritten. The tracked reference includes exact URLs, SHA-256 hashes, retrieval timestamps, source rows/pages and selected aggregate records. Dashboard runtime downloads only aggregate JSON. Raw PDFs, workbook downloads, personnel contacts, sponsorship private notes and QA artifacts are excluded from the public deployment.

Validation commands: `python build.py`; `python -m unittest test_data.py test_reporting.py test_independent.py`; `node --check app.js`; `python scripts/audit_excel_sources.py verify`; `python test_dashboard.py`. Browser coverage includes 320/768/1440 widths, six keyboard-accessible cards, independent filters, source notes, unavailable values, navigation, CSV, search/reset, matched-grade comparisons, shared-address filtering and chart-CDN failure tables. See the build-generated `qa/` reports locally.

## Information that genuinely requires Candi or Ryan

- Confirm scholarship awards, amounts, approval and award periods; proposed 20 awards are not verified awards.
- Confirm actual event/sponsorship approvals, dates, funding and attendance; duplicate tracker rows do not establish funded events.
- Provide additional partnership participant counts and overlap identifiers before calculating unduplicated students served.
- Provide internal support/compliance hours and validated team experience.
- Finalized 2026–27 enrollment, building-specific opening histories without official evidence, and a verified physical-campus inventory remain unavailable; do not invent them.

## Exact public sources

The following source register is generated from the downloaded source manifest and contains direct supporting URLs and hashes. See the tracked reference JSON for detailed page/row citations.

- [dese_map_2025_state_grade.xlsx](https://apps.dese.mo.gov/MCDS/FileDownloadWebHandler.ashx?filename=4c902ed1-921e2025%20State%20Content%20Area%20and%20Grade%20All%20and%20Disag.xlsx); SHA-256 `bb2a228008130706d60c5287f108a78c3df5d860e0ea54d71c1dd2f9c5ee26ca`.
- [dese_map_2025_district_grade.xlsx](https://apps.dese.mo.gov/MCDS/FileDownloadWebHandler.ashx?filename=0132f017-1f862025%20District_content%20area%20and%20grade%20all%20and%20disag.xlsx); SHA-256 `81d34c88188202a5bd31e7bb0c2a60e8e4691c42995e0b6775077be0c803fdb7`.
- [dese_map_2025_school_grade.xlsx](https://apps.dese.mo.gov/MCDS/FileDownloadWebHandler.ashx?filename=2e2d5600-d1962025%20School_content%20Area%20and%20Grade%20All%20and%20Disag.xlsx); SHA-256 `72dc2d96068506c30eb7920b780aeb01dcc1d250e80fa66495271dcce2473f53`.
- [dese_statistics_2024_2025.pdf](https://apps.dese.mo.gov/MCDS/FileDownloadWebHandler.ashx?filename=7722f291-87cdMissouri%20School%20Statistics%2024-25.pdf); SHA-256 `8ec8e2a6df860dd58e9343b1bcca270a3428de1e7817d7698ed211e84a537477`.
- [dese_statistics_directory_2026.pdf](https://apps.dese.mo.gov/MCDS/FileDownloadWebHandler.ashx?filename=d3699c08-0b6d2026_Missouri_School_Statistics_and_Directory.pdf); SHA-256 `ad6c16053dba6cca12deb240069a4e346505bc7626654d5cf980e2c0ab92a4bd`.
- [dese_special_education_profile_2024_2025.pdf](https://dese.mo.gov/sites/g/files/zuston521/files/media/pdf/2026/05/OSE_State-Profile_2024-25.pdf); SHA-256 `123fd41f004348001d9b8ba97e8ecb091267b7d82e1e5fe34f0a62ca9b7c45f8`.
- [dese_kansas_city_charters.html](https://dese.mo.gov/quality-schools/charter-schools/kansas-city); SHA-256 `195ce01d0efb13e58e7a6a6e3eea2c72128870d7d1dc2864686a999abf2a2a2c`.
- [dese_st_louis_charters.html](https://dese.mo.gov/quality-schools/charter-schools/st-louis); SHA-256 `3d9d263c303b7c0a5b6b060cc6c32eb652fef9f4a07e79e85c38ea4935eee8eb`.
- [dese_snapshot_2024_2025.html](https://dese.mo.gov/communications/snapshot); SHA-256 `711edc88212e621304860137a9f5b2b980bbe043d3dd25ae1209b14a73feef47`.
- [dese_atlas_renewal_2026.pdf](https://dese.mo.gov/sites/g/files/zuston521/files/media/pdf/2026/03/Atlas%20Public%20Schools%20_%20Renewal%20SY26%20FINAL.pdf); SHA-256 `604d92fcd90346e9580b522f432ac97fb28cd24cf26ed8cad374b8312e2f3f53`.
- [academie_official_schools.html](https://academielafayette.org/our-schools/); SHA-256 `f769e578df2096792531b32b2015aacfaf761afef384646d1afba316783173e8`.
- [city_garden_official_facility_2022.html](https://citygardenschool.org/aug-2022-community-newsletter); SHA-256 `ff0485d12094ed505f344075a29637d2ff80614d1eec985ab2e7b40663eebdf3`.

Validation result: build passed; 20 Python tests passed; JavaScript syntax passed; all 11 original workbook hashes unchanged. Real Chrome tests passed at mobile, tablet and desktop widths, including the new comparison and address reports.

## Verified building inventory

| LEA / building | Name | Directory grades | Street | Dated PDF page |
| --- | --- | --- | --- | --- |
| 048914/1920 | Academie Lafayette Armour Ihs | 09-12 | 201 East Armour Boulevard | 3 |
| 048914/1910 | Academie Lafayette Armour IMS | 06-08 | 201 E Armour Blvd | 2 |
| 048914/6941 | Academie Lafayette Cherry Elem | PK-05 | 3421 Cherry St | 3 |
| 048914/6940 | Academie Lafayette Oak Elem | K-05 | 6903 Oak Street | 3 |
| 115911/6956 | City Garden Montessori Eaec | 01-08 | 4209 Folsom | 145 |
| 115911/6955 | City Garden Montessori Ecec | PK-K | 1618 Tower Grove Avenue | 144 |
| 048922/3940 | Frontier Schl Of Excellence-M | 06-08 | 5605 Troost Avenue | 298 |
| 048922/1920 | Frontier Schl Of Excellence-U | 09-12 | 5605 Troost Avenue | 297 |
| 048922/3935 | Frontier Schl Of Innovation-M | 06-08 | 1575 Universal Dr. | 298 |
| 048922/6975 | Frontier School Of Innovation | PK-05 | 6700 Corporate Drive | 298 |
| 048922/1985 | Frontier Stem High School | 09-12 | 6455 E Commerce Ave. | 298 |
| 048905/1945 | Genesis School Inc. | PK-08 | 3800 E 44th St. | 314 |
| 048925/6985 | Hope Leadership Academy | PK-05 | 2800 E. Linwood Boulevard | 395 |
| 115926/6905 | The Biome | K-05 | 4471 Olive Street | 1003 |

Final baseline comparison also confirmed unchanged legacy school values, building records, historical series, assessment records, enrollment metrics and confirmed events. All six numerical KPI families retain their baseline values. All 12 downloaded research-source hashes match the tracked manifest.
