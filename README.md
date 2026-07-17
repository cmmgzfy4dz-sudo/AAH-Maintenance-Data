# AAH Engineering — Maintenance Dashboard

A self-contained web dashboard for reviewing engineering maintenance activity
across AAH's repair centers. It is the implementation of the
`Maintenance Dashboard.dc.html` design and covers June 2026 CMMS work-order,
labour and reliability data.

## Running it

Everything is static — no build step or server is required to view it.

- **Open directly:** double-click `index.html` (data is bundled into
  `data/data.js` and loaded via a `<script>` tag, so it works from `file://`).
- **Or serve it** (recommended for a clean URL):

  ```bash
  python3 -m http.server 8000
  # then open http://localhost:8000/
  ```

### Login

The dashboard opens on a password gate (part of the original design). The
password is defined at the top of `js/app.js`:

```
var PASSWORD = "aah2026";
```

This is a client-side gate only and provides no real security — change the
constant to set a different password. Authentication is remembered for the tab
via `sessionStorage`.

## Screens

| Screen | What it shows |
| --- | --- |
| **Dashboard** | KPI row (work orders, labour hours, planned %, avg hrs/WO, open backlog, parts cost), daily labour trend, proactive vs reactive split, work-order type pie, and a sortable "most reactive downtime by asset" table. Filterable by repair center. |
| **Work Orders** | Full, searchable work-order register with repair-center / type / status filters. |
| **Worst Asset** | Reactive-cost ranking (Q2 2026): totals, top-12 cost bars, failure-type split, cost-by-repair-center, and a sortable worst-assets table. |
| **Preventive Maint.** | Proactive work KPIs, PM compliance, PM type distribution, work orders by type, and a searchable PM work-order list. |
| **Reliability** | Per-asset proactive vs reactive daily labour trend with an expandable work-order detail list. |

## Data

The `data/` directory holds the canonical datasets (extracted from the design
project's CMMS exports):

- `rc_stats.json` — per-repair-center overview stats (work orders, hours,
  proactive/reactive split, daily series, type counts).
- `work_orders.json` — the work-order register
  `[wo#, type, asset, reason, hours, status, repairCentre, partsCost]`.
- `worst_asset.json` — reactive cost ranking per repair center + `rcRank`.
- `preventive.json` — preventive-maintenance summary per repair center.
- `asset_downtime.json` — reactive downtime by asset `[asset, rc, hrs, wo, parts]`.
- `top100_assets.json` — busiest assets by total labour hours.
- `reliability.json` — per-asset daily proactive/reactive series and work orders.

`data/data.js` is a generated bundle of all of the above. Regenerate it after
editing any JSON file:

```bash
python3 tools/build_data.py
```

### Notes on the data

- Work-order type codes are grouped into categories (Preventive, Preventive
  (Compliance), Unplanned Breakdown, Operational, Corrective, Other) using the
  mapping in `js/app.js`.
- Repair-center codes are shown as-is; friendly city names are added for the
  centers that could be confidently identified (Birmingham, Bristol, Romford,
  Warrington, Glasgow, Leeds, Swansea).
- The work-order register in this build contains ~3,276 rows. The very lowest-
  hour routine PM entries beyond that were outside the exported slice; the
  headline KPIs come from the pre-aggregated `rc_stats` / `preventive` summaries
  and are unaffected.

## Structure

```
index.html          # shell: login gate + app layout
css/styles.css      # dark theme
js/app.js           # data loading, rendering, navigation, filtering, charts
data/*.json         # canonical datasets
data/data.js        # generated bundle loaded by index.html
tools/build_data.py # regenerates data/data.js from the JSON files
```
