"""UI redesign must preserve every validated dataset from baseline 8473a2c."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parent


class RedesignContractTests(unittest.TestCase):
    def test_accessible_routes_and_level_controls(self):
        script=(ROOT/'app.js').read_text(encoding='utf-8')
        for contract in ('role="tabpanel"','aria-labelledby','aria-selected','ArrowLeft','ArrowRight','Home','End','hashchange','oldRoutes','aria-activedescendant','aria-expanded','data-switch','state-reference'):
            self.assertIn(contract,script)
        css=(ROOT/'styles.css').read_text(encoding='utf-8')
        for contract in ('focus-visible','prefers-reduced-motion','position: sticky','@media print'):
            self.assertIn(contract,css)

    def test_verified_payload_is_unchanged(self):
        data=json.loads((ROOT/'docs/internal/dashboard-data.json').read_text(encoding='utf-8'))
        baseline_keys=['dashboard_year','buildings','history','assessments','data_inventory','schools','metrics','sources','definitions','confirmed_events','directory','demographic_counts','state_map','growth','benchmarks','kpi_metrics','missing_data_note','official_state_context','benchmark_subsets','state_enrollment_audit','directory_summary','matched_map','public_source_verification']
        def strip(v):
            if isinstance(v,list):return [strip(x) for x in v]
            if isinstance(v,dict):return {k:strip(x) for k,x in v.items() if k not in ('statuses','status')}
            return v
        data={k:strip(data[k]) for k in baseline_keys if k in data}
        normalized=json.dumps(data,sort_keys=True,ensure_ascii=True,separators=(',',':')).encode()
        self.assertEqual(hashlib.sha256(normalized).hexdigest(),
            '5321d0a4570546e753132db90aa279c735b8c792e40ed7e85ced54b73a23de84',
            'A UI-only release must not alter the verified baseline datasets or calculations.')

    def test_navigation_targets_and_heading_hierarchy(self):
        class Page(HTMLParser):
            def __init__(self):super().__init__();self.ids=[];self.links=[];self.headings=[]
            def handle_starttag(self,tag,attrs):
                a=dict(attrs)
                if 'id' in a:self.ids.append(a['id'])
                if tag=='a' and a.get('href','').startswith('#'):self.links.append(a['href'][1:])
                if tag in ('h1','h2','h3'):self.headings.append(int(tag[1]))
        page=Page();page.feed((ROOT/'index.html').read_text(encoding='utf-8'))
        self.assertEqual(len(page.ids),len(set(page.ids)))
        self.assertEqual(page.headings.count(1),1)
        self.assertTrue(all(b<=a+1 for a,b in zip(page.headings,page.headings[1:])))
        for section in ('home','schools','students','learning','growth','sponsorships','explore','about'):
            self.assertIn('"'+section+'"',(ROOT/'config/dashboards.json').read_text(encoding='utf-8'))
        self.assertEqual((ROOT/'index.html').read_text().count('class="skeleton"'),6)

if __name__=='__main__':unittest.main()
