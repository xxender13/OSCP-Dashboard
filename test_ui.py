"""UI redesign must preserve every validated dataset from baseline 8473a2c."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parent


class RedesignContractTests(unittest.TestCase):
    def test_verified_payload_is_unchanged(self):
        data=json.loads((ROOT/'dist/dashboard-data.json').read_text(encoding='utf-8'))
        data.pop('generated_at')
        data.pop('demographics_explorer',None)
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
        for section in ('overview','students-schools','student-demographics','academic-performance','academic-growth','explore-data','scholarships','events'):
            self.assertIn(section,page.ids)
            self.assertIn(section,page.links)


if __name__=='__main__':unittest.main()
