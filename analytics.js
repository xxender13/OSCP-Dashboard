"use strict";

// Shared analytical views use the existing published values and status fields.
window.Analytics = (() => {
  const names = {
    enrollment: "Students enrolled",
    frl: "Free/reduced-price lunch",
    black: "Black",
    hispanic: "Hispanic",
    white: "White",
    multiracial: "Multiracial",
    el: "English learners",
    iep: "Students with IEPs",
    asian: "Asian",
    american_indian: "American Indian",
    pacific_islander: "Pacific Islander",
  };
  const fields = {
    frl: "FRL %",
    black: "Black %",
    hispanic: "Hispanic %",
    white: "White %",
    multiracial: "Multiracial %",
    el: "EL %",
    iep: "IEP incidence %",
  };
  const subjectNames = { "Eng. Language Arts": "Reading", Mathematics: "Math" };
  const subjects = Object.keys(subjectNames);
  const titles = {
    overview: [
      "OSCP: SCHOOLS AT A GLANCE",
      "Enrollment, reading, math and growth across sponsored schools.",
    ],
    students: [
      "STUDENTS: WHO ATTENDS OUR SCHOOLS",
      "Reported student groups, enrollment and populations over time.",
    ],
    learning: [
      "LEARNING: READING AND MATH",
      "Published proficiency, exact-grade comparisons and performance levels.",
    ],
    growth: [
      "GROWTH: PROGRESS TOWARD TARGET",
      "Growth designations and points for eligible school buildings.",
    ],
  };
  const palette = [
    "#003da5",
    "#007875",
    "#6f477f",
    "#99551b",
    "#52657d",
    "#7c6417",
  ];
  const markers = ["circle", "rect", "triangle", "rectRot", "crossRot", "star"];
  const cache = new Map(),
    models = new Map(),
    state = {},
    chartMap = new Map();
  let extraOverview = "",
    latestToken = 0,
    lastRenderMs = 0;
  const schoolList = () =>
    data.schools.slice().sort((a, b) => a.School.localeCompare(b.School));
  const defaultState = (topic) => ({
    level: "schools",
    school: "all",
    year: "2025",
    measure: topic === "students" ? "black" : "both",
    reference: true,
    grade: "3",
    sort: "name",
    bridge: "bridge",
    group: "Total",
    city: "all",
    search: "",
    program: "all",
    fiscal_year: "all",
    status: "confirmed",
  });
  const slug = (lea) =>
    normalize(school(lea)?.School ?? lea).replace(/ /g, "-");
  const selectedSubject = (s) =>
    s.measure === "math"
      ? ["Mathematics"]
      : s.measure === "reading"
        ? ["Eng. Language Arts"]
        : subjects;
  const labelLevel = (s) =>
    s.level === "school-buildings" ? "Building" : "School";
  const iconTag = (s) => tag(labelLevel(s));
  const currentUnits = (s) =>
    unitRows(labelLevel(s))
      .filter((r) => s.school === "all" || r.lea === s.school)
      .sort(
        (a, b) =>
          school(a.lea).School.localeCompare(school(b.lea).School) ||
          a.name.localeCompare(b.name),
      );
  const pick = (s, rows) =>
    rows.filter((r) => s.school === "all" || r.lea === s.school);
  const sum = (values) => values.reduce((n, v) => n + v, 0);
  const ratio = (n, N) =>
    valid(n) && valid(N) && N > 0 ? (100 * n) / N : null;
  const numberText = (v) => (valid(v) ? fmt(v) : "Not published");
  const color = (lea, building) => {
    const i = data.schools.findIndex((s) => s["DESE LEA"] === lea),
      base = palette[Math.max(0, i)];
    if (!building) return base;
    const siblings = data.directory.filter((r) => r.lea === lea),
      at = siblings.findIndex((r) => r.building === building),
      light = 0.06 + Math.max(0, at) * 0.08;
    const rgb = base
      .match(/\w\w/g)
      .map((x) => Math.round(parseInt(x, 16) * (1 - light) + 255 * light));
    return `rgb(${rgb.join(",")})`;
  };
  const schoolMarker = (lea) =>
    markers[
      Math.max(
        0,
        data.schools.findIndex((s) => s["DESE LEA"] === lea),
      )
    ];
  const gap = (status) =>
    status === "not_applicable"
      ? "Not tested"
      : status === "not_supplied"
        ? "Not available"
        : "Not published";
  const cell = (value, status, suffix = "%") =>
    valid(value) ? fmt(value) + suffix : gap(status);
  const countText = (n, N, unit = "students") =>
    valid(n) && valid(N)
      ? `${fmt(n)} of ${fmt(N)} ${unit}`
      : "n of N: denominator not published";
  const historyRows = (topic, s) =>
    pick(s, cache.get(topic)?.history ?? []).filter(
      (r) =>
        r.level === (s.level === "school-buildings" ? "Building" : "Network"),
    );
  const annual = (topic, s, year = s.year) =>
    historyRows(topic, s).filter((r) => String(r.year) === String(year));
  const resultName = (r) => (r.building ? unitLink(r) : link(r.lea, r.name));
  function reference(s, metric) {
    const r = data.benchmarks[metric];
    return s.reference && valid(r?.value)
      ? {
          value: r.value,
          label: `Missouri · ${r.year}`,
          n: r.numerator,
          N: r.denominator,
          year: r.year,
        }
      : null;
  }
  function publicTable(headers, rows) {
    return table(headers, rows);
  }
  function unitTable(rows, field, label, suffix = "%") {
    return publicTable(
      [
        "School",
        ...(rows.some((r) => r.building) ? ["School building"] : []),
        label,
        "Numerator",
        "Denominator",
      ],
      rows.map((r) => [
        link(r.lea),
        ...(rows.some((r) => r.building)
          ? [r.building ? resultName(r) : "Not available"]
          : []),
        cell(r[field], r.status, suffix),
        numberText(r.n),
        numberText(r.N),
      ]),
    );
  }
  function series(label, values, rows, extra = {}) {
    return {
      label,
      data: values,
      backgroundColor: rows.map((r) => color(r.lea, r.building)),
      borderColor: rows.map((r) => color(r.lea, r.building)),
      pointStyle: rows.map((r) => schoolMarker(r.lea)),
      meta: rows,
      ...extra,
    };
  }
  function order(rows, s, field = "value") {
    return rows
      .slice()
      .sort((a, b) =>
        s.sort === "value"
          ? (valid(b[field]) ? b[field] : -Infinity) -
            (valid(a[field]) ? a[field] : -Infinity)
          : school(a.lea).School.localeCompare(school(b.lea).School) ||
            a.name.localeCompare(b.name),
      );
  }
  const rate = (v) =>
    valid(v)
      ? v.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + "%"
      : "Not published";
  function kpi(label, value, detail, s, year, route = "", level = null) {
    const paired=label==='Reportable tests';
    const displayed=paired?String(value).split(' / ').map((v,i)=>`<span>${esc(v)} <small>${i?'Math':'ELA'}</small></span>`).join(''):esc(value);
    return `<a class="mini-kpi" href="#${route || active}"><strong${paired?' class="paired-count"':''}>${displayed}</strong><span>${esc(label)}</span><small>${esc(detail)}</small><span>${tag(level ?? labelLevel(s))} <span class="year-chip">${esc(year)}</span></span></a>`;
  }
  function summaryTile(metric, s, topic = "students") {
    const units = currentUnits(s),
      rows = annual(topic, s),
      values = rows.map((r) => r.metrics[metric]);
    const published = values.filter((m) => valid(m?.value)),
      complete =
        rows.length === units.length && published.length === units.length;
    let value = null,
      n = null,
      N = null;
    if (units.length === 1 && published.length === 1) {
      value = published[0].value;
      n = published[0].numerator;
      N = published[0].denominator;
    } else if (
      complete &&
      values.every(
        (m) => m.aggregatable && valid(m.numerator) && valid(m.denominator),
      )
    ) {
      n = sum(values.map((m) => m.numerator));
      N = sum(values.map((m) => m.denominator));
      value = ratio(n, N);
    }
    // These are the established headline ratios, rather than rounded source percentages.
    if (
      s.level === "schools" &&
      s.school === "all" &&
      s.year === "2025" &&
      ["frl", "black"].includes(metric)
    ) {
      const k = data.kpi_metrics[metric === "black" ? "demographics" : "frl"];
      value = k.value;
      n = k.numerator;
      N = k.denominator;
    }
    return kpi(
      names[metric],
      valid(value) ? rate(value) : `${published.length} of ${units.length}`,
      valid(value)
        ? countText(n, N)
        : metric === "iep" && complete
          ? "Single-school percentages"
          : `${levelName(labelLevel(s))} report`,
      s,
      s.year,
      `students/groups?${query(s)}`,
    );
  }
  function enrollmentTile(s) {
    if (active === "students" && s.year !== "2025") {
      const units = currentUnits(s),
        rows = annual("students", s),
        values = rows.map((r) => r.metrics.enrollment.value),
        complete = values.length === units.length && values.every(valid),
        n = complete ? sum(values) : null;
      return kpi(
        "Students enrolled",
        complete ? fmt(n) : `${values.filter(valid).length} of ${units.length}`,
        complete ? countText(n, n) : "Schools report; no partial pooled total",
        s,
        s.year,
        `students/bridge?${query(s)}`,
      );
    }
    const rows = currentUnits(s),
      n = sum(
        rows.map(
          (r) => r[s.level === "schools" ? "2025–26 K–12" : "K–12 prelim"],
        ),
      );
    return kpi(
      "Students enrolled",
      fmt(n),
      `${fmt(n)} of ${fmt(n)} reported K–12 students`,
      s,
      "2025–26 preliminary",
      `students/enrollment?${query(s)}`,
    );
  }
  function pooledMap(s, subject) {
    const rows = mapRows(s, subject),
      good = rows.filter((r) => valid(r.value) && valid(r.n) && valid(r.N)),
      n = sum(good.map((r) => r.n)),
      N = sum(good.map((r) => r.N));
    return {
      value: good.length ? ratio(n, N) : null,
      n: good.length ? n : null,
      N: good.length ? N : null,
      count: good.length,
      total: rows.length,
    };
  }
  function growthCount(s, subject) {
    const all = pick(s, data.growth).filter((r) => r.subject === subject),
      eligible = all.filter((r) => r.eligible);
    return {
      n: eligible.filter((r) => r.designation === "Target").length,
      N: eligible.length,
      total: all.length,
      rows: eligible,
    };
  }
  function kpis(topic, s) {
    if (topic === "students")
      return (
        enrollmentTile(s) +
        ["frl", "black", "hispanic", "white", "multiracial", "el", "iep"]
          .map((m) => summaryTile(m, s))
          .join("")
      );
    if (topic === "growth") {
      const a = growthCount(s, subjects[0]),
        b = growthCount(s, subjects[1]);
      return (
        subjects
          .map((subject, i) => {
            const k = i ? b : a;
            return kpi(
              subjectNames[subject] + " Target",
              `${k.n} of ${k.N}`,
              countText(k.n, k.N, "eligible school buildings"),
              s,
              "2025",
              "growth/results",
              "Building",
            );
          })
          .join("") +
        (s.reference
          ? subjects
              .map((subject) => {
                const r = data.benchmarks.growth[subject];
                return kpi(
                  "Missouri " + subjectNames[subject],
                  rate(r?.value),
                  countText(
                    r.numerator,
                    r.denominator,
                    "eligible school buildings",
                  ),
                  s,
                  "2025",
                  "growth/comparison",
                  "Missouri",
                );
              })
              .join("")
          : "") +
        kpi(
          "Eligible school buildings",
          `${a.N} of ${a.total}`,
          `${a.N} of ${a.total} school buildings eligible`,
          s,
          "2025",
          "growth/results",
          "Building",
        ) +
        kpi(
          "Not tested",
          fmt(a.total - a.N),
          `${a.total - a.N} of ${a.total} school buildings; preschool–K`,
          s,
          "2025",
          "growth/results",
          "Building",
        )
      );
    }
    const pooledScope = topic === "learning" ? { ...s, level: "schools" } : s;
    const a = pooledMap(pooledScope, subjects[0]),
      b = pooledMap(pooledScope, subjects[1]);
    if (topic === "learning")
      return (
        [a, b]
          .map((k, i) =>
            kpi(
              (s.school === "all" ? "Pooled " : "") + (i ? "math" : "reading"),
              rate(k.value),
              countText(k.n, k.N, "reportable tests") +
                "; " +
                Dashboard.coverage(subjects[i], pooledScope),
              s,
              "2025",
              `learning/${i ? "math" : "reading"}?${query(s)}`,
              "School",
            ).replace(
              'class="mini-kpi"',
              'class="mini-kpi" data-pooled-map="' + subjects[i] + '"',
            ),
          )
          .join("") +
        (s.reference
          ? subjects
              .map((subject) => {
                const r = data.state_map.find(
                  (r) =>
                    r.subject === subject && Dashboard.matchesGroup(r, s.group),
                );
                return kpi(
                  "Missouri " + subjectNames[subject],
                  rate(r.value),
                  countText(r?.numerator, r?.denominator, "reportable tests") +
                    "; all tested grades",
                  s,
                  "2025",
                  "learning/grade-comparison",
                  "Missouri",
                );
              })
              .join("")
          : "") +
        kpi(
          "Published results",
          `${a.count} of ${a.total}`,
          `${a.count} of ${a.total} schools report reading`,
          s,
          "2025",
          "learning/reading",
          "School",
        ) +
        kpi(
          "Reportable tests",
          `${numberText(a.N)} / ${numberText(b.N)}`,
          `Reading ${countText(a.n, a.N, "tests")}; math ${countText(b.n, b.N, "tests")}`,
          s,
          "2025",
          "learning/performance",
          "School",
        )
      );
    const g = growthCount(s, subjects[0]),
      lunch = summaryTile("frl", s, "overview"),
      u = currentUnits(s),
      buildings = pick(s, data.directory),
      addresses = new Set(buildings.map((r) => r.address_group)).size;
    return (
      enrollmentTile(s) +
      kpi(
        "School communities",
        `${new Set(u.map((r) => r.lea)).size} / ${buildings.length}`,
        `${buildings.length} school buildings at ${addresses} street addresses`,
        s,
        "June 2026",
        `schools/directory`,
        "Building",
      ) +
      lunch +
      [a, b]
        .map((k, i) =>
          kpi(
            i ? "Math (MAP)" : "Reading (MAP)",
            rate(k.value),
            countText(k.n, k.N, "reportable tests") +
              `; ${k.count} of ${k.total} report`,
            s,
            "2025",
            `learning/${i ? "math" : "reading"}?${query(s)}`,
            "School",
          ),
        )
        .join("") +
      kpi(
        "Reading growth",
        `${g.n} of ${g.N}`,
        countText(g.n, g.N, "eligible school buildings"),
        s,
        "2025",
        "growth/results",
        "Building",
      )
    );
  }
  function query(s) {
    const p = new URLSearchParams();
    p.set("level", s.level);
    if (s.school !== "all") p.set("school", slug(s.school));
    if (s.year !== "2025") p.set("year", s.year);
    if (s.measure !== "both") p.set("measure", s.measure);
    if (!s.reference) p.set("missouri", "off");
    if (s.grade !== "3") p.set("grade", s.grade);
    if (s.sort !== "name") p.set("sort", s.sort);
    if (s.bridge !== "bridge") p.set("view", s.bridge);
    for (const key of ["group", "city", "search", "program", "fiscal_year"]) {
      const value = s[key];
      if (value && value !== "all" && value !== "Total") p.set(key, value);
    }
    return p.toString();
  }
  function parse(topic, params) {
    const s = defaultState(topic);
    s.level =
      params.get("level") === "school-buildings"
        ? "school-buildings"
        : "schools";
    const id = params.get("school");
    s.school =
      schoolList().find(
        (r) =>
          r["DESE LEA"] === id ||
          slug(r["DESE LEA"]) === id ||
          normalize(r.School).includes(normalize(id ?? "__none__")),
      )?.["DESE LEA"] ?? "all";
    s.year = /^(200[7-9]|201\d|202[0-5])$/.test(params.get("year"))
      ? params.get("year")
      : "2025";
    if (topic !== "students") s.year = "2025";
    s.measure =
      topic === "students"
        ? names[params.get("measure")]
          ? params.get("measure")
          : "black"
        : ["both", "reading", "math"].includes(params.get("measure"))
          ? params.get("measure")
          : "both";
    s.reference = params.get("missouri") !== "off";
    s.grade = params.get("grade") ?? "3";
    s.sort = params.get("sort") === "value" ? "value" : "name";
    s.bridge = params.get("view") === "trend" ? "trend" : "bridge";
    for (const key of ["group", "city", "search", "program", "fiscal_year"]) {
      s[key] = params.get(key) ?? s[key];
    }
    return s;
  }
  function filters(topic, s) {
    return Dashboard.filterBar(topic, s);
  }
  function panel(model, s) {
    models.set(model.id, model);
    const level = model.level ?? labelLevel(s),
      year = model.year ?? "2025";
    return `<article class="analytic-panel" id="${model.id}" tabindex="-1" aria-labelledby="${model.id}-title" data-panel><div class="panel-title"><h3 id="${model.id}-title">${esc(model.title)}</h3><span>${tag(level)} <span class="year-chip">${esc(year)}</span></span><details class="panel-menu" data-export-ignore><summary aria-label="Options for ${esc(model.title)}">⋯</summary><div><button data-panel-png="${model.id}">Download PNG</button><button data-panel-csv="${model.id}">Download CSV</button><button data-panel-table="${model.id}" aria-controls="${model.id}-table">View as table</button></div></details></div>${model.controls ?? ""}<p class="chart-summary">${esc(model.summary)}</p><div class="analytic-plot" ${!model.datasets?.some((d) => d.data.some((v) => valid(v))) ? "hidden" : ""}><canvas id="plot-${model.id}" role="img" aria-labelledby="${model.id}-title" aria-describedby="${model.id}-caption"></canvas></div>${model.html ?? ""}${model.referenceNote ? `<p class="reference-note">${esc(model.referenceNote)}</p>` : ""}${!model.datasets?.some((d) => d.data.some((v) => valid(v))) && !model.html ? '<div class="empty-panel">No published results for this selection</div>' : ""}<div class="panel-caption" id="${model.id}-caption">${tag(level)} · ${esc(year)} · Source: Missouri DESE · ${esc(model.coverage ?? "Reporting counts in table")}</div><details class="panel-table" id="${model.id}-table"><summary>View as table</summary>${model.table ?? ""}<p class="gap-key">Not published · Not tested · Not available</p></details></article>`;
  }
  function currentEnrollment(s) {
    const rows = order(
      currentUnits(s).map((r) => ({
        ...r,
        value: r[s.level === "schools" ? "2025–26 K–12" : "K–12 prelim"],
      })),
      s,
    );
    const total = sum(rows.filter((r) => valid(r.value)).map((r) => r.value));
    rows.forEach((r) => {
      r.n = r.value;
      r.N = total;
    });
    return {
      id: "enrollment",
      title: `Students enrolled by ${s.level === "schools" ? "school" : "school building"}, 2025–26 preliminary`,
      year: "2025–26 preliminary",
      summary: `${fmt(total)} reported K–12 students; preschool is separate.`,
      labels: rows.map((r) => r.name),
      datasets: [
        series(
          "K–12 students",
          rows.map((r) => r.value),
          rows,
        ),
      ],
      percent: false,
      table: unitTable(rows, "value", "K–12 students", ""),
      coverage: `${rows.filter((r) => valid(r.value)).length} of ${rows.length} reported`,
    };
  }
  function timeline(
    topic,
    s,
    metric = "enrollment",
    id = "enrollment-history",
    area = false,
  ) {
    const source = historyRows(topic, s).filter(
        (r) => r.year <= Number(s.year),
      ),
      units = currentUnits(s),
      years = Array.from(
        { length: Number(s.year) - 2007 + 1 },
        (_, i) => 2007 + i,
      ),
      coverage = years.map(
        (y) =>
          source.filter((r) => r.year === y && valid(r.metrics[metric]?.value))
            .length,
      );
    const datasets = units.map((u) => {
      const unit = source.filter(
          (r) => r.lea === u.lea && r.building === u.building,
        ),
        meta = years.map((y) => {
          const r = unit.find((r) => r.year === y),
            m = r?.metrics[metric];
          return {
            ...u,
            n: m?.numerator,
            N: m?.denominator,
            year: y,
            coverage: `${coverage[y - 2007]} of ${units.length} ${levelName(labelLevel(s)).toLowerCase()} report`,
          };
        });
      return {
        label: u.name,
        data: years.map((y, i) => {
          const v = unit.find((r) => r.year === y)?.metrics[metric]?.value;
          return area && coverage[i] !== units.length ? null : (v ?? null);
        }),
        meta,
        lea: u.lea,
        backgroundColor: color(u.lea, u.building) + "",
        borderColor: color(u.lea, u.building),
        pointStyle: schoolMarker(u.lea),
        pointRadius: area ? 0 : 2,
        borderWidth: 2,
        fill: area ? "origin" : false,
        spanGaps: false,
      };
    });
    const ref = metric !== "enrollment" ? reference(s, metric) : null;
    return {
      id,
      title:
        metric === "enrollment"
          ? `Enrollment over time, 2007–${s.year}`
          : `${names[metric]} over time, 2007–${s.year}`,
      year: `2007–${s.year}`,
      summary: area
        ? "Area shows years when every selected school reports; earlier published values remain in the table."
        : "Missing years stay gaps. Years before joining SLU are context.",
      type: "line",
      labels: years,
      datasets,
      stacked: area,
      percent: metric !== "enrollment",
      refs: ref ? [ref] : [],
      joins: true,
      legend: units.length <= 6,
      table: publicTable(
        [
          "School",
          ...(s.level === "school-buildings" ? ["School building"] : []),
          "Year",
          names[metric],
          "Numerator",
          "Denominator",
        ],
        source.map((r) => [
          link(r.lea),
          ...(s.level === "school-buildings" ? [resultName(r)] : []),
          r.year,
          cell(
            r.metrics[metric]?.value,
            r.metrics[metric]?.statuses?.value,
            metric === "enrollment" ? "" : "%",
          ),
          numberText(r.metrics[metric]?.numerator),
          numberText(r.metrics[metric]?.denominator),
        ]),
      ),
      coverage: `${source.filter((r) => valid(r.metrics[metric]?.value)).length} of ${units.length * years.length} school-years reported`,
    };
  }
  function mapRows(s, subject) {
    return order(
      currentUnits(s).map((u) => {
        const r = (
          (s.group && s.group !== "Total"
            ? cache.get("learning")?.assessments
            : data.three_levels.map_rows) ?? []
        ).find(
          (r) =>
            r.lea === u.lea &&
            r.building === u.building &&
            r.subject === subject &&
            Dashboard.matchesGroup(r, s.group),
        );
        return {
          ...u,
          ...r,
          name: u.name,
          value: r?.PA_PCT ?? null,
          n:
            valid(r?.PROFICIENT) && valid(r?.ADVANCED)
              ? r.PROFICIENT + r.ADVANCED
              : null,
          N: r?.REPORTABLE ?? null,
          status:
            r?.status ??
            u.statuses?.[
              subject === subjects[0] ? "MAP ELA P+A %" : "MAP Math P+A %"
            ],
        };
      }),
      s,
    );
  }
  function mapPanel(s, subject, id) {
    const rows = mapRows(s, subject),
      state = data.state_map.find(
        (r) => r.subject === subject && Dashboard.matchesGroup(r, s.group),
      );
    return {
      id,
      title: `${subjectNames[subject]} proficiency by ${s.level === "schools" ? "school" : "school building"}, 2025`,
      summary:
        (subject === "Mathematics" && s.measure === "reading") ||
        (subject === subjects[0] && s.measure === "math")
          ? "No published results for this selection"
          : `${rows.filter((r) => valid(r.value)).length} of ${rows.length} publish combined proficiency.`,
      labels: rows.map((r) => r.name),
      datasets: selectedSubject(s).includes(subject)
        ? [
            series(
              subjectNames[subject],
              rows.map((r) => r.value),
              rows,
            ),
          ]
        : [],
      refs:
        s.reference && valid(state?.value)
          ? [
              {
                value: state.value,
                label: `Missouri ${subjectNames[subject]} · all tested grades`,
                n: state.numerator,
                N: state.denominator,
                year: 2025,
              },
            ]
          : [],
      percent: true,
      table: unitTable(rows, "value", "Proficient or Advanced %"),
      coverage: `${rows.filter((r) => valid(r.value)).length} of ${rows.length} reported`,
    };
  }
  function overviewMap(s) {
    const units = mapRows(s, subjects[0]),
      datasets = subjects.map((subject, i) => {
        const rows = units.map((u) =>
          mapRows(s, subject).find(
            (r) => r.lea === u.lea && r.building === u.building,
          ),
        );
        return series(
          subjectNames[subject],
          rows.map((r) => r.value),
          rows,
          {
            borderWidth: i ? 2 : 0,
            borderColor: "#243448",
            pointStyle: i ? "triangle" : "circle",
          },
        );
      });
    return {
      id: "map-overview",
      title: `Reading and math by ${s.level === "schools" ? "school" : "school building"}, 2025`,
      summary:
        "Only published combined results have bars; Missouri references cover all tested grades.",
      labels: units.map((r) => r.name),
      datasets,
      legend: true,
      percent: true,
      refs: s.reference
        ? subjects.map((subject, i) => ({
            value: stateMap(subject),
            label: "Missouri " + subjectNames[subject] + " · all tested grades",
            dash: i ? [2, 4] : [7, 4],
            year: 2025,
          }))
        : [],
      table: publicTable(
        [levelName(labelLevel(s)), "Reading %", "Math %"],
        [
          ...units.map((u) => [
            resultName(u),
            cell(
              mapRows(s, subjects[0]).find(
                (r) => r.lea === u.lea && r.building === u.building,
              )?.value,
              u.statuses?.["MAP ELA P+A %"],
            ),
            cell(
              mapRows(s, subjects[1]).find(
                (r) => r.lea === u.lea && r.building === u.building,
              )?.value,
              u.statuses?.["MAP Math P+A %"],
            ),
          ]),
          ...(s.reference
            ? [
                [
                  `<span class="level grey">Missouri · 2025</span>`,
                  pct(stateMap(subjects[0])),
                  pct(stateMap(subjects[1])),
                ],
              ]
            : []),
        ],
      ),
      coverage: `${datasets[0].data.filter(valid).length} of ${units.length} reported`,
    };
  }
  function designations(s, id = "designations") {
    const selected = selectedSubject(s),
      labels = ["Target", "On-Track", "Approaching", "Emerging"],
      colors = ["#003da5", "#47759c", "#8c631c", "#68717c"],
      rows = selected.flatMap((subject) => growthCount(s, subject).rows);
    return {
      id,
      title: "Growth designations by subject, 2025",
      level: "Building",
      summary:
        subjects
          .filter((subject) => selected.includes(subject))
          .map((subject) => {
            const k = growthCount(s, subject);
            return `${subjectNames[subject]}: ${k.n} of ${k.N} met Target`;
          })
          .join("; ") + ".",
      labels: selected.map((s) => subjectNames[s]),
      datasets: labels.map((label, i) => ({
        label,
        data: selected.map(
          (subject) =>
            rows.filter((r) => r.subject === subject && r.designation === label)
              .length,
        ),
        backgroundColor: colors[i],
        borderColor: "#fff",
        borderWidth: i + 1,
        meta: selected.map((subject) => ({
          year: 2025,
          n: rows.filter(
            (r) => r.subject === subject && r.designation === label,
          ).length,
          N: growthCount(s, subject).N,
          unit: "eligible school buildings",
          level: "Building",
        })),
      })),
      stacked: true,
      percent: false,
      legend: true,
      referenceNote: s.reference
        ? selected
            .map(
              (subject) =>
                `Missouri ${subjectNames[subject]} Target: ${pct(data.benchmarks.growth[subject].value)} (${countText(data.benchmarks.growth[subject].numerator, data.benchmarks.growth[subject].denominator, "eligible school buildings")})`,
            )
            .join(" · ")
        : "",
      table: publicTable(
        ["Subject", ...labels, "Eligible school buildings"],
        selected.map((subject) => [
          subjectNames[subject],
          ...labels.map(
            (label) =>
              rows.filter(
                (r) => r.subject === subject && r.designation === label,
              ).length,
          ),
          growthCount(s, subject).N,
        ]),
      ),
      coverage: `${growthCount(s, selected[0]).N} of ${growthCount(s, selected[0]).total} school buildings reported`,
    };
  }
  function groups(s) {
    const units = currentUnits(s),
      source = annual("students", s),
      rows = order(
        units.map((u) => {
          const m = source.find(
            (r) => r.lea === u.lea && r.building === u.building,
          )?.metrics[s.measure];
          return {
            ...u,
            value: m?.value ?? null,
            n: m?.numerator,
            N: m?.denominator,
            status: m?.statuses?.value,
          };
        }),
        s,
      ),
      ref = reference(s, s.measure);
    return {
      id: "groups",
      title: `${names[s.measure]} by ${s.level === "schools" ? "school" : "school building"}, ${s.year}`,
      year: s.year,
      summary: `${rows.filter((r) => valid(r.value)).length} of ${rows.length} report this measure.`,
      labels: rows.map((r) => r.name),
      datasets: [
        series(
          names[s.measure],
          rows.map((r) => r.value),
          rows,
        ),
      ],
      refs: ref ? [ref] : [],
      percent: s.measure !== "enrollment",
      table: unitTable(
        rows,
        "value",
        names[s.measure] + (s.measure === "enrollment" ? "" : " %"),
        s.measure === "enrollment" ? "" : "%",
      ),
      coverage: `${rows.filter((r) => valid(r.value)).length} of ${rows.length} reported`,
    };
  }
  function needsHistory(s) {
    if (s.school === "all")
      return timeline("students", s, s.measure, "needs-history");
    const model = timeline("students", s, "frl", "needs-history"),
      source = historyRows("students", s),
      units = currentUnits(s);
    if (units.length !== 1)
      return timeline("students", s, s.measure, "needs-history");
    const u = units[0];
    model.title = "Lunch eligibility, English learners and IEP over time";
    model.summary =
      "Three reported measures for the selected school; unavailable years stay gaps.";
    model.datasets = ["frl", "el", "iep"].map((metric, i) => ({
      label: names[metric],
      data: model.labels.map(
        (y) => source.find((r) => r.year === y)?.metrics[metric]?.value ?? null,
      ),
      borderColor: color(u.lea),
      backgroundColor: color(u.lea),
      borderDash: [[], [7, 4], [2, 4]][i],
      pointStyle: markers[i],
      spanGaps: false,
      fill: false,
      meta: model.labels.map((year) => ({
        ...u,
        year,
        n: source.find((r) => r.year === year)?.metrics[metric]?.numerator,
        N: source.find((r) => r.year === year)?.metrics[metric]?.denominator,
      })),
    }));
    model.refs = ["frl", "el", "iep"]
      .map((metric) => {
        const r = reference(s, metric);
        return r
          ? { ...r, label: "Missouri " + names[metric] + " · " + r.year }
          : null;
      })
      .filter(Boolean);
    model.legend = true;
    model.table = publicTable(
      ["Year", "Lunch %", "English learners %", "IEP %"],
      model.labels.map((year) => {
        const r = source.find((r) => r.year === year);
        return [
          year,
          ...["frl", "el", "iep"].map((m) =>
            cell(r?.metrics[m]?.value, r?.metrics[m]?.statuses?.value),
          ),
        ];
      }),
    );
    return model;
  }
  function composition(s) {
    const units = currentUnits(s),
      categories = [
        "Black",
        "Hispanic",
        "White",
        "Multiracial",
        "Asian",
        "American Indian",
        "Pacific Islander",
      ],
      source =
        s.year === "2025"
          ? pick(s, data.three_levels.demographics).filter(
              (r) => r.level === labelLevel(s),
            )
          : annual("students", s).map((r) => ({
              ...r,
              race: [
                "black",
                "hispanic",
                "white",
                "multiracial",
                "asian",
                "american_indian",
                "pacific_islander",
              ].map((k) => ({
                label: names[k],
                value: r.metrics[k]?.published_pct ?? r.metrics[k]?.value,
                status: r.metrics[k]?.statuses?.value,
              })),
            }));
    const datasets = categories.map((category, i) => ({
      label: category,
      data: units.map(
        (u) =>
          source
            .find((r) => r.lea === u.lea && r.building === u.building)
            ?.race.find((c) => c.label === category)?.value ?? null,
      ),
      backgroundColor: units.map((u) => shade(u.lea, i * 0.7)),
      borderColor: i < 6 ? "white" : "#243448",
      borderWidth: i + 1,
      meta: units.map((u) => {
        const metric = annual("students", s).find(
          (r) => r.lea === u.lea && r.building === u.building,
        )?.metrics[category.toLowerCase()];
        return {
          ...u,
          year: s.year,
          n: metric?.numerator,
          N: metric?.denominator,
        };
      }),
    }));
    return {
      id: "composition",
      title: `Race and ethnicity by ${s.level === "schools" ? "school" : "school building"}, ${s.year}`,
      year: s.year,
      summary:
        "Published percentages are not normalized to 100%. Unfilled space is not a calculated category.",
      labels: units.map((r) => r.name),
      datasets,
      stacked: true,
      percent: true,
      legend: true,
      table: publicTable(
        [levelName(labelLevel(s)), ...categories],
        [
          ...units.map((u) => [
            resultName(u),
            ...categories.map((c) => {
              const r = source
                .find((r) => r.lea === u.lea && r.building === u.building)
                ?.race.find((r) => r.label === c);
              return cell(r?.value, r?.status);
            }),
          ]),
          ...(s.reference
            ? [
                [
                  `<span class="level grey">Missouri · 2024–25</span>`,
                  ...categories.map((c) =>
                    pct(
                      data.benchmarks[c.toLowerCase().replace(/ /g, "_")]
                        ?.value,
                    ),
                  ),
                ],
              ]
            : []),
        ],
      ),
      coverage: `${source.length} of ${units.length} reported`,
      html: `<details class="unpublished-categories"><summary>Unpublished categories</summary>${units
        .map((u) => {
          const r = source.find(
            (r) => r.lea === u.lea && r.building === u.building,
          );
          const gaps = categories.filter(
            (c) => !valid(r?.race.find((r) => r.label === c)?.value),
          );
          return gaps.length
            ? `<p>${resultName(u)}: ${esc(gaps.join(", "))} — Not published</p>`
            : "";
        })
        .join("")}</details>`,
    };
  }
  function bridge(s) {
    if (s.bridge === "trend" || s.year !== "2025")
      return {
        ...timeline("students", s, "enrollment", "bridge"),
        controls:
          '<button data-bridge="bridge">Show enrollment bridge</button>',
      };
    const units = currentUnits(s),
      selectedSchools = data.schools.filter(
        (r) => s.school === "all" || r["DESE LEA"] === s.school,
      ),
      k12 = sum(
        units.map(
          (r) => r[s.level === "schools" ? "2025–26 K–12" : "K–12 prelim"],
        ),
      ),
      pkvalues = units.map(
        (r) => r[s.level === "schools" ? "2025–26 PK" : "PK prelim"],
      ),
      pk = sum(pkvalues.filter(valid)),
      race = sum(selectedSchools.map((r) => r["2025 K–12"]));
    return {
      id: "bridge",
      title: "Enrollment bridge and populations",
      year: "2025 / 2025–26 preliminary",
      controls: '<button data-bridge="trend">Show enrollment trend</button>',
      summary: `${fmt(k12)} K–12 + ${fmt(pk)} reported preschool = ${fmt(k12 + pk)} as reported.`,
      labels: ["K–12", "Reported preschool", "K–12 + reported preschool"],
      datasets: [
        {
          label: "Students",
          data: [k12, pk, k12 + pk],
          backgroundColor: palette[0],
          meta: [
            { n: k12, N: k12 + pk },
            { n: pk, N: k12 + pk },
            { n: k12 + pk, N: k12 + pk },
          ],
        },
      ],
      percent: false,
      table: publicTable(
        ["Population", "Count", "Used for"],
        [
          ["K–12 preliminary", fmt(k12), "Enrollment headline"],
          ["Reported preschool", fmt(pk), "Preschool shown separately"],
          [
            "K–12 + reported preschool",
            fmt(k12 + pk),
            "As reported; preschool coverage is partial",
          ],
          ...(s.level === "schools"
            ? [["K–12, 2025", fmt(race), "Race and ethnicity percentages"]]
            : []),
          ...(s.school === "all" && s.level === "schools"
            ? [
                [
                  "January membership, 2025",
                  fmt(data.three_levels.bridge.january_membership),
                  "Lunch eligibility percentages",
                ],
              ]
            : []),
        ],
      ),
      coverage: `${pkvalues.filter(valid).length} of ${units.length} preschool counts reported`,
    };
  }
  function gradePanel(s) {
    const chosen = selectedSubject(s),
      all = cache.get("learning")?.grades ?? [];
    const units = order(
      currentUnits(s).map((u) => ({
        ...u,
        value:
          all.find(
            (r) =>
              r.lea === u.lea &&
              r.building === u.building &&
              r.subject === chosen[0] &&
              Dashboard.matchesGroup(r, s.group) &&
              r.grade === s.grade,
          )?.school_pct ?? null,
      })),
      s,
    );
    const bySubject = chosen.map((subject) => {
      const source = pick(s, all).filter(
        (r) =>
          r.level === (s.level === "schools" ? "Charter" : "Building") &&
          r.subject === subject &&
          Dashboard.matchesGroup(r, s.group) &&
          String(r.grade) === s.grade,
      );
      return {
        subject,
        rows: units.map((u) => {
          const r = source.find(
            (r) => r.lea === u.lea && r.building === u.building,
          );
          return {
            ...u,
            value: r?.school_pct ?? null,
            n: r?.school_numerator,
            N: r?.school_denominator,
            status: r?.statuses?.school_pct,
            state: r?.state_pct,
            stateN: r?.state_denominator,
            stateNumerator: r?.state_numerator,
          };
        }),
      };
    });
    const grades = [
      ...new Set(
        all.filter((r) => chosen.includes(r.subject)).map((r) => r.grade),
      ),
    ].sort((a, b) => Number(a) - Number(b));
    return {
      id: "grade-comparison",
      title: `${chosen.length === 2 ? "Reading and math" : subjectNames[chosen[0]]} by the same grade, 2025`,
      summary:
        "Missouri matches subject, grade and all-student group. Unpublished counts remain nonnumeric.",
      controls: "",
      labels: units.map((r) => r.name),
      datasets: bySubject.map(({ subject, rows }, i) =>
        series(
          subjectNames[subject],
          rows.map((r) => r.value),
          rows,
          { borderWidth: i ? 2 : 0, borderColor: "#243448" },
        ),
      ),
      legend: chosen.length > 1,
      refs: s.reference
        ? bySubject.flatMap(({ subject, rows }) => {
            const r = rows.find((r) => valid(r.state));
            return r
              ? [
                  {
                    value: r.state,
                    label: `Missouri ${subjectNames[subject]} · grade ${s.grade}`,
                    n: r.stateNumerator,
                    N: r.stateN,
                    year: 2025,
                  },
                ]
              : [];
          })
        : [],
      percent: true,
      table: publicTable(
        [
          levelName(labelLevel(s)),
          "Subject",
          "Grade",
          "Proficient or Advanced %",
          "Published higher-level count",
          "Reportable tests",
          ...(s.reference ? ["Missouri, same grade %"] : []),
        ],
        bySubject.flatMap(({ subject, rows }) =>
          rows.map((r) => [
            resultName(r),
            subjectNames[subject],
            esc(s.grade),
            cell(r.value, r.status),
            numberText(r.n),
            numberText(r.N),
            ...(s.reference ? [pct(r.state)] : []),
          ]),
        ),
      ),
      coverage: `${bySubject.flatMap((r) => r.rows).filter((r) => valid(r.value)).length} of ${units.length * chosen.length} school-subject results reported`,
    };
  }
  function shade(lea, part) {
    const base = color(lea).match(/\w\w/g);
    const amount = part * 0.16;
    return (
      "#" +
      base
        .map((v) =>
          Math.round(parseInt(v, 16) * (1 - amount) + 255 * amount)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  }
  function performance(s) {
    const chosen = selectedSubject(s),
      units = mapRows(s, chosen[0]),
      keys = ["BELOW_BASIC", "BASIC", "PROFICIENT", "ADVANCED"],
      labels = ["Below Basic", "Basic", "Proficient", "Advanced"];
    const bySubject = chosen.map((subject) => ({
      subject,
      rows: units.map((u) =>
        mapRows(s, subject).find(
          (r) => r.lea === u.lea && r.building === u.building,
        ),
      ),
    }));
    const complete = (r) =>
      keys.every((k) => valid(r[k]) && valid(r[k + "_PCT"]));
    return {
      id: "performance",
      title: `${chosen.length === 2 ? "Reading and math" : subjectNames[chosen[0]]} performance levels, 2025`,
      summary:
        "Each subject’s bar requires all four published levels. No suppressed level is recovered.",
      labels: units.map((u) => u.name),
      datasets: bySubject.flatMap(({ subject, rows }) =>
        keys.map((k, i) => ({
          label:
            (chosen.length > 1 ? subjectNames[subject] + " · " : "") +
            labels[i],
          stack: subject,
          data: rows.map((r) => (complete(r) ? r[k + "_PCT"] : null)),
          backgroundColor: rows.map((r) => shade(r.lea, i)),
          borderColor: "white",
          borderWidth: 1 + i,
          pointStyle: markers[i],
          meta: rows.map((r) => ({ ...r, n: r[k], N: r.REPORTABLE })),
        })),
      ),
      stacked: true,
      legend: true,
      percent: true,
      table: publicTable(
        [levelName(labelLevel(s)), "Subject", ...labels],
        bySubject.flatMap(({ subject, rows }) =>
          rows.map((r) => [
            resultName(r),
            subjectNames[subject],
            ...keys.map((k) =>
              complete(r) ? pct(r[k + "_PCT"]) : "Not published",
            ),
          ]),
        ),
      ),
      coverage: `${bySubject.flatMap((s) => s.rows).filter(complete).length} of ${units.length * chosen.length} school-subject results reported all four levels`,
    };
  }
  function heat(s) {
    const buildings = pick(s, data.directory).sort(
      (a, b) =>
        school(a.lea).School.localeCompare(school(b.lea).School) ||
        a.name.localeCompare(b.name),
    );
    const html = publicTable(
      [
        "School",
        "School building",
        ...selectedSubject(s).map((subject) => subjectNames[subject]),
      ],
      buildings.map((b) => [
        link(b.lea),
        resultName(b),
        ...selectedSubject(s).map((subject) => {
          const r = data.growth.find(
            (r) =>
              r.lea === b.lea &&
              r.building === b.building &&
              r.subject === subject,
          );
          return `<span class="designation ${r?.eligible ? "designation-" + normalize(r.designation).replace(/ /g, "-") : "not-tested"}">${esc(r?.eligible ? r.designation : "Not tested")}</span>`;
        }),
      ]),
    );
    return {
      id: "results",
      title: "Growth results by school building, 2025",
      level: "Building",
      summary:
        "School buildings are grouped under their school. The designation is written in every cell.",
      html: `<div class="heat-table">${html}</div>`,
      table: html,
      coverage: `${growthCount(s, selectedSubject(s)[0]).N} of ${buildings.length} school buildings reported`,
    };
  }
  function points(s) {
    const subject = s.measure === "math" ? "Mathematics" : subjects[0],
      rows = order(
        pick(s, data.growth)
          .filter((r) => r.subject === subject)
          .map((r) => ({
            ...r,
            value: r.eligible ? r.earned : null,
            n: r.earned,
            N: r.possible,
          })),
        s,
      );
    return {
      id: "points",
      title: `${subjectNames[subject]} growth points by school building, 2025`,
      level: "Building",
      summary:
        "Points earned are shown beside each school building’s published possible points.",
      labels: rows.map((r) => r.name),
      datasets: [
        series(
          "Earned",
          rows.map((r) => r.value),
          rows,
        ),
        {
          ...series(
            "Possible",
            rows.map((r) => (r.eligible ? r.possible : null)),
            rows,
          ),
          backgroundColor: "rgba(82,101,125,.18)",
          borderWidth: 1,
          borderColor: "#52657d",
        },
      ],
      legend: true,
      percent: false,
      table: publicTable(
        ["School", "School building", "Earned points", "Possible points"],
        rows.map((r) => [
          link(r.lea),
          resultName(r),
          r.eligible ? fmt(r.earned) : "Not tested",
          r.eligible ? fmt(r.possible) : "Not tested",
        ]),
      ),
      coverage: `${rows.filter((r) => r.eligible).length} of ${rows.length} reported`,
    };
  }
  function growthComparison(s) {
    const units = data.schools
        .filter((r) => s.school === "all" || r["DESE LEA"] === s.school)
        .map((r) => ({ lea: r["DESE LEA"], name: r.School })),
      selected = selectedSubject(s),
      datasets = selected.map((subject, i) => {
        const rows = units.map((u) => {
          const r = pick({ ...s, school: u.lea }, data.growth).filter(
            (r) => r.subject === subject && r.eligible,
          );
          return {
            ...u,
            value: ratio(
              r.filter((r) => r.designation === "Target").length,
              r.length,
            ),
            n: r.filter((r) => r.designation === "Target").length,
            N: r.length,
            unit: "eligible school buildings",
          };
        });
        return series(
          subjectNames[subject],
          rows.map((r) => r.value),
          rows,
          { borderColor: "#243448", borderWidth: i ? 2 : 0 },
        );
      });
    return {
      id: "comparison",
      title: "School buildings meeting Target versus Missouri, 2025",
      level: "Building",
      summary: `${growthCount(s, selected[0]).N} eligible school buildings is a small comparison group; counts accompany percentages.`,
      labels: units.map((r) => r.name),
      datasets,
      legend: true,
      percent: true,
      refs: s.reference
        ? selected.map((subject) => ({
            value: data.benchmarks.growth[subject].value,
            label: "Missouri " + subjectNames[subject],
            n: data.benchmarks.growth[subject].numerator,
            N: data.benchmarks.growth[subject].denominator,
            year: 2025,
          }))
        : [],
      table: publicTable(
        [
          "School",
          ...selected.map((subject) => subjectNames[subject] + " Target"),
        ],
        units.map((u, i) => [
          link(u.lea),
          ...datasets.map(
            (d) =>
              pct(d.data[i]) +
              " · " +
              countText(d.meta[i].n, d.meta[i].N, "eligible school buildings"),
          ),
        ]),
      ),
      coverage: `${growthCount(s, selected[0]).N} of ${growthCount(s, selected[0]).total} school buildings reported`,
    };
  }
  function definitions(topic) {
    return {
      overview:
        "Enrollment is preliminary K–12. Historical enrollment ends in 2025; years before SLU sponsorship are context. Reading and math compare all tested grades.",
      students:
        "Each measure uses its own population. Lunch uses January membership; race and English learners use reported K–12 populations. An IEP is an Individualized Education Program.",
      learning:
        "Proficient or Advanced combines the two higher published performance levels. Same grade means the same subject, grade and student group. Results are descriptive.",
      growth:
        "Target means earning full growth points. On-Track is a different designation. Eligibility is defined by the reported growth fields; this describes school buildings, not a share of students improving.",
    }[topic];
  }
  async function load(topic) {
    if (cache.has(topic)) return cache.get(topic);
    if (topic === "growth") {
      cache.set(topic, {});
      return {};
    }
    const response = await fetch(`canvas-${topic}.json`);
    if (!response.ok) throw Error("Could not load this view");
    const value = await response.json();
    cache.set(topic, value);
    return value;
  }
  async function mount(topic, params = new URLSearchParams()) {
    const token = ++latestToken,
      s = parse(topic, params);
    state[topic] = s;
    levels[topic] = labelLevel(s);
    const host = $("panel-" + topic);
    if (!extraOverview && topic === "overview")
      extraOverview = [...host.querySelectorAll(".card")]
        .map((n) => n.outerHTML)
        .join("");
    host.classList.add("analytic-tab");
    document.body.classList.add("analytic-active");
    $("start").hidden = true;
    if (!cache.has(topic))
      host.innerHTML =
        '<p class="canvas-loading" role="status">Loading this view…</p>';
    await load(topic);
    if (token !== latestToken || active !== topic) return;
    render(topic, s);
  }
  function render(topic, s) {
    const start = window.performance.now();
    for (const [id, chart] of chartMap) {
      if (chart.oscpTopic === topic) {
        chart.oscpResizeObserver?.disconnect();
        chart.destroy();
        chartMap.delete(id);
      }
    }
    const panels =
      topic === "overview"
        ? [
            currentEnrollment(s),
            timeline("overview", s, "enrollment", "enrollment-history", true),
            overviewMap(s),
            designations(s, "growth-overview"),
          ]
        : topic === "students"
          ? [groups(s), needsHistory(s), composition(s), bridge(s)]
          : topic === "learning"
            ? [
                mapPanel(s, subjects[0], "reading"),
                mapPanel(s, subjects[1], "math"),
                gradePanel(s),
                performance(s),
              ]
            : [designations(s), heat(s), points(s), growthComparison(s)];
    const host = $("panel-" + topic),
      [title, subtitle] = [
        Dashboard.definition(topic).nav_label,
        Dashboard.definition(topic).question,
      ];
    host.innerHTML = `<div class="analytic-canvas" id="canvas-${topic}" data-canvas="${topic}"><div class="canvas-title"><div><h2>${title}</h2><p>${subtitle}</p></div></div>${Dashboard.levelKey()}${filters(topic, s)}<div class="kpi-strip" aria-label="${topic} key figures">${kpis(topic, s)}</div><div class="analytic-grid">${panels.map((m) => panel(m, s)).join("")}</div><div class="definitions-band" id="${topic === "growth" ? "target" : topic + "-definitions"}"><p>${definitions(topic)}</p><details><summary>How to read this</summary><p>Not published means a numerical result is not published. Not tested means the measure does not apply to the tested grades. Not available means no value is available in this view. No value is imputed or recovered by subtraction. Missouri stays separate from schools and school buildings.</p></details></div>${Dashboard.actions(topic)}</div>${topic === "overview" ? `<details class="canvas-context"><summary>Five things to know, school scorecard and city split</summary>${extraOverview}</details>` : ""}`;
    host
      .querySelector("form")
      .addEventListener("submit", (e) => e.preventDefault());
    host.querySelector("form").addEventListener("reset", (e) => {
      e.preventDefault();
      setState(topic, defaultState(topic));
    });
    host.querySelectorAll("select,input").forEach((input) =>
      input.addEventListener("change", () => {
        if (input.matches("[data-grade]")) {
          setState(topic, { grade: input.value });
          return;
        }
        if (input.name === "school") {
          const q = normalize(input.value);
          const chosen =
            schoolList().find((r) => normalize(r.School) === q) ||
            schoolList().find((r) => normalize(r.School).includes(q));
          if (q === "all schools" || !q) setState(topic, { school: "all" });
          else if (chosen) setState(topic, { school: chosen["DESE LEA"] });
          else {
            input.setCustomValidity("Choose one of the six schools.");
            input.reportValidity();
          }
          return;
        }
        input.setCustomValidity("");
        setState(topic, {
          [input.name]:
            input.type === "checkbox"
              ? input.name === "sort"
                ? input.checked
                  ? "value"
                  : "name"
                : input.checked
              : input.value,
        });
      }),
    );
    panels.forEach((model) => draw(model, s));
    Dashboard.observeFrame(host.querySelector("[data-canvas]"));
    lastRenderMs = window.performance.now() - start;
    $("loadStatus").hidden = true;
    host.dataset.renderMs = String(Math.round(lastRenderMs));
  }
  function setState(topic, patch) {
    const next = { ...state[topic], ...patch };
    location.hash = topic + "?" + query(next);
  }
  function toggleSchool(lea) {
    if (!lea) return;
    setState(active, { school: state[active].school === lea ? "all" : lea });
  }
  function draw(m, s) {
    const canvas = $("plot-" + m.id);
    if (!canvas) return;
    if (!window.Chart) {
      canvas.parentElement.hidden = true;
      $(m.id + "-table").open = true;
      $(m.id).classList.add("table-mode");
      return;
    }
    if (!m.datasets?.some((d) => d.data.some(valid))) return;
    const isLine = m.type === "line",
      hasReference = m.refs?.length;
    const annotation = {
      id: "canvasAnnotations",
      afterDraw(c) {
        const { ctx, chartArea: a, scales } = c;
        ctx.save();
        ctx.font = "12px system-ui";
        ctx.fillStyle = "#414d5c";
        (m.refs ?? []).forEach((r, i) => {
          const axis = isLine ? scales.y : scales.x,
            pos = axis.getPixelForValue(r.value);
          ctx.setLineDash(r.dash ?? (i ? [2, 4] : [7, 4]));
          ctx.strokeStyle = "#555f6b";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (isLine) {
            ctx.moveTo(a.left, pos);
            ctx.lineTo(a.right, pos);
          } else {
            ctx.moveTo(pos, a.top);
            ctx.lineTo(pos, a.bottom);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.textAlign = "left";
          ctx.fillText(
            `${r.label}: ${fmt(r.value)}%`,
            a.left + 4,
            a.top - 12 - i * 16,
          );
        });
        if (m.joins) {
          const seen = new Set();
          m.datasets.forEach((d, datasetIndex) => {
            if (!d.lea || seen.has(d.lea)) return;
            seen.add(d.lea);
            const joined = school(d.lea)["SLU sponsor since"],
              index = m.labels.indexOf(joined);
            if (index < 0) return;
            const x = scales.x.getPixelForValue(index);
            if (!seen.has("year-" + joined)) {
              seen.add("year-" + joined);
              ctx.strokeStyle = "#697584";
              ctx.setLineDash([2, 4]);
              ctx.beginPath();
              ctx.moveTo(x, a.top);
              ctx.lineTo(x, a.bottom);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.save();
              ctx.translate(x + 3, a.top + 8);
              ctx.rotate(Math.PI / 2);
              ctx.fillStyle = "#526071";
              ctx.fillText("Joined " + joined, 0, 0);
              ctx.restore();
            }
            const point = c.getDatasetMeta(datasetIndex).data[index];
            if (point && valid(d.data[index])) {
              ctx.strokeStyle = color(d.lea);
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
              ctx.stroke();
            }
          });
        }
        if (!isLine && !m.stacked && m.labels.length <= 14) {
          c.data.datasets.forEach((d, di) =>
            c.getDatasetMeta(di).data.forEach((bar, i) => {
              if (!valid(d.data[i])) {
                if (di === 0) {
                  ctx.fillStyle = "#526071";
                  ctx.textAlign = "left";
                  ctx.fillText(
                    gap(m.datasets[di].meta?.[i]?.status),
                    a.left + 4,
                    scales.y.getPixelForValue(i) + 4,
                  );
                }
                return;
              }
              if ((a.bottom - a.top) / m.labels.length / m.datasets.length < 14)
                return;
              ctx.fillStyle = "#243448";
              ctx.textAlign = "left";
              ctx.fillText(
                fmt(d.data[i]) + (m.percent ? "%" : ""),
                Math.min(bar.x + 5, a.right - 44),
                bar.y + 4,
              );
            }),
          );
        }
        ctx.restore();
      },
    };
    const datasets = m.datasets.map((d) => ({
      ...d,
      fill: isLine ? d.fill : false,
      spanGaps: false,
      borderRadius: isLine ? 0 : 2,
      maxBarThickness: 20,
    }));
    const chart = new Chart(canvas, {
      type: isLine ? "line" : "bar",
      data: { labels: m.labels, datasets },
      plugins: [annotation],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: isLine ? "x" : "y",
        animation: false,
        layout: {
          padding: {
            top: hasReference ? 20 + 16 * m.refs.length : 8,
            right: 44,
          },
        },
        interaction: { mode: "nearest", intersect: true },
        onClick: (event, items) => {
          if (items.length) {
            const item = items[0],
              meta = m.datasets[item.datasetIndex].meta?.[item.index];
            toggleSchool(meta?.lea);
          }
        },
        plugins: {
          legend: {
            display: !!m.legend,
            position: "bottom",
            labels: { font: { size: 12 }, usePointStyle: true, boxWidth: 10 },
            onClick: (event, item, legend) => {
              const lea = m.datasets[item.datasetIndex].lea;
              if (lea) toggleSchool(lea);
              else Chart.defaults.plugins.legend.onClick(event, item, legend);
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const r =
                    m.datasets[context.datasetIndex].meta?.[
                      context.dataIndex
                    ] ?? {},
                  v = context.raw;
                return `${context.dataset.label}: ${fmt(v)}${m.percent ? "%" : ""} · ${levelName(r.level ?? m.level ?? labelLevel(s))} · ${r.year ?? m.year ?? "2025"} · ${countText(r.n, r.N, r.unit ?? "students")}${r.coverage ? " · " + r.coverage : ""}`;
              },
            },
          },
        },
        scales: isLine
          ? {
              x: {
                stacked: !!m.stacked,
                grid: { display: false },
                ticks: { font: { size: 12 }, maxTicksLimit: 7 },
              },
              y: {
                stacked: !!m.stacked,
                beginAtZero: true,
                ...(m.percent ? { max: 100 } : {}),
                title: {
                  display: true,
                  text: m.percent ? "Percent (%)" : "Students",
                },
                ticks: { font: { size: 12 } },
                grid: { color: "#edf0f3" },
              },
            }
          : {
              x: {
                stacked: !!m.stacked,
                beginAtZero: true,
                ...(m.percent ? { max: 100 } : {}),
                title: {
                  display: true,
                  text: m.percent
                    ? "Percent (%)"
                    : m.id === "points"
                      ? "Growth points"
                      : m.id.includes("growth") || m.id === "designations"
                        ? "Eligible school buildings"
                        : "Students",
                },
                ticks: { font: { size: 12 } },
                grid: { display: false },
              },
              y: {
                stacked: !!m.stacked,
                grid: { display: false },
                ticks: {
                  font: { size: 12 },
                  autoSkip: true,
                  maxTicksLimit: Math.max(2,Math.min(m.labels.length,Math.floor(canvas.parentElement.clientHeight/24))),
                  callback: function (v) {
                    const text = this.getLabelForValue(v);
                    return m.labels.length > 8 ||
                      document.body.classList.contains("present") ||
                      innerWidth < 600 ||
                      matchMedia("print").matches
                      ? text.slice(0, 22) + (text.length > 22 ? "…" : "")
                      : text.length > 22
                        ? (text.match(/.{1,20}(?:\s|$)/g) ?? text)
                        : text;
                  },
                },
              },
            },
      },
    });
    let lastSize = "";
    chart.oscpResizeObserver = new ResizeObserver((entries) => {
      const r = entries[0].contentRect,
        key = r.width + ":" + r.height;
      if (
        key !== lastSize &&
        r.width > 0 &&
        r.height > 0 &&
        chart.options.responsive !== false
      ) {
        lastSize = key;
        requestAnimationFrame(() => chart.resize());
      }
    });
    chart.oscpResizeObserver.observe(canvas.parentElement);
    chart.oscpTopic = active;
    chartMap.set(m.id, chart);
  }
  function tableCsv(element) {
    const quote = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    return [...element.querySelectorAll(".panel-table table tr")]
      .map((r) => [...r.cells].map((c) => quote(c.textContent.trim())).join(","))
      .join("\r\n");
  }
  async function raster(element, filename) {
    const status =
      element.querySelector(".export-status") ??
      document.querySelector(".analytic-canvas .export-status");
    if (status) status.textContent = "Preparing PNG…";
    try {
      if (!window.html2canvas)
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "vendor/html2canvas.min.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      const output = await html2canvas(element, {
        backgroundColor: "#f5f6f8",
        scale: 1.5,
        logging: false,
        ignoreElements: (el) =>
          el.hasAttribute("data-export-ignore") ||
          el.classList.contains("panel-table") ||
          (el.classList.contains("active-filters") && el.children.length === 0),
      });
      const blob = await new Promise((resolve) => output.toBlob(resolve));
      download(blob, filename);
      if (status) status.textContent = "PNG downloaded";
    } catch {
      if (status)
        status.textContent = "PNG could not be created. Use Print / PDF.";
    }
  }
  document.addEventListener("click", (event) => {
    const level = event.target.closest("[data-canvas-level]"),
      remove = event.target.closest("[data-remove-filter]"),
      csv = event.target.closest("[data-panel-csv]"),
      png = event.target.closest("[data-panel-png]"),
      asTable = event.target.closest("[data-panel-table]"),
      whole = event.target.closest("[data-canvas-export]"),
      printButton = event.target.closest("[data-canvas-print]"),
      focus = event.target.closest("[data-focus-view]"),
      bridge = event.target.closest("[data-bridge]");
    if (level) setState(active, { level: level.dataset.canvasLevel });
    if (remove) {
      const name = remove.dataset.removeFilter;
      setState(active, { [name]: defaultState(active)[name] });
    }
    if (csv) {
      const el = $(csv.dataset.panelCsv),
        content =
          'Measure,Level / year / source / reporting count\r\n"' +
          el.querySelector("h3").innerText.replace(/"/g, '""') +
          '","' +
          el.querySelector(".panel-caption").innerText.replace(/"/g, '""') +
          '"\r\n' +
          tableCsv(el);
      download(
        new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
        el.id + ".csv",
      );
    }
    if (png) raster($(png.dataset.panelPng), png.dataset.panelPng + ".png");
    if (asTable) {
      const details = $(asTable.dataset.panelTable + "-table");
      details.open = !details.open;
      details.closest("article").classList.toggle("table-mode", details.open);
      asTable.textContent = details.open ? "Hide table" : "View as table";
      details.closest("article").querySelector(".panel-menu").open = false;
    }
    if (whole)
      raster(
        $("canvas-" + whole.dataset.canvasExport),
        "oscp-" + whole.dataset.canvasExport + ".png",
      );
    if (printButton) {
      document.body.dataset.printCanvas = printButton.dataset.canvasPrint;
      window.print();
    }
    if (focus) {
      document.body.classList.toggle("focus-view");
      focus.setAttribute(
        "aria-pressed",
        String(document.body.classList.contains("focus-view")),
      );
    }
    if (bridge)
      setState(active, {
        bridge: bridge.dataset.bridge,
        ...(bridge.dataset.bridge === "bridge" ? { year: "2025" } : {}),
      });
  });
  addEventListener(
    "afterprint",
    () => delete document.body.dataset.printCanvas,
  );
  return {
    captureOverview(html) {
      const holder = document.createElement("div");
      holder.innerHTML = html;
      extraOverview = [...holder.querySelectorAll(".card")]
        .map((n) => n.outerHTML)
        .join("");
    },
    decorateExplorer() {
      const article = document.querySelector("#reportOutput .card");
      if (!article || article.dataset.decorated) return;
      article.dataset.decorated = "true";
      article.classList.add("analytic-panel");
      const header = article.querySelector(".card-heading");
      header.classList.add("panel-title");
      const metadata = document.createElement("span");
      metadata.innerHTML =
        (article.querySelector(".caption .level")?.outerHTML ?? "") +
        ' <span class="year-chip">' +
        esc(
          article
            .querySelector(".caption")
            ?.textContent.match(/20\d{2}(?:[–-]\d{2,4})?/)?.[0] ?? "2025",
        ) +
        "</span>";
      header.append(metadata);
      const exports = header.querySelector(".exports");
      if (exports) {
        const menu = document.createElement("details");
        menu.className = "panel-menu";
        menu.innerHTML =
          '<summary aria-label="Report options">⋯</summary><div></div>';
        menu.lastElementChild.append(...exports.children);
        menu.lastElementChild.insertAdjacentHTML(
          "beforeend",
          '<button data-panel-table="detail-report">View as table</button>',
        );
        exports.replaceWith(menu);
      }
      const scroll = article.querySelector(".scroll");
      if (scroll) {
        const details = document.createElement("details");
        details.className = "panel-table";
        details.id = "detail-report-table";
        details.innerHTML = "<summary>View as table</summary>";
        scroll.replaceWith(details);
        details.append(scroll);
      }
      document.getElementById("reportFilters")?.classList.add("canvas-filters");
    },
    mount,
    has: (topic) => ["students", "learning", "growth"].includes(topic),
    names,
    defaultState,
    state,
    cache,
    models,
    chartMap,
    load,
    render,
    toggleSchool,
    query,
    parse,
    color,
    schoolMarker,
    get renderMs() {
      return lastRenderMs;
    },
    async preparePresentation() {
      const previous = active;
      for (const d of dashboardConfig.dashboards) {
        const topic = d.id;
        active = topic;
        if (["students", "learning", "growth"].includes(topic)) {
          await mount(
            topic,
            new URLSearchParams(query(state[topic] ?? defaultState(topic))),
          );
        } else if (topic !== "home") {
          if (topic === "sponsorships") await Support.load();
          if (topic === "explore") {
            await loadExplorer();
            renderReport();
          }
          Dashboard.simple(
            topic,
            new URLSearchParams(query(state[topic] ?? defaultState(topic))),
          );
        }
      }
      active = previous;
      $("start").hidden = true;
    },
    getCanvas: (topic) => $("canvas-" + topic),
  };
})();
