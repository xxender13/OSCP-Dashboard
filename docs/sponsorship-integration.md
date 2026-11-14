# Sponsorship requests and community support

`build.py` reads every worksheet of the original `data/sponsorships/oscp_gala_sponsorship_tracker.xlsx` without changing it. The current sheets are the general sheet, FY27, FY26, FY25 and an empty FY24. All original worksheets and rows remain in the workbook. Local `qa/workbook-inventory.json`, `qa/sponsorship-source-rows.json` and `qa/event-audit.json` retain inspection results, normalized business fields, sheet/row origins and duplicate links; these are not deployed.

## Normalization and deduplication

The existing pipeline trims/collapses whitespace, preserves missing values as null and compares case-insensitive populated business fields across worksheets. Identical normalized entries share a stable entry and retain every source worksheet/row reference. It conservatively counts **26 distinct entries from 65 rows**, identifying **39 repeated rows**. It cannot establish 26 independently verified sponsorship requests: some entries have only an organization. Cross-sheet repetitions are not counted as new annual requests without a populated fiscal-year field or other distinguishing data.

Nineteen entries have requested amounts totalling **$130,220**. These are requests, not approved awards or payments. Six entries have an event name; one has a date. No entries have a populated decision, approved amount, approval authority or relationship type. The explicit fiscal-year column is also empty. Funding-source labels exist internally but do not establish a payment and are excluded from public output.

## Public fields and statuses

`support_data.py` emits only entry ID, organization, named activity, date, explicit fiscal year, source-sheet year labels, requested amount, approved amount, supported normalized status, repeat count, safe worksheet/row references and a generic source citation. Private funding labels, rationale, contact details, invitations and approval-authority fields are excluded. The general worksheet name is replaced with General sheet in public provenance.

Only an actual decision field can support Requested, Approved, Funded or Denied. Otherwise status is Unknown, including all current entries. A requested dollar amount does not imply even a formal decision status. Approved amounts remain null; approval alone does not establish payment. The UI shows verified approvals/payment information as Not available rather than zero. No requested amount enters a funding-paid total.

The fiscal-year filter is visibly disabled because the fiscal-year field is blank. FY25/FY26/FY27 worksheet membership is shown only as provenance. No fiscal-year trend is invented. Organization/status filters and search work on distinct entries. Requested dollars by organization, a decision-status count chart and a downloadable source-labelled table replace the former placeholder. Only one dated entry exists, so dates are shown in the table rather than implying a meaningful sponsorship timeline.

## Outstanding information

OSCP program staff/leadership and the workbook stewards should establish fiscal years, distinguish independent repeated annual requests, populate decisions and approved amounts, confirm payments separately, clarify dates and event names, and approve the organization-level public disclosure. Confirmed scholarships, attendance, partnership reach and support hours remain distinct and cannot be inferred from requests.

The named upstream contacts are retained in the ignored original request; public documentation uses roles. See [community engagement definitions](community-engagement-data.md) for the separate staff-reported activity source. Regression tests check 65/26/39 source counts, $130,220 requested, blank decisions/years, safe allowlisting and unchanged workbook byte hashes.
