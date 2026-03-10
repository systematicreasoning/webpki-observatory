#!/usr/bin/env python3
"""
export_llm_snapshot.py — Generate an LLM-ready snapshot of the WebPKI Observatory.

Reads all pipeline output JSON files and produces a single, self-describing
JSON document (~65-70K tokens) conforming to the published schema at:
  https://webpki.systematicreasoning.com/schema.json

Outputs:
  data/llm_snapshot.json              — stable URL, always current
  data/llm_snapshot_YYYY-MM-DD.json   — dated archive copy

Usage:
  python pipeline/export_llm_snapshot.py [--data-dir data/] [--pipeline-dir pipeline/]
"""
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone

SCHEMA_VERSION = "1.0.0"
SCHEMA_URL = "https://webpki.systematicreasoning.com/schema.json"
SNAPSHOT_URL = "https://webpki.systematicreasoning.com/llm_snapshot.json"

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
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))


COUNTRY_NAMES = {
    "US": "United States", "USA": "United States",
    "United States of America": "United States",
    "UK": "United Kingdom", "Republic of Korea": "South Korea",
    "Korea": "South Korea", "Türkiye": "Turkey",
    "Türkiye (Turkey)": "Turkey", "Czech Republic": "Czechia",
    "People's Republic of China": "China",
    "Hong Kong SAR": "Hong Kong", "The Netherlands": "Netherlands",
}


def norm_country(c):
    return COUNTRY_NAMES.get(c, c)


def main():
    print("Generating LLM snapshot...")
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    # ── Load all pipeline outputs ──
    market_share = load_json(DATA_DIR, "market_share.json") or []
    intersections = load_json(DATA_DIR, "intersections.json") or {}
    geography = load_json(DATA_DIR, "geography.json") or {}
    gov_risk = load_json(DATA_DIR, "gov_risk.json") or {}
    incidents = load_json(DATA_DIR, "incidents.json") or {}
    jurisdiction_risk = load_json(DATA_DIR, "jurisdiction_risk.json") or {}
    root_algo = load_json(DATA_DIR, "root_algorithms.json") or {}
    browser_cov = load_json(DATA_DIR, "browser_coverage.json") or {}
    rpe = load_json(DATA_DIR, "root_program_effectiveness.json") or {}
    distrust = load_json(PIPELINE_DIR, "distrust/distrusted.json") or {}

    DISTRUST_OVERRIDES = {"Entrust"}

    # ── Incident lookup ──
    inc_by_ca = {}
    for ca in incidents.get("cas", []):
        inc_by_ca[ca.get("ca", "")] = ca

    # ── Browser coverage ──
    cov = browser_cov.get("coverage", {})
    browser_coverage = {
        "chrome": cov.get("chrome", 0.77),
        "apple": cov.get("apple", 0.18),
        "mozilla": cov.get("mozilla", 0.025),
        "microsoft": cov.get("microsoft", 0.005),
    }

    # ═══════════════════════════════════════════════════════════════
    # Section 1: Market
    # ═══════════════════════════════════════════════════════════════
    trusted = [ca for ca in market_share
               if ca.get("trust_store_count", 0) > 0
               and ca.get("ca_owner", "") not in DISTRUST_OVERRIDES]
    total_certs = sum(ca["unexpired_precerts"] for ca in trusted)

    market = []
    for ca in trusted:
        all_time = ca.get("all_precerts", 0)
        unexpired = ca["unexpired_precerts"]
        turnover = all_time / unexpired if unexpired > 0 and all_time > 0 else 0
        usage_days = round(365 / turnover) if turnover > 0 else 0
        tb = ca.get("trusted_by", {})
        web_cov = sum(browser_coverage.get(s, 0) for s, v in tb.items() if v) * 100
        inc = inc_by_ca.get(ca["ca_owner"])
        ppm = None
        self_pct = None
        inc_count = 0
        if inc:
            inc_count = inc.get("n", 0)
            self_pct = inc.get("selfPct")
            if all_time > 0 and inc_count > 0:
                ppm = round((inc_count / all_time) * 1e6, 3)
        market.append({
            "rank": ca["rank"], "id": slugify(ca["ca_owner"]),
            "caSlug": slugify(ca["ca_owner"]), "caOwner": ca["ca_owner"],
            "certs": unexpired, "allTimeCerts": all_time,
            "share": ca.get("market_share_pct", 0),
            "turnover": round(turnover, 1), "usageDays": usage_days,
            "trustedBy": tb, "storeCount": ca.get("trust_store_count", 0),
            "country": norm_country(ca.get("country", "")),
            "rootCount": ca.get("root_count", 0),
            "intermediateCount": ca.get("intermediates_count", 0),
            "webCoverage": round(web_cov, 1),
            "tls": ca.get("tls_capable", False), "ev": ca.get("ev_capable", False),
            "smime": ca.get("smime_capable", False), "codeSigning": ca.get("code_signing_capable", False),
            "ppm": ppm, "selfReportPct": self_pct, "incidentCount": inc_count,
            "matched": ca.get("matched", False), "inferred": ca.get("inferred", False),
            "parent": ca.get("parent_ca", ""),
            "note": ca.get("attribution_note", ca.get("note", "")),
            "issuanceCaveat": ca.get("issuance_caveat", ""),
        })
    print(f"  Market: {len(market)} trusted CAs")

    # ═══════════════════════════════════════════════════════════════
    # Section 2: Concentration
    # ═══════════════════════════════════════════════════════════════
    shares = [ca["share"] for ca in market]
    hhi = round(sum(s ** 2 for s in shares))
    hhi_label = "highly concentrated" if hhi > 2500 else "moderately concentrated" if hhi > 1500 else "unconcentrated"
    cum = 0
    head_count = len(market)
    for i, ca in enumerate(market):
        cum += ca["share"]
        if cum >= 99.99:
            head_count = i + 1
            break
    head_pct = round(sum(shares[:head_count]), 4)
    concentration = {
        "hhi": hhi, "hhiLabel": hhi_label,
        "cr3": round(sum(shares[:3]), 2), "cr5": round(sum(shares[:5]), 2), "cr7": round(sum(shares[:7]), 2),
        "headCount": head_count, "headPct": head_pct,
        "tailCount": len(market) - head_count, "tailPct": round(100 - head_pct, 4),
    }

    # ═══════════════════════════════════════════════════════════════
    # Section 3: Trust Surface
    # ═══════════════════════════════════════════════════════════════
    trust_surface = {
        "totalRoots": intersections.get("total_included_roots", 0),
        "totalOwners": intersections.get("total_active_owners", 0),
        "allFourStores": {
            "roots": intersections.get("all_four_stores", {}).get("roots", 0),
            "owners": intersections.get("all_four_stores", {}).get("owners", 0),
        },
        "perStore": {s: {"roots": d.get("roots", 0), "owners": d.get("owners", 0)}
                     for s, d in intersections.get("per_store", {}).items()},
        "rootCombinations": [{"stores": c.get("stores", []), "count": c.get("root_count", 0)}
                             for c in intersections.get("root_combinations", [])],
        "ownerCombinations": [{"stores": c.get("stores", []), "count": c.get("owner_count", 0)}
                              for c in intersections.get("owner_combinations", [])],
        "capabilities": {
            cap: {"cas": len([ca for ca in market if ca.get(cap)]),
                  "pct": round(len([ca for ca in market if ca.get(cap)]) / max(len(market), 1) * 100)}
            for cap in ["tls", "ev", "smime", "codeSigning"]
        },
    }

    # ═══════════════════════════════════════════════════════════════
    # Section 4: Geography
    # ═══════════════════════════════════════════════════════════════
    geo = []
    for r in geography.get("regions", []):
        region_cas = [ca for ca in market if norm_country(ca["country"]) in
                      [norm_country(c["country"]) for c in r.get("countries", [])]]
        region_certs = sum(ca["certs"] for ca in region_cas)
        region_pct = round((region_certs / total_certs * 100), 2) if total_certs > 0 else 0
        countries = []
        for c in r.get("countries", []):
            cn = norm_country(c["country"])
            c_cas = [ca for ca in market if ca["country"] == cn]
            if not c_cas:
                continue
            c_certs = sum(ca["certs"] for ca in c_cas)
            countries.append({"country": cn, "caCount": len(c_cas),
                              "issuancePct": round((c_certs / total_certs * 100), 2) if total_certs > 0 else 0})
        if not countries:
            continue
        geo.append({"region": r["region"], "caCount": sum(c["caCount"] for c in countries),
                     "issuancePct": region_pct, "certs": region_certs, "countries": countries})

    # ═══════════════════════════════════════════════════════════════
    # Section 5: Government Risk
    # ═══════════════════════════════════════════════════════════════
    type_map = {"government": "government_operated", "state_enterprise": "state_owned_enterprise"}
    gov_cas = []
    for ca in gov_risk.get("classified_cas", []):
        if (ca.get("trust_store_count", 0) or 0) == 0:
            continue
        if ca.get("ca_owner", ca.get("ca", "")) in DISTRUST_OVERRIDES:
            continue
        gov_cas.append({
            "caOwner": ca.get("ca_owner", ca.get("ca", "")),
            "type": type_map.get(ca.get("type"), ca.get("type", "")),
            "country": norm_country(ca.get("jurisdiction", "")),
            "relationship": ca.get("state_influence", ca.get("info", "")),
            "storeCount": ca.get("trust_store_count", 0),
            "certs": ca.get("issued", ca.get("certs", 0)),
        })
    gov_certs = sum(c["certs"] for c in gov_cas)
    go_cas = [c for c in gov_cas if c["type"] == "government_operated"]
    se_cas = [c for c in gov_cas if c["type"] == "state_owned_enterprise"]
    government_risk = {
        "total": len(gov_cas),
        "issuancePct": round((gov_certs / total_certs * 100), 2) if total_certs > 0 else 0,
        "byType": {
            "governmentOperated": {"count": len(go_cas), "certs": sum(c["certs"] for c in go_cas),
                                    "pct": round(sum(c["certs"] for c in go_cas) / max(total_certs, 1) * 100, 2)},
            "stateOwnedEnterprise": {"count": len(se_cas), "certs": sum(c["certs"] for c in se_cas),
                                     "pct": round(sum(c["certs"] for c in se_cas) / max(total_certs, 1) * 100, 2)},
        },
        "cas": gov_cas,
    }

    # ═══════════════════════════════════════════════════════════════
    # Section 6: Jurisdiction Risk
    # ═══════════════════════════════════════════════════════════════
    jrs = []
    for j in jurisdiction_risk.get("jurisdictions", []):
        axes = j.get("axes", {})
        j_cas = [ca for ca in market if ca["country"] == norm_country(j["country"])]
        jrs.append({
            "country": j["country"], "risk": j.get("risk", "low"),
            "axes": {"keySeizure": axes.get("key_seizure", "general"),
                     "compelledIssuance": axes.get("compelled_issuance", "general"),
                     "secrecy": axes.get("secrecy", "none")},
            "summary": j.get("summary", ""),
            "laws": [{"name": l.get("name", ""), "section": l.get("section", ""), "excerpt": l.get("excerpt", "")}
                     for l in j.get("laws", [])],
            "caCount": len(j_cas),
            "exposedCerts": sum(ca["certs"] for ca in j_cas),
        })

    # ═══════════════════════════════════════════════════════════════
    # Section 7: Incidents (GAP 3 FIX: include yearsByClass, fingerprints, categories)
    # ═══════════════════════════════════════════════════════════════
    trusted_ids = set(ca["id"] for ca in market)
    per_ca = []
    for ca in incidents.get("cas", []):
        ca_id = slugify(ca.get("ca", ""))
        all_time = 0
        for m in market:
            if m["id"] == ca_id:
                all_time = m["allTimeCerts"]
                break
        ppm = round((ca["n"] / all_time) * 1e6, 3) if all_time > 0 and ca["n"] > 0 else None
        per_ca.append({
            "ca": ca["ca"], "id": ca_id, "count": ca["n"],
            "selfReported": ca.get("self", 0), "externallyReported": ca.get("ext", 0),
            "selfReportPct": ca.get("selfPct", 0), "ppm": ppm,
            "trusted": ca_id in trusted_ids,
        })

    # Classification totals from fingerprints
    cat_totals = {"misissuance": 0, "revocation": 0, "governance": 0, "validation": 0}
    for fp in incidents.get("fingerprints", []):
        cat_totals["misissuance"] += fp.get("mi", 0)
        cat_totals["revocation"] += fp.get("rv", 0)
        cat_totals["governance"] += fp.get("gv", 0)
        cat_totals["validation"] += fp.get("vl", 0)

    # yearsByClass: per-year category breakdown
    years_by_class = [
        {"year": y["y"], "misissuance": y.get("mi", 0), "revocation": y.get("rv", 0),
         "governance": y.get("gv", 0), "validation": y.get("vl", 0)}
        for y in incidents.get("yearsByClass", [])
    ]

    # Per-CA fingerprints: category breakdown per CA
    fingerprints = [
        {"ca": fp["ca"], "misissuance": fp.get("mi", 0), "revocation": fp.get("rv", 0),
         "governance": fp.get("gv", 0), "validation": fp.get("vl", 0)}
        for fp in incidents.get("fingerprints", [])
    ]

    incidents_out = {
        "total": incidents.get("total", 0),
        "caCount": incidents.get("ca_count", 0),
        "years": [{"year": y["y"], "count": y["n"]} for y in incidents.get("years", [])],
        "perCA": per_ca,
        "classification": cat_totals,
        "yearsByClass": years_by_class,
        "fingerprints": fingerprints,
        "categories": [{"category": c["cat"], "count": c["n"]} for c in incidents.get("categories", [])],
    }

    # ═══════════════════════════════════════════════════════════════
    # Section 8: BR Thresholds
    # ═══════════════════════════════════════════════════════════════
    br_thresholds = [
        {"from": "2020-09-01", "days": 398, "label": "398 days"},
        {"from": "2026-03-15", "days": 200, "label": "200 days"},
        {"from": "2027-03-15", "days": 100, "label": "100 days"},
        {"from": "2029-03-15", "days": 47, "label": "47 days"},
    ]

    # ═══════════════════════════════════════════════════════════════
    # Section 9: Crypto + Root Algorithms (GAP 1 FIX: merge store/capability into rootAlgorithms)
    # ═══════════════════════════════════════════════════════════════
    ra_roots = root_algo.get("roots", [])
    trusted_owners = set(ca["caOwner"] for ca in market)
    trusted_roots = [r for r in ra_roots if r.get("ca_owner") in trusted_owners]

    key_families, key_sizes, sig_hashes = {}, {}, {}
    for r in trusted_roots:
        kf = r.get("key_family", "unknown")
        key_families[kf] = key_families.get(kf, 0) + 1
        ks = f'{kf}-{r.get("key_bits", "?")}'
        if kf == "ECC" and r.get("curve"):
            ks = r["curve"]
        key_sizes[ks] = key_sizes.get(ks, 0) + 1
        sh = r.get("sig_hash", "unknown")
        sig_hashes[sh] = sig_hashes.get(sh, 0) + 1

    crypto_summary = {
        "totalRoots": len(trusted_roots), "caCount": len(trusted_owners),
        "keyFamilies": key_families,
        "keySizes": dict(sorted(key_sizes.items(), key=lambda x: -x[1])),
        "sigHashes": dict(sorted(sig_hashes.items(), key=lambda x: -x[1])),
    }

    # Full root list with BOTH algorithm AND store/capability data
    root_algorithms = [
        {
            "name": r.get("name", ""), "caOwner": r.get("ca_owner", ""),
            "sha256": r.get("sha256", ""),
            "keyFamily": r.get("key_family", ""), "keyBits": r.get("key_bits", 0),
            "sigHash": r.get("sig_hash", ""), "curve": r.get("curve"),
            "stores": r.get("stores", ""),
            "validFrom": r.get("not_before", r.get("valid_from", "")),
            "validTo": r.get("not_after", r.get("valid_to", "")),
            "tls": r.get("tls", False), "ev": r.get("ev", False),
            "smime": r.get("smime", False), "codeSigning": r.get("cs", False),
        }
        for r in trusted_roots
    ]

    # ═══════════════════════════════════════════════════════════════
    # Section 10: Distrust (GAP 4 FIX: include timelines and references)
    # ═══════════════════════════════════════════════════════════════
    distrust_events = []
    for e in distrust.get("events", []):
        event = {
            "ca": e["ca"], "caOwner": e.get("ca_owner", e["ca"]),
            "year": e["year"], "country": e.get("country", ""),
            "compliancePosture": e["compliance_posture"],
            "distrustPathway": e.get("distrust_pathway", ""),
            "responseQuality": e.get("response_quality", ""),
            "reasonTags": e.get("reason_tags", []),
            "summary": e.get("summary", ""),
            "distrustDates": e.get("distrust_dates", {}),
            "classificationTier": e.get("classification_tier", "medium"),
            "postureEvidence": e.get("posture_evidence", ""),
            "tagEvidence": e.get("tag_evidence", {}),
        }
        # Timeline (gap 4)
        tl = e.get("timeline", {})
        if tl:
            event["timeline"] = {
                "firstBugDate": tl.get("first_bug_date"),
                "lastBugDate": tl.get("last_bug_date"),
                "distrustDate": tl.get("distrust_date"),
                "runwayDays": tl.get("runway_days"),
            }
        # References (gap 4)
        refs = e.get("references", {})
        if refs:
            event["references"] = {
                "rootProgramAnnouncements": refs.get("root_program_announcements", []),
                "mdspThreads": refs.get("mdsp_threads", []),
                "ccadbThreads": refs.get("ccadb_threads", []),
                "articles": [{"url": a.get("url", ""), "source": a.get("source", ""), "title": a.get("title", "")}
                             for a in refs.get("articles", [])] if isinstance(refs.get("articles"), list) else [],
            }
        distrust_events.append(event)

    posture_dist = Counter(e["compliancePosture"] for e in distrust_events)
    distrust_stats = {"totalEvents": len(distrust_events), "postureDistribution": dict(posture_dist)}

    # ═══════════════════════════════════════════════════════════════
    # Section 11: Governance (GAP 2 FIX: include full RPE data)
    # ═══════════════════════════════════════════════════════════════
    report_card = {}
    for prog in ["chrome", "mozilla", "apple", "microsoft"]:
        rc = rpe.get("report_card", {}).get(prog, {})
        report_card[prog] = {
            "enforcement": rc.get("enforcement", "0/0"),
            "firstPublicAction": rc.get("led", rc.get("initiated", 0)),
            "neverActed": rc.get("never_acted", 0),
            "oversightPct": rc.get("oversight", 0),
            "ballotsProposed": rc.get("proposed", 0),
            "voteParticipation": rc.get("voted", "0/0"),
            "substantiveBallots": rc.get("substantive", 0),
            "caOwners": rc.get("owners", 0),
            "roots": rc.get("roots", 0),
            "exclusiveRoots": rc.get("exclusive", 0),
        }

    governance = {
        "reportCard": report_card,
        "meta": {
            "bugsTotal": rpe.get("meta", {}).get("bugs_total", 0),
            "bugsWithComments": rpe.get("meta", {}).get("bugs_with_comments", 0),
            "totalCommentsAnalyzed": rpe.get("meta", {}).get("total_comments_analyzed", 0),
        },
        # Bug creation (who files bugs)
        "bugCreationByYear": [
            {"year": y.get("y"), "chrome": y.get("chrome", 0), "mozilla": y.get("mozilla", 0),
             "apple": y.get("apple", 0), "microsoft": y.get("microsoft", 0), "other": y.get("other", 0)}
            for y in rpe.get("bug_creation_by_year", [])
        ],
        "bugCreationTotals": rpe.get("bug_creation_totals", {}),
        # Discovery methods
        "discoveryMethods": rpe.get("discovery_methods", {}),
        # Oversight
        "programCommentSummary": rpe.get("program_comment_summary", {}),
        "oversightConcentration": {
            prog: {k: v for k, v in data.items() if k != "contributors"}
            for prog, data in rpe.get("oversight_concentration", {}).items()
        },
        "oversightQuarterly": rpe.get("oversight_quarterly", []),
        # Enforcement detail
        "enforcement": rpe.get("enforcement", {}),
        "distrustEvents": rpe.get("distrust_events", []),
        # Store posture
        "storePosture": rpe.get("store_posture", {}),
        # Policy leadership
        "policyLeadership": rpe.get("policy_leadership", {}),
        # Ballot classification (Who Shapes Policy)
        "ballotClassification": rpe.get("ballot_classification", {}),
        # Notable gaps
        "notableGaps": rpe.get("notable_gaps", {}),
        # Inclusion velocity
        "inclusionVelocity": rpe.get("inclusion_velocity", {}),
    }

    # ═══════════════════════════════════════════════════════════════
    # Assemble
    # ═══════════════════════════════════════════════════════════════
    snapshot = {
        "$schema": SCHEMA_URL,
        "version": SCHEMA_VERSION,
        "generatedAt": now.isoformat(),
        "snapshotUrl": SNAPSHOT_URL,
        "dataSources": {
            "crtSh": "Certificate Transparency logs via crt.sh — unexpired and all-time precertificate counts per CA owner. Updated daily.",
            "ccadb": "Common CA Database (AllCertificateRecordsCSVFormatv4) — root/intermediate metadata, trust store inclusion, CA owner details. Updated daily.",
            "bugzilla": "Mozilla Bugzilla CA Certificate Compliance — incident reports, root program comments, CA responses. 2014-present. Updated daily.",
            "statcounter": "StatCounter global browser market share — mapped to root programs for web coverage estimates. Updated daily.",
            "cabforum": "CA/Browser Forum ballot records — proposers, endorsers, vote results across Server Certificate, Code Signing, S/MIME, and Network Security working groups.",
            "keylength": "keylength.com — cryptographic key size recommendations from NIST, ECRYPT-CSA, BSI, ANSSI, and NSA CNSA.",
        },
        "browserCoverage": browser_coverage,
        "market": market,
        "concentration": concentration,
        "trustSurface": trust_surface,
        "geography": geo,
        "governmentRisk": government_risk,
        "jurisdictionRisk": jrs,
        "incidents": incidents_out,
        "brThresholds": br_thresholds,
        "cryptoSummary": crypto_summary,
        "rootAlgorithms": root_algorithms,
        "distrustEvents": distrust_events,
        "distrustStats": distrust_stats,
        "governance": governance,
    }

    # ── Write ──
    stable_path = os.path.join(DATA_DIR, "llm_snapshot.json")
    dated_path = os.path.join(DATA_DIR, f"llm_snapshot_{today}.json")

    with open(stable_path, "w") as f:
        json.dump(snapshot, f, separators=(",", ":"))
    size = os.path.getsize(stable_path)
    tokens = size // 4
    print(f"  Wrote {stable_path} ({size:,} bytes, ~{tokens:,} tokens)")

    with open(dated_path, "w") as f:
        json.dump(snapshot, f, separators=(",", ":"))
    print(f"  Wrote {dated_path}")

    # ── Validate ──
    assert len(market) > 0, "No trusted CAs"
    assert abs(sum(ca["share"] for ca in market) - 100) < 0.1, "Market shares don't sum to 100%"
    assert len(distrust_events) > 0, "No distrust events"
    assert distrust_stats["totalEvents"] == len(distrust_events), "Stats/events mismatch"
    assert len(root_algorithms) > 0, "No root algorithms"
    assert all("stores" in r for r in root_algorithms), "Root algorithms missing stores field"
    assert all("tls" in r for r in root_algorithms), "Root algorithms missing capability fields"
    assert len(incidents_out.get("yearsByClass", [])) > 0, "No yearsByClass data"
    assert len(incidents_out.get("fingerprints", [])) > 0, "No fingerprint data"
    assert len(governance.get("oversightQuarterly", [])) > 0, "No quarterly oversight data"
    assert len(governance.get("bugCreationByYear", [])) > 0, "No bug creation data"
    print(f"  Validation passed: {len(market)} CAs, {len(distrust_events)} distrust events, "
          f"{incidents_out['total']} incidents, {len(root_algorithms)} roots, "
          f"{len(governance['oversightQuarterly'])} quarterly oversight periods")


if __name__ == "__main__":
    main()
