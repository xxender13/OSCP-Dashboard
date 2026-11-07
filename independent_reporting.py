"""Apply independently verified public references without mutating source values."""
from collections import Counter, defaultdict
from copy import deepcopy
import json
import math
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parent
SNAPSHOT=ROOT/'reference-data/dese-2025-independent.json'


def numeric(v):
    return v if isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) else None


def canonical(value):
    return str(value).strip().casefold().removeprefix('msip ')


def grade_key(row):
    return (row['CONTENT_AREA'],canonical(row['CATEGORY']),canonical(row['TYPE']),str(row['GRADE_LEVEL']))


def parts(row):
    p,a,n=(numeric(row.get(f)) for f in ('PROFICIENT','ADVANCED','REPORTABLE'))
    return (p,a,n) if p is not None and a is not None and n is not None and n>0 and 0<=p+a<=n else None


def street_key(street,city):
    value=street.upper()
    for a,b in [('BOULEVARD','BLVD'),('AVENUE','AVE'),('STREET','ST'),('EAST','E'),('DRIVE','DR')]:
        value=re.sub(r'\b'+a+r'\b',b,value)
    return re.sub(r'[^A-Z0-9 ]','',value).strip()+' | '+city.upper().strip()


def apply_independent_findings(payload,tables):
    source=json.loads(SNAPSHOT.read_text(encoding='utf-8'))
    payload['official_state_context']=source['official_state']
    payload['benchmark_subsets']={key:deepcopy(payload['benchmarks'][key]) for key in ('black','frl')}
    for field in ('black','frl','iep','el','white','hispanic','multiracial','asian','american_indian','pacific_islander'):
        public=deepcopy(source['official_state'][field])
        public.update(label='Missouri official published '+{'black':'Black enrollment','frl':'FRL','iep':'IEP incidence','el':'EL'}.get(field,field.replace('_',' ').title())+' context',
            source_file='Official DESE public publication',source_sheet=public.get('table'),
            limitation='Published statewide rounded percentage; missing underlying counts are not reconstructed. No percentage-point gap is computed.')
        public['missingness']={k:{'reason':'not_printed','detail':'The public publication does not print this underlying count; it is not reverse-engineered from a rounded rate.'} for k in ('numerator','denominator') if public.get(k) is None}
        payload['benchmarks'][field]=public
    # The local workbook contains district rows only, including suppressed cells.
    district=[r for r in tables['dese_district_demographics_1991_2025.xlsx']['Sheet1'] if r['YEAR']==2025]
    assert len({str(r['COUNTY_DISTRICT_CODE']).zfill(6) for r in district})==len(district)==564
    assert not any(str(r['COUNTY_DISTRICT_CODE']).zfill(6)=='000000' for r in district)
    payload['state_enrollment_audit']={'year':2025,'district_rows':564,'state_total_row_present':False,
        'district_sum':sum(r['ENROLLMENT_GRADES_K_12'] for r in district if numeric(r.get('ENROLLMENT_GRADES_K_12')) is not None),
        'missing_district_enrollment_records':sum(numeric(r.get('ENROLLMENT_GRADES_K_12')) is None for r in district),
        'official_published_total':source['official_state']['enrollment']['value'],
        'decision':'Use the published 2024–25 K–12 total as context, not the incomplete district sum. Do not derive the suppressed remainder.'}

    # Dated directory outranks the undated extract; numerical historical rows
    # and 2025 APR grade spans retain their original values and periods.
    directory={(r['lea'],r['building']):r for r in source['directory']}
    rawdir={(str(r['CTYDIST']).zfill(6),str(r['SCHNUM']).zfill(4)):r for r in tables['dese_school_building_directory_undated.xlsx']['School Building List']}
    assert len(directory)==len(payload['directory'])==14
    for row in payload['directory']:
        key=(row['lea'],row['building']);verified=directory[key];raw=rawdir[key]
        row['original_directory']={'name':row['name'],'grades':row['grades'],'reporting_year':row['reporting_year'],'source_row':row['source_row']}
        row.update(verified);row['reporting_year']=2026;row['missingness']={}
        row['street']=raw['SCHADDR1'];row['city']=raw['SCHCITY'];row['zip']=str(raw['SCHZIP'])
        if key==('048925','6985'):
            row.update(street='2800 E. Linwood Boulevard',city='Kansas City',zip='641281544')
        row['secondary_address_source']=raw.get('SCHADDR2')
        row['address_group']=street_key(row['street'],row['city'])
        row['verification_notes']=[r['detail'] for r in source['source_conflicts'] if '/'.join(key) in r['keys']]
        row['opening_year_scope']='Network only; individual-building opening year is not established.'
        row['network_opening']=next(o for o in source['network_openings'] if o['lea']==row['lea'])
        row['verified_program_or_facility_history']=[h for h in source.get('building_history',[]) if (h['lea'],h['building'])==key]
    addresses=defaultdict(list)
    for row in payload['directory']:addresses[row['address_group']].append(row['lea']+'/'+row['building'])
    for row in payload['directory']:
        row['shared_address_with']=[k for k in addresses[row['address_group']] if k!=row['lea']+'/'+row['building']]
    payload['directory_summary']={'building_identifiers':14,'networks':6,'source_as_of':'2026-06-30',
        'distinct_normalized_street_addresses':len(addresses),'shared_address_groups':[{'address':k,'identifiers':v} for k,v in addresses.items() if len(v)>1],
        'campus_count':None,'limitation':'Street-address groups are not a verified count of unique physical campuses. Address conflicts and secondary lines are explicitly retained.'}
    payload['kpi_metrics']['schools'].update(year=2026,as_of='2026-06-30',missingness={},
        definition='14 distinct DESE building identifiers, confirmed in the official directory dated June 30, 2026; not a count of physical campuses.')
    for school in payload['schools']:
        opening=next(o for o in source['network_openings'] if o['lea']==school['DESE LEA'])
        assert school['Opened school year'].replace('–','-')==opening['opened_school_year']
        school['opening_verification']=opening

    state={};units=defaultdict(list)
    for row in source['grade_records']:
        assert row['YEAR']==2025
        if row['level']=='State':
            assert grade_key(row) not in state
            state[grade_key(row)]=row
        else:
            key=(row['level'],row['lea'],row['building'],row['CONTENT_AREA'],canonical(row['CATEGORY']),canonical(row['TYPE']))
            units[key].append(row)
    comparisons=[];slices=[]
    for aggregate in payload['assessments']:
        key=(aggregate['level'],aggregate['lea'],aggregate['building'],aggregate['subject'],canonical(aggregate['category']),canonical(aggregate['group']))
        grades=units.get(key,[])
        assert len({str(g['GRADE_LEVEL']) for g in grades})==len(grades)
        result={'lea':aggregate['lea'],'building':aggregate['building'],'level':aggregate['level'],'name':aggregate['name'],
            'subject':aggregate['subject'],'category':aggregate['category'],'group':aggregate['group'],'year':2025,
            'school_numerator':None,'school_denominator':aggregate['REPORTABLE'],'school_pct':None,'state_grade_mix_pct':None,
            'difference_pp':None,'above_state':None,'eligible':False,'grade_rows':len(grades),'matched_grade_rows':0,
            'grade_labels':[str(g['GRADE_LEVEL']) for g in grades], 'grade_source_files':sorted({g['source_file'] for g in grades}),
            'aggregate_source_file':aggregate['source_file'],'aggregate_source_row':aggregate['source_row']}
        reason=None
        if not parts(aggregate):reason='Aggregate Proficient, Advanced or positive Reportable is unavailable; no suppressed aggregate is reconstructed.'
        if not grades:reason='No exact subject/group grade-level export rows match this aggregate.'
        matched=[]
        for grade in grades:
            reference=state.get(grade_key(grade));observed=parts(grade);expected=parts(reference) if reference else None
            if observed and expected:matched.append((observed,expected))
        result['matched_grade_rows']=len(matched)
        if grades and len(matched)!=len(grades):reason=reason or 'One or more grade component counts or exact state grade/group matches are unavailable.'
        if grades and len(matched)==len(grades) and parts(aggregate):
            p,a,n=parts(aggregate)
            totals=tuple(sum(g[0][i] for g in matched) for i in range(3))
            if totals!=(p,a,n):reason='Grade totals do not reconcile to the existing published aggregate; no source versions or populations are silently combined.'
            elif reason is None:
                # Direct standardization: state grade rates weighted by this
                # school's tested-grade mix, not an unweighted rate average.
                benchmark=100*sum(o[2]*(e[0]+e[1])/e[2] for o,e in matched)/n
                result.update(school_numerator=p+a,school_denominator=n,school_pct=100*(p+a)/n,
                    state_grade_mix_pct=benchmark,difference_pp=100*(p+a)/n-benchmark,
                    above_state=100*(p+a)/n>benchmark,eligible=True)
        result['reason']=reason
        result['missingness']={} if result['eligible'] else {'comparison':{'reason':'incomplete_or_incompatible_scope','detail':reason or 'No complete published comparison.'}}
        comparisons.append(result)
    # The grade report is independent of the legacy MSIP subgroup inventory.
    # Retain every available new-source subgroup instead of silently limiting
    # it to groups present in the older all-required-content export.
    slices=[]
    network_names={s['DESE LEA']:s['School'] for s in payload['schools']}
    building_names={(r['lea'],r['building']):r['name'] for r in payload['directory']}
    for grade in source['grade_records']:
        if grade['level']=='State':continue
        reference=state.get(grade_key(grade));observed=parts(grade);expected=parts(reference) if reference else None
        item={'lea':grade['lea'],'building':grade['building'],'level':grade['level'],
            'name':building_names[(grade['lea'],grade['building'])] if grade['level']=='Building' else network_names[grade['lea']],
            'subject':grade['CONTENT_AREA'],'category':grade['CATEGORY'],'group':grade['TYPE'],'grade':str(grade['GRADE_LEVEL']),
            'year':2025,'source_file':grade['source_file'],'source_row':grade['source_row'],
            'state_source_file':reference['source_file'] if reference else None,'state_source_row':reference['source_row'] if reference else None,
            'school_numerator':observed[0]+observed[1] if observed else None,'school_denominator':observed[2] if observed else None,
            'state_numerator':expected[0]+expected[1] if expected else None,'state_denominator':expected[2] if expected else None,
            'school_pct':100*(observed[0]+observed[1])/observed[2] if observed else None,
            'state_pct':100*(expected[0]+expected[1])/expected[2] if expected else None}
        item['above_state']=item['school_pct']>item['state_pct'] if observed and expected else None
        item['missingness']={} if observed and expected else {'comparison':{'reason':'missing_grade_components','detail':'Exact subject, group and grade require both published Proficient/Advanced counts and positive Reportable. Missing counts are not reconstructed.'}}
        slices.append(item)
    assert len(slices)==sum(r['level']!='State' for r in source['grade_records'])
    summaries={}
    for subject in ('Eng. Language Arts','Mathematics'):
        summaries[subject]={}
        for level,total in [('Building',14),('Charter',6)]:
            rows=[r for r in comparisons if r['level']==level and r['subject']==subject and canonical(r['category'])=='total' and canonical(r['group'])=='total']
            eligible=[r for r in rows if r['eligible']];above=sum(r['above_state'] for r in eligible)
            summaries[subject][level]={'numerator':above,'denominator':len(eligible),'source_units':total,'value':100*above/len(eligible) if eligible else None,
                'excluded_units':total-len(eligible),'year':2025,'method':'Strictly exceeds the matched subject/group, school-tested-grade-mix-weighted Missouri proficiency rate. Full published aggregate and every grade must reconcile; never an official school-specific goal.'}
        network=summaries[subject]['Charter'];metric=payload['kpi_metrics']['map'][subject]
        metric['above_state_pct']=network['value'];metric['grade_matched_network_comparison']=network
        metric['grade_matched_building_comparison']=summaries[subject]['Building']
        metric['missingness']={} if network['value'] is not None else {'above_state_pct':{'reason':'incomplete_grade_scope','detail':'No fully reconciling, reportable charter-grade comparisons.'}}
    payload['matched_map']={'comparisons':comparisons,'grade_slices':slices,'summaries':summaries,
        'formula':'School P+A = 100×(P+A)/N. State grade-mix benchmark = 100×sum(N_school_grade×(P_state_grade+A_state_grade)/N_state_grade)/sum(N_school_grade).',
        'limitations':'Only exact 2025 subject/group/grade matches with fully published components are used. Aggregate classifications additionally require all grades to reconcile to the already-published aggregate counts. This is descriptive attainment above a matched state benchmark, not an official school target or causal sponsorship effect.'}
    # Grade exports use a different reporting population from MSIP all-required-
    # content aggregates and include optional EOCs. Do not silently pool them or
    # recover a suppressed all-grade value. A single matched grade/course is
    # independently comparable and counts each school once.
    grade_summaries={}
    for subject in ('Eng. Language Arts','Mathematics'):
        grade_summaries[subject]={}
        for grade in sorted({r['grade'] for r in slices if r['subject']==subject}):
            grade_summaries[subject][grade]={}
            for level,total in [('Building',14),('Charter',6)]:
                rows=[r for r in slices if r['subject']==subject and r['grade']==grade and r['level']==level and canonical(r['category'])=='total' and canonical(r['group'])=='total']
                assert len({(r['lea'],r['building']) for r in rows})==len(rows)
                eligible=[r for r in rows if r['above_state'] is not None];above=sum(r['above_state'] for r in eligible)
                grade_summaries[subject][grade][level]={'numerator':above,'denominator':len(eligible),'source_records':len(rows),
                    'portfolio_units':total,'value':100*above/len(eligible) if eligible else None,'year':2025,'grade':grade,
                    'definition':'Schools with published grade-specific P+A strictly above the same State subject/group/grade rate; one school record per selected grade/course. This is not a school-specific goal.'}
    payload['matched_map']['grade_summaries']=grade_summaries
    payload['matched_map']['scope_note']='The grade export Total population is different from the existing MSIP Total all-required-content population and includes optional EOC courses. Single-grade/course comparisons are supported; whole-school MSIP comparisons remain unavailable unless every grade and published aggregate reconcile. No grades, courses or subgroups are added together in the default grade report.'
    payload['public_source_verification']={'sources':source['sources'],'directory_conflicts':source['source_conflicts'],'rejected_sources':source['rejected_sources'],
        'refresh':'Fetch official sources, prepare the reference snapshot, then rebuild. No network access is required at runtime or during ordinary offline builds.'}
    payload['definitions']['map_comparison']=payload['matched_map']['limitations']
    return {'matched_map_summaries':summaries,'grade_summaries':grade_summaries,'comparison_exclusions':dict(Counter(r['reason'] for r in comparisons if not r['eligible'])),
        'official_state':source['official_state'],'directory_summary':payload['directory_summary'],
        'sources':source['sources'],'state_enrollment_audit':payload['state_enrollment_audit']}
