import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parent

class DashboardConfigurationTests(unittest.TestCase):
    def test_navigation_and_public_configuration(self):
        config=json.loads((ROOT/'config/dashboards.json').read_text(encoding='utf8'))
        self.assertEqual([d['id'] for d in config['dashboards']],['home','schools','students','learning','growth','sponsorships','explore','about'])
        for dashboard in config['dashboards']:
            self.assertLessEqual(len(dashboard['question'].split()),20)
            self.assertEqual(len({f['id'] for f in dashboard['filters']}),len(dashboard['filters']))
            for f in dashboard['filters']:
                self.assertTrue(f['help']);self.assertTrue(f['options_source']);self.assertTrue(f['level_applicability'])
        self.assertLessEqual(len(config['intro'].split()),60)
        self.assertEqual(config['intro'],'This dashboard describes the six charter schools Saint Louis University sponsors, their students and their reported results, alongside the programs OSCP provides. Use the menu to open a dashboard, and the filters to choose a school or school building. Missouri figures are shown for comparison only.')

    def test_ui_reads_the_shared_configuration(self):
        app=(ROOT/'app.js').read_text(encoding='utf8');ui=(ROOT/'dashboard.js').read_text(encoding='utf8')
        self.assertIn('config/dashboards.json',app)
        self.assertIn('dashboardConfig.dashboards',ui)
        self.assertIn('data-config-filter',ui)
        self.assertIn('Dashboard.definition', (ROOT/'analytics.js').read_text(encoding='utf8'))

if __name__=='__main__':unittest.main()
