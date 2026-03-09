import { DISPLAY_NAMES, COLORS } from './constants';
import { SLUG_NAMES } from './data';

/** Display name: resolves pipeline slugs and CCADB names to short human-readable form */
export const dn = (name) => {
  // Try direct display name lookup first (for full CA owner names)
  if (DISPLAY_NAMES[name]) return DISPLAY_NAMES[name];
  // Try resolving slug to CA owner name, then display name
  const caOwner = SLUG_NAMES[name];
  if (caOwner) return DISPLAY_NAMES[caOwner] || caOwner;
  return name;
};

/** Format large numbers: 1.2B, 3.4M, 5.6K */
export const f = (n) => {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};

/** Format number with locale separators */
export const fl = (n) => n.toLocaleString();

/** Parse "YYYY.MM.DD" date strings from pipeline data */
export const parseDate = (s) => {
  const [y, m, d] = s.split('.');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
};

/** Difference in fractional years between two Date objects */
export const yearsDiff = (d1, d2) => (d1 - d2) / (365.25 * 24 * 60 * 60 * 1000);

/** Slugify a CA name for use as a URL-safe identifier */
export const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/**
 * Look up incident rate for a CA by its slug ID.
 *
 * Uses all-time cert count as the denominator to match the all-time
 * incident numerator. Previous approach used current unexpired certs
 * which conflated a 12-year cumulative numerator with a point-in-time
 * denominator — producing extreme rates for low-current-volume CAs.
 *
 * Returns { n, ppm, ppmCurrent } or null if no cert count available.
 *   ppm = incidents per million ALL-TIME certs (methodologically consistent)
 *   ppmCurrent = incidents per million CURRENT certs (for backward compat)
 */
export const getIncidentRate = (incidentCounts, caId, certs, allTimeCerts) => {
  if (!certs && !allTimeCerts) return null;
  const n = incidentCounts[caId];
  if (n !== undefined) {
    const denom = allTimeCerts || certs;
    return {
      n,
      ppm: denom > 0 ? (n / denom) * 1e6 : 0,
      ppmCurrent: certs > 0 ? (n / certs) * 1e6 : null,
    };
  }
  return { n: 0, ppm: 0, ppmCurrent: 0 };
};

/**
 * Compute browser coverage from trust store presence.
 *
 * Maps a CA's root program inclusion to estimated web user reach via
 * StatCounter browser market share. Chrome Root Program covers ~77%
 * (includes Edge, Samsung Internet, Opera, and other Chromium browsers),
 * Apple ~18%, Mozilla ~2.5%, Microsoft <1%.
 *
 * Subordinate CAs inherit their parent's trust store presence.
 * Returns a fraction 0-1.
 */
export const getWebCoverage = (trustStores, parentId, caData, browserCoverage) => {
  let effectiveTb = trustStores;
  if (parentId) {
    const parent = caData.find((x) => x.id === parentId || x.caOwner === parentId);
    if (parent && parent.storeCount > 0) effectiveTb = parent.trustedBy;
  }
  if (!effectiveTb) return 0;
  let cov = 0;
  if (effectiveTb.chrome) cov += browserCoverage.chrome;
  if (effectiveTb.apple) cov += browserCoverage.apple;
  if (effectiveTb.mozilla) cov += browserCoverage.mozilla;
  if (effectiveTb.microsoft) cov += browserCoverage.microsoft;
  return Math.min(cov, 1);
};

/** Standards body compliance: which bodies flag a key as below minimum */
export const keyBelowStandard = (family, bits) => {
  const flags = [];
  if (family === 'RSA') {
    if (bits <= 2048) {
      flags.push('BSI', 'CNSA');
      if (bits < 2048) flags.push('NIST');
    }
    if (bits < 3072) flags.push('ECRYPT');
  }
  if (family === 'ECC' && bits < 384) flags.push('CNSA');
  return flags;
};

/** Standards body compliance: which bodies flag a hash as below minimum */
export const hashBelowStandard = (sig) => {
  const flags = [];
  if (sig === 'SHA-1') flags.push('NIST', 'ECRYPT', 'BSI', 'ANSSI', 'CNSA');
  if (sig === 'SHA-256') flags.push('CNSA');
  return flags;
};

/** Map standards status codes to colors */
export const standardsStatusColor = (status) => {
  if (status === 'recommended' || status === 'minimum' || status === 'acceptable') return COLORS.gn;
  if (status === 'acceptable_to_2030' || status === 'post_2030') return COLORS.am;
  if (status === 'below' || status === 'deprecated' || status === 'legacy') return COLORS.rd;
  return COLORS.t3;
};

/** Map standards status codes to display labels */
export const standardsStatusLabel = (status) => {
  if (status === 'recommended' || status === 'acceptable') return '✓';
  if (status === 'minimum') return 'min';
  if (status === 'acceptable_to_2030' || status === 'post_2030') return '→2030';
  if (status === 'below' || status === 'deprecated' || status === 'legacy') return '✗';
  return '—';
};
