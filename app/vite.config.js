import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { readFileSync, existsSync, readdirSync } from "fs";

/**
 * Vite plugin that reads pipeline JSON at build time and exposes it
 * as a virtual ES module matching the app's data shapes.
 *
 * Property name mapping (pipeline -> app) is documented in each
 * transform function below.
 */
function pipelineDataPlugin() {
  const dataDir = process.env.PIPELINE_DATA_DIR
    ? resolve(process.env.PIPELINE_DATA_DIR)
    : resolve(__dirname, "../data");
  const pipelineDir = process.env.PIPELINE_DIR
    ? resolve(process.env.PIPELINE_DIR)
    : resolve(__dirname, "../pipeline");

  function loadJSON(dir, filename) {
    const filePath = resolve(dir, filename);
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf8"));
  }

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  return {
    name: "pipeline-data",
    resolveId(id) {
      if (id === "virtual:pipeline-data") return "\0virtual:pipeline-data";
      return null;
    },
    load(id) {
      if (id !== "\0virtual:pipeline-data") return null;

      console.log("[pipeline-data] Loading from", dataDir);

      const marketShare = loadJSON(dataDir, "market_share.json") || [];
      const intersections = loadJSON(dataDir, "intersections.json") || {};
      const geography = loadJSON(dataDir, "geography.json") || {};
      const govRisk = loadJSON(dataDir, "gov_risk.json") || {};
      const jurisdictionRisk = loadJSON(dataDir, "jurisdiction_risk.json") || {};
      const incidents = loadJSON(dataDir, "incidents.json") || {};
      const metadata = loadJSON(dataDir, "metadata.json") || {};

      const caDir = resolve(dataDir, "ca");
      const caDetails = {};
      if (existsSync(caDir)) {
        for (const file of readdirSync(caDir).filter(f => f.endsWith(".json") && f !== "_index.json")) {
          caDetails[file.replace(".json", "")] = JSON.parse(readFileSync(resolve(caDir, file), "utf8"));
        }
      }

      // Country name normalization
      const COUNTRY_NAMES = {
        "United States of America": "United States",
        "United Kingdom of Great Britain and Northern Ireland": "United Kingdom",
        "Republic of Korea (South Korea)": "South Korea",
        "Taiwan, Republic of China": "Taiwan",
        "Taiwan (Republic of China)": "Taiwan",
        "\u4e2d\u56fd": "China",
        "España": "Spain",
        "SPAIN": "Spain",
        "Polska": "Poland",
        "NL": "Netherlands",
        "US": "United States",
        "USA": "United States",
        "UAE": "United Arab Emirates",
        "Cabo Verde": "Cape Verde",
      };
      const normCountry = (c) => COUNTRY_NAMES[c] || c;

      // ── CA_DATA array ──
      // Pipeline: ca_owner, unexpired_precerts, all_precerts, market_share_pct, ...
      // App: caOwner, certs, allTimeCerts, share, rank, avgDays, avgMonths, turnover,
      //      trustedBy, storeCount, country, rootCount, intermediateCount,
      //      tls, ev, smime, codeSigning, matched, inferred, parent, id
      // Build lookup: ca_owner -> pipeline file slug (for fetching per-CA JSON files)
      const pipelineSlugLookup = {};
      for (const [fileSlug, ca] of Object.entries(caDetails)) {
        if (ca.ca_owner) pipelineSlugLookup[ca.ca_owner] = fileSlug;
      }

      const D = marketShare.map(ca => {
        const turnover = ca.all_precerts && ca.unexpired_precerts
          ? ca.all_precerts / ca.unexpired_precerts : 0;
        const usageDays = turnover > 0 ? Math.round(365 / turnover) : 0;
        return {
          rank: ca.rank,
          caOwner: ca.ca_owner,
          certs: ca.unexpired_precerts,
          allTimeCerts: ca.all_precerts,
          turnover: parseFloat(turnover.toFixed(1)),
          avgDays: usageDays,
          avgMonths: parseFloat((usageDays / 30.44).toFixed(1)),
          share: ca.market_share_pct,
          trustedBy: ca.trusted_by,
          storeCount: ca.trust_store_count,
          country: normCountry(ca.country || ""),
          rootCount: ca.root_count,
          intermediateCount: ca.intermediates_count,
          tls: ca.tls_capable,
          ev: ca.ev_capable,
          smime: ca.smime_capable,
          codeSigning: ca.code_signing_capable,
          matched: ca.matched,
          inferred: ca.inferred,
          parent: ca.parent_ca || "",
          id: slugify(ca.ca_owner),
          caSlug: pipelineSlugLookup[ca.ca_owner] || slugify(ca.ca_owner),
          note: ca.attribution_note || ca.note || "",
          issuanceCaveat: ca.issuance_caveat || "",
        };
      });

      // ── Distrust overrides ──
      // CCADB root inclusion status lags actual distrust actions. When all
      // four root programs have distrusted a CA for new issuance but CCADB
      // still shows "Included" (because pre-distrust certs remain valid),
      // we override storeCount to 0 so the CA is excluded from the trusted
      // scope. Each entry must document the distrust dates.
      const DISTRUST_OVERRIDES = {
        "Entrust": {
          reason: "Distrusted for new issuance: Chrome Nov 11 2024, Apple Nov 15 2024, Mozilla Dec 1 2024, Microsoft Apr 16 2025. Sold public CA business to Sectigo Sep 2025.",
        },
      };
      for (const ca of D) {
        if (DISTRUST_OVERRIDES[ca.caOwner]) {
          ca.storeCount = 0;
          ca.trustedBy = { mozilla: false, chrome: false, microsoft: false, apple: false };
          ca.note = DISTRUST_OVERRIDES[ca.caOwner].reason;
        }
      }

      // ── IX: intersections ──
      // Pipeline: root_combinations[{stores, root_count}], owner_combinations[{stores, owner_count}], ...
      const IX = {
        rootCombinations: (intersections.root_combinations || []).map(c => ({ stores: c.stores, s: c.stores, count: c.root_count })),
        ownerCombinations: (intersections.owner_combinations || []).map(c => ({ stores: c.stores, count: c.owner_count })),
        perStore: Object.fromEntries(
          Object.entries(intersections.per_store || {}).map(([store, data]) => [
            store.charAt(0).toUpperCase() + store.slice(1),
            { roots: data.roots, owners: data.owners },
          ])
        ),
        allFourStores: { roots: intersections.all_four_stores?.roots || 0, owners: intersections.all_four_stores?.owners || 0 },
        activeOwners: intersections.total_active_owners || 0,
        totalRoots: intersections.total_included_roots || 0,
      };

      // ── GEO ──
      // SCOPE: Recomputed from trusted CAs only. The pipeline's geography.json
      // includes distrusted CAs (e.g. US=29 vs trusted=18, China=12 vs trusted=8).
      // We use the pipeline's regional structure but recount from trusted CAs.
      const trustedCAs = D.filter(d => d.storeCount > 0 || d.parent);
      const totalTrustedCertsGeo = trustedCAs.reduce((s, d) => s + d.certs, 0);

      // Build region→country mapping from pipeline geography (for the regional grouping)
      const regionForCountry = {};
      (geography.regions || []).forEach(r => {
        r.countries.forEach(c => { regionForCountry[normCountry(c.country)] = r.region; });
      });

      // Group trusted CAs by region and country
      const regionAgg = {};
      trustedCAs.forEach(d => {
        const country = d.country;
        const region = regionForCountry[country];
        if (!region) return; // CA country not in any geography region
        if (!regionAgg[region]) regionAgg[region] = { certs: 0, countries: {} };
        regionAgg[region].certs += d.certs;
        if (!regionAgg[region].countries[country]) regionAgg[region].countries[country] = { certs: 0, count: 0 };
        regionAgg[region].countries[country].certs += d.certs;
        regionAgg[region].countries[country].count++;
      });

      // Build GEO in the same shape the app expects, ordered by the pipeline's original region order
      const GEO = (geography.regions || []).map(region => {
        const agg = regionAgg[region.region] || { certs: 0, countries: {} };
        const regionPct = totalTrustedCertsGeo > 0 ? parseFloat(((agg.certs / totalTrustedCertsGeo) * 100).toFixed(4)) : 0;
        const countriesArr = region.countries
          .map(c => {
            const cn = normCountry(c.country);
            const ca = agg.countries[cn];
            if (!ca || ca.count === 0) return null;
            return {
              c: cn,
              p: totalTrustedCertsGeo > 0 ? parseFloat(((ca.certs / totalTrustedCertsGeo) * 100).toFixed(4)) : 0,
              n: ca.count,
            };
          })
          .filter(Boolean);
        const totalRegionCAs = countriesArr.reduce((s, c) => s + c.n, 0);
        return {
          rg: region.region,
          p: regionPct,
          v: agg.certs,
          cs: countriesArr,
          n: totalRegionCAs,
        };
      }).filter(r => r.n > 0); // Drop regions with zero trusted CAs

      // ── GOV ──
      // Pipeline: by_type{government:{label,count,issued,pct}, state_enterprise:{...}},
      //           classified_cas[{ca_owner, type, jurisdiction, state_influence, issued, trust_store_count}]
      // App: t{go:{l,c,p}, se:{l,c,p}}, cas[{ca, t, j, i, v, ts, id}], n
      //
      // SCOPE: Only currently-trusted CAs (trust_store_count > 0). Distrusted CAs
      // like US FPKI (stores=0) are excluded. The by_type summary counts are
      // recomputed from the filtered list to stay consistent.
      const typeMap = { government: "go", state_enterprise: "se" };
      const typeCodeMap = { government: "GO", state_enterprise: "SE" };
      const trustedGovCAs = (govRisk.classified_cas || [])
        .filter(ca => (ca.trust_store_count || 0) > 0)
        .map(ca => ({
          caOwner: ca.ca_owner || ca.ca,
          type: typeCodeMap[ca.type] || ca.type,
          jurisdiction: normCountry(ca.jurisdiction),
          influence: ca.state_influence || ca.info || "",
          certs: ca.issued || ca.certs || 0,
          storeCount: ca.trust_store_count,
          id: ca.id || slugify(ca.ca_owner || ca.ca),
        }));
      // Recompute by_type counts from the trusted-only list
      const totalTrustedCerts = D.filter(d => d.storeCount > 0 || d.parent).reduce((s, d) => s + d.certs, 0);
      const govByType = {};
      trustedGovCAs.forEach(ca => {
        const tk = ca.type === "GO" ? "go" : "se";
        if (!govByType[tk]) govByType[tk] = { l: ca.type === "GO" ? "Government-Operated" : "State-Owned Enterprise", c: 0, certs: 0 };
        govByType[tk].c++;
        govByType[tk].certs += ca.certs;
      });
      Object.values(govByType).forEach(v => { v.p = totalTrustedCerts > 0 ? parseFloat(((v.certs / totalTrustedCerts) * 100).toFixed(2)) : 0; });
      const GOV = {
        t: govByType,
        n: trustedGovCAs.length,
        cas: trustedGovCAs,
      };

      // ── OPS_DATA: incidents ──
      // Passes through mostly as-is since incident pipeline already uses the app shape.
      // SCOPE: Yearly totals, classification breakdowns, and fingerprints preserve
      // full history (including distrusted CAs) — the enforcement arc matters.
      // Per-CA list gets a `trusted` flag so the UI can distinguish current vs historical.
      const trustedIds = new Set(D.filter(d => d.storeCount > 0 || d.parent).map(d => d.id));
      const OPS_DATA = {
        total: incidents.total || 0,
        ca_count: incidents.ca_count || 0,
        years: incidents.years || [],
        categories: incidents.categories || [],
        cas: (incidents.cas || []).map(ca => {
          const id = ca.id || slugify(ca.ca || "");
          return { ...ca, id, trusted: trustedIds.has(id) };
        }),
        yearsByClass: incidents.yearsByClass || [],
        fingerprints: incidents.fingerprints || [],
        distrusted_excluded: incidents.distrusted_excluded || [],
      };

      // ── ROOTS_DATA: per-CA root certificates ──
      // Pipeline ca/*.json: roots[{name, sha256, mozilla_status, chrome_status, ...}]
      const ROOTS_DATA = {};
      for (const [fileSlug, ca] of Object.entries(caDetails)) {
        if (!ca.roots || ca.roots.length === 0) continue;
        const included = ca.roots.filter(root =>
          root.mozilla_status === "Included" || root.chrome_status === "Included" ||
          root.microsoft_status === "Included" || root.apple_status === "Included"
        );
        if (included.length === 0) continue;
        // Key by vite slugify of ca_owner to match CA_DATA id
        const key = slugify(ca.ca_owner || fileSlug);
        ROOTS_DATA[key] = included.map(root => ({
          name: root.name,
          sha256: root.sha256 || "",
          stores: [
            root.mozilla_status === "Included" && "M",
            root.chrome_status === "Included" && "C",
            root.microsoft_status === "Included" && "S",
            root.apple_status === "Included" && "A",
          ].filter(Boolean).join(""),
          capabilities: [
            root.tls_capable && "T",
            root.ev_capable && "E",
            root.smime_capable && "S",
            root.code_signing_capable && "C",
          ].filter(Boolean).join(""),
          validFrom: root.valid_from || "",
          validTo: root.valid_to || "",
        }));
      }

      // ── INC_LOOKUP: incident count by CA slug ──
      const INC_LOOKUP = {};
      for (const ca of OPS_DATA.cas) {
        const id = ca.id || slugify(ca.ca);
        INC_LOOKUP[id] = ca.n;
      }

      // ── BR_VALIDITY: Baseline Requirements validity schedule ──
      const BR_VALIDITY = [
        { from: "2020-09-01", days: 398, label: "398 days" },
        { from: "2026-03-15", days: 200, label: "200 days" },
        { from: "2027-03-15", days: 100, label: "100 days" },
        { from: "2029-03-15", days: 47, label: "47 days" },
      ];

      // ── BROWSER_COVERAGE ──
      const browserCovJSON = loadJSON(dataDir, "browser_coverage.json");
      const BROWSER_COVERAGE = browserCovJSON ? {
        chrome: browserCovJSON.coverage?.chrome || 0.77,
        apple: browserCovJSON.coverage?.apple || 0.18,
        mozilla: browserCovJSON.coverage?.mozilla || 0.025,
        microsoft: browserCovJSON.coverage?.microsoft || 0.005,
        notes: browserCovJSON.notes || "Web browsing coverage from StatCounter.",
      } : {
        chrome: 0.77, apple: 0.18, mozilla: 0.025, microsoft: 0.005,
        notes: "Web browsing coverage. Fallback values.",
      };

      // ── SLUG_NAMES: map pipeline slugs to display names ──
      // Used by dn() to resolve slugs from ROOTS data and per-CA detail files
      const SLUG_NAMES = {};
      for (const [fileSlug, ca] of Object.entries(caDetails)) {
        if (ca.ca_owner) SLUG_NAMES[fileSlug] = ca.ca_owner;
      }

      // ── ROOT_ALGO: pipeline-generated root algorithm data (replaces static ROOT_ALGO_DATA) ──
      // Covers all 335 roots across all 89 CAs, vs the static data which only had ~22 CAs.
      // Cross-reference: pipeline slugs (ca_id) don't match market_share slugs (slugify(ca_owner)).
      // Build a mapping so CryptoView can link roots to CA_DATA entries.
      const rootAlgoJSON = loadJSON(dataDir, "root_algorithms.json");
      const algoOwnerToMsId = {};
      for (const ca of D) {
        algoOwnerToMsId[ca.caOwner] = ca.id;
      }
      // Only include roots from currently trusted CAs
      const trustedOwners = new Set(D.filter(d => d.storeCount > 0 || d.parent).map(d => d.caOwner));
      const ROOT_ALGO = (rootAlgoJSON?.roots || [])
        .filter(r => trustedOwners.has(r.ca_owner))
        .map(r => ({
          ...r,
          ms_id: algoOwnerToMsId[r.ca_owner] || slugify(r.ca_owner),
        }));

      // ── DISTRUST_DATA: distrust history pipeline output ──
      let DISTRUST_DATA = { events: [], stats: {}, taxonomy: {} };
      const distrustPath = resolve(dataDir, "..", "pipeline", "distrust", "distrusted.json");
      if (existsSync(distrustPath)) {
        DISTRUST_DATA = JSON.parse(readFileSync(distrustPath, "utf8"));
        console.log("[pipeline-data] Distrust:", DISTRUST_DATA.events?.length || 0, "events");
      }

      const output = {
        CA_DATA: D,
        BR_VALIDITY,
        BROWSER_COVERAGE,
        INTERSECTIONS: IX,
        GEOGRAPHY: GEO,
        GOV_RISK: GOV,
        INCIDENTS_DATA: OPS_DATA,
        ROOTS: ROOTS_DATA,
        INCIDENT_COUNTS: INC_LOOKUP,
        SLUG_NAMES,
        JURISDICTION_RISK: jurisdictionRisk,
        ROOT_ALGO,
        DISTRUST_DATA,
      };

      console.log("[pipeline-data]", D.length, "CAs,",
        Object.keys(ROOTS_DATA).length, "CAs with roots,",
        Object.values(ROOTS_DATA).reduce((s, a) => s + a.length, 0), "roots,",
        OPS_DATA.cas.length, "CAs with incidents");

      return "export default " + JSON.stringify(output) + ";";
    },
  };
}

export default defineConfig({
  plugins: [react(), pipelineDataPlugin()],
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
});
