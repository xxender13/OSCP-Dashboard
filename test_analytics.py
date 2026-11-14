"""Canvas slices preserve original values and retain the public boundary."""
import json
from pathlib import Path
import unittest
from status_audit import validate_nulls

ROOT=Path(__file__).resolve().parent

class AnalyticDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original=json.loads((ROOT/'docs/internal/dashboard-data.json').read_text(encoding='utf8'))

    def test_historic_slices_retain_values_and_statuses(self):
        original={(r['lea'],r['building'],r['year']):r for r in self.original['demographics_explorer']['records']}
        for topic in ('overview','students'):
            public=json.loads((ROOT/f'dist/canvas-{topic}.json').read_text(encoding='utf8'))
            validate_nulls(public)
            self.assertEqual(len(public['history']),len(original))
            for row in public['history']:
                before=original[row['lea'],row['building'],row['year']]
                for metric,values in row['metrics'].items():
                    for field in ('value','numerator','denominator','published_pct','aggregatable','statuses'):
                        if field in values:self.assertEqual(values[field],before['metrics'][metric][field])

    def test_same_grade_values_are_copied_without_recovery(self):
        original=self.original['matched_map']['grade_slices']
        public=json.loads((ROOT/'dist/canvas-learning.json').read_text(encoding='utf8'))
        validate_nulls(public)
        self.assertEqual(len(public['grades']),len(original))
        for row,before in zip(public['grades'],original):
            for field in ('lea','building','grade','subject','school_pct','state_pct','school_numerator','school_denominator','statuses'):
                self.assertEqual(row.get(field),before.get(field))

    def test_export_dependency_is_self_hosted(self):
        self.assertTrue((ROOT/'dist/vendor/html2canvas.min.js').is_file())
        script=(ROOT/'analytics.js').read_text(encoding='utf8')
        self.assertIn('vendor/html2canvas.min.js',script)
        self.assertNotIn('cdn.jsdelivr.net',script)
        self.assertTrue((ROOT/'vendor/html2canvas-LICENSE.md').is_file())

if __name__=='__main__':unittest.main()
