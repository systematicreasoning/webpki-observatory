# Architecture

## System Overview

The WebPKI Observatory is a static dashboard that provides a quantitative view of the Certificate Authority ecosystem. It answers the question: **who can issue certificates trusted by web browsers, and what does that trust surface look like?**

The system has three layers:

1. **Pipeline** — Python scripts that fetch from public data sources, normalize, enrich, and produce JSON files
2. **Build** — A Vite plugin that reads the JSON at compile time, applies trust-scope filtering, and embeds the data into the JavaScript bundle
3. **Dashboard** — A React single-page app that renders 12 analytical views from the embedded data

There is no backend server. The pipeline runs in GitHub Actions, the build produces static files, and the dashboard is served from GitHub Pages. All data is public.

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│  crt.sh     │     │              │     │               │     │              │
│  CCADB      │────▶│   Pipeline   │────▶│  data/*.json   │────▶│  Vite Build  │
│  Bugzilla   │     │  (Python)    │     │  (committed)   │     │  (transform) │
│  StatCounter│     │              │     │               │     │              │
│  keylength  │     └──────────────┘     └───────────────┘     └──────┬───────┘
└─────────────┘                                                       │
                                                                      ▼
                                                              ┌──────────────┐
                                                              │  Static App  │
                                                              │  (React SPA) │
                                                              │  GitHub Pages│
                                                              └──────────────┘
```

## Data Flow

### Pipeline Stage

Eight Python scripts run daily at 06:00 UTC via GitHub Actions:

| Script | Input | Output | Purpose |
|--------|-------|--------|---------|
| `fetch_and_join.py` | crt.sh API, CCADB CSV | `market_share.json`, `intersections.json`, `geography.json`, `gov_risk.json`, `ca/*.json` | Market structure, trust store profiles, geographic distribution |
| `fetch_incidents.py` | Bugzilla REST API, Anthropic API | `incidents.json` | Operational risk: incident counts, classification, self-report rates |
| `fetch_root_algo.py` | CCADB root PEMs | `root_algorithms.json` | Cryptographic posture: key families, sizes, signature hashes |
| `fetch_browser_share.py` | StatCounter | `browser_coverage.json` | Browser market share for web coverage estimates |
| `fetch_rpe.py` | Bugzilla REST API, CCADB, cabforum.org | `root_program_effectiveness.json` | Governance risk: enforcement, oversight, policy leadership, trust surface (7 phases) |
| `fetch_microsoft_ctl.py` | learn.microsoft.com | `microsoft_ctl_changelog.json` | Microsoft trust store changelog from monthly deployment notices (2020+) |
| `fetch_chrome_root_store.py` | Chromium Gitiles API | `chrome_root_store_changelog.json` | Chrome Root Store changelog from source code git history (2022+) |
| `fetch_trust_snapshots.py` | CCADB CSV | `snapshots/YYYY-MM-DD.json` | Daily trust store state for all four programs; diffs build cross-store changelog |

The distrust history data (`distrust/distrusted.json`) is a curated dataset with per-event classification, timeline, and per-store distrust dates. It is the single source of truth for both the Distrust History tab (Tab 11) and the Governance Risk tab (Tab 12, enforcement metrics).

Pipeline outputs are committed to the repository. This means the data directory is a versioned, auditable record of the WebPKI's state over time.

### Build Stage

The Vite plugin (`vite.config.js`) reads the pipeline JSON at build time and applies three critical transformations:

1. **Trust-scope filtering** — Only CAs with `trust_store_count > 0` or a `parent_ca` relationship pass through. Distrusted CAs (WoSign, CNNIC, DigiNotar, etc.) are excluded from all current-ecosystem analysis. CCADB tracks 248 CA owners; 97 are currently trusted.

2. **Country normalization** — CCADB uses inconsistent country names ("United States of America", "USA", "US"). The plugin normalizes these to canonical forms ("United States") so cross-referencing works.

3. **Data reshaping** — Pipeline JSON field names are transformed to the app's internal naming conventions. Geography data is recomputed from the trusted CA set (the pipeline's geography.json includes distrusted CAs). Government risk data is filtered and recounted.

The output is a virtual ES module that the React app imports as `virtual:pipeline-data`. No runtime API calls.

### Dashboard Stage

The React app renders 12 tabs from the embedded data via a shared `PipelineContext`. Each tab is a self-contained view component that pulls what it needs from the context and renders cards, tables, charts, and maps.

## Key Architectural Decisions

### Why static?

The data changes once per day. A server-rendered or API-backed architecture would add operational complexity (hosting, authentication, rate limiting, error handling) for zero benefit. Static deployment means the dashboard loads instantly, works offline after first load, and costs nothing to serve.

### Why embed data at build time?

Embedding the data in the JavaScript bundle eliminates the waterfall problem: the browser doesn't need to fetch JSON files after loading the app. For a dashboard with ~2MB of source data, this is the right tradeoff. The alternative (runtime fetch) would add loading states, error handling, and a perceptible delay on every page load.

### Why filter trust scope in the build, not the pipeline?

The pipeline produces data for all CCADB-tracked CAs because the raw data is useful for other purposes (historical analysis, pipeline debugging, data archival). The build layer applies the "currently trusted only" filter because that's a presentation concern — the dashboard's scope is the current trust surface, but the data layer preserves the full record.

### Why React + Vite, not a notebook or static site generator?

The dashboard has interactive elements (expandable rows, sortable tables, zoomable maps, filter controls, paginated lists) that require a component framework. React provides the component model; Vite provides fast builds and the virtual module plugin capability. The recharts and d3 libraries provide the visualization layer.

## Component Architecture

```
App.jsx
├── PipelineProvider (context: all pipeline data)
│   ├── TabBar (hash-based routing)
│   ├── ErrorBoundary (per-tab crash isolation)
│   │   └── MarketView / TrustView / ConcView / ... (12 tabs)
│   │       ├── StatCard, Card, CardTitle (layout atoms)
│   │       ├── MethodologyCard, MethodologyItem (shared methodology pattern)
│   │       ├── GeoMap, ChartWrap (visualization wrappers)
│   │       ├── TrustDots, Badge, RateDot (data display atoms)
│   │       └── CADetail (shared expandable CA detail panel)
│   └── Footer (methodology disclosure)
└── ErrorBoundary (app-level fallback)
```

Each view component follows the same pattern:
1. Destructure what it needs from `usePipeline()`
2. Compute derived metrics via `useMemo()`
3. Render summary stat cards, then charts/maps, then detailed tables
4. Include a `MethodologyCard` at the bottom explaining data sources, derivations, and limitations (shared component from `shared.jsx`)

## File Structure

```
webpki-observatory/
├── pipeline/                    # Data collection (Python)
│   ├── fetch_and_join.py        # Main pipeline: crt.sh + CCADB → market/trust/geo/gov
│   ├── fetch_incidents.py       # Bugzilla → incident classification
│   ├── fetch_root_algo.py       # CCADB PEMs → root algorithm analysis
│   ├── fetch_browser_share.py   # StatCounter → browser coverage
│   ├── fetch_rpe.py             # Bugzilla + CCADB + cabforum → governance risk (7 phases)
│   ├── fetch_microsoft_ctl.py   # learn.microsoft.com → Microsoft trust store changelog
│   ├── fetch_chrome_root_store.py # Chromium git log → Chrome Root Store changelog
│   ├── fetch_trust_snapshots.py # Daily CCADB snapshot for cross-store diff changelog
│   ├── distrust/                # Distrust history data
│   │   └── distrusted.json     # Curated events with per-store dates (single source of truth)
│   ├── ops_cache/               # Cached API responses
│   │   ├── bugs_raw.json        # Bugzilla bug list cache
│   │   ├── comments_cache.json  # Bugzilla comment cache
│   │   ├── cabforum_ballots.json # CA/Browser Forum ballot data (SC+CSC+SMC+NS)
│   │   ├── microsoft_ctl_cache.json # Microsoft deployment notice cache
│   │   └── chrome_root_store_cache.json # Chromium commit diff cache
│   ├── gov_classifications.json # Manually curated government CA ties
│   ├── name_mappings.json       # crt.sh ↔ CCADB name normalization
│   └── enrichments.json         # Manual capability overrides
├── data/                        # Pipeline output (committed, versioned)
│   ├── market_share.json        # 248 CAs ranked by issuance
│   ├── intersections.json       # Trust store overlap matrix
│   ├── geography.json           # Regional aggregation
│   ├── gov_risk.json            # Government CA classifications
│   ├── incidents.json           # Bugzilla compliance incidents
│   ├── jurisdiction_risk.json   # Key seizure / compulsion laws
│   ├── root_algorithms.json     # Root cert cryptographic data
│   ├── browser_coverage.json    # Browser → root program mapping
│   ├── root_program_effectiveness.json # Governance risk metrics (7-phase pipeline)
│   ├── microsoft_ctl_changelog.json    # Microsoft trust store change history
│   ├── chrome_root_store_changelog.json # Chrome Root Store change history
│   ├── trust_surface.json       # Trust store intersection analysis
│   ├── trust_store_changelog.json # Cross-store trust change history (from snapshots)
│   ├── history.json             # Historical trust store state diffs
│   ├── ca_details.json          # Per-CA aggregate detail (roots, intermediates, counts)
│   ├── metadata.json            # Pipeline run timestamps and freshness tracking
│   ├── snapshots/               # Daily CCADB trust store snapshots
│   └── ca/                      # Per-CA detail files (roots, intermediates, PEMs)
├── app/                         # Dashboard (React + Vite)
│   ├── vite.config.js           # Data transform plugin
│   ├── scripts/validate-data.cjs # Build-time data validation
│   ├── src/
│   │   ├── App.jsx              # Shell: tabs, header, footer
│   │   ├── ErrorBoundary.jsx    # Per-tab crash isolation
│   │   ├── PipelineContext.jsx   # Shared data context
│   │   ├── data.js              # Virtual module re-exports
│   │   ├── constants.js         # Theme, display names, coordinates
│   │   ├── helpers.js           # Derived metrics (PPM, coverage, etc.)
│   │   ├── styles.js            # Shared style objects
│   │   └── components/
│   │       ├── shared.jsx       # Reusable atoms (Card, GeoMap, TrustDots, etc.)
│   │       ├── CADetail.jsx     # Expandable CA detail panel
│   │       ├── MarketView.jsx   # Tab 1: Market Share
│   │       ├── TrustView.jsx    # Tab 2: Trust Surface
│   │       ├── ConcView.jsx     # Tab 3: Concentration Risk
│   │       ├── TailView.jsx     # Tab 4: Long Tail Risk
│   │       ├── GeoView.jsx      # Tab 5: Geographic Risk
│   │       ├── GovView.jsx      # Tab 6: Government Risk
│   │       ├── JurisdictionView.jsx # Tab 7: Jurisdiction Risk
│   │       ├── OpsView.jsx      # Tab 8: Operational Risk
│   │       ├── PolicyView.jsx   # Tab 9: Policy Impact
│   │       ├── CryptoView.jsx   # Tab 10: Cryptographic Posture
│   │       ├── DistrustView.jsx # Tab 11: Distrust History
│   │       └── GovernanceRiskView.jsx # Tab 12: Governance Risk
│   └── .eslintrc.json, .prettierrc
└── .github/workflows/deploy.yml # Daily pipeline + build + deploy
```
