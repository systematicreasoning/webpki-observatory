# Specification

## Purpose

The WebPKI Observatory provides a quantitative, evidence-based view of the Certificate Authority ecosystem that underpins TLS on the public internet. It exists because:

1. **No single source shows the full picture.** crt.sh has issuance data. CCADB has trust store metadata. Bugzilla has incident records. StatCounter has browser share. No existing tool combines these into a unified analytical view.

2. **Policy decisions need data.** Root program managers, CA/B Forum participants, and security researchers make consequential decisions about which CAs to trust. These decisions should be informed by observable data, not institutional memory or anecdote.

3. **The trust surface should be visible.** Every CA root in a trust store can issue a certificate for any domain on the internet. The ecosystem's actual concentration, geographic distribution, government exposure, and operational track record should be measurable and public.

## Scope

**In scope:** Currently trusted CAs — those with at least one root certificate included in Mozilla, Chrome, Microsoft, or Apple trust stores, plus subordinate CAs operating under a trusted parent's roots.

**Out of scope:** Distrusted CAs, private/enterprise CAs, CAs that have applied but not yet been included, certificate transparency log operators, ACME protocol providers (as distinct from CAs), and non-WebPKI certificate ecosystems (e.g., national eID, S/MIME-only issuers not in browser stores).

## What Each Tab Measures

### Tab 1: Market Share

**Question:** How is certificate issuance distributed across CAs?

**Metric:** Unexpired precertificates per CA owner, from Certificate Transparency logs via crt.sh.

**Unit of analysis:** CA Owner (organization level, not individual root or intermediate).

**Derivations:**
- Market share % = CA's unexpired precerts / total unexpired precerts × 100
- Cumulative share = running sum of market share by rank
- Usage period = 365 / (all-time precerts / unexpired precerts) — measures replacement behavior, not certificate validity period
- Web coverage = sum of browser market shares for trust stores that include this CA

**Known limitation:** crt.sh attributes certificates to the **root owner**, not the issuing CA. Certificates issued through cross-signed intermediates (e.g., Amazon ACM issuing under GoDaddy/Starfield roots) are attributed to the root owner. This is a fundamental property of how Certificate Transparency logs record certificate chains. There is no known way to correct this from public CT data alone. CAs with known attribution gaps are flagged with ⚠.

**Defensibility:** The underlying data (CT logs) is a public, append-only, cryptographically verifiable record. crt.sh is operated by Sectigo and is the standard reference for CT-based certificate population analysis. Market share percentages are a direct computation from the raw data with no modeling or estimation.

---

### Tab 2: Trust Surface

**Question:** What does the root certificate infrastructure look like across the four major trust stores?

**Metrics:**
- Root and owner counts per store and per store combination
- Per-store portfolio incident rate (weighted by issuance volume)
- Root expiration timeline and heatmap
- Capability distribution (TLS, EV, S/MIME, code signing)
- Web coverage by store combination
- Notable trust store disagreements

**Derivations:**
- Store comparison metrics are computed from CCADB root inclusion status
- Web coverage uses StatCounter browser market share mapped to root programs: Chrome (~78%, includes Edge, Samsung Internet, Opera, and other Chromium browsers), Apple (~16%), Mozilla (~2.3%), Microsoft (~0% for web — Edge uses Chrome's store)
- Portfolio ops rate = (total incidents for CAs in this store / total all-time certs for CAs in this store) × 1,000,000

**Known limitation:** Microsoft's web browser share is ~0% because Edge uses Chrome's root store. Microsoft's trust store matters for Windows enterprise TLS, S/MIME, and code signing — contexts not captured by web browser market share. The "web coverage" metric is accurate for browser TLS but understates Microsoft-only CAs' operational importance.

**Intermediate count methodology:** The "Issuing CAs" count per CA owner is de-duplicated by Subject Key Identifier (SKI). Cross-signed intermediates share the same key but appear as separate CCADB records; the pipeline collapses these into one logical issuing CA per unique SKI. Only non-revoked, non-expired intermediates chaining to a currently trusted root are counted.

**Defensibility:** Root inclusion status comes directly from CCADB, the canonical cross-program database maintained by Mozilla and used by all four root programs. Browser market share is from StatCounter (public, widely cited).

---

### Tab 3: Concentration Risk

**Question:** How concentrated is certificate issuance, and what does that mean for ecosystem resilience?

**Metrics:**
- Herfindahl-Hirschman Index (HHI)
- CR3, CR5, CR7 (concentration ratios)
- Cumulative concentration curve
- Market share treemap

**Derivations:**
- HHI = Σ(market share %)² across all trusted CAs. Standard antitrust metric. DOJ/FTC thresholds: <1,500 unconcentrated, 1,500–2,500 moderately concentrated, >2,500 highly concentrated.

**Context:** HHI measures issuance concentration, not market power in the traditional antitrust sense. CAs cannot unilaterally raise prices because free alternatives exist (Let's Encrypt). Concentration matters in the WebPKI for different reasons: blast radius (a misissuance event at a dominant CA affects more of the internet), root program negotiating dynamics, and ecosystem resilience if a major CA is distrusted.

**Defensibility:** HHI is a textbook metric with a 60-year history in antitrust economics. The computation is deterministic from the market share data.

---

### Tab 4: Long Tail Risk

**Question:** How many CAs carry disproportionate trust relative to their issuance volume?

**Metric:** CAs below the 99.99% cumulative issuance threshold.

**Derivations:**
- The head/tail boundary is computed dynamically: head = the fewest CAs whose cumulative issuance accounts for ≥99.99% of all unexpired certificates. Everything below is "tail."
- Tail CAs are grouped by trust store presence (4 stores, 3 stores, 2 stores, 1 store)

**Key insight:** Every trusted root certificate carries identical technical capability regardless of issuance volume. A root in all 4 trust stores can issue a certificate trusted by ~97% of web browsers whether it issues 500 million certificates or 5. Tail CAs in all 4 stores represent the highest risk-to-utility ratio in the ecosystem: maximum blast radius, minimal contribution.

**Defensibility:** The 99.99% threshold is a design choice, not a natural law. It was chosen because it separates the CAs that collectively issue nearly all certificates from those that contribute negligibly to the ecosystem's functional output. The threshold is computed dynamically on each pipeline run, so the boundary adapts as the market evolves.

---

### Tab 5: Geographic Risk

**Question:** Where are trusted CA organizations headquartered, and how does that map to issuance volume?

**Metrics:**
- CA count and issuance share by region and country
- Divergence between "by CA count" and "by issuance" per region

**Derivations:**
- Country = CA Owner country field from CCADB (headquarters jurisdiction, not operational location)
- Regions: United States, Europe, Asia-Pacific, Americas, Middle East/Africa, Other
- Counts and percentages are recomputed from the trusted CA set at build time

**Known limitation:** Jurisdiction reflects where the CA owner organization is incorporated, not where its infrastructure operates or where its subscribers are located. A CA headquartered in Belgium (GlobalSign) issues certificates used worldwide.

**Defensibility:** Country data comes from CCADB, which is self-reported by CAs as part of their root program inclusion. Regional groupings are conventional geographic categories.

---

### Tab 6: Government Risk

**Question:** How many trusted CAs have structural ties to governments?

**Metrics:**
- Count of government-operated and state-owned enterprise CAs
- Share of total issuance from government-tied CAs
- Trust store presence of government CAs
- Geographic distribution

**Derivations:**
- "Government-Operated" = CA directly run by a government agency (e.g., FNMT is a division of Spain's Royal Mint)
- "State-Owned Enterprise" = entity with direct state ownership or legislative mandate (e.g., Chunghwa Telecom is majority state-owned by Taiwan's government)
- Classifications are based on structural ownership and legislative relationships only. Customer relationships with government agencies do not qualify.

**Source:** Manually curated `gov_classifications.json`, cross-referenced with official corporate registries, legislation, and CCADB metadata.

**Defensibility:** Every classification is documented with a specific structural relationship (ownership stake, legislative mandate, agency division). The methodology excludes customer relationships, which eliminates the most common source of false positives. The file is version-controlled and auditable.

---

### Tab 7: Jurisdiction Risk

**Question:** Which trusted CAs are headquartered in jurisdictions with government key seizure or compelled CA cooperation laws?

**Metrics:**
- Three-axis compulsion assessment per jurisdiction: key seizure, compelled issuance, secrecy
- Certificate volume exposed to each risk tier (high, moderate, low)
- CA count per jurisdiction with legislation excerpts and axis indicators
- Web coverage exposed per risk tier

**Three-axis model:** Each jurisdiction is assessed on three independent questions:
- **Key Seizure** — Can the government compel disclosure of CA private signing keys?
- **Compelled Issuance** — Can the government force a CA to issue a specific certificate?
- **Secrecy** — Can the government prohibit the CA from disclosing the compulsion to root programs, auditors, or subscribers?

Each axis is one of:
- **Purpose-built** — Dedicated statutory authority designed for this specific power
- **General** — Possible via general judicial process (warrants, subpoenas) — baseline for any country with functioning courts
- **None** — No authority, or strong constitutional protections prevent it

**Derivation of risk tiers from axes:**
- **High:** All three axes have purpose-built authority (China, Russia, UK, Australia)
- **Moderate:** One or two axes have purpose-built authority (India, Turkey)
- **Low:** No purpose-built authority — only general judicial process or constitutionally protected (US, France, Germany, Canada, etc.)

The critical distinction is purpose-built vs general. The combination of compelled issuance + secrecy is the existential WebPKI threat: a CA can be forced to issue a fraudulent certificate and simultaneously prohibited from disclosing it.

**Source:** Legislation data cross-verified against Wikipedia Key Disclosure Law, official legislation sites (legislation.gov.uk, legislation.gov.au, indiankanoon.org, npc.gov.cn), EFF, Global Partners Digital, Comparitech, and CA/B Forum context.

**Known limitation:** Risk levels reflect the strength and scope of legal authority, not the likelihood of exercise. The classification describes capability, not intent.

**Defensibility:** Every jurisdiction entry includes specific legislation with article numbers, statutory excerpts, source URLs, and per-axis assessments. Risk tiers are mechanically derived from the axes with no subjective weighting.

---

### Tab 8: Operational Risk

**Question:** What is the incident track record of trusted CAs?

**Metrics:**
- Annual incident volume (2014–present)
- Per-CA incident count, self-report rate, and incidents per million all-time certificates
- AI-classified incident taxonomy (misissuance, revocation, governance, validation)
- Detection capability scatter plot (self-report rate vs. incident density)

**Derivations:**
- **Incidents per million (PPM)** = (cumulative Bugzilla CA Certificate Compliance bugs / all-time precertificates) × 1,000,000. Uses all-time certificates as the denominator to match the all-time numerator. This produces a lifetime incident rate that is stable over time.
- **Self-report rate** = proportion of incidents filed by the CA itself, attributed by matching the Bugzilla bug creator email domain to the CA organization.
- **Classification:** Each incident is categorized into misissuance (BR violations), revocation (CRL/OCSP failures), governance (audit/CPS/disclosure), or validation (domain/org validation failures) using the Anthropic API.

**Scope note:** Yearly totals, classification breakdowns, and per-CA fingerprints preserve the full historical record including incidents from CAs that were later distrusted. This is intentional — the enforcement arc (why CAs get distrusted) is part of the analysis. The per-CA table marks distrusted CAs with a `trusted` flag.

**Known limitation:** High incident count does not indicate low maturity. Volume CAs accumulate more incidents simply because they issue more certificates, and transparent CAs that self-report accumulate more bugs than opaque ones. The PPM metric normalizes for volume, and the self-report rate distinguishes CAs that find their own problems from those whose issues are found externally.

**Defensibility:** Bugzilla is Mozilla's official incident tracking system, used by all root programs. The data is public, individually linkable, and has been the canonical record of CA compliance incidents since 2014.

---

### Tab 9: Policy Impact

**Question:** How will upcoming Baseline Requirements validity reductions affect each CA's subscriber base?

**Metrics:**
- CAs grouped by average certificate usage period relative to upcoming BR thresholds
- Projected impact at 200-day (March 2026), 100-day (March 2027), and 47-day (March 2029) limits

**Derivations:**
- Usage period = 365 / (all-time precerts / unexpired precerts). Measures how frequently a CA's subscribers replace certificates, not the validity period on the certificate. Example: Let's Encrypt issues 90-day certificates but the average usage period is ~22 days because subscribers auto-renew at 60 days.
- "Above threshold" = CA's average usage period exceeds the upcoming BR maximum validity.

**Known limitation:** The usage period is a population average derived from the ratio of all-time to current certificates. It does not account for subscriber heterogeneity (a CA may have some subscribers with 30-day automation and others doing manual annual renewal).

**Defensibility:** The BR validity reduction schedule is a published, ratified CA/B Forum ballot. The usage period metric is a direct computation from CT log data with no modeling assumptions.

---

### Tab 10: Cryptographic Posture

**Question:** What cryptographic algorithms do trusted root certificates use, and how do they compare to standards body recommendations?

**Metrics:**
- Key family distribution (RSA vs. ECC)
- Key size distribution (RSA-2048, RSA-4096, P-256, P-384)
- Signature hash distribution (SHA-1, SHA-256, SHA-384, SHA-512)
- Per-CA algorithm posture with standards body compliance flags
- Root creation timeline (algorithm trends over time)
- Soonest expiring roots with algorithm data

**Standards bodies compared:**
| Body | Document | Focus |
|------|----------|-------|
| NIST | SP 800-57 Rev.5 | US federal standard |
| ECRYPT-CSA | D5.4 (2018) | European academic consortium |
| BSI | TR-02102-1 | German federal office |
| ANSSI | RGS v2.03 | French national security agency |
| NSA CNSA | CNSA Suite | US national security systems |

**Important context:** Root CA certificates are self-signed. The signature on a root is not validated during certificate chain building — a root is trusted because it is in the trust store, not because its self-signature is cryptographically verified. SHA-1 on a self-signed root is not a vulnerability. The signature hash and standards compliance columns indicate the root's generation era, not current cryptographic exposure.

**Defensibility:** Algorithm data is parsed directly from root certificate PEM files obtained from CCADB. Standards body thresholds are from published documents via keylength.com. All 335 currently-included roots across all 89 CA owners are covered.

---

### Tab 11: Distrust History

**Question:** What does the historical record of CA distrusts tell us about ecosystem governance, and what patterns emerge from trust failures?

**Metrics:**
- 16 distrust events (2011–2024) with classification across four dimensions
- Compliance posture distribution (Willful, Argumentative, Negligent, Incompetent, Accidental)
- Distrust pathway (Immediate, Triggered, Gradual, Negotiated)
- Response quality assessment per CA
- 22 contributing factor tags derived from Bugzilla evidence
- Time-to-removal: median 3.2 years from first incident to distrust
- Per-event milestone timelines with quarterly bug velocity

**Data sources:**
| Source | Role |
|--------|------|
| Bugzilla CA Certificate Compliance | Incident reports, root program comments, CA responses |
| CCADB | Trust store inclusion status (stores=0 detection) |
| mozilla.dev.security.policy (MDSP) | Distrust discussions and announcements |
| CCADB public mailing list | Policy discussions and removal proceedings |
| Root program blogs | Formal distrust announcements (Chrome, Mozilla) |
| External research | Security researcher reports, investigative journalism |

**Classification tiers:**
- **Curated**: Hand-curated from root program announcements (pre-2017 events)
- **High**: LLM-classified from Bugzilla evidence (5+ bugs) + cached metadata
- **Med-High**: LLM-classified primarily from metadata with sparse Bugzilla trail
- **Medium**: LLM-classified from Bugzilla only, no cached metadata

**Important context:** This tab documents historical removals. It does not predict future distrusts. Classifications are supported by specific Bugzilla bug citations and root program quotes visible in each event's expanded detail view. The distrust pipeline uses caching to avoid redundant LLM calls — only CAs with new Bugzilla bugs or updated metadata are reclassified.

**Defensibility:** 87% posture accuracy and 88% tag recall against a 15-event ground truth set. Each classification includes an evidence chain citing specific bug numbers and metadata excerpts. Events are cross-referenced against mozilla.dev.security.policy threads, CCADB discussions, and root program blog posts.

---

### Tab 12: Governance Risk

**Question:** How effectively do root programs govern the CAs they trust — and does the level of governance match the size of the trust surface?

**Metrics:**
- Report card heatmap: 12 metrics per program across governance activity and trust surface scope
- Enforcement: 16 distrust events (2011–2024), who led, who followed, who hasn't acted
- Bugzilla oversight: comment attribution by email domain across all sampled bugs and comments
- Oversight concentration: bus factor per program (unique contributors, top-contributor %)
- Oversight trend: quarterly comments and people counts per program (2020–present)
- Policy leadership: CA/Browser Forum ballot proposers, endorsers, and voters across 4 working groups
- Trust surface: CA owners, root certificates, exclusive roots, gov-affiliated CAs, still-trusted removed CAs
- Notable inclusion and trust gaps: CAs with cross-store disagreements, auto-detected from CCADB
- Incident detection: bug creation attribution showing who files vs who comments
- Inclusion velocity: Mozilla pending applications with wait times

**Data sources:**
| Source | Role |
|--------|------|
| Bugzilla REST API | Comment authors, bug creation, oversight vs self-incident classification |
| CCADB | Trust store membership, root cert counts, CA owner metadata |
| cabforum.org | Ballot proposers, endorsers, vote results across SC/CSC/SMC/NS working groups |
| Chromium source (root_store.textproto git log) | Chrome Root Store changelog — every addition/removal with exact commit dates (2022+) |
| learn.microsoft.com deployment notices | Microsoft CTL changelog — monthly trust store updates with add/notbefore/disable actions (2020+) |
| Apple support pages | Enforcement actions (e.g., support.apple.com/en-us/121668 for Entrust) |
| Daily CCADB snapshots | Point-in-time trust store state for all four programs; diffs build changelog over time |

**Key methodological notes:**
- Oversight attribution uses email domain matching (@google.com → Chrome, @mozilla.com → Mozilla, etc.). Microsoft operates a CA — 487 of their 488 Bugzilla comments are self-incident responses to their own CA's failures, not governance oversight.
- Bugzilla data has survivorship bias: CAs not yet trusted by any store rarely file incident bugs. Oversight metrics reflect governance of established CAs, not the full applicant pipeline.
- Each root program discloses enforcement differently. Chrome publishes blog posts. Mozilla uses Bugzilla threads. Microsoft publishes monthly CTL notices. Apple publishes support documents with SHA-256 hashes but does not announce on Bugzilla or mailing lists. "First Public Action" is biased toward programs that announce loudly. Apple's enforcement may predate other programs' public announcements.
- Ballot counts treat all ballots equally. SC-081 (reducing certificate validity to 47 days) has vastly more impact than a cleanup ballot. Vote participation includes yes, no, and abstain votes. Not voting may reflect policy disagreement or a deliberate choice not to legitimize a ballot — it is not inherently a governance failure.
- Store size reflects policy philosophy: Chrome is deliberately selective (value must exceed risk), Mozilla is the fastest gateway for new CAs, Apple is highly selective, Microsoft processes rollovers quickly. A larger store is not automatically worse governance, but it requires proportionally more governance activity to maintain assurance.
- Apple has no public machine-readable trust store changelog. Daily CCADB snapshots will build this history over time.

**Defensibility:** All numbers are derived from public data sources (Bugzilla, CCADB, cabforum.org, Chromium source, learn.microsoft.com). The pipeline caches API responses and is idempotent. Email domain attribution is mechanical — no judgment calls. Enforcement events are read from `distrusted.json` (the same file used by the Distrust History tab) with per-store dates and leader attribution derived from earliest enforcement date. The tab acknowledges its own limitations in a dedicated methodology section.

---

## Data Freshness

The pipeline runs daily at 06:00 UTC. Data freshness is tracked in `metadata.json` and displayed in the dashboard footer.

| Source | Stale Warning | Critical Warning |
|--------|--------------|-----------------|
| crt.sh / CCADB | 48 hours | 7 days |
| Bugzilla | 72 hours | 14 days |
| StatCounter | 30 days | 90 days |
| Legislation (jurisdiction) | Manual review | — |
| Government classifications | Manual review | — |

## Validation

A build-time validation script (`scripts/validate-data.cjs`) runs 19 automated checks before every build:
- Market share sums to 100%
- Intersection root/owner counts are internally consistent
- Incident yearly sums match totals
- Per-CA self-report + external = total incidents
- Classification coverage is complete
- All jurisdictions have risk levels and legislation
- All roots have algorithm data

The build fails if any critical check fails.
