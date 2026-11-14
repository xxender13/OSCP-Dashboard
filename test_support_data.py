"""Independent contracts for requests, ranges, plans and compatible populations."""
import json
from pathlib import Path
import unittest

from support_data import engagement, sponsorships

ROOT = Path(__file__).resolve().parent


class SupportDataTests(unittest.TestCase):
    def test_engagement_populations_and_ranges(self):
        data = engagement()
        summary, rows = data['summary'], data['rows']
        self.assertEqual(summary['activities'], 23)
        self.assertEqual(summary['numeric_activities'], 22)
        self.assertEqual(summary['reported_numeric_activities'], 19)
        self.assertEqual(summary['eligible_activities'], 15)
        self.assertEqual(summary['participation_instances'], 16860)
        self.assertEqual(summary['ongoing_programs'], 2)
        self.assertEqual(summary['planned_activities'], 3)
        self.assertIsNone(summary['unique_students'])
        fair = next(r for r in rows if r['activity'] == 'SLPS College Fair')
        self.assertEqual((fair['participants_min'], fair['participants_max']), (700, 900))
        self.assertEqual(fair['participation_type'], 'estimated_event')
        bee = next(r for r in rows if 'Spelling Bee' in r['activity'])
        self.assertEqual(bee['participants_min'], 200)  # finalist subset never added
        hope = next(r for r in rows if r['activity'] == 'Hope Ignite College Preparation')
        self.assertEqual((hope['status'], hope['participants_min']), ('Planned', 25))
        self.assertTrue(all(r['status'] == 'Planned' for r in rows if r['start_date'] and r['start_date'].startswith('2026-11')))
        garden = next(r for r in rows if 'Black History' in r['activity'])
        self.assertIsNone(garden['participants_min'])
        visit = next(r for r in rows if 'Ferguson' in r['activity'])
        self.assertIsNone(visit['start_date'])
        self.assertIsNone(next(r for r in rows if r['activity'] == 'Student Support Program')['start_date'])

    def test_blank_decisions_never_approve_or_pay(self):
        event = {'record': {'Organization Name': 'Example', 'Amount Requested': 500},
                 'origins': [{'sheet': 'FY26', 'row': 2}, {'sheet': 'FY27', 'row': 2}]}
        result = sponsorships([event])
        row = result['rows'][0]
        self.assertEqual(row['status'], 'Unknown')
        self.assertIsNone(row['fiscal_year'])
        self.assertEqual(row['worksheet_years'], ['FY26', 'FY27'])
        self.assertIsNone(row['approved_amount'])
        self.assertIsNone(result['summary']['approved_entries'])
        self.assertEqual(result['summary']['requested_amount'], 500)
        self.assertEqual(result['summary']['source_rows'], 2)
        self.assertEqual(result['summary']['unique_entries'], 1)
        event['record']['Decision Status'] = 'Approved'
        row = sponsorships([event])['rows'][0]
        self.assertEqual(row['status'], 'Approved')
        self.assertIsNone(row['approved_amount'])  # approval alone is not a dollar amount

    @unittest.skipUnless((ROOT/'qa/event-audit.json').exists(), 'Local workbook evidence required')
    def test_workbook_deduplication_and_safe_allowlist(self):
        source = json.loads((ROOT/'qa/event-audit.json').read_text(encoding='utf-8'))
        result = sponsorships(source['records'])
        s = result['summary']
        self.assertEqual((s['source_rows'], s['unique_entries'], s['duplicate_rows']), (65, 26, 39))
        self.assertEqual((s['requests_with_amount'], s['requested_amount']), (19, 130220))
        self.assertEqual((s['dated_entries'], s['fiscal_year_entries']), (1, 0))
        self.assertTrue(all(r['status'] == 'Unknown' for r in result['rows']))
        serialized = json.dumps(result).casefold()
        for private in ('funding source', 'approval authority', 'invites', 'rationale', 'herrmann'):
            self.assertNotIn(private, serialized)

    def test_public_packet_preserves_separate_enrollment(self):
        packet = json.loads((ROOT/'dist/support-data.json').read_text(encoding='utf-8'))
        self.assertEqual(packet['engagement'], engagement())
        summary = json.loads((ROOT/'dist/summary.json').read_text(encoding='utf-8'))
        self.assertEqual(summary['kpi_metrics']['students']['value'], 3953)
        self.assertNotIn('unique_students', summary['kpi_metrics'])


if __name__ == '__main__':
    unittest.main()
