#!/usr/bin/env python3
"""
Generate analyst-quality TabIntro text for each Observatory tab using Claude.

Reads the LLM snapshot, extracts a concise data digest, and calls the
Anthropic API to produce one paragraph per tab that:
  - States the key finding from this tab's data with specific numbers
  - Connects it to related tabs (where relevant)
  - Uses plain declarative sentences — no hype, no hedging

Output: data/tab_intros.json
Fallback: if generation fails, existing static text is used unchanged.

Run: python pipeline/fetch_tab_intros.py
CI: runs daily after export_llm_snapshot.py
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR   = os.environ.get("PIPELINE_DATA_DIR", "data")
SCRIPT_DIR = Path(__file__).parent
NOW        = datetime.now(timezone.utc)

# ── Model ──
MODEL = "claude-sonnet-4-5-20251022"

# ── Tab definitions (id, label, focus) ──
TABS = [
    ("market",      "Market Share",           "CA issuance volume, concentration, web coverage per CA"),
    ("trust",       "Trust Surface",          "Root program inclusion, store disagreements, trust surface size"),
    ("conc",        "Concentration Risk",     "HHI, top-N share, systemic dependency"),
    ("tail",        "Long Tail Risk",         "Low-volume CAs with full trust store inclusion"),
    ("geo",         "Geographic Risk",        "CA jurisdiction distribution, regional concentration"),
    ("gov",         "Government Risk",        "State-operated and state-owned CAs, trust store presence"),
    ("jurisdiction","Jurisdiction Risk",      "Legal frameworks, compelled disclosure risk by country"),
    ("ops",         "Operational Risk",       "Incident rates, self-detection, policy/disclosure failures"),
    ("crypto",      "Cryptographic Posture",  "Root algorithms, key sizes, standards compliance"),
    ("distrust",    "Distrust History",       "All browser distrust events, posture, compliance patterns"),
    ("policy",      "BR Readiness",          "CA/B Forum baseline requirements validity reduction readiness — which CAs are ready for 200d/100d/47d thresholds"),
    ("governance",  "Governance Risk",        "Root program oversight coverage, declining rates, Microsoft"),
    ("community",   "Ecosystem Participation","CABF member activity, ballot leadership, silent majority"),
]


def build_digest(snap: dict) -> dict:
    """Extract a concise data digest from the snapshot for the prompt."""
    m = snap.get("market", [])
    dm_totals = snap["governance"]["discoveryMethods"]["totals"]
    grand = sum(dm_totals.values()) or 1
    cov = snap["governance"]["coverageRateByYear"]
    ep = snap["ecosystemParticipation"]
    inc = snap["incidents"]
    wb = inc.get("whiteboardTags", {})
    cats = inc.get("categories", [])
    dist_events = snap.get("distrustEvents", [])
    dist_stats  = snap.get("distrustStats", {})
    conc = snap.get("concentration", {})

    OPS_TAGS = {
        "inadequate_incident_response", "pattern_of_issues",
        "lack_of_meaningful_improvement", "non_responsive_to_root_programs",
        "minimized_severity", "active_deception", "hidden_corporate_changes",
        "concealed_breach_or_incident", "delayed_or_refused_revocation",
    }
    pattern_count = sum(
        1 for e in dist_events
        if "pattern_of_issues" in (e.get("reasonTags") or e.get("reason_tags") or [])
    )
    ops_count = sum(
        1 for e in dist_events
        if any(t in (e.get("reasonTags") or e.get("reason_tags") or []) for t in OPS_TAGS)
    )

    pms = snap["governance"]["programCommentSummary"]

    return {
        "generatedAt": NOW.isoformat(),
        "market": {
            "top5": [
                {"ca": c["caOwner"], "sharePct": round(c["share"], 1)}
                for c in m[:5]
            ],
            "cr3Pct": conc.get("cr3"),
            "cr5Pct": conc.get("cr5"),
            "hhi": conc.get("hhi"),
            "totalTrustedCAs": len(m),
            "tailCAs": sum(1 for c in m if c.get("share", 0) < 0.01),
        },
        "incidents": {
            "total": inc["total"],
            "caCount": inc["caCount"],
            "categories": cats,
            "policyFailure": wb.get("policy-failure", 0),
            "disclosureFailure": wb.get("disclosure-failure", 0),
            "auditFinding": wb.get("audit-finding", 0),
        },
        "discovery": {
            "selfPct": round(dm_totals["self_detected"] / grand * 100),
            "rootProgramPct": round(dm_totals["root_program"] / grand * 100),
            "automatedToolsPct": round(dm_totals["community"] / grand * 100),
            "externalResearcherPct": round(dm_totals["external_researcher"] / grand * 100),
            "auditPct": round(dm_totals["audit"] / grand * 100),
        },
        "distrust": {
            "totalEvents": dist_stats.get("totalEvents", len(dist_events)),
            "patternOfIssuesCount": pattern_count,
            "complianceOpsFailureCount": ops_count,
            "postureDistribution": dist_stats.get("postureDistribution", {}),
            "medianRunwayDays": dist_stats.get("medianRunwayDays"),
        },
        "governance": {
            "coverageRateLatestFullYear": cov[-2] if len(cov) >= 2 else cov[-1] if cov else None,
            "coverageRate2019": next((y for y in cov if y["y"] == 2019), None),
            "programCommentSummary": {
                prog: {
                    "bugsOversight": pms[prog]["bugs_oversight"],
                    "bugsSubstantive": pms[prog]["bugs_technical_oversight"],
                    "recentSubstantive": pms[prog]["recent_bugs_technical_oversight"],
                }
                for prog in ["chrome", "mozilla", "apple", "microsoft"]
                if prog in pms
            },
            "bugCorpusTotal": snap["governance"]["meta"]["bugsTotal"],
        },
        "ecosystem": {
            "cabfMemberCount": ep["cabfMemberCount"],
            "activeMemberCount": ep["activeMemberCount"],
            "zeroContributionCount": ep["zeroContributionCount"],
            "topOrg": ep["topOrganizations"][0]["name"] if ep.get("topOrganizations") else None,
            "topBallotIndividual": ep["topBallotIndividuals"][0] if ep.get("topBallotIndividuals") else None,
        },
        "government": {
            "govCAs": snap["governmentRisk"]["total"],
            "issuancePct": snap["governmentRisk"]["issuancePct"],
        },
        "jurisdiction": {
            "highRisk": [j["country"] for j in snap.get("jurisdictionRisk", []) if j.get("risk") == "high"],
            "moderateRisk": [j["country"] for j in snap.get("jurisdictionRisk", []) if j.get("risk") == "moderate"],
        },
        "chromeGrowth": {
            "from": snap["chromeRootStoreGrowth"]["entries"][0]["totalRoots"],
            "to": snap["chromeRootStoreGrowth"]["entries"][-1]["totalRoots"],
            "fromDate": snap["chromeRootStoreGrowth"]["entries"][0]["date"],
        },
        "browser": snap["browserCoverage"],
    }


def build_prompt(digest: dict) -> str:
    tab_list = "\n".join(f"  {i+1}. {label} ({focus})" for i, (_, label, focus) in enumerate(TABS))
    return f"""You are writing analyst notes for the WebPKI Observatory, a public dashboard that measures trust, risk, and governance in the internet's certificate infrastructure. The site has 13 tabs that tell a connected story about who issues certificates, where the risks are, and how well the system is governed.

Here is the current data digest:
{json.dumps(digest, indent=2)}

Write one paragraph for each of these 13 tabs:
{tab_list}

Requirements for each paragraph:
- 2-4 sentences, plain declarative prose
- Lead with the most important finding from that tab's data, using specific numbers from the digest
- Where natural, connect to another tab's data — show how this tab's finding relates to what comes before or after
- No hype, no hedging, no "this tab shows" framing — write as if briefing a PKI professional
- Do not mention ForgeIQ, any vendor, or any commercial product
- Do not use em dashes or colons as section labels
- Write in present tense

Return a JSON object with keys matching these tab IDs exactly:
{json.dumps([tab_id for tab_id, _, _ in TABS])}

Each value is the paragraph string. Return only the JSON object, no markdown fences."""


def call_api(prompt: str) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set")

    payload = json.dumps({
        "model": MODEL,
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read())

    text = body["content"][0]["text"].strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0].strip()

    return json.loads(text)


def main():
    print(f"fetch_tab_intros.py — {NOW.isoformat()[:19]}")

    snap_path = Path(DATA_DIR) / "llm_snapshot.json"
    if not snap_path.exists():
        print(f"ERROR: {snap_path} not found — run export_llm_snapshot.py first")
        sys.exit(1)

    snap = json.loads(snap_path.read_text())
    digest = build_digest(snap)
    prompt = build_prompt(digest)

    print(f"  Prompt: ~{len(prompt)//4} tokens")
    print(f"  Calling {MODEL}...")

    try:
        intros = call_api(prompt)
    except Exception as e:
        print(f"  ERROR: {e}")
        # Write an empty file so CI doesn't fail — UI falls back to static text
        out = {"generatedAt": NOW.isoformat(), "error": str(e), "intros": {}}
        Path(DATA_DIR, "tab_intros.json").write_text(json.dumps(out, indent=2))
        sys.exit(0)

    # Validate all tabs are present
    missing = [tab_id for tab_id, _, _ in TABS if tab_id not in intros]
    if missing:
        print(f"  WARNING: missing tabs: {missing}")

    out = {
        "generatedAt": NOW.isoformat(),
        "model": MODEL,
        "intros": intros,
    }

    out_path = Path(DATA_DIR) / "tab_intros.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"  Wrote {out_path} ({out_path.stat().st_size // 1024}KB)")
    print(f"  Generated {len(intros)} tab intros")

    # Print a sample
    sample_id = "ops"
    if sample_id in intros:
        print(f"\n  Sample ({sample_id}):")
        print(f"  {intros[sample_id][:200]}...")


if __name__ == "__main__":
    main()
