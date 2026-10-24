"""Data contract and missing-data regressions; run after python build.py."""
import json
from pathlib import Path
import unittest
from build import clean, numeric

ROOT = Path(__file__).resolve().parent


class DataTests(unittest.TestCase):
    def test_missing_is_never_zero(self):
        for value in (None, '', ' ', '*', 'NA', 'N/A', 'NULL', float('nan'), float('inf')):
            self.assertIsNone(clean(value))
            self.assertIsNone(numeric(value))
        self.assertEqual(numeric(0), 0)
        self.assertIsNone(numeric(True))

    def test_public_contract(self):
        data = json.loads((ROOT / 'dist/dashboard-data.json').read_text(encoding='utf-8'))
        schools = data['schools']
        self.assertEqual(len({s['DESE LEA'] for s in schools}), 6)
        self.assertEqual(sum(s['2025–26 K–12'] for s in schools), 3953)
        self.assertEqual(sum(s['MAP ELA P+A %'] is not None and s['MAP Math P+A %'] is not None for s in schools), 3)
        self.assertEqual(data['confirmed_events'], [])
        self.assertNotIn('events', data)
        self.assertTrue(all(any(isinstance(s.get(m['id']), (int, float)) for s in schools) for m in data['metrics']))

    def test_deployment_contains_only_public_files(self):
        self.assertEqual({p.name for p in (ROOT / 'dist').iterdir()}, {'index.html', 'styles.css', 'app.js', 'dashboard-data.json'})
        for name in ('index.html', 'styles.css', 'app.js', 'dashboard-data.json'):
            self.assertEqual((ROOT / name).read_bytes(), (ROOT / 'dist' / name).read_bytes())

    def test_duplicate_lineage(self):
        audit = json.loads((ROOT / 'qa/event-audit.json').read_text(encoding='utf-8'))
        self.assertTrue(audit['duplicates'])
        origins = [tuple(o.values()) for r in audit['records'] for o in r['origins']]
        self.assertEqual(len(origins), len(set(origins)))
        self.assertEqual(len(origins), len(audit['records']) + len(audit['duplicates']))
        self.assertEqual({o['sheet'] for r in audit['records'] for o in r['origins']}, {'Gala Sponsorship Tracker', 'FY27', 'FY26', 'FY25'})
        inventory = json.loads((ROOT / 'qa/workbook-inventory.json').read_text(encoding='utf-8'))
        self.assertTrue(any(s['sheet'] == 'FY24' and s['nonempty_rows'] == 0 for s in inventory))

    def test_expanded_sources_and_suppression(self):
        data = json.loads((ROOT / 'dashboard-data.json').read_text(encoding='utf-8'))
        self.assertEqual(len(data['history']), 96)
        self.assertEqual(len(data['buildings']), 14)
        self.assertEqual(len(data['assessments']), 516)
        self.assertEqual({r['subject'] for r in data['assessments']}, {'Eng. Language Arts', 'Mathematics', 'Science', 'Social Studies'})
        self.assertEqual({r['level'] for r in data['assessments']}, {'Charter', 'Building'})
        self.assertEqual(max(r['Year'] for r in data['history']), 2025)
        for record in data['assessments']:
            p, a, n = (record[k] for k in ('PROFICIENT', 'ADVANCED', 'REPORTABLE'))
            if p is None or a is None or n is None or n <= 0:
                self.assertIsNone(record['PA_PCT'])
            else:
                self.assertEqual(record['PA_PCT'], round(100 * (p + a) / n, 2))
            self.assertIn(record['year'], [2025])

    def test_building_and_historical_keys(self):
        data = json.loads((ROOT / 'dashboard-data.json').read_text(encoding='utf-8'))
        self.assertEqual(len({(r['DESE LEA'], r['Year']) for r in data['history']}), len(data['history']))
        for school in data['schools']:
            buildings = [r for r in data['buildings'] if r['DESE LEA'] == school['DESE LEA']]
            self.assertEqual(sum(r['K–12 prelim'] for r in buildings), school['2025–26 K–12'])
            self.assertEqual(len(buildings), school['DESE buildings'])


if __name__ == '__main__':
    unittest.main()
