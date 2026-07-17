/* AAH Engineering — Maintenance Dashboard
 * Vanilla implementation of the "Maintenance Dashboard.dc.html" design.
 * Data is loaded from data/data.js into window.APPDATA. */
(function () {
  "use strict";

  // ---- Config -------------------------------------------------------------
  var PASSWORD = "aah2026"; // client-side gate only (matches the design's login screen)
  var D = window.APPDATA || {};

  // ---- Reference maps (from the source design) ----------------------------
  var CATEGORY_MAP = {
    PM: "Preventive", PMCO: "Preventive (Compliance)", "U/B": "Unplanned Breakdown",
    OSRE: "Preventive", OP: "Operational", CM: "Corrective", TECH: "Other",
    FU: "Other", MO: "Other", FM: "Other", INS: "Other", CC: "Other",
    ITRE: "Other", PC: "Other", SR: "Other", ITPR: "Other", SA: "Other"
  };
  var CATEGORY_COLOR = {
    "Preventive": "#3ba7ff",
    "Preventive (Compliance)": "#8b5cf6",
    "Unplanned Breakdown": "#f87171",
    "Operational": "#f59e0b",
    "Corrective": "#34d399",
    "Other": "#6b7280"
  };
  var CATEGORY_ORDER = ["Preventive", "Preventive (Compliance)", "Unplanned Breakdown", "Operational", "Corrective", "Other"];

  var TYPE_LABELS = {
    PM: "Preventive (PM)", PMCO: "PM Compliance", "U/B": "Unplanned Breakdown",
    OSRE: "OSR Preventive", OP: "Operational", CM: "Corrective", TECH: "Technical",
    FU: "Follow-up", MO: "Modification", FM: "Facilities", INS: "Installation",
    CC: "Cleaning", ITRE: "IT Reactive", PC: "Project", SR: "Service Request",
    ITPR: "IT Proactive", SA: "Safety"
  };

  var RC_ORDER = ["BH", "BR", "RF", "WT", "RU", "GL", "BF", "SW", "LD", "TW"];
  var RC_NAMES = { BH: "Birmingham", BR: "Bristol", RF: "Romford", WT: "Warrington", GL: "Glasgow", LD: "Leeds", SW: "Swansea" };

  var STATUS_COLOR = { CLOSED: "#4ade80", ISSUED: "#3ba7ff", ONHOLD: "#f59e0b" };
  function statusLabel(s) { return s === "ONHOLD" ? "ON HOLD" : s; }

  function rcOptionLabel(rc) {
    if (rc === "ALL") return "All Repair Centers";
    return RC_NAMES[rc] ? rc + " — " + RC_NAMES[rc] : rc;
  }
  function presentRCs() {
    return RC_ORDER.filter(function (rc) { return D.rcStats[rc]; });
  }

  // ---- Formatting helpers -------------------------------------------------
  function fmtNum(n) { return Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 }); }
  function fmtHours(n) { return fmtNum(Math.round(n * 10) / 10); }
  function money(n) { return "£" + Math.round(n).toLocaleString("en-GB"); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Normalise UTF-8 mojibake present in some source reason strings.
  function fixText(s) {
    if (!s) return s;
    return String(s)
      .replace(/â€™/g, "’")
      .replace(/â€˜/g, "‘")
      .replace(/â€œ/g, "“")
      .replace(/â€/g, "”")
      .replace(/â€“/g, "–")
      .replace(/â€”/g, "—")
      .replace(/â€/g, "’")
      .replace(/Â/g, "");
  }

  // ---- Chart / pie helpers ------------------------------------------------
  function categorize(counts) {
    var cat = {};
    Object.keys(counts).forEach(function (code) {
      var c = CATEGORY_MAP[code] || "Other";
      cat[c] = (cat[c] || 0) + counts[code];
    });
    var total = 0;
    Object.keys(cat).forEach(function (k) { total += cat[k]; });
    var items = CATEGORY_ORDER.filter(function (c) { return cat[c]; }).map(function (c) {
      return { label: c, color: CATEGORY_COLOR[c], count: cat[c], pct: total ? Math.round(cat[c] / total * 1000) / 10 : 0 };
    });
    return { items: items, total: total };
  }
  function pieCss(items, total) {
    if (!total) return "#2a2f37";
    var acc = 0, stops = [];
    items.forEach(function (it) {
      var start = acc / total * 360; acc += it.count; var end = acc / total * 360;
      stops.push(it.color + " " + start.toFixed(2) + "deg " + end.toFixed(2) + "deg");
    });
    return "conic-gradient(" + stops.join(",") + ")";
  }
  function legendHtml(items) {
    return items.map(function (it) {
      return '<div class="legend-item"><div class="legend-swatch" style="background:' + it.color + '"></div>' +
        '<div class="legend-label">' + esc(it.label) + '</div>' +
        '<div class="legend-pct">' + it.pct + '%</div></div>';
    }).join("");
  }
  function sparkline(series) {
    var w = 400, h = 120, pad = 8, max = Math.max.apply(null, series.concat([1]));
    var n = series.length;
    var pts = series.map(function (v, i) {
      var x = n > 1 ? (i / (n - 1)) * w : 0;
      var y = h - (v / max) * (h - pad);
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    return { line: pts.join(" "), area: pts.join(" ") + " " + w + "," + h + " 0," + h };
  }

  // ---- State --------------------------------------------------------------
  var state = {
    page: "dashboard",
    dashRC: "ALL",
    dashSort: { key: "hours", dir: -1 },
    woSearch: "", woRC: "ALL", woType: "ALL", woStatus: "ALL",
    worstRC: "ALL",
    worstSort: { key: "cost", dir: -1 },
    pmRC: "ALL", pmSearch: "",
    relAsset: null,
    relOpen: {}
  };

  // ---- Small builders -----------------------------------------------------
  function kpi(label, value, sub, valueColor) {
    return '<div class="kpi"><div class="kpi-label">' + label + '</div>' +
      '<div class="kpi-value"' + (valueColor ? ' style="color:' + valueColor + '"' : '') + '>' + value + '</div>' +
      (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '</div>';
  }
  function selectHtml(id, value, options) {
    return '<select data-select="' + id + '">' + options.map(function (o) {
      return '<option value="' + esc(o.value) + '"' + (o.value === value ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join("") + '</select>';
  }
  function rcSelectOptions(keys) {
    return [{ value: "ALL", label: rcOptionLabel("ALL") }].concat(keys.map(function (rc) {
      return { value: rc, label: rcOptionLabel(rc) };
    }));
  }
  function sortArrow(sort, key) {
    if (sort.key !== key) return "";
    return sort.dir < 0 ? " ▾" : " ▴";
  }

  // ---- Dashboard ----------------------------------------------------------
  function renderDashboard() {
    var rc = state.dashRC, s = D.rcStats[rc];
    var spark = sparkline(s.series);
    var proMax = Math.max(s.proHours, s.reHours, 1);
    var proPx = Math.max(2, Math.round(s.proHours / proMax * 96));
    var rePx = Math.max(2, Math.round(s.reHours / proMax * 96));
    var cat = categorize(s.typeCounts);

    // asset table
    var rows = D.assetDowntime.filter(function (r) { return rc === "ALL" || r[1] === rc; });
    var sort = state.dashSort;
    var keyIdx = { hours: 2, wo: 3, cost: 4 }[sort.key];
    rows = rows.slice().sort(function (a, b) { return (a[keyIdx] - b[keyIdx]) * sort.dir; });

    var head =
      '<div class="page-head"><div>' +
        '<div class="page-title">Maintenance Overview</div>' +
        '<div class="page-sub">' + (rc === "ALL" ? "All repair centers" : rcOptionLabel(rc)) + ' · June 2026</div>' +
      '</div><div class="head-controls">' +
        selectHtml("dashRC", rc, rcSelectOptions(presentRCs())) +
        '<div class="pill">June 2026 ▾</div>' +
      '</div></div>';

    var kpis =
      '<div class="grid kpi-row">' +
        kpi("WORK ORDERS", fmtNum(s.wo), s.closedPct + "% closed", null) +
        kpi("LABOR HOURS", fmtHours(s.hours), s.techs + " technicians active", null) +
        kpi("PLANNED WORK", s.plannedPct + "%", "of hours proactive", "#4ade80") +
        kpi("AVG HRS / WO", s.avgHrs + ' <span style="font-size:13px;color:rgba(255,255,255,.4)">hrs</span>', "labor hrs per WO", null) +
        kpi("OPEN BACKLOG", fmtNum(s.open), "issued or on hold", null) +
        kpi("PARTS COST", money(s.cost), "June actuals", null) +
      '</div>';

    var mid =
      '<div class="grid" style="grid-template-columns:1.5fr 0.75fr 1fr;margin-top:16px">' +
        '<div class="card pad">' +
          '<div class="card-title" style="margin-bottom:14px">Daily Labor Hours — ' + esc(rc) + '</div>' +
          '<svg viewBox="0 0 400 120" style="width:100%;height:140px" preserveAspectRatio="none">' +
            '<defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3ba7ff"/><stop offset="100%" stop-color="#3ba7ff" stop-opacity="0"/></linearGradient></defs>' +
            '<polyline points="' + spark.area + '" fill="url(#g1)" stroke="none" opacity="0.35"/>' +
            '<polyline points="' + spark.line + '" fill="none" stroke="#3ba7ff" stroke-width="2.5"/>' +
          '</svg>' +
          '<div class="note" style="margin-top:2px">Weekend dips visible — minimal weekend coverage</div>' +
        '</div>' +
        '<div class="card pad">' +
          '<div class="card-title" style="margin-bottom:14px">Proactive vs Reactive Hrs</div>' +
          '<div style="display:flex;align-items:flex-end;gap:16px;height:100px;padding:0 6px">' +
            '<div style="flex:1;height:' + proPx + 'px;background:#3ba7ff;border-radius:3px 3px 0 0"></div>' +
            '<div style="flex:1;height:' + rePx + 'px;background:#f59e0b;border-radius:3px 3px 0 0"></div>' +
          '</div>' +
          '<div style="display:flex;gap:16px;padding:0 6px;margin-top:8px">' +
            '<div class="note" style="flex:1;text-align:center;color:rgba(255,255,255,.4)">Proactive<br>' + fmtHours(s.proHours) + 'h</div>' +
            '<div class="note" style="flex:1;text-align:center;color:rgba(255,255,255,.4)">Reactive<br>' + fmtHours(s.reHours) + 'h</div>' +
          '</div>' +
        '</div>' +
        '<div class="card pad">' +
          '<div class="card-head" style="margin-bottom:14px"><div class="card-title">Work Order Type Split</div><div class="tag">' + esc(rc) + '</div></div>' +
          '<div style="display:flex;align-items:center;gap:18px">' +
            '<div class="pie" style="width:112px;height:112px;background:' + pieCss(cat.items, cat.total) + '"></div>' +
            '<div class="legend">' + legendHtml(cat.items) + '</div>' +
          '</div>' +
          '<div class="note" style="margin-top:10px">' + fmtNum(cat.total) + ' work orders classified</div>' +
        '</div>' +
      '</div>';

    var tblCols = "50px 1.4fr 110px 110px 110px 110px";
    var tbl =
      '<div class="card tbl-wrap" style="margin-top:16px">' +
        '<div class="card-head" style="padding:15px 20px;border-bottom:1px solid var(--line)"><div class="card-title">Most Reactive Downtime by Asset — Top ' + rows.length + '</div><div class="tag">' + esc(rc) + '</div></div>' +
        '<div class="tbl-head" style="grid-template-columns:' + tblCols + '">' +
          '<div>#</div><div>ASSET</div><div>REPAIR CTR</div>' +
          '<div class="sortable' + (sort.key === "hours" ? " active" : "") + '" data-sort="dash:hours">DOWNTIME HRS' + sortArrow(sort, "hours") + '</div>' +
          '<div class="sortable' + (sort.key === "wo" ? " active" : "") + '" data-sort="dash:wo">WOs' + sortArrow(sort, "wo") + '</div>' +
          '<div class="sortable' + (sort.key === "cost" ? " active" : "") + '" data-sort="dash:cost">PARTS £' + sortArrow(sort, "cost") + '</div>' +
        '</div>' +
        '<div class="tbl-scroll" style="max-height:480px">' +
          rows.map(function (r, i) {
            return '<div class="tbl-row" style="grid-template-columns:' + tblCols + '">' +
              '<div class="rank">' + (i + 1) + '</div>' +
              '<div class="ellip">' + esc(r[0]) + '</div>' +
              '<div class="mono dim">' + esc(r[1]) + '</div>' +
              '<div class="mono">' + fmtHours(r[2]) + 'h</div>' +
              '<div class="dim">' + r[3] + '</div>' +
              '<div class="mono dim">' + (r[4] ? money(r[4]) : "£0") + '</div>' +
            '</div>';
          }).join("") +
        '</div>' +
      '</div>';

    return head + '<div class="page-body">' + kpis + mid + tbl + '</div>';
  }

  // ---- Work Orders --------------------------------------------------------
  var WO_ROW_CAP = 500;
  function renderWO() {
    var list = D.workOrders.list;
    var q = state.woSearch.trim().toLowerCase();
    var filtered = list.filter(function (w) {
      if (state.woRC !== "ALL" && w[6] !== state.woRC) return false;
      if (state.woType !== "ALL" && w[1] !== state.woType) return false;
      if (state.woStatus !== "ALL" && w[5] !== state.woStatus) return false;
      if (q) {
        var hay = (w[0] + " " + w[2] + " " + fixText(w[3])).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var shown = filtered.slice(0, WO_ROW_CAP);

    var typeOpts = [{ value: "ALL", label: "All types" }].concat(
      Object.keys(TYPE_LABELS).filter(function (t) { return list.some(function (w) { return w[1] === t; }); })
        .map(function (t) { return { value: t, label: t + " · " + TYPE_LABELS[t] }; }));
    var statusOpts = [{ value: "ALL", label: "All statuses" }, { value: "CLOSED", label: "Closed" }, { value: "ISSUED", label: "Issued" }, { value: "ONHOLD", label: "On hold" }];

    var head =
      '<div class="page-head"><div>' +
        '<div class="page-title">Work Orders</div>' +
        '<div class="page-sub">All work orders · June 2026 · ' + fmtNum(filtered.length) + ' result' + (filtered.length === 1 ? "" : "s") +
          (filtered.length > WO_ROW_CAP ? ' (showing first ' + WO_ROW_CAP + ')' : '') + '</div>' +
      '</div></div>';

    var filters =
      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">' +
        '<input type="text" data-input="woSearch" value="' + esc(state.woSearch) + '" placeholder="Search asset, reason or WO#…" style="flex:1;min-width:220px" />' +
        selectHtml("woRC", state.woRC, rcSelectOptions(presentRCs())) +
        selectHtml("woType", state.woType, typeOpts) +
        selectHtml("woStatus", state.woStatus, statusOpts) +
      '</div>';

    var cols = "90px 70px 210px 1fr 78px 96px 84px 84px";
    var tbl =
      '<div class="card" style="overflow:hidden;display:flex;flex-direction:column">' +
        '<div class="tbl-head" style="grid-template-columns:' + cols + '">' +
          '<div>WO #</div><div>TYPE</div><div>ASSET</div><div>REASON</div><div>HOURS</div><div>STATUS</div><div>REPAIR CTR</div><div style="text-align:right">PARTS £</div>' +
        '</div>' +
        (shown.length ? '' : '<div class="empty">No work orders match this filter.</div>') +
        '<div class="tbl-scroll" style="max-height:calc(100vh - 320px)">' +
          shown.map(function (w) {
            return '<div class="tbl-row" style="grid-template-columns:' + cols + '">' +
              '<div class="mono dim" style="font-size:11px">' + esc(w[0]) + '</div>' +
              '<div class="mono" style="font-size:10.5px;color:rgba(255,255,255,.6)">' + esc(w[1]) + '</div>' +
              '<div class="ellip">' + esc(w[2]) + '</div>' +
              '<div class="ellip dim" style="padding-right:12px">' + esc(fixText(w[3])) + '</div>' +
              '<div class="mono">' + fmtHours(w[4]) + '</div>' +
              '<div class="mono" style="font-size:10.5px;color:' + (STATUS_COLOR[w[5]] || "#aaa") + '">' + statusLabel(w[5]) + '</div>' +
              '<div class="mono dim">' + esc(w[6] || "—") + '</div>' +
              '<div class="mono dim" style="text-align:right">' + (w[7] ? money(w[7]) : "£0") + '</div>' +
            '</div>';
          }).join("") +
        '</div>' +
      '</div>';

    return head + '<div class="page-body" style="display:flex;flex-direction:column">' + filters + tbl + '</div>';
  }

  // ---- Worst Asset --------------------------------------------------------
  function renderWorst() {
    var rc = state.worstRC, w = D.worst.byRC[rc];
    var top = w.top;
    var maxCost = top.length ? top[0][2] : 1;
    var bars = top.slice(0, 12);
    var cat = categorize(w.typeDist);

    var rcRank = D.worst.rcRank;
    var maxRc = rcRank.length ? rcRank[0][1] : 1;

    var sort = state.worstSort;
    var keyIdx = { wo: 3, cost: 2 }[sort.key];
    var rows = top.slice().sort(function (a, b) { return (a[keyIdx] - b[keyIdx]) * sort.dir; });

    var head =
      '<div class="page-head"><div>' +
        '<div class="page-title">Worst Asset</div>' +
        '<div class="page-sub">Reactive cost ranking · Q2 2026 (Apr–Jun) · ' + (rc === "ALL" ? "all repair centers" : rcOptionLabel(rc)) + '</div>' +
      '</div><div class="head-controls">' +
        selectHtml("worstRC", rc, rcSelectOptions(presentRCs())) +
        '<div class="pill">Q2 2026 (Apr–Jun) ▾</div>' +
      '</div></div>';

    var kpis =
      '<div class="grid kpi-row-4">' +
        kpi("TOTAL REACTIVE COST", money(w.totals.cost), "across all assets") +
        kpi("WORK ORDERS", fmtNum(w.totals.wo), "reactive WOs in quarter") +
        kpi("ASSETS AFFECTED", fmtNum(w.totals.assets), "distinct assets") +
        kpi("LABOR COST", money(w.totals.labor), "of total actuals") +
      '</div>';

    var mid =
      '<div class="grid" style="grid-template-columns:1.6fr 1fr;margin-top:16px">' +
        '<div class="card pad">' +
          '<div class="card-title" style="margin-bottom:16px">Top 12 Assets by Reactive Cost</div>' +
          '<div style="display:flex;flex-direction:column;gap:10px">' +
            bars.map(function (b) {
              var pct = Math.max(2, b[2] / maxCost * 100);
              return '<div class="bar-row" style="grid-template-columns:190px 1fr 76px">' +
                '<div class="bar-label">' + esc(b[0]) + '</div>' +
                '<div class="bar-track"><div class="bar-fill" style="width:' + pct.toFixed(1) + '%;background:linear-gradient(90deg,#f87171,#f59e0b)"></div></div>' +
                '<div class="bar-val">' + money(b[2]) + '</div></div>';
            }).join("") +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:14px">' +
          '<div class="card pad">' +
            '<div class="card-title" style="margin-bottom:14px">Failure Type Split</div>' +
            '<div style="display:flex;align-items:center;gap:18px">' +
              '<div class="pie" style="width:104px;height:104px;background:' + pieCss(cat.items, cat.total) + '"></div>' +
              '<div class="legend">' + legendHtml(cat.items) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="card pad" style="flex:1">' +
            '<div class="card-title" style="margin-bottom:14px">Cost by Repair Center</div>' +
            '<div style="display:flex;flex-direction:column;gap:9px">' +
              rcRank.map(function (r) {
                var pct = Math.max(2, r[1] / maxRc * 100);
                var on = r[0] === rc;
                return '<div class="bar-row" style="grid-template-columns:36px 1fr 66px">' +
                  '<div class="mono" style="color:' + (on ? "#3ba7ff" : "rgba(255,255,255,.5)") + '">' + esc(r[0]) + '</div>' +
                  '<div class="bar-track"><div class="bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + (on ? "#3ba7ff" : "#4b78b8") + '"></div></div>' +
                  '<div class="bar-val">' + money(r[1]) + '</div></div>';
              }).join("") +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var cols = "50px 1.4fr 90px 140px 110px 120px";
    var tbl =
      '<div class="card tbl-wrap" style="margin-top:16px">' +
        '<div class="card-head" style="padding:15px 20px;border-bottom:1px solid var(--line)"><div class="card-title">Worst Assets — Top ' + top.length + ' by Cost</div><div class="tag">Apr–Jun 2026</div></div>' +
        '<div class="tbl-head" style="grid-template-columns:' + cols + '">' +
          '<div>#</div><div>ASSET</div><div>REPAIR CTR</div><div>DOMINANT TYPE</div>' +
          '<div class="sortable' + (sort.key === "wo" ? " active" : "") + '" data-sort="worst:wo">WOs' + sortArrow(sort, "wo") + '</div>' +
          '<div class="sortable' + (sort.key === "cost" ? " active" : "") + '" data-sort="worst:cost">COST' + sortArrow(sort, "cost") + '</div>' +
        '</div>' +
        '<div class="tbl-scroll" style="max-height:440px">' +
          rows.map(function (r, i) {
            return '<div class="tbl-row" style="grid-template-columns:' + cols + '">' +
              '<div class="rank">' + (i + 1) + '</div>' +
              '<div class="ellip">' + esc(r[0]) + '</div>' +
              '<div class="mono dim">' + esc(r[1]) + '</div>' +
              '<div class="mono" style="font-size:11px;color:rgba(255,255,255,.55)">' + esc(r[4]) + '</div>' +
              '<div class="dim">' + r[3] + '</div>' +
              '<div class="mono dim">' + money(r[2]) + '</div>' +
            '</div>';
          }).join("") +
        '</div>' +
      '</div>';

    return head + '<div class="page-body">' + kpis + mid + tbl + '</div>';
  }

  // ---- Preventive Maintenance --------------------------------------------
  function renderPM() {
    var rc = state.pmRC, p = D.preventive[rc];
    var cat = categorize(p.types);

    // bars: individual types, top 8 by count
    var typeArr = Object.keys(p.types).map(function (t) { return { code: t, count: p.types[t] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
    var maxType = typeArr.length ? typeArr[0].count : 1;

    // WO table: proactive work orders for this RC, filtered by the PM type set + search
    var typeSet = {}; Object.keys(p.types).forEach(function (t) { typeSet[t] = true; });
    var q = state.pmSearch.trim().toLowerCase();
    var woRows = D.workOrders.list.filter(function (w) {
      if (rc !== "ALL" && w[6] !== rc) return false;
      if (!typeSet[w[1]]) return false;
      if (q) {
        var hay = (w[0] + " " + w[2] + " " + fixText(w[3])).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var shownWo = woRows.slice(0, WO_ROW_CAP);

    var head =
      '<div class="page-head"><div>' +
        '<div class="page-title">Preventive Maintenance</div>' +
        '<div class="page-sub">Planned &amp; scheduled maintenance · June 2026 · ' + (rc === "ALL" ? "all repair centers" : rcOptionLabel(rc)) + '</div>' +
      '</div><div class="head-controls">' +
        selectHtml("pmRC", rc, rcSelectOptions(presentRCs())) +
        '<div class="pill">June 2026 ▾</div>' +
      '</div></div>';

    var kpis =
      '<div class="grid kpi-row-4">' +
        kpi("PROACTIVE WORK ORDERS", fmtNum(p.wo), "scheduled &amp; planned") +
        kpi("PM COMPLIANCE", p.compliance + "%", "completed on schedule", "#4ade80") +
        kpi("LABOR HOURS", fmtHours(p.hours), p.avgHrs + " hrs / WO avg") +
        kpi("OPEN PM BACKLOG", fmtNum(p.open), fmtNum(p.closed) + " closed") +
      '</div>';

    var mid =
      '<div class="grid" style="grid-template-columns:0.9fr 1.1fr;margin-top:16px">' +
        '<div class="card pad">' +
          '<div class="card-head" style="margin-bottom:16px"><div class="card-title">PM Type Distribution</div><div class="tag">' + esc(rc) + '</div></div>' +
          '<div style="display:flex;align-items:center;gap:18px">' +
            '<div class="pie" style="width:120px;height:120px;background:' + pieCss(cat.items, cat.total) + '"></div>' +
            '<div class="legend">' + legendHtml(cat.items) + '</div>' +
          '</div>' +
          '<div class="note" style="margin-top:12px">' + fmtNum(cat.total) + ' proactive work orders</div>' +
        '</div>' +
        '<div class="card pad">' +
          '<div class="card-title" style="margin-bottom:16px">Work Orders by Type</div>' +
          '<div style="display:flex;flex-direction:column;gap:9px">' +
            typeArr.map(function (t) {
              var pct = Math.max(2, t.count / maxType * 100);
              var color = CATEGORY_COLOR[CATEGORY_MAP[t.code] || "Other"];
              return '<div class="bar-row" style="grid-template-columns:170px 1fr 54px">' +
                '<div class="bar-label">' + esc(TYPE_LABELS[t.code] || t.code) + '</div>' +
                '<div class="bar-track"><div class="bar-fill" style="width:' + pct.toFixed(1) + '%;background:' + color + '"></div></div>' +
                '<div class="bar-val">' + fmtNum(t.count) + '</div></div>';
            }).join("") +
          '</div>' +
        '</div>' +
      '</div>';

    var cols = "90px 70px 210px 1fr 78px 96px 84px 84px";
    var tbl =
      '<div class="card tbl-wrap" style="margin-top:16px">' +
        '<div class="card-head" style="padding:15px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap">' +
          '<div class="card-title">Work Orders — ' + esc(rc) + '</div>' +
          '<div style="display:flex;align-items:center;gap:12px">' +
            '<div class="tag">' + fmtNum(woRows.length) + ' shown</div>' +
            '<input type="text" data-input="pmSearch" value="' + esc(state.pmSearch) + '" placeholder="Search asset, reason or WO#…" style="width:240px" />' +
          '</div>' +
        '</div>' +
        '<div class="tbl-head" style="grid-template-columns:' + cols + '">' +
          '<div>WO #</div><div>TYPE</div><div>ASSET</div><div>REASON</div><div>HOURS</div><div>STATUS</div><div>REPAIR CTR</div><div style="text-align:right">PARTS £</div>' +
        '</div>' +
        (shownWo.length ? '' : '<div class="empty">No work orders match this filter.</div>') +
        '<div class="tbl-scroll" style="max-height:460px">' +
          shownWo.map(function (w) {
            return '<div class="tbl-row" style="grid-template-columns:' + cols + '">' +
              '<div class="mono dim" style="font-size:11px">' + esc(w[0]) + '</div>' +
              '<div class="mono" style="font-size:10.5px;color:rgba(255,255,255,.6)">' + esc(w[1]) + '</div>' +
              '<div class="ellip">' + esc(w[2]) + '</div>' +
              '<div class="ellip dim" style="padding-right:12px">' + esc(fixText(w[3])) + '</div>' +
              '<div class="mono">' + fmtHours(w[4]) + '</div>' +
              '<div class="mono" style="font-size:10.5px;color:' + (STATUS_COLOR[w[5]] || "#aaa") + '">' + statusLabel(w[5]) + '</div>' +
              '<div class="mono dim">' + esc(w[6] || "—") + '</div>' +
              '<div class="mono dim" style="text-align:right">' + (w[7] ? money(w[7]) : "£0") + '</div>' +
            '</div>';
          }).join("") +
        '</div>' +
      '</div>';

    return head + '<div class="page-body">' + kpis + mid + tbl + '</div>';
  }

  // ---- Reliability --------------------------------------------------------
  function relChart(pro, re) {
    var W = 900, H = 300, L = 44, R = 14, T = 12, B = 30;
    var n = pro.length;
    var max = Math.max.apply(null, pro.concat(re).concat([1]));
    var baseY = H - B;
    function x(i) { return L + (n > 1 ? (i / (n - 1)) * (W - L - R) : 0); }
    function y(v) { return T + (1 - v / max) * (H - T - B); }
    function path(arr) { return arr.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" "); }
    function area(arr) {
      var d = "M " + x(0).toFixed(1) + " " + baseY.toFixed(1);
      arr.forEach(function (v, i) { d += " L " + x(i).toFixed(1) + " " + y(v).toFixed(1); });
      d += " L " + x(n - 1).toFixed(1) + " " + baseY.toFixed(1) + " Z";
      return d;
    }
    var grid = "";
    for (var g = 0; g <= 4; g++) {
      var val = max * (1 - g / 4);
      var gy = y(val);
      grid += '<line x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,.06)" stroke-width="1"></line>';
      grid += '<text x="8" y="' + gy.toFixed(1) + '" dy="4" fill="rgba(255,255,255,.35)" style="font:500 10px \'Roboto Mono\'">' + fmtHours(val) + '</text>';
    }
    var xlabels = "";
    for (var i = 0; i < n; i++) {
      if (i % 3 === 0 || i === n - 1) {
        xlabels += '<text x="' + x(i).toFixed(1) + '" y="' + baseY + '" dy="18" text-anchor="middle" fill="rgba(255,255,255,.35)" style="font:500 10px \'Roboto Mono\'">' + (i + 1) + '</text>';
      }
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:320px" preserveAspectRatio="none">' +
      '<defs>' +
        '<linearGradient id="proGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4ade80" stop-opacity="0.28"/><stop offset="100%" stop-color="#4ade80" stop-opacity="0"/></linearGradient>' +
        '<linearGradient id="reGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f87171" stop-opacity="0.28"/><stop offset="100%" stop-color="#f87171" stop-opacity="0"/></linearGradient>' +
      '</defs>' + grid +
      '<path d="' + area(pro) + '" fill="url(#proGrad)" stroke="none"></path>' +
      '<path d="' + area(re) + '" fill="url(#reGrad)" stroke="none"></path>' +
      '<path d="' + path(pro) + '" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linejoin="round"></path>' +
      '<path d="' + path(re) + '" fill="none" stroke="#f87171" stroke-width="2.5" stroke-linejoin="round"></path>' +
      xlabels +
    '</svg>';
  }

  function renderRel() {
    var assetList = D.reliability.assetList;
    if (!state.relAsset || !D.reliability.assets[state.relAsset]) state.relAsset = assetList[0].asset;
    var name = state.relAsset;
    var a = D.reliability.assets[name];
    var ratio = (a.proHrs + a.reHrs) ? Math.round(a.reHrs / (a.proHrs + a.reHrs) * 1000) / 10 : 0;

    var wos = a.wos.slice().sort(function (x, y) { return y[5] - x[5]; }); // newest first

    var opts = assetList.map(function (o) {
      return { value: o.asset, label: o.asset + "  (" + o.rc + ")" };
    });

    var head =
      '<div class="page-head"><div>' +
        '<div class="page-title">Reliability Analysis</div>' +
        '<div class="page-sub">Proactive vs reactive labor trend · June 2026 · Repair center ' + esc(a.rc) + '</div>' +
      '</div>' +
        '<div class="head-controls">' + selectHtml("relAsset", name, opts) + '</div>' +
      '</div>';

    var kpis =
      '<div class="grid kpi-row-4" style="margin-bottom:16px">' +
        kpi("PROACTIVE HOURS", fmtHours(a.proHrs), null, "#4ade80") +
        kpi("REACTIVE HOURS", fmtHours(a.reHrs), null, "#f87171") +
        kpi("REACTIVE SHARE", ratio + "%") +
        kpi("WORK ORDERS", fmtNum(a.wos.length)) +
      '</div>';

    var chart =
      '<div class="card pad">' +
        '<div class="card-head" style="margin-bottom:6px"><div class="card-title">Daily Labor Hours — Proactive vs Reactive</div>' +
          '<div class="chart-legend"><div class="item"><div class="swatch" style="background:#4ade80"></div>Proactive</div><div class="item"><div class="swatch" style="background:#f87171"></div>Reactive</div></div>' +
        '</div>' + relChart(a.proSeries, a.reSeries) +
        '<div class="note" style="text-align:center;margin-top:2px">Day of month · June 2026</div>' +
      '</div>';

    var rowsHtml = wos.map(function (w, idx) {
      var reactive = w[6] === 1;
      var open = !!state.relOpen[name + ":" + idx];
      var detail = open ?
        '<div class="rel-detail">' +
          '<div><div class="detail-k">WORK ORDER</div><div class="detail-v mono" style="font-weight:600">' + esc(w[0]) + '</div></div>' +
          '<div><div class="detail-k">TYPE</div><div class="detail-v">' + esc(TYPE_LABELS[w[1]] || w[1]) + ' <span class="mono" style="font-size:10px;color:rgba(255,255,255,.4)">(' + esc(w[1]) + ')</span></div></div>' +
          '<div><div class="detail-k">LABOR</div><div class="detail-v mono" style="font-weight:600">' + fmtHours(w[3]) + 'h</div></div>' +
          '<div><div class="detail-k">LOGGED</div><div class="detail-v">Jun ' + w[5] + '</div></div>' +
          '<div style="grid-column:1 / -1"><div class="detail-k">REASON</div><div class="detail-v" style="color:rgba(255,255,255,.75)">' + esc(fixText(w[2])) + '</div></div>' +
        '</div>' : '';
      return '<div>' +
        '<div class="rel-row" data-relrow="' + idx + '">' +
          '<div class="dim" style="font-size:11px">' + (open ? "▾" : "▸") + '</div>' +
          '<div class="mono dim" style="font-size:11px">' + esc(w[0]) + '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;min-width:0"><div style="width:7px;height:7px;border-radius:2px;flex:none;background:' + (reactive ? "#f87171" : "#4ade80") + '"></div><span class="ellip dim">' + esc(fixText(w[2])) + '</span></div>' +
          '<div class="mono" style="font-size:10.5px;color:' + (STATUS_COLOR[w[4]] || "#aaa") + '">' + statusLabel(w[4]) + '</div>' +
          '<div class="mono dim">' + fmtHours(w[3]) + 'h</div>' +
          '<div class="mono dim" style="text-align:right">Jun ' + w[5] + '</div>' +
        '</div>' + detail +
      '</div>';
    }).join("");

    var tbl =
      '<div class="card tbl-wrap" style="margin-top:16px">' +
        '<div class="card-head" style="padding:15px 20px;border-bottom:1px solid var(--line)"><div class="card-title">Work Order Details — ' + esc(name) + '</div><div class="tag">' + a.wos.length + ' work orders</div></div>' +
        (wos.length ? '' : '<div class="empty">No work orders for this asset.</div>') +
        '<div class="tbl-scroll" style="max-height:440px">' + rowsHtml + '</div>' +
      '</div>';

    return head + '<div class="page-body">' + kpis + chart + tbl + '</div>';
  }

  // ---- Router / events ----------------------------------------------------
  function render() {
    var main = document.getElementById("main");
    var html;
    switch (state.page) {
      case "wo": html = renderWO(); break;
      case "worst": html = renderWorst(); break;
      case "pm": html = renderPM(); break;
      case "rel": html = renderRel(); break;
      default: html = renderDashboard();
    }
    main.innerHTML = html;
    document.querySelectorAll(".navitem").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-nav") === state.page);
    });
    bindControls();
    main.scrollTop = 0;
  }

  function bindControls() {
    document.querySelectorAll("select[data-select]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var id = sel.getAttribute("data-select");
        var v = sel.value;
        if (id === "dashRC") state.dashRC = v;
        else if (id === "worstRC") state.worstRC = v;
        else if (id === "pmRC") state.pmRC = v;
        else if (id === "relAsset") { state.relAsset = v; state.relOpen = {}; }
        else if (id === "woRC") state.woRC = v;
        else if (id === "woType") state.woType = v;
        else if (id === "woStatus") state.woStatus = v;
        render();
      });
    });
    document.querySelectorAll("input[data-input]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var id = inp.getAttribute("data-input");
        var caret = inp.selectionStart;
        if (id === "woSearch") state.woSearch = inp.value;
        else if (id === "pmSearch") state.pmSearch = inp.value;
        render();
        var again = document.querySelector('input[data-input="' + id + '"]');
        if (again) { again.focus(); try { again.setSelectionRange(caret, caret); } catch (e) {} }
      });
    });
  }

  document.addEventListener("click", function (e) {
    var nav = e.target.closest && e.target.closest(".navitem");
    if (nav) { state.page = nav.getAttribute("data-nav"); render(); return; }

    var sortEl = e.target.closest && e.target.closest("[data-sort]");
    if (sortEl) {
      var parts = sortEl.getAttribute("data-sort").split(":");
      var st = parts[0] === "worst" ? state.worstSort : state.dashSort;
      if (st.key === parts[1]) st.dir *= -1; else { st.key = parts[1]; st.dir = -1; }
      render();
      return;
    }

    var relRow = e.target.closest && e.target.closest("[data-relrow]");
    if (relRow) {
      var k = state.relAsset + ":" + relRow.getAttribute("data-relrow");
      state.relOpen[k] = !state.relOpen[k];
      render();
      return;
    }
  });

  // ---- Login --------------------------------------------------------------
  function showApp() {
    document.getElementById("login").hidden = true;
    document.getElementById("app").hidden = false;
    render();
  }
  function tryLogin() {
    var pw = document.getElementById("pw").value;
    if (pw === PASSWORD) {
      try { sessionStorage.setItem("aah_authed", "1"); } catch (e) {}
      showApp();
    } else {
      document.getElementById("pw-error").hidden = false;
      document.getElementById("pw").focus();
    }
  }

  function init() {
    document.getElementById("login-btn").addEventListener("click", tryLogin);
    document.getElementById("pw").addEventListener("keydown", function (e) {
      document.getElementById("pw-error").hidden = true;
      if (e.key === "Enter") tryLogin();
    });
    document.getElementById("logout").addEventListener("click", function () {
      try { sessionStorage.removeItem("aah_authed"); } catch (e) {}
      document.getElementById("app").hidden = true;
      document.getElementById("login").hidden = false;
      document.getElementById("pw").value = "";
    });
    var authed = false;
    try { authed = sessionStorage.getItem("aah_authed") === "1"; } catch (e) {}
    if (authed) showApp();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
