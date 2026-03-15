#!/usr/bin/env python3
"""
generate_seo.py — Inject crawlable content into the SPA's index.html.

The WebPKI Observatory is a React SPA. Crawlers that don't execute
JavaScript see an empty page. This script runs post-build and injects:

1. A <noscript> block with key findings as semantic HTML — visible to
   any crawler, immediately readable without JS.

2. Per-tab static HTML files under dist/tabs/*.html — separate indexable
   URLs for each tab so Google can surface individual sections.

3. Updated <meta> tags with richer descriptions drawn from live data.

Run: python pipeline/generate_seo.py
CI: runs after vite build, before gh-pages deploy.
"""

import json
import os
import re
from pathlib import Path
from datetime import datetime, timezone

DATA_DIR  = os.environ.get("PIPELINE_DATA_DIR", "data")
DIST_DIR  = os.environ.get("DIST_DIR", "app/dist")
SITE_URL  = "https://webpki.systematicreasoning.com"
NOW       = datetime.now(timezone.utc)


def load_snapshot() -> dict:
    path = Path(DATA_DIR) / "llm_snapshot.json"
    if not path.exists():
        print(f"  WARNING: {path} not found — skipping SEO injection")
        return {}
    return json.loads(path.read_text())


def pct(n: float) -> str:
    return f"{n:.1f}%"


def build_noscript(snap: dict) -> str:
    """Build the full noscript HTML block from snapshot data."""
    if not snap:
        return ""

    m     = snap.get("market", [])
    conc  = snap.get("concentration", {})
    inc   = snap.get("incidents", {})
    cats  = inc.get("categories", [])
    wb    = inc.get("whiteboardTags", {})
    dm    = snap.get("governance", {}).get("discoveryMethods", {}).get("totals", {})
    grand = sum(dm.values()) or 1
    dist  = snap.get("distrustEvents", [])
    dstat = snap.get("distrustStats", {})
    ep    = snap.get("ecosystemParticipation", {})
    gov   = snap.get("governance", {})
    cov   = gov.get("coverageRateByYear", [])
    pcs   = gov.get("programCommentSummary", {})
    geo   = snap.get("geography", [])
    gr    = snap.get("governmentRisk", {})
    ti    = snap.get("tabIntros", {}).get("intros", {})
    gen_at = snap.get("generatedAt", "")[:10]

    top5 = m[:5]
    cr3  = conc.get("cr3", 0)
    cr5  = conc.get("cr5", 0)
    hhi  = conc.get("hhi", 0)

    cov_2019 = next((y for y in cov if y["y"] == 2019), {})
    cov_2025 = next((y for y in cov if y["y"] == 2025), {})

    OPS_TAGS = {
        "inadequate_incident_response", "pattern_of_issues",
        "lack_of_meaningful_improvement", "non_responsive_to_root_programs",
        "minimized_severity", "active_deception", "hidden_corporate_changes",
        "concealed_breach_or_incident", "delayed_or_refused_revocation",
    }
    ops_count    = sum(1 for e in dist if any(t in (e.get("reasonTags") or []) for t in OPS_TAGS))
    pattern_count = sum(1 for e in dist if "pattern_of_issues" in (e.get("reasonTags") or []))

    lines = [
        f'<noscript>',
        f'<article id="observatory-summary">',
        f'<h1>WebPKI Observatory</h1>',
        f'<p>Quantitative analysis of the Certificate Authority ecosystem that underpins TLS on the public internet. '
        f'Data updated daily from Certificate Transparency logs, CCADB, Mozilla Bugzilla, and CA/Browser Forum records. '
        f'Last updated {gen_at}.</p>',
    ]

    # Market Share
    lines += [
        f'<section id="market-share">',
        f'<h2>CA Market Share</h2>',
        f'<p>{ti.get("market", "Certificate issuance is highly concentrated among a small number of Certificate Authorities.")}</p>',
        f'<ul>',
    ]
    for ca in top5:
        lines.append(f'<li>{ca["caOwner"]}: {pct(ca["share"])} of unexpired certificates</li>')
    lines += [
        f'</ul>',
        f'<p>The top 3 CAs account for {pct(cr3)} of all certificate issuance. '
        f'The top 5 account for {pct(cr5)}. '
        f'HHI concentration index: {hhi:,} (above 2,500 is considered highly concentrated). '
        f'{len(m)} Certificate Authorities are currently trusted by at least one major root program.</p>',
        f'</section>',
    ]

    # Incidents
    lines += [
        f'<section id="operational-risk">',
        f'<h2>CA Compliance Incidents</h2>',
        f'<p>{ti.get("ops", "CA compliance incidents are predominantly process and operations failures, not technical ones.")}</p>',
        f'<p>{inc.get("total", 0):,} compliance incidents across {inc.get("caCount", 0)} Certificate Authorities '
        f'have been publicly documented in Mozilla Bugzilla since 2014.</p>',
        f'<ul>',
    ]
    for cat in cats:
        lines.append(f'<li>{cat["category"]}: {cat["count"]:,} incidents ({cat["count"]/inc.get("total",1)*100:.0f}%)</li>')
    pf = wb.get("policy-failure", 0)
    df = wb.get("disclosure-failure", 0)
    af = wb.get("audit-finding", 0)
    lines += [
        f'</ul>',
        f'<p>Of these incidents: {pf:,} involved CAs violating their own documented policies, '
        f'{df:,} involved failure to disclose issues on time, '
        f'and {af:,} were discovered by auditors rather than by the CA itself.</p>',
    ]

    # Discovery
    self_pct = round(dm.get("self_detected", 0) / grand * 100)
    rp_pct   = round(dm.get("root_program", 0) / grand * 100)
    auto_pct = round(dm.get("community", 0) / grand * 100)
    lines += [
        f'<p>Who discovers CA compliance incidents: root programs find {rp_pct}%, '
        f'automated tools (CT log monitors, linters) find {auto_pct}%, '
        f'and CAs\' own monitoring accounts for only {self_pct}%.</p>',
        f'</section>',
    ]

    # Distrust History
    lines += [
        f'<section id="distrust-history">',
        f'<h2>CA Distrust Events</h2>',
        f'<p>{ti.get("distrust", "Browser distrust of a CA is the ultimate enforcement action in the WebPKI.")}</p>',
        f'<p>{len(dist)} Certificate Authorities have been removed from browser trust stores since 2011. '
        f'{ops_count} of these events involved compliance operations failures — inadequate incident response, '
        f'concealment, or patterns of unresolved issues. '
        f'{pattern_count} had documented recurring patterns of issues across multiple years.</p>',
        f'<ul>',
    ]
    for e in dist:
        lines.append(f'<li>{e["ca"]} ({e["year"]}): {e.get("compliancePosture","").replace("_"," ")}</li>')
    med = dstat.get("medianRunwayDays") or dstat.get("median_runway_days")
    if med:
        lines.append(f'<p>Median time from first compliance incident to distrust: {med} days ({med//365} years).</p>')
    lines.append(f'</section>')

    # Governance
    ch_cov = cov_2025.get("chrome", 0)
    mz_cov = cov_2025.get("mozilla", 0)
    ch_19  = cov_2019.get("chrome", 0)
    mz_19  = cov_2019.get("mozilla", 0)
    ms_bugs = pcs.get("microsoft", {}).get("bugs_oversight", 0)
    corpus  = gov.get("meta", {}).get("bugsTotal", 0)
    lines += [
        f'<section id="governance-risk">',
        f'<h2>Root Program Governance</h2>',
        f'<p>{ti.get("governance", "Root programs vary significantly in their oversight engagement.")}</p>',
        f'<p>Root program oversight coverage as a percentage of all CA compliance bugs: '
        f'Chrome covered {ch_19}% in 2019 and {ch_cov}% in 2025. '
        f'Mozilla covered {mz_19}% in 2019 and {mz_cov}% in 2025. '
        f'Microsoft has made {ms_bugs} governance comments on other CAs\' compliance incidents '
        f'across {corpus:,} total bugs.</p>',
        f'</section>',
    ]

    # Ecosystem Participation
    lines += [
        f'<section id="ecosystem-participation">',
        f'<h2>CA/B Forum Ecosystem Participation</h2>',
        f'<p>{ti.get("community", "CABF member participation in community governance is highly concentrated.")}</p>',
        f'<p>Of {ep.get("cabfMemberCount", 0)} CA/Browser Forum CA members, '
        f'{ep.get("activeMemberCount", 0)} have recorded community contributions '
        f'and {ep.get("zeroContributionCount", 0)} have made no recorded public contribution '
        f'to Bugzilla, ballot proposals, or bug filing.</p>',
    ]
    top_orgs = ep.get("topOrganizations", [])[:5]
    if top_orgs:
        lines.append(f'<p>Most active organizations: {", ".join(o["name"] for o in top_orgs)}.</p>')
    lines.append(f'</section>')

    # Geography
    if geo:
        lines += [
            f'<section id="geographic-risk">',
            f'<h2>Geographic Distribution</h2>',
            f'<p>{ti.get("geo", "CA issuance is geographically concentrated.")}</p>',
            f'<ul>',
        ]
        for region in geo:
            lines.append(f'<li>{region.get("region","")}: {region.get("caCount",0)} CAs, '
                        f'{region.get("issuancePct",0):.1f}% of certificate issuance</li>')
        lines += [f'</ul>', f'</section>']

    # Government Risk
    lines += [
        f'<section id="government-risk">',
        f'<h2>Government-Operated Certificate Authorities</h2>',
        f'<p>{ti.get("gov", "Government and state-owned CAs represent a distinct risk category.")}</p>',
        f'<p>{gr.get("total", 0)} government-operated or state-owned Certificate Authorities '
        f'hold trust in major browser root stores, accounting for {gr.get("issuancePct", 0):.1f}% '
        f'of certificate issuance.</p>',
        f'</section>',
    ]

    lines += [
        f'<p><a href="{SITE_URL}/llm_snapshot.json">Machine-readable dataset (JSON, ~68K tokens, updated daily)</a></p>',
        f'</article>',
        f'</noscript>',
    ]

    return "\n".join(lines)


def inject_into_index(noscript_html: str, dist_dir: str):
    """Inject noscript block into dist/index.html."""
    index_path = Path(dist_dir) / "index.html"
    if not index_path.exists():
        print(f"  ERROR: {index_path} not found")
        return

    src = index_path.read_text()

    # Remove any existing noscript block we injected
    src = re.sub(r'\n?<noscript>.*?</noscript>\n?', '', src, flags=re.DOTALL)

    # Inject before </body>
    src = src.replace("</body>", f"\n{noscript_html}\n</body>")

    # Also update meta description with data-driven text
    index_path.write_text(src)
    print(f"  Injected noscript block ({len(noscript_html):,} chars) into {index_path}")


def generate_tab_pages(snap: dict, dist_dir: str):
    """Generate static per-tab HTML pages for indexability."""
    tabs = [
        ("market",      "Market Share",            "CA certificate issuance volume and concentration"),
        ("trust",       "Trust Surface",           "Root program trust store inclusion and disagreements"),
        ("conc",        "Concentration Risk",      "WebPKI issuance concentration metrics"),
        ("tail",        "Long Tail Risk",          "Low-volume CAs with full root trust"),
        ("geo",         "Geographic Risk",         "CA jurisdiction distribution by region and country"),
        ("gov",         "Government Risk",         "State-operated CAs in browser trust stores"),
        ("jurisdiction","Jurisdiction Risk",       "Legal compulsion risk by CA home country"),
        ("ops",         "Operational Risk",        "CA compliance incident rates and discovery methods"),
        ("crypto",      "Cryptographic Posture",   "Root certificate algorithms and key sizes"),
        ("distrust",    "Distrust History",        "All CA browser distrust events with evidence"),
        ("policy",      "BR Readiness",            "CA readiness for Baseline Requirements validity reductions"),
        ("governance",  "Governance Risk",         "Root program oversight coverage and enforcement"),
        ("community",   "Ecosystem Participation", "CABF member community contribution"),
    ]

    tabs_dir = Path(dist_dir) / "tabs"
    tabs_dir.mkdir(exist_ok=True)

    ti = snap.get("tabIntros", {}).get("intros", {})

    for tab_id, tab_label, tab_desc in tabs:
        intro = ti.get(tab_id, tab_desc)
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebPKI Observatory — {tab_label}</title>
  <meta name="description" content="{intro[:160].replace('"', '&quot;')}">
  <link rel="canonical" href="{SITE_URL}/#{tab_id}">
  <meta http-equiv="refresh" content="0; url={SITE_URL}/#{tab_id}">
  <link rel="stylesheet" href="../assets/index.css" crossorigin>
</head>
<body>
  <p><a href="{SITE_URL}/#{tab_id}">WebPKI Observatory — {tab_label}</a></p>
  <p>{intro}</p>
  <p><a href="{SITE_URL}/">Return to WebPKI Observatory</a></p>
</body>
</html>"""
        out = tabs_dir / f"{tab_id}.html"
        out.write_text(html)

    print(f"  Generated {len(tabs)} tab pages in {tabs_dir}")


def update_llms_txt(snap: dict, dist_dir: str):
    """Update llms.txt with current data stats."""
    m    = snap.get("market", [])
    inc  = snap.get("incidents", {})
    dist = snap.get("distrustEvents", [])
    ep   = snap.get("ecosystemParticipation", {})
    gen  = snap.get("generatedAt", "")[:10]

    content = f"""# WebPKI Observatory
> Quantitative, evidence-based analysis of the Certificate Authority trust ecosystem that underpins TLS on the public internet.

Maintained by Systematic Reasoning, Inc. Data updated daily. Last updated: {gen}

## Key Facts (as of {gen})

- {len(m)} Certificate Authorities currently trusted by at least one major root program
- {inc.get('total', 0):,} public CA compliance incidents documented since 2014
- {len(dist)} CA browser distrust events since 2011, classified by posture and failure pattern
- {ep.get('cabfMemberCount', 0)} CA/Browser Forum CA members; {ep.get('zeroContributionCount', 0)} with no recorded community contribution
- Top 3 CAs account for {snap.get('concentration', {}).get('cr3', 0):.1f}% of all certificate issuance

## Data Resources

- [LLM Snapshot]({SITE_URL}/llm_snapshot.json): Complete observatory dataset (~68K tokens). Self-describing JSON. Updated daily.
  Contains: CA market share, concentration metrics, trust surface, geographic/government/jurisdiction risk,
  compliance incidents with whiteboard tags, distrust event classifications with reason tags,
  root program governance coverage rates, ecosystem participation, Chrome Root Store growth,
  and LLM-generated analyst notes per tab.
- [JSON Schema]({SITE_URL}/schema.json): Validation schema for the snapshot (JSON Schema draft 2020-12).
- [Tab Summaries]({SITE_URL}/tabs/): Static HTML pages for each of the 13 Observatory tabs.

## Data Sources

- crt.sh: Certificate Transparency logs (unexpired certificate counts per CA owner)
- CCADB: Common CA Database (trust store inclusion, CA organization details)
- Mozilla Bugzilla: CA Certificate Compliance incidents (2014-present, {snap.get('governance', {}).get('meta', {}).get('bugsTotal', 0):,} bugs)
- StatCounter: Global browser market share (mapped to root programs)
- CA/Browser Forum: Ballot records across Server Cert, Code Signing, S/MIME, Network Security WGs
- Chromium source: Chrome Root Store commit history

## Usage

Load {SITE_URL}/llm_snapshot.json into context for complete structured data.
The snapshot is self-describing with a $schema reference and dataSources section.
"""
    out = Path(dist_dir) / "llms.txt"
    out.write_text(content)
    print(f"  Updated llms.txt")



def generate_sitemap(dist_dir: str):
    """Generate sitemap.xml for Google."""
    tabs = [
        "market", "trust", "conc", "tail", "geo", "gov",
        "jurisdiction", "ops", "crypto", "distrust", "policy",
        "governance", "community"
    ]
    today = NOW.strftime("%Y-%m-%d")
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
             f'  <url><loc>{SITE_URL}/</loc><lastmod>{today}</lastmod><priority>1.0</priority></url>',
             f'  <url><loc>{SITE_URL}/llm_snapshot.json</loc><lastmod>{today}</lastmod><priority>0.8</priority></url>',
    ]
    for tab in tabs:
        lines.append(f'  <url><loc>{SITE_URL}/tabs/{tab}.html</loc><lastmod>{today}</lastmod><priority>0.7</priority></url>')
    lines.append('</urlset>')
    out = Path(dist_dir) / "sitemap.xml"
    out.write_text("\n".join(lines))
    print(f"  Generated sitemap.xml ({len(tabs)+2} URLs)")


def main():
    print(f"generate_seo.py — {NOW.isoformat()[:19]}")

    snap       = load_snapshot()
    noscript   = build_noscript(snap)

    inject_into_index(noscript, DIST_DIR)
    generate_tab_pages(snap, DIST_DIR)
    update_llms_txt(snap, DIST_DIR)
    generate_sitemap(DIST_DIR)

    print("  Done.")


if __name__ == "__main__":
    main()
