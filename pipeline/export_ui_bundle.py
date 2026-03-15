#!/usr/bin/env python3
"""
export_ui_bundle.py — Pre-build step that produces the UI data bundle.

Replaces the 400-line Vite transform. Reads all pipeline JSON outputs
and produces data/ui_bundle.json in the exact shape that PipelineContext
expects. The Vite plugin becomes a ~30 line passthrough.

Run: python pipeline/export_ui_bundle.py
CI:  runs after all pipeline scripts, before `npm run build`
"""
import json
import os
import re
import sys

# Shared config
sys.path.insert(0, os.path.dirname(__file__))
from config import BR_VALIDITY, DISTRUST_OVERRIDES, COUNTRY_NAMES

DATA_DIR = os.environ.get("PIPELINE_DATA_DIR", "data")
PIPELINE_DIR = os.environ.get("PIPELINE_DIR", "pipeline")

for arg in sys.argv[1:]:
    if arg.startswith("--data-dir="):
        DATA_DIR = arg.split("=", 1)[1]
    elif arg.startswith("--pipeline-dir="):
        PIPELINE_DIR = arg.split("=", 1)[1]


def load_json(directory, filename):
    path = os.path.join(directory, filename)
    if not os.path.exists(path):
        print(f"  WARNING: {path} not found")
        return None
    with open(path) as f:
        return json.load(f)


def slugify(name):
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", (name or "").lower()))


def norm_country(c):
    return COUNTRY_NAMES.get(c, c) if c else ""


def main():
    print("Generating UI bundle...")

    # ── Load pipeline outputs ──
    market_share = load_json(DATA_DIR, "market_share.json") or []
    intersections = load_json(DATA_DIR, "intersections.json") or {}
    geography = load_json(DATA_DIR, "geography.json") or {}
    gov_risk = load_json(DATA_DIR, "gov_risk.json") or {}
    incidents = load_json(DATA_DIR, "incidents.json") or {}
    jurisdiction_risk = load_json(DATA_DIR, "jurisdiction_risk.json") or {}
    root_algo_json = load_json(DATA_DIR, "root_algorithms.json") or {}
    browser_cov_json = load_json(DATA_DIR, "browser_coverage.json") or {}
    rpe_data = load_json(DATA_DIR, "root_program_effectiveness.json")
    community_data = load_json(DATA_DIR, "community_engagement.json")

    # Load per-CA detail files
    ca_details = {}
    ca_dir = os.path.join(DATA_DIR, "ca")
    if os.path.isdir(ca_dir):
        for fn in os.listdir(ca_dir):
            if fn.endswith(".json") and not fn.startswith("_"):
                slug = fn[:-5]
                data = load_json(ca_dir, fn)
                if isinstance(data, dict):
                    ca_details[slug] = data

    # Distrust data
    distrust_data = load_json(PIPELINE_DIR, "distrust/distrusted.json") or {"events": [], "stats": {}, "taxonomy": {}}

    # ═══════════════════════════════════════════════════════════════
    # CA_DATA — exact same shape as Vite's D array
    # ═══════════════════════════════════════════════════════════════
    pipeline_slug_lookup = {}
    for file_slug, ca in ca_details.items():
        if ca and ca.get("ca_owner"):
            pipeline_slug_lookup[ca["ca_owner"]] = file_slug

    D = []
    for ca in market_share:
        all_precerts = ca.get("all_precerts", 0)
        unexpired = ca.get("unexpired_precerts", 0)
        turnover = all_precerts / unexpired if unexpired > 0 and all_precerts > 0 else 0
        usage_days = round(365 / turnover) if turnover > 0 else 0

        entry = {
            "rank": ca.get("rank", 0),
            "caOwner": ca.get("ca_owner", ""),
            "certs": unexpired,
            "allTimeCerts": all_precerts,
            "turnover": round(turnover, 1),
            "avgDays": usage_days,
            "avgMonths": round(usage_days / 30.44, 1),
            "share": ca.get("market_share_pct", 0),
            "trustedBy": ca.get("trusted_by", {}),
            "storeCount": ca.get("trust_store_count", 0),
            "country": norm_country(ca.get("country", "")),
            "rootCount": ca.get("root_count", 0),
            "intermediateCount": ca.get("intermediates_count", 0),
            "tls": ca.get("tls_capable", False),
            "ev": ca.get("ev_capable", False),
            "smime": ca.get("smime_capable", False),
            "codeSigning": ca.get("code_signing_capable", False),
            "matched": ca.get("matched", False),
            "inferred": ca.get("inferred", False),
            "parent": ca.get("parent_ca", ""),
            "id": slugify(ca.get("ca_owner", "")),
            "caSlug": pipeline_slug_lookup.get(ca.get("ca_owner", ""), slugify(ca.get("ca_owner", ""))),
            "note": ca.get("attribution_note", ca.get("note", "")),
            "issuanceCaveat": ca.get("issuance_caveat", ""),
        }
        D.append(entry)

    # Distrust overrides
    for entry in D:
        if entry["caOwner"] in DISTRUST_OVERRIDES:
            entry["storeCount"] = 0
            entry["trustedBy"] = {"mozilla": False, "chrome": False, "microsoft": False, "apple": False}
            entry["note"] = DISTRUST_OVERRIDES[entry["caOwner"]]["reason"]

    print(f"  CA_DATA: {len(D)} CAs")

    # ═══════════════════════════════════════════════════════════════
    # INTERSECTIONS — renamed fields, capitalized store names
    # ═══════════════════════════════════════════════════════════════
    IX = {
        "rootCombinations": [
            {"stores": c.get("stores", []), "s": c.get("stores", []), "count": c.get("root_count", 0)}
            for c in intersections.get("root_combinations", [])
        ],
        "ownerCombinations": [
            {"stores": c.get("stores", []), "count": c.get("owner_count", 0)}
            for c in intersections.get("owner_combinations", [])
        ],
        "perStore": {
            store[0].upper() + store[1:]: {"roots": data.get("roots", 0), "owners": data.get("owners", 0)}
            for store, data in intersections.get("per_store", {}).items()
        },
        "allFourStores": {
            "roots": intersections.get("all_four_stores", {}).get("roots", 0),
            "owners": intersections.get("all_four_stores", {}).get("owners", 0),
        },
        "activeOwners": intersections.get("total_active_owners", 0),
        "totalRoots": intersections.get("total_included_roots", 0),
    }

    # ═══════════════════════════════════════════════════════════════
    # GEOGRAPHY — recomputed from trusted CAs only
    # ═══════════════════════════════════════════════════════════════
    trusted_cas = [d for d in D if d["storeCount"] > 0 or d["parent"]]
    total_trusted_certs = sum(d["certs"] for d in trusted_cas)

    region_for_country = {}
    for r in geography.get("regions", []):
        for c in r.get("countries", []):
            region_for_country[norm_country(c["country"])] = r["region"]

    region_agg = {}
    for d in trusted_cas:
        country = d["country"]
        region = region_for_country.get(country)
        if not region:
            continue
        if region not in region_agg:
            region_agg[region] = {"certs": 0, "countries": {}}
        region_agg[region]["certs"] += d["certs"]
        if country not in region_agg[region]["countries"]:
            region_agg[region]["countries"][country] = {"certs": 0, "count": 0}
        region_agg[region]["countries"][country]["certs"] += d["certs"]
        region_agg[region]["countries"][country]["count"] += 1

    GEO = []
    for region in geography.get("regions", []):
        agg = region_agg.get(region["region"], {"certs": 0, "countries": {}})
        region_pct = round((agg["certs"] / total_trusted_certs) * 100, 4) if total_trusted_certs > 0 else 0
        countries_arr = []
        for c in region.get("countries", []):
            cn = norm_country(c["country"])
            ca = agg["countries"].get(cn)
            if not ca or ca["count"] == 0:
                continue
            countries_arr.append({
                "c": cn,
                "p": round((ca["certs"] / total_trusted_certs) * 100, 4) if total_trusted_certs > 0 else 0,
                "n": ca["count"],
            })
        total_region_cas = sum(c["n"] for c in countries_arr)
        if total_region_cas == 0:
            continue
        GEO.append({
            "rg": region["region"],
            "p": region_pct,
            "v": agg["certs"],
            "cs": countries_arr,
            "n": total_region_cas,
        })

    # ═══════════════════════════════════════════════════════════════
    # GOV_RISK — trusted only, recomputed summaries
    # ═══════════════════════════════════════════════════════════════
    type_code_map = {"government": "GO", "state_enterprise": "SE"}
    trusted_gov_cas = []
    for ca in gov_risk.get("classified_cas", []):
        if (ca.get("trust_store_count") or 0) <= 0:
            continue
        ca_owner = ca.get("ca_owner", ca.get("ca", ""))
        if ca_owner in DISTRUST_OVERRIDES:
            continue
        trusted_gov_cas.append({
            "caOwner": ca_owner,
            "type": type_code_map.get(ca.get("type"), ca.get("type", "")),
            "jurisdiction": norm_country(ca.get("jurisdiction", "")),
            "influence": ca.get("state_influence", ca.get("info", "")),
            "certs": ca.get("issued", ca.get("certs", 0)),
            "storeCount": ca.get("trust_store_count", 0),
            "id": ca.get("id", slugify(ca_owner)),
        })

    gov_by_type = {}
    for ca in trusted_gov_cas:
        tk = "go" if ca["type"] == "GO" else "se"
        if tk not in gov_by_type:
            gov_by_type[tk] = {"l": "Government-Operated" if tk == "go" else "State-Owned Enterprise", "c": 0, "certs": 0}
        gov_by_type[tk]["c"] += 1
        gov_by_type[tk]["certs"] += ca["certs"]
    for v in gov_by_type.values():
        v["p"] = round((v["certs"] / total_trusted_certs) * 100, 2) if total_trusted_certs > 0 else 0

    GOV = {
        "t": gov_by_type,
        "n": len(trusted_gov_cas),
        "cas": trusted_gov_cas,
    }

    # ═══════════════════════════════════════════════════════════════
    # INCIDENTS_DATA — add trusted flag, pass through rest
    # ═══════════════════════════════════════════════════════════════
    trusted_ids = set(d["id"] for d in trusted_cas)
    OPS_DATA = {
        "total": incidents.get("total", 0),
        "ca_count": incidents.get("ca_count", 0),
        "years": incidents.get("years", []),
        "categories": incidents.get("categories", []),
        "cas": [
            {**ca, "id": ca.get("id", slugify(ca.get("ca", ""))), "trusted": slugify(ca.get("ca", "")) in trusted_ids}
            for ca in incidents.get("cas", [])
        ],
        "yearsByClass": incidents.get("yearsByClass", []),
        "fingerprints": incidents.get("fingerprints", []),
        "distrusted_excluded": incidents.get("distrusted_excluded", []),
    }

    # ═══════════════════════════════════════════════════════════════
    # ROOTS — per-CA embedded root certs (compact form)
    # ═══════════════════════════════════════════════════════════════
    ROOTS_DATA = {}
    for file_slug, ca in ca_details.items():
        if not ca or not ca.get("roots"):
            continue
        included = [r for r in ca["roots"]
                    if r.get("mozilla_status") == "Included" or r.get("chrome_status") == "Included"
                    or r.get("microsoft_status") == "Included" or r.get("apple_status") == "Included"]
        if not included:
            continue
        key = slugify(ca.get("ca_owner", file_slug))
        ROOTS_DATA[key] = [
            {
                "name": r.get("name", ""),
                "sha256": r.get("sha256", ""),
                "stores": "".join(filter(None, [
                    "M" if r.get("mozilla_status") == "Included" else None,
                    "C" if r.get("chrome_status") == "Included" else None,
                    "S" if r.get("microsoft_status") == "Included" else None,
                    "A" if r.get("apple_status") == "Included" else None,
                ])),
                "capabilities": "".join(filter(None, [
                    "T" if r.get("tls_capable") else None,
                    "E" if r.get("ev_capable") else None,
                    "S" if r.get("smime_capable") else None,
                    "C" if r.get("code_signing_capable") else None,
                ])),
                "validFrom": r.get("valid_from", ""),
                "validTo": r.get("valid_to", ""),
            }
            for r in included
        ]

    # ═══════════════════════════════════════════════════════════════
    # INCIDENT_COUNTS — lookup by CA slug
    # ═══════════════════════════════════════════════════════════════
    INC_LOOKUP = {}
    for ca in OPS_DATA["cas"]:
        ca_id = ca.get("id", slugify(ca.get("ca", "")))
        INC_LOOKUP[ca_id] = ca.get("n", 0)

    # ═══════════════════════════════════════════════════════════════
    # BR_VALIDITY — from shared config
    # ═══════════════════════════════════════════════════════════════

    # ═══════════════════════════════════════════════════════════════
    # BROWSER_COVERAGE
    # ═══════════════════════════════════════════════════════════════
    cov = browser_cov_json.get("coverage", {}) if browser_cov_json else {}
    BROWSER_COVERAGE = {
        "chrome": cov.get("chrome", 0.77),
        "apple": cov.get("apple", 0.18),
        "mozilla": cov.get("mozilla", 0.025),
        "microsoft": cov.get("microsoft", 0.005),
        "notes": (browser_cov_json or {}).get("notes", "Web browsing coverage from StatCounter."),
    }

    # ═══════════════════════════════════════════════════════════════
    # SLUG_NAMES — pipeline slug → display name
    # ═══════════════════════════════════════════════════════════════
    SLUG_NAMES = {}
    for file_slug, ca in ca_details.items():
        if ca and ca.get("ca_owner"):
            SLUG_NAMES[file_slug] = ca["ca_owner"]

    # ═══════════════════════════════════════════════════════════════
    # ROOT_ALGO — trusted CAs only, with ms_id cross-reference
    # ═══════════════════════════════════════════════════════════════
    algo_owner_to_ms_id = {d["caOwner"]: d["id"] for d in D}
    trusted_owners = set(d["caOwner"] for d in trusted_cas)
    ROOT_ALGO = [
        {**r, "ms_id": algo_owner_to_ms_id.get(r.get("ca_owner", ""), slugify(r.get("ca_owner", "")))}
        for r in (root_algo_json.get("roots") or [])
        if r.get("ca_owner") in trusted_owners
    ]

    # ═══════════════════════════════════════════════════════════════
    # Assemble — exact same keys as vite.config.js output
    # ═══════════════════════════════════════════════════════════════
    output = {
        "CA_DATA": D,
        "BR_VALIDITY": BR_VALIDITY,
        "BROWSER_COVERAGE": BROWSER_COVERAGE,
        "INTERSECTIONS": IX,
        "GEOGRAPHY": GEO,
        "GOV_RISK": GOV,
        "INCIDENTS_DATA": OPS_DATA,
        "ROOTS": ROOTS_DATA,
        "INCIDENT_COUNTS": INC_LOOKUP,
        "SLUG_NAMES": SLUG_NAMES,
        "JURISDICTION_RISK": jurisdiction_risk,
        "ROOT_ALGO": ROOT_ALGO,
        "DISTRUST_DATA": distrust_data,
        "RPE_DATA": rpe_data,
        "COMMUNITY_DATA": community_data,
    }

    out_path = os.path.join(DATA_DIR, "ui_bundle.json")
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    size = os.path.getsize(out_path)
    roots_count = sum(len(v) for v in ROOTS_DATA.values())
    print(f"  Wrote {out_path} ({size:,} bytes)")
    print(f"  {len(D)} CAs, {len(ROOTS_DATA)} CAs with roots, {roots_count} roots, {len(OPS_DATA['cas'])} CAs with incidents")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: export_ui_bundle.py failed: {e}", file=sys.stderr)
        sys.exit(1)
