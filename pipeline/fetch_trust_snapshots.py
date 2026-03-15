#!/usr/bin/env python3
"""
Daily Trust Store Snapshot.

Captures the current list of trusted roots for each store from CCADB.
Run daily via CI to build a time series. Diffs between snapshots reveal
when roots were added or removed from each store.

Output: data/snapshots/YYYY-MM-DD.json (one file per day)
Also updates: data/trust_store_changelog.json (computed from snapshot diffs)

This solves the temporal problem: CCADB only shows current state, but
by snapshotting daily we build the history that Chrome and Apple don't publish.
"""

import json, os, sys, hashlib
import urllib.request
import csv, io
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

PIPELINE_DIR = Path(__file__).parent
OUTPUT_DIR = PIPELINE_DIR.parent / "data"
SNAPSHOT_DIR = OUTPUT_DIR / "snapshots"

CCADB_URL = "https://ccadb.my.salesforce-sites.com/ccadb/AllCertificateRecordsCSVFormatv4"

STORES = {
    "chrome": "Chrome Status",
    "mozilla": "Mozilla Status",
    "apple": "Apple Status",
    "microsoft": "Microsoft Status",
}


def fetch_ccadb():
    """Fetch current CCADB root certificate data."""
    print("  Fetching CCADB AllCertificateRecordsCSVFormatv4...")
    req = urllib.request.Request(CCADB_URL)
    req.add_header("User-Agent", "WebPKI-Observatory/1.0")
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    
    reader = csv.DictReader(io.StringIO(text))
    roots = []
    for row in reader:
        if row.get("Certificate Record Type") != "Root Certificate":
            continue
        
        sha256 = row.get("SHA-256 Fingerprint", "").strip().upper().replace(":", "")
        if not sha256:
            continue
        
        store_status = {}
        for store_key, col_name in STORES.items():
            status = row.get(col_name, "").strip()
            store_status[store_key] = status
        
        roots.append({
            "sha256": sha256,
            "ca_owner": row.get("CA Owner", "").strip(),
            "cert_name": row.get("Certificate Name", "").strip(),
            "valid_from": row.get("Valid From (GMT)", "").strip()[:10],
            "valid_to": row.get("Valid To (GMT)", "").strip()[:10],
            "stores": store_status,
        })
    
    return roots


def take_snapshot(roots, date_str):
    """Save a snapshot of current trust store state."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Build per-store inclusion sets
    snapshot = {
        "date": date_str,
        "total_roots": len(roots),
        "per_store": {},
    }
    
    for store in STORES:
        included = []
        for r in roots:
            status = r["stores"].get(store, "")
            if status == "Included":
                included.append({
                    "sha256": r["sha256"],
                    "ca_owner": r["ca_owner"],
                    "cert_name": r["cert_name"],
                })
        
        snapshot["per_store"][store] = {
            "count": len(included),
            "roots": sorted(included, key=lambda x: x["sha256"]),
        }
    
    # Save snapshot
    snap_path = SNAPSHOT_DIR / f"{date_str}.json"
    with open(snap_path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)
    
    print(f"  Snapshot saved: {snap_path}")
    for store in STORES:
        print(f"    {store:12}: {snapshot['per_store'][store]['count']} roots")
    
    return snapshot


def compute_changelog():
    """Compute changelog by diffing consecutive snapshots."""
    if not SNAPSHOT_DIR.exists():
        return {"changes": [], "note": "No snapshots yet"}
    
    snapshots = sorted(SNAPSHOT_DIR.glob("*.json"))
    if len(snapshots) < 2:
        return {"changes": [], "note": f"Only {len(snapshots)} snapshot(s), need 2+ for diffs"}
    
    changes = []
    
    for i in range(1, len(snapshots)):
        prev = json.load(open(snapshots[i - 1], encoding="utf-8"))
        curr = json.load(open(snapshots[i], encoding="utf-8"))
        prev_date = prev["date"]
        curr_date = curr["date"]
        
        for store in STORES:
            prev_set = set(r["sha256"] for r in prev["per_store"].get(store, {}).get("roots", []))
            curr_set = set(r["sha256"] for r in curr["per_store"].get(store, {}).get("roots", []))
            
            added = curr_set - prev_set
            removed = prev_set - curr_set
            
            # Look up details
            curr_lookup = {r["sha256"]: r for r in curr["per_store"].get(store, {}).get("roots", [])}
            prev_lookup = {r["sha256"]: r for r in prev["per_store"].get(store, {}).get("roots", [])}
            
            for sha in added:
                r = curr_lookup.get(sha, {})
                changes.append({
                    "date": curr_date,
                    "store": store,
                    "action": "added",
                    "sha256": sha,
                    "ca_owner": r.get("ca_owner", ""),
                    "cert_name": r.get("cert_name", ""),
                })
            
            for sha in removed:
                r = prev_lookup.get(sha, {})
                changes.append({
                    "date": curr_date,
                    "store": store,
                    "action": "removed",
                    "sha256": sha,
                    "ca_owner": r.get("ca_owner", ""),
                    "cert_name": r.get("cert_name", ""),
                })
    
    changelog = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "snapshots": len(snapshots),
            "first_snapshot": snapshots[0].stem,
            "last_snapshot": snapshots[-1].stem,
            "total_changes": len(changes),
        },
        "changes": sorted(changes, key=lambda c: (c["date"], c["store"])),
    }
    
    # Save changelog
    cl_path = OUTPUT_DIR / "trust_store_changelog.json"
    with open(cl_path, "w", encoding="utf-8") as f:
        json.dump(changelog, f, indent=2)
    
    if changes:
        print(f"\n  Changelog: {len(changes)} changes across {len(snapshots)} snapshots")
        from collections import Counter
        by_store = Counter((c["store"], c["action"]) for c in changes)
        for (store, action), count in sorted(by_store.items()):
            print(f"    {store:12} {action:8} {count}")
    else:
        print(f"\n  No changes detected across {len(snapshots)} snapshots")
    
    return changelog


def main():
    print("=" * 60)
    print("Daily Trust Store Snapshot")
    print("=" * 60)
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Check if today's snapshot already exists
    snap_path = SNAPSHOT_DIR / f"{today}.json"
    if snap_path.exists():
        print(f"  Snapshot for {today} already exists, skipping fetch")
    else:
        roots = fetch_ccadb()
        print(f"  Fetched {len(roots)} root certificates from CCADB")
        take_snapshot(roots, today)
    
    # Compute changelog from all snapshots
    changelog = compute_changelog()
    
    print(f"\n{'=' * 60}")
    print(f"  Done. Snapshots in {SNAPSHOT_DIR}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
