#!/usr/bin/env python3
"""Propose new SDG activities from the college News & Events RSS feeds.

New posts are appended to data/activities.json with "verified": false. The public
site hides unverified entries, so nothing appears until a person checks the SDG
tags and sets "verified": true (or deletes the entry). Every post seen is recorded
in data/news-seen.json so a deleted entry is never proposed again.

Standard library only. Usage: python3 scripts/fetch_news.py [--sources FILE]
"""
import argparse, html, json, re, sys, urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "VAST-SDG-site-newsbot/1.0 (+https://github.com/soorajkprabha/vast-sdg)"

# Keyword -> suggested SDGs. These are only suggestions for the reviewer.
RULES = [
    (r"blood|donat|health|yoga|medical|wellness|drug|hiv|aids|mental|hospital|camp for", [3]),
    (r"tree|sapling|plantation|forest|environment|nature|green|biodiversity|garden", [15, 13]),
    (r"clean|waste|plastic|garbage|swach|swatch|beach|recycl|e-waste|paper pen", [11, 12]),
    (r"water|rain|well recharg|mazhakuzhi|canal", [6]),
    (r"solar|energy|renewable|biogas|bio-gas|electric", [7]),
    (r"women|girl|gender|vwec", [5]),
    (r"school|literacy|skill|training|education|teach|scholar|quiz|workshop|seminar", [4]),
    (r"food|hunger|meal|vegetable garden|farming", [2]),
    (r"homeless|flood|relief|poverty|tribal|house for|home for", [1, 11]),
    (r"old age|children's home|childrens home|orphan|disab|differently|inclusion|visit.*(home|sadan|village)", [10]),
    (r"innovation|patent|green building|igbc|geotechnical|startup|ieee", [9, 11]),
    (r"mou|partnership|collaborat|industry", [17]),
    (r"climate|carbon|emission", [13]),
    (r"sea|marine|river|lake|coast", [14]),
]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def strip(s):
    return html.unescape(re.sub(r"<[^>]+>", " ", s or "")).strip()


def parse_feed(xml_bytes):
    root = ET.fromstring(xml_bytes)
    items = []
    for it in root.iter("item"):
        title = strip(it.findtext("title"))
        link = (it.findtext("link") or "").strip()
        pub = it.findtext("pubDate")
        try:
            date = parsedate_to_datetime(pub).date().isoformat()
        except Exception:
            m = re.search(r"/(\d{4})/(\d{2})/(\d{2})/", link)
            date = "-".join(m.groups()) if m else ""
        cats = [strip(c.text) for c in it.findall("category")]
        desc = strip(it.findtext("description"))
        if title and link:
            items.append({"title": title, "link": link, "date": date, "cats": cats, "desc": desc})
    return items


def suggest(item):
    text = " ".join([item["title"], item["desc"], " ".join(item["cats"])]).lower()
    out = []
    for pattern, sdgs in RULES:
        if re.search(pattern, text):
            for g in sdgs:
                if g not in out:
                    out.append(g)
    return sorted(out[:3])


def load(path, default):
    p = ROOT / path
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def save(path, data):
    (ROOT / path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default="data/news-sources.json")
    args = ap.parse_args()

    cfg = load(args.sources, {"feeds": [], "max_new_per_run": 40})
    activities = load("data/activities.json", [])
    seen = set(load("data/news-seen.json", []))
    known = {a.get("link") for a in activities} | seen
    added = []
    for feed in cfg["feeds"]:
        for page in range(1, int(feed.get("pages", 1)) + 1):
            url = feed["url"] if page == 1 else f"{feed['url']}{'&' if '?' in feed['url'] else '?'}paged={page}"
            try:
                items = parse_feed(fetch(url))
            except Exception as e:  # a missing page just means there are no more posts
                print(f"stop {url}: {e}", file=sys.stderr)
                break
            if not items:
                break
            for it in items:
                if it["link"] in known or len(added) >= cfg.get("max_new_per_run", 40):
                    continue
                known.add(it["link"])
                added.append({
                    "title": it["title"],
                    "date": it["date"],
                    "sdgs": suggest(it),
                    "department": feed.get("department", "College"),
                    "description": f"Reported on the college News & Events portal (published {it['date']}).",
                    "outcomes": "",
                    "link": it["link"],
                    "image": "",
                    "verified": False,
                })
    if added:
        save("data/activities.json", activities + added)
        save("data/news-seen.json", sorted(known - {a.get("link") for a in activities}))
    print(f"{len(added)} new post(s) proposed")
    for a in added:
        print(" -", a["date"], a["sdgs"], a["title"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
