"""Regression checks for independently verified public references and scope."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent


class IndependentAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT/'dashboard-data.json').read_text(encoding='utf-8'))
        cls.source = json.loads((ROOT/'reference-data/dese-2025-independent.json').read_text(encoding='utf-8'))

    def test_official_rates_do_not_invent_counts(self):
        for field, value in [('black',15.3),('frl',49.3),('el',5.0),('iep',13.93)]:
            row = self.data['benchmarks'][field]
            self.assertEqual(row['value'], value)
            self.assertEqual(row['method'], 'official_published_percent')
            self.assertIsNone(row['denominator'])
            self.assertTrue(row['source_url'].startswith('https://dese.mo.gov/'))
        self.assertEqual(self.data['benchmark_subsets']['black']['numerator'],130504)
        self.assertEqual(self.data['state_enrollment_audit']['official_published_total'],856222)
        self.assertEqual(self.data['state_enrollment_audit']['missing_district_enrollment_records'],6)

    def test_dated_buildings_are_not_campuses(self):
        rows=self.data['directory']
        self.assertEqual(len({(r['lea'],r['building']) for r in rows}),14)
        self.assertTrue(all(r['as_of']=='2026-06-30' and r['source_page']>0 for r in rows))
        self.assertEqual(self.data['directory_summary']['distinct_normalized_street_addresses'],12)
        self.assertIsNone(self.data['directory_summary']['campus_count'])
        self.assertEqual(sum(bool(r['shared_address_with']) for r in rows),4)
        self.assertIn('Linwood',next(r for r in rows if r['lea']=='048925')['street'])

    def test_grade_three_comparison_against_raw_reference(self):
        for subject, expected in [('Eng. Language Arts',1),('Mathematics',2)]:
            raw=[r for r in self.source['grade_records'] if r['CONTENT_AREA']==subject and str(r['GRADE_LEVEL'])=='3' and r['CATEGORY']=='Total' and r['TYPE']=='Total']
            state=next(r for r in raw if r['level']=='State')
            def ratio(r):
                p,a,n=(r[k] for k in ('PROFICIENT','ADVANCED','REPORTABLE'))
                return (p+a)/n if all(isinstance(v,(int,float)) for v in (p,a,n)) and n>0 else None
            schools=[r for r in raw if r['level']=='Building' and ratio(r) is not None]
            self.assertEqual(len(schools),4)
            self.assertEqual(sum(ratio(r)>ratio(state) for r in schools),expected)
            published=self.data['matched_map']['grade_summaries'][subject]['3']['Building']
            self.assertEqual((published['numerator'],published['denominator']),(expected,4))
            self.assertIsNone(self.data['matched_map']['summaries'][subject]['Building']['value'])

    def test_each_grade_slice_has_exact_state_population(self):
        self.assertEqual(len(self.data['matched_map']['grade_slices']),2082)
        state={r['source_row']:r for r in self.source['grade_records'] if r['level']=='State'}
        for r in self.data['matched_map']['grade_slices']:
            if r['above_state'] is None: continue
            reference=state[r['state_source_row']]
            self.assertEqual(str(reference['GRADE_LEVEL']),r['grade'])
            self.assertEqual(reference['CONTENT_AREA'],r['subject'])
            self.assertEqual(reference['CATEGORY'].casefold(),r['category'].casefold())
            self.assertEqual(reference['TYPE'].casefold(),r['group'].casefold())
            self.assertAlmostEqual(r['state_pct'],100*(reference['PROFICIENT']+reference['ADVANCED'])/reference['REPORTABLE'])
            self.assertEqual(r['above_state'],r['school_pct']>r['state_pct'])


if __name__=='__main__':
    unittest.main()
