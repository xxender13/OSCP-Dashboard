"use strict";
window.Dashboard = (() => {
  const originals = new Map();
  const searchMatch=(text,query)=>normalize(query).split(' ').filter(Boolean).every(word=>normalize(text).includes(word));
  const definition = (id) =>
    dashboardConfig.dashboards.find((d) => d.id === id);
  const year = () =>
    String(data.kpi_metrics.map[Object.keys(data.kpi_metrics.map)[0]].year);
  const fmtRate = (v) =>
    valid(v)
      ? v.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + "%"
      : "Not published";
  const levelNames = (ids) =>
    ids.map((id) => dashboardConfig.levels.find((l) => l.id === id));
  const levelChip = (level) =>
    `<span class="level ${level.colour}">${level.icon} ${esc(level.name)}</span>`;
  const levelKey = (full = false) =>
    `<div class="four-level-key${full ? " home-level-key" : ""}">${dashboardConfig.levels.map((l) => `<div>${levelChip(l)}${full ? `<p>${esc(l.meaning.replace("{schools}", data.schools.length).replace("{school_buildings}", data.directory.length))}</p>` : ""}</div>`).join("")}</div>`;
  const titleBar = (id) =>
    `<div class="canvas-title"><div><h2>${esc(definition(id).title ?? definition(id).nav_label)}</h2><p>${esc(definition(id).question)}</p></div></div>`;
  const actions = (id) =>
    `<div class="dashboard-actions" data-export-ignore>${["students", "learning", "growth"].includes(id) ? `<button data-sort-value="${id}" aria-pressed="${Analytics.state[id]?.sort === "value"}">Sort by value</button>` : ""}<button data-canvas-export="${id}">Export this view</button><button data-canvas-print="${id}">Print / PDF</button><span class="export-status" role="status"></span></div>`;
  function coverage(
    subject,
    s = { level: "schools", school: "all", group: "Total" },
  ) {
    const level = s.level === "school-buildings" ? "Building" : "Charter";
    let rows =
      (s.group && s.group !== "Total"
        ? Analytics.cache.get("learning")?.assessments
        : data.three_levels.map_rows) ?? [];
    rows = rows.filter(
      (r) =>
        r.level === level &&
        r.subject === subject &&
        (s.school === "all" || r.lea === s.school) &&
        matchesGroup(r, s.group ?? "Total"),
    );
    const units = (level === "Building" ? data.directory : data.schools).filter(
      (r) => s.school === "all" || (r.lea ?? r["DESE LEA"]) === s.school,
    );
    const reported = rows.filter((r) => valid(r.PA_PCT)),
      N = reported.reduce(
        (n, r) => n + (valid(r.REPORTABLE) ? r.REPORTABLE : 0),
        0,
      ),
      all = rows.reduce(
        (n, r) => n + (valid(r.REPORTABLE) ? r.REPORTABLE : 0),
        0,
      );
    return `${reported.length} of ${units.length} ${level === "Building" ? "school buildings" : "schools"} published${all > 0 ? " (about " + Math.round((100 * N) / all) + "% of tested students)" : ""}`;
  }
  function groupKey(r) {
    const category = r.category
      .replace(/^MSIP\s+/i, "")
      .replace(/\s/g, "")
      .toLowerCase();
    return category === "total" && r.group === "Total"
      ? "Total"
      : category + "::" + r.group;
  }
  function matchesGroup(r, key) {
    return groupKey(r) === (key ?? "Total");
  }
  function availableRows(topic, s, subject) {
    const source =
      Analytics.cache.get("learning")?.assessments ??
      data.three_levels.map_rows;
    return source.filter(
      (r) =>
        r.level === (s.level === "school-buildings" ? "Building" : "Charter") &&
        (s.school === "all" || r.lea === s.school) &&
        (!subject || r.subject === subject),
    );
  }
  function options(topic, id, s) {
    if (id === "city")
      return [
        { value: "all", label: "All cities" },
        ...Array.from(new Set(data.directory.map((b) => b.city)))
          .sort()
          .map((v) => ({ value: v, label: v })),
      ];
    if (id === "year")
      return Array.from(
        new Set(
          Analytics.cache.get("students")?.history.map((r) => r.year) ?? [],
        ),
      )
        .sort((a, b) => b - a)
        .map((v) => ({ value: String(v), label: String(v) }));
    if (id === "measure" && topic === "students")
      return Object.entries(Analytics.names)
        .filter(
          ([k]) =>
            [
              "enrollment",
              "black",
              "hispanic",
              "white",
              "multiracial",
              "frl",
              "el",
              "iep",
            ].includes(k) ||
            data.three_levels.demographics.some((r) =>
              r.race.some(
                (c) => c.label.toLowerCase().replace(/ /g, "_") === k,
              ),
            ),
        )
        .map(([v, label]) => ({ value: v, label }));
    if (id === "measure")
      return [
        { value: "both", label: "Reading and math" },
        { value: "reading", label: "Reading (ELA)" },
        { value: "math", label: "Math" },
      ].map((o) => ({
        ...o,
        disabled:
          topic === "learning" &&
          !availableRows(topic, s).some(
            (r) =>
              matchesGroup(r, s.group) &&
              (o.value === "both" ||
                r.subject ===
                  (o.value === "reading"
                    ? "Eng. Language Arts"
                    : "Mathematics")) &&
              valid(r.PA_PCT),
          ),
      }));
    if (id === "group") {
      const rows = availableRows(topic, s),
        allRows = availableRows(topic, { ...s, school: "all" }),
        keys = [...new Set(allRows.map(groupKey))].sort((a, b) =>
          a === "Total" ? -1 : b === "Total" ? 1 : a.localeCompare(b),
        );
      return keys.map((key) => ({
        value: key,
        label: key === "Total" ? "Total (all students)" : key.split("::")[1],
        disabled: !rows.some(
          (r) =>
            groupKey(r) === key &&
            valid(r.PA_PCT) &&
            (s.measure === "both" ||
              r.subject ===
                (s.measure === "math" ? "Mathematics" : "Eng. Language Arts")),
        ),
      }));
    }
    if (id === "grade") {
      const allRows = (Analytics.cache.get("learning")?.grades ?? []).filter(
          (r) =>
            r.level ===
            (s.level === "school-buildings" ? "Building" : "Charter"),
        ),
        rows = allRows.filter((r) => s.school === "all" || r.lea === s.school),
        grades = [...new Set(allRows.map((r) => r.grade))].sort(
          (a, b) => Number(a) - Number(b),
        );
      return grades.map((g) => ({
        value: g,
        label: g,
        disabled: !rows.some(
          (r) =>
            r.grade === g &&
            matchesGroup(r, s.group) &&
            valid(r.school_pct) &&
            (s.measure === "both" ||
              r.subject ===
                (s.measure === "math" ? "Mathematics" : "Eng. Language Arts")),
        ),
      }));
    }
    if (id === "program")
      return [
        { value: "all", label: "All program areas" },
        ...Object.entries({
          scholarships: "Scholarships",
          events: "Events",
          partnership_reach: "Partnerships",
          oscp_operations: "OSCP support",
        }).map(([value, label]) => ({ value, label })),
      ];
    if (id === "fiscal_year") {
      const years = [
        ...new Set(
          Object.values(data.programs)
            .flat()
            .map((r) => r.fiscal_year ?? r.award_year ?? r.reporting_period)
            .filter(Boolean),
        ),
      ];
      return years.length
        ? [
            { value: "all", label: "All available years" },
            ...years.map((v) => ({ value: v, label: v })),
          ]
        : [{ value: "all", label: "Not available", disabled: true }];
    }
    if (id === "status")
      return [{ value: "confirmed", label: "Confirmed items only" }];
    return [];
  }
  function filterBar(topic, s) {
    const fields = definition(topic)
      .filters.map((f) => {
        const help = `filter-${topic}-${f.id}-help`,
          attrs = `data-config-filter="${f.id}" aria-describedby="${help}" title="${esc(f.help)}"`,
          description = `<span class="filter-help sr-only" id="${help}">${esc(f.help)}</span>`;
        if (f.id === "level")
          return `<div class="filter-field level-filter" title="${esc(f.help)}"><span>${esc(f.label)}</span><div class="segmented" role="group" aria-label="${esc(f.label)}" ${attrs}><button type="button" data-canvas-level="schools" aria-pressed="${s.level === "schools"}">Schools</button><button type="button" data-canvas-level="school-buildings" aria-pressed="${s.level === "school-buildings"}">School buildings</button></div>${description}</div>`;
        if (
          f.id === "school" &&
          topic === "sponsorships" &&
          !Object.values(data.programs)
            .flat()
            .some((r) => r.school || r.school_id || r.school_ids)
        )
          return `<label class="filter-field">${esc(f.label)}<input type="text" name="school" data-config-filter="school" value="Not available" disabled title="Not available: no confirmed school-linked program data">${description}</label>`;
        if (f.id === "school")
          return `<label class="filter-field">${esc(f.label)}<input type="search" name="school" class="school-filter" ${attrs} list="schools-${topic}" value="${s.school === "all" ? "All schools" : esc(school(s.school).School)}"><datalist id="schools-${topic}"><option value="All schools"></option>${data.schools.map((r) => `<option value="${esc(r.School)}"></option>`).join("")}</datalist>${description}</label>`;
        if (f.id === "reference")
          return `<label class="filter-field">${esc(f.label)}<span class="reference-control"><input type="checkbox" name="reference" ${attrs}${s.reference ? " checked" : ""}>Missouri comparison</span>${description}</label>`;
        if (f.id === "search")
          return `<label class="filter-field">${esc(f.label)}<input name="search" type="search" ${attrs} value="${esc(s.search ?? "")}">${description}</label>`;
        const choices = options(topic, f.id, s);
        return `<label class="filter-field">${esc(f.label)}<select name="${f.id}" ${attrs}${choices.length === 1 && choices[0].disabled ? " disabled" : ""}>${choices.map((o) => `<option value="${esc(o.value)}"${String(s[f.id]) === String(o.value) ? " selected" : ""}${o.disabled ? ' disabled title="Not published"' : ""}>${esc(o.label)}</option>`).join("")}</select>${description}</label>`;
      })
      .join("");
    const defaults = Analytics.defaultState(topic),
      active = definition(topic)
        .filters.filter(
          (f) =>
            f.id !== "status" &&
            String(s[f.id] ?? "") !== String(defaults[f.id] ?? ""),
        )
        .map(
          (f) =>
            `<button type="button" data-remove-filter="${f.id}">${esc(f.label)}: ${esc(f.id === "school" ? (school(s.school)?.School ?? "All schools") : f.id === "reference" ? "hidden" : f.id === "level" ? (s.level === "schools" ? "Schools" : "School buildings") : (options(topic, f.id, s).find((o) => String(o.value) === String(s[f.id]))?.label ?? s[f.id]))} ×</button>`,
        )
        .join("");
    return `<div class="filter-dock"><form class="canvas-filters" data-canvas-filters="${topic}"${["schools", "sponsorships"].includes(topic) ? " data-simple-filters" : ""}>${fields}<div class="filter-reset"><button type="reset">Reset</button></div></form><div class="active-filters" aria-label="Active filters">${active}</div></div><p class="active-level">Active level: ${topic === "sponsorships" ? levelChip(dashboardConfig.levels.find((l) => l.id === "oscp")) : tag(s.level === "school-buildings" ? "Building" : "School")}</p>`;
  }
  function home() {
    const k = data.kpi_metrics,
      subjects = Object.keys(k.map),
      d = data.three_levels,
      level = (id) => dashboardConfig.levels.find((l) => l.id === id),
      yearEnrollment = k.students.year;
    const tile = (
      id,
      icon,
      title,
      value,
      detail,
      scope,
      route,
      coverageText = "",
    ) =>
      `<a class="home-kpi" data-home-tile="${id}" href="#${route}"><span class="tile-title">${icon} ${title}</span><strong>${value}</strong><span>${esc(detail)}</span>${coverageText ? `<span class="map-coverage">${esc(coverageText)}</span>` : ""}<span>${levelChip(level(scope))} <span class="year-chip">${esc(id === "schools" ? data.directory[0].as_of : id === "enrollment" ? yearEnrollment : k.frl.year)}</span></span><span class="open-dashboard">Open dashboard →</span></a>`;
    const pair = (a, la, b, lb) =>
      `<span class="pair-value"><span>${a}<small>${la}</small></span><span>${b}<small>${lb}</small></span></span>`;
    const mapCoverage = subjects.map((s) => coverage(s)),
      coverageText = mapCoverage.every((v) => v === mapCoverage[0])
        ? mapCoverage[0]
        : subjects.map((s, i) => s + ": " + mapCoverage[i]).join("; ");
    const rows = data.schools.map((s) => [
      link(s["DESE LEA"]),
      esc(d.profiles.find((p) => p.lea === s["DESE LEA"]).city),
      s["DESE buildings"],
      fmt(s["2025–26 K–12"]),
      fmtRate(s["FRL %"]),
      fmtRate(s["MAP ELA P+A %"]),
      fmtRate(s["MAP Math P+A %"]),
    ]);
    const stateEnrollment = data.official_state_context?.enrollment ?? {};
    rows.push([
      "Missouri",
      "Statewide",
      "Not available",
      fmt(stateEnrollment.value),
      fmtRate(data.benchmarks.frl.value),
      fmtRate(stateMap(subjects[0])),
      fmtRate(stateMap(subjects[1])),
    ]);
    return shell(
      "home",
      "",
      [],
      `<div class="home-page dashboard-frame" id="canvas-home" data-canvas="home"><p id="home-intro" class="home-intro">${esc(dashboardConfig.intro)}</p><section class="home-guide" aria-labelledby="guide-title"><h2 id="guide-title">How to read this dashboard</h2>${levelKey(true)}<p class="gap-mini-key">${Object.entries(
        dashboardConfig.gap_labels,
      )
        .map(([label, meaning]) => `<b>${label}</b> = ${esc(meaning)}`)
        .join(
          " · ",
        )}</p><p>Each chart shows its level and year in the top-right chips.</p></section><div class="home-kpis">${tile("enrollment", "♧", "Students enrolled", fmt(k.students.value), `${fmt(k.students.value)} K–12 students; ${yearEnrollment}`, "schools", "students")}${tile("schools", "▦", "Schools and school buildings", pair(data.schools.length, "schools", data.directory.length, "school buildings"), `${data.directory.length} school buildings at ${data.directory_summary.distinct_normalized_street_addresses} street addresses`, "school-buildings", "schools")}${tile("lunch", "◉", "Free or reduced-price lunch", fmtRate(k.frl.value), `${fmt(k.frl.numerator)} of ${fmt(k.frl.denominator)} students; ${k.frl.year}`, "schools", "students?measure=frl")}${tile("black", "●", "Student demographics", fmtRate(k.demographics.value), `${fmt(k.demographics.numerator)} of ${fmt(k.demographics.denominator)} Black students; ${k.demographics.year} · see all groups`, "schools", "students?measure=black")}${tile("map", "▤", "Reading and math (MAP)", pair(fmtRate(k.map[subjects[0]].value), "ELA", fmtRate(k.map[subjects[1]].value), "Math"), `${fmt(k.map[subjects[0]].numerator)} of ${fmt(k.map[subjects[0]].denominator)} ELA; ${fmt(k.map[subjects[1]].numerator)} of ${fmt(k.map[subjects[1]].denominator)} math; ${k.map[subjects[0]].year}`, "schools", "learning", coverageText)}${tile("growth", "↗", "Academic growth", pair(`${k.growth[subjects[0]].numerator} of ${k.growth[subjects[0]].denominator}`, "ELA", `${k.growth[subjects[1]].numerator} of ${k.growth[subjects[1]].denominator}`, "Math"), `School buildings meeting Missouri’s growth Target; ${year()}`, "school-buildings", "growth")}</div><section id="home-scorecard" class="home-scorecard"><div class="section-heading"><h2>School scorecard</h2><span>${tag("School")} ${tag("Missouri")} <span class="year-chip">${esc(yearEnrollment)} / ${year()}</span></span></div><p class="map-coverage" data-pooled-coverage>${esc(coverageText)}</p><p class="table-context">Missouri is separate; its enrollment and lunch figures are ${esc(data.benchmarks.frl.year)}.</p>${table(["School", "City", "School buildings", "Students enrolled", "Lunch %", "MAP ELA %", "MAP math %"], rows)}<p class="scroll-hint">Scroll the table sideways on a small screen.</p></section><section id="dashboard-directory"><h2>Dashboard directory</h2><div class="dashboard-directory">${dashboardConfig.dashboards
        .filter((v) => v.id !== "home")
        .map(
          (v) =>
            `<article><h3>${v.nav_label}</h3><p>${esc(v.question)}</p><div>${levelNames(v.levels).map(levelChip).join(" ")}</div><p class="directory-filters">Filters: ${v.filters.map((f) => f.label).join(" · ") || "None"}</p><a href="#${v.id}">Open →</a></article>`,
        )
        .join(
          "",
        )}</div></section><p class="home-caption">Figures describe sponsored schools and their reported results. They do not show that SLU sponsorship caused them.</p></div>`,
    );
  }
  function simple(topic, params) {
    if (topic === "sponsorships") return Support.render(params);
    if (topic === "home") return;
    const host = $("panel-" + topic),
      s = Analytics.parse(topic, params);
    if (
      topic === "schools" &&
      s.city !== "all" &&
      !data.directory.some((r) => r.city === s.city)
    )
      s.city = "all";
    if (
      topic === "sponsorships" &&
      s.program !== "all" &&
      !Object.keys(data.programs).includes(s.program)
    )
      s.program = "all";
    Analytics.state[topic] = s;
    if (!originals.has(topic)) {
      const holder = document.createElement("div");
      holder.innerHTML = host.innerHTML;
      [...holder.children]
        .filter((n) => n.matches("h2,.intro,.jump-chips,.breadcrumb"))
        .forEach((n) => n.remove());
      holder.querySelector("#directoryFilters")?.remove();
      if (topic === "schools")
        holder.insertAdjacentHTML(
          "beforeend",
          card(
            "cities",
            "Kansas City and St. Louis",
            table(
              ["City", "Schools", "School buildings", "K–12 students"],
              data.three_levels.cities.map((c) => [
                c.city,
                c.schools,
                c.buildings,
                fmt(c.enrollment),
              ]),
            ),
            "School",
            data.kpi_metrics.students.year,
          ),
        );
      originals.set(topic, holder.innerHTML);
    }
    if (topic === "explore" && host.querySelector(".standard-frame")) return;
    const content =
      topic === "explore"
        ? (host.querySelector("#reportHost")?.closest(".simple-content")
            ?.innerHTML ?? originals.get(topic))
        : originals.get(topic);
    host.innerHTML = `<div class="analytic-canvas dashboard-frame standard-frame" id="canvas-${topic}" data-canvas="${topic}">${titleBar(topic)}${levelKey()}${definition(topic).filters.length && topic !== "explore" ? filterBar(topic, s) : ""}<div class="simple-content">${content}</div><div class="definitions-band"><p>${topic === "sponsorships" ? "Only confirmed items appear. Each program area stays separate." : topic === "schools" ? "A school can run more than one school building. Shared street addresses do not add students." : topic === "explore" ? "Use one report at a time. Keep level, year and population together." : "Read each measure with its source year and reporting population."}</p><details><summary>How to read this</summary><p>${Object.entries(
      dashboardConfig.gap_labels,
    )
      .map(([l, m]) => l + ": " + m + ".")
      .join(" ")}</p></details></div>${actions(topic)}</div>`;
    if (topic === "schools") applySchools(s);
    if (topic === "sponsorships") {
      const programIds = {
        scholarships: "scholarships",
        events: "events",
        partnership_reach: "reach",
        oscp_operations: "support",
      };
      for (const [key, id] of Object.entries(programIds))
        $(id).hidden = s.program !== "all" && s.program !== key;
    }
    if (topic === "explore") renderReport();
    if (topic === "about") {
      const glossary = host.querySelector("#glossary dl");
      if (glossary)
        glossary.insertAdjacentHTML(
          "beforeend",
          "<dt>DESE</dt><dd>Missouri Department of Elementary and Secondary Education.</dd><dt>APR</dt><dd>Annual Performance Report.</dd><dt>FRL</dt><dd>Free or reduced-price lunch eligibility.</dd><dt>EL</dt><dd>English learners.</dd><dt>PK</dt><dd>Preschool.</dd><dt>Participation instances</dt><dd>Provisional reported activity participation, potentially counting the same person more than once. Separate from enrollment.</dd><dt>Unique students served</dt><dd>Unduplicated individuals; not available for community activities.</dd>",
        );
    }
    decorateCards(host);
    observeFrame(host.querySelector("[data-canvas]"));
    const form = host.querySelector("[data-simple-filters]");
    if (form) {
      form.onsubmit = (e) => e.preventDefault();
      form.onreset = (e) => {
        e.preventDefault();
        navigate(topic, Analytics.defaultState(topic));
      };
      form.onchange = (e) => {
        const input = e.target;
        let value = input.value;
        if (input.name === "school") {
          const match = data.schools.find((r) =>
            normalize(r.School).includes(normalize(value)),
          );
          value =
            (!normalize(value) || normalize(value) === "all schools")
              ? "all"
              : (match?.["DESE LEA"] ?? "all");
        }
        navigate(topic, { ...s, [input.name]: value });
      };
    }
  }
  function applySchools(s) {
    const selected = data.schools.filter(
        (r) =>
          (s.school === "all" || r["DESE LEA"] === s.school) &&
          data.directory.some(
            (b) =>
              b.lea === r["DESE LEA"] &&
              (s.city === "all" || b.city === s.city) &&
              (!s.search ||
                searchMatch(b.name+' '+r.School,s.search)),
          ),
      ),
      ids = new Set(selected.map((r) => r["DESE LEA"]));
    document
      .querySelectorAll("#schoolProfiles .card,#profiles .card")
      .forEach(
        (n) =>
          (n.hidden =
            !ids.has(n.id.replace("profile-", "")) ||
            s.level === "school-buildings"),
      );
    const directory = data.directory.filter(
      (b) =>
        ids.has(b.lea) &&
        (s.city === "all" || s.city === b.city) &&
        (!s.search ||
          searchMatch(b.name+' '+school(b.lea).School,s.search)),
    );
    $("directoryTable").innerHTML = directory.length
      ? table(
          ["School", "School building", "Grades", "Address"],
          directory.map((b) => [
            link(b.lea),
            `<a id="school-building-${b.lea}-${b.building}" href="#schools/school-building-${b.lea}-${b.building}">${esc(b.name)}</a>`,
            esc(b.grades),
            esc(b.street + ", " + b.city),
          ]),
        )
      : "<p>No published results for this selection</p>";
    const cities = data.three_levels.cities
      .filter((c) => s.city === "all" || c.city === s.city)
      .map((c) => {
        const schools = selected.filter(
          (v) =>
            data.three_levels.profiles.find((p) => p.lea === v["DESE LEA"])
              .city === c.city,
        );
        return [
          c.city,
          schools.length,
          directory.filter((b) => b.city === c.city).length,
          fmt(schools.reduce((n, v) => n + v["2025–26 K–12"], 0)),
        ];
      });
    const cityCard = $("cities");
    if (cityCard)
      cityCard.querySelector(".scroll").outerHTML = table(
        ["City", "Schools", "School buildings", "K–12 students"],
        cities,
      );
  }
  function decorateCards(host) {
    host.querySelectorAll(".card").forEach((el) => {
      if (el.closest("#reportOutput")) return;
      el.classList.add("static-panel");
      const head = el.querySelector(".card-heading");
      if (!head) return;
      head.classList.add("panel-title");
      const cap = el.querySelector(".caption:last-of-type");
      if (cap) {
        const meta = document.createElement("span");
        meta.innerHTML =
          (cap.querySelector(".level")?.outerHTML ?? "") +
          ` <span class="year-chip">${esc(cap.textContent.match(/20\d{2}(?:[–-]\d{2,4})?/)?.[0] ?? year())}</span>`;
        head.append(meta);
      }
      const exports = head.querySelector(".exports");
      if (exports) {
        const menu = document.createElement("details");
        menu.className = "panel-menu";
        menu.innerHTML =
          '<summary aria-label="Panel options">⋯</summary><div></div>';
        menu.lastElementChild.append(...exports.children);
        const existingTable = el.querySelector("table");
        if (existingTable)
          menu.lastElementChild.insertAdjacentHTML(
            "beforeend",
            `<button data-scroll-table="${el.id}">View as table</button>`,
          );
        else {
          const dl = el.querySelector("dl");
          const rows = dl
            ? [...dl.querySelectorAll("dt")].map((dt) => [
                esc(dt.textContent),
                esc(dt.nextElementSibling?.textContent),
              ])
            : [...el.querySelectorAll("p")].map((p) => [
                esc(head.querySelector("h3").textContent),
                esc(p.textContent),
              ]);
          el.insertAdjacentHTML(
            "beforeend",
            `<details class="panel-table" id="${el.id}-table"><summary>View as table</summary>${table(["Item", "Description"], rows)}</details>`,
          );
          menu.lastElementChild.insertAdjacentHTML(
            "beforeend",
            `<button data-panel-table="${el.id}">View as table</button>`,
          );
        }
        exports.replaceWith(menu);
      }
      el.querySelectorAll(".scroll").forEach((scroll) =>
        scroll.insertAdjacentHTML(
          "afterend",
          '<p class="scroll-hint">Scroll the table sideways on a small screen.</p>',
        ),
      );
    });
  }
  function navigate(topic, s) {
    location.hash = topic + "?" + Analytics.query(s);
  }
  function explorerControls(report, s = {}) {
    const config = definition("explore").filters,
      field = (id) => config.find((f) => f.id === id),
      entry = (value, label, disabled = false) => ({
        value: String(value),
        label,
        disabled,
      });
    function selectField(id, name, entries, label = null) {
      const f = field(id);
      return `<label class="filter-field">${label ?? f.label}<select name="${name}" data-config-filter="${id}" title="${esc(f.help)}" aria-label="${label ?? f.label}">${entries.map((o) => `<option value="${esc(o.value)}"${o.disabled ? ' disabled title="Not published"' : ""}${String(s[name]) === o.value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>`;
    }
    const schoolOptions = [
        entry("all", "All schools"),
        ...data.schools.map((r) => entry(r["DESE LEA"], r.School)),
      ],
      levels = [
        entry("School", "Schools"),
        entry("Building", "School buildings"),
      ];
    let result =
      selectField("school", "school", schoolOptions) +
      selectField("level", "level", levels);
    const subjects = [...new Set(packets.assessments.map((r) => r.subject))],
      all = packets.assessments.filter(
        (r) => r.level === (s.level === "Building" ? "Building" : "Charter"),
      );
    if (["map", "grades", "growth"].includes(report))
      result += selectField(
        "subject",
        "subject",
        (report === "growth"
          ? Object.keys(data.kpi_metrics.growth)
          : subjects
        ).map((v) => entry(v, v)),
      );
    if (["map", "grades"].includes(report)) {
      const scoped = all.filter(
          (r) =>
            (s.school === "all" || !s.school || r.lea === s.school) &&
            r.subject === (s.subject ?? subjects[0]),
        ),
        keys = [...new Set(all.map(groupKey))].sort((a, b) =>
          a === "Total" ? -1 : b === "Total" ? 1 : a.localeCompare(b),
        );
      result += selectField(
        "group",
        "group",
        keys.map((k) =>
          entry(
            k,
            k === "Total" ? "Total (all students)" : k.split("::")[1],
            !scoped.some(
              (r) => groupKey(r) === k && valid(r[s.measure ?? "PA_PCT"]),
            ),
          ),
        ),
      );
      if (report === "map")
        result += `<label class="filter-field">${field("assessment_measure").label}<select name="measure" data-config-filter="assessment_measure" title="${esc(field("assessment_measure").help)}">${Object.entries(
          assessmentMetrics,
        )
          .map(
            ([v, l]) =>
              `<option value="${v}"${s.measure === v ? " selected" : ""}>${l}</option>`,
          )
          .join("")}</select></label>`;
      if (report === "grades")
        result += selectField("grade", "grade", [
          entry("all", "All grades"),
          ...Array.from(
            new Set(packets.matched_map.grade_slices.map((r) => r.grade)),
          )
            .sort((a, b) => Number(a) - Number(b))
            .map((g) => entry(g, g)),
        ]);
    }
    if (["history", "groups"].includes(report)) {
      const years = packets.demographics_explorer.years,
        metrics = packets.demographics_explorer.metrics;
      result += selectField(
        "metric",
        "metric",
        Object.entries(metrics).map(([v, m]) => entry(v, m.label)),
      );
      result += `<fieldset class="filter-field year-range" data-config-filter="year_range" title="${esc(field("year_range").help)}"><legend>Year range</legend><div><label>From<select name="year_start">${years.map((y) => `<option${String(s.year_start ?? (report === "groups" ? Math.max(...years) : Math.min(...years))) === String(y) ? " selected" : ""}>${y}</option>`).join("")}</select></label><label>To<select name="year_end">${years.map((y) => `<option${String(s.year_end ?? Math.max(...years)) === String(y) ? " selected" : ""}>${y}</option>`).join("")}</select></label></div></fieldset>`;
    }
    if (report === "directory")
      result += selectField("city", "city", options("schools", "city", s));
    return (
      result +
      '<div class="filter-reset"><button type="reset">Reset</button><button type="button" data-csv="detail-report">Download CSV</button></div>'
    );
  }
  function observeFrame(frame) {
    if (!frame) return;
    frame.querySelectorAll(".school-filter").forEach((input) => {
      const match = data.schools.find((s) => s.School === input.value);
      if (match) {
        input.title = match.School + " — Type a name with or without accents.";
        if (match.School.length > 18)
          input.value = match.School.split(" ").slice(0, 2).join(" ") + "…";
      }
    });
    const dock = frame.querySelector(".filter-dock"),
      grid = frame.querySelector(".analytic-grid,.simple-content");
    if (dock && grid) {
      new ResizeObserver((entries) =>
        frame.style.setProperty(
          "--filter-h",
          Math.ceil(entries[0].contentRect.height) + "px",
        ),
      ).observe(dock);
      const observer = new IntersectionObserver(
        (entries) =>
          frame.classList.toggle("grid-in-view", entries[0].isIntersecting),
        { rootMargin: "-64px 0px 0px 0px" },
      );
      observer.observe(grid);
    }
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort-value]");
    if (button) {
      const topic = button.dataset.sortValue;
      const s = Analytics.state[topic];
      navigate(topic, { ...s, sort: s.sort === "value" ? "name" : "value" });
    }
    const table = event.target.closest("[data-scroll-table]");
    if (table) {
      const scroll = $(table.dataset.scrollTable).querySelector(".scroll");
      scroll?.focus();
    }
  });
  return {
    definition,
    levelKey,
    titleBar,
    actions,
    filterBar,
    home,
    simple,
    coverage,
    groupKey,
    matchesGroup,
    options,
    observeFrame,
    fmtRate,
    explorerControls,
  };
})();
