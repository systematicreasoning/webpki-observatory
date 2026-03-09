# WebPKI Observatory

Public dashboard tracking Certificate Authority market share, trust store coverage, geographic concentration, government presence, operational incidents, and cryptographic posture across the Web PKI ecosystem.

**Live:** https://webpki.systematicreasoning.com

## How it works

Three Python scripts fetch data from public sources daily, normalize it into JSON, and commit the results. A Vite build reads the JSON at compile time and produces a static React app deployed to GitHub Pages.

```
pipeline/     Fetch from crt.sh, CCADB, Bugzilla, StatCounter, keylength.com -> data/*.json
data/         Pipeline output, committed to repo, updated daily by CI
app/          Vite + React dashboard, reads data/ at build time
```

## Data sources

| Source | What | Frequency |
|--------|------|-----------|
| [crt.sh](https://crt.sh) | Certificate populations by CA owner | Daily |
| [CCADB](https://www.ccadb.org) | Root/intermediate metadata, trust store inclusion, capabilities | Daily |
| [Bugzilla](https://bugzilla.mozilla.org) | CA Certificate Compliance incidents (2014-present) | Daily |
| [keylength.com](https://keylength.com) | Standards body cryptographic recommendations | Manual |
| [StatCounter](https://gs.statcounter.com/browser-market-share) | Browser market share for web coverage estimates | Daily |

## Pipeline scripts

**fetch_and_join.py** joins crt.sh issuance data with CCADB trust store profiles. Outputs market share, trust surface, geographic distribution, government risk, and per-CA detail files.

**fetch_incidents.py** fetches Bugzilla CA compliance bugs, classifies them using the Anthropic API, and builds incident statistics with self-report rates and per-CA breakdowns.

**fetch_root_algo.py** downloads root certificate PEMs from CCADB in bulk and parses key algorithm, key size, signature hash, and validity dates using the cryptography library.

**fetch_browser_share.py** scrapes StatCounter for global browser market share and maps browser engines to root programs (Chrome, Apple, Mozilla, Microsoft) to estimate web coverage per trust store.

## Local development

```bash
cd app
npm install
PIPELINE_DATA_DIR=../data PIPELINE_DIR=../pipeline npx vite dev
```

## Deployment

GitHub Actions runs daily at 06:00 UTC. The workflow fetches fresh data, commits changes, builds the app, and deploys to GitHub Pages. Manual runs via `workflow_dispatch`.

Requires `ANTHROPIC_API_KEY` secret for incident classification.

Built by [Systematic Reasoning, Inc.](https://systematicreasoning.com)
