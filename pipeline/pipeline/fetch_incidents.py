#!/usr/bin/env python3
"""
Fetch and classify CA compliance incidents from Bugzilla.

Caching strategy:
- bugs_raw.json: append-only cache of all fetched bugs
- bugs_meta.json: tracks last_bug_id, bug_count, timestamps, errors
- classifications.json: keyed by bug ID, only new/changed bugs get classified
- incidents.json: final output consumed by the site

The script is designed to be run daily by GitHub Actions.
It exits cleanly even on failure, preserving cached data.
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# Force unbuffered stdout so CI shows progress in real time
if not sys.stdout.isatty():
    sys.stdout = os.fdopen(sys.stdout.fileno(), "w", buffering=1)
    sys.stderr = os.fdopen(sys.stderr.fileno(), "w", buffering=1)

PIPELINE_DIR = Path(__file__).parent
CACHE_DIR = PIPELINE_DIR / "ops_cache"
OUTPUT_DIR = PIPELINE_DIR.parent / "data"
MAPPINGS_FILE = PIPELINE_DIR / "bugzilla_ca_mappings.json"

BUGZILLA_URL = "https://bugzilla.mozilla.org/rest/bug"
BUGZILLA_FIELDS = "id,summary,creation_time,status,resolution,whiteboard,creator"
BUGZILLA_COMPONENT = "CA Certificate Compliance"

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
CLASSIFICATION_BATCH_SIZE = 50

# CA email domains for self-report detection
CA_EMAILS = {
    "digicert.com", "sectigo.com", "comodo.com", "entrust.com", "identrust.com",
    "swisssign.com", "globalsign.com", "godaddy.com", "starfieldtech.com",
    "google.com", "letsencrypt.org", "microsoft.com", "ssl.com", "amazon.com",
    "buypass.com", "telia.com", "firmaprofesional.com", "harica.gr",
    "certum.pl", "assecods.pl", "cfca.com.cn", "netlock.hu", "secom.co.jp",
    "d-trust.net", "pki.goog", "trustasia.com", "actalis.it", "apple.com",
    "naver.com", "emudhra.com",
}

CLASSIFICATION_PROMPT = """For each CA compliance bug below, return a JSON array with:
- "id": bug number (integer)
- "cat": one of "misissuance", "revocation", "governance", "validation"
- "self": true if the bug appears to be self-reported by the CA, false if discovered externally
- "severity": "low", "medium", or "high" based on potential impact to relying parties

Categories:
- "misissuance": The certificate itself violates a BR or root program requirement (wrong SANs, encoding errors, serial number entropy, profile violations, unauthorized key usage)
- "revocation": CRL/OCSP infrastructure failures, delayed revocation beyond BR-required timeframes, revocation completeness issues
- "governance": Audit qualifications, CPS violations, disclosure failures, CP/CPS non-compliance, incident management delays, root program policy violations
- "validation": Domain validation or organization validation process failures, improper validation methods

Return ONLY a valid JSON array, no other text.

"""


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default if default is not None else {}


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str, ensure_ascii=False)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def extract_ca(summary):
    if summary.startswith("[meta]"):
        return None
    m = re.match(r'^([^:]+):', summary)
    if m:
        ca = re.sub(r'^\[.*?\]\s*', '', m.group(1).strip())
        if 2 < len(ca) < 80:
            return ca
    return None


def is_self_reported(creator, ca_name):
    if not creator:
        return False
    domain = creator.split("@")[-1].lower()
    return domain in CA_EMAILS


def fetch_bugzilla(meta, cached_bugs):
    """Fetch new bugs from Bugzilla incrementally."""
    last_id = meta.get("last_bug_id", 0)
    last_count = meta.get("bug_count", 0)

    # Step 1: Check if anything changed (lightweight)
    print("  Checking Bugzilla bug count...")
    try:
        count_url = f"{BUGZILLA_URL}?component={urllib.parse.quote(BUGZILLA_COMPONENT)}&count_only=1"
        with urllib.request.urlopen(count_url, timeout=30) as resp:
            current_count = json.loads(resp.read())["bug_count"]
    except Exception as e:
        print(f"  ERROR checking count: {e}")
        meta["last_error"] = str(e)
        meta["last_error_time"] = now_iso()
        return cached_bugs, meta, False

    print(f"  Bugzilla reports {current_count} bugs (cached: {last_count})")

    if current_count == last_count and last_id > 0 and len(cached_bugs) > 0:
        print("  No new bugs, skipping fetch")
        meta["last_checked"] = now_iso()
        return cached_bugs, meta, False

    # Step 2: Fetch only new bugs
    new_bugs = []
    if last_id > 0:
        print(f"  Fetching bugs with id > {last_id}...")
        fetch_url = (
            f"{BUGZILLA_URL}?component={urllib.parse.quote(BUGZILLA_COMPONENT)}"
            f"&include_fields={BUGZILLA_FIELDS}"
            f"&f1=bug_id&o1=greaterthan&v1={last_id}"
            f"&order=bug_id%20asc&limit=500"
        )
        try:
            with urllib.request.urlopen(fetch_url, timeout=60) as resp:
                new_bugs = json.loads(resp.read()).get("bugs", [])
        except Exception as e:
            print(f"  ERROR fetching new bugs: {e}")
            meta["last_error"] = str(e)
            meta["last_error_time"] = now_iso()
            return cached_bugs, meta, False
    else:
        # First run: fetch everything
        print("  First run, fetching all bugs...")
        offset = 0
        while True:
            fetch_url = (
                f"{BUGZILLA_URL}?component={urllib.parse.quote(BUGZILLA_COMPONENT)}"
                f"&include_fields={BUGZILLA_FIELDS}"
                f"&limit=500&offset={offset}&order=creation_time%20asc"
            )
            try:
                with urllib.request.urlopen(fetch_url, timeout=60) as resp:
                    batch = json.loads(resp.read()).get("bugs", [])
            except Exception as e:
                print(f"  ERROR at offset {offset}: {e}")
                meta["last_error"] = str(e)
                meta["last_error_time"] = now_iso()
                break
            if not batch:
                break
            new_bugs.extend(batch)
            print(f"    Fetched {len(new_bugs)} bugs...")
            offset += 500
            if len(batch) < 500:
                break
            time.sleep(0.5)

    if new_bugs:
        print(f"  Got {len(new_bugs)} new bugs")
        # Merge with cache (dedup by id)
        existing_ids = {b["id"] for b in cached_bugs}
        for b in new_bugs:
            if b["id"] not in existing_ids:
                cached_bugs.append(b)

    # Update metadata
    if cached_bugs:
        meta["last_bug_id"] = max(b["id"] for b in cached_bugs)
    meta["bug_count"] = current_count
    meta["last_fetched"] = now_iso()
    meta["last_checked"] = now_iso()
    meta.pop("last_error", None)
    meta.pop("last_error_time", None)

    return cached_bugs, meta, len(new_bugs) > 0


def classify_bugs(bugs, existing_classifications, api_key):
    """Classify new/changed bugs using Anthropic API."""
    if not api_key:
        print("  No ANTHROPIC_API_KEY set, skipping classification")
        return existing_classifications, 0

    # Find bugs needing classification
    needs = []
    for b in bugs:
        bug_id = str(b["id"])
        existing = existing_classifications.get(bug_id)
        if not existing or existing.get("summary") != b["summary"]:
            needs.append(b)

    if not needs:
        print("  All bugs already classified")
        return existing_classifications, 0

    print(f"  {len(needs)} bugs need classification")
    classified = 0
    cost_input = 0
    cost_output = 0

    for i in range(0, len(needs), CLASSIFICATION_BATCH_SIZE):
        batch = needs[i:i + CLASSIFICATION_BATCH_SIZE]
        summaries = "\n".join(f"Bug {b['id']}: {b['summary']}" for b in batch)

        try:
            req_body = json.dumps({
                "model": ANTHROPIC_MODEL,
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": CLASSIFICATION_PROMPT + summaries}],
            }).encode()

            req = urllib.request.Request(
                ANTHROPIC_URL,
                data=req_body,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
            )

            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read())

            text = ""
            for block in result.get("content", []):
                if block.get("type") == "text":
                    text += block["text"]

            # Track usage
            usage = result.get("usage", {})
            cost_input += usage.get("input_tokens", 0)
            cost_output += usage.get("output_tokens", 0)

            # Parse response
            clean = re.sub(r'```json|```', '', text).strip()
            items = json.loads(clean)

            for item in items:
                bug_id = str(item["id"])
                # Find matching bug summary for cache invalidation key
                bug_summary = next(
                    (b["summary"] for b in batch if b["id"] == item["id"]),
                    None,
                )
                existing_classifications[bug_id] = {
                    "cat": item.get("cat", "other"),
                    "self": item.get("self", False),
                    "severity": item.get("severity", "medium"),
                    "summary": bug_summary,
                    "classified_at": now_iso(),
                }
                classified += 1

            print(f"    Batch {i // CLASSIFICATION_BATCH_SIZE + 1}: classified {len(items)} bugs")
            time.sleep(1)  # Rate limit courtesy

        except urllib.error.HTTPError as e:
            body = e.read().decode() if hasattr(e, 'read') else ""
            print(f"    API error (HTTP {e.code}): {body[:200]}")
            if e.code == 429 or "rate_limit" in body.lower():
                print("    Rate limited, stopping classification")
                break
            if e.code == 401 or "invalid" in body.lower():
                print("    Authentication error, stopping classification")
                break
            if "insufficient" in body.lower() or "funds" in body.lower():
                print("    Insufficient funds, stopping classification")
                break
        except Exception as e:
            print(f"    Classification error: {e}")
            break

    # Log costs
    input_cost = (cost_input / 1_000_000) * 3
    output_cost = (cost_output / 1_000_000) * 15
    print(f"  Classification done: {classified} bugs, ~{cost_input + cost_output} tokens (${input_cost + output_cost:.4f})")

    return existing_classifications, classified


def build_incidents_json(all_bugs, mappings, classifications, meta):
    """Build the final incidents.json output.
    
    Schema:
    {
        "meta": {...},
        "total": int,
        "ca_count": int,
        "years": [{"y": 2017, "n": 120}, ...],
        "categories": [{"cat": "Misissuance", "n": 703}, ...],
        "yearsByClass": [{"y": 2017, "mi": 56, "rv": 22, "gv": 8, "vl": 0}, ...],
        "fingerprints": [{"ca": "DigiCert", "mi": 66, "rv": 25, "gv": 19, "vl": 15}, ...],
        "cas": [{"ca": "DigiCert", "n": 171, "self": 87, "ext": 84, "selfPct": 51}, ...],
        "distrusted_excluded": [{"ca": "Entrust", "n": 0}, ...]
    }
    
    Taxonomy (4 categories):
        mi = Misissuance: certificates issued violating the BRs
        rv = Revocation: CRL/OCSP failures and delayed revocation
        gv = Governance: audit, CPS violations, disclosure failures
        vl = Validation: domain/organization validation process failures
    
    categories, yearsByClass, and fingerprints require the classification
    pipeline to have run. They are empty arrays [] when unclassified.
    """
    CAT_MAP = {
        "misissuance": "mi",
        "revocation": "rv",
        "governance": "gv",
        "validation": "vl",
    }

    by_ca = defaultdict(lambda: {"n": 0, "self": 0, "ext": 0, "mi": 0, "rv": 0, "gv": 0, "vl": 0})
    by_year = defaultdict(int)
    by_year_class = defaultdict(lambda: {"mi": 0, "rv": 0, "gv": 0, "vl": 0})
    cat_totals = {"mi": 0, "rv": 0, "gv": 0, "vl": 0}
    total = 0
    classified_total = 0
    unmapped = defaultdict(int)
    distrusted_total = 0

    for b in all_bugs:
        raw_ca = extract_ca(b["summary"])
        if not raw_ca:
            continue

        entry = mappings.get(raw_ca)
        if not entry:
            unmapped[raw_ca] += 1
            continue

        if entry["status"] == "distrusted":
            distrusted_total += 1
            continue

        canonical = entry["ccadb_owner"]
        year = b["creation_time"][:4]
        sr = is_self_reported(b.get("creator", ""), raw_ca)

        # Check AI classification
        cls = classifications.get(str(b["id"]))
        cat_key = CAT_MAP.get(cls["cat"]) if cls and cls.get("cat") in CAT_MAP else None

        total += 1
        by_ca[canonical]["n"] += 1
        if sr:
            by_ca[canonical]["self"] += 1
        else:
            by_ca[canonical]["ext"] += 1

        if cat_key:
            classified_total += 1
            by_ca[canonical][cat_key] += 1
            by_year_class[year][cat_key] += 1
            cat_totals[cat_key] += 1

        by_year[year] += 1

    years = [{"y": int(y), "n": n} for y, n in sorted(by_year.items())]
    cas = sorted(by_ca.items(), key=lambda x: -x[1]["n"])

    # Build CAs array (all CAs, not just top 20)
    cas_list = []
    for ca_name, stats in cas[:40]:
        self_pct = round((stats["self"] / stats["n"]) * 100) if stats["n"] > 0 else 0
        cas_list.append({
            "ca": ca_name,
            "n": stats["n"],
            "self": stats["self"],
            "ext": stats["ext"],
            "selfPct": self_pct,
        })

    # Classification fields (empty arrays if no classifications exist)
    categories = []
    years_by_class = []
    fingerprints = []

    if classified_total > 0:
        cat_labels = {"mi": "Misissuance", "rv": "Revocation", "gv": "Governance", "vl": "Validation"}
        categories = [
            {"cat": cat_labels[k], "n": v}
            for k, v in sorted(cat_totals.items(), key=lambda x: -x[1])
            if v > 0
        ]

        years_by_class = [
            {"y": int(y), **counts}
            for y, counts in sorted(by_year_class.items())
            if any(v > 0 for v in counts.values())
        ]

        fingerprints = [
            {"ca": ca_name, "mi": s["mi"], "rv": s["rv"], "gv": s["gv"], "vl": s["vl"]}
            for ca_name, s in cas[:20]
            if s["mi"] + s["rv"] + s["gv"] + s["vl"] > 0
        ]

    # Distrusted CAs for footnote
    distrusted_names = sorted(set(
        k for k, v in mappings.items()
        if v["status"] == "distrusted"
    ))[:8]

    output = {
        "meta": {
            "last_updated": meta.get("last_fetched", now_iso()),
            "last_checked": meta.get("last_checked", now_iso()),
            "bug_count": len(all_bugs),
            "active_incidents": total,
            "active_cas": len(by_ca),
            "classified_count": classified_total,
            "unclassified_count": total - classified_total,
            "distrusted_excluded": distrusted_total,
            "unmapped_bugs": sum(unmapped.values()),
            "unmapped_names": len(unmapped),
            "pipeline_error": meta.get("last_error"),
            "pipeline_error_time": meta.get("last_error_time"),
        },
        "total": total,
        "ca_count": len(by_ca),
        "years": years,
        "categories": categories,         # [] until classification runs
        "yearsByClass": years_by_class,    # [] until classification runs
        "fingerprints": fingerprints,      # [] until classification runs
        "cas": cas_list,
        "distrusted_excluded": [{"ca": n, "n": 0} for n in distrusted_names],
    }

    return output, unmapped


def main():
    print("=" * 60)
    print(f"Incident pipeline run: {now_iso()}")
    print("=" * 60)

    # Ensure cache directory exists
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Load cached state
    meta = load_json(CACHE_DIR / "bugs_meta.json", {})
    cached_bugs = load_json(CACHE_DIR / "bugs_raw.json", [])
    classifications = load_json(CACHE_DIR / "classifications.json", {})
    mappings_data = load_json(MAPPINGS_FILE, {})
    mappings = mappings_data.get("mappings", {})

    print(f"\nCache state: {len(cached_bugs)} bugs, {len(classifications)} classifications")

    # If meta claims bugs exist but raw file is empty (e.g. gitignored),
    # reset meta to force a full re-fetch
    if len(cached_bugs) == 0 and meta.get("bug_count", 0) > 0:
        print(f"  WARNING: Meta claims {meta['bug_count']} bugs but raw cache is empty. Resetting to force re-fetch.")
        meta["last_bug_id"] = 0
        meta["bug_count"] = 0

    if meta.get("last_fetched"):
        print(f"Last fetch: {meta['last_fetched']}")
    if meta.get("last_error"):
        print(f"Last error: {meta['last_error']} at {meta.get('last_error_time')}")

    # Step 1: Fetch from Bugzilla
    print("\n--- Bugzilla Fetch ---")
    cached_bugs, meta, has_new = fetch_bugzilla(meta, cached_bugs)

    # Save cache regardless of whether we got new bugs
    save_json(CACHE_DIR / "bugs_raw.json", cached_bugs)
    save_json(CACHE_DIR / "bugs_meta.json", meta)
    print(f"  Cache: {len(cached_bugs)} total bugs")

    # Step 2: Classify new bugs (if API key available)
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if has_new or any(str(b["id"]) not in classifications for b in cached_bugs[:10]):
        print("\n--- Classification ---")
        classifications, n_classified = classify_bugs(
            cached_bugs, classifications, api_key
        )
        save_json(CACHE_DIR / "classifications.json", classifications)
        print(f"  Cache: {len(classifications)} total classifications")
    else:
        print("\n--- Classification ---")
        print("  No new bugs to classify")

    # Step 3: Build output
    print("\n--- Build Output ---")
    output, unmapped = build_incidents_json(
        cached_bugs, mappings, classifications, meta
    )

    save_json(OUTPUT_DIR / "incidents.json", output)

    total_size = os.path.getsize(OUTPUT_DIR / "incidents.json")
    print(f"  Wrote incidents.json ({total_size / 1024:.1f} KB)")
    print(f"  {output['total']} active incidents from {output['ca_count']} CAs")
    print(f"  {output['meta']['classified_count']} classified, {output['meta']['unclassified_count']} unclassified")
    print(f"  {output['meta']['distrusted_excluded']} distrusted bugs excluded")

    if unmapped:
        print(f"\n  {len(unmapped)} unmapped CA names ({sum(unmapped.values())} bugs):")
        for name, count in sorted(unmapped.items(), key=lambda x: -x[1])[:10]:
            print(f"    {name}: {count}")

    print(f"\n{'=' * 60}")
    print("Pipeline complete")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    import urllib.parse
    main()
