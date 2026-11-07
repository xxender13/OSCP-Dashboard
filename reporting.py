"""Source-based KPI definitions and aggregate comparisons; no workbook mutation.

All statewide demographic summaries use district rows only. APR statewide
summaries use building rows only. These populations are never added together.
"""
from collections import Counter
import math

DM = 'dese_district_demographics_1991_2025.xlsx'
BM = 'dese_building_demographics_2006_2025.xlsx'
MS = 'dese_map_2025_state_content_area.xlsx'
AB = 'dese_apr_2025_building_supporting.xlsx'
AS = 'dese_apr_2025_building_summary.xlsx'
AD = 'dese_apr_2025_district_supporting.xlsx'
DR = 'dese_school_building_directory_undated.xlsx'
TOTAL = ('MSIP Total', 'Total')
SUBJECTS = ('Eng. Language Arts', 'Mathematics', 'Science', 'Social Studies')


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None


def code(v, width=6):
    return str(v).strip().zfill(width)


def missing_reason(value):
    if isinstance(value, str) and value.strip() == '*':
        return {'reason': 'suppressed_in_source', 'detail': 'The source marks this value with *. The supplied extract does not specify why; small group size is not assumed.'}
    return {'reason': 'not_reported', 'detail': 'Blank, NULL, NA or otherwise unavailable in the supplied source; no suppression cause is inferred.'}


def ratio(numerator, denominator):
    return 100 * numerator / denominator if num(numerator) is not None and num(denominator) is not None and denominator > 0 else None


def unique(rows, fields):
    keys = [tuple(str(r.get(f)).strip() for f in fields) for r in rows]
    assert len(keys) == len(set(keys)), f'Duplicate source keys: {fields}'


def count_ratio(rows, count, denominator):
    paired = [r for r in rows if num(r.get(count)) is not None and num(r.get(denominator)) is not None and r[denominator] > 0]
    usable = [r for r in paired if 0 <= r[count] <= r[denominator]]
    invalid = [r for r in paired if not 0 <= r[count] <= r[denominator]]
    n, d = sum(r[count] for r in usable), sum(r[denominator] for r in usable)
    return {'numerator': n, 'denominator': d, 'value': ratio(n, d), 'reportable_records': len(usable), 'source_records': len(rows),
        'complete': len(usable) == len(rows), 'count_column': count, 'denominator_column': denominator,
        'formula': f'100 × sum({count}) / sum({denominator}) over the same unique reportable records',
        'excluded_missing_or_nonpositive_denominator': len(rows)-len(paired),
        'excluded_inconsistent_counts': [{'lea':code(r['COUNTY_DISTRICT_CODE']),'count':r[count],'denominator':r[denominator]} for r in invalid]}


def grow_summary(rows):
    eligible = [r for r in rows if r['eligible']]
    target = [r for r in eligible if r['designation'] == 'Target']
    return {'numerator': len(target), 'denominator': len(eligible), 'value': ratio(len(target), len(eligible)),
        'source_records': len(rows), 'excluded_records': len(rows) - len(eligible),
        'formula': '100 × buildings designated Target / buildings with positive ALL growth points possible, reported earned points and a reported designation; Participation is included, On-Track is not Target'}


def build_reporting(payload, tables):
    codes = {s['DESE LEA'] for s in payload['schools']}
    names = {s['DESE LEA']: s['School'] for s in payload['schools']}
    keys = {(r['DESE LEA'], code(r['Building code'], 4)) for r in payload['buildings']}
    assert len(keys) == 14
    directory = tables[DR]['School Building List']
    unique(directory, ('CTYDIST', 'SCHNUM'))
    assert {(code(r['CTYDIST']), code(r['SCHNUM'],4)) for r in directory} == keys
    payload['directory'] = [{'lea': code(r['CTYDIST']), 'building': code(r['SCHNUM'],4), 'name': r['SCHNAME'],
        'grades': f"{r['BGRADE']}–{r['EGRADE']}", 'reporting_year': None, 'source_row': r['_row'],
        'missingness': {'reporting_year': {'reason': 'not_stated', 'detail': 'No reporting year appears in the directory worksheet. A 2026 release is not verified.'}}} for r in directory]

    # Latest demographic extracts are separate from preliminary enrollment.
    district = [r for r in tables[DM]['Sheet1'] if r['YEAR'] == 2025]
    building = [r for r in tables[BM]['Sheet1'] if r['YEAR'] == 2025]
    unique(district, ('YEAR','COUNTY_DISTRICT_CODE'))
    unique(building, ('YEAR','COUNTY_DISTRICT_CODE','SCHOOL_CODE'))
    cohort = [r for r in district if code(r['COUNTY_DISTRICT_CODE']) in codes]
    assert len(cohort) == 6
    demo_fields = {'FRL %': 'LUNCH_COUNT_FREE_REDUCED_PCT', 'EL %': 'ELL_LEP_STUDENTS_ENROLLED_K_12_PCT',
        'IEP incidence %': 'IEP_INCIDENCE_RATE', 'Black %': 'ENROLLMENT_BLACK_PCT', 'Hispanic %': 'ENROLLMENT_HISPANIC_PCT',
        'White %': 'ENROLLMENT_WHITE_PCT', 'Multiracial %': 'ENROLLMENT_MULTIRACIAL_PCT'}
    for output, source, source_file in [(payload['schools'], district, DM), (payload['buildings'], building, BM)]:
        for row in output:
            matched = [r for r in source if code(r['COUNTY_DISTRICT_CODE']) == row['DESE LEA'] and
                (source_file == DM or code(r['SCHOOL_CODE'],4) == code(row['Building code'],4))]
            assert len(matched) == 1
            raw = matched[0]
            row['missingness'] = {k:raw['_missingness'].get(field,missing_reason(None)) for k,field in demo_fields.items() if row.get(k) is None}
            for k,v in row.items():
                if v is None:
                    row['missingness'].setdefault(k, missing_reason(None))
            for field in ('MAP ELA P+A %','MAP Math P+A %'):
                if source_file == DM and row.get(field) is None:
                    row['missingness'][field] = {'reason':'unavailable_components', 'detail':'One or more published MAP component counts are unavailable; combined proficiency is not reconstructed.'}
    for row in payload['history']:
        row['missingness'] = {k:missing_reason(None) for k,v in row.items() if v is None}

    demographic = count_ratio(cohort, 'ENROLLMENT_BLACK', 'ENROLLMENT_GRADES_K_12')
    demographic.update(year=2025, label='Students identifying as Black', source_file=DM, source_sheet='Sheet1',
        limitation='One reported racial category, not a complete composition. Counts are summed once per charter network.')
    state_demo = count_ratio(district, 'ENROLLMENT_BLACK', 'ENROLLMENT_GRADES_K_12')
    state_demo.update(year=2025, source_file=DM, source_sheet='Sheet1', label='Missouri reportable-district subset',
        limitation='Excluded suppressed counts and their enrollment denominators; this is not a complete statewide Black enrollment percentage.')
    frl = count_ratio(cohort, 'LUNCH_COUNT_FREE_REDUCED', 'JANUARY_MEMBERSHIP')
    state_frl = count_ratio(district, 'LUNCH_COUNT_FREE_REDUCED', 'JANUARY_MEMBERSHIP')
    # Independently verify the denominator against published single-network rates.
    frl_validation = []
    for raw in cohort:
        calc = ratio(raw['LUNCH_COUNT_FREE_REDUCED'], raw['JANUARY_MEMBERSHIP'])
        assert abs(calc - raw['LUNCH_COUNT_FREE_REDUCED_PCT']) <= .051
        frl_validation.append({'lea': code(raw['COUNTY_DISTRICT_CODE']), 'calculated': calc, 'source_pct': raw['LUNCH_COUNT_FREE_REDUCED_PCT'], 'source_row': raw['_row']})
    for metric in (frl,state_frl):
        metric.update(year=2025, source_file=DM, source_sheet='Sheet1',
            limitation='Uses 2025 January membership, not 2025–26 preliminary K–12 enrollment. Membership/FRL source counts can be fractional; do not label them as unduplicated partnership participants.')
    state_frl['label'] = 'Missouri reportable-district subset'
    public_demo = []
    for level, rows, filename in [('Charter',district,DM),('Building',building,BM)]:
        for raw in rows:
            lea = code(raw['COUNTY_DISTRICT_CODE']); bld = code(raw.get('SCHOOL_CODE'),4) if level == 'Building' else None
            if lea not in codes or level == 'Building' and (lea,bld) not in keys:
                continue
            fields = ['ENROLLMENT_GRADES_K_12','JANUARY_MEMBERSHIP','LUNCH_COUNT_FREE_REDUCED','LUNCH_COUNT_FREE_REDUCED_PCT','ENROLLMENT_BLACK','ENROLLMENT_BLACK_PCT']
            public_demo.append({'lea':lea,'building':bld,'level':level,'name':raw['SCHOOL_NAME'] if level=='Building' else names[lea],
                'year':2025,'source_file':filename,'source_row':raw['_row'], **{f:raw.get(f) for f in fields},
                'missingness':{f:raw['_missingness'].get(f,missing_reason(None)) for f in fields if raw.get(f) is None}})
    payload['demographic_counts'] = public_demo

    # State MAP reference: exact single State/category/group/subject record.
    state_rows = tables[MS]['Sheet1']; unique(state_rows, ('YEAR','SUMMARY_LEVEL','CATEGORY','TYPE','CONTENT_AREA','GRADE_LEVEL'))
    state_map = []
    state_validation = []
    for row in state_rows:
        assert row['YEAR'] == 2025 and row['SUMMARY_LEVEL'] == 'State' and code(row['COUNTY_DISTRICT']) == '000000'
        p,a,n = (num(row.get(f)) for f in ('PROFICIENT','ADVANCED','REPORTABLE'))
        pa = ratio(p+a,n) if p is not None and a is not None else None
        item = {'year':2025,'category':row['CATEGORY'],'group':row['TYPE'],'subject':row['CONTENT_AREA'],
            'grade_scope':'All tested grades statewide', 'numerator':p+a if p is not None and a is not None else None,
            'denominator':n, 'value':pa, 'source_file':MS,'source_sheet':'Sheet1','source_row':row['_row'],
            'columns':['PROFICIENT','ADVANCED','REPORTABLE'], 'formula':'100 × (PROFICIENT + ADVANCED) / REPORTABLE',
            'direct_comparison':False, 'comparison_reason':'No grade-specific state records were supplied. Building/network grade spans differ, so no grade-matched above-state classification is calculated.'}
        item['missingness'] = {} if pa is not None else {'value':{'reason':'unavailable_components','detail':'Published state Proficient, Advanced and positive Reportable counts are required.'}}
        state_map.append(item)
        if (row['CATEGORY'],row['TYPE']) == TOTAL:
            counts = [num(row[f]) for f in ('BELOW_BASIC','BASIC','PROFICIENT','ADVANCED')]
            assert all(c is not None for c in counts) and sum(counts) == n
            assert p+a == n-num(row['BELOW_BASIC'])-num(row['BASIC'])  # Independent check on fully published State Total counts only.
            state_validation.append(item | {'four_achievement_counts_sum':sum(counts),'validated':True})
    assert {r['subject'] for r in state_validation} == set(SUBJECTS)
    payload['state_map'] = state_map
    map_kpis = {}
    for subject in ('Eng. Language Arts','Mathematics'):
        rows = [r for r in payload['assessments'] if r['level']=='Charter' and (r['category'],r['group'])==TOTAL and r['subject']==subject
                and all(num(r.get(f)) is not None for f in ('PROFICIENT','ADVANCED','REPORTABLE')) and r['REPORTABLE']>0]
        n = sum(r['PROFICIENT']+r['ADVANCED'] for r in rows); d = sum(r['REPORTABLE'] for r in rows)
        map_kpis[subject] = {'numerator':n,'denominator':d,'value':ratio(n,d),'reportable_networks':len(rows),'networks':6,
            'formula':'100 × sum(published Proficient + Advanced) / sum(Reportable), restricted to the same reportable Charter Total rows',
            'year':2025,'above_state_pct':None,'missingness':{'above_state_pct':{'reason':'incompatible_grade_scope','detail':state_validation[0]['comparison_reason']}}}

    # Building APR ALL growth, never combined with district supporting rows.
    apr = [r for r in tables[AB]['Sheet1'] if r['YEAR']==2025]
    unique(apr, ('YEAR','COUNTY_DISTRICT_CODE','SCHOOL_CODE'))
    summary = {(code(r['COUNTY_DISTRICT_CODE']),code(r['SCHOOL_CODE'],4)):r for r in tables[AS]['Sheet1'] if r['YEAR']==2025}
    public_growth, state_growth, cohort_growth = [], {}, {}
    for subject,prefix in [('Eng. Language Arts','ELA'),('Mathematics','MATH')]:
        all_growth = []
        for raw in apr:
            lea,bld = code(raw['COUNTY_DISTRICT_CODE']),code(raw['SCHOOL_CODE'],4)
            possible,earned = (num(raw.get(f'{prefix}_ALL_GROWTH_POINTS_{f}')) for f in ('POSSIBLE','EARNED'))
            designation = raw.get(f'{prefix}_ALL_GROWTH_PERFORMANCE_DESIGNATION')
            if possible is not None and earned is not None:
                assert 0 <= earned <= possible
            eligible = possible is not None and possible>0 and earned is not None and designation is not None
            if eligible:
                assert designation in {'Target','On-Track','On Track','Approaching','Emerging','Participation'}
                assert (earned == possible) == (designation == 'Target')
            item = {'lea':lea,'building':bld,'name':raw['SCHOOL_NAME'],'year':2025,'subject':subject,
                'grade_span':f"{raw['BEG_GRADE']}–{raw['END_GRADE']}", 'possible':possible,'earned':earned,
                'points_pct':ratio(earned,possible),'designation':designation,'eligible':eligible,
                'source_file':AB,'source_sheet':'Sheet1','source_row':raw['_row'],
                'missingness':{k:missing_reason(None) for k,v in [('possible',possible),('earned',earned),('designation',designation)] if v is None}}
            all_growth.append(item)
            if (lea,bld) in keys:
                assert (lea,bld) in summary
                assert all(raw[f] == summary[(lea,bld)][f] for f in ['TOTAL_POINTS_EARNED','TOTAL_POINTS_POSSIBLE'])
                public_growth.append(item)
        state_growth[subject] = grow_summary(all_growth)
        state_growth[subject]['grade_spans'] = {span:grow_summary([r for r in all_growth if r['grade_span']==span]) for span in sorted({r['grade_span'] for r in all_growth})}
        state_growth[subject].update(year=2025,source_file=AB,source_sheet='Sheet1',
            columns=[f'{prefix}_ALL_GROWTH_POINTS_POSSIBLE',f'{prefix}_ALL_GROWTH_POINTS_EARNED',f'{prefix}_ALL_GROWTH_PERFORMANCE_DESIGNATION'],
            limitation='Share of eligible buildings with the source designation Target; not the share of students growing. All eligible grade spans are descriptive; select a grade span for a narrower comparison.')
        cohort_growth[subject] = grow_summary([r for r in public_growth if r['subject']==subject])
    assert len({(r['lea'],r['building']) for r in public_growth}) == 14
    payload['growth'] = public_growth
    payload['benchmarks'] = {'black':state_demo,'frl':state_frl,'growth':state_growth,
        'iep':{'value':None,'reason':'IEP incidence source denominator is not verified; no statewide incidence rate is estimated.'},
        'el':{'value':None,'reason':'No full-population comparable EL benchmark is constructed in this release.'}}
    payload['kpi_metrics'] = {'students':{'value':sum(s['2025–26 K–12'] for s in payload['schools']),'year':'2025–26 preliminary','networks':6},
        'demographics':demographic,'frl':frl,'schools':{'value':len(directory),'networks':6,'year':None,'definition':'Distinct (CTYDIST, SCHNUM) pairs in the supplied undated directory; not unique physical campuses.'},
        'map':map_kpis,'growth':cohort_growth}
    payload['kpi_metrics']['schools']['missingness'] = {'year':{'reason':'not_stated','detail':'The supplied directory does not state its reporting year; 2026 is unverified.'}}
    payload['missing_data_note'] = 'Unavailable*: a source * means suppressed (the reason is not stated in these extracts); blank/NULL/NA means not reported or unavailable. Small-group suppression is not assumed. Missing values remain null and are excluded from calculations with coverage shown.'
    payload['definitions'].update(frl='2025 reported FRL count / January membership, not preliminary K–12 enrollment. Network percentages are ratios of summed counts over the same records.',
        growth='2025 APR building ALL growth Target designations / eligible buildings. Positive points possible, reported earned points and designation define eligibility; Participation remains eligible, and On-Track does not count as Target.',
        map_comparison=state_validation[0]['comparison_reason'])
    lines = ['| KPI | Definition / value | Year | Denominator and limitations |','| --- | --- | --- | --- |',
        f"| Students served | {payload['kpi_metrics']['students']['value']:,} preliminary K–12 students | 2025–26 preliminary | Six unique charter networks; preschool and unverified partnerships excluded |",
        f"| Student demographics | {demographic['numerator']:,} / {demographic['denominator']:,} = {demographic['value']:.6f}% identifying as Black | 2025 | Sum ENROLLMENT_BLACK / ENROLLMENT_GRADES_K_12; all six unique charter records |",
        f"| FRL | {frl['numerator']:,} / {frl['denominator']:,} = {frl['value']:.6f}% | 2025 | LUNCH_COUNT_FREE_REDUCED / JANUARY_MEMBERSHIP; all six networks, independently reproduces source rates to 0.051 percentage point |",
        '| Sponsored schools | 14 directory building identifiers across six charter networks | Undated | No 2026 release confirmation, no physical-campus claim |',
        *[f"| MAP {s} | {v['numerator']} / {v['denominator']} = {v['value']:.6f}% P+A | 2025 | {v['reportable_networks']}/6 reportable charter networks; no grade-matched above-state classification |" for s,v in map_kpis.items()],
        *[f"| APR growth {s} | {v['numerator']} / {v['denominator']} = {v['value']:.6f}% designated Target | 2025 | Eligible building ALL growth measures only; not a student growth percentage |" for s,v in cohort_growth.items()],
        '', 'Source sheet for every raw extract: Sheet1, except directory School Building List (headers row 4). Demographic files supply YEAR, COUNTY_DISTRICT_CODE, counts and corresponding denominators; no school percentages are averaged.', '',
        '## Missouri reference values',
        *[f"- MAP {r['subject']}: ({r['numerator']}) / {r['denominator']} × 100 = {r['value']:.6f}%; {MS}, Sheet1 row {r['source_row']}, columns PROFICIENT, ADVANCED, REPORTABLE. Independently checked against sum of all four published achievement counts = REPORTABLE. No missing component is derived." for r in state_validation],
        *[f"- Demographic {label}: {v['numerator']} / {v['denominator']} × 100 = {v['value']:.6f}%; {v['reportable_records']}/{v['source_records']} paired reportable district records. This is a reportable-district subset, not a complete statewide rate." for label,v in [('Black',state_demo),('FRL',state_frl)]],
        f"- FRL reference exclusions: {state_frl['excluded_missing_or_nonpositive_denominator']} missing/nonpositive pairs and {len(state_frl['excluded_inconsistent_counts'])} records with count greater than membership (including source precision differences). These raw values are not corrected, clamped or added to the reference. Exact source codes/counts are in kpi-calculations.json.",
        *[f"- APR {s}: {v['numerator']} / {v['denominator']} × 100 = {v['value']:.6f}% Target; {v['excluded_records']} of {v['source_records']} building records excluded as ineligible/unreported; {AB}, Sheet1, columns {', '.join(v['columns'])}. District APR rows are not added." for s,v in state_growth.items()], '',
        'Missingness: raw * is documented as suppressed without inferring small cell size. Blank master/history cells do not prove a suppression cause. No suppressed value is reconstructed.',
        'Unresolved: directory reporting year, matched-grade MAP state records, official school-specific MAP targets, complete unsuppressed statewide demographic counts, verified scholarships/events, other-partnership deduplication and current 2026–27 enrollment.']
    return {'kpis':payload['kpi_metrics'],'state_map_validation':state_validation,'frl_rate_validation':frl_validation,
        'state_benchmarks':payload['benchmarks'], 'directory_year_verified':False, 'markdown':'\n'.join(lines)}
