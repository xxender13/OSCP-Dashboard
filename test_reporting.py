"""Independent source-based regressions for Candi's KPI and benchmark feedback."""
import json
from pathlib import Path
import unittest
from html.parser import HTMLParser
import openpyxl

ROOT = Path(__file__).resolve().parent


def read(path, header=1):
    book = openpyxl.load_workbook(ROOT / path, read_only=True, data_only=True)
    it = iter(book.active.values)
    for _ in range(header - 1):
        next(it)
    columns = [str(v).strip() if v is not None else '' for v in next(it)]
    result = [dict(zip(columns, r)) for r in it if any(v is not None for v in r)]
    book.close()
    return result


class ReportingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'dashboard-data.json').read_text(encoding='utf-8'))
        cls.demographics = read('data/enrollment_demographics/dese_district_demographics_1991_2025.xlsx')
        cls.state_map = read('data/assessments/dese_map_2025_state_content_area.xlsx')
        cls.apr = read('data/accountability/dese_apr_2025_building_supporting.xlsx')

    def test_six_kpis_and_source_years(self):
        k = self.data['kpi_metrics']
        self.assertEqual(set(k), {'students','demographics','frl','schools','map','growth'})
        self.assertEqual(k['students']['value'], 3953)
        self.assertEqual(k['students']['year'], '2025–26 preliminary')
        self.assertEqual(k['schools']['value'], 14)
        self.assertEqual(k['schools']['year'],2026)
        self.assertEqual(k['schools']['as_of'],'2026-06-30')
        keys = {(r['lea'], r['building']) for r in self.data['directory']}
        self.assertEqual(len(keys), 14)
        self.assertEqual(len({r['lea'] for r in self.data['directory']}), 6)

    def test_demographics_and_correct_frl_denominator(self):
        codes = {r['DESE LEA'] for r in self.data['schools']}
        rows = [r for r in self.demographics if r['YEAR'] == 2025 and str(r['COUNTY_DISTRICT_CODE']).zfill(6) in codes]
        self.assertEqual(len(rows), 6)
        for name,count,denom,expected in [('demographics','ENROLLMENT_BLACK','ENROLLMENT_GRADES_K_12',(1255,3913)),('frl','LUNCH_COUNT_FREE_REDUCED','JANUARY_MEMBERSHIP',(2330,3816))]:
            n,d = sum(r[count] for r in rows),sum(r[denom] for r in rows)
            self.assertEqual((n,d), expected)
            actual = self.data['kpi_metrics'][name]
            self.assertEqual((actual['numerator'],actual['denominator']), (n,d))
            self.assertAlmostEqual(actual['value'],100*n/d)
        self.assertNotEqual(self.data['kpi_metrics']['frl']['denominator'],3953)
        for row in rows:
            self.assertLessEqual(abs(100*row['LUNCH_COUNT_FREE_REDUCED']/row['JANUARY_MEMBERSHIP']-row['LUNCH_COUNT_FREE_REDUCED_PCT']),.051)

    def test_independent_state_map_all_four_subjects(self):
        expected = {'Eng. Language Arts':(198659,451477),'Mathematics':(193897,454818),'Science':(78294,195818),'Social Studies':(27239,66470)}
        rows = [r for r in self.state_map if str(r['CATEGORY']).strip()=='MSIP Total' and r['TYPE']=='Total']
        self.assertEqual(len(rows), 4)
        for raw in rows:
            self.assertEqual(raw['YEAR'], 2025)
            self.assertEqual(raw['SUMMARY_LEVEL'], 'State')
            numerator = raw['PROFICIENT']+raw['ADVANCED']
            denominator = raw['REPORTABLE']
            self.assertEqual((numerator,denominator), expected[raw['CONTENT_AREA']])
            self.assertEqual(sum(raw[f] for f in ['BELOW_BASIC','BASIC','PROFICIENT','ADVANCED']),denominator)
            result = next(r for r in self.data['state_map'] if r['subject']==raw['CONTENT_AREA'] and r['group']=='Total')
            self.assertAlmostEqual(result['value'],100*numerator/denominator)
            self.assertFalse(result['direct_comparison'])
        for k in self.data['kpi_metrics']['map'].values():
            self.assertIsNone(k['above_state_pct'])

    def test_map_subset_no_mixed_reporting_levels(self):
        for subject,expected in [('Eng. Language Arts',(823,1753)),('Mathematics',(877,1765))]:
            rows = [r for r in self.data['assessments'] if r['level']=='Charter' and r['subject']==subject and r['category']=='MSIP Total' and r['group']=='Total' and r['PA_PCT'] is not None]
            self.assertEqual(len(rows),3)
            self.assertEqual((sum(r['PROFICIENT']+r['ADVANCED'] for r in rows),sum(r['REPORTABLE'] for r in rows)),expected)
            result = self.data['kpi_metrics']['map'][subject]
            self.assertEqual((result['numerator'],result['denominator']),expected)
            self.assertAlmostEqual(result['value'],100*expected[0]/expected[1])

    def test_independent_apr_growth_eligibility(self):
        cohort = {(r['lea'],r['building']) for r in self.data['directory']}
        for subject,prefix,expected in [('Eng. Language Arts','ELA',(7,13,498,1993)),('Mathematics','MATH',(5,13,492,1994))]:
            eligible = [r for r in self.apr if r['YEAR']==2025 and isinstance(r.get(prefix+'_ALL_GROWTH_POINTS_POSSIBLE'),(int,float)) and r[prefix+'_ALL_GROWTH_POINTS_POSSIBLE']>0 and isinstance(r.get(prefix+'_ALL_GROWTH_POINTS_EARNED'),(int,float)) and r.get(prefix+'_ALL_GROWTH_PERFORMANCE_DESIGNATION') not in (None,'NULL','*')]
            selected = [r for r in eligible if (str(r['COUNTY_DISTRICT_CODE']).zfill(6),str(r['SCHOOL_CODE']).zfill(4)) in cohort]
            target = lambda rows:sum(r[prefix+'_ALL_GROWTH_PERFORMANCE_DESIGNATION']=='Target' for r in rows)
            self.assertEqual((target(selected),len(selected),target(eligible),len(eligible)),expected)
            self.assertTrue(any(r[prefix+'_ALL_GROWTH_PERFORMANCE_DESIGNATION']=='Participation' for r in eligible))
            result = self.data['kpi_metrics']['growth'][subject]
            self.assertEqual((result['numerator'],result['denominator']),expected[:2])
            state = self.data['benchmarks']['growth'][subject]
            self.assertEqual((state['numerator'],state['denominator']),expected[2:])
            self.assertAlmostEqual(state['value'],100*expected[2]/expected[3])

    def test_state_demographics_paired_denominators(self):
        rows = [r for r in self.demographics if r['YEAR']==2025]
        for name,count,denominator,expected_rows in [('black','ENROLLMENT_BLACK','ENROLLMENT_GRADES_K_12',295),('frl','LUNCH_COUNT_FREE_REDUCED','JANUARY_MEMBERSHIP',536)]:
            paired = [r for r in rows if isinstance(r[count],(int,float)) and isinstance(r[denominator],(int,float)) and r[denominator]>0 and 0<=r[count]<=r[denominator]]
            result = self.data['benchmark_subsets'][name]
            self.assertEqual(len(paired),expected_rows)
            self.assertEqual(result['reportable_records'],len(paired))
            self.assertEqual(result['source_records'],564)
            self.assertAlmostEqual(result['numerator'],sum(r[count] for r in paired))
            self.assertAlmostEqual(result['denominator'],sum(r[denominator] for r in paired))
            self.assertFalse(result['complete'])
        self.assertEqual(len(self.data['benchmark_subsets']['frl']['excluded_inconsistent_counts']),18)

    def test_suppression_reason_and_nulls(self):
        raw_suppressed = next(r for r in self.data['assessments'] if r['PROFICIENT'] is None and r['missingness'].get('PROFICIENT',{}).get('reason')=='suppressed_in_source')
        self.assertIsNone(raw_suppressed['PA_PCT'])
        self.assertIn('does not specify why',raw_suppressed['missingness']['PROFICIENT']['detail'])
        self.assertIn('small-group suppression is not assumed',self.data['missing_data_note'].lower())
        json.dumps(self.data,allow_nan=False)

    def test_html_assets_and_card_sources(self):
        class Assets(HTMLParser):
            def __init__(self):super().__init__();self.paths=[]
            def handle_starttag(self,tag,attrs):
                d=dict(attrs)
                if tag=='script' and d.get('src'):self.paths.append(d['src'])
                if tag=='link' and d.get('rel')=='stylesheet':self.paths.append(d['href'])
        parser=Assets();parser.feed((ROOT/'index.html').read_text(encoding='utf-8'))
        for asset in parser.paths:
            if not asset.startswith('https://'):self.assertTrue((ROOT/'dist'/asset).is_file())
        script=(ROOT/'app.js').read_text(encoding='utf-8')
        html=(ROOT/'index.html').read_text(encoding='utf-8')
        for anchor in ('students-schools','student-demographics','academic-performance','academic-growth'):
            self.assertIn(f'id="{anchor}"',html)
            self.assertIn(anchor,script)
        for report in ('enrollment','demographics','frl','schoolList','matchedMap','growth'):
            self.assertIn(f"report('{report}'",script)
        self.assertIn('Unavailable*',script)


if __name__ == '__main__':
    unittest.main()
