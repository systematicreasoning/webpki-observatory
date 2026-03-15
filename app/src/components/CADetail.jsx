/**
 * CADetail — Expandable detail panel for a single Certificate Authority.
 *
 * Used by MarketView, ConcView, TailView, GovView, and OpsView when a user
 * clicks a CA row to expand it. Shows trust store inclusion, root certificates,
 * capabilities, ops rate, and BR position.
 *
 * Receives a single `d` prop (a CA_DATA entry) and pulls everything else
 * from PipelineContext.
 */
import React, { useState, useEffect } from 'react';
import { COLORS, STORE_COLORS, FONT_MONO, FONT_SANS } from '../constants';
import { dn, fl, slugify, getIncidentRate, getWebCoverage } from '../helpers';
import { RateDot, CertViewer } from './shared';
import { usePipeline } from '../PipelineContext';
import { expandedCellStyle, tinyTableStyle } from '../styles';

const CADetail = ({ d }) => {
  const { caData, browserCoverage, roots, govRisk, incidentsData, incidentCounts } = usePipeline();

  const rate = getIncidentRate(incidentCounts, d.id, d.certs, d.allTimeCerts);
  const [viewCert, setViewCert] = useState(null);

  // ── Root certificate data ──
  // Prefer embedded roots from pipeline; fall back to fetching the per-CA JSON
  const embeddedRoots = roots?.[d.id] || null;
  const [fetchedCerts, setFetchedCerts] = useState(null);
  const [fetchError, setFetchError] = useState(false);

  // Fetch per-CA JSON for intermediates and PEM data
  useEffect(() => {
    const slug = d.caSlug || slugify(d.caOwner);
    setFetchError(false);
    fetch(`data/ca/${slug}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching CA detail for ${slug}`);
        return r.json();
      })
      .then((data) => setFetchedCerts(data))
      .catch((err) => {
        console.warn(`[CADetail] Failed to load detail for ${d.caOwner}:`, err.message);
        setFetchError(true);
      });
  }, [d.caOwner, d.caSlug]);

  // Prefer fetchedCerts (has PEM data from per-CA JSON) over embeddedRoots (no PEM)
  const rootList =
    fetchedCerts?.roots
      ?.filter(
        (r) =>
          r.mozilla_status === 'Included' ||
          r.microsoft_status === 'Included' ||
          r.chrome_status === 'Included' ||
          r.apple_status === 'Included',
      )
      .map((r) => ({
        name: r.name,
        sha256: r.sha256,
        stores: [
          r.mozilla_status === 'Included' && 'M',
          r.chrome_status === 'Included' && 'C',
          r.microsoft_status === 'Included' && 'S',
          r.apple_status === 'Included' && 'A',
        ]
          .filter(Boolean)
          .join(''),
        capabilities: [r.tls_capable && 'T', r.ev_capable && 'E', r.smime_capable && 'S', r.code_signing_capable && 'C']
          .filter(Boolean)
          .join(''),
        validFrom: r.valid_from || '',
        validTo: r.valid_to || '',
        pem: r.pem || '',
      })) ||
    embeddedRoots ||
    null;

  // ── Cross-references ──
  // Government classification (if this CA is gov-operated or state-owned)
  const govEntry = govRisk.cas.find((c) => c.id === d.id);
  const orgType = govEntry
    ? govEntry.type === 'GO'
      ? 'Government-Operated'
      : 'State-Owned Enterprise'
    : 'Commercial / Non-Profit';
  const orgColor = govEntry ? (govEntry.type === 'GO' ? COLORS.am : COLORS.cy) : COLORS.t2;

  // Web coverage: what % of browsers can reach this CA's certificates
  const webCov = getWebCoverage(d.trustedBy, d.parent, caData, browserCoverage);

  const storeNames = { M: 'Mozilla', C: 'Chrome', S: 'Microsoft', A: 'Apple' };
  const capNames = { T: 'TLS', E: 'EV', S: 'S/MIME', C: 'CS' };

  return (
    <div
      style={{
        background: COLORS.bg,
        borderRadius: 8,
        border: `1px solid ${COLORS.bl}`,
        padding: '14px 16px',
        margin: '4px 0 8px 0',
        position: 'relative',
        zIndex: 2,
      }}
    >
      {/* ── Header: CA name, org type, jurisdiction ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.tx }}>{dn(d.caOwner)}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
            <span style={{ fontSize: 9, color: orgColor, fontWeight: 500 }}>{orgType}</span>
            {govEntry && <span style={{ fontSize: 8, color: COLORS.t3 }}>· {govEntry.influence}</span>}
          </div>
          {d.parent && (
            <div style={{ fontSize: 10, color: COLORS.cy, marginTop: 2 }}>Subordinate CA under {d.parent}</div>
          )}
          <div style={{ fontSize: 10, color: COLORS.t3, marginTop: 1 }}>{d.country || 'Unknown jurisdiction'}</div>
        </div>
      </div>

      {/* ── Issuance data caveat ── */}
      {d.issuanceCaveat && (
        <div
          style={{
            background: 'color-mix(in srgb, var(--am) 8%, transparent)',
            border: `1px solid color-mix(in srgb, var(--am) 20%, transparent)`,
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 9,
            color: COLORS.am,
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 600 }}>⚠ Data caveat:</span>{' '}
          {d.note || 'Issuance figures may be incomplete due to cross-signed certificate chain attribution in crt.sh.'}
        </div>
      )}

      {/* ── Key metrics row ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <Metric label="Certificates" value={fl(d.certs)} />
        <Metric
          label="Trust Stores"
          value={`${d.storeCount}/4`}
          color={d.storeCount >= 4 ? COLORS.gn : d.storeCount >= 2 ? COLORS.t2 : COLORS.am}
        />
        <Metric
          label="Web Coverage"
          value={`${(webCov * 100).toFixed(1)}%`}
          color={webCov > 0.9 ? COLORS.gn : webCov > 0.5 ? COLORS.t2 : COLORS.am}
        />
        {rate && (
          <div>
            <MetricLabel>Incidents</MetricLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RateDot ppm={rate.ppm} size={10} />
              <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.tx, fontFamily: FONT_MONO }}>{rate.n}</span>
            </div>
            <div style={{ fontSize: 8, color: COLORS.t3 }}>{rate.ppm.toFixed(2)} per million certs</div>
          </div>
        )}
        {rate && incidentsData?.total > 0 && (
          <div>
            <MetricLabel>Incident Share</MetricLabel>
            {(() => {
              const incShare = (rate.n / incidentsData.total) * 100;
              const mktShare = d.share;
              const ratio = mktShare > 0 ? incShare / mktShare : 0;
              return (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: FONT_MONO, color: COLORS.tx }}>
                    {incShare.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 8, color: COLORS.t3 }}>
                    of all incidents · mkt share {mktShare.toFixed(1)}%
                    {mktShare > 0 && (
                      <span style={{ color: ratio > 1.5 ? COLORS.am : ratio < 0.5 ? COLORS.gn : COLORS.t3 }}>
                        {' '}
                        · {ratio.toFixed(1)}x
                      </span>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}
        {d.avgDays > 0 && (
          <div>
            <MetricLabel>BR Position</MetricLabel>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                fontFamily: FONT_MONO,
                color:
                  d.avgDays > 200 ? COLORS.rd : d.avgDays > 100 ? COLORS.am : d.avgDays > 47 ? COLORS.ac : COLORS.gn,
              }}
            >
              {d.avgDays <= 47
                ? 'Below 47d'
                : d.avgDays <= 100
                  ? 'Below 100d'
                  : d.avgDays <= 200
                    ? 'Below 200d'
                    : 'Above 200d'}
            </div>
            <div style={{ fontSize: 8, color: COLORS.t3 }}>
              next limit: {d.avgDays > 200 ? '200d (Mar 2026)' : d.avgDays > 100 ? '100d (Mar 2027)' : '47d (Mar 2029)'}
            </div>
          </div>
        )}
      </div>

      {/* ── Trust store inclusion ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {[
          ['Mozilla', 'mozilla'],
          ['Chrome', 'chrome'],
          ['Microsoft', 'microsoft'],
          ['Apple', 'apple'],
        ].map(([label, key]) => {
          const included = d.trustedBy[key];
          return (
            <div
              key={key}
              style={{
                flex: 1,
                background: included ? 'color-mix(in srgb, var(--ac) 6%, transparent)' : 'transparent',
                border: `1px solid ${included ? COLORS.bl : COLORS.bd}`,
                borderRadius: 4,
                padding: '6px 8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 600, color: included ? STORE_COLORS[key] : COLORS.t3 }}>
                {label}
              </div>
              <div style={{ fontSize: 8, color: included ? COLORS.t2 : COLORS.t3, marginTop: 2 }}>
                {included ? 'Included' : 'Not included'}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Root & intermediate counts ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <CountBox
          label="Root Certificates"
          value={rootList ? rootList.length : d.rootCount}
          sub={rootList && rootList.length !== d.rootCount ? `${d.rootCount} in CCADB` : undefined}
        />
        <CountBox label="Issuing CAs" value={d.intermediateCount} sub="Unique issuing CAs (cross-signs de-duplicated)" />
      </div>

      {/* ── Incident classification breakdown ── */}
      {(() => {
        const fp = incidentsData?.fingerprints?.find((f) => f.ca === dn(d.caOwner));
        if (!fp) return null;
        const total = fp.mi + fp.rv + fp.gv + fp.vl;
        if (total === 0) return null;
        const cats = [
          { k: 'mi', l: 'Misissuance', c: '#e6a237', n: fp.mi },
          { k: 'rv', l: 'Revocation', c: COLORS.rd, n: fp.rv },
          { k: 'gv', l: 'Governance', c: COLORS.gn, n: fp.gv },
          { k: 'vl', l: 'Validation', c: COLORS.pu, n: fp.vl },
        ].filter((c) => c.n > 0);
        return (
          <div style={{ marginBottom: 12 }}>
            <SectionLabel>Incident Classification ({total} classified)</SectionLabel>
            <div style={{ display: 'flex', height: 22, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
              {cats.map((c) => {
                const pct = (c.n / total) * 100;
                return (
                  <div
                    key={c.k}
                    style={{
                      width: `${pct}%`,
                      background: c.c,
                      opacity: 0.8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                    title={`${c.l}: ${c.n} (${pct.toFixed(0)}%)`}
                  >
                    {pct >= 8 && (
                      <span
                        style={{ fontSize: 8, fontWeight: 600, color: COLORS.wh, textShadow: '0 0 3px rgba(0,0,0,0.5)' }}
                      >
                        {pct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 8, color: COLORS.t3 }}>
              {cats.map((c) => {
                const pct = (c.n / total) * 100;
                return (
                  <span key={c.k}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: c.c,
                        opacity: 0.8,
                        marginRight: 3,
                        verticalAlign: 'middle',
                      }}
                    />
                    {c.l} {c.n} ({pct.toFixed(0)}%)
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Root certificate table (expandable rows with SHA-256 and crt.sh links) ── */}
      {rootList && rootList.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <SectionLabel>Root Certificates ({rootList.length} currently included)</SectionLabel>
          <div>
            <div style={{ overflowX: 'auto' }}>
            <table style={tinyTableStyle}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                  {['', 'Name', 'Valid To', 'Stores', 'Capabilities'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '4px 5px',
                        color: COLORS.t3,
                        fontSize: 8,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        textAlign: 'left',
                        position: 'sticky',
                        top: 0,
                        background: COLORS.bg,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rootList.map((r, i) => {
                  const isOpen = viewCert === r.sha256;
                  return (
                    <React.Fragment key={r.sha256 || i}>
                      <tr
                        style={{
                          borderBottom: `1px solid ${COLORS.bd}`,
                          cursor: 'pointer',
                          background: isOpen ? COLORS.s1 : 'transparent',
                        }}
                        onClick={() => setViewCert(isOpen ? null : r.sha256)}
                      >
                        <td
                          style={{ padding: '4px 5px', fontSize: 9, color: isOpen ? COLORS.ac : COLORS.t3, width: 16 }}
                        >
                          {isOpen ? '▼' : '▶'}
                        </td>
                        <td
                          title={r.name}
                          style={{
                            padding: '4px 5px',
                            color: COLORS.tx,
                            maxWidth: 220,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.name}
                        </td>
                        <td
                          style={{
                            padding: '4px 5px',
                            fontFamily: FONT_MONO,
                            fontSize: 8,
                            color: r.validTo && new Date(r.validTo.replace(/\./g, '-')) < new Date() ? COLORS.rd : COLORS.t3,
                          }}
                        >
                          {r.validTo}
                        </td>
                        <td style={{ padding: '4px 5px' }}>
                          <span
                            style={{
                              fontSize: 8,
                              color: r.stores.length === 4 ? COLORS.gn : r.stores.length >= 2 ? COLORS.t2 : COLORS.am,
                            }}
                          >
                            {r.stores
                              .split('')
                              .map((s) => storeNames[s] || s)
                              .join(' · ')}
                          </span>
                        </td>
                        <td style={{ padding: '4px 5px' }}>
                          <span style={{ fontSize: 8, color: COLORS.t3 }}>
                            {r.capabilities
                              .split('')
                              .map((c) => capNames[c] || c)
                              .join(' · ')}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded row: SHA-256 fingerprint and external links */}
                      {isOpen && (
                        <tr>
                          <td colSpan={5} style={expandedCellStyle}>
                            <div
                              style={{
                                padding: '8px 12px',
                                background: COLORS.s1,
                                borderBottom: `1px solid ${COLORS.bd}`,
                              }}
                            >
                              {r.sha256 && <CertViewer sha256={r.sha256} pem={r.pem} />}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            </div> {/* overflow wrapper */}
          </div>
        </div>
      )}

      {/* ── Intermediate Certificates (loaded on demand from per-CA JSON) ── */}
      {fetchedCerts?.intermediates?.length > 0 && <IntermediateSection intermediates={fetchedCerts.intermediates} />}
      {fetchError && !fetchedCerts && (
        <div style={{ fontSize: 9, color: COLORS.t3, padding: '8px 0' }}>
          Detailed certificate data unavailable for this CA. Root and intermediate details require per-CA JSON files from the pipeline.
        </div>
      )}

      {/* ── Capabilities ── */}
      <div style={{ marginBottom: 8 }}>
        <SectionLabel>Capabilities</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            ['TLS', 'tls', 'Server authentication'],
            ['EV', 'ev', 'Extended validation'],
            ['S/MIME', 'smime', 'Email signing/encryption'],
            ['Code Signing', 'codeSigning', 'Software signing'],
          ].map(([label, key, desc]) => (
            <div
              key={key}
              style={{
                background: d[key] ? COLORS.ag : 'transparent',
                border: `1px solid ${
                  d[key] ? (d.inferred ? 'color-mix(in srgb, var(--am) 20%, transparent)' : 'color-mix(in srgb, var(--ac) 20%, transparent)') : COLORS.bd
                }`,
                borderRadius: 4,
                padding: '4px 8px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: d[key] ? (d.inferred ? COLORS.am : COLORS.ac) : COLORS.t3,
                }}
              >
                {label}
                {d.inferred && d[key] ? '*' : ''}
              </div>
              <div style={{ fontSize: 8, color: COLORS.t3 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer summary ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 8,
          borderTop: `1px solid ${COLORS.bd}`,
          fontSize: 9,
          color: COLORS.t3,
        }}
      >
        <span>
          Trust stores:{' '}
          {['Mozilla', 'Chrome', 'Microsoft', 'Apple'].filter((s) => d.trustedBy[s.toLowerCase()]).join(', ') || 'None'}
          {rate ? ` · ${rate.n} incidents (${rate.ppm.toFixed(2)}/M)` : ''}
        </span>
        <span>{rate && <RateDot ppm={rate.ppm} size={6} />}</span>
      </div>
    </div>
  );
};

// ── Small reusable pieces within CADetail ──

function Metric({ label, value, color }) {
  return (
    <div>
      <MetricLabel>{label}</MetricLabel>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || COLORS.tx, fontFamily: FONT_MONO }}>{value}</div>
    </div>
  );
}

function MetricLabel({ children }) {
  return (
    <div
      style={{ fontSize: 8, color: COLORS.t3, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{ fontSize: 9, color: COLORS.t3, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}
    >
      {children}
    </div>
  );
}

function CountBox({ label, value, sub }) {
  return (
    <div style={{ background: COLORS.s1, borderRadius: 6, padding: '10px 12px' }}>
      <SectionLabel>{label}</SectionLabel>
      <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.tx, fontFamily: FONT_MONO }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/**
 * IntermediateSection — Paginated list of issuing CA certificates.
 * Only shows intermediates that chain to a trusted, non-expired root.
 */
function IntermediateSection({ intermediates }) {
  const [pageSize, setPageSize] = useState(10);
  const [viewCert, setViewCert] = useState(null);
  const capNames = { T: 'TLS', E: 'EV', S: 'S/MIME', C: 'CS' };

  const shown = pageSize === 0 ? intermediates : intermediates.slice(0, pageSize);
  const constrained = intermediates.filter((i) => i.technically_constrained).length;

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <SectionLabel>
          Issuing CAs ({intermediates.length} non-revoked under trusted roots
          {constrained > 0 ? `, ${constrained} technically constrained` : ''})
        </SectionLabel>
        <div style={{ display: 'flex', gap: 4 }}>
          {[10, 25, 50, 0].map((n) => (
            <button
              key={n}
              onClick={() => setPageSize(n)}
              style={{
                padding: '2px 6px',
                fontSize: 8,
                borderRadius: 3,
                cursor: 'pointer',
                border: `1px solid ${pageSize === n ? COLORS.bl : COLORS.bd}`,
                background: pageSize === n ? COLORS.s2 : 'transparent',
                color: pageSize === n ? COLORS.t2 : COLORS.t3,
              }}
            >
              {n === 0 ? 'All' : n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ overflowX: 'auto' }}>
        <table style={tinyTableStyle}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
              {['', 'Name', 'Parent Root', 'Valid To', 'Capabilities'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '4px 5px',
                    color: COLORS.t3,
                    fontSize: 8,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    textAlign: 'left',
                    position: 'sticky',
                    top: 0,
                    background: COLORS.bg,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((inter, i) => {
              const isOpen = viewCert === inter.sha256;
              const caps = [
                inter.tls_capable && 'TLS',
                inter.ev_capable && 'EV',
                inter.smime_capable && 'S/MIME',
                inter.code_signing_capable && 'CS',
              ].filter(Boolean);

              return (
                <React.Fragment key={inter.sha256 || i}>
                  <tr
                    style={{
                      borderBottom: `1px solid ${COLORS.bd}`,
                      cursor: 'pointer',
                      background: isOpen ? COLORS.s1 : 'transparent',
                    }}
                    onClick={() => setViewCert(isOpen ? null : inter.sha256)}
                  >
                    <td style={{ padding: '4px 5px', fontSize: 9, color: isOpen ? COLORS.ac : COLORS.t3, width: 16 }}>
                      {isOpen ? '▼' : '▶'}
                    </td>
                    <td
                      title={inter.name}
                      style={{
                        padding: '4px 5px',
                        color: COLORS.tx,
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {inter.name}
                      {inter.technically_constrained && (
                        <span
                          style={{
                            fontSize: 7,
                            marginLeft: 4,
                            padding: '1px 3px',
                            borderRadius: 2,
                            background: 'color-mix(in srgb, var(--cy) 10%, transparent)',
                            color: COLORS.cy,
                            border: `1px solid color-mix(in srgb, var(--cy) 20%, transparent)`,
                          }}
                        >
                          constrained
                        </span>
                      )}
                    </td>
                    <td
                      title={inter.parent_name}
                      style={{
                        padding: '4px 5px',
                        color: COLORS.t3,
                        fontSize: 8,
                        maxWidth: 160,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {inter.parent_name}
                    </td>
                    <td
                      style={{
                        padding: '4px 5px',
                        fontFamily: FONT_MONO,
                        fontSize: 8,
                        color: COLORS.t3,
                      }}
                    >
                      {inter.valid_to}
                    </td>
                    <td style={{ padding: '4px 5px' }}>
                      <span style={{ fontSize: 8, color: COLORS.t3 }}>{caps.join(' · ') || '—'}</span>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr>
                      <td colSpan={5} style={expandedCellStyle}>
                        <div
                          style={{
                            padding: '8px 12px',
                            background: COLORS.s1,
                            borderBottom: `1px solid ${COLORS.bd}`,
                          }}
                        >
                          <CertViewer sha256={inter.sha256} pem={inter.pem} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        </div> {/* overflow wrapper */}
      </div>

      {intermediates.length > pageSize && pageSize > 0 && (
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <button
            onClick={() => setPageSize(0)}
            style={{
              fontSize: 8,
              color: COLORS.t3,
              background: 'transparent',
              border: `1px solid ${COLORS.bd}`,
              borderRadius: 4,
              padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            Show all {intermediates.length} intermediates
          </button>
        </div>
      )}
    </div>
  );
}

export default CADetail;
