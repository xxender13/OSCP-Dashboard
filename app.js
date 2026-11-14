"use strict";
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  valid = (v) => typeof v === "number" && Number.isFinite(v),
  fmt = (v) =>
    valid(v)
      ? v.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : "Not published",
  pct = (v) => (valid(v) ? fmt(v) + "%" : "Not published");
const missing = (v, s, suffix = "") =>
  valid(v)
    ? fmt(v) + suffix
    : s === "withheld"
      ? "Not published"
      : s === "not_applicable"
        ? "Not tested"
        : "Not available";
let dashboardConfig;
let topics = [
  ["overview", "Overview"],
  ["schools", "Schools"],
  ["students", "Students"],
  ["learning", "Learning"],
  ["growth", "Growth"],
  ["programs", "Programs"],
  ["explore", "Explore Data"],
  ["about", "About the data"],
];
const reports = [
  ["history", "Enrollment history"],
  ["groups", "Student groups"],
  ["map", "Reading and math"],
  ["grades", "Grade comparison"],
  ["growth", "Growth"],
  ["directory", "Directory"],
];
let data,
  packets,
  packetPromise,
  active = "home",
  reportActive = "history",
  presenting = false,
  deck = [],
  deckIndex = 0;
const levels = { students: "School", learning: "School", growth: "School" },
  charts = new Map(),
  reportState = {};
const levelName = (l) =>
    l === "Building"
      ? "School buildings"
      : l === "Missouri"
        ? "Missouri"
        : "Schools",
  tag = (l) =>
    `<span class="level ${l === "Building" ? "teal" : l === "Missouri" ? "grey" : "blue"}">${l === "Building" ? "▦" : l === "Missouri" ? "◇" : "●"} ${levelName(l)}</span>`,
  key = '<p class="caption">Not published · Not tested · Not available</p>';
const school = (id) => data.schools.find((s) => s["DESE LEA"] === id),
  link = (id, name) =>
    `<a href="#schools/profile-${id}">${esc(name ?? school(id)?.School)}</a>`,
  unitLink = (r) =>
    r.building
      ? `<a href="#schools/school-building-${r.lea}-${r.building}">${esc(r.name)}</a>`
      : link(r.lea, r.name);
const table = (headers, rows) =>
  `<div class="scroll" tabindex="0"><table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr${r[0] === "Missouri" ? ' class="state-row"' : ""}>${r.map((v, i) => `<${i ? "td" : 'th scope="row"'}>${v ?? "Not published"}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table></div>`;
function card(
  id,
  title,
  body,
  l = "School",
  year = "2025",
  count = "6 of 6 reported",
) {
  return `<article class="card" id="${id}" tabindex="-1" data-section><div class="card-heading"><h3>${id.startsWith("profile-") ? link(id.slice(8), title) : esc(title)}</h3><div class="exports"><button data-csv="${id}">Download CSV</button><button data-png="${id}">Download PNG</button></div></div>${body}<p class="caption">${tag(l)} · ${esc(year)} · Source: Missouri DESE · ${esc(count)}</p><a class="details-link" href="#${active}/${id}">View details</a></article>`;
}
function switches(topic) {
  return `<div class="level-legend">${tag("Missouri")} = statewide, for comparison · ${tag("School")} = the 6 charter schools · ${tag("Building")} = the 14 school buildings</div><div class="segmented" role="group" aria-label="${topic} reporting level"><button data-switch="${topic}" data-level="School" aria-pressed="${levels[topic] === "School"}">Schools</button><button data-switch="${topic}" data-level="Building" aria-pressed="${levels[topic] === "Building"}">School buildings</button></div>`;
}
function shell(id, intro, sections, body) {
  return `<section id="panel-${id}" role="tabpanel" aria-labelledby="tab-${id}" tabindex="-1" hidden><h2>${topics.find((t) => t[0] === id)[1]}</h2><p class="intro">What you’ll find here: ${intro}</p><div class="jump-chips">${sections.map(([s, t]) => `<a href="#${id}/${s}">${t}</a>`).join("")}</div><p class="breadcrumb" aria-live="polite"></p>${body}</section>`;
}
function tiles() {
  const k = data.kpi_metrics,
    t = [
      [
        "♧",
        "Students enrolled",
        fmt(k.students.value),
        "K–12 students in six sponsored schools",
        "School",
        "students/enrollment",
      ],
      [
        "▦",
        "School communities",
        "6 / 14",
        "6 schools, 14 school buildings, 12 street addresses",
        "Building",
        "schools/directory",
      ],
      [
        "◉",
        "Lunch eligibility",
        pct(k.frl.value),
        `${fmt(k.frl.numerator)} of ${fmt(k.frl.denominator)} on the January roster`,
        "School",
        "students/lunch",
      ],
      [
        "▤",
        "Reading (MAP)",
        pct(k.map["Eng. Language Arts"].value),
        "823 of 1,753 reported tests across three schools",
        "School",
        "learning/reading",
      ],
      [
        "＋",
        "Math (MAP)",
        pct(k.map.Mathematics.value),
        "877 of 1,765 reported tests across three schools",
        "School",
        "learning/math",
      ],
      [
        "↗",
        "Reading growth",
        "7 of 13",
        "Eligible school buildings meeting the growth Target",
        "Building",
        "growth/results",
      ],
    ];
  $("objectiveKpis").innerHTML = t
    .map(
      ([icon, title, value, line, l, route]) =>
        `<a class="kpi" href="#${route}"><span class="tile-title"><span aria-hidden="true">${icon}</span> ${title}</span><strong>${value}</strong><span>${line}</span>${tag(l)}<span class="tile-details">View details →</span></a>`,
    )
    .join("");
  $("objectiveKpis").setAttribute("aria-busy", "false");
}
function stateMap(s) {
  return data.state_map.find((r) => r.subject === s && r.group === "Total")
    ?.value;
}
function overview() {
  const k = data.kpi_metrics,
    d = data.three_levels,
    facts = [
      [
        `${fmt(k.students.value)} K–12 students attend six sponsored schools.`,
        "School",
        "2025–26 preliminary",
      ],
      [
        `${data.directory.length} school buildings use ${data.directory_summary.distinct_normalized_street_addresses} street addresses.`,
        "Building",
        "June 2026",
      ],
      [
        `${fmt(k.frl.numerator)} of ${fmt(k.frl.denominator)} students on the January roster qualify for lunch support (${pct(k.frl.value)}).`,
        "School",
        "2025",
      ],
      [
        `${k.map["Eng. Language Arts"].reportable_networks} of ${data.schools.length} schools have published combined reading and math proficiency counts.`,
        "School",
        "2025",
      ],
      [
        `${k.growth["Eng. Language Arts"].numerator} of ${k.growth["Eng. Language Arts"].denominator} eligible school buildings met the reading growth Target; ${k.growth.Mathematics.numerator} of ${k.growth.Mathematics.denominator} met the math Target.`,
        "Building",
        "2025",
      ],
    ];
  const rows = data.schools.map((s) => [
    link(s["DESE LEA"]),
    esc(d.profiles.find((p) => p.lea === s["DESE LEA"]).city),
    s["DESE buildings"],
    fmt(s["2025–26 K–12"]),
    pct(s["FRL %"]),
    pct(s["MAP ELA P+A %"]),
    pct(s["MAP Math P+A %"]),
  ]);
  rows.push([
    "Missouri",
    "Statewide",
    "Not tested",
    fmt(856222),
    pct(data.benchmarks.frl.value),
    pct(stateMap("Eng. Language Arts")),
    pct(stateMap("Mathematics")),
  ]);
  return shell(
    "overview",
    "the main figures, each school’s results and the two city communities.",
    [
      ["facts", "Five things"],
      ["scorecard", "School scorecard"],
      ["cities", "City split"],
    ],
    card(
      "facts",
      "Five things to know",
      '<ol class="facts">' +
        facts
          .map(
            ([t, l, y]) => `<li>${esc(t)} ${tag(l)} <small>${y}</small></li>`,
          )
          .join("") +
        "</ol>",
      "School",
      "2025 / 2025–26 preliminary / June 2026",
    ) +
      card(
        "scorecard",
        "School scorecard",
        table(
          [
            "School",
            "City",
            "School buildings",
            "Students enrolled",
            "Lunch %",
            "MAP reading %",
            "MAP math %",
          ],
          rows,
        ) +
          key +
          "<details><summary>How to read this</summary><p>Enrollment is 2025–26 preliminary; student groups and MAP are 2025. Missouri enrollment and lunch context are 2024–25. Missouri is a separate comparison and never part of a school total.</p></details>",
        "School",
        "2025 / 2025–26 preliminary",
      ) +
      card(
        "cities",
        "Schools, school buildings and students by city, 2025–26 preliminary",
        table(
          ["City", "Schools", "School buildings", "K–12 students"],
          d.cities.map((c) => [
            esc(c.city),
            c.schools,
            c.buildings,
            fmt(c.enrollment),
          ]),
        ),
        "School",
        "2025–26 preliminary",
      ),
  );
}
const normalize = (v) =>
  String(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/schl/g, "school")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function directoryRows(q = "", city = "all") {
  return data.directory
    .filter(
      (b) =>
        (city === "all" || b.city === city) &&
        normalize(b.name + " " + school(b.lea).School).includes(normalize(q)),
    )
    .sort((a, b) => school(a.lea).School.localeCompare(school(b.lea).School))
    .map((b) => [
      link(b.lea),
      `<a id="school-building-${b.lea}-${b.building}" href="#schools/school-building-${b.lea}-${b.building}">${esc(b.name)}</a>`,
      esc(b.grades),
      esc(b.street + ", " + b.city),
    ]);
}
function schools() {
  const profiles = data.schools
    .map((s) => {
      const p = data.three_levels.profiles.find((p) => p.lea === s["DESE LEA"]);
      return card(
        "profile-" + p.lea,
        s.School,
        `<dl><dt>City</dt><dd>${p.city}</dd><dt>Opened</dt><dd>${esc(s["Opened school year"])}</dd><dt>Joined SLU</dt><dd>${p.joined}</dd><dt>Grades</dt><dd>${esc(p.grades.join(", "))}</dd><dt>School buildings</dt><dd>${p.building_count}</dd><dt>K–12 students enrolled</dt><dd>${fmt(s["2025–26 K–12"])}</dd></dl>`,
        "School",
        "2025–26 preliminary",
        "1 of 6 reported",
      );
    })
    .join("");
  return shell(
    "schools",
    "six school profiles and a searchable school buildings directory.",
    [
      ["profiles", "School profiles"],
      ["directory", "School buildings directory"],
    ],
    `<div id="profiles" class="profile-grid">${profiles}</div>` +
      card(
        "directory",
        "School buildings directory, June 2026",
        '<p>14 school buildings at 12 street addresses.</p><form id="directoryFilters"><label>Search school buildings<input name="query" type="search"></label><label>City<select name="city"><option value="all">All cities</option><option>Kansas City</option><option>St. Louis</option></select></label><button type="reset">Reset filters</button></form><div id="directoryTable">' +
          table(
            ["School", "School building", "Grades", "Address"],
            directoryRows(),
          ) +
          "</div>",
        "Building",
        "June 2026",
        "14 of 14 reported",
      ),
  );
}
function unitRows(l) {
  return l === "School"
    ? data.schools.map((s) => ({
        ...s,
        lea: s["DESE LEA"],
        name: s.School,
        building: null,
      }))
    : data.buildings.map((b) => ({
        ...b,
        lea: b["DESE LEA"],
        name: b["Building name"],
        building: b["Building code"],
      }));
}
function chartBody(id, rows, field, reference = null, suffix = "%") {
  return (
    (rows.some((r) => valid(r[field]))
      ? `<div class="plot"><canvas id="chart-${id}" role="img" aria-label="${esc(id)} chart; full values in the table below"></canvas></div>`
      : "<p>Not published</p>") +
    table(
      [rows[0]?.building ? "School building" : "School", "Value"],
      rows.map((r) => [
        unitLink(r),
        missing(
          r[field],
          r.statuses?.[field] ??
            r.status ??
            (field === "PA_PCT"
              ? r.statuses?.[id === "math" ? "MAP Math P+A %" : "MAP ELA P+A %"]
              : undefined),
          suffix,
        ),
      ]),
    ) +
    (valid(reference)
      ? `<p class="state-reference">${tag("Missouri")} Reference: ${fmt(reference)}${suffix}</p>`
      : "") +
    key
  );
}
function students() {
  const l = levels.students,
    u = unitRows(l),
    b = data.three_levels.bridge,
    d = data.kpi_metrics.demographics,
    enroll = u.map((r) => ({
      ...r,
      value: r[l === "School" ? "2025–26 K–12" : "K–12 prelim"],
    })),
    demo = data.three_levels.demographics.filter((r) => r.level === l);
  return shell(
    "students",
    "enrollment, the populations behind the counts and reported student groups.",
    [
      ["enrollment", "Enrollment"],
      ["bridge", "Enrollment bridge"],
      ["groups", "Student groups"],
      ["lunch", "Lunch eligibility"],
      ["english", "English learners"],
      ["special", "Special education"],
    ],
    switches("students") +
      card(
        "enrollment",
        `Students enrolled by ${l === "School" ? "school" : "school building"}, 2025–26 preliminary`,
        chartBody("enrollment", enroll, "value", null, ""),
        l,
        "2025–26 preliminary",
        `${enroll.filter((r) => valid(r.value)).length} of ${u.length} reported`,
      ) +
      card(
        "bridge",
        "Enrollment populations, 2025 and 2025–26 preliminary",
        table(
          ["Population", "Count", "Used for"],
          [
            ["K–12 preliminary", fmt(b.k12), "Enrollment headline"],
            [
              "Reported preschool",
              fmt(b.reported_pk),
              "Preschool shown separately",
            ],
            [
              "K–12 + reported preschool",
              fmt(b.pk12_as_reported),
              "3,953 + 197 = 4,150 as reported",
            ],
            [
              "K–12, 2025",
              fmt(b.race_population),
              "Race and ethnicity percentages",
            ],
            [
              "January membership, 2025",
              fmt(b.january_membership),
              "Lunch eligibility percentages",
            ],
          ],
        ) +
          "<details><summary>How to read this</summary><p>Preschool coverage is partial. The combined figure includes only reported preschool counts. Each measure uses its own stated population.</p></details>",
        "School",
        "2025 / 2025–26 preliminary",
      ) +
      card(
        "groups",
        `Student groups by ${l === "School" ? "school" : "school building"}, 2025`,
        `<p>Black enrollment: ${fmt(d.numerator)} of ${fmt(d.denominator)} (${pct(d.value)}), across the six schools.</p>` +
          table(
            [
              levelName(l),
              "Reported race and ethnicity categories",
              "Missouri comparison",
            ],
            demo.map((r) => [
              unitLink(r),
              r.race
                .map(
                  (c) => `${esc(c.label)}: ${missing(c.value, c.status, "%")}`,
                )
                .join("<br>"),
              r.race
                .map((c) => {
                  const comparison =
                    data.benchmarks[c.label.toLowerCase().replace(/ /g, "_")];
                  return `${esc(c.label)}: ${pct(comparison?.value)}${valid(comparison?.value) ? " (" + esc(comparison.year) + ")" : ""}`;
                })
                .join("<br>"),
            ]),
          ) +
          key,
        l,
        "2025",
        `${demo.length} of ${u.length} reported`,
      ) +
      [
        ["lunch", "Lunch eligibility", "FRL %", "frl"],
        ["english", "English learners", "EL %", "el"],
        ["special", "Students with IEPs", "IEP incidence %", "iep"],
      ]
        .map(([id, title, f, bm]) =>
          card(
            id,
            `${title} by ${l === "School" ? "school" : "school building"}, 2025`,
            chartBody(id, u, f, data.benchmarks[bm].value) +
              `<details><summary>How to read this</summary><p>${id === "lunch" ? "Lunch eligibility uses January membership." : id === "english" ? "English learners follow the reported source population." : "An IEP is an Individualized Education Program; incidence follows the source definition."} Missouri is ${data.benchmarks[bm].year} context.</p></details>`,
            l,
            "2025",
            `${u.filter((r) => valid(r[f])).length} of ${u.length} reported`,
          ),
        )
        .join(""),
  );
}
function learning() {
  const l = levels.learning;
  return shell(
    "learning",
    "reading and math proficiency, with Missouri shown for comparison.",
    [
      ["reading", "Reading"],
      ["math", "Math"],
      ["compare", "Compare the same grade"],
    ],
    switches("learning") +
      [
        ["reading", "Reading", "Eng. Language Arts"],
        ["math", "Math", "Mathematics"],
      ]
        .map(([id, title, s]) => {
          const rows = unitRows(l).map((u) => ({
              ...u,
              ...data.three_levels.map_rows.find(
                (r) =>
                  r.lea === u.lea &&
                  r.building === u.building &&
                  r.subject === s,
              ),
            })),
            v = rows.map((r) => r.PA_PCT).filter(valid),
            k = data.kpi_metrics.map[s];
          return card(
            id,
            `${title} proficiency by ${l === "School" ? "school" : "school building"}, 2025`,
            chartBody(id, rows, "PA_PCT", stateMap(s)) +
              `<p>Published results range from ${pct(Math.min(...v))} to ${pct(Math.max(...v))}.</p><details><summary>How to read this</summary><p>Proficiency combines Proficient and Advanced results. Across the three schools with published counts: ${fmt(k.numerator)} / ${fmt(k.denominator)} = ${pct(k.value)}. The Missouri reference covers all tested grades.</p></details>`,
            l,
            "2025",
            `${v.length} of ${rows.length} reported`,
          );
        })
        .join("") +
      card(
        "compare",
        "Compare the same grade",
        '<p>Choose a subject and grade to compare like with like.</p><a href="#explore/grades">Open grade comparison in Explore Data →</a>',
      ),
  );
}
function growth() {
  const l = levels.growth,
    body = ["Eng. Language Arts", "Mathematics"]
      .map((s) => {
        const k = data.kpi_metrics.growth[s],
          bm = data.benchmarks.growth[s],
          rows =
            l === "Building"
              ? data.growth
                  .filter((r) => r.subject === s)
                  .map((r) => ({
                    ...r,
                    value: r.eligible ? r.designation : "Not tested",
                  }))
              : data.schools.map((a) => {
                  const r = data.growth.filter(
                    (r) =>
                      r.lea === a["DESE LEA"] && r.subject === s && r.eligible,
                  );
                  return {
                    lea: a["DESE LEA"],
                    name: a.School,
                    value: `${r.filter((r) => r.designation === "Target").length} of ${r.length} eligible school buildings`,
                  };
                });
        return (
          `<h4>${s === "Mathematics" ? "Math" : "Reading"}: ${k.numerator} of ${k.denominator} eligible school buildings met Target</h4>` +
          table(
            [levelName(l), "Growth result"],
            rows.map((r) => [unitLink(r), esc(r.value)]),
          ) +
          `<p class="state-reference">${tag("Missouri")} ${pct(bm.value)} of eligible school buildings met Target.</p>`
        );
      })
      .join("");
  return shell(
    "growth",
    "how many school buildings met Missouri’s growth Target.",
    [
      ["results", "Growth results"],
      ["target", "What Target means"],
    ],
    switches("growth") +
      card(
        "results",
        `Growth results by ${l === "School" ? "school" : "school building"}, 2025`,
        body,
        l,
        "2025",
        "13 of 14 school buildings reported",
      ) +
      card(
        "target",
        "What Target means",
        "<p>Target is Missouri’s growth designation for earning full growth points. It describes eligible school buildings, rather than the share of students whose scores improved.</p><details><summary>How to read this</summary><p>On-Track is a different designation. Only eligible school buildings enter the comparison.</p></details>",
        "Building",
        "2025",
        "13 of 14 school buildings reported",
      ),
  );
}
function programs() {
  return shell(
    "sponsorships",
    "scholarships, events, partnership reach and OSCP support.",
    [
      ["scholarships", "Scholarships"],
      ["events", "Events"],
      ["reach", "Partnership reach"],
      ["support", "OSCP support"],
    ],
    '<div class="program-grid">' +
      [
        ["scholarships", "Scholarships", "scholarships"],
        ["events", "Events", "events"],
        ["reach", "Partnerships", "partnership_reach"],
        ["support", "OSCP support", "oscp_operations"],
      ]
        .map(
          ([id, name, k]) =>
            `<article class="card" data-section id="${id}" tabindex="-1"><h3>${name}</h3>${
              data.programs[k].length
                ? table(
                    ["Program", "Reported detail"],
                    data.programs[k].map((r) => [
                      esc(
                        r.program ??
                          r.event_name ??
                          r.program_name ??
                          r.measure,
                      ),
                      esc(
                        r.awards_count ??
                          r.students_served ??
                          r.attendance ??
                          r.value ??
                          "Details coming soon",
                      ),
                    ]),
                  )
                : `<p>${name}: Coming soon.</p>`
            }</article>`,
        )
        .join("") +
      "</div>",
  );
}
function about() {
  return shell(
    "about",
    "definitions, reporting years, sources and guidance for sharing these figures.",
    [
      ["glossary", "Glossary"],
      ["years", "Data years"],
      ["sources", "Sources"],
      ["reading-guide", "How to read"],
      ["limits", "What numbers can tell you"],
      ["cite", "How to cite"],
    ],
    card(
      "glossary",
      "What each measure means",
      "<dl><dt>School</dt><dd>One of six sponsored charter schools.</dd><dt>School building</dt><dd>One of 14 separately reported school buildings. Street addresses can be shared.</dd><dt>Enrollment</dt><dd>K–12 means kindergarten through grade 12. Preschool is shown separately.</dd><dt>MAP</dt><dd>Missouri Assessment Program. Proficiency combines Proficient and Advanced results.</dd><dt>Lunch eligibility</dt><dd>Eligibility for free or reduced-price lunch, using January membership.</dd><dt>English learners</dt><dd>Students identified as English learners in the reported population.</dd><dt>IEP</dt><dd>Individualized Education Program; the percentage follows the source’s incidence definition.</dd><dt>Growth Target</dt><dd>The Missouri designation for full growth points among eligible school buildings.</dd></dl>",
    ) +
      card(
        "years",
        "Data years",
        "<p>Enrollment: 2025–26 preliminary. Student groups, MAP and growth: 2025. Missouri student-group context: 2024–25. Directory: June 30, 2026. Enrollment history: 2007–2025.</p>",
      ) +
      card(
        "sources",
        "Where the data comes from",
        '<p>Missouri Department of Elementary and Secondary Education (DESE).</p><ul><li><a href="https://dese.mo.gov/missouri-school-improvement-program">School performance and growth</a></li><li><a href="https://apps.dese.mo.gov/MCDS/home.aspx">Missouri education data</a></li><li><a href="https://dese.mo.gov/quality-schools/charter-schools">Charter school information and directory</a></li></ul>',
      ) +
      card(
        "reading-guide",
        "How to read the charts",
        "<p>Read the level, year, source and reporting count below each chart. Missouri is a separate reference line or row.</p>" +
          key +
          "<details><summary>How to read this</summary><p>Values without numbers remain nonnumeric. Different years and populations are context rather than matched comparisons. Wide tables scroll inside their cards.</p></details>",
      ) +
      card(
        "limits",
        "What these numbers can and cannot tell you",
        "<p>Figures describe sponsored schools and their reported results; they do not show that SLU sponsorship caused them.</p><details><summary>How to read this</summary><p>School buildings are part of schools; never add the two levels. Missouri is not included in school totals. Reported groups may overlap or have different populations. No unavailable value is recovered by subtraction.</p></details>",
      ) +
      card(
        "cite",
        "How to cite",
        "<p>Saint Louis University, Office of School and Community Partnerships. Charter School Partnerships Dashboard. Missouri DESE data; include the measure, reporting level, source year and access date.</p>",
      ),
  );
}
function explore() {
  return shell(
    "explore",
    "one detailed report at a time, with filters and exports.",
    reports,
    `<article class="card deck-only" id="explore-intro" data-section tabindex="-1"><h3>Explore Data</h3><p>Detailed reports available in the dashboard:</p><ul>${reports.map(([, title]) => `<li>${title}</li>`).join("")}</ul><p class="caption">${tag("School")} ${tag("Building")} · 2007–2025 / June 2026 · Source: Missouri DESE</p></article><div role="tablist" aria-label="Detailed reports" class="subtabs">${reports.map(([id, t]) => `<button role="tab" id="report-tab-${id}" aria-controls="report-${id}" aria-selected="false" tabindex="-1" data-report="${id}">${t}</button>`).join("")}</div><div id="reportHost" role="status">Choose a report to load its data.</div>`,
  );
}
function renderAll() {
  const f = [
    Dashboard.home,
    schools,
    students,
    learning,
    growth,
    programs,
    explore,
    about,
  ];
  $("dashboard").innerHTML = f
    .map((f, i) => {
      active = topics[i][0];
      if (Analytics.has(active)) {
        return shell(
          active,
          "",
          [],
          '<div class="canvas-loading">Loading this view…</div>',
        );
      }
      const markup = f();
      if (active !== "home") return markup;
      const holder = document.createElement("div");
      holder.innerHTML = markup;
      holder
        .querySelectorAll(
          "#panel-home>h2,#panel-home>.intro,#panel-home>.jump-chips,#panel-home>.breadcrumb",
        )
        .forEach((n) => n.remove());
      return holder.innerHTML;
    })
    .join("");
  active = "home";
}
function drawChart(id, rows, field, reference = null, suffix = "%") {
  const canvas = $("chart-" + id);
  if (!canvas) return;
  if (!window.Chart) {
    canvas.parentElement.hidden = true;
    return;
  }
  charts.get(id)?.destroy();
  const shown = rows.filter((r) => valid(r[field]));
  const ref = {
    id: "referenceLine",
    afterDraw(c) {
      if (!valid(reference)) return;
      const {
          ctx,
          chartArea: a,
          scales: { x },
        } = c,
        px = x.getPixelForValue(reference);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "#525b65";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, a.top);
      ctx.lineTo(px, a.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };
  canvas.parentElement.style.height =
    Math.max(220, shown.length * 44 + 48) + "px";
  charts.set(
    id,
    new Chart(canvas, {
      type: "bar",
      data: {
        labels: shown.map((r) => r.name),
        datasets: [
          {
            label: "Reported value",
            data: shown.map((r) => r[field]),
            backgroundColor: shown.map((r) =>
              Analytics.color(r.lea, r.building),
            ),
            maxBarThickness: 22,
          },
        ],
      },
      plugins: [
        ref,
        {
          id: "directValues",
          afterDatasetsDraw(c) {
            const x = c.ctx;
            x.save();
            x.font = "14px system-ui";
            x.fillStyle = "#243448";
            c.getDatasetMeta(0).data.forEach((bar, i) => {
              x.textAlign = "right";
              x.fillText(
                fmt(shown[i][field]) + suffix,
                c.chartArea.right,
                bar.y - 14,
              );
            });
            x.restore();
          },
        },
      ],
      options: {
        onClick: (e, items) => {
          if (items.length) {
            const r = shown[items[0].index];
            location.hash = r.building
              ? "schools/school-building-" + r.lea + "-" + r.building
              : "schools/profile-" + r.lea;
          }
        },
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => fmt(c.parsed.x) + suffix } },
        },
        scales: {
          x: {
            beginAtZero: true,
            ...(suffix === "%" ? { max: 100 } : {}),
            grid: { display: false },
            ticks: { font: { size: 16 } },
          },
          y: {
            grid: { display: false },
            ticks: {
              font: { size: 14 },
              callback: function (v) {
                const s = this.getLabelForValue(v);
                return s.length > 24
                  ? s.split(/\s/).reduce(
                      (a, w) => {
                        if ((a.at(-1) + " " + w).length > 22) a.push(w);
                        else a[a.length - 1] += " " + w;
                        return a;
                      },
                      [""],
                    )
                  : s;
              },
            },
          },
        },
      },
    }),
  );
}
function redraw() {
  if (active === "students") {
    const l = levels.students,
      u = unitRows(l);
    drawChart(
      "enrollment",
      u.map((r) => ({
        ...r,
        value: r[l === "School" ? "2025–26 K–12" : "K–12 prelim"],
      })),
      "value",
      null,
      "",
    );
    [
      ["lunch", "FRL %", "frl"],
      ["english", "EL %", "el"],
      ["special", "IEP incidence %", "iep"],
    ].forEach(([id, f, b]) => drawChart(id, u, f, data.benchmarks[b].value));
  }
  if (active === "learning")
    [
      ["reading", "Eng. Language Arts"],
      ["math", "Mathematics"],
    ].forEach(([id, s]) =>
      drawChart(
        id,
        unitRows(levels.learning).map((u) => ({
          ...u,
          ...data.three_levels.map_rows.find(
            (r) =>
              r.lea === u.lea && r.building === u.building && r.subject === s,
          ),
        })),
        "PA_PCT",
        stateMap(s),
      ),
    );
}
const oldRoutes = {
  scholarships: "sponsorships/scholarships",
  events: "sponsorships/events",
  requestsLog: "sponsorships",
  demographicsWorkspace: "explore/groups",
  demographicsPanel: "explore/groups",
  frlPanel: "students/lunch",
  assessmentPanel: "explore/map",
  enrollmentPanel: "explore/history",
  historyPanel: "explore/history",
  timelinePanel: "schools/profiles",
  directoryPanel: "schools/profiles",
  schoolListPanel: "explore/directory",
  growthPanel: "explore/growth",
  coveragePanel: "about",
  overview: "home",
  programs: "sponsorships",
  Programs: "sponsorships",
  "academic-performance": "learning/reading",
  "student-demographics": "students/groups",
  "students-schools": "schools/profiles",
  "academic-growth": "growth/results",
  community: "sponsorships",
  "data-quality": "about",
  demographicsExplorer: "explore/groups",
  mapWorkspace: "explore/map",
  matchedMapPanel: "explore/grades",
  growthWorkspace: "explore/growth",
  directoryWorkspace: "explore/directory",
  enrollmentWorkspace: "explore/history",
  reach: "students/enrollment",
};
async function route() {
  const [rawPath, queryString = ""] = location.hash.slice(1).split("?");
  let hash = decodeURIComponent(rawPath);
  if (/^programs\//i.test(hash))
    hash = hash.replace(/^programs\//i, "sponsorships/");
  if (/^overview\//i.test(hash)) {
    const section = hash.split("/")[1];
    hash =
      section === "cities"
        ? "schools/cities"
        : section === "scorecard"
          ? "home/home-scorecard"
          : "home";
    history.replaceState(null, "", "#" + hash);
  }
  if (oldRoutes[hash] || oldRoutes[hash.toLowerCase()]) {
    hash = oldRoutes[hash] ?? oldRoutes[hash.toLowerCase()];
    history.replaceState(
      null,
      "",
      "#" + hash + (queryString ? "?" + queryString : ""),
    );
  }
  const filterParams = new URLSearchParams(queryString);
  let [topic, section] = hash.split("/");
  if (!topics.some((t) => t[0] === topic))
    topic = document.body.dataset.entry === "explore" ? "explore" : "home";
  active = topic;
  if ($("exportCurrent")) $("exportCurrent").dataset.canvasExport = topic;
  document.body.classList.toggle("analytic-active", Analytics.has(topic));
  $("start").hidden = true;
  document.querySelectorAll("#tablist [role=tab]").forEach((t) => {
    const on = t.dataset.tab === topic;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  document
    .querySelectorAll("#dashboard>[role=tabpanel]")
    .forEach((p) => (p.hidden = p.id !== "panel-" + topic));
  if (topic === "explore") {
    reportActive = reports.some((r) => r[0] === section)
      ? section
      : reportActive;
    await loadExplorer();
    if (active !== "explore") return;
    renderReport();
    Analytics.decorateExplorer();
  }
  if (Analytics.has(topic)) {
    if (
      topic === "students" &&
      ["lunch", "english", "special"].includes(section)
    )
      filterParams.set(
        "measure",
        { lunch: "frl", english: "el", special: "iep" }[section],
      );
    await Analytics.mount(topic, filterParams);
    if (active !== topic) return;
    if (innerWidth < 900)
      $("tab-" + topic).scrollIntoView({ inline: "center", block: "nearest" });
    if (section && section !== "enrollment") {
      const aliases = {
        compare: "grade-comparison",
        lunch: "groups",
        english: "groups",
        special: "groups",
      };
      const target = $(aliases[section] || section);
      if (target) {
        target.closest("details")?.setAttribute("open", "");
        target.classList.add("highlight");
        target.focus({ preventScroll: true });
      }
    }
    if (location.hash && !presenting)
      document.querySelector(".tabs").scrollIntoView({ block: "start" });
    return;
  }
  if (topic === "sponsorships") await Support.load();
  Dashboard.simple(topic, filterParams);
  redraw();
  const panel = $("panel-" + topic);
  if (panel.querySelector(".breadcrumb"))
    panel.querySelector(".breadcrumb").textContent =
      topics.find((t) => t[0] === topic)[1] +
      (section
        ? " › " +
          ($(section)?.querySelector("h3")?.textContent ??
            reports.find((r) => r[0] === section)?.[1] ??
            section.replace(/-/g, " "))
        : "");
  if (topic === "schools" && section?.startsWith("school-building-")) {
    const filters = $("directoryFilters");
    if (filters) {
      filters.elements.query.value = "";
      filters.elements.city.value = "all";
    }
    $("directoryTable").innerHTML = table(
      ["School", "School building", "Grades", "Address"],
      directoryRows(),
    );
  }
  const target = section && topic !== "explore" ? $(section) : null;
  if (!section && hash && !presenting) {
    document.querySelector(".tabs").scrollIntoView({ block: "start" });
  }
  if (target && panel.contains(target)) {
    const n = $(section);
    n.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    n.classList.remove("highlight");
    void n.offsetWidth;
    n.classList.add("highlight");
    n.focus({ preventScroll: true });
  }
  if (innerWidth < 700)
    $("tab-" + topic).scrollIntoView({ inline: "center", block: "nearest" });
}
function setupSearch() {
  const input = $("search"),
    list = $("matches");
  let matches = [],
    cursor = -1;
  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
  input.addEventListener("input", () => {
    const q = normalize(input.value).split(" ").filter(Boolean);
    cursor = -1;
    matches = q.length
      ? [
          ...data.schools.map((s) => ({
            label: s.School,
            type: "School",
            route: "profile-" + s["DESE LEA"],
          })),
          ...data.directory.map((b) => ({
            label: b.name,
            type: "School building",
            route: `school-building-${b.lea}-${b.building}`,
          })),
        ]
          .filter((r) => q.every((w) => normalize(r.label).includes(w)))
          .slice(0, 12)
      : [];
    list.innerHTML = matches
      .map(
        (r, i) =>
          `<li role="option" aria-selected="false" id="match-${i}"><a tabindex="-1" href="#schools/${r.route}">${esc(r.label)}<small>${r.type}</small></a></li>`,
      )
      .join("");
    list.hidden = !matches.length;
    input.setAttribute("aria-expanded", String(!!matches.length));
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (["ArrowDown", "ArrowUp"].includes(e.key) && matches.length) {
      e.preventDefault();
      cursor =
        (cursor + (e.key === "ArrowDown" ? 1 : -1) + matches.length) %
        matches.length;
      list
        .querySelectorAll("[role=option]")
        .forEach((r, i) =>
          r.setAttribute("aria-selected", String(i === cursor)),
        );
      input.setAttribute("aria-activedescendant", "match-" + cursor);
    }
    if (e.key === "Enter" && cursor >= 0) {
      e.preventDefault();
      location.hash = "schools/" + matches[cursor].route;
      close();
    }
  });
  list.addEventListener("click", close);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) close();
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      !/input|select|textarea/i.test(document.activeElement.tagName)
    ) {
      e.preventDefault();
      input.focus();
    }
  });
}
async function loadExplorer() {
  if (packets) return;
  if (!packetPromise)
    packetPromise = Promise.all(
      ["core", "demographics", "map"].map(async (n) => {
        const r = await fetch(`explorer-${n}.json`);
        if (!r.ok) throw Error("Could not load report");
        return r.json();
      }),
    )
      .then((r) => (packets = Object.assign({}, ...r)))
      .catch((e) => {
        packetPromise = null;
        throw e;
      });
  return packetPromise;
}
let assessmentMetrics = {
  PA_PCT: "Proficient + Advanced (%)",
  PROFICIENT_PCT: "Proficient (%)",
  ADVANCED_PCT: "Advanced (%)",
  BASIC_PCT: "Basic (%)",
  BELOW_BASIC_PCT: "Below Basic (%)",
  LEVEL_NOT_DETERMINED_PCT: "Level not determined (%)",
  REPORTABLE: "Reportable tests",
  ACCOUNTABLE: "Accountable tests",
  PROFICIENT: "Proficient students",
  ADVANCED: "Advanced students",
  BASIC: "Basic students",
  BELOW_BASIC: "Below Basic students",
  LEVEL_NOT_DETERMINED: "Level not determined students",
};
const metricLabels = {
  enrollment: "K–12 enrollment",
  black: "Black",
  hispanic: "Hispanic",
  white: "White",
  multiracial: "Multiracial",
  asian: "Asian",
  american_indian: "American Indian",
  pacific_islander: "Pacific Islander",
  frl: "Lunch eligibility",
  el: "English learners",
  iep: "Students with IEPs",
};
function select(name, label, entries) {
  return `<label>${label}<select name="${name}">${entries.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("")}</select></label>`;
}
function renderReport() {
  document.querySelectorAll("[data-report]").forEach((b) => {
    const on = b.dataset.report === reportActive;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const demo = packets.demographics_explorer;
  const params = Object.fromEntries(
    new URLSearchParams(location.hash.split("?")[1] ?? ""),
  );
  if (params.level === "schools") params.level = "School";
  if (params.level === "school-buildings") params.level = "Building";
  if (
    params.school &&
    params.school !== "all" &&
    !data.schools.some((r) => r["DESE LEA"] === params.school)
  )
    params.school =
      data.schools.find((r) =>
        normalize(r.School).includes(normalize(params.school)),
      )?.["DESE LEA"] ?? "all";
  const values = {
    school: "all",
    level: "School",
    subject: "Eng. Language Arts",
    group: "Total",
    metric: "enrollment",
    measure: "PA_PCT",
    grade: "all",
    city: "all",
    ...reportState[reportActive],
    ...params,
  };
  const form = Dashboard.explorerControls(reportActive, values);
  $("reportHost").innerHTML =
    `<section id="report-${reportActive}" role="tabpanel" aria-labelledby="report-tab-${reportActive}"><form id="reportFilters">${form}</form><div id="reportOutput"></div></section>`;
  const f = $("reportFilters");
  Object.entries(values).forEach(([key, value]) => {
    if (f.elements[key]) f.elements[key].value = value;
  });
  f.addEventListener("change", () => {
    const state = Object.fromEntries(new FormData(f));
    reportState[reportActive] = state;
    location.hash =
      "explore/" + reportActive + "?" + new URLSearchParams(state);
  });
  f.addEventListener("reset", (event) => {
    event.preventDefault();
    reportState[reportActive] = {};
    location.hash = "explore/" + reportActive;
    renderReport();
  });
  updateReport();
}
function updateReport() {
  const s = Object.fromEntries(new FormData($("reportFilters")));
  reportState[reportActive] = s;
  const l = s.level;
  let rows = [],
    headers = [],
    chartRows = [],
    reference = null;
  const chosen = (r) =>
    s.school === "all" || (r.lea ?? r["DESE LEA"]) === s.school;
  if (["history", "groups"].includes(reportActive)) {
    const r = packets.demographics_explorer.records.filter(
      (r) =>
        chosen(r) &&
        r.level === (l === "Building" ? "Building" : "Network") &&
        r.year >= Number(s.year_start) &&
        r.year <= Number(s.year_end),
    );
    headers = [
      levelName(l),
      "Year",
      metricLabels[s.metric] ?? s.metric,
      "Numerator",
      "Denominator",
    ];
    rows = r.map((r) => {
      const m = r.metrics[s.metric];
      return [
        unitLink(r),
        r.year,
        missing(
          m.value,
          m.statuses?.value,
          s.metric === "enrollment" ? "" : "%",
        ),
        missing(m.numerator, m.statuses?.numerator),
        missing(m.denominator, m.statuses?.denominator),
      ];
    });
    chartRows = r.map((r) => ({
      ...r,
      name: r.name + " · " + r.year,
      value: r.metrics[s.metric].value,
    }));
  } else if (reportActive === "directory") {
    headers = ["School", "School building", "Grades", "Address"];
    rows = data.directory
      .filter((r) => chosen(r) && (s.city === "all" || r.city === s.city))
      .map((r) => [
        link(r.lea),
        `<a href="#schools/school-building-${r.lea}-${r.building}">${esc(r.name)}</a>`,
        esc(r.grades),
        esc(r.street + ", " + r.city),
      ]);
  } else if (reportActive === "growth") {
    const r = data.growth.filter((r) => chosen(r) && r.subject === s.subject);
    headers = [levelName(l), "Subject", "Growth result"];
    rows =
      l === "Building"
        ? r.map((r) => [
            unitLink(r),
            esc(r.subject),
            r.eligible ? esc(r.designation) : "Not tested",
          ])
        : data.schools
            .filter((a) => s.school === "all" || a["DESE LEA"] === s.school)
            .map((a) => {
              const b = r.filter((r) => r.lea === a["DESE LEA"] && r.eligible);
              return [
                link(a["DESE LEA"]),
                esc(s.subject),
                `${b.filter((r) => r.designation === "Target").length} of ${b.length} eligible school buildings`,
              ];
            });
  } else {
    const grade = reportActive === "grades",
      source = grade
        ? (packets.matched_map.grade_slices ?? [])
        : packets.assessments,
      r = source.filter(
        (r) =>
          chosen(r) &&
          r.level === (l === "Building" ? "Building" : "Charter") &&
          r.subject === s.subject &&
          Dashboard.matchesGroup(r, s.group) &&
          (!grade || s.grade === "all" || String(r.grade) === s.grade),
      );
    headers = [
      levelName(l),
      "Subject",
      grade ? "Grade" : "Student group",
      grade ? "Proficient + Advanced %" : assessmentMetrics[s.measure],
      "Reportable tests",
      ...(grade ? ["Missouri, same grade %"] : []),
    ];
    rows = r.map((r) => [
      unitLink(r),
      esc(r.subject),
      esc(grade ? r.grade : r.group),
      missing(
        grade ? r.school_pct : r[s.measure],
        grade ? r.statuses?.school_pct : (r.statuses?.[s.measure] ?? r.status),
        grade || s.measure.endsWith("_PCT") ? "%" : "",
      ),
      missing(
        grade ? r.school_denominator : r.REPORTABLE,
        grade ? r.statuses?.school_denominator : r.statuses?.REPORTABLE,
      ),
      ...(grade ? [pct(r.state_pct)] : []),
    ]);
    chartRows = r.map((r) => ({
      ...r,
      value: grade ? r.school_pct : r[s.measure],
    }));
    reference =
      s.group === "Total" && !grade && s.measure === "PA_PCT"
        ? stateMap(s.subject)
        : null;
  }
  if (reportActive === "groups" && s.metric !== "enrollment") {
    reference = data.benchmarks[s.metric]?.value ?? null;
  }
  const yr = s.year_start
    ? s.year_start + "–" + s.year_end
    : reportActive === "directory"
      ? data.directory[0].as_of
      : data.kpi_metrics.demographics.year;
  $("reportOutput").innerHTML = card(
    "detail-report",
    `${reports.find((r) => r[0] === reportActive)[1]} by ${l === "Building" ? "school building" : "school"}, ${yr}`,
    (chartRows.some((r) => valid(r.value))
      ? '<div class="plot"><canvas id="chart-detail-report" role="img" aria-label="Selected report; full values in table below"></canvas></div>'
      : "") +
      (rows.length ? table(headers, rows) : "<p>Not published</p>") +
      (valid(reference)
        ? `<p class="state-reference">${tag("Missouri")} Reference${reportActive === "groups" ? " (" + esc(data.benchmarks[s.metric].year) + ")" : " (2025)"}: ${pct(reference)}</p>`
        : "") +
      key,
    l,
    yr,
    `${chartRows.length ? chartRows.filter((r) => valid(r.value)).length : rows.length} of ${rows.length} reported`,
  );
  if (chartRows.length) {
    if (reportActive === "history") drawHistory(chartRows, s.metric);
    else
      drawChart(
        "detail-report",
        chartRows,
        "value",
        reference,
        s.metric === "enrollment" || (s.measure && !s.measure.endsWith("_PCT"))
          ? ""
          : "%",
      );
  }
  Analytics.decorateExplorer();
}
function download(blob, name) {
  const a = document.createElement("a"),
    url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv(el) {
  return (
    "Measure,Level / year / source / reporting count\r\n" +
    [
      el.querySelector("h3")?.innerText,
      el.querySelector(".caption:last-of-type")?.innerText,
    ]
      .map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"')
      .join(",") +
    "\r\n" +
    [...el.querySelectorAll("table tr")]
      .map((r) =>
        [...r.cells]
          .map((c) => '"' + c.textContent.trim().replace(/"/g, '""') + '"')
          .join(","),
      )
      .join("\r\n")
  );
}
function exportPng(el) {
  const canvas = el.querySelector("canvas");
  if (canvas && canvas.width && canvas.height && window.Chart) {
    const output = document.createElement("canvas");
    output.width = 1600;
    const height = Math.round((canvas.height * 1536) / canvas.width);
    output.height = height + 224;
    const ctx = output.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.fillStyle = "#243448";
    ctx.font = "bold 28px system-ui";
    ctx.fillText(el.querySelector("h3").innerText, 32, 48, 1536);
    ctx.drawImage(canvas, 32, 80, 1536, height);
    ctx.font = "20px system-ui";
    ctx.fillText(
      el.querySelector(".caption:last-of-type")?.innerText ?? "",
      32,
      height + 128,
      1536,
    );
    ctx.fillText(
      el.querySelector(".state-reference")?.innerText ?? "",
      32,
      height + 168,
      1536,
    );
    output.toBlob((b) => download(b, el.id + ".png"));
    return;
  }
  const c = document.createElement("canvas");
  c.width = 1600;
  const lines = el.innerText.split("\n").filter(Boolean);
  c.height = 80 + lines.length * 32;
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#172b45";
  x.font = "24px system-ui";
  lines.forEach((l, i) => x.fillText(l, 32, 40 + i * 32));
  c.toBlob((b) => download(b, el.id + ".png"));
}
function keyboardTabs(e) {
  const list = e.target.closest("[role=tablist]");
  if (!list || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
    return;
  e.preventDefault();
  const tabs = [...list.querySelectorAll("[role=tab]")];
  let i = tabs.indexOf(document.activeElement);
  i =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? tabs.length - 1
        : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[i].focus();
  tabs[i].click();
}
function showSlide() {
  deck.forEach((n, i) => n.classList.toggle("deck-active", i === deckIndex));
  $("slideCounter").textContent = `${deckIndex + 1} / ${deck.length}`;
  deck[deckIndex].scrollTop = 0;
  requestAnimationFrame(() =>
    Analytics.chartMap.forEach((chart) => {
      if (chart.canvas.closest(".deck-active")) chart.resize();
    }),
  );
}
async function enterPresentation() {
  await Analytics.preparePresentation();
  presenting = true;
  deck = topics
    .map(([topic]) => document.getElementById("canvas-" + topic))
    .filter(Boolean);
  deck.forEach((n) => {
    n.classList.add("deck-panel");
    if (
      !n.hasAttribute("data-canvas") &&
      n.id !== "start" &&
      !n.querySelector(".deck-legend")
    )
      n.insertAdjacentHTML(
        "afterbegin",
        '<div class="deck-legend">' +
          tag("Missouri") +
          " = statewide ? " +
          tag("School") +
          " = 6 charter schools ? " +
          tag("Building") +
          " = 14 school buildings</div>",
      );
  });
  document.body.classList.add("present");
  $("slideControls").hidden = false;
  deckIndex = 0;
  showSlide();
}
function exitPresentation() {
  presenting = false;
  document.body.classList.remove("present");
  deck.forEach((n) => n.classList.remove("deck-panel", "deck-active"));
  $("slideControls").hidden = true;
  const url = new URL(location);
  url.searchParams.delete("present");
  history.replaceState(null, "", url);
  route();
  $("presentationButton").focus();
}
function setup() {
  document.querySelector(".back-top").addEventListener("click", (event) => {
    event.preventDefault();
    document.querySelector(".tabs").scrollIntoView({ block: "start" });
  });
  $("tablist").innerHTML = topics
    .map(
      ([id, t], i) =>
        `<button role="tab" id="tab-${id}" data-tab="${id}" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${t}</button>`,
    )
    .join("");
  new ResizeObserver((entries) =>
    document.documentElement.style.setProperty(
      "--nav-h",
      Math.ceil(entries[0].contentRect.height) + "px",
    ),
  ).observe(document.querySelector(".tabs"));
  document.addEventListener("keydown", (e) => {
    if (presenting) {
      if (e.key === "Escape") exitPresentation();
      if (["ArrowRight", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        deckIndex = Math.min(deck.length - 1, deckIndex + 1);
        showSlide();
      }
      if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        deckIndex = Math.max(0, deckIndex - 1);
        showSlide();
      }
    } else keyboardTabs(e);
  });
  document.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]"),
      rep = e.target.closest("[data-report]"),
      sw = e.target.closest("[data-switch]"),
      cb = e.target.closest("[data-csv]"),
      png = e.target.closest("[data-png]");
    if (tab) {
      location.hash = tab.dataset.tab;
      $("panel-" + tab.dataset.tab).focus({ preventScroll: true });
    }
    if (rep) location.hash = "explore/" + rep.dataset.report;
    if (sw) {
      const t = sw.dataset.switch;
      levels[t] = sw.dataset.level;
      const holder = document.createElement("div");
      holder.innerHTML = { students, learning, growth }[t]();
      $("panel-" + t).replaceWith(holder.firstElementChild);
      $("panel-" + t).hidden = false;
      redraw();
      document
        .querySelector(`[data-switch="${t}"][data-level="${levels[t]}"]`)
        .focus();
    }
    if (cb)
      download(
        new Blob(["\uFEFF" + csv($(cb.dataset.csv))], {
          type: "text/csv;charset=utf-8",
        }),
        cb.dataset.csv + ".csv",
      );
    if (png) exportPng($(png.dataset.png));
  });
  const f = $("directoryFilters"),
    filter = () => {
      $("directoryTable").innerHTML = table(
        ["School", "School building", "Grades", "Address"],
        directoryRows(f.elements.query.value, f.elements.city.value),
      );
    };
  f?.addEventListener("input", filter);
  f?.addEventListener("reset", () => setTimeout(filter, 0));
  addEventListener("hashchange", () => route().catch(showError));
  setupSearch();
  $("presentationButton").onclick = enterPresentation;
  $("exitPresentation").onclick = exitPresentation;
  $("previousSlide").onclick = () => {
    deckIndex = Math.max(0, deckIndex - 1);
    showSlide();
  };
  $("nextSlide").onclick = () => {
    deckIndex = Math.min(deck.length - 1, deckIndex + 1);
    showSlide();
  };
  $("printReport").onclick = async () => {
    await Analytics.preparePresentation();
    print();
  };
  addEventListener("beforeprint", () => {
    const previous = active;
    Analytics.chartMap.forEach((chart) => {
      chart.options.responsive = false;
      chart.options.scales.x.ticks.font.size = 18;
      chart.options.scales.y.ticks.font.size = 18;
      chart.resize(640, 280);
    });
    active = previous;
  });
  addEventListener("beforeprint", () =>
    document.querySelectorAll("details").forEach((d) => {
      d.dataset.wasOpen = d.open;
      d.open = true;
    }),
  );
  addEventListener("afterprint", () =>
    document
      .querySelectorAll("details")
      .forEach((d) => (d.open = d.dataset.wasOpen === "true")),
  );
  addEventListener("afterprint", () =>
    Analytics.chartMap.forEach((chart) => {
      chart.options.responsive = true;
      chart.options.scales.x.ticks.font.size = 12;
      chart.options.scales.y.ticks.font.size = 12;
      chart.resize();
    }),
  );
  const params = new URLSearchParams(location.search);
  if (params.get("embed") === "1") {
    document.body.classList.add("embedded");
    new ResizeObserver(() => {
      if (parent !== window)
        parent.postMessage(
          {
            type: "oscp-dashboard-height",
            height: document.documentElement.scrollHeight,
          },
          "*",
        );
    }).observe(document.body);
  }
}
function showError(e) {
  $("loadStatus").hidden = false;
  $("loadStatus").textContent = e.message + " — reload to try again.";
}
async function boot() {
  try {
    const [r, c] = await Promise.all([
      fetch("summary.json"),
      fetch("config/dashboards.json"),
    ]);
    if (!r.ok) throw Error("Could not load dashboard");
    data = await r.json();
    if(window.Chart){Chart.defaults.font.family=getComputedStyle(document.body).fontFamily;Chart.defaults.font.size=12;}
    dashboardConfig = await c.json();
    assessmentMetrics = dashboardConfig.assessment_measures;
    topics = dashboardConfig.dashboards.map((d) => [d.id, d.nav_label]);
    renderAll();
    $("dashboard").hidden = false;
    $("loadStatus").hidden = true;
    setup();
    await route();
    if (new URLSearchParams(location.search).get("present") === "1")
      await enterPresentation();
  } catch (e) {
    showError(e);
  }
}
function drawHistory(rows, metric) {
  const canvas = $("chart-detail-report");
  if (!canvas) return;
  if (!window.Chart) {
    canvas.parentElement.hidden = true;
    return;
  }
  charts.get("detail-report")?.destroy();
  canvas.parentElement.style.height = "400px";
  const years = [...new Set(rows.map((r) => r.year))].sort(),
    ids = [...new Set(rows.map((r) => r.lea + "/" + (r.building ?? "")))],
    colors = ["#003da5", "#007875", "#566274", "#7c4b80", "#925326", "#665c1c"];
  const series = ids.map((id, i) => {
    const r = rows.filter((r) => r.lea + "/" + (r.building ?? "") === id);
    return {
      label: r[0].name.replace(/ · \d{4}$/, ""),
      data: years.map((y) => r.find((r) => r.year === y)?.value ?? null),
      borderColor: Analytics.color(r[0].lea, r[0].building),
      backgroundColor: Analytics.color(r[0].lea, r[0].building),
      borderDash: i >= 6 ? [6, 4] : [],
      pointStyle: Analytics.schoolMarker(r[0].lea),
      pointRadius: 3,
      borderWidth: 2,
      spanGaps: false,
    };
  });
  charts.set(
    "detail-report",
    new Chart(canvas, {
      type: "line",
      data: { labels: years, datasets: series },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            display: true,
            labels: { font: { size: 14 }, usePointStyle: true },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 14 } } },
          y: {
            beginAtZero: true,
            ...(metric === "enrollment" ? {} : { max: 100 }),
            ticks: { font: { size: 14 } },
            grid: { color: "#edf0f3" },
          },
        },
      },
    }),
  );
}
boot();
