#!/usr/bin/env python3
"""
WebPKI Observatory Data Pipeline
Fetches CCADB and crt.sh cert-populations data, joins them,
and outputs quantized JSON for the static site.
"""

import csv
import json
import io
import os
import re
import sys
from datetime import datetime, timezone
from collections import defaultdict
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# Force unbuffered stdout so CI shows progress in real time
if not sys.stdout.isatty():
    sys.stdout = os.fdopen(sys.stdout.fileno(), "w", buffering=1)
    sys.stderr = os.fdopen(sys.stderr.fileno(), "w", buffering=1)

OUTPUT_DIR = Path(__file__).parent.parent / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# --- Name mappings and enrichments (loaded from JSON files) ---
PIPELINE_DIR = Path(__file__).parent

def load_name_mappings():
    """Load crt.sh -> CCADB name mappings from JSON file."""
    path = PIPELINE_DIR / "name_mappings.json"
    if path.exists():
        with open(path) as f:
            data = json.load(f)
        mappings = {}
        for crtsh_name, info in data.get("mappings", {}).items():
            mappings[crtsh_name] = info["ccadb_name"]
        print(f"  Loaded {len(mappings)} name mappings")
        return mappings
    return {}

def load_enrichments():
    """Load manual enrichments for CAs missing from CCADB."""
    path = PIPELINE_DIR / "enrichments.json"
    if path.exists():
        with open(path) as f:
            data = json.load(f)
        enrichments = data.get("enrichments", {})
        print(f"  Loaded {len(enrichments)} enrichments")
        return enrichments
    return {}

def load_gov_classifications():
    """Load government relationship classifications."""
    path = PIPELINE_DIR / "gov_classifications.json"
    if path.exists():
        with open(path) as f:
            data = json.load(f)
        classifications = data.get("classifications", {})
        print(f"  Loaded {len(classifications)} government classifications")
        return classifications
    return {}

MANUAL_NAME_MAP = load_name_mappings()
ENRICHMENTS = load_enrichments()
GOV_CLASSIFICATIONS = load_gov_classifications()


import time


def fetch_with_retry(url, max_retries=4, initial_delay=15, timeout=120):
    """Fetch a URL with exponential backoff. Returns response or None."""
    for attempt in range(max_retries):
        try:
            delay = initial_delay * (2 ** attempt)
            if attempt > 0:
                print(f"    Retry {attempt}/{max_retries - 1} after {delay}s...")
                time.sleep(delay)
            resp = requests.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp
        except requests.exceptions.RequestException as e:
            print(f"    Attempt {attempt + 1}/{max_retries} failed: {e}")
    return None


def fetch_ccadb():
    """Fetch CCADB AllCertificateRecordsCSVFormatv4 and parse it."""
    print("Fetching CCADB data...")
    url = "https://ccadb.my.salesforce-sites.com/ccadb/AllCertificateRecordsCSVFormatv4"
    resp = fetch_with_retry(url, max_retries=3, initial_delay=10, timeout=120)
    if not resp:
        raise RuntimeError("CCADB fetch failed after retries. Cannot proceed without trust store data.")

    reader = csv.DictReader(io.StringIO(resp.text))
    records = list(reader)
    print(f"  Fetched {len(records)} CCADB records")
    return records


def fetch_crtsh_populations():
    """Scrape crt.sh/cert-populations?groupBy=RootOwner HTML table.
    Returns list of dicts or None if crt.sh is unavailable."""
    print("Fetching crt.sh cert-populations...")
    url = "https://crt.sh/cert-populations?groupBy=RootOwner"
    resp = fetch_with_retry(url, max_retries=4, initial_delay=15, timeout=90)
    if not resp:
        print("  WARNING: crt.sh unavailable after retries")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Find the data table (the one with CA owners)
    tables = soup.find_all("table")
    data_table = None
    for t in tables:
        ths = t.find_all("th")
        if any("CA Owner" in (th.get_text() or "") for th in ths):
            data_table = t
            break

    if not data_table:
        raise ValueError("Could not find cert-populations table")

    rows = data_table.find_all("tr")
    results = []

    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 5:
            continue

        ca_owner = cells[0].get_text(strip=True)
        if not ca_owner:
            continue

        def parse_num(cell):
            text = cell.get_text(strip=True).replace(",", "").replace(" ", "")
            try:
                return int(text)
            except ValueError:
                return 0

        results.append({
            "ca_owner": ca_owner,
            "all_certs": parse_num(cells[1]),
            "unexpired_certs": parse_num(cells[2]),
            "all_precerts": parse_num(cells[3]),
            "unexpired_precerts": parse_num(cells[4]),
        })

    print(f"  Fetched {len(results)} CA owners from crt.sh")

    # Merge entries with the same normalized name (crt.sh often has
    # variant spellings like "D-TRUST" / "D-Trust" / "D-TRUST GmbH"
    # that should be a single CA)
    merged = {}
    for entry in results:
        key = normalize_name(entry["ca_owner"])
        if key in merged:
            merged[key]["all_certs"] += entry["all_certs"]
            merged[key]["unexpired_certs"] += entry["unexpired_certs"]
            merged[key]["all_precerts"] += entry["all_precerts"]
            merged[key]["unexpired_precerts"] += entry["unexpired_precerts"]
            # Keep the name with the most certs as the canonical name
            if entry["unexpired_precerts"] > merged[key].get("_best_certs", 0):
                merged[key]["ca_owner"] = entry["ca_owner"]
                merged[key]["_best_certs"] = entry["unexpired_precerts"]
        else:
            merged[key] = dict(entry)
            merged[key]["_best_certs"] = entry["unexpired_precerts"]

    deduped = list(merged.values())
    for entry in deduped:
        entry.pop("_best_certs", None)

    if len(deduped) < len(results):
        print(f"  Merged {len(results)} -> {len(deduped)} entries (deduplicated by normalized name)")

    return deduped


def normalize_name(name):
    """Normalize a CA owner name for fuzzy matching."""
    n = name.strip().lower()
    # Normalize punctuation before suffix removal
    n = n.replace(".,", ", ").replace("  ", " ")  # "CO.,LTD." -> "CO., LTD."
    # Remove common suffixes
    for suffix in [", inc.", ", inc", " inc.", " inc", ", llc", " llc",
                   ", ltd.", ", ltd", " ltd.", " ltd",
                   " co., ltd.", " co., ltd", " co. ltd.",
                   ", s.a.", " s.a.", " s.a", ", sa", " sa",
                   " nv-sa", " nv", " ag", " gmbh",
                   " corporation", " corp.", " corp",
                   " s.p.a.", " s.p.a", " b.v.", " b.v",
                   " (pty) ltd", " pty ltd", " ad",
                   " s.r.l.", " s.r.l", " sas", " a.s."]:
        if n.endswith(suffix):
            n = n[:-len(suffix)]
    # Remove parens content
    n = re.sub(r'\s*\(.*?\)', '', n)
    # Collapse whitespace and trailing punctuation
    n = re.sub(r'\s+', ' ', n).strip().rstrip('.,; ')
    return n


def build_trust_store_profile(ccadb_records):
    """
    For each CA Owner, determine trust store membership from CCADB root records.

    Returns dict keyed by CA Owner name:
    {
        "ca_owner": str,
        "country": str,
        "roots": [{
            "name": str,
            "sha256": str,
            "mozilla_status": str,
            "microsoft_status": str,
            "chrome_status": str,
            "apple_status": str,
            "valid_from": str,
            "valid_to": str,
            "tls_capable": bool,
            "smime_capable": bool,
            "code_signing_capable": bool,
            "trust_bits": str,
        }],
        "intermediates_count": int,
        "trusted_by": {
            "mozilla": bool,   # at least one root "Included"
            "microsoft": bool,
            "chrome": bool,
            "apple": bool,
        },
        "trust_store_count": int,  # how many of the 4 stores include this CA
        "root_count": int,
    }
    """
    print("Building trust store profiles from CCADB...")

    # Build canonical name map: normalize -> most-common original form
    from collections import Counter
    name_counts = Counter()
    for rec in ccadb_records:
        ca = rec.get("CA Owner", "").strip()
        if ca:
            name_counts[ca] += 1
    canonical_names = {}
    norm_groups = defaultdict(list)
    for name in name_counts:
        norm_groups[normalize_name(name)].append(name)
    for norm, names in norm_groups.items():
        # Pick the most frequent variant as canonical
        canonical = max(names, key=lambda n: name_counts[n])
        for name in names:
            canonical_names[name] = canonical
    merged_count = sum(1 for g in norm_groups.values() if len(g) > 1)
    if merged_count:
        print(f"  Merging {merged_count} CCADB CA Owner name variants")

    owners = defaultdict(lambda: {
        "roots": [],
        "intermediates": [],
        "intermediates_count": 0,
        "countries": set(),
    })

    for rec in ccadb_records:
        ca_owner = rec.get("CA Owner", "").strip()
        if not ca_owner:
            continue
        # Use canonical name to merge variants
        ca_owner = canonical_names.get(ca_owner, ca_owner)

        record_type = rec.get("Certificate Record Type", "")

        if record_type == "Root Certificate":
            root_info = {
                "name": rec.get("Certificate Name", ""),
                "sha256": rec.get("SHA-256 Fingerprint", ""),
                "mozilla_status": rec.get("Mozilla Status", ""),
                "microsoft_status": rec.get("Microsoft Status", ""),
                "chrome_status": rec.get("Chrome Status", ""),
                "apple_status": rec.get("Apple Status", ""),
                "valid_from": rec.get("Valid From (GMT)", ""),
                "valid_to": rec.get("Valid To (GMT)", ""),
                "tls_capable": rec.get("TLS Capable", "").lower() == "true",
                "ev_capable": rec.get("TLS EV Capable", "").lower() == "true",
                "smime_capable": rec.get("S/MIME Capable", "").lower() == "true",
                "code_signing_capable": rec.get("Code Signing Capable", "").lower() == "true",
                "trust_bits": rec.get("Derived Trust Bits", ""),
                "trust_bits_for_root": rec.get("Trust Bits for Root Cert", ""),
                "ev_oids": rec.get("EV OIDs for Root Cert", ""),
            }
            owners[ca_owner]["roots"].append(root_info)

        elif record_type == "Intermediate Certificate":
            owners[ca_owner]["intermediates_count"] += 1
            revocation = rec.get("Revocation Status", "").strip()
            if revocation not in ("Revoked", "Parent Cert Revoked"):
                int_info = {
                    "name": rec.get("Certificate Name", ""),
                    "sha256": rec.get("SHA-256 Fingerprint", ""),
                    "subject_key_id": rec.get("Subject Key Identifier", "").strip(),
                    "parent_name": rec.get("Parent Certificate Name", ""),
                    "parent_sha256": rec.get("Parent SHA-256 Fingerprint", ""),
                    "valid_from": rec.get("Valid From (GMT)", ""),
                    "valid_to": rec.get("Valid To (GMT)", ""),
                    "tls_capable": rec.get("TLS Capable", "").lower() == "true",
                    "ev_capable": rec.get("TLS EV Capable", "").lower() == "true",
                    "smime_capable": rec.get("S/MIME Capable", "").lower() == "true",
                    "code_signing_capable": rec.get("Code Signing Capable", "").lower() == "true",
                    "technically_constrained": rec.get("Technically Constrained", "").lower() == "true",
                }
                owners[ca_owner]["intermediates"].append(int_info)

        country = rec.get("Country", "").strip()
        if country:
            owners[ca_owner]["countries"].add(country)

    # Now compute trust store membership
    profiles = {}
    for ca_owner, data in owners.items():
        trusted_by = {
            "mozilla": False,
            "microsoft": False,
            "chrome": False,
            "apple": False,
        }

        for root in data["roots"]:
            if root["mozilla_status"] == "Included":
                trusted_by["mozilla"] = True
            if root["microsoft_status"] == "Included":
                trusted_by["microsoft"] = True
            if root["chrome_status"] == "Included":
                trusted_by["chrome"] = True
            if root["apple_status"] == "Included":
                trusted_by["apple"] = True

        trust_store_count = sum(1 for v in trusted_by.values() if v)

        profiles[ca_owner] = {
            "ca_owner": ca_owner,
            "country": ", ".join(sorted(data["countries"])) if data["countries"] else "",
            "roots": data["roots"],
            "root_count": len(data["roots"]),
            "intermediates_count": len(data["intermediates"]),  # de-duplicated by SKI
            "trusted_by": trusted_by,
            "trust_store_count": trust_store_count,
        }

        # Include intermediates that chain to a currently-included, non-expired root.
        # An intermediate qualifies if its parent_sha256 matches a root that is
        # "Included" in at least one store and whose valid_to date hasn't passed.
        from datetime import datetime, timezone
        now_utc = datetime.now(timezone.utc)
        included_root_fps = set()
        for root in data["roots"]:
            is_included = any(
                root[k] == "Included"
                for k in ["mozilla_status", "microsoft_status", "chrome_status", "apple_status"]
            )
            if not is_included:
                continue
            # Check expiration: valid_to format varies (e.g. "2029.06.30", "Jun 30 00:00:00 2029 GMT")
            vt = root.get("valid_to", "")
            expired = False
            if vt:
                try:
                    # Try YYYY.MM.DD format first
                    parts = vt.split(".")
                    if len(parts) == 3 and len(parts[0]) == 4:
                        exp = datetime(int(parts[0]), int(parts[1]), int(parts[2]), tzinfo=timezone.utc)
                        expired = exp < now_utc
                except (ValueError, IndexError):
                    pass
            if not expired:
                included_root_fps.add(root["sha256"])

        # Filter intermediates: must chain to a trusted non-expired root and not be expired itself
        trusted_intermediates = []
        for inter in data["intermediates"]:
            if inter.get("parent_sha256") not in included_root_fps:
                continue
            # Check intermediate expiration
            vt = inter.get("valid_to", "")
            if vt:
                try:
                    parts = vt.split(".")
                    if len(parts) == 3 and len(parts[0]) == 4:
                        exp = datetime(int(parts[0]), int(parts[1]), int(parts[2]), tzinfo=timezone.utc)
                        if exp < now_utc:
                            continue
                except (ValueError, IndexError):
                    pass
            trusted_intermediates.append(inter)

        # De-duplicate by Subject Key Identifier (SKI). Cross-signed intermediates
        # share the same key but chain to different roots, producing multiple CCADB
        # records for one logical issuing CA. Keep one representative per SKI
        # (preferring the one with the latest validity).
        seen_ski = {}
        deduped = []
        for inter in trusted_intermediates:
            ski = inter.get("subject_key_id", "")
            if not ski:
                deduped.append(inter)
                continue
            if ski in seen_ski:
                if inter["valid_to"] > seen_ski[ski]["valid_to"]:
                    seen_ski[ski] = inter
            else:
                seen_ski[ski] = inter
        deduped.extend(seen_ski.values())

        profiles[ca_owner]["intermediates"] = deduped
        profiles[ca_owner]["intermediates_count"] = len(deduped)

    print(f"  Built profiles for {len(profiles)} CA owners")
    return profiles


def join_data(crtsh_data, ccadb_profiles):
    """
    Join crt.sh issuance data with CCADB trust store profiles.
    Returns the merged dataset.
    """
    print("Joining crt.sh and CCADB data...")

    # Build lookup by normalized name
    ccadb_by_norm = {}
    for name, profile in ccadb_profiles.items():
        norm = normalize_name(name)
        ccadb_by_norm[norm] = profile

    # Also keep exact name lookup
    ccadb_by_exact = dict(ccadb_profiles)

    joined = []
    unmatched_crtsh = []

    total_unexpired_precerts = sum(r["unexpired_precerts"] for r in crtsh_data)

    for entry in crtsh_data:
        ca_owner = entry["ca_owner"]

        # Try exact match first
        profile = ccadb_by_exact.get(ca_owner)

        # Try normalized match
        if not profile:
            norm = normalize_name(ca_owner)
            profile = ccadb_by_norm.get(norm)

        # Try manual mapping
        if not profile and ca_owner in MANUAL_NAME_MAP:
            mapped = MANUAL_NAME_MAP[ca_owner]
            profile = ccadb_by_exact.get(mapped)

        pct = (entry["unexpired_precerts"] / total_unexpired_precerts * 100) if total_unexpired_precerts else 0

        record = {
            "ca_owner": ca_owner,
            "all_certs": entry["all_certs"],
            "unexpired_certs": entry["unexpired_certs"],
            "all_precerts": entry["all_precerts"],
            "unexpired_precerts": entry["unexpired_precerts"],
            "market_share_pct": round(pct, 4),
            "matched": profile is not None,
        }

        if profile:
            record["country"] = profile["country"]
            record["trusted_by"] = profile["trusted_by"]
            record["trust_store_count"] = profile["trust_store_count"]
            record["root_count"] = profile["root_count"]
            record["intermediates_count"] = profile["intermediates_count"]
            record["inferred"] = False
            # Aggregate capabilities across roots
            record["tls_capable"] = any(r["tls_capable"] for r in profile["roots"])
            record["ev_capable"] = any(r["ev_capable"] for r in profile["roots"])
            record["smime_capable"] = any(r["smime_capable"] for r in profile["roots"])
            record["code_signing_capable"] = any(r["code_signing_capable"] for r in profile["roots"])
            # Apply enrichment annotations even for matched CAs (e.g. issuance caveats)
            enrichment = ENRICHMENTS.get(ca_owner, {})
            if enrichment.get("note"):
                record["note"] = enrichment["note"]
            if enrichment.get("issuance_caveat"):
                record["issuance_caveat"] = enrichment["issuance_caveat"]
            if enrichment.get("parent_ca"):
                record["parent_ca"] = enrichment["parent_ca"]
        else:
            unmatched_crtsh.append(ca_owner)
            # Check enrichments for manual data
            enrichment = ENRICHMENTS.get(ca_owner, {})
            record["country"] = enrichment.get("country", "")
            record["full_name"] = enrichment.get("full_name", ca_owner)
            record["note"] = enrichment.get("note", "")
            record["parent_ca"] = enrichment.get("parent_ca", "")
            record["inferred"] = enrichment.get("inferred", False)
            record["trusted_by"] = {"mozilla": False, "microsoft": False, "chrome": False, "apple": False}
            record["trust_store_count"] = 0
            record["root_count"] = 0
            record["intermediates_count"] = 0
            record["tls_capable"] = enrichment.get("tls_capable", False)
            record["ev_capable"] = enrichment.get("ev_capable", False)
            record["smime_capable"] = enrichment.get("smime_capable", False)
            record["code_signing_capable"] = enrichment.get("code_signing_capable", False)

        joined.append(record)

    # Sort by unexpired precerts descending
    joined.sort(key=lambda x: x["unexpired_precerts"], reverse=True)

    # Add cumulative percentage
    cumulative = 0
    for rec in joined:
        cumulative += rec["market_share_pct"]
        rec["cumulative_pct"] = round(cumulative, 4)
        rec["rank"] = joined.index(rec) + 1

    if unmatched_crtsh:
        print(f"  WARNING: {len(unmatched_crtsh)} crt.sh CA owners unmatched in CCADB:")
        for name in unmatched_crtsh[:20]:
            print(f"    - {name}")

    print(f"  Joined {len(joined)} records")
    return joined


def detect_cross_sign_attribution(ccadb_records):
    """Detect CAs whose issuance may be misattributed due to cross-signed roots.
    
    When CA-A's root is cross-signed under CA-B's root, crt.sh attributes
    CA-A's issuance to CA-B. CA-A is undercounted, CA-B is overcounted.
    
    CCADB records cross-signs as intermediate certs whose name matches
    a root cert but whose parent is owned by a different CA. However,
    cross-signing can create records in both directions in CCADB, so we
    collect all relationships first, then use issuance volume to resolve
    direction when both sides appear.
    
    Returns (undercounted, overcounted) dicts mapping CA owner -> set of affected owners.
    """
    from collections import defaultdict
    
    root_owners_by_name = defaultdict(set)
    for r in ccadb_records:
        if r.get("Certificate Record Type") == "Root Certificate":
            root_owners_by_name[r.get("Certificate Name", "")].add(r.get("CA Owner", ""))
    
    # Collect all cross-sign relationships as (subject_owner, parent_owner) pairs
    # meaning: subject_owner has a root that is also an intermediate under parent_owner's root
    relationships = set()
    
    for r in ccadb_records:
        if r.get("Certificate Record Type") != "Intermediate Certificate":
            continue
        cert_name = r.get("Certificate Name", "")
        parent_name = r.get("Parent Certificate Name", "")
        
        if cert_name not in root_owners_by_name:
            continue
        
        self_signed_owners = root_owners_by_name[cert_name]
        parent_owners = root_owners_by_name.get(parent_name, set())
        for po in parent_owners:
            if po not in self_signed_owners:
                for so in self_signed_owners:
                    relationships.add((so, po))
    
    return relationships


def apply_cross_sign_flags(joined, ccadb_records):
    """Apply cross-sign attribution flags to market share records.
    
    Uses issuance volume to resolve direction: when A and B have cross-sign
    relationships in both directions, the higher-volume CA is the one whose
    issuance is being misattributed (undercounted), and the lower-volume CA
    is overcounted. When the relationship is one-directional, direction is clear.
    """
    relationships = detect_cross_sign_attribution(ccadb_records)
    
    # Build volume lookup from joined data
    volume = {}
    for rec in joined:
        volume[rec["ca_owner"]] = rec.get("all_certs", 0) + rec.get("all_precerts", 0)
    
    # For each relationship (subject, parent), subject's volume may be attributed to parent.
    # But if (parent, subject) also exists, use volume to determine who's actually undercounted.
    from collections import defaultdict
    undercounted = defaultdict(set)  # CA -> set of CAs that may hold its volume
    overcounted = defaultdict(set)   # CA -> set of CAs whose volume it may hold
    
    processed = set()
    for (a, b) in relationships:
        pair = tuple(sorted([a, b]))
        if pair in processed:
            continue
        processed.add(pair)
        
        reverse_exists = (b, a) in relationships
        
        if not reverse_exists:
            # One-directional: a's root is cross-signed under b's root
            # a is undercounted, b is overcounted
            undercounted[a].add(b)
            overcounted[b].add(a)
        else:
            # Bidirectional in CCADB — use volume to resolve.
            # The CA with more volume is the one being misattributed (undercounted),
            # because crt.sh attributes to the root owner, and the larger CA's
            # certificates chaining through the smaller CA's root is the common pattern.
            vol_a = volume.get(a, 0)
            vol_b = volume.get(b, 0)
            if vol_a > vol_b:
                undercounted[a].add(b)
                overcounted[b].add(a)
            elif vol_b > vol_a:
                undercounted[b].add(a)
                overcounted[a].add(b)
            else:
                # Equal or both zero — flag both as ambiguous
                undercounted[a].add(b)
                undercounted[b].add(a)
    
    flagged = 0
    for rec in joined:
        ca = rec["ca_owner"]
        if ca in undercounted:
            attribution_targets = sorted(undercounted[ca])
            rec["issuance_caveat"] = "undercounted_cross_sign"
            rec["attribution_note"] = (
                f"Volume may be undercounted. Cross-signed roots mean some certificates "
                f"issued under {ca} may be attributed to: {', '.join(attribution_targets)}."
            )
            flagged += 1
        if ca in overcounted:
            sources = sorted(overcounted[ca])
            rec["overcounted_from"] = sources
    
    if flagged:
        print(f"  Flagged {flagged} CAs with cross-sign attribution caveats")


def build_trust_surface_summary(ccadb_profiles):
    """Build summary statistics about the trust surface."""
    print("Building trust surface summary...")

    summary = {
        "total_ca_owners": len(ccadb_profiles),
        "by_store": {
            "mozilla": {"included": 0, "removed": 0, "not_included": 0},
            "microsoft": {"included": 0, "removed": 0, "not_included": 0},
            "chrome": {"included": 0, "removed": 0, "not_included": 0},
            "apple": {"included": 0, "removed": 0, "not_included": 0},
        },
        "by_trust_store_count": defaultdict(int),
        "by_country": defaultdict(int),
        "total_roots": 0,
        "total_intermediates": 0,
        "capabilities": {
            "tls": 0,
            "ev": 0,
            "smime": 0,
            "code_signing": 0,
        },
    }

    store_key_map = {
        "mozilla": "mozilla_status",
        "microsoft": "microsoft_status",
        "chrome": "chrome_status",
        "apple": "apple_status",
    }

    all_roots = []
    for profile in ccadb_profiles.values():
        summary["total_intermediates"] += profile["intermediates_count"]
        summary["by_trust_store_count"][str(profile["trust_store_count"])] += 1

        if profile["country"]:
            summary["by_country"][profile["country"]] += 1

        for root in profile["roots"]:
            summary["total_roots"] += 1
            all_roots.append(root)

            for store_name, status_key in store_key_map.items():
                status = root[status_key]
                if status == "Included":
                    summary["by_store"][store_name]["included"] += 1
                elif status in ("Removed", "Revoked"):
                    summary["by_store"][store_name]["removed"] += 1
                else:
                    summary["by_store"][store_name]["not_included"] += 1

            if root["tls_capable"]:
                summary["capabilities"]["tls"] += 1
            if root["ev_capable"]:
                summary["capabilities"]["ev"] += 1
            if root["smime_capable"]:
                summary["capabilities"]["smime"] += 1
            if root["code_signing_capable"]:
                summary["capabilities"]["code_signing"] += 1

    # Convert defaultdicts
    summary["by_trust_store_count"] = dict(summary["by_trust_store_count"])
    summary["by_country"] = dict(sorted(summary["by_country"].items(), key=lambda x: -x[1]))

    return summary


def build_ca_detail_records(ccadb_profiles, pem_data=None):
    """Build detailed per-CA records for the detail view.
    
    If pem_data is provided (dict of sha256 -> PEM string), includes the PEM
    for each root and intermediate certificate so the UI can render the
    Peculiar certificate viewer without fetching from crt.sh.
    """
    if pem_data is None:
        pem_data = {}
    details = {}
    pem_hits = 0
    for ca_owner, profile in ccadb_profiles.items():
        # Only include CAs with at least one currently included root
        has_included = any(
            root[k] == "Included"
            for root in profile["roots"]
            for k in ["mozilla_status", "microsoft_status", "chrome_status", "apple_status"]
        )
        if not has_included:
            continue

        detail = {
            "ca_owner": ca_owner,
            "country": profile["country"],
            "root_count": profile["root_count"],
            "intermediates_count": profile["intermediates_count"],
            "trusted_by": profile["trusted_by"],
            "trust_store_count": profile["trust_store_count"],
            "roots": [],
            "intermediates": [],
        }
        for root in profile["roots"]:
            entry = {
                "name": root["name"],
                "sha256": root["sha256"],
                "mozilla_status": root["mozilla_status"],
                "microsoft_status": root["microsoft_status"],
                "chrome_status": root["chrome_status"],
                "apple_status": root["apple_status"],
                "valid_from": root["valid_from"],
                "valid_to": root["valid_to"],
                "tls_capable": root["tls_capable"],
                "ev_capable": root["ev_capable"],
                "smime_capable": root["smime_capable"],
                "code_signing_capable": root["code_signing_capable"],
                "trust_bits": root["trust_bits"],
            }
            pem = pem_data.get(root["sha256"].upper(), "")
            if pem:
                entry["pem"] = pem
                pem_hits += 1
            detail["roots"].append(entry)
        for inter in profile.get("intermediates", []):
            entry = {
                "name": inter["name"],
                "sha256": inter["sha256"],
                "parent_name": inter["parent_name"],
                "valid_from": inter["valid_from"],
                "valid_to": inter["valid_to"],
                "tls_capable": inter["tls_capable"],
                "ev_capable": inter["ev_capable"],
                "smime_capable": inter["smime_capable"],
                "code_signing_capable": inter["code_signing_capable"],
                "technically_constrained": inter.get("technically_constrained", False),
            }
            pem = pem_data.get(inter["sha256"].upper(), "")
            if pem:
                entry["pem"] = pem
                pem_hits += 1
            detail["intermediates"].append(entry)
        details[ca_owner] = detail
    if pem_data:
        print(f"  Embedded PEM data for {pem_hits} certificates")
    return details


def slugify(name):
    """Generate a filesystem-safe slug from a CA owner name."""
    # Common abbreviations
    abbrevs = {
        "Internet Security Research Group": "isrg",
        "Google Trust Services LLC": "google-trust",
        "IdenTrust Services, LLC": "identrust",
        "GlobalSign nv-sa": "globalsign",
        "Taiwan-CA Inc. (TWCA)": "twca",
        "SECOM Trust Systems CO., LTD.": "secom",
        "Deutsche Telekom Security GmbH": "deutsche-telekom",
    }
    if name in abbrevs:
        return abbrevs[name]
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')[:60]
    return slug


def split_ca_details(ca_details):
    """Write individual CA detail files and an index for lazy loading."""
    print("Splitting CA details into per-CA files...")
    ca_dir = OUTPUT_DIR / "ca"
    ca_dir.mkdir(parents=True, exist_ok=True)

    index = []
    for ca_owner, detail in ca_details.items():
        slug = slugify(ca_owner)
        index.append({
            "ca_owner": ca_owner,
            "slug": slug,
            "country": detail["country"],
            "trust_store_count": detail["trust_store_count"],
            "root_count": detail["root_count"],
        })

        ca_file = ca_dir / f"{slug}.json"
        detail["slug"] = slug
        with open(ca_file, "w") as f:
            json.dump(detail, f, indent=2, default=str)

    index_file = ca_dir / "_index.json"
    with open(index_file, "w") as f:
        json.dump(index, f, indent=2, default=str)

    print(f"  Wrote {len(index)} CA detail files + index")


def build_geography(market_data):
    """Build geographic concentration data from market share records."""
    print("Building geographic data...")

    REGION_MAP = {
        "United States of America": "United States", "US": "United States",
        "USA": "United States", "United States": "United States",
        "United Kingdom": "Europe", "Belgium": "Europe", "Italy": "Europe",
        "Germany": "Europe", "France": "Europe", "Spain": "Europe",
        "Netherlands": "Europe", "Austria": "Europe", "Greece": "Europe",
        "Polska": "Europe", "Poland": "Europe", "Sweden": "Europe",
        "Norway": "Europe", "Finland": "Europe", "Czech Republic": "Europe",
        "Hungary": "Europe", "Slovakia": "Europe", "Romania": "Europe",
        "Croatia": "Europe", "Slovenia": "Europe", "Ireland": "Europe",
        "Latvia": "Europe", "Lithuania": "Europe", "Estonia": "Europe",
        "Luxembourg": "Europe", "Denmark": "Europe", "Bulgaria": "Europe",
        "Serbia": "Europe", "Portugal": "Europe", "Switzerland": "Europe",
        "United Kingdom of Great Britain and Northern Ireland": "Europe",
        "España": "Europe", "SPAIN": "Europe",
        "Japan": "Asia-Pacific", "China": "Asia-Pacific", "\u4e2d\u56fd": "Asia-Pacific",
        "Taiwan (Republic of China)": "Asia-Pacific",
        "Taiwan, Republic of China": "Asia-Pacific",
        "Republic of Korea (South Korea)": "Asia-Pacific",
        "India": "Asia-Pacific", "Malaysia": "Asia-Pacific",
        "Thailand": "Asia-Pacific", "Singapore": "Asia-Pacific",
        "Indonesia": "Asia-Pacific", "Hong Kong": "Asia-Pacific",
        "Australia": "Asia-Pacific", "Pakistan": "Asia-Pacific",
        "Bangladesh": "Asia-Pacific", "Sri Lanka": "Asia-Pacific",
        "Brazil": "Americas", "Canada": "Americas",
        "Colombia": "Americas", "Mexico": "Americas",
        "Chile": "Americas", "Uruguay": "Americas",
        "Venezuela": "Americas", "Brasil": "Americas", "Bermuda": "Americas",
        "Turkey": "Middle East / Africa", "Israel": "Middle East / Africa",
        "Saudi Arabia": "Middle East / Africa", "Qatar": "Middle East / Africa",
        "UAE": "Middle East / Africa", "Bahrain": "Middle East / Africa",
        "Tunisia": "Middle East / Africa", "South Africa": "Middle East / Africa",
        "Algeria": "Middle East / Africa", "Sudan": "Middle East / Africa",
        "Cabo Verde": "Middle East / Africa",
    }

    # Normalize variant country names before aggregation
    COUNTRY_NORMALIZE = {
        "United States of America": "United States",
        "US": "United States", "USA": "United States",
        "United Kingdom of Great Britain and Northern Ireland": "United Kingdom",
        "República de Panamá": "Panama",
        "España": "Spain", "SPAIN": "Spain",
        "Polska": "Poland",
        "Republic of Korea (South Korea)": "South Korea",
        "Taiwan, Republic of China": "Taiwan",
        "Taiwan (Republic of China)": "Taiwan",
        "\u4e2d\u56fd": "China",
        "NL": "Netherlands",
        "UAE": "United Arab Emirates",
        "Cabo Verde": "Cape Verde",
        "Brasil": "Brazil",
    }

    total = sum(d["unexpired_precerts"] for d in market_data)
    region_issued = defaultdict(int)
    country_issued = defaultdict(lambda: {"issued": 0, "ca_count": 0, "region": ""})

    for d in market_data:
        co = d.get("country", "") or ""
        co = COUNTRY_NORMALIZE.get(co, co)  # normalize before aggregating
        issued = d["unexpired_precerts"]
        if not co:
            region_issued["Unknown"] += issued
            continue
        region = REGION_MAP.get(co, "Other")
        region_issued[region] += issued
        country_issued[co]["issued"] += issued
        country_issued[co]["ca_count"] += 1
        country_issued[co]["region"] = region

    regions = []
    for region, issued in sorted(region_issued.items(), key=lambda x: -x[1]):
        pct = round((issued / total) * 100, 4) if total else 0
        countries = []
        for co, info in sorted(country_issued.items(), key=lambda x: -x[1]["issued"]):
            if info["region"] == region:
                countries.append({
                    "country": co,
                    "issued": info["issued"],
                    "pct": round((info["issued"] / total) * 100, 4),
                    "ca_count": info["ca_count"],
                })
        regions.append({"region": region, "issued": issued, "pct": pct, "countries": countries})

    return {"total": total, "regions": regions}


def build_gov_risk(market_data, ccadb_profiles):
    """Build government risk analysis from classifications and market data."""
    print("Building government risk data...")

    type_labels = {
        "government": "Government-Operated",
        "state_enterprise": "State-Owned Enterprise",
    }

    total_issued = sum(d["unexpired_precerts"] for d in market_data)
    classified = []

    for d in market_data:
        ca = d["ca_owner"]
        gc = GOV_CLASSIFICATIONS.get(ca)
        if gc:
            classified.append({
                "ca_owner": ca,
                "type": gc["type"],
                "type_label": type_labels.get(gc["type"], gc["type"]),
                "state_influence": gc.get("state_influence", ""),
                "jurisdiction": gc.get("jurisdiction", ""),
                "issued": d["unexpired_precerts"],
                "pct": round((d["unexpired_precerts"] / total_issued) * 100, 4) if total_issued else 0,
                "trust_store_count": d.get("trust_store_count", 0),
                "trusted_by": d.get("trusted_by", {}),
            })

    # Also check CCADB profiles for gov CAs that might not be in market data
    # (zero issuance but still trusted)
    market_names = {d["ca_owner"] for d in market_data}
    for ca, gc in GOV_CLASSIFICATIONS.items():
        if ca not in market_names and ca in ccadb_profiles:
            profile = ccadb_profiles[ca]
            if profile["trust_store_count"] > 0:
                classified.append({
                    "ca_owner": ca,
                    "type": gc["type"],
                    "type_label": type_labels.get(gc["type"], gc["type"]),
                    "state_influence": gc.get("state_influence", ""),
                    "jurisdiction": gc.get("jurisdiction", ""),
                    "issued": 0,
                    "pct": 0,
                    "trust_store_count": profile["trust_store_count"],
                    "trusted_by": profile["trusted_by"],
                })

    # Summary by type
    by_type = defaultdict(lambda: {"count": 0, "issued": 0, "pct": 0})
    for c in classified:
        t = c["type"]
        by_type[t]["count"] += 1
        by_type[t]["issued"] += c["issued"]
        by_type[t]["pct"] += c["pct"]

    # Summary by jurisdiction
    by_jurisdiction = defaultdict(lambda: {"count": 0, "issued": 0, "types": set()})
    for c in classified:
        j = c["jurisdiction"]
        by_jurisdiction[j]["count"] += 1
        by_jurisdiction[j]["issued"] += c["issued"]
        by_jurisdiction[j]["types"].add(c["type"])

    return {
        "classified_cas": sorted(classified, key=lambda x: -x["issued"]),
        "by_type": {
            t: {"label": type_labels.get(t, t), "count": v["count"], "issued": v["issued"],
                "pct": round(v["pct"], 4)}
            for t, v in sorted(by_type.items(), key=lambda x: -x[1]["issued"])
        },
        "by_jurisdiction": [
            {"jurisdiction": j, "count": v["count"], "issued": v["issued"],
             "types": sorted(v["types"])}
            for j, v in sorted(by_jurisdiction.items(), key=lambda x: -x[1]["issued"])
        ],
        "total_gov_state": sum(v["count"] for t, v in by_type.items() if t in ("government", "state_enterprise")),
        "total_gov_state_pct": round(sum(v["pct"] for t, v in by_type.items() if t in ("government", "state_enterprise")), 4),
        "total_classified": len(classified),
    }


def build_trust_intersections(ccadb_profiles):
    """Build trust store intersection data showing shared attack surface."""
    print("Building trust store intersections...")

    store_keys = {
        "Mozilla": "mozilla_status",
        "Microsoft": "microsoft_status",
        "Chrome": "chrome_status",
        "Apple": "apple_status",
    }

    # For each included root, record which stores
    root_combos = defaultdict(int)
    owner_stores = {}

    for ca, profile in ccadb_profiles.items():
        ca_stores = set()
        for root in profile["roots"]:
            stores = frozenset(
                name for name, key in store_keys.items()
                if root[key] == "Included"
            )
            if stores:
                root_combos[tuple(sorted(stores))] += 1
                ca_stores.update(stores)

        if ca_stores:
            owner_stores[ca] = tuple(sorted(ca_stores))

    # Owner combos
    owner_combos = defaultdict(int)
    for ca, stores in owner_stores.items():
        owner_combos[stores] += 1

    # Per-store totals (active only)
    store_roots = {}
    store_owners = {}
    for store_name, status_key in store_keys.items():
        roots = 0
        owners = set()
        for ca, profile in ccadb_profiles.items():
            has_included = False
            for root in profile["roots"]:
                if root[status_key] == "Included":
                    roots += 1
                    has_included = True
            if has_included:
                owners.add(ca)
        store_roots[store_name] = roots
        store_owners[store_name] = len(owners)

    # Key intersection numbers
    all4_roots = root_combos.get(("Apple", "Chrome", "Microsoft", "Mozilla"), 0)
    all4_owners = owner_combos.get(("Apple", "Chrome", "Microsoft", "Mozilla"), 0)

    return {
        "root_combinations": [
            {"stores": list(k), "root_count": v}
            for k, v in sorted(root_combos.items(), key=lambda x: -x[1])
        ],
        "owner_combinations": [
            {"stores": list(k), "owner_count": v}
            for k, v in sorted(owner_combos.items(), key=lambda x: -x[1])
        ],
        "per_store": {
            name: {"roots": store_roots[name], "owners": store_owners[name]}
            for name in store_keys
        },
        "all_four_stores": {"roots": all4_roots, "owners": all4_owners},
        "total_active_owners": len(owner_stores),
        "total_included_roots": sum(root_combos.values()),
    }


def load_previous_market_data():
    """Load previous market_share.json if it exists, for crt.sh fallback."""
    path = OUTPUT_DIR / "market_share.json"
    if path.exists():
        with open(path) as f:
            data = json.load(f)
        print(f"  Loaded previous market data ({len(data)} records)")
        return data
    return None


def append_history(metadata, market_data, intersections, gov_risk):
    """Append a compact daily snapshot to history.json for longitudinal analysis,
    and preserve full outputs in a dated snapshot directory."""
    history_path = OUTPUT_DIR / "history.json"

    # Load existing history
    if history_path.exists():
        with open(history_path) as f:
            history = json.load(f)
    else:
        history = {"snapshots": []}

    # Build today's snapshot - compact, just the metrics that matter over time
    today = metadata["generated_at"][:10]  # YYYY-MM-DD

    # Don't duplicate if we already ran today
    if history["snapshots"] and history["snapshots"][-1].get("date") == today:
        history["snapshots"].pop()

    snapshot = {
        "date": today,
        "generated_at": metadata["generated_at"],
        "crtsh_available": metadata["crtsh_available"],
    }

    if market_data:
        total = sum(d.get("unexpired_precerts", 0) for d in market_data)
        snapshot["total_unexpired"] = total
        snapshot["active_ca_count"] = len([d for d in market_data if d.get("trust_store_count", 0) > 0])

        # Top 10 market shares for tracking concentration over time
        snapshot["top10"] = [
            {"ca": d["ca_owner"], "pct": d["market_share_pct"]}
            for d in market_data[:10]
        ]

        # Per-CA cert counts for longitudinal growth/decline tracking
        # Compact: just id, unexpired count, and all-time count
        snapshot["ca_certs"] = [
            {
                "id": d.get("slug", d["ca_owner"][:30].lower().replace(" ", "-")),
                "v": d["unexpired_precerts"],
                "at": d.get("all_time_precerts", 0),
            }
            for d in market_data
            if d.get("trust_store_count", 0) > 0
        ]

        # HHI
        if total > 0:
            snapshot["hhi"] = round(sum(
                ((d["unexpired_precerts"] / total) * 100) ** 2
                for d in market_data
            ))

    if intersections:
        snapshot["roots_all4"] = intersections["all_four_stores"]["roots"]
        snapshot["owners_all4"] = intersections["all_four_stores"]["owners"]
        snapshot["total_roots"] = intersections["total_included_roots"]
        snapshot["total_active_owners"] = intersections["total_active_owners"]
        snapshot["per_store"] = {
            store: {"roots": data["roots"], "owners": data["owners"]}
            for store, data in intersections["per_store"].items()
        }

    if gov_risk:
        snapshot["gov_classified"] = gov_risk["total_classified"]

    history["snapshots"].append(snapshot)

    with open(history_path, "w") as f:
        json.dump(history, f, indent=2, default=str)

    print(f"  Appended snapshot for {today} ({len(history['snapshots'])} total snapshots)")

    # Preserve full daily snapshot in dated directory
    # These accumulate over time and enable full recovery if the pipeline
    # goes down. Keep only the latest per day (overwrites if re-run).
    snapshots_dir = OUTPUT_DIR / "snapshots" / today
    snapshots_dir.mkdir(parents=True, exist_ok=True)

    snapshot_files = {
        "metadata.json": metadata,
        "intersections.json": intersections,
    }
    if market_data:
        snapshot_files["market_share.json"] = market_data
        if gov_risk:
            snapshot_files["gov_risk.json"] = gov_risk

    for filename, data in snapshot_files.items():
        path = snapshots_dir / filename
        with open(path, "w") as f:
            json.dump(data, f, separators=(",", ":"), default=str)

    print(f"  Preserved full snapshot in snapshots/{today}/ ({len(snapshot_files)} files)")


def main():
    print(f"WebPKI Observatory Pipeline - {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    # Fetch data
    ccadb_records = fetch_ccadb()
    crtsh_data = fetch_crtsh_populations()

    # Build CCADB profiles (always fresh)
    ccadb_profiles = build_trust_store_profile(ccadb_records)

    # Handle crt.sh being down
    crtsh_available = crtsh_data is not None
    if crtsh_available:
        market_data = join_data(crtsh_data, ccadb_profiles)
        apply_cross_sign_flags(market_data, ccadb_records)
    else:
        print("  crt.sh unavailable, falling back to previous market data")
        market_data = load_previous_market_data()
        if not market_data:
            print("  ERROR: No previous market data and crt.sh is down. Skipping market-dependent outputs.")

    # Build trust surface summary (CCADB-only, always fresh)
    trust_summary = build_trust_surface_summary(ccadb_profiles)

    # Load PEM certificate data from cache (written by fetch_root_algo.py).
    # These get embedded in per-CA detail files so the cert viewer works
    # without any runtime fetches.
    pem_cache_path = PIPELINE_DIR / "pem_cache.json"
    pem_data = {}
    if pem_cache_path.exists():
        try:
            with open(pem_cache_path) as f:
                pem_data = json.load(f)
            print(f"  Loaded PEM cache: {len(pem_data)} certificates")
        except Exception as e:
            print(f"  WARNING: Could not load PEM cache: {e}")
    else:
        print("  No PEM cache found (run fetch_root_algo.py to generate)")

    # Build CA detail records (CCADB-only, always fresh)
    ca_details = build_ca_detail_records(ccadb_profiles, pem_data=pem_data)

    # Build trust store intersections (CCADB-only, always fresh)
    intersections = build_trust_intersections(ccadb_profiles)

    # Write outputs
    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ccadb_record_count": len(ccadb_records),
        "crtsh_ca_count": len(crtsh_data) if crtsh_data else 0,
        "crtsh_available": crtsh_available,
        "ccadb_ca_owner_count": len(ccadb_profiles),
    }

    # Always write CCADB-derived outputs
    outputs = {
        "metadata.json": metadata,
        "trust_surface.json": trust_summary,
        "intersections.json": intersections,
    }

    # Split CA details into per-CA files for lazy loading
    split_ca_details(ca_details)

    # Only write market-dependent outputs if we have data
    if market_data:
        geography = build_geography(market_data)
        gov_risk = build_gov_risk(market_data, ccadb_profiles)
        outputs["market_share.json"] = market_data
        outputs["geography.json"] = geography
        outputs["gov_risk.json"] = gov_risk

    for filename, data in outputs.items():
        path = OUTPUT_DIR / filename
        with open(path, "w") as f:
            json.dump(data, f, indent=2, default=str)
        size_kb = path.stat().st_size / 1024
        print(f"  Wrote {filename} ({size_kb:.1f} KB)")

    if not crtsh_available:
        print("\n  NOTE: crt.sh was unavailable. CCADB outputs updated, market data preserved from last successful run.")

    # Append daily snapshot for longitudinal tracking
    append_history(
        metadata,
        market_data,
        intersections,
        gov_risk if market_data else None,
    )

    print("\nDone!")
    return 0


if __name__ == "__main__":
    sys.exit(main())


