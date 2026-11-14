import csv,json,tempfile,unittest
from pathlib import Path
from inputs import load_inputs,SCHEMAS
from status_audit import validate_nulls

ROOT=Path(__file__).resolve().parent
class ThreeLevelsTests(unittest.TestCase):
    def test_summary_budget_and_statuses(self):
        self.assertLess((ROOT/'summary.json').stat().st_size,400000)
        s=json.loads((ROOT/'summary.json').read_text(encoding='utf-8'));validate_nulls(s)
        self.assertNotIn('matched_map',s);self.assertNotIn('assessments',s)
        self.assertEqual(s['three_levels']['bridge']['reported_pk'],197)
        self.assertEqual(s['three_levels']['bridge']['pk12_as_reported'],4150)
        self.assertEqual([(c['schools'],c['buildings'],c['enrollment']) for c in s['three_levels']['cities']],[(4,11,3247),(2,3,706)])
    def test_raw_audit_fixtures(self):
        cells=json.loads((ROOT/'qa/missing-data-audit.json').read_text())['cells']
        for level,count in [('School',5),('Building',10)]:
            rows=[r for r in cells if r['level']==level and r['metric'] in ['FRL %','EL %','IEP incidence %','Black %','Hispanic %','Multiracial %','White %']]
            self.assertEqual(sum(r['status']=='withheld' for r in rows),count)
            self.assertTrue(all(r['status'] in ('reported','withheld') for r in rows))
        d=json.loads((ROOT/'dashboard-data.json').read_text(encoding='utf-8'))
        for r in d['assessments']:
            if r['level']=='Charter' and r['lea'] in ('048905','048925','115926') and r['category']=='MSIP Total' and r['subject'] in ('Eng. Language Arts','Mathematics','Science'):
                self.assertIsNone(r['PA_PCT']);self.assertEqual(r['status'],'withheld')
        validate_nulls(d)
    def test_empty_inputs_are_pending_not_zero(self):
        x=load_inputs(ROOT/'data/inputs')
        self.assertIsNone(x['scholarship_totals']['count']);self.assertIsNone(x['scholarship_totals']['dollars']);self.assertIsNone(x['total_reach']['value'])
        self.assertEqual(len(x['scholarships']['pending']),5);self.assertEqual(len(x['events']['pending']),3)
        self.assertEqual(x['partnership_reach']['confirmed'],[])
    def write(self,folder,name,rows):
        with (folder/(name+'.csv')).open('w',newline='',encoding='utf-8') as f:
            w=csv.DictWriter(f,fieldnames=SCHEMAS[name].split(','));w.writeheader();w.writerows(rows)
    def test_confirmations_and_overlap(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            for name in SCHEMAS:self.write(folder,name,[])
            base=dict(program_id='p1',program_name='Program',reporting_period='2025-26',students_served=100,unduplicated_method='Unique participants',overlaps_sponsored_schools='unknown',counted_in_total='yes',source='Confirmed roster',confirmed_by='Ryan',confirmed_date='2026-11-14',status='confirmed')
            self.write(folder,'partnership_reach',[base]);x=load_inputs(folder)
            self.assertIsNone(x['total_reach']['value']);self.assertEqual((x['total_reach']['lower_bound'],x['total_reach']['upper_bound']),(3953,4053))
            base['overlaps_sponsored_schools']='no';self.write(folder,'partnership_reach',[base]);self.assertEqual(load_inputs(folder)['total_reach']['value'],4053)
            base['confirmed_by']='';self.write(folder,'partnership_reach',[base]);self.assertIsNone(load_inputs(folder)['total_reach']['value'])
            base['students_served']='invalid';self.write(folder,'partnership_reach',[base]);self.assertRaises(ValueError,load_inputs,folder)
    def test_gala_is_request_log_only(self):
        d=json.loads((ROOT/'summary.json').read_text(encoding='utf-8'))['three_levels']
        self.assertEqual(d['tracker_summary']['distinct_records'],26);self.assertEqual(d['tracker_summary']['raw_rows'],65)
        self.assertEqual(d['inputs']['events']['confirmed'],[])
    def test_scholarship_confirmations_and_duplicates(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            for name in SCHEMAS:self.write(folder,name,[])
            row=dict(program='Test program',award_year='2026-27',awards_count=2,total_amount_usd=100,status='awarded',source='Award ledger',confirmed_by='Candi',confirmed_date='2026-11-14')
            self.write(folder,'scholarships',[row]);x=load_inputs(folder);self.assertEqual(x['scholarship_totals'],{'count':2,'dollars':100})
            row['source']='';self.write(folder,'scholarships',[row]);self.assertIsNone(load_inputs(folder)['scholarship_totals']['count'])
            self.write(folder,'scholarships',[row,row]);self.assertRaises(ValueError,load_inputs,folder)
if __name__=='__main__':unittest.main()
