"""Cohort-only demographic history; existing dashboard datasets are untouched."""
from collections import Counter

METRICS = {
    'enrollment': ('K-12 enrollment', 'ENROLLMENT_GRADES_K_12', None, None, 'Reported K-12 enrollment'),
    'black': ('Black enrollment', 'ENROLLMENT_BLACK', 'ENROLLMENT_GRADES_K_12', 'ENROLLMENT_BLACK_PCT', 'Black enrollment / K-12 enrollment'),
    'hispanic': ('Hispanic enrollment', 'ENROLLMENT_HISPANIC', 'ENROLLMENT_GRADES_K_12', 'ENROLLMENT_HISPANIC_PCT', 'Hispanic enrollment / K-12 enrollment'),
    'white': ('White enrollment', 'ENROLLMENT_WHITE', 'ENROLLMENT_GRADES_K_12', 'ENROLLMENT_WHITE_PCT', 'White enrollment / K-12 enrollment'),
    'multiracial': ('Multiracial enrollment', 'ENROLLMENT_MULTIRACIAL', 'ENROLLMENT_GRADES_K_12', 'ENROLLMENT_MULTIRACIAL_PCT', 'Multiracial enrollment / K-12 enrollment'),
    'frl': ('Free/reduced-price lunch', 'LUNCH_COUNT_FREE_REDUCED', 'JANUARY_MEMBERSHIP', 'LUNCH_COUNT_FREE_REDUCED_PCT', 'FRL count / January membership; not fall enrollment'),
    'el': ('English learners', 'ELL_LEP_STUDENTS_ENROLLED_K_12', 'ENROLLMENT_GRADES_K_12', 'ELL_LEP_STUDENTS_ENROLLED_K_12_PCT', 'English learners enrolled K-12 / K-12 enrollment'),
    'iep': ('IEP incidence', 'IEP_SCHOOLAGE_CHILDCOUNT', None, 'IEP_INCIDENCE_RATE', 'Published school-age IEP incidence; exact aggregation denominator is not verified'),
}


def number(value):
    return value if isinstance(value,(int,float)) and not isinstance(value,bool) else None


def extract_demographic_history(payload, tables):
    networks={s['DESE LEA']:s['School'] for s in payload['schools']}
    buildings={(r['lea'],r['building']):r['name'] for r in payload['directory']}
    records=[]
    for level,filename in [('Network','dese_district_demographics_1991_2025.xlsx'),('Building','dese_building_demographics_2006_2025.xlsx')]:
        for raw in tables[filename]['Sheet1']:
            lea=str(raw['COUNTY_DISTRICT_CODE']).zfill(6)
            building=str(raw['SCHOOL_CODE']).zfill(4) if level=='Building' else None
            if lea not in networks or level=='Building' and (lea,building) not in buildings:continue
            fields={}
            for key,(_,count,denom,pct,population) in METRICS.items():
                n=number(raw.get(count));d=number(raw.get(denom)) if denom else None
                published=number(raw.get(pct)) if pct else None
                valid_pair=n is not None and d is not None and d>0 and 0<=n<=d
                if key=='enrollment':
                    value=n if n is not None and n>=0 else None;method='published_count'
                elif key=='iep':
                    value=published if published is not None and 0<=published<=100 else None;method='published_rate'
                elif valid_pair:value=100*n/d;method='ratio_of_counts'
                else:
                    # A valid reported percentage may be shown for ONE unit,
                    # but must never be converted into counts or aggregated.
                    value=published if published is not None and 0<=published<=100 else None;method='published_rate'
                missing={f:raw.get('_missingness',{}).get(f,{'reason':'not_reported','detail':'Not reported in source.'}) for f in (count,denom,pct) if f and raw.get(f) is None}
                fields[key]={'value':value,'numerator':n,'denominator':d,'published_pct':published,
                    'method':method,'aggregatable':key!='iep' and (key=='enrollment' and value is not None or valid_pair),
                    'population':population,'source_columns':[f for f in (count,denom,pct) if f], 'missingness':missing}
                if value is None:fields[key]['reason']='Unavailable source components; suppressed or unreported values are not zero.'
                elif key not in ('enrollment','iep') and n is not None and d is not None and not valid_pair:
                    fields[key]['reason']='Reported count/denominator pair is incompatible; only the published single-unit percentage is shown. No aggregate is formed.'
            records.append({'lea':lea,'building':building,'level':level,'year':raw['YEAR'],
                'name':buildings[(lea,building)] if building else networks[lea],
                'source_name':raw.get('SCHOOL_NAME') if building else raw['DISTRICT_NAME'],
                'source_file':filename,'source_sheet':'Sheet1','source_row':raw['_row'],'metrics':fields})
    keys=[(r['lea'],r['building'],r['year']) for r in records]
    assert len(keys)==len(set(keys)), 'Duplicate unit/year must not be summed'
    return {'records':records,'metrics':{k:{'label':v[0],'population':v[4]} for k,v in METRICS.items()},
        'years':sorted({r['year'] for r in records}),
        'inventory':dict(Counter(r['level'] for r in records)),
        'rules':{'aggregate':'Require every selected unit and valid count/denominator pair from the same year and level. Never average source percentages. IEP remains single-unit only.',
            'race':'Four independently reported categories; not an exhaustive distribution. No remainder is inferred.',
            'history':'Annual DESE demographic exports. Definitions and coverage may vary by year; these extracts alone do not establish invariant historical methodology. Source names may change for a stable identifier. Historical records can predate SLU sponsorship.',
            'period':'Historical years end in 2025. Preliminary 2025-26 enrollment is never appended.'}}
