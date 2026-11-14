"""Allowlisted public packets; calculations remain in the existing pipeline."""
import json
import re
from pathlib import Path

PRIVATE = re.compile(r'candi|ryan|harshil|abigail|owner|todo|awaiting|pending|confirmed_by|gala|tracker|audit|qa|supplied source|missing-data|open item|needs clarification|4,081', re.I)
DROP = {'sources','data_inventory','definitions','public_source_verification','state_enrollment_audit','missingness','verification_notes','opening_verification','original_directory','network_opening','opening_year_scope','verified_program_or_facility_history','slides','coverage','tracker','tracker_summary','public_sources','explorer_files','status_vocabulary','missing_data_note','Data notes'}
DROP.update({'formula','limitations','limitation','scope_note','grade_scope','method','reason','detail','definition','refresh','source_columns','source_row','aggregate_source_row','state_source_row','grade_source_files','count_column','denominator_column','raw_preliminary_status'})

def public(value):
    if isinstance(value, dict):
        return {k: public(v) for k,v in value.items() if k not in DROP and not PRIVATE.search(k)}
    if isinstance(value, list):
        return [public(v) for v in value]
    if isinstance(value, str):
        if PRIVATE.search(value):
            return 'Not published'
        return value
    return value

def package(payload, root):
    dist = root/'dist'
    for name in ('dashboard-data.json','explorer-requests.json'):
        (dist/name).unlink(missing_ok=True)
    base = {k:payload[k] for k in ('generated_at','dashboard_year','schools','buildings','directory','directory_summary','kpi_metrics','benchmarks','state_map','growth','official_state_context')}
    base['three_levels'] = {k:payload['three_levels'][k] for k in ('bridge','profiles','cities','demographics','map_rows','map_coverage')}
    base['programs'] = {k:payload['three_levels']['inputs'][k]['confirmed'] for k in ('scholarships','events','partnership_reach','oscp_operations')}
    packets = {'summary.json':base, 'explorer-core.json':{k:payload[k] for k in ('history','demographic_counts')}, 'explorer-map.json':{k:payload[k] for k in ('assessments','matched_map')}, 'explorer-demographics.json':{'demographics_explorer':payload['demographics_explorer']}}
    history = payload['demographics_explorer']
    packets['canvas-overview.json'] = {'history': [{k:r[k] for k in ('lea','building','level','name','year','statuses') if k in r} | {'metrics':{k:r['metrics'][k] for k in ('enrollment','frl')}} for r in history['records']]}
    packets['canvas-students.json'] = {'history':history['records']}
    packets['canvas-learning.json'] = {'grades':payload['matched_map']['grade_slices'],'assessments':payload['assessments']}
    for name, packet in packets.items():
        encoded = json.dumps(public(packet),ensure_ascii=False,separators=(',',':')).encode()
        if name=='summary.json':
            assert len(encoded)<400000
        (dist/name).write_bytes(encoded)
        (root/name).write_bytes(encoded)
    (root/'docs/internal/dashboard-data.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
