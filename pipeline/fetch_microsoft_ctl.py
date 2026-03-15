#!/usr/bin/env python3
"""
Fetch Microsoft Trusted Root Program deployment notices.

Scrapes monthly release notes from learn.microsoft.com to extract:
- Roots added (with date)
- Roots with NotBefore (distrust of new certs, with date)  
- Roots disabled/removed (with date)

URL pattern: learn.microsoft.com/en-us/security/trusted-root/YYYY/month-YYYY
Older format: learn.microsoft.com/en-us/security/trusted-root/YYYY/monYYYY

Output: microsoft_ctl_changelog.json
"""

import json, os, re, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path
from collections import Counter

PIPELINE_DIR = Path(__file__).parent
CACHE_DIR = PIPELINE_DIR / "ops_cache"
OUTPUT_DIR = PIPELINE_DIR.parent / "data"
BASE_URL = "https://learn.microsoft.com/en-us/security/trusted-root"
MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"]
SHORT = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]


def fetch_page(url):
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "WebPKI-Observatory/1.0")
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except:
        return None


def extract_roots(text):
    roots = []
    # 3-field: "CA // Root Certificate // Thumbprint" or "CA \ Root \ Thumbprint"
    for m in re.finditer(r"([^/\\<>\n]{2,60}?)\s*(?://|\\\\|\\)\s*([^/\\<>\n]{2,80}?)\s*(?://|\\\\|\\)\s*([0-9A-Fa-f]{40,64})", text):
        ca = m.group(1).strip().strip("·•–- \t")
        root = m.group(2).strip()
        thumb = m.group(3).strip().upper()
        if ca and root and len(thumb) >= 40:
            roots.append({"ca": ca, "root": root, "thumbprint": thumb})
    # 2-field fallback: "Root Certificate \ Thumbprint" (older format, no CA prefix)
    if not roots:
        for m in re.finditer(r"([^/\\<>\n]{2,80}?)\s*(?://|\\\\|\\)\s*([0-9A-Fa-f]{40,64})", text):
            root = m.group(1).strip().strip("·•–- \t")
            thumb = m.group(2).strip().upper()
            if root and len(thumb) >= 40 and not re.match(r'^[0-9A-Fa-f]+$', root):
                roots.append({"ca": root.split("(")[0].strip() if "(" in root else root, "root": root, "thumbprint": thumb})
    return roots


def parse_notice(html, url, year, month):
    if not html or "Microsoft" not in html:
        return None

    # Strip HTML tags for text-based parsing
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)

    # Release date
    dm = re.search(r"On\s+\w+day,\s+(\w+\s+\d{1,2},\s+\d{4}),\s+Microsoft", text)
    release_date = None
    if dm:
        try: release_date = datetime.strptime(dm.group(1), "%B %d, %Y").strftime("%Y-%m-%d")
        except: pass

    # NotBefore date
    nbm = re.search(r"NotBefore date is set to (\w+ \d{1,2}, \d{4})", text)
    nb_date = None
    if nbm:
        try: nb_date = datetime.strptime(nbm.group(1), "%B %d, %Y").strftime("%Y-%m-%d")
        except: pass

    # Also check for "NotBefore and Disable dates are set for the first day of the release month"
    if not nb_date:
        nbm2 = re.search(r"dates are set for the first day of the release month", text)
        if nbm2 and release_date:
            nb_date = release_date[:8] + "01"  # First of the release month

    actions = []

    # Match sections: "This release will [verb] [qualifier] the following roots..."
    # Then grab everything until the next "This release will" or end markers
    for m in re.finditer(
        r"This release will\s+(add|(?:fully\s+)?NotBefore|[Dd]isable|[Dd]isallow|[Rr]emove)\s*([\w\s,]*?)(?:the following|following)\s*roots.*?(?=This release will|Note\s+Windows|The update package|Feedback|$)",
        text, re.DOTALL | re.IGNORECASE
    ):
        verb = m.group(1).strip().lower()
        qualifier = m.group(2).strip().lower().rstrip(" for to the")
        section_text = m.group()
        roots = extract_roots(section_text)

        if "notbefore" in verb:
            action = f"notbefore{'_' + qualifier.replace(' ', '_') if qualifier and len(qualifier) > 1 else ''}"
            action = action.rstrip("_")
        elif verb == "add":
            action = "add"
        elif verb == "disable":
            action = "disable"
        elif verb == "disallow":
            action = f"disallow{'_' + qualifier.replace(' ', '_') if qualifier and len(qualifier) > 1 else ''}"
            action = action.rstrip("_")
        elif verb == "remove":
            action = f"remove{'_' + qualifier.replace(' ', '_') if qualifier and len(qualifier) > 1 else ''}"
            action = action.rstrip("_")
        else:
            action = verb

        for r in roots:
            actions.append({**r, "action": action, "notbefore_date": nb_date if "notbefore" in action else None})

    # Also catch "This release will NotBefore the [EKU] EKU to the following roots:" (older format)
    for m in re.finditer(
        r"This release will NotBefore the ([\w\s]+?) EKU (?:to|for) the following roots[:\s]*(.*?)(?=This release will|Note\s+Windows|The update package|Feedback|$)",
        text, re.DOTALL | re.IGNORECASE
    ):
        eku = m.group(1).strip().lower().replace(" ", "_")
        roots = extract_roots(m.group(2))
        for r in roots:
            actions.append({**r, "action": f"notbefore_{eku}", "notbefore_date": nb_date})

    if not release_date and not actions:
        return None

    return {"year": year, "month": month, "release_date": release_date, "notbefore_date": nb_date, "url": url, "actions": actions}


def main():
    print("=" * 60)
    print("Microsoft CTL Deployment Notice Scraper")
    print("=" * 60)
    CACHE_DIR.mkdir(exist_ok=True)

    cache_path = CACHE_DIR / "microsoft_ctl_cache.json"
    cache = json.load(open(cache_path, encoding="utf-8")) if cache_path.exists() else {}
    print(f"  {len(cache)} cached notices")

    now = datetime.now()
    notices = []

    for year in range(2020, now.year + 1):
        for mi, month_name in enumerate(MONTHS):
            if month_name == "december":
                continue
            key = f"{year}-{mi+1:02d}"
            if key in cache:
                notices.append(cache[key])
                continue
            if year == now.year and mi + 1 > now.month:
                break

            html = None
            used_url = None
            for url in [
                f"{BASE_URL}/{year}/{month_name}-{year}",     # january-2025
                f"{BASE_URL}/{year}/{SHORT[mi]}{year}",       # jan2025
                f"{BASE_URL}/{year}/{SHORT[mi]}-{year}",      # jan-2025
                f"{BASE_URL}/{year}/{month_name}{year}",      # january2025
                f"{BASE_URL}/{year}/{month_name}",            # january (no year suffix)
            ]:
                html = fetch_page(url)
                if html and len(html) > 1000 and "Microsoft" in html:
                    used_url = url
                    break
                html = None

            if html:
                notice = parse_notice(html, used_url, year, mi + 1)
                if notice:
                    cache[key] = notice
                    notices.append(notice)
                    print(f"  {key}: {notice.get('release_date') or '?':>12} — {len(notice['actions'])} actions")
            time.sleep(0.3)

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)

    changelog = []
    for n in sorted(notices, key=lambda x: f"{x['year']}-{x['month']:02d}"):
        for a in n.get("actions", []):
            changelog.append({
                "date": n.get("release_date"), "year": n["year"], "month": n["month"],
                "ca": a["ca"], "root": a["root"], "thumbprint": a["thumbprint"],
                "action": a["action"], "notbefore_date": a.get("notbefore_date"),
            })

    ac = Counter(a["action"] for a in changelog)
    output = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "notices_scraped": len(notices),
            "total_actions": len(changelog),
            "unique_cas": len(set(a["ca"] for a in changelog)),
            "first_notice": notices[0].get("release_date") if notices else None,
            "last_notice": notices[-1].get("release_date") if notices else None,
        },
        "action_summary": dict(ac),
        "notices": notices,
        "changelog": changelog,
    }

    out_path = OUTPUT_DIR / "microsoft_ctl_changelog.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"\n  {len(notices)} notices, {len(changelog)} actions")
    print(f"  Actions: {dict(ac)}")
    print(f"  Wrote {out_path}")


if __name__ == "__main__":
    main()
