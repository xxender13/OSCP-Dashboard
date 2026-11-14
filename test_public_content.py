"""Public artifact boundary and regression contract, also run in CI."""
import json
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parent
FORBIDDEN=re.compile(r'candi|ryan|harshil|abigail|owner|todo|awaiting|pending|confirmed_by|gala|tracker|audit|\bqa\b|supplied source|missing-data|open item|needs clarification|4,081',re.I)

class PublicContentTests(unittest.TestCase):
    def test_public_files_contain_no_internal_material(self):
        for p in (ROOT/'dist').rglob('*'):
            if p.suffix in ('.html','.js','.json','.csv'):
                self.assertIsNone(FORBIDDEN.search(p.read_text(encoding='utf-8')),str(p))

    def test_public_allowlist(self):
        self.assertEqual({p.name for p in (ROOT/'dist').iterdir()}, {'index.html','explorer.html','app.js','styles.css','summary.json','explorer-core.json','explorer-demographics.json','explorer-map.json','vendor'})
        self.assertLess((ROOT/'dist/summary.json').stat().st_size,400000)
        for name in ('index.html','explorer.html','app.js','styles.css','summary.json'):
            self.assertEqual((ROOT/name).read_bytes(),(ROOT/'dist'/name).read_bytes())

    def test_public_numeric_regressions(self):
        d=json.loads((ROOT/'dist/summary.json').read_text(encoding='utf-8'));k=d['kpi_metrics']
        self.assertEqual(k['students']['value'],3953)
        for m,n,den,rate in [('demographics',1255,3913,32.07),('frl',2330,3816,61.06)]:
            self.assertEqual((k[m]['numerator'],k[m]['denominator']),(n,den));self.assertEqual(round(k[m]['value'],2),rate)
        for s,n,den,rate,g,state in [('Eng. Language Arts',823,1753,46.95,7,44.00),('Mathematics',877,1765,49.69,5,42.63)]:
            self.assertEqual((k['map'][s]['numerator'],k['map'][s]['denominator']),(n,den));self.assertEqual(round(k['map'][s]['value'],2),rate)
            self.assertEqual((k['growth'][s]['numerator'],k['growth'][s]['denominator']),(g,13))
            self.assertEqual(round(next(r['value'] for r in d['state_map'] if r['subject']==s and r['group']=='Total'),2),state)
        self.assertEqual((len(d['schools']),len(d['directory']),d['directory_summary']['distinct_normalized_street_addresses']),(6,14,12))
        self.assertEqual(d['three_levels']['bridge']['pk12_as_reported'],4150)

if __name__=='__main__':unittest.main()
