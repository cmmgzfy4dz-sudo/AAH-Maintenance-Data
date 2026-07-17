#!/usr/bin/env python3
"""Bundle the canonical data/*.json files into data/data.js.

The dashboard loads data via a global (window.APPDATA) so that index.html
works when opened directly from disk (file://) as well as over HTTP, without
running into fetch/CORS restrictions. The .json files remain the source of
truth; this script regenerates the bundled data.js from them.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

FILES = {
    "rcStats": "rc_stats.json",
    "preventive": "preventive.json",
    "worst": "worst_asset.json",
    "assetDowntime": "asset_downtime.json",
    "top100": "top100_assets.json",
    "reliability": "reliability.json",
    "workOrders": "work_orders.json",
}


def main():
    lines = [
        "// Auto-generated bundle of dashboard datasets (source: data/*.json).",
        "// Regenerate with: python3 tools/build_data.py",
        "window.APPDATA = window.APPDATA || {};",
    ]
    for key, fn in FILES.items():
        with open(os.path.join(DATA, fn), encoding="utf-8") as fh:
            obj = json.load(fh)
        payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        lines.append(f"window.APPDATA[{json.dumps(key)}] = {payload};")
    with open(os.path.join(DATA, "data.js"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print("Wrote data/data.js")


if __name__ == "__main__":
    main()
