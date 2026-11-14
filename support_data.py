"""Source-traceable sponsorship requests and staff-reported engagement.

Public output is an explicit allowlist. Original workbook business fields and
worksheet/row provenance stay in the existing local event evidence file.
"""
import csv
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'data/community_engagement/2026_engagement.csv'
TYPES = {'student_event', 'estimated_event', 'general_attendees', 'program_enrollment', 'planned'}


def engagement(path=SOURCE):
    with Path(path).open(encoding='utf-8', newline='') as stream:
        rows = list(csv.DictReader(stream))
    ids = set()
    for row in rows:
        assert row['id'] not in ids
        ids.add(row['id'])
        for key in ('participants_min', 'participants_max'):
            row[key] = int(row[key]) if row[key] else None
        for key in ('start_date', 'end_date', 'organization', 'location', 'missing_reason'):
            row[key] = row[key] or None
        low, high = row['participants_min'], row['participants_max']
        assert (low is None) == (high is None)
        assert low is None or 0 <= low <= high
        assert row['participation_type'] in TYPES
        assert row['status'] in {'Reported', 'Planned'}
        assert (row['status'] == 'Planned') == (row['participation_type'] == 'planned')
        assert row['count_verification'] == 'Staff reported; not independently verified'
        for key in ('start_date', 'end_date'):
            if row[key]:
                from datetime import date
                date.fromisoformat(row[key])
        assert not row['end_date'] or row['end_date'] >= row['start_date']
    eligible = [r for r in rows if r['participation_type'] == 'student_event' and r['status'] == 'Reported' and r['participants_min'] is not None and r['participants_min'] == r['participants_max']]
    summary = {
        'activities': len(rows),
        'numeric_activities': sum(r['participants_min'] is not None for r in rows),
        'reported_numeric_activities': sum(r['status'] == 'Reported' and r['participants_min'] is not None for r in rows),
        'eligible_activities': len(eligible),
        'participation_instances': sum(r['participants_min'] for r in eligible),
        'planned_activities': sum(r['status'] == 'Planned' for r in rows),
        'ongoing_programs': sum(r['participation_type'] == 'program_enrollment' for r in rows),
        'unique_students': None,
        'categories': dict(Counter(r['category'] for r in rows)),
        'source': 'OSCP staff-reported 2026 activity notes',
    }
    return {'rows': rows, 'summary': summary}


def sponsorships(events):
    rows = []
    for i, event in enumerate(events, 1):
        source = event['record']
        decision = str(source.get('Decision Status') or '').strip()
        normalized = decision.casefold()
        # Neither a request amount nor an approval amount establishes payment.
        status = {'approved': 'Approved', 'funded': 'Funded', 'paid': 'Funded', 'denied': 'Denied', 'rejected': 'Denied', 'requested': 'Requested'}.get(normalized, 'Unknown')
        amount = source.get('Amount Requested')
        approved = source.get('Amount Approved/ Provided')
        assert amount is None or isinstance(amount, (int, float))
        assert approved is None or isinstance(approved, (int, float))
        # Sheet membership is provenance, not a fiscal-year assignment.
        sheet_years = sorted({o['sheet'] for o in event['origins'] if re.fullmatch(r'FY\d{2}', o['sheet'])})
        rows.append({'id': f'S-{i:03}', 'organization': source.get('Organization Name'),
                     'activity': source.get('Event Name'), 'date': source.get('Event Date'),
                     'fiscal_year': source.get('Fiscal Year'), 'worksheet_years': sheet_years,
                     'requested_amount': amount, 'approved_amount': approved,
                     'status': status, 'source_count': len(event['origins']),
                     'source': 'OSCP sponsorship workbook',
                     'source_rows': [{'worksheet': o['sheet'] if re.fullmatch(r'FY\d{2}', o['sheet']) else 'General sheet', 'row': o['row']} for o in event['origins']]})
    return {'rows': rows, 'summary': {
        'unique_entries': len(rows), 'source_rows': sum(r['source_count'] for r in rows),
        'duplicate_rows': sum(r['source_count'] - 1 for r in rows),
        'requests_with_amount': sum(r['requested_amount'] is not None for r in rows),
        'requested_amount': sum(r['requested_amount'] for r in rows if r['requested_amount'] is not None),
        'approved_entries': sum(r['status'] == 'Approved' for r in rows) or None,
        'approved_amount': sum(r['approved_amount'] for r in rows if r['approved_amount'] is not None) if any(r['approved_amount'] is not None for r in rows) else None,
        'organizations': len({r['organization'] for r in rows if r['organization']}),
        'dated_entries': sum(r['date'] is not None for r in rows),
        'fiscal_year_entries': sum(r['fiscal_year'] is not None for r in rows),
    }}


def package_support(events, root=ROOT):
    packet = {'sponsorships': sponsorships(events), 'engagement': engagement()}
    from public_package import PRIVATE
    encoded = json.dumps(packet, ensure_ascii=False, separators=(',', ':'))
    assert not PRIVATE.search(encoded), 'Private text in support packet'
    for base in (Path(root), Path(root)/'dist'):
        (base/'support-data.json').write_text(encoded, encoding='utf-8')
    return packet
