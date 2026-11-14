"use strict";
window.Support = (() => {
  let packet, loading;
  const charts = new Map(),
    observers = [];
  const types = {
    student_event: "Reported student events",
    estimated_event: "Estimated student range",
    general_attendees: "General attendees",
    program_enrollment: "Program enrollment",
    planned: "Planned students",
  };
  const defaults = {
    fiscal_year: "all",
    organization: "all",
    status: "all",
    engagement_status: "all",
    category: "all",
    participation_type: "all",
    size: "all",
    search: "",
  };
  let selected = { ...defaults };
  const number = (v) =>
    v == null ? "Not available" : v.toLocaleString("en-US");
  const money = (v) =>
    v == null
      ? "Not available"
      : v.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        });
  const count = (r) =>
    r.participants_min == null
      ? "Not available"
      : r.participants_min === r.participants_max
        ? number(r.participants_min)
        : `${number(r.participants_min)}\u2013${number(r.participants_max)}`;
  const date = (r) =>
    r.start_date
      ? r.start_date + (r.end_date ? " to " + r.end_date : "")
      : "Date not provided";
  const meta = (year) =>
    `<span class="support-meta"><span class="level gold">&#9670; OSCP sponsorships and programs</span><span class="year-chip">${esc(year)}</span></span>`;
  const unique = (rows, key) =>
    [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
  function filterOptions(id) {
    const s = packet.sponsorships.rows,
      e = packet.engagement.rows;
    return (
      {
        fiscal_year: unique(s, "fiscal_year"),
        organization: unique(s, "organization"),
        status: unique(s, "status"),
        engagement_status: unique(e, "status"),
        category: unique(e, "category"),
        participation_type: Object.keys(types),
        size: ["all", "small"],
      }[id] ?? []
    );
  }
  function filters() {
    return `<form class="support-filters canvas-filters" data-support-filters>${Dashboard.definition(
      "sponsorships",
    )
      .filters.map((f) => {
        const opts = filterOptions(f.id),
          disabled = f.id === "fiscal_year" && !opts.length;
        const control =
          f.id === "search"
            ? `<input name="search" type="search" value="${esc(selected.search)}" placeholder="Activity or organization">`
            : `<select name="${f.id}" ${disabled ? 'disabled title="No explicit fiscal year in the source"' : ""}>${f.id !== "size" ? `<option value="all">${disabled ? "Not available" : "All"}</option>` : ""}${opts.map((o) => `<option value="${esc(o)}" ${selected[f.id] === o ? "selected" : ""}>${esc(f.id === "size" ? (o === "small" ? "Up to 1,000" : "All activities") : (types[o] ?? o))}</option>`).join("")}</select>`;
        return `<label class="filter-field" data-config-filter="${f.id}" title="${esc(f.help)}"><span>${esc(f.label)}</span>${control}</label>`;
      })
      .join(
        "",
      )}<button type="reset">Reset filters</button></form><p class="support-filter-note">Fiscal year, organization and request status filter sponsorship entries. Activity status, category, count type and size filter engagement. Search applies to both.</p><div class="active-filters">${Object.entries(
      selected,
    )
      .filter(([k, v]) => v !== defaults[k])
      .map(
        ([k, v]) =>
          `<button data-support-clear="${k}">${esc(Dashboard.definition("sponsorships").filters.find((f) => f.id === k).label)}: ${esc(types[v] ?? v)} &#215;</button>`,
      )
      .join("")}</div>`;
  }
  function filtered() {
    const q = normalize(selected.search).split(/\s+/).filter(Boolean),
      match = (r) =>
        q.every((w) =>
          normalize(
            [r.organization, r.activity, r.notes].filter(Boolean).join(" "),
          ).includes(w),
        );
    return {
      sponsorships: packet.sponsorships.rows.filter(
        (r) =>
          match(r) &&
          ["fiscal_year", "organization", "status"].every(
            (k) => selected[k] === "all" || r[k] === selected[k],
          ),
      ),
      engagement: packet.engagement.rows.filter(
        (r) =>
          match(r) &&
          (selected.engagement_status === "all" ||
            r.status === selected.engagement_status) &&
          ["category", "participation_type"].every(
            (k) => selected[k] === "all" || r[k] === selected[k],
          ) &&
          (selected.size !== "small" ||
            (r.participants_max != null && r.participants_max <= 1000)),
      ),
    };
  }
  const tile = (id, label, value, note, year) =>
    `<article class="mini-kpi" id="${id}"><span>${esc(label)}</span><strong>${value}</strong><small>${esc(note)}</small>${meta(year)}</article>`;
  function table(headers, rows) {
    if (!rows.length)
      return '<p class="support-empty">No entries match these filters.</p>';
    return `<div class="scroll" tabindex="0" aria-label="Scrollable data table"><table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c ?? "Not available")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function panel(id, title, content, summary, year = "2026", extra = "") {
    return `<article class="support-panel ${extra}" id="${id}" tabindex="-1"><div class="panel-title"><h3>${esc(title)}</h3>${meta(year)}<details class="panel-menu"><summary aria-label="Panel actions">&#8943;</summary><div><button data-support-png="${id}">Download PNG</button><button data-support-csv="${id}">Download CSV</button><button data-support-table="${id}">View as table</button></div></details></div><p class="chart-summary">${esc(summary)}</p>${content}<p class="panel-caption">${esc(year)} · Source: ${year === "2026" ? "OSCP staff-reported activity notes; provisional counts" : "OSCP sponsorship workbook; requests are not payments"}.</p></article>`;
  }
  function graph(id, title, labels, values, summary, year, colors = null) {
    const rows = labels.map((label, i) => [
      label,
      Array.isArray(values[i]) ? values[i].join("\u2013") : values[i],
    ]);
    return panel(
      id,
      title,
      values.length
        ? `<div class="support-plot analytic-plot" tabindex="0" aria-label="Scrollable chart; scroll vertically for all labels"><div class="support-chart-surface" style="height:${Math.max(150, labels.length * 24 + 50)}px"><canvas id="support-chart-${id}" role="img" aria-label="${esc(title)}"></canvas></div></div><details class="support-data-table"><summary>View as table</summary>${table(["Activity / organization", "Count / requested dollars"], rows)}</details>`
        : '<p class="support-empty">No published results for this selection.</p>',
      summary,
      year,
    );
  }
  const sum = (rows) => rows.reduce((n, r) => n + (r.requested_amount ?? 0), 0);
  function render(params = new URLSearchParams()) {
    if (!packet) return;
    for (const c of charts.values()) c.destroy();
    charts.clear();
    for (const o of observers) o.disconnect();
    observers.length = 0;
    selected = { ...defaults };
    for (const [k, v] of params)
      if (
        k in defaults &&
        (k === "search" || v === "all" || filterOptions(k).includes(v))
      )
        selected[k] = v;
    const rows = filtered(),
      s = rows.sponsorships,
      e = rows.engagement;
    const eligible = e.filter(
      (r) =>
        r.participation_type === "student_event" &&
        r.status === "Reported" &&
        r.participants_min != null &&
        r.participants_min === r.participants_max,
    );
    const instances = eligible.reduce((n, r) => n + r.participants_min, 0),
      numeric = e.filter((r) => r.participants_min != null).length;
    const orgs = unique(s, "organization"),
      status = unique(s, "status"),
      cats = unique(e, "category");
    const numericEvents = e
      .filter((r) => r.participants_min != null)
      .sort((a, b) => b.participants_max - a.participants_max);
    const sorted = e
      .slice()
      .sort((a, b) =>
        (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999"),
      );
    const sTable = table(
      [
        "Entry ID",
        "Organization",
        "Activity",
        "Event date",
        "Requested amount",
        "Approved amount",
        "Request status",
        "Fiscal year",
        "Source worksheet / row",
        "Source",
      ],
      s.map((r) => [
        r.id,
        r.organization,
        r.activity,
        r.date,
        money(r.requested_amount),
        money(r.approved_amount),
        r.status,
        r.fiscal_year,
        r.source_rows.map((o) => o.worksheet + " / " + o.row).join("; "),
        r.source,
      ]),
    );
    const eTable = table(
      [
        "Activity ID",
        "Activity",
        "Date",
        "Organization",
        "Participation",
        "Count type",
        "Category",
        "Status",
        "Notes",
        "Location",
        "Count verification",
        "Source",
        "Missing information",
      ],
      sorted.map((r) => [
        r.id,
        r.activity,
        date(r),
        r.organization,
        count(r),
        types[r.participation_type],
        r.category,
        r.status,
        r.notes,
        r.location,
        r.count_verification,
        r.source,
        r.missing_reason,
      ]),
    );
    const months = [
      ...new Set(sorted.map((r) => r.start_date?.slice(0, 7) ?? "Undated")),
    ];
    const printTimeline = `<div class="support-print-timeline"><p>Activities by month; full activity names and notes are available in CSV.</p>${table(
      ["Month / date context", "Reported activities", "Planned activities"],
      months.map((month) => {
        const m = sorted.filter(
          (r) => (r.start_date?.slice(0, 7) ?? "Undated") === month,
        );
        return [
          month,
          m.filter((r) => r.status === "Reported").length,
          m.filter((r) => r.status === "Planned").length,
        ];
      }),
    )}</div>`;
    const timeline = `${printTimeline}<div class="support-timeline">${sorted.length ? sorted.map((r) => `<div class="support-timeline-item ${r.status === "Planned" ? "is-planned" : ""}"><time>${esc(date(r))}</time><strong>${esc(r.activity)}</strong><span>${esc(r.organization ?? "Organization not specified")} · ${esc(count(r))} · ${esc(r.status)}</span><small>${esc(types[r.participation_type])}${r.participation_type === "program_enrollment" ? "; date is contextual, not attendance" : ""}</small></div>`).join("") : '<p class="support-empty">No activities match these filters.</p>'}</div><details class="support-data-table"><summary>View timeline as table</summary>${table(
      ["Activity", "Date", "Organization", "Participation", "Status"],
      sorted.map((r) => [
        r.activity,
        date(r),
        r.organization,
        count(r),
        r.status,
      ]),
    )}</details>`;
    const d = Dashboard.definition("sponsorships");
    document.getElementById("panel-sponsorships").innerHTML =
      `<div class="analytic-canvas dashboard-frame support-frame" id="canvas-sponsorships" data-canvas="sponsorships">${Dashboard.titleBar("sponsorships")}${Dashboard.levelKey()}<nav class="support-jumps" aria-label="Support sections"><a href="#sponsorships/support-heading">Sponsorship entries</a><a href="#sponsorships/engagement-heading">Community engagement</a></nav>${filters()}<div class="support-body"><section class="support-section" aria-labelledby="support-heading"><h3 id="support-heading" tabindex="-1">Sponsorships &amp; Community Support</h3><p>Recorded requests and entries, not verified sponsorships or payments. Repeated worksheet entries count once. Blank decisions remain Unknown.</p><div class="kpi-strip">${tile("support-entries", "Distinct sponsorship entries", number(s.length), "Includes entries without a named event or amount.", "Fiscal year not available")}${tile("support-requested", "Requested dollars", s.some((r) => r.requested_amount != null) ? money(sum(s)) : "Not available", `${s.filter((r) => r.requested_amount != null).length} entries have amounts; never actual payments.`, "Fiscal year not available")}${tile("support-approvals", "Verified approvals / paid funding", "Not available", "No usable approval or payment fields in this source.", "Fiscal year not available")}</div><div class="support-grid">${graph(
        "support-organizations",
        "Requested dollars by organization",
        orgs.filter((o) =>
          s.some((r) => r.organization === o && r.requested_amount != null),
        ),
        orgs
          .filter((o) =>
            s.some((r) => r.organization === o && r.requested_amount != null),
          )
          .map((o) => sum(s.filter((r) => r.organization === o))),
        "Only entries with requested amounts appear; missing amounts are not zero.",
        "Fiscal year not available",
      )}${graph(
        "support-status",
        "Decision status of sponsorship entries",
        status,
        status.map((v) => s.filter((r) => r.status === v).length),
        "Unknown is a missing decision, not approval.",
        "Fiscal year not available",
      )}</div>${panel("support-details", "Sponsorship entry details", `<p class="scroll-hint">Scroll the table sideways for source rows and amount fields.</p><details open class="support-data-table"><summary>Searchable sponsorship entries (${s.length})</summary>${sTable}</details>`, "The fiscal-year field is blank. FY worksheet membership is shown only as source provenance.", "Fiscal year not available", "support-detail-panel")}</section><section class="support-section" aria-labelledby="engagement-heading"><h3 id="engagement-heading" tabindex="-1">Community Engagement &amp; Student Participation</h3><p>Provisional staff-reported figures, not independently verified attendance. Participation instances can count a student more than once; unique students served are unavailable. Never add these figures to the separate ${number(data.kpi_metrics.students.value)} enrolled students.</p><div class="kpi-strip">${tile("engagement-activities", "Activities", number(e.length), `${numeric} have numeric counts, including plans and programs.`, "2026")}${tile("engagement-numeric", "Reported activities with numeric counts", number(e.filter((r) => r.status === "Reported" && r.participants_min != null).length), "Includes estimates, general attendees and programs; excludes plans.", "2026")}${tile("engagement-instances", "Reported event participation instances", eligible.length ? number(instances) : "Not available", `${eligible.length} exact-count student activities; excludes estimates, general attendees, programs and plans.`, "2026")}${tile("engagement-planned", "Planned activities", number(e.filter((r) => r.status === "Planned").length), "Dates passing does not confirm attendance.", "2026")}${tile("engagement-programs", "Ongoing programs", number(e.filter((r) => r.participation_type === "program_enrollment").length), "Program enrollment is separate from event attendance.", "2026")}</div><div class="support-grid">${panel("engagement-timeline", "2026 engagement timeline", timeline, "Reported and planned activities stay distinct. Undated activities appear last; dates do not verify occurrence.")}${graph(
        "engagement-participation",
        "Participation by activity",
        numericEvents.map((r) => r.activity),
        numericEvents.map((r) =>
          r.participants_min === r.participants_max
            ? r.participants_min
            : [r.participants_min, r.participants_max],
        ),
        "Ranges retain both endpoints. Blue: student events; teal: estimates; grey: attendees; purple: programs; gold: planned. Use Activity size for smaller events.",
        "2026",
      )}${graph(
        "engagement-categories",
        "Activities by category",
        cats,
        cats.map((c) => e.filter((r) => r.category === c).length),
        "Counts of activities, not students. Categories are derived from activity names and notes.",
        "2026",
      )}${panel("engagement-details", "Activity details", `<p class="scroll-hint">Scroll sideways for notes, sources and missing information.</p><details open class="support-data-table"><summary>Searchable activity details (${e.length})</summary>${eTable}</details>`, "Filters apply to these rows and CSV exports. Estimated counts stay ranges; future plans stay planned.", "2026", "support-detail-panel")}</div></section></div><div class="definitions-band"><p>Enrollment counts students in sponsored schools. Participation instances count eligible reported activity participation, with possible repeats. Unique students served are not available.</p><details><summary>How totals are defined</summary><p>The event-instance total uses only reported student events with a single numeric count. Estimated ranges, general attendees, ongoing programs, planned activities and unknown counts are excluded. No payment total is inferred from requests. The spelling-bee finalist subset is not counted twice. Source worksheet years are not confirmed fiscal years.</p></details></div>${Dashboard.actions("sponsorships")}</div>`;
    Analytics.state.sponsorships = { ...selected };
    const form = document.querySelector("[data-support-filters]");
    form.onsubmit = (ev) => ev.preventDefault();
    form.onchange = (ev) =>
      navigate({ ...selected, [ev.target.name]: ev.target.value });
    form.onreset = (ev) => {
      ev.preventDefault();
      navigate(defaults);
    };
    const chartValues = {
      "support-organizations": [
        orgs.filter((o) =>
          s.some((r) => r.organization === o && r.requested_amount != null),
        ),
        orgs
          .filter((o) =>
            s.some((r) => r.organization === o && r.requested_amount != null),
          )
          .map((o) => sum(s.filter((r) => r.organization === o))),
      ],
      "support-status": [
        status,
        status.map((v) => s.filter((r) => r.status === v).length),
      ],
      "engagement-participation": [
        numericEvents.map((r) => r.activity),
        numericEvents.map((r) =>
          r.participants_min === r.participants_max
            ? r.participants_min
            : [r.participants_min, r.participants_max],
        ),
      ],
      "engagement-categories": [
        cats,
        cats.map((c) => e.filter((r) => r.category === c).length),
      ],
    };
    for (const [id, [labels, values]] of Object.entries(chartValues))
      draw(
        id,
        labels,
        values,
        id === "engagement-participation" ? numericEvents : null,
      );
  }
  function navigate(s) {
    const p = new URLSearchParams(
      Object.entries(s).filter(([k, v]) => v !== defaults[k]),
    );
    location.hash = "sponsorships" + (p.size ? "?" + p : "");
  }
  function draw(id, labels, values, activities) {
    const canvas = document.getElementById("support-chart-" + id);
    if (!canvas) return;
    if (!window.Chart) {
      canvas.parentElement.hidden = true;
      canvas
        .closest("article")
        .querySelector("details.support-data-table").open = true;
      return;
    }
    const colors = {
      student_event: "#003da5",
      estimated_event: "#007875",
      general_attendees: "#52657d",
      program_enrollment: "#6f477f",
      planned: "#8a650e",
    };
    const c = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label:
              id === "support-organizations" ? "Requested dollars" : "Count",
            data: values,
            backgroundColor: activities
              ? activities.map((r) => colors[r.participation_type])
              : "#003da5",
            maxBarThickness: 22,
            borderWidth: 1,
            borderColor: "#243448",
          },
        ],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: false,
        indexAxis: "y",
        scales: {
          x: {
            beginAtZero: true,
            title: {
              display: true,
              text:
                id === "support-organizations"
                  ? "Requested dollars; not payments"
                  : id === "engagement-participation"
                    ? "Reported participation (ranges retained)"
                    : "Number of entries / activities",
            },
            ticks: { font: { size: 12 }, precision: 0 },
          },
          y: {
            ticks: {
              autoSkip: false,
              font: { size: 12 },
              callback: function (v) {
                const label = this.getLabelForValue(v);
                return label.length > 28 ? label.slice(0, 26) + "..." : label;
              },
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                activities
                  ? `${count(activities[ctx.dataIndex])}; ${types[activities[ctx.dataIndex].participation_type]}; ${activities[ctx.dataIndex].status}; 2026; provisional`
                  : `${ctx.raw.toLocaleString("en-US")}; OSCP entries; ${id.startsWith("support-") ? "fiscal year unavailable" : "2026"}`,
            },
          },
        },
      },
    });
    charts.set(id, c);
    const observer = new ResizeObserver(() => {
      const box = canvas.parentElement.getBoundingClientRect();
      if (box.width && box.height)
        c.resize(Math.max(1, box.width - 16), Math.max(1, box.height - 8));
    });
    observer.observe(canvas.parentElement);
    observers.push(observer);
  }
  function exportCsv(id) {
    const el = document.getElementById(id),
      csvTable = el.querySelector("details.support-data-table table"),
      rows = [
        ["Panel", el.querySelector("h3").textContent],
        ["Level", "OSCP sponsorships and programs"],
        [
          "Year",
          id.startsWith("engagement-") ? "2026" : "Fiscal year not available",
        ],
        [
          "Source and interpretation",
          el.querySelector(".panel-caption").textContent,
        ],
        ...Array.from(csvTable?.querySelectorAll("tr") ?? [], (tr) =>
          Array.from(tr.querySelectorAll("th,td"), (c) => c.textContent.trim()),
        ),
      ];
    download(
      new Blob(
        [
          "\uFEFF" +
            rows
              .map((r) =>
                r
                  .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
                  .join(","),
              )
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      id + ".csv",
    );
  }
  document.addEventListener("click", async (ev) => {
    const csv = ev.target.closest("[data-support-csv]"),
      table = ev.target.closest("[data-support-table]"),
      png = ev.target.closest("[data-support-png]"),
      clear = ev.target.closest("[data-support-clear]");
    if (csv) exportCsv(csv.dataset.supportCsv);
    if (table) {
      const el = document.getElementById(table.dataset.supportTable),
        details = el.querySelector("details.support-data-table");
      details.open = !details.open;
      el.classList.toggle("support-table-mode", details.open);
      el.querySelector(".panel-menu").open = false;
    }
    if (clear)
      navigate({
        ...selected,
        [clear.dataset.supportClear]: defaults[clear.dataset.supportClear],
      });
    if (png) {
      if (!window.html2canvas)
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "vendor/html2canvas.min.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.append(script);
        });
      const canvas = await html2canvas(
        document.getElementById(png.dataset.supportPng),
        { ignoreElements: (el) => el.matches(".panel-menu") },
      );
      canvas.toBlob((b) => download(b, png.dataset.supportPng + ".png"));
    }
  });
  return {
    load: () =>
      loading ??
      (loading = fetch("support-data.json")
        .then((r) => {
          if (!r.ok) throw Error("Could not load support data");
          return r.json();
        })
        .then((value) => (packet = value))
        .catch((error) => {
          loading = null;
          throw error;
        })),
    render,
    filtered,
    exportCsv,
    get packet() {
      return packet;
    },
  };
})();
