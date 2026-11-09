#!/usr/bin/env python3
"""Add new monthly solar readings to data/solar.json from a published Google Sheet tab.

The tab is published to the web as CSV (File > Share > Publish to web > CSV). Its
URL goes in the repository variable SOLAR_CSV_URL (or in data/solar-source.json).
Expected header row (names are matched loosely, any order):
    Month | 15 kWp | 100 kWp | 120 kWp | KSEB import | Export

Only months that are missing from data/solar.json and have every figure are added.
Existing months are never overwritten: differences are printed so a person can
check them. Standard library only.

Usage: python3 scripts/fetch_solar.py [--csv FILE]   (FILE instead of the URL, for testing)
"""
import argparse, csv, io, json, os, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "solar.json"
SOURCE = ROOT / "data" / "solar-source.json"
UA = "VAST-SDG-site-solarbot/1.0 (+https://github.com/soorajkprabha/vast-sdg)"

MONTHS = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
MONTHS["oto"] = 10  # the college sheet has "Oto-23" for October 2023
P3_FROM = "2026-04"  # Administration Block (120 kWp) commissioned 22 April 2026

# header keyword -> field
FIELDS = [("15", "p1"), ("100", "p2"), ("120", "p3"), ("import", "grid"), ("kseb", "grid"), ("export", "export")]


def parse_month(text):
    t = text.strip().lower()
    m = re.match(r"^(\d{4})-(\d{1,2})$", t)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    m = re.match(r"^([a-z]{3})[a-z]*[\s\-/']*(\d{2}|\d{4})$", t)
    if m and m.group(1) in MONTHS:
        y = m.group(2)
        return f"{y if len(y) == 4 else '20' + y}-{MONTHS[m.group(1)]:02d}"
    return None


def number(text):
    t = text.strip().replace(",", "")
    return float(t) if re.fullmatch(r"-?\d+(\.\d+)?", t) else None


def load_csv(path):
    if path:
        return Path(path).read_text(encoding="utf-8-sig")
    url = os.environ.get("SOLAR_CSV_URL", "").strip()
    if not url and SOURCE.exists():
        url = json.loads(SOURCE.read_text()).get("csvUrl", "").strip()
    if not url:
        print("No SOLAR_CSV_URL set; nothing to do.")
        sys.exit(0)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8-sig")


def read_rows(text):
    rows = list(csv.reader(io.StringIO(text)))
    for hi, head in enumerate(rows):
        cols = {}
        for ci, name in enumerate(head):
            n = name.strip().lower()
            for key, field in FIELDS:
                if key in n and field not in cols.values():
                    if field == "grid" and "export" in n:
                        continue
                    cols[ci] = field
                    break
        if "month" in " ".join(h.lower() for h in head) and {"p1", "p2", "grid", "export"} <= set(cols.values()):
            month_col = next(i for i, h in enumerate(head) if "month" in h.lower())
            out = []
            for r in rows[hi + 1:]:
                if month_col >= len(r):
                    continue
                key = parse_month(r[month_col])
                if not key:
                    continue  # TOTAL rows, blanks, notes
                rec = {"month": key}
                for ci, field in cols.items():
                    rec[field] = number(r[ci]) if ci < len(r) else None
                out.append(rec)
            return out
    sys.exit("Could not find a header row with Month, 15 kWp, 100 kWp, KSEB import and Export. Check the published tab.")


def clean(v):
    return int(v) if v is not None and float(v).is_integer() else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv")
    args = ap.parse_args()

    doc = json.loads(DATA.read_text(encoding="utf-8"))
    have = {r["month"]: r for r in doc["readings"]}
    added, differ, skipped = [], [], []

    for rec in sorted(read_rows(load_csv(args.csv)), key=lambda r: r["month"]):
        k = rec["month"]
        need = ["p1", "p2", "grid", "export"] + (["p3"] if k >= P3_FROM else [])
        if k in have:
            for f in ("p1", "p2", "p3", "grid", "export"):
                a, b = have[k].get(f), rec.get(f)
                if b is not None and (a or 0) != b:
                    differ.append(f"{k} {f}: site {a} / sheet {clean(b)}")
            continue
        if k < "2018-06":
            continue  # the site starts at 2018-06; the May-2018 row holds opening meter totals
        if any(rec.get(f) is None for f in need):
            skipped.append(k)
            continue
        new = {"month": k, **{f: clean(rec[f]) for f in ("p1", "p2", "grid", "export")}}
        if k >= P3_FROM:
            new["p3"] = clean(rec["p3"])
        added.append(new)

    if added:
        doc["readings"] = sorted(doc["readings"] + added, key=lambda r: r["month"])
        DATA.write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Added {len(added)} month(s): {', '.join(a['month'] for a in added) or 'none'}")
    if skipped:
        print(f"Skipped incomplete month(s): {', '.join(skipped)}")
    if differ:
        print("Differences in months already on the site (not changed, please check):")
        print("\n".join("  " + d for d in differ))


if __name__ == "__main__":
    main()
