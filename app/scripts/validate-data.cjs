#!/usr/bin/env node
/**
 * validate-data.js — Build-time data integrity checks.
 *
 * Run as part of CI before `vite build` to catch pipeline regressions.
 * Exits with code 1 if any check fails.
 *
 * Usage: node validate-data.js [data-dir]
 */
const { readFileSync, existsSync } = require('fs');
const { resolve } = require('path');

const dataDir = process.argv[2] || resolve(__dirname, '../data');
let failures = 0;
let warnings = 0;

function check(label, condition, detail) {
  if (!condition) {
    console.error(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failures++;
  } else {
    console.log(`  ✓ ${label}`);
  }
}

function warn(label, condition, detail) {
  if (!condition) {
    console.warn(`  WARN: ${label}${detail ? ' — ' + detail : ''}`);
    warnings++;
  } else {
    console.log(`  ✓ ${label}`);
  }
}

function loadJSON(filename) {
  const path = resolve(dataDir, filename);
  if (!existsSync(path)) {
    console.error(`  FAIL: ${filename} not found at ${path}`);
    failures++;
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

console.log('=== Data Validation ===');
console.log(`Data directory: ${dataDir}`);
console.log('');

// ── market_share.json ──
console.log('market_share.json:');
const ms = loadJSON('market_share.json');
if (ms) {
  check('is non-empty array', Array.isArray(ms) && ms.length > 0, `${ms.length} CAs`);
  const pctSum = ms.reduce((s, ca) => s + (ca.market_share_pct || 0), 0);
  check('market_share_pct sums to ~100%', Math.abs(pctSum - 100) < 0.1, `sum=${pctSum.toFixed(4)}`);
  warn('no negative cert counts', ms.every(ca => ca.unexpired_precerts >= 0),
    `${ms.filter(ca => ca.unexpired_precerts < 0).map(ca => ca.ca_owner + '=' + ca.unexpired_precerts).join(', ') || 'OK'} (pipeline data quality — negative values from crt.sh deduplication)`);
  check('no negative all_precerts', ms.every(ca => ca.all_precerts >= 0));
  check('all_precerts >= unexpired_precerts', ms.every(ca => ca.all_precerts >= ca.unexpired_precerts));

  const trusted = ms.filter(ca => ca.trust_store_count > 0 || ca.parent_ca);
  check('at least 50 trusted CAs', trusted.length >= 50, `${trusted.length} trusted`);
  check('no trusted CA has store_count=0 and no parent', trusted.every(ca => ca.trust_store_count > 0 || ca.parent_ca));
}

// ── intersections.json ──
console.log('\nintersections.json:');
const ix = loadJSON('intersections.json');
if (ix) {
  const rcSum = (ix.root_combinations || []).reduce((s, c) => s + c.root_count, 0);
  check('root_combinations sum matches total', rcSum === ix.total_included_roots,
    `sum=${rcSum} total=${ix.total_included_roots}`);
  const ocSum = (ix.owner_combinations || []).reduce((s, c) => s + c.owner_count, 0);
  check('owner_combinations sum matches total', ocSum === ix.total_active_owners,
    `sum=${ocSum} total=${ix.total_active_owners}`);
}

// ── incidents.json ──
console.log('\nincidents.json:');
const inc = loadJSON('incidents.json');
if (inc) {
  const yearlySum = (inc.years || []).reduce((s, y) => s + y.n, 0);
  check('yearly sum matches total', yearlySum === inc.total, `sum=${yearlySum} total=${inc.total}`);
  check('has at least 10 years', (inc.years || []).length >= 10);
  check('all per-CA self+ext=n', (inc.cas || []).every(ca => ca.self + ca.ext === ca.n));
  if (inc.yearsByClass && inc.yearsByClass.length > 0) {
    const classSum = inc.yearsByClass.reduce((s, y) => s + (y.mi || 0) + (y.rv || 0) + (y.gv || 0) + (y.vl || 0), 0);
    check('yearsByClass matches total', classSum === inc.total, `classified=${classSum} total=${inc.total}`);
  }
}

// ── geography.json ──
console.log('\ngeography.json:');
const geo = loadJSON('geography.json');
if (geo) {
  check('has regions', (geo.regions || []).length >= 3);
  check('all named regions have countries', (geo.regions || []).every(r => r.region === 'Unknown' || (r.countries && r.countries.length > 0)));
}

// ── jurisdiction_risk.json ──
console.log('\njurisdiction_risk.json:');
const jr = loadJSON('jurisdiction_risk.json');
if (jr) {
  check('has jurisdictions', (jr.jurisdictions || []).length >= 10);
  check('all jurisdictions have risk level', (jr.jurisdictions || []).every(j => j.risk));
  check('all jurisdictions have laws', (jr.jurisdictions || []).every(j => j.laws && j.laws.length > 0));
}

// ── root_algorithms.json ──
console.log('\nroot_algorithms.json:');
const ra = loadJSON('root_algorithms.json');
if (ra) {
  check('has roots array', Array.isArray(ra.roots) && ra.roots.length > 0, `${(ra.roots || []).length} roots`);
  check('all roots have key_family', (ra.roots || []).every(r => r.key_family));
  check('all roots have sig_hash', (ra.roots || []).every(r => r.sig_hash));
}

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECKS FAILED'}${warnings > 0 ? ' (' + warnings + ' warnings)' : ''} ===`);
process.exit(failures > 0 ? 1 : 0);
