"""Validated, confirmed-only OSCP inputs. A request is never a funded event."""
import csv
from datetime import date
from decimal import Decimal,InvalidOperation

PUBLIC={'confirmed','awarded','approved','completed'}
SCHEMAS={
'scholarships':'program,award_year,awards_count,amount_per_award_usd,total_amount_usd,status,source,confirmed_by,confirmed_date,notes',
'events':'event_id,event_name,category,fiscal_year,event_date,city,host_org,oscp_role,amount_requested_usd,amount_approved_usd,funding_source,status,attendance,students_participating,schools_represented,photo_path,source,confirmed_by,confirmed_date,notes',
'partnership_reach':'program_id,program_name,partner_org,reporting_period,students_served,unduplicated_method,overlaps_sponsored_schools,counted_in_total,source,confirmed_by,confirmed_date,status,notes',
'oscp_operations':'measure,value,unit,as_of,source,confirmed_by,confirmed_date,status,notes',
'campus_counts':'school,physical_campuses,source,confirmed_by,confirmed_date,status'}
NUMBER_FIELDS={'awards_count','amount_per_award_usd','total_amount_usd','amount_requested_usd','amount_approved_usd','attendance','students_participating','schools_represented','students_served','value','physical_campuses'}
INTEGER={'awards_count','attendance','students_participating','schools_represented','students_served','physical_campuses'}
KEY={'scholarships':('program','award_year'),'events':('event_id',),'partnership_reach':('program_id',),'oscp_operations':('measure',),'campus_counts':('school',)}
REQUIRED_NUM={'scholarships':'awards_count','events':'amount_approved_usd','partnership_reach':'students_served','oscp_operations':'value','campus_counts':'physical_campuses'}
OWNERS={'scholarships':'Candi','events':'Ryan and Candi','partnership_reach':'Ryan Wilson','oscp_operations':'Candi','campus_counts':'Candi'}

def load_inputs(folder,sponsored=3953,assets=None):
    result={}
    for name,columns in SCHEMAS.items():
        with (folder/(name+'.csv')).open(encoding='utf-8-sig',newline='') as f:
            reader=csv.DictReader(f);assert reader.fieldnames==columns.split(','),f'{name}: invalid header'
            rows=[];seen=set()
            for line,raw in enumerate(reader,2):
                if None in raw:raise ValueError(f'{name}:{line}: extra CSV columns')
                row={k:(v or '').strip() for k,v in raw.items()};key=tuple(row[k] for k in KEY[name])
                if not all(key) or key in seen:raise ValueError(f'{name}:{line}: missing or duplicate identifier {key}')
                seen.add(key)
                for k,v in list(row.items()):
                    if k in NUMBER_FIELDS:
                        if not v:row[k]=None;continue
                        try:n=Decimal(v)
                        except InvalidOperation:raise ValueError(f'{name}:{line}: invalid number {k}')
                        if not n.is_finite() or n<0 or k in INTEGER and n!=n.to_integral():raise ValueError(f'{name}:{line}: invalid nonnegative value {k}')
                        row[k]=int(n) if n==n.to_integral() else float(n)
                    elif k.endswith('_date') or k in ('event_date','as_of'):
                        if v:
                            try:date.fromisoformat(v)
                            except ValueError:raise ValueError(f'{name}:{line}: {k} must be YYYY-MM-DD')
                allowed={'requested','approved','completed','declined','unknown'} if name=='events' else PUBLIC|{'pending','proposed','unknown','declined'}
                if row['status'] not in allowed:raise ValueError(f'{name}:{line}: invalid status')
                if name=='events' and row['category'] not in {'Spelling Bee','Summer Learning Institute','GAINS','Gala','Conference','Other'}:raise ValueError(f'{name}:{line}: invalid category')
                if name=='partnership_reach':
                    if row['overlaps_sponsored_schools'] not in {'yes','no','unknown'} or row['counted_in_total'] not in {'yes','no'}:raise ValueError(f'{name}:{line}: invalid overlap/count flag')
                    if row['counted_in_total']=='yes' and not row['unduplicated_method']:raise ValueError(f'{name}:{line}: counted reach needs an unduplicated method')
                row['public']=row['status'] in PUBLIC and all(row.get(k) for k in ('source','confirmed_by','confirmed_date')) and row[REQUIRED_NUM[name]] is not None
                row['display_status']='reported' if row['public'] else 'pending';row['owner']=OWNERS[name]
                if name=='events':
                    photo=row['photo_path'];row['photo_available']=False
                    if photo:
                        path=(assets.parent.parent/photo).resolve() if assets else None
                        if not assets or not path.is_relative_to(assets.resolve()):raise ValueError(f'{name}:{line}: photo_path must be under assets/events/')
                        row['photo_available']=path.is_file()
                rows.append(row)
        result[name]={'confirmed':[r for r in rows if r['public']],'pending':[r for r in rows if not r['public']],'owner':OWNERS[name]}
    reach=[r for r in result['partnership_reach']['confirmed'] if r['counted_in_total']=='yes']
    unknown=any(r['overlaps_sponsored_schools']=='unknown' for r in reach)
    included=[r for r in reach if r['overlaps_sponsored_schools']=='no']
    result['total_reach']={'value':None if not reach or unknown else sponsored+sum(r['students_served'] for r in included), 'status':'pending' if not reach or unknown else 'reported','label':'Total reach awaiting overlap check' if unknown else 'Awaiting confirmation' if not reach else 'Confirmed total reach','lower_bound':sponsored if unknown else None,'upper_bound':sponsored+sum(r['students_served'] for r in result['partnership_reach']['confirmed']) if unknown else None,'included':included,'formula':'Sponsored-school K–12 enrollment + confirmed partnership students marked counted=yes and overlap=no; verify periods and cross-program deduplication.'}
    result['scholarship_totals']={'count':sum(r['awards_count'] for r in result['scholarships']['confirmed']) if result['scholarships']['confirmed'] else None,'dollars':sum(r['total_amount_usd'] for r in result['scholarships']['confirmed']) if result['scholarships']['confirmed'] and all(r['total_amount_usd'] is not None for r in result['scholarships']['confirmed']) else None}
    return result
