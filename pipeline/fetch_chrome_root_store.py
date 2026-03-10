#!/usr/bin/env python3
"""
Fetch Chrome Root Store changelog from Chromium source code.

The Chrome Root Store is defined in root_store.textproto in the Chromium repo.
Every change is a git commit with a date. We fetch the commit log via the
Gitiles JSON API, then diff consecutive versions to build a changelog.

Output: chrome_root_store_changelog.json
"""

import json, re, sys, time, base64, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path
from collections import Counter

PIPELINE_DIR = Path(__file__).parent
CACHE_DIR = PIPELINE_DIR / "ops_cache"
OUTPUT_DIR = PIPELINE_DIR.parent / "data"

GITILES_BASE = "https://chromium.googlesource.com/chromium/src"
FILE_PATH = "net/data/ssl/chrome_root_store/root_store.textproto"


def fetch_json(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read().decode("utf-8")
    if raw.startswith(")]}'"):
        raw = raw[4:]
    return json.loads(raw)


def fetch_file_at_commit(commit, filename):
    url = f"{GITILES_BASE}/+/{commit}/{filename}?format=TEXT"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return base64.b64decode(resp.read()).decode("utf-8", errors="replace")
    except:
        return None


def extract_hashes(textproto):
    return set(re.findall(r'sha256_hex:\s*"([0-9a-f]{64})"', textproto))


def parse_date(gitiles_date):
    # "Sat Feb 21 14:06:46 2026" -> "2026-02-21"
    try:
        dt = datetime.strptime(gitiles_date.strip(), "%a %b %d %H:%M:%S %Y")
        return dt.strftime("%Y-%m-%d")
    except:
        return None


def main():
    print("=" * 60)
    print("Chrome Root Store Changelog (from Chromium source)")
    print("=" * 60)
    CACHE_DIR.mkdir(exist_ok=True)

    cache_path = CACHE_DIR / "chrome_root_store_cache.json"
    cache = json.load(open(cache_path)) if cache_path.exists() else {"commits": {}}

    # Fetch commit log
    print("  Fetching commit log...")
    log_url = f"{GITILES_BASE}/+log/main/{FILE_PATH}?format=JSON&n=200"
    data = fetch_json(log_url)
    commits = data.get("log", [])
    print(f"  {len(commits)} commits found")

    # Process each commit (oldest first)
    changelog = []
    prev_roots = None

    for c in reversed(commits):
        commit_hash = c["commit"]
        date_str = c.get("author", {}).get("time", "")
        date = parse_date(date_str)
        message = c.get("message", "").split("\n")[0][:100]

        # Check cache
        if commit_hash in cache["commits"]:
            roots = set(cache["commits"][commit_hash].get("hashes", []))
        else:
            text = fetch_file_at_commit(commit_hash, FILE_PATH)
            if not text:
                continue
            roots = extract_hashes(text)
            cache["commits"][commit_hash] = {
                "date": date,
                "message": message,
                "hashes": sorted(roots),
                "count": len(roots),
            }
            time.sleep(0.3)

        if prev_roots is not None and roots != prev_roots:
            added = roots - prev_roots
            removed = prev_roots - roots
            if added or removed:
                entry = {
                    "date": date,
                    "commit": commit_hash[:12],
                    "message": message,
                    "added_count": len(added),
                    "removed_count": len(removed),
                    "total_after": len(roots),
                    "added_hashes": sorted(added),
                    "removed_hashes": sorted(removed),
                }
                changelog.append(entry)
                print(f"  {date or '?':>12} +{len(added):<3d} -{len(removed):<3d} = {len(roots)} roots")

        prev_roots = roots

    # Save cache
    with open(cache_path, "w") as f:
        json.dump(cache, f)

    # Build output
    output = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_commits": len(commits),
            "changes_detected": len(changelog),
            "current_root_count": len(prev_roots) if prev_roots else 0,
            "first_commit_date": parse_date(commits[-1]["author"]["time"]) if commits else None,
            "last_commit_date": parse_date(commits[0]["author"]["time"]) if commits else None,
        },
        "changelog": changelog,
    }

    # Summary stats
    total_added = sum(e["added_count"] for e in changelog)
    total_removed = sum(e["removed_count"] for e in changelog)

    out_path = OUTPUT_DIR / "chrome_root_store_changelog.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n{'=' * 60}")
    print(f"  {len(changelog)} changes, {total_added} additions, {total_removed} removals")
    print(f"  Current store: {output['meta']['current_root_count']} roots")
    print(f"  Wrote {out_path}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
