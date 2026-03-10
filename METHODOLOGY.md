# Methodology

## Overview

The WebPKI Observatory combines five public data sources into a unified analytical view of the Certificate Authority ecosystem. This document describes how each metric is computed, what assumptions are made, and where the analysis has known limitations.

All analysis is scoped to **currently trusted CAs** — those with at least one root certificate included in one of the four major trust stores (Mozilla, Chrome, Microsoft, Apple). Distrusted CAs are excluded from all current-ecosystem analysis. Historical data (e.g., incident timelines) preserves the full record.

## Data Sources

### crt.sh (Certificate Transparency)

**What it provides:** Certificate population counts per CA owner — both all-time and currently-unexpired precertificates.

**How it works:** crt.sh aggregates certificates from Certificate Transparency logs and groups them by the "Root Owner" field, which identifies the organization that owns the root certificate at the top of the certificate chain.

**Update frequency:** Daily.

**Limitation — Root Owner Attribution:** crt.sh attributes certificates to the owner of the root they chain to, not the CA that operationally issued them. When CA "A" issues certificates through cross-signed intermediates under CA "B"'s root, those certificates appear as CA "B"'s volume. This affects CAs like Amazon Trust Services, whose ACM-issued certificates chain to GoDaddy/Starfield roots and are therefore counted under GoDaddy's totals. There is no known way to correct this from public CT data alone. CAs with known attribution gaps are marked in the dashboard.

### CCADB (Common CA Database)

**What it provides:** Root certificate metadata, trust store inclusion status, CA owner organization details, country of incorporation, capability flags (TLS, EV, S/MIME, code signing), and intermediate certificate records.

**How it works:** CCADB is a shared database maintained by Mozilla and used by all four major root programs. CAs self-report their organizational information; trust store inclusion status is maintained by the root programs themselves.

**Update frequency:** Daily (AllCertificateRecordsCSVFormatv4 export).

**Limitation — Country Field:** The "CA Owner" country field reflects the organization's jurisdiction of incorporation, not where its operations, infrastructure, or subscribers are located. A CA incorporated in Belgium may operate servers in the US and issue certificates to subscribers worldwide.

### Bugzilla (Mozilla CA Compliance)

**What it provides:** CA compliance incident records from 2014 to present, including incident descriptions, filing dates, resolution status, and the identity of the bug filer.

**How it works:** When a CA violates the Baseline Requirements, root program policies, or its own Certificate Practice Statement, a bug is filed in Mozilla's Bugzilla under the "CA Certificate Compliance" component. These bugs are the canonical public record of CA compliance incidents across all root programs.

**Update frequency:** Daily.

**Limitation — Attribution Completeness:** Not all CA incidents result in Bugzilla bugs. Some may be handled through private channels, other root programs' processes, or CA self-remediation without public filing. The Bugzilla record is the most comprehensive public record but is not exhaustive.

### StatCounter

**What it provides:** Global browser market share, used to estimate what proportion of web users are affected by each trust store's decisions.

**How it works:** StatCounter tracks browser usage across a network of participating websites. We map browser engines to root programs: Chrome (includes Edge, Samsung Internet, Opera, and other Chromium-based browsers) → Chrome Root Store; Safari → Apple; Firefox → Mozilla; Internet Explorer/legacy Edge → Microsoft.

**Update frequency:** Daily.

**Limitation — Web vs Platform:** The browser market share reflects web browsing only. Microsoft's trust store has ~0% web browser share (Edge uses Chrome's root store) but is critical for Windows enterprise TLS, S/MIME, and code signing. The "web coverage" metric is accurate for browser-based TLS but understates Microsoft-only CAs' operational importance in non-browser contexts.

### keylength.com

**What it provides:** Cryptographic key size and algorithm recommendations from five standards bodies (NIST, ECRYPT-CSA, BSI, ANSSI, NSA CNSA).

**How it works:** keylength.com aggregates published recommendations from standards bodies into comparable threshold tables. We use these to flag root certificates whose key algorithms fall below one or more bodies' current minimums.

**Update frequency:** Manual (standards body publications change infrequently).

## Derived Metrics

### Market Share (%)

```
market_share = (CA's unexpired precertificates / total unexpired precertificates) × 100
```

Computed over currently trusted CAs only. Sums to 100%.

### Usage Period (days)

```
turnover = all-time precertificates / unexpired precertificates
usage_period = 365 / turnover
```

Measures how frequently a CA's subscriber base replaces certificates. This is **not** the validity period configured on the certificate — it reflects actual replacement behavior. Example: Let's Encrypt issues 90-day certificates, but subscribers typically auto-renew at 60 days, resulting in a ~22-day average usage period.

### Incidents Per Million (PPM)

```
ppm = (cumulative Bugzilla incidents / all-time precertificates) × 1,000,000
```

Both numerator and denominator are cumulative/all-time values, ensuring the time windows match. A CA with 171 incidents across 1.1 billion all-time certificates (DigiCert) has a PPM of 0.155.

**Why all-time denominator:** Using current unexpired certificates as the denominator would conflate a 12-year cumulative numerator with a point-in-time snapshot denominator, producing extreme values for CAs with many historical incidents but few current certificates (e.g., SwissSign: 63 incidents / 45K current certs = 1,394 PPM vs 63 / 170K all-time = 370 PPM). The all-time denominator keeps both sides of the fraction on the same time scale.

**RateDot thresholds:** Green (<10/M), Amber (10–1,000/M), Red (>1,000/M). Calibrated against the observed distribution of all-time PPM values across trusted CAs.

### Self-Report Rate (%)

```
self_report_pct = (incidents filed by the CA / total incidents for that CA) × 100
```

Attribution is based on matching the Bugzilla bug creator's email domain to the CA organization. Higher self-report rates generally indicate stronger internal compliance monitoring and a culture of transparency.

### Web Coverage (%)

```
web_coverage = Σ (browser_market_share for each store that includes this CA)
```

Approximate proportion of global web browsing traffic that trusts this CA's certificates. A CA in all four stores has ~96.9% coverage. A CA in Chrome + Apple has ~94.6%. A CA in Microsoft only has ~0%.

### HHI (Herfindahl-Hirschman Index)

```
HHI = Σ (market_share_pct²) across all trusted CAs
```

Standard concentration metric. DOJ/FTC thresholds: <1,500 unconcentrated, 1,500–2,500 moderately concentrated, >2,500 highly concentrated.

### Tail Boundary

```
head = fewest CAs where cumulative market share ≥ 99.99%
tail = all remaining CAs
```

Computed dynamically from the data on each pipeline run. The boundary adapts as the market evolves.

## Trust Scope

All current-ecosystem analysis is restricted to **trusted CAs**: those with `trust_store_count > 0` or a `parent_ca` subordinate relationship to a trusted CA.

The pipeline's raw data (CCADB) tracks 248 CA owners, including organizations whose roots have been removed, revoked, or were never included. Of these, 98 are currently trusted.

Distrusted CAs excluded from the trusted scope include:
- Entrust (distrusted 2024 — pattern of compliance failures, sold public CA business to Sectigo)
- WoSign (distrusted 2016 — fraudulent certificate issuance)
- CNNIC (distrusted 2015 — unauthorized certificate issuance)
- DigiNotar (distrusted 2011 — compromise and fraudulent issuance)
- DarkMatter (never included — surveillance concerns)
- StartCom (distrusted 2016 — operational relationship with WoSign)
- E-Tugra (distrusted 2022 — multiple compliance failures)
- TrustCor (distrusted 2022 — intelligence community ties)

The trust scope filter is applied at build time in the Vite plugin. Geography, government risk, and jurisdiction risk data are recomputed from the trusted set. The pipeline's raw JSON files preserve the full CCADB record for historical reference.

**Exception — Operational Risk:** The incident timeline (yearly totals, classification breakdowns) preserves the full historical record including incidents from CAs that were later distrusted. This is intentional: the enforcement arc — why CAs get distrusted — is a core part of the operational risk analysis.

## Government Classification Methodology

Government-affiliated CAs are classified into two categories based on **structural relationships only**:

- **Government-Operated:** The CA is directly run by a government agency. The agency operates the CA infrastructure as part of its governmental function.
  - Example: FNMT (Spain) — a division of the Royal Mint, a public entity under the Ministry of Economy.

- **State-Owned Enterprise:** The CA's parent organization has direct state ownership or was established by legislative mandate, but operates with some commercial independence.
  - Example: Chunghwa Telecom (Taiwan) — majority state-owned telecommunications company that operates a CA division.

**What does not qualify:** Customer relationships with government agencies. A CA that sells certificates to a government ministry is not "government-affiliated" — most CAs have government customers.

Source: Manually curated `gov_classifications.json`, cross-referenced with official corporate registries, legislation, and CCADB metadata. Each classification documents the specific structural relationship.

## Jurisdiction Risk Methodology

Jurisdiction risk assesses the legal authority of governments to compel key disclosure or CA cooperation in the countries where trusted CAs are headquartered.

**Three-axis model:** Each jurisdiction is assessed on three independent axes:

| Axis | Question |
|------|----------|
| Key Seizure | Can the government compel disclosure of CA private signing keys? |
| Compelled Issuance | Can the government force a CA to issue a specific certificate? |
| Secrecy | Can the government prohibit the CA from disclosing the compulsion? |

Each axis is classified as:
- **Purpose-built** — A legislature specifically created a statutory tool for this power (e.g., RIPA s.49 for key seizure, IPA 2016 TCN for compelled issuance, RIPA s.54 for secrecy)
- **General** — Possible via general judicial process (warrants, subpoenas, court orders). This is the baseline for any country with functioning courts — not a special power.
- **None** — No authority exists, or strong constitutional protections prevent it (e.g., Germany's nemo tenetur principle, Canada's Charter s.11(c))

**Risk tiers derived from axes:**

| Tier | Rule | Example |
|------|------|---------|
| High | All three axes purpose-built | China (NIL Art. 7/14 + Cryptography Law Art. 31), UK (RIPA + IPA + s.54 gag), Australia (TOLA TAN/TCN + s.317ZF) |
| Moderate | One or two axes purpose-built | India (IT Act s.69 — key seizure + compelled issuance, no secrecy), Turkey (Law 5651 — key seizure only) |
| Low | No purpose-built authority | US (general judicial process only), Germany (nemo tenetur), Canada (Charter protection) |

The critical distinction is purpose-built vs general. The combination of compelled issuance + secrecy is the existential WebPKI threat: a CA can be forced to issue a fraudulent certificate and simultaneously prohibited from disclosing it to root programs, auditors, or subscribers.

**Scope:** "Exposure" means the CA is headquartered in the jurisdiction. It does not mean the CA's operations, infrastructure, or subscribers are located there. Subsidiary relationships and operational geography are not captured.

**Source:** Legislation data cross-verified against Wikipedia Key Disclosure Law, official legislation sites (legislation.gov.uk, legislation.gov.au, indiankanoon.org, npc.gov.cn), EFF, Global Partners Digital, Comparitech, and CA/B Forum context. Each entry includes specific legislation with article numbers, statutory excerpts, and source URLs.

**Limitation:** Risk levels reflect the strength and scope of legal authority, not the probability of its exercise. A jurisdiction classified as "high" may never have exercised its compulsion authority against a CA.

## Cryptographic Posture — Root Self-Signature Note

Root CA certificates are self-signed. The signature on a root is **not validated** during certificate chain building by relying parties. A root is trusted because it is in the trust store, not because its self-signature is cryptographically verified.

This means SHA-1 on a self-signed root is not a security vulnerability. The signature hash and "below standard" flags in the Cryptographic Posture tab are indicators of the root's generation era, not current cryptographic exposure in the certificate chain.

Intermediate certificates and leaf certificates — where the signature **is** validated — are not yet covered by this analysis. A CA with RSA-only roots can issue ECC leaf certificates through cross-signed ECC intermediates.

## Known Data Quality Issues

| Issue | Impact | Status |
|-------|--------|--------|
| crt.sh root-owner attribution | Amazon undercounted, GoDaddy overcounted | Documented, unfixable from CT data |
| Ministry of Digital Affairs: -7 certs | Negative count from crt.sh deduplication | Pipeline data quality, flagged in validation |
| PKIoverheid: 4 all-time certs, 45 incidents | Non-CT issuer, PPM meaningless | Low-volume indicator needed |
| Per-CA incident sum (1,354) < total (1,424) | 70 incidents not attributed to top-40 CAs | Truncation in pipeline |
| 97 trusted CAs vs 89 intersection owners | 8 CAs have inferred store presence without own roots | Different data sources |

## Distrust Classification Methodology

The Distrust History tab classifies 16 CA removal events (2011–2024) across four dimensions:

**Compliance Posture** (the most important predictor): Willful Circumvention (built systems to violate), Argumentative Noncompliance (argued rules shouldn't apply), Negligent Noncompliance (knew but didn't fix), Demonstrated Incompetence (didn't understand), Accidental (genuine mistake).

**Contributing Factors**: 22 reason tags derived from analysis of all 15 historical events. Each tag is supported by specific Bugzilla bug citations or root program quotes.

**Detection**: CCADB `stores=0` status combined with configuration overrides for CAs where CCADB lags (e.g., Entrust was still listed in stores after distrust effective dates).

**Classification data** (`pipeline/distrust/distrusted.json`):
1. Stage 1: CCADB detection — find CAs with `stores=0` or config overrides
2. Stage 2: Bugzilla enrichment — fetch incident trails, root program comments, CA responses
3. Stage 3: LLM classification — classify using vocabulary from config + cached metadata when available
4. Stage 4: Merge — combine seed events, detected events, and classifications into `distrusted.json`

**Caching**: The pipeline caches Bugzilla profiles (invalidated when bug count changes) and LLM classifications (invalidated when bug count or metadata content changes). In steady state, a pipeline run requires zero LLM calls unless new bugs are filed or metadata is updated.

**Accuracy**: 87% posture accuracy and 88% tag recall against a 15-event ground truth set derived from root program announcements and the blog post "Exploring Browser Distrust" (unmitigatedrisk.com).

**Enrichment sources**: Each event may have cached reference material from root program blog posts, security researcher reports, investigative journalism, and mailing list threads. This metadata improves classification accuracy but is not required — the pipeline classifies from Bugzilla evidence alone when metadata is unavailable.

## Governance Risk Methodology

The Governance Risk tab (Tab 12) compares how effectively Chrome, Mozilla, Apple, and Microsoft govern the CAs they trust. The pipeline (`fetch_rpe.py`) runs in 7 phases:

**Phase 1: Bug Creation Attribution.** Maps Bugzilla bug creators to root programs by email domain. This measures *detection* — which programs file bugs about CA issues. Note: 93% of bugs are CA self-reports. Root program detection is the remaining 7%.

**Phase 2: Comment Participation.** Fetches comments from Bugzilla bugs and classifies each as *oversight* (commenting on another CA's bug) or *self-incident* (responding to your own CA's compliance failure). Microsoft operates a CA (Microsoft PKI Services) — nearly all their Bugzilla activity is self-incident, not governance. Comment concentration analysis computes bus factor per program.

**Phase 3: Enforcement.** Reads distrust events from `pipeline/distrust/distrusted.json` — the same canonical source used by the Distrust History tab (Tab 11). Per-store distrust dates determine who acted and who led (earliest date = leader). "Still trusts" = stores with no distrust date. This ensures a single source of truth: when a new CA is distrusted, updating `distrusted.json` once updates both tabs.

**Phase 4: Store Posture.** Computes per-store metrics from CCADB and `root_algorithms.json`: CA owner count, root certificate count, exclusive roots (counted at root-cert level from `root_algorithms.json`, not CA-owner level), and government-affiliated CAs (pattern-matched on CA owner names).

**Phase 4b: Policy Leadership.** Reads ballot data from `ops_cache/cabforum_ballots.json` (scraped from cabforum.org across 4 working groups: Server Certificate, Code Signing, S/MIME, Network Security). Attributes proposers, endorsers, and voters to root programs by name→organization mapping.

**Phase 5: Notable Gaps.** Auto-detects CAs with cross-store inclusion disagreements from `market_share.json`. Flags CAs in the top 100 by issuance that are missing from at least one store. Also detects distrust divergences (CAs where some stores have acted but others haven't).

**Phase 6: Government CA Counts.** Pattern-matches CA owner names against known government and state-owned enterprise patterns.

**Phase 7: Inclusion Velocity.** Fetches pending Mozilla inclusion applications from Bugzilla with wait times and pipeline stages.

**Additional data sources** (separate pipeline scripts, output read by `fetch_rpe.py` when available):
- `fetch_microsoft_ctl.py`: Scrapes Microsoft's monthly deployment notices from learn.microsoft.com. Extracts root additions, NotBefore actions, and disables with dates. Handles 5+ URL pattern variants across 2020–present.
- `fetch_chrome_root_store.py`: Fetches git commit log of `root_store.textproto` from Chromium source via Gitiles JSON API. Diffs consecutive versions to extract additions and removals with exact commit dates (2022–present).
- `fetch_trust_snapshots.py`: Daily CCADB snapshot capturing current trust store state for all four programs. Diffs between snapshots produce a cross-store changelog over time. This is the only source for Apple trust store changes, as Apple publishes no changelog.

**Key limitations:**
- Bugzilla participation is biased toward Mozilla because it's their primary governance channel. Other programs may govern through private channels.
- CAs not yet trusted by any store rarely file Bugzilla bugs — oversight metrics only cover established CAs.
- Apple's enforcement actions may be undercounted because they publish support documents rather than Bugzilla posts or blog announcements.
- Ballot counts treat all ballots equally regardless of impact.
- Email domain attribution is mechanical. Contributors using personal email or shared infrastructure may be misattributed.

## Validation

A build-time validation script runs 19 automated checks before every deployment:
- Market share sums to 100%
- Intersection counts are internally consistent
- Incident yearly sums match totals
- Self-report + external = total for every CA
- Classification coverage is complete
- All jurisdictions have risk levels and legislation
- All root certificates have algorithm data

The build fails if any critical check fails. Pipeline data quality issues (negative cert counts from crt.sh) are flagged as warnings.
