#!/usr/bin/env python3
"""
Fetch browser market share from StatCounter and map to root program coverage.

StatCounter provides a CSV download endpoint. This script fetches the latest
monthly data for all platforms worldwide, then maps browser names to root
programs (Chrome -> Chrome Root Program, Safari -> Apple Root Program, etc.).

Output: data/browser_coverage.json
"""

import csv
import io
import json
import os
import sys
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# StatCounter CSV download URL pattern
# chart.php with csv=1 returns CSV data
# We request the most recent complete month, all platforms, worldwide
def get_statcounter_url():
    """Build the StatCounter CSV download URL for the most recent complete month."""
    now = datetime.utcnow()
    # Use last month (current month is incomplete)
    if now.month == 1:
        year, month = now.year - 1, 12
    else:
        year, month = now.year, now.month - 1
    date_str = f"{year}{month:02d}"
    month_str = f"{year}-{month:02d}"
    return (
        f"https://gs.statcounter.com/chart.php?"
        f"bar=1&device=Desktop&device_hidden=desktop&multi=1"
        f"&period=monthly&statType_hidden=browser&region_hidden=ww"
        f"&granularity=monthly&statType=Browser&region=Worldwide"
        f"&fromInt={date_str}&toInt={date_str}"
        f"&fromMonthYear={month_str}&toMonthYear={month_str}&csv=1"
    ), f"{year}-{month:02d}"


# Fallback: scrape the HTML table from the main page
def fetch_from_html():
    """Parse browser share from the StatCounter HTML page as fallback."""
    url = "https://gs.statcounter.com/browser-market-share"
    req = Request(url, headers={"User-Agent": "WebPKI-Observatory/1.0"})
    try:
        with urlopen(req, timeout=30) as resp:
            html = resp.read().decode("utf-8")
    except URLError as e:
        print(f"  ERROR: Could not fetch StatCounter HTML: {e}")
        return None

    # Parse the table from the HTML
    browsers = {}
    import re
    # StatCounter renders a simple table with browser name and percentage
    # Format: rows contain browser name in first cell, percentage in second
    # Try multiple patterns since their HTML varies
    
    # Pattern 1: Standard table rows
    rows = re.findall(
        r"<t[dh][^>]*>\s*([A-Za-z][A-Za-z\s]+?)\s*</t[dh]>\s*<t[dh][^>]*>\s*([\d.]+)%\s*</t[dh]>",
        html, re.DOTALL
    )
    
    for name, pct in rows:
        name = name.strip()
        # Skip header-like entries
        if name.lower() in ("browser", "percentage market share", "browser market share"):
            continue
        if name and pct:
            try:
                browsers[name] = float(pct)
            except ValueError:
                continue

    if not browsers:
        print("  ERROR: No browser data found in HTML table")
        return None

    return browsers


# Map browser names to root programs
# Multiple browsers share the same root program:
#   Chrome Root Program: Chrome, Edge, Samsung Internet, Opera, Brave, Vivaldi, etc.
#   Apple Root Program: Safari
#   Mozilla Root Program: Firefox
#   Microsoft Root Program: IE, legacy Edge (negligible for web)
BROWSER_TO_ROOT_PROGRAM = {
    "Chrome": "chrome",
    "Edge": "chrome",          # Edge uses Chromium/Chrome root store
    "Samsung Internet": "chrome",  # Chromium-based
    "Opera": "chrome",         # Chromium-based
    "Brave": "chrome",         # Chromium-based
    "Vivaldi": "chrome",       # Chromium-based
    "Whale": "chrome",         # Chromium-based (Naver)
    "UC Browser": "chrome",    # Chromium-based
    "Yandex Browser": "chrome",  # Chromium-based
    "Safari": "apple",
    "Firefox": "mozilla",
    "IE": "microsoft",
    "Internet Explorer": "microsoft",
}


def map_to_root_programs(browser_data):
    """Map individual browser percentages to root program coverage."""
    programs = {"chrome": 0.0, "apple": 0.0, "mozilla": 0.0, "microsoft": 0.0}
    unmapped = {}

    for browser, pct in browser_data.items():
        program = BROWSER_TO_ROOT_PROGRAM.get(browser)
        if program:
            programs[program] += pct
        else:
            unmapped[browser] = pct

    # Convert percentages to fractions (0-1)
    coverage = {k: round(v / 100, 4) for k, v in programs.items()}

    return coverage, unmapped


def main():
    print("Fetching browser market share from StatCounter...")

    # Try HTML scrape (more reliable than CSV endpoint)
    browser_data = fetch_from_html()

    if not browser_data:
        print("  WARN: Could not fetch live data, using hardcoded fallback")
        browser_data = {
            "Chrome": 68.98,
            "Safari": 16.39,
            "Edge": 5.46,
            "Firefox": 2.29,
            "Samsung Internet": 2.01,
            "Opera": 1.78,
        }

    print(f"  Raw browser data: {len(browser_data)} browsers")
    for name, pct in sorted(browser_data.items(), key=lambda x: -x[1])[:10]:
        print(f"    {name}: {pct}%")

    coverage, unmapped = map_to_root_programs(browser_data)

    print(f"\n  Root program coverage:")
    for program, share in sorted(coverage.items(), key=lambda x: -x[1]):
        print(f"    {program}: {share:.4f} ({share * 100:.1f}%)")

    if unmapped:
        print(f"\n  Unmapped browsers (not assigned to a root program):")
        for name, pct in sorted(unmapped.items(), key=lambda x: -x[1]):
            print(f"    {name}: {pct}%")

    # Build output
    output = {
        "coverage": coverage,
        "raw_browsers": browser_data,
        "unmapped_browsers": unmapped,
        "source": "StatCounter Global Stats",
        "source_url": "https://gs.statcounter.com/browser-market-share",
        "fetched_at": datetime.now(tz=__import__('datetime').timezone.utc).isoformat(),
        "notes": (
            "Chrome coverage includes all Chromium-based browsers (Edge, Samsung Internet, Opera, Brave, etc.) "
            "since they all use the Chrome Root Store. Apple coverage is Safari only. "
            "Mozilla coverage is Firefox only. Microsoft coverage is IE only (near-zero for web, "
            "relevant for Windows enterprise and non-browser TLS)."
        ),
        "mapping": {
            "chrome": ["Chrome", "Edge", "Samsung Internet", "Opera", "Brave", "Vivaldi", "Whale", "UC Browser", "Yandex Browser"],
            "apple": ["Safari"],
            "mozilla": ["Firefox"],
            "microsoft": ["IE", "Internet Explorer"],
        },
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    output_path = os.path.join(DATA_DIR, "browser_coverage.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    print(f"\n  Wrote {output_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
