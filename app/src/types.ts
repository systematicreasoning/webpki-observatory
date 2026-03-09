/**
 * types.ts — Type definitions for the WebPKI Observatory.
 *
 * Every pipeline data structure, component prop, and shared interface
 * is defined here. Property names are the canonical human-readable
 * versions used throughout the codebase.
 */

// ── Trust store flags ──

export interface TrustStorePresence {
  mozilla: boolean;
  chrome: boolean;
  microsoft: boolean;
  apple: boolean;
}

// ── Core CA record (from CA_DATA via vite build) ──

export interface CA {
  rank: number;
  id: string;                    // vite-generated slug (e.g. "lets-encrypt-isrg")
  caSlug: string;                // pipeline slug for per-CA JSON fetch
  caOwner: string;               // CCADB canonical name
  certs: number;                 // unexpired precertificates
  allTimeCerts: number;          // all-time precertificates
  share: number;                 // market share percentage
  turnover: number;              // certificate turnover ratio
  avgDays: number;               // average certificate usage period (days)
  avgMonths: number;             // average certificate usage period (months)
  trustedBy: TrustStorePresence;
  storeCount: number;            // 0-4
  country: string;               // normalized jurisdiction
  rootCount: number;             // from CCADB
  intermediateCount: number;     // non-revoked intermediates from CCADB
  smime: boolean;                // S/MIME capable
  codeSigning: boolean;          // code signing capable
  matched: boolean;              // matched to CCADB record
  inferred: boolean;             // inferred (not directly in CCADB)
  parent: string;                // parent CA owner (for subordinates)
  note: string;                  // attribution note
  issuanceCaveat: string;        // "undercounted_cross_sign" or ""
}

// ── Root certificate (from ROOTS_DATA embedded in vite bundle) ──

export interface EmbeddedRoot {
  name: string;                  // root certificate common name (was: n)
  sha256: string;                // SHA-256 fingerprint (was: h)
  stores: string;                // e.g. "MCA" for Mozilla+Chrome+Apple (was: s)
  capabilities: string;          // e.g. "TES" for TLS+EV+SMIME (was: c)
  validFrom: string;             // ISO date (was: vf)
  validTo: string;               // ISO date (was: vt)
}

// ── Root certificate from per-CA JSON fetch (richer, includes PEM) ──

export interface FetchedRoot {
  name: string;
  sha256: string;
  pem: string;
  valid_from: string;
  valid_to: string;
  mozilla_status: string;
  chrome_status: string;
  microsoft_status: string;
  apple_status: string;
  tls_capable: boolean;
  ev_capable: boolean;
  smime_capable: boolean;
  code_signing_capable: boolean;
}

// ── Intermediate CA from per-CA JSON fetch ──

export interface FetchedIntermediate {
  name: string;
  sha256: string;
  pem: string;
  parent_name: string;
  valid_from: string;
  valid_to: string;
  technically_constrained: boolean;
  tls_capable: boolean;
  ev_capable: boolean;
  smime_capable: boolean;
  code_signing_capable: boolean;
}

// ── Per-CA JSON file (fetched on demand when expanding CA details) ──

export interface PerCADetail {
  ca_owner: string;
  roots: FetchedRoot[];
  intermediates: FetchedIntermediate[];
}

// ── Intersections (trust store overlap) ──

export interface StoreCombo {
  stores: string;                // e.g. "Mozilla · Chrome · Apple"
  count: number;                 // root or owner count (was: n)
}

export interface PerStoreData {
  roots: number;                 // root count (was: r)
  owners: number;                // owner count (was: o)
}

export interface Intersections {
  rootCombinations: StoreCombo[];         // was: rc
  ownerCombinations: StoreCombo[];        // was: oc
  perStore: Record<string, PerStoreData>; // was: ps
  allFourStores: { roots: number; owners: number }; // was: a4
  activeOwners: number;                   // was: ao
  totalRoots: number;                     // was: tr
}

// ── Geography ──

export interface RegionData {
  region: string;               // was: rg
  caCount: number;              // was: n
  issuancePct: number;          // was: p
  countries: Record<string, { count: number; certs: number }>;
}

// ── Government risk ──

export interface GovCA {
  id: string;
  caOwner: string;
  type: 'GO' | 'SE';           // Government-Operated or State Enterprise
  jurisdiction: string;
  influence: string;            // nature of structural tie
  storeCount: number;
  certs: number;
}

export interface GovRisk {
  total: number;                // was: n
  cas: GovCA[];
  byType: Record<string, { label: string; count: number; certs: number }>;
}

// ── Incidents ──

export interface IncidentCA {
  ca: string;
  id: string;
  count: number;                // was: n
  selfReported: number;         // was: self
  externallyReported: number;   // was: ext
  selfReportPct: number;        // was: selfPct
}

export interface IncidentFingerprint {
  ca: string;
  misissuance: number;          // was: mi
  revocation: number;           // was: rv
  governance: number;           // was: gv
  validation: number;           // was: vl
}

export interface IncidentYear {
  year: number;                 // was: y
  count: number;                // was: n
}

export interface IncidentCategory {
  category: string;             // was: cat
  count: number;                // was: n
}

export interface IncidentsData {
  meta: Record<string, string>;
  total: number;
  caCount: number;              // was: ca_count
  years: IncidentYear[];
  categories: IncidentCategory[];
  yearsByClass: Record<string, number>[];
  fingerprints: IncidentFingerprint[];
  cas: IncidentCA[];
  distrustedExcluded: string[]; // was: distrusted_excluded
}

// ── Browser coverage ──

export interface BrowserCoverage {
  mozilla: number;
  chrome: number;
  microsoft: number;
  apple: number;
}

// ── BR validity thresholds ──

export interface BRValidity {
  thresholds: Array<{ days: number; date: string; label: string }>;
}

// ── Jurisdiction risk ──

export interface JurisdictionLaw {
  name: string;
  section: string;
  excerpt: string;
}

export interface Jurisdiction {
  country: string;
  risk: 'extreme' | 'high' | 'moderate' | 'low';
  summary: string;
  laws: JurisdictionLaw[];
}

export interface JurisdictionRisk {
  meta: Record<string, string>;
  jurisdictions: Jurisdiction[];
}

// ── Root algorithm data (from constants.js / pipeline) ──

export interface RootAlgoEntry {
  name: string;               // was: n in some contexts
  family: string;             // "RSA" or "ECC"
  bits: number;
  sig: string;                // signature hash: "SHA-1", "SHA-256", etc.
  curve?: string;             // for ECC: "P-256", "P-384", etc.
  key_family?: string;
  key_bits?: number;
  sig_hash?: string;
  sha256?: string;
  stores?: string;
  valid_from?: string;
  valid_to?: string;
}

// ── Incident rate (computed) ──

export interface IncidentRate {
  count: number;                // was: n
  perMillion: number;           // was: ppm
  perMillionCurrent: number | null; // was: ppmCurrent
}

// ── Pipeline context (what usePipeline() returns) ──

export interface PipelineData {
  caData: CA[];
  brValidity: BRValidity;
  browserCoverage: BrowserCoverage;
  intersections: Intersections;
  geography: RegionData[];
  govRisk: GovRisk;
  incidentsData: IncidentsData;
  roots: Record<string, EmbeddedRoot[]>;
  incidentCounts: Record<string, number>;
  jurisdictionRisk: JurisdictionRisk;
  trustedCAs: CA[];
}

// ── Shared component props ──

export interface ExpandableRowProps {
  expanded: string | number | null;
  setExpanded: (id: string | number | null) => void;
}

export interface FilterPaginateState {
  filter: string;
  setFilter: (v: string) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
}

// ── Map pin ──

export interface MapPin {
  lat: number;
  lng: number;
  label: string;
  color: string;
  r: number;
  count?: number | null;
  tooltip?: React.ReactNode;
}
