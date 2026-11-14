# Charter School Partnerships Dashboard

Saint Louis University - Office of School and Community Partnerships

Explore six sponsored charter schools, their 14 school buildings at 12 street addresses, and reported student results. Missouri is a separate comparison. These descriptive figures do not establish an effect of SLU sponsorship.

Eight dashboards share one configuration: Home, Schools, Students, Learning, Growth, OSCP Sponsorships, Explore Data and About. Home contains the introduction, six headline tiles, school scorecard and dashboard directory. Students, Learning and Growth use four-panel analytical views. Every dashboard uses level and year labels, shared filters and export controls. `explorer.html` opens the detailed reporting workspace directly.

`config/dashboards.json` supplies navigation, titles, questions, panels, filter definitions and directory cards. Filter selections remain in the URL hash. Search accepts accented and unaccented names; `/` focuses it. Old Overview and Programs links redirect to Home and OSCP Sponsorships.

Learning offers published student groups and grade/course choices. Unpublished choices remain visible and disabled. Pooled MAP percentages describe only the three reporting schools and display a computed coverage label. Demographic pooling requires complete compatible values from all six schools; IEP values remain school-specific. Missing values retain their labels and never become zero. Race compositions show published categories without normalizing or inferring missing shares.

Each panel menu offers PNG, CSV and a table view. **Export this view** captures the dashboard with self-hosted html2canvas. **Presentation view** starts with Home and gives each dashboard one slide; arrows navigate and Escape exits. **Print / PDF** prints a dashboard on one landscape page. The footer print control prepares all eight dashboards. See [embedding instructions](EMBED.md).

Build and check locally:

```text
python -m pip install -r requirements.txt
python build.py --report
python -m unittest discover
node --check app.js
node --check analytics.js
node --check dashboard.js
python scripts/audit_excel_sources.py verify
python test_dashboard.py
python -m http.server 8000 --directory dist
```

The optional `--report` flag generates `docs/internal/OSCP_Dashboard_Report.docx` from the configuration, full local data, input templates and verification outputs. That directory is ignored; the report is neither committed nor copied into the website. Existing tracked internal files are retained for review rather than deleted. Browser checks require Chrome and the packages in `requirements-audit.txt`.

Host only `dist/`. It contains the public application, initial summary, data slices loaded on demand, and self-hosted Chart.js and html2canvas. Original workbooks, local reports and verification outputs stay outside the site. The numerical baseline and source-workbook hashes remain checked.

[Change history](docs/CHANGELOG.md) - [Dashboard screenshots](docs/dashboard-screenshots/)
