import json
from pathlib import Path
import subprocess
import unittest
import zipfile
from docx import Document
from tools.make_internal_report import generate

ROOT=Path(__file__).resolve().parent

@unittest.skipUnless((ROOT/'qa/event-audit.json').exists(),'Local source outputs are needed for the private report.')
class InternalReportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest=generate()
        cls.path=ROOT/'docs/internal/OSCP_Dashboard_Report.docx'
        cls.document=Document(cls.path)

    def test_configuration_sections_filters_and_panels(self):
        config=json.loads((ROOT/'config/dashboards.json').read_text(encoding='utf8'))
        headings=[p.text for p in self.document.paragraphs if p.style.name=='Heading 1']
        for dashboard in config['dashboards']:
            self.assertIn(dashboard['nav_label'],headings)
            self.assertEqual(self.manifest['panels'][dashboard['id']],dashboard['panels'])
            for f in dashboard['filters']:self.assertIn(dashboard['id']+'.'+f['id'],self.manifest['filters'])
        self.assertIn('Consolidated data-request list',headings)
        self.assertIn('Number reconciliation',headings)

    def test_source_findings(self):
        e=self.manifest['evidence'];t=e['tracker']
        self.assertEqual((e['school_cells'],len(e['school_withheld'])),(42,5))
        self.assertEqual((e['building_cells'],len(e['building_withheld'])),(98,10))
        self.assertEqual({(name,measure) for name,measure in e['school_withheld']},{('Hope Leadership Academy','EL %'),('Hope Leadership Academy','Multiracial %'),('Hope Leadership Academy','White %'),('The Biome School','EL %'),('The Biome School','Hispanic %')})
        self.assertEqual(set(e['map_building_rows'].values()),{13});self.assertEqual(set(e['growth_eligible'].values()),{13})
        self.assertEqual((e['map_years'],e['growth_years']),([2025],[2025]))
        self.assertEqual((t['raw'],t['unique'],t['Amount Requested'],t['requested_total']),(65,26,19,130220))
        self.assertEqual(t['Funding Source / Budget Line'],22)
        for field in ('Decision Status','Amount Approved/ Provided','Approval Authority','Relationship Type'):self.assertEqual(t[field],0)
        self.assertEqual((t['Event Name'],t['Event Date']),(6,1))
        self.assertEqual(len(e['absent_preliminary']),2)

    def test_report_is_private_and_formatted(self):
        result=subprocess.run(['git','-c','safe.directory='+ROOT.as_posix(),'check-ignore',str(self.path)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0)
        self.assertFalse(any((ROOT/'dist').rglob('*.docx')))
        section=self.document.sections[0]
        self.assertAlmostEqual(section.page_width/914400,11);self.assertAlmostEqual(section.page_height/914400,8.5)
        with zipfile.ZipFile(self.path) as archive:
            xml=' '.join(archive.read(n).decode('utf8') for n in archive.namelist() if n.endswith('.xml'))
        for name in ('Candi','Ryan','Harshil','Abigail'):self.assertNotIn(name,xml)
        self.assertIn('PAGE',xml)

if __name__=='__main__':unittest.main()
