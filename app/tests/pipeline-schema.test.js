/**
 * pipeline-schema.test.js — Validates pipeline JSON output against expected schema.
 *
 * Uses the current pipeline output as the baseline. These tests catch:
 *   - Missing or renamed fields in pipeline output
 *   - Type changes (string → number, etc.)
 *   - Constraint violations (shares don't sum to 100, self+ext≠total)
 *   - Data relationship breaks (intersection counts inconsistent)
 *
 * Run: npm test
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const dataDir = resolve(__dirname, '../../data');
const pipelineDir = resolve(__dirname, '../../pipeline');

function loadJSON(dir, file) {
  const p = resolve(dir, file);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ═══════════════════════════════════════════════════════════════
// market_share.json
// ═══════════════════════════════════════════════════════════════
describe('market_share.json', () => {
  const ms = loadJSON(dataDir, 'market_share.json');

  it('exists and is non-empty array', () => {
    expect(ms).toBeTruthy();
    expect(Array.isArray(ms)).toBe(true);
    expect(ms.length).toBeGreaterThan(50);
  });

  it('every CA has required fields', () => {
    const required = ['ca_owner', 'unexpired_precerts', 'all_precerts', 'market_share_pct',
      'trust_store_count', 'trusted_by', 'rank', 'country', 'root_count'];
    for (const ca of ms) {
      for (const field of required) {
        expect(ca).toHaveProperty(field);
      }
    }
  });

  it('market_share_pct sums to ~100%', () => {
    const sum = ms.reduce((s, ca) => s + (ca.market_share_pct || 0), 0);
    expect(sum).toBeCloseTo(100, 0);
  });

  it('no negative certificate counts', () => {
    for (const ca of ms) {
      expect(ca.all_precerts).toBeGreaterThanOrEqual(0);
    }
  });

  it('all_precerts >= unexpired_precerts for all CAs', () => {
    for (const ca of ms) {
      expect(ca.all_precerts).toBeGreaterThanOrEqual(ca.unexpired_precerts);
    }
  });

  it('trusted CAs have storeCount > 0', () => {
    const trusted = ms.filter(ca => ca.trust_store_count > 0);
    expect(trusted.length).toBeGreaterThanOrEqual(50);
    for (const ca of trusted) {
      expect(ca.trust_store_count).toBeGreaterThan(0);
      expect(ca.trust_store_count).toBeLessThanOrEqual(4);
    }
  });

  it('trusted_by is consistent with trust_store_count', () => {
    for (const ca of ms) {
      const tb = ca.trusted_by || {};
      const count = ['mozilla', 'chrome', 'apple', 'microsoft'].filter(s => tb[s]).length;
      expect(count).toBe(ca.trust_store_count);
    }
  });

  it('ranks are sequential starting at 1', () => {
    for (let i = 0; i < ms.length; i++) {
      expect(ms[i].rank).toBe(i + 1);
    }
  });

  it('has intermediates_count field (SKI de-duplicated)', () => {
    const trusted = ms.filter(ca => ca.trust_store_count > 0);
    for (const ca of trusted) {
      expect(ca).toHaveProperty('intermediates_count');
      expect(typeof ca.intermediates_count).toBe('number');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// intersections.json
// ═══════════════════════════════════════════════════════════════
describe('intersections.json', () => {
  const ix = loadJSON(dataDir, 'intersections.json');

  it('exists with required fields', () => {
    expect(ix).toBeTruthy();
    expect(ix).toHaveProperty('total_included_roots');
    expect(ix).toHaveProperty('total_active_owners');
    expect(ix).toHaveProperty('all_four_stores');
    expect(ix).toHaveProperty('per_store');
    expect(ix).toHaveProperty('root_combinations');
    expect(ix).toHaveProperty('owner_combinations');
  });

  it('root_combinations sum matches total', () => {
    const sum = ix.root_combinations.reduce((s, c) => s + c.root_count, 0);
    expect(sum).toBe(ix.total_included_roots);
  });

  it('owner_combinations sum matches total', () => {
    const sum = ix.owner_combinations.reduce((s, c) => s + c.owner_count, 0);
    expect(sum).toBe(ix.total_active_owners);
  });

  it('per_store has all four programs', () => {
    for (const store of ['Mozilla', 'Chrome', 'Apple', 'Microsoft']) {
      expect(ix.per_store).toHaveProperty(store);
      expect(ix.per_store[store]).toHaveProperty('roots');
      expect(ix.per_store[store]).toHaveProperty('owners');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// incidents.json
// ═══════════════════════════════════════════════════════════════
describe('incidents.json', () => {
  const inc = loadJSON(dataDir, 'incidents.json');

  it('exists with required fields', () => {
    expect(inc).toBeTruthy();
    expect(inc).toHaveProperty('total');
    expect(inc).toHaveProperty('ca_count');
    expect(inc).toHaveProperty('years');
    expect(inc).toHaveProperty('cas');
  });

  it('yearly sum matches total', () => {
    const sum = inc.years.reduce((s, y) => s + y.n, 0);
    expect(sum).toBe(inc.total);
  });

  it('per-CA self + ext = n for every CA', () => {
    for (const ca of inc.cas) {
      expect(ca.self + ca.ext).toBe(ca.n);
    }
  });

  it('has at least 10 years of data', () => {
    expect(inc.years.length).toBeGreaterThanOrEqual(10);
  });

  it('has yearsByClass with matching total', () => {
    expect(inc.yearsByClass).toBeTruthy();
    expect(inc.yearsByClass.length).toBeGreaterThan(0);
    const sum = inc.yearsByClass.reduce((s, y) =>
      s + (y.mi || 0) + (y.rv || 0) + (y.gv || 0) + (y.vl || 0), 0);
    expect(sum).toBe(inc.total);
  });

  it('has fingerprints for classified CAs', () => {
    expect(inc.fingerprints).toBeTruthy();
    expect(inc.fingerprints.length).toBeGreaterThan(0);
    for (const fp of inc.fingerprints) {
      expect(fp).toHaveProperty('ca');
      expect(fp).toHaveProperty('mi');
      expect(fp).toHaveProperty('rv');
      expect(fp).toHaveProperty('gv');
      expect(fp).toHaveProperty('vl');
    }
  });

  it('has categories', () => {
    expect(inc.categories).toBeTruthy();
    expect(inc.categories.length).toBeGreaterThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════
// geography.json
// ═══════════════════════════════════════════════════════════════
describe('geography.json', () => {
  const geo = loadJSON(dataDir, 'geography.json');

  it('has regions with countries', () => {
    expect(geo).toBeTruthy();
    expect(geo.regions.length).toBeGreaterThanOrEqual(3);
    for (const r of geo.regions) {
      if (r.region !== 'Unknown') {
        expect(r.countries.length).toBeGreaterThan(0);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// jurisdiction_risk.json
// ═══════════════════════════════════════════════════════════════
describe('jurisdiction_risk.json', () => {
  const jr = loadJSON(dataDir, 'jurisdiction_risk.json');

  it('has jurisdictions with required fields', () => {
    expect(jr).toBeTruthy();
    expect(jr.jurisdictions.length).toBeGreaterThanOrEqual(10);
    for (const j of jr.jurisdictions) {
      expect(j).toHaveProperty('country');
      expect(j).toHaveProperty('risk');
      expect(j).toHaveProperty('axes');
      expect(j).toHaveProperty('laws');
      expect(j.laws.length).toBeGreaterThan(0);
    }
  });

  it('all axes have valid values', () => {
    const valid = ['purpose', 'general', 'none'];
    for (const j of jr.jurisdictions) {
      expect(valid).toContain(j.axes.key_seizure);
      expect(valid).toContain(j.axes.compelled_issuance);
      expect(valid).toContain(j.axes.secrecy);
    }
  });

  it('risk tiers are valid', () => {
    const valid = ['high', 'moderate', 'low'];
    for (const j of jr.jurisdictions) {
      expect(valid).toContain(j.risk);
    }
  });

  it('high risk = all three purpose-built', () => {
    const high = jr.jurisdictions.filter(j => j.risk === 'high');
    for (const j of high) {
      expect(j.axes.key_seizure).toBe('purpose');
      expect(j.axes.compelled_issuance).toBe('purpose');
      expect(j.axes.secrecy).toBe('purpose');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// root_algorithms.json
// ═══════════════════════════════════════════════════════════════
describe('root_algorithms.json', () => {
  const ra = loadJSON(dataDir, 'root_algorithms.json');

  it('has roots with required fields', () => {
    expect(ra).toBeTruthy();
    expect(ra.roots.length).toBeGreaterThan(100);
    for (const r of ra.roots) {
      expect(r).toHaveProperty('ca_owner');
      expect(r).toHaveProperty('name');
      expect(r).toHaveProperty('key_family');
      expect(r).toHaveProperty('key_bits');
      expect(r).toHaveProperty('sig_hash');
      expect(r).toHaveProperty('stores');
    }
  });

  it('key_family is RSA or ECC', () => {
    for (const r of ra.roots) {
      expect(['RSA', 'ECC']).toContain(r.key_family);
    }
  });

  it('ECC roots have curve field', () => {
    const ecc = ra.roots.filter(r => r.key_family === 'ECC');
    expect(ecc.length).toBeGreaterThan(0);
    for (const r of ecc) {
      expect(r.curve).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// distrusted.json
// ═══════════════════════════════════════════════════════════════
describe('distrusted.json', () => {
  const dist = loadJSON(pipelineDir, 'distrust/distrusted.json');

  it('has events with required fields', () => {
    expect(dist).toBeTruthy();
    expect(dist.events.length).toBeGreaterThanOrEqual(15);
    for (const e of dist.events) {
      expect(e).toHaveProperty('ca');
      expect(e).toHaveProperty('year');
      expect(e).toHaveProperty('compliance_posture');
      expect(e).toHaveProperty('reason_tags');
      expect(e).toHaveProperty('distrust_dates');
    }
  });

  it('compliance postures are valid', () => {
    const valid = ['willful_circumvention', 'argumentative_noncompliance',
      'negligent_noncompliance', 'demonstrated_incompetence', 'accidental'];
    for (const e of dist.events) {
      expect(valid).toContain(e.compliance_posture);
    }
  });

  it('stats.postureDistribution matches events', () => {
    const actual = {};
    for (const e of dist.events) {
      actual[e.compliance_posture] = (actual[e.compliance_posture] || 0) + 1;
    }
    expect(dist.stats.posture_distribution).toEqual(actual);
  });

  it('all events have timelines', () => {
    for (const e of dist.events) {
      expect(e).toHaveProperty('timeline');
      expect(e.timeline).toHaveProperty('first_bug_date');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// root_program_effectiveness.json
// ═══════════════════════════════════════════════════════════════
describe('root_program_effectiveness.json', () => {
  const rpe = loadJSON(dataDir, 'root_program_effectiveness.json');

  it('exists with core sections', () => {
    expect(rpe).toBeTruthy();
    expect(rpe).toHaveProperty('meta');
    expect(rpe).toHaveProperty('bug_creation_by_year');
    expect(rpe).toHaveProperty('oversight_quarterly');
    expect(rpe).toHaveProperty('enforcement');
    expect(rpe).toHaveProperty('policy_leadership');
    expect(rpe).toHaveProperty('ballot_classification');
    expect(rpe).toHaveProperty('notable_gaps');
    expect(rpe).toHaveProperty('store_posture');
    expect(rpe).toHaveProperty('program_comment_summary');
  });

  it('enforcement has all four programs', () => {
    for (const prog of ['chrome', 'mozilla', 'apple', 'microsoft']) {
      expect(rpe.enforcement).toHaveProperty(prog);
    }
  });

  it('oversight_quarterly has data', () => {
    expect(rpe.oversight_quarterly.length).toBeGreaterThan(10);
  });
});

// ═══════════════════════════════════════════════════════════════
// llm_snapshot.json
// ═══════════════════════════════════════════════════════════════
describe('llm_snapshot.json', () => {
  const snap = loadJSON(dataDir, 'llm_snapshot.json');

  it('exists with $schema and version', () => {
    expect(snap).toBeTruthy();
    expect(snap.$schema).toBe('https://webpki.systematicreasoning.com/schema.json');
    expect(snap.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(snap.generatedAt).toBeTruthy();
  });

  it('has all required sections', () => {
    const required = ['market', 'concentration', 'trustSurface', 'geography',
      'governmentRisk', 'jurisdictionRisk', 'incidents', 'brThresholds',
      'cryptoSummary', 'rootAlgorithms', 'distrustEvents', 'distrustStats',
      'governance', 'browserCoverage'];
    for (const key of required) {
      expect(snap).toHaveProperty(key);
    }
  });

  it('market shares sum to ~100%', () => {
    const sum = snap.market.reduce((s, ca) => s + ca.share, 0);
    expect(sum).toBeCloseTo(100, 0);
  });

  it('rootAlgorithms have store and capability fields', () => {
    for (const r of snap.rootAlgorithms) {
      expect(r).toHaveProperty('stores');
      expect(r).toHaveProperty('tls');
      expect(r).toHaveProperty('validTo');
      expect(r).toHaveProperty('keyFamily');
    }
  });

  it('incidents have yearsByClass and fingerprints', () => {
    expect(snap.incidents.yearsByClass.length).toBeGreaterThan(0);
    expect(snap.incidents.fingerprints.length).toBeGreaterThan(0);
  });

  it('governance has full detail (not just report card)', () => {
    expect(snap.governance.oversightQuarterly.length).toBeGreaterThan(0);
    expect(snap.governance.bugCreationByYear.length).toBeGreaterThan(0);
    expect(snap.governance).toHaveProperty('policyLeadership');
    expect(snap.governance).toHaveProperty('ballotClassification');
    expect(snap.governance).toHaveProperty('notableGaps');
  });

  it('distrust events have timelines', () => {
    const withTimelines = snap.distrustEvents.filter(e => e.timeline);
    expect(withTimelines.length).toBe(snap.distrustEvents.length);
  });
});

// ═══════════════════════════════════════════════════════════════
// Cross-file consistency
// ═══════════════════════════════════════════════════════════════
describe('cross-file consistency', () => {
  const ms = loadJSON(dataDir, 'market_share.json');
  const ix = loadJSON(dataDir, 'intersections.json');
  const inc = loadJSON(dataDir, 'incidents.json');

  it('intersection owner count ≤ market_share CA count', () => {
    expect(ix.total_active_owners).toBeLessThanOrEqual(ms.length);
  });

  it('incident CAs exist in market_share', () => {
    const caNames = new Set(ms.map(ca => ca.ca_owner));
    const missing = inc.cas.filter(ca => !caNames.has(ca.ca));
    // Some incident CAs may be distrusted and excluded — that's OK
    // But the majority should match
    expect(missing.length).toBeLessThan(inc.cas.length * 0.5);
  });
});
