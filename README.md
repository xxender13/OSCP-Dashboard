# Charter School Partnerships Dashboard

Saint Louis University · Office of School and Community Partnerships

Explore six sponsored charter schools, their 14 school buildings and reported student results. The dashboard separates schools, school buildings and Missouri comparisons throughout.

The eight tabs cover Overview, Schools, Students, Learning, Growth, Programs, Explore Data and About the data. `explorer.html` opens the same detailed reporting workspace directly. Search accepts names with or without accents; press `/` to focus it.

Enrollment is 2025–26 preliminary. Student groups, MAP and growth are 2025; directory information is June 30, 2026. Captions identify the population, year and source. Missouri comparisons never enter school totals. Descriptive figures do not establish an effect of SLU sponsorship.

Use **Presentation view** or `?present=1`; arrow keys move between panels and Escape exits. Print / Save as PDF expands the sections in landscape. Charts provide CSV and PNG downloads. See [embedding instructions](EMBED.md).

To build and check locally:

```text
python -m pip install -r requirements.txt
python build.py
python -m unittest discover
node --check app.js
python scripts/audit_excel_sources.py verify
python test_dashboard.py
python -m http.server 8000 --directory dist
```

Browser checks require Chrome and the optional packages in `requirements-audit.txt`. Host only `dist/`. It contains the public application, small initial summary, detailed packets loaded on entering Explore Data and self-hosted Chart.js. Original calculations, internal documentation and local verification outputs remain outside that folder.

[Change history](docs/CHANGELOG.md)
