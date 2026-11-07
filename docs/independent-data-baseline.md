# Independent audit baseline

Captured before calculation changes. Existing build, 16 Python tests, JavaScript syntax, original-workbook hash checks, and Chrome checks at 320/768/1440px passed.

The complete baseline payload is retained locally in qa/independent/baseline-dashboard.json.

## Original KPI definitions

```json
{
  "students": {
    "value": 3953,
    "year": "2025\u201326 preliminary",
    "networks": 6
  },
  "demographics": {
    "numerator": 1255,
    "denominator": 3913,
    "value": 32.07257858420649,
    "reportable_records": 6,
    "source_records": 6,
    "complete": true,
    "count_column": "ENROLLMENT_BLACK",
    "denominator_column": "ENROLLMENT_GRADES_K_12",
    "formula": "100 \u00d7 sum(ENROLLMENT_BLACK) / sum(ENROLLMENT_GRADES_K_12) over the same unique reportable records",
    "excluded_missing_or_nonpositive_denominator": 0,
    "excluded_inconsistent_counts": [],
    "year": 2025,
    "label": "Students identifying as Black",
    "source_file": "dese_district_demographics_1991_2025.xlsx",
    "source_sheet": "Sheet1",
    "limitation": "One reported racial category, not a complete composition. Counts are summed once per charter network."
  },
  "frl": {
    "numerator": 2330,
    "denominator": 3816,
    "value": 61.058700209643604,
    "reportable_records": 6,
    "source_records": 6,
    "complete": true,
    "count_column": "LUNCH_COUNT_FREE_REDUCED",
    "denominator_column": "JANUARY_MEMBERSHIP",
    "formula": "100 \u00d7 sum(LUNCH_COUNT_FREE_REDUCED) / sum(JANUARY_MEMBERSHIP) over the same unique reportable records",
    "excluded_missing_or_nonpositive_denominator": 0,
    "excluded_inconsistent_counts": [],
    "year": 2025,
    "source_file": "dese_district_demographics_1991_2025.xlsx",
    "source_sheet": "Sheet1",
    "limitation": "Uses 2025 January membership, not 2025\u201326 preliminary K\u201312 enrollment. Membership/FRL source counts can be fractional; do not label them as unduplicated partnership participants."
  },
  "schools": {
    "value": 14,
    "networks": 6,
    "year": null,
    "definition": "Distinct (CTYDIST, SCHNUM) pairs in the supplied undated directory; not unique physical campuses.",
    "missingness": {
      "year": {
        "reason": "not_stated",
        "detail": "The supplied directory does not state its reporting year; 2026 is unverified."
      }
    }
  },
  "map": {
    "Eng. Language Arts": {
      "numerator": 823,
      "denominator": 1753,
      "value": 46.94808899030234,
      "reportable_networks": 3,
      "networks": 6,
      "formula": "100 \u00d7 sum(published Proficient + Advanced) / sum(Reportable), restricted to the same reportable Charter Total rows",
      "year": 2025,
      "above_state_pct": null,
      "missingness": {
        "above_state_pct": {
          "reason": "incompatible_grade_scope",
          "detail": "No grade-specific state records were supplied. Building/network grade spans differ, so no grade-matched above-state classification is calculated."
        }
      }
    },
    "Mathematics": {
      "numerator": 877,
      "denominator": 1765,
      "value": 49.68838526912181,
      "reportable_networks": 3,
      "networks": 6,
      "formula": "100 \u00d7 sum(published Proficient + Advanced) / sum(Reportable), restricted to the same reportable Charter Total rows",
      "year": 2025,
      "above_state_pct": null,
      "missingness": {
        "above_state_pct": {
          "reason": "incompatible_grade_scope",
          "detail": "No grade-specific state records were supplied. Building/network grade spans differ, so no grade-matched above-state classification is calculated."
        }
      }
    }
  },
  "growth": {
    "Eng. Language Arts": {
      "numerator": 7,
      "denominator": 13,
      "value": 53.84615384615385,
      "source_records": 14,
      "excluded_records": 1,
      "formula": "100 \u00d7 buildings designated Target / buildings with positive ALL growth points possible, reported earned points and a reported designation; Participation is included, On-Track is not Target"
    },
    "Mathematics": {
      "numerator": 5,
      "denominator": 13,
      "value": 38.46153846153846,
      "source_records": 14,
      "excluded_records": 1,
      "formula": "100 \u00d7 buildings designated Target / buildings with positive ALL growth points possible, reported earned points and a reported designation; Participation is included, On-Track is not Target"
    }
  }
}
```

## Baseline concerns

- State demographic references use incomplete district subsets; the workbook has no verified State Total record.
- FRL reference excludes 18 count/membership conflicts, many small rounding differences; official statewide evidence is preferable.
- State MAP has blank GRADE_LEVEL fields; no grade-matched count of schools exceeding state is currently supported.
- Directory year is not stated; address lines, conflicts and shared locations are not displayed.
- APR counts are designated Target among eligible buildings; broad grade-span mix must remain explicit.
- Preserve 3,953 preliminary K-12 enrollment, six networks, 14 identifiers, all existing numerical records and suppression.
