"""Recalculate explorer data from original DESE cells, not rounded UI rates."""
import json
from pathlib import Path
import unittest
import openpyxl
from build import clean

ROOT=Path(__file__).resolve().parent


class DemographicsExplorerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads((ROOT/'dashboard-data.json').read_text(encoding='utf-8'))
        cls.rows=cls.data['demographics_explorer']['records']
        cls.raw={}
        for name in ('dese_district_demographics_1991_2025.xlsx','dese_building_demographics_2006_2025.xlsx'):
            book=openpyxl.load_workbook(ROOT/'data/enrollment_demographics'/name,read_only=True,data_only=True)
            iterator=iter(book.active.values);columns=next(iterator)
            wanted={r['source_row'] for r in cls.rows if r['source_file']==name}
            for rowno,values in enumerate(iterator,2):
                if rowno in wanted:cls.raw[(name,rowno)]={k:clean(v) for k,v in zip(columns,values)}
            book.close()

    def test_source_population_and_year_keys(self):
        self.assertEqual(len(self.rows),271)
        self.assertEqual(len(self.raw),271)
        self.assertEqual(len({(r['lea'],r['building'],r['year']) for r in self.rows}),271)
        self.assertEqual(self.data['demographics_explorer']['inventory'],{'Network':96,'Building':175})
        self.assertEqual(sorted({r['year'] for r in self.rows}),list(range(2007,2026)))
        buildings={(r['lea'],r['building']) for r in self.data['directory']}
        for r in self.rows:
            if r['level']=='Building':self.assertIn((r['lea'],r['building']),buildings)
            else:self.assertIsNone(r['building'])

    def test_every_published_count_and_percentage_is_preserved(self):
        from demographics_explorer import METRICS
        for r in self.rows:
            source=self.raw[(r['source_file'],r['source_row'])]
            for key,(_,count,denom,pct,_) in METRICS.items():
                m=r['metrics'][key]
                numeric=lambda v:v if isinstance(v,(float,int)) else None
                self.assertEqual(m['numerator'],numeric(source[count]))
                self.assertEqual(m['denominator'],numeric(source[denom]) if denom else None)
                self.assertEqual(m['published_pct'],numeric(source[pct]) if pct else None)
                if m['method']=='ratio_of_counts':
                    self.assertAlmostEqual(m['value'],100*m['numerator']/m['denominator'])

    def test_iep_is_never_given_an_unverified_aggregate_denominator(self):
        for r in self.rows:
            m=r['metrics']['iep']
            self.assertFalse(m['aggregatable'])
            self.assertIsNone(m['denominator'])
            self.assertEqual(m['value'],m['published_pct'])

    def test_2025_count_ratios_reproduce_existing_kpis(self):
        rows=[r for r in self.rows if r['year']==2025 and r['level']=='Network']
        self.assertEqual(len(rows),6)
        for name,kpi in [('black','demographics'),('frl','frl')]:
            n=sum(r['metrics'][name]['numerator'] for r in rows)
            d=sum(r['metrics'][name]['denominator'] for r in rows)
            self.assertEqual(n,self.data['kpi_metrics'][kpi]['numerator'])
            self.assertEqual(d,self.data['kpi_metrics'][kpi]['denominator'])
            self.assertAlmostEqual(100*n/d,self.data['kpi_metrics'][kpi]['value'])
        self.assertEqual(sum(r['metrics']['enrollment']['value'] for r in rows),3913)
        self.assertEqual(self.data['kpi_metrics']['students']['value'],3953)

    def test_unavailable_components_do_not_become_zero(self):
        missing=[m for r in self.rows for m in r['metrics'].values() if m['numerator'] is None and m['published_pct'] is None]
        self.assertTrue(missing)
        self.assertTrue(all(m['value'] is None for m in missing))
        for r in self.rows:
            for key,m in r['metrics'].items():
                if key not in ('iep','enrollment') and m['aggregatable']:
                    self.assertGreater(m['denominator'],0)
                    self.assertTrue(0<=m['numerator']<=m['denominator'])


if __name__=='__main__':unittest.main()
