# Community engagement and student participation, 2026

Source: staff notes supplied with the integration request. The complete original request is retained only in ignored `docs/internal/community-engagement-original-notes.txt`. The reviewed structured source is `data/community_engagement/2026_engagement.csv`; `support_data.py` validates and packages it into `support-data.json`. Public source labels use roles, without personal names or contact details.

There are 23 activities: 20 reported and 3 planned. Of all activities, 22 have numeric participation; 19 reported activities have numeric participation. Fifteen exact-count reported student activities sum to **16,860 provisional participation instances**. This includes the reported 9,000 basketball participants and 7,000 STEM showcase reach; neither has independently verified attendance. These are potentially repeated participation instances, never unique students and never added to the separate 3,953 school enrollment figure.

## Count rules

- `student_event`: exact reported student participation; eligible for the provisional instance sum only when the count is numeric and status is Reported.
- `estimated_event`: SLPS College Fair remains 700-900, not a midpoint; excluded from the exact-count sum.
- `general_attendees`: Wyman's 30 attendees are not confirmed student-only; City Garden's whole-school/parent activity has no numeric attendance. Both are excluded.
- `program_enrollment`: Linwood YMCA 20 and Student Support Program 55 are ongoing participation, not event attendance; excluded. Linwood's April date is a note reference, while its count refers to September.
- `planned`: Hope Ignite 25, North Tech 25 and Hazelwood East 35 stay planned regardless of whether their dates have passed. Hope Ignite's three facilitators are excluded.
- The spelling bee includes 200 qualifier participants. Its 40 finalists are a subset, not an additional activity/count.

Each row carries stable ID, activity, organization, dates, location, category, minimum/maximum count, participation type, status, verification label, source, notes and missing-data reason. Missing counts/dates/locations are null in public JSON. Organizations are copied or conservatively derived from the supplied activity name. Locations are assigned only when the notes explicitly name SLU; otherwise they remain unavailable.

Categories are editorial classifications derived from activity names/notes: college/campus visits, STEM engagement, community events, academic enrichment and student support programs. They count activities, not combined participants. STEM camps are classified as STEM; the spelling bee as academic enrichment. No category implies a measured outcome.

## Views and limitations

The existing OSCP Sponsorships tab contains a dedicated Community Engagement & Student Participation section. It includes a chronological timeline with undated activities last, a vertically scrollable horizontal chart retaining ranges and readable labels, activity-category counts and a searchable source-labelled table. Count type, category, activity status and size filters apply to engagement only; search applies to both sections. Smaller-activity mode shows numeric maxima up to 1,000 without rescaling or altering values. Tables and CSV retain the original ranges and explanations.

The support dashboard prints two summary pages (sponsorships, then engagement); the print timeline summarizes activities by month, with full names/notes available through CSV. Other dashboards keep their existing print behavior. Presentation retains this dashboard as one scrollable slide with section links.

## Information still needed

Program staff and the originating notes providers should confirm actual attendance for all three planned activities; reconcile independently verified attendance versus reported reach; confirm whether Wyman's count is student-only; provide City Garden's count and missing visit/program dates; clarify Linwood's reporting period; identify organizing organizations and explicit locations where absent; and supply an overlap rule or unduplicated identifiers before any unique-student measure is possible. No such values are inferred.

Tests cover all 23 rows, the 15 eligible activities, 16,860 instances, range endpoints, missing values, finalist/facilitator exclusions, persistent plans and the unchanged enrollment baseline.
