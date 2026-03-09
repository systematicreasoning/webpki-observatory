import React, { useState, useMemo } from 'react';
import { COLORS, FONT_MONO, FONT_SANS, COUNTRY_COORDS } from '../constants';
import { dn, f, getWebCoverage } from '../helpers';
import { Card, CardTitle, StatCard, GeoMap, Paginator } from './shared';
import CADetail from './CADetail';
import { usePipeline } from '../PipelineContext';
import { compactTableStyle } from '../styles';

// ── Extra coordinates for countries not yet in COUNTRY_COORDS ──
const EXTRA_COORDS = {
  Russia: { lat: 61, lng: 100 },
  Cambodia: { lat: 12.6, lng: 105 },
  'New Zealand': { lat: -41, lng: 174 },
  'Antigua and Barbuda': { lat: 17.1, lng: -61.8 },
};
const getCoords = (c) => COUNTRY_COORDS[c] || EXTRA_COORDS[c] || null;

const RC = { high: COLORS.rd, moderate: COLORS.am, low: COLORS.gn };
const RO = { high: 0, moderate: 1, low: 2 };
const RL = { high: 'High', moderate: 'Moderate', low: 'Low' };

const RiskBadge = ({ risk }) => (
  <span
    style={{
      fontSize: 8,
      fontFamily: FONT_MONO,
      padding: '1px 5px',
      borderRadius: 3,
      background: `${RC[risk]}18`,
      color: RC[risk],
      border: `1px solid ${RC[risk]}33`,
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
    }}
  >
    {risk}
  </span>
);

/* ── Three-axis compulsion model ──
 * purpose = dedicated statutory authority for this specific power
 * general = possible via normal judicial process (every country with courts has this)
 * none    = no authority or constitutionally protected
 */
const AC = { purpose: COLORS.rd, general: `${COLORS.am}88`, none: COLORS.gn };
const AT = { purpose: 'Purpose-built statute', general: 'General judicial process', none: 'No authority / protected' };
const AXIS_KEYS = ['key_seizure', 'compelled_issuance', 'secrecy'];
const AXIS_LABELS = { key_seizure: 'Key Seizure', compelled_issuance: 'Compelled Issuance', secrecy: 'Secrecy' };
const AXIS_ICONS = { key_seizure: '\uD83D\uDD11', compelled_issuance: '\uD83D\uDCDD', secrecy: '\uD83D\uDD07' };

const AxisDot = ({ value, size = 9 }) => (
  <span
    title={AT[value] || ''}
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: value === 'purpose' ? COLORS.rd : value === 'general' ? `${COLORS.am}60` : 'transparent',
      border: `1.5px solid ${value === 'purpose' ? COLORS.rd : value === 'general' ? COLORS.am : COLORS.gn}`,
      verticalAlign: 'middle',
    }}
  />
);

const AxisDots = ({ axes }) => {
  if (!axes) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {AXIS_KEYS.map((k) => (
        <span key={k} title={`${AXIS_LABELS[k]}: ${AT[axes[k]] || 'unknown'}`}>
          <AxisDot value={axes[k]} size={8} />
        </span>
      ))}
    </span>
  );
};

/**
 * JurisdictionView — Jurisdiction Risk tab.
 *
 * Combines static legislation data (jurisdiction_risk.json) with live
 * CA pipeline data to show which trusted CAs are exposed to government
 * key seizure or compelled operations by jurisdiction.
 */
const JurisdictionView = () => {
  const { trustedCAs, browserCoverage, jurisdictionRisk } = usePipeline();
  const [expanded, setExpanded] = useState(null);
  const [riskFilter, setRiskFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [caRiskFilter, setCaRiskFilter] = useState(null);
  const [caSearch, setCaSearch] = useState('');
  const [caPageSize, setCaPageSize] = useState(15);
  const [caExpanded, setCaExpanded] = useState(null);

  const laws = jurisdictionRisk?.jurisdictions || [];

  // Cross-reference: match trusted CAs to jurisdiction laws by country.
  // SCOPE: trustedCAs only (storeCount > 0 || parent). Distrusted CAs like
  // WoSign, CNNIC are excluded — they are no longer in any trust store and
  // do not represent current jurisdiction exposure.
  const caExposure = useMemo(() => {
    const exposure = {};
    laws.forEach((j) => {
      const cas = trustedCAs.filter((d) => d.country === j.country);
      exposure[j.country] = {
        cas,
        count: cas.length,
        certs: cas.reduce((s, d) => s + (d.certs || 0), 0),
        roots: cas.reduce((s, d) => s + (d.rootCount || 0), 0),
      };
    });
    return exposure;
  }, [trustedCAs, laws]);

  // All exposed CAs flattened with risk level
  const allExposedCAs = useMemo(() => {
    const out = [];
    laws.forEach((j) => {
      (caExposure[j.country]?.cas || []).forEach((d) => {
        out.push({ ...d, jurisdictionRisk: j.risk, jurisdictionCountry: j.country, axes: j.axes });
      });
    });
    out.sort((a, b) => RO[a.jurisdictionRisk] - RO[b.jurisdictionRisk] || (b.certs || 0) - (a.certs || 0));
    return out;
  }, [laws, caExposure]);

  const filteredCAs = useMemo(() => {
    let result = allExposedCAs;
    if (caRiskFilter) result = result.filter((c) => c.jurisdictionRisk === caRiskFilter);
    if (caSearch.trim()) {
      const q = caSearch.toLowerCase().trim();
      result = result.filter((c) => dn(c.caOwner).toLowerCase().includes(q) || c.jurisdictionCountry?.toLowerCase().includes(q));
    }
    return result;
  }, [allExposedCAs, caRiskFilter, caSearch]);

  const pagedCAs = useMemo(() => caPageSize === 0 ? filteredCAs : filteredCAs.slice(0, caPageSize), [filteredCAs, caPageSize]);

  // Stats
  const stats = useMemo(() => {
    const byRisk = { high: 0, moderate: 0, low: 0 };
    laws.forEach((j) => byRisk[j.risk]++);
    const certsByRisk = { high: 0, moderate: 0, low: 0 };
    const casByRisk = { high: 0, moderate: 0, low: 0 };
    allExposedCAs.forEach((c) => {
      certsByRisk[c.jurisdictionRisk] += c.certs || 0;
      casByRisk[c.jurisdictionRisk]++;
    });
    const totalCerts = Object.values(certsByRisk).reduce((a, b) => a + b, 0);
    return { byRisk, certsByRisk, casByRisk, totalCerts };
  }, [laws, allExposedCAs]);

  // Filter + sort jurisdictions
  const filtered = useMemo(() => {
    let items = [...laws];
    if (riskFilter) items = items.filter((j) => j.risk === riskFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      items = items.filter(
        (j) => j.country.toLowerCase().includes(q) || j.laws.some((l) => l.name.toLowerCase().includes(q)),
      );
    }
    items.sort((a, b) => {
      const rd = RO[a.risk] - RO[b.risk];
      if (rd !== 0) return rd;
      return (caExposure[b.country]?.count || 0) - (caExposure[a.country]?.count || 0);
    });
    return items;
  }, [riskFilter, search, laws, caExposure]);

  const visible = useMemo(() => (pageSize === 0 ? filtered : filtered.slice(0, pageSize)), [filtered, pageSize]);

  // Map pins
  const pins = useMemo(() => {
    return laws
      .map((j) => {
        const co = getCoords(j.country);
        if (!co) return null;
        const exp = caExposure[j.country];
        const hasCAs = exp && exp.count > 0;
        return {
          lat: co.lat,
          lng: co.lng,
          label: j.country,
          color: RC[j.risk],
          r: hasCAs ? Math.max(5, Math.min(14, 4 + Math.sqrt(exp.count) * 3)) : 4,
          count: exp?.count > 1 ? exp.count : null,
          tooltip: (
            <div>
              <div style={{ fontWeight: 600, color: COLORS.tx }}>{j.country}</div>
              <div
                style={{
                  color: RC[j.risk],
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 3,
                }}
              >
                {RL[j.risk]} risk
              </div>
              {hasCAs ? (
                <div style={{ fontSize: 9 }}>
                  <div style={{ color: COLORS.am }}>
                    {exp.count} trusted CA{exp.count > 1 ? 's' : ''} · {exp.roots} roots
                  </div>
                  <div style={{ color: COLORS.t2 }}>{f(exp.certs)} unexpired certs</div>
                  <div style={{ color: COLORS.t3, marginTop: 2 }}>
                    {exp.cas
                      .slice(0, 4)
                      .map((d) => dn(d.caOwner))
                      .join(', ')}
                    {exp.cas.length > 4 ? ` +${exp.cas.length - 4}` : ''}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 9, color: COLORS.t3 }}>No trusted CAs headquartered here</div>
              )}
            </div>
          ),
        };
      })
      .filter(Boolean);
  }, [laws, caExposure]);

  return (
    <div>
      {/* ── Stat cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <StatCard l="Jurisdictions" v={laws.length} c={COLORS.tx} />
        <StatCard
          l="High Risk"
          v={stats.byRisk.high}
          s={`${stats.casByRisk.high} CAs · ${f(stats.certsByRisk.high)} certs`}
          c={COLORS.rd}
        />
        <StatCard
          l="Moderate Risk"
          v={stats.byRisk.moderate}
          s={`${stats.casByRisk.moderate} CAs · ${f(stats.certsByRisk.moderate)} certs`}
          c={COLORS.am}
        />
        <StatCard
          l="Low Risk"
          v={stats.byRisk.low}
          s={`${stats.casByRisk.low} CAs · ${f(stats.certsByRisk.low)} certs`}
          c={COLORS.gn}
        />
      </div>

      {/* ── Certificate volume by risk tier ── */}
      <Card>
        <CardTitle sub="Distribution of unexpired certificates by the compulsion risk level of the issuing CA's home jurisdiction.">
          Certificate Volume by Jurisdiction Risk
        </CardTitle>
        <div style={{ height: 36, borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
          {['high', 'moderate', 'low'].map((risk) => {
            const pct = stats.totalCerts > 0 ? (stats.certsByRisk[risk] / stats.totalCerts) * 100 : 0;
            if (pct < 0.01) return <div key={risk} style={{ width: 3, background: RC[risk], opacity: 0.5 }} />;
            return (
              <div
                key={risk}
                style={{
                  width: `${Math.max(pct, 1.5)}%`,
                  background: RC[risk],
                  opacity: 0.55,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.55')}
              >
                {pct > 5 && <span style={{ fontSize: 9, color: COLORS.tx, fontWeight: 600 }}>{pct.toFixed(1)}%</span>}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 9, color: COLORS.t3 }}>
          {['high', 'moderate', 'low'].map((risk) => {
            const pct = stats.totalCerts > 0 ? (stats.certsByRisk[risk] / stats.totalCerts) * 100 : 0;
            return (
              <span key={risk}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: RC[risk],
                    opacity: 0.7,
                    marginRight: 4,
                    verticalAlign: 'middle',
                  }}
                />
                {RL[risk]}: {f(stats.certsByRisk[risk])} ({pct.toFixed(1)}%)
              </span>
            );
          })}
        </div>
      </Card>

      {/* ── Map ── */}
      <Card>
        <CardTitle sub="Pin color = compulsion risk level. Pin size = number of publicly trusted CAs headquartered in the jurisdiction.">
          CA Exposure by Jurisdiction
        </CardTitle>
        <GeoMap
          pins={pins}
          legend={[
            { color: COLORS.rd, label: 'Extreme' },
            { color: COLORS.am, label: 'High' },
            { color: COLORS.t2, label: 'Moderate' },
            { color: COLORS.gn, label: 'Low' },
          ]}
        />
      </Card>

      {/* ── CA exposure table ── */}
      <Card>
        <CardTitle sub="Publicly trusted CAs mapped to the compulsion risk level of their home jurisdiction. Click risk badges to filter.">
          CA Exposure to Compulsion Risk
        </CardTitle>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px 12px',
            fontSize: 9,
            color: COLORS.t3,
            marginBottom: 10,
          }}
        >
          {['high', 'moderate', 'low'].map((risk) => {
            const n = allExposedCAs.filter((c) => c.jurisdictionRisk === risk).length;
            if (n === 0) return null;
            return (
              <span
                key={risk}
                style={{ cursor: 'pointer', opacity: caRiskFilter && caRiskFilter !== risk ? 0.4 : 1 }}
                onClick={() => setCaRiskFilter(caRiskFilter === risk ? null : risk)}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: RC[risk],
                    opacity: 0.7,
                    marginRight: 4,
                    verticalAlign: 'middle',
                  }}
                />
                {RL[risk]} ({n})
              </span>
            );
          })}
          {caRiskFilter && (
            <span style={{ color: COLORS.ac, cursor: 'pointer' }} onClick={() => setCaRiskFilter(null)}>
              Clear
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <input value={caSearch} onChange={e => setCaSearch(e.target.value)} placeholder="Filter CAs..." style={{ background: COLORS.bg, border: `1px solid ${COLORS.bd}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, color: COLORS.tx, fontFamily: FONT_SANS, width: 160, outline: 'none' }} />
          <Paginator count={caPageSize} setCount={setCaPageSize} options={[10, 15, 25, 0]} />
        </div>
        <div>
          <table style={compactTableStyle}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                {[['CA Owner', 'CA organization name'], ['Jurisdiction', 'Country where CA is headquartered'], ['Risk', 'Compulsion risk level of this jurisdiction'], ['\uD83D\uDD11 \uD83D\uDCDD \uD83D\uDD07', 'Key Seizure · Compelled Issuance · Secrecy (● purpose-built, ◐ general judicial, ○ none)'], ['Stores', 'Trust store inclusion count'], ['Roots', 'Root certificate count'], ['Certs', 'Unexpired precertificates'], ['Coverage', 'Web browser coverage from trust store inclusion']].map(([h, tip], i) => (
                  <th
                    key={h}
                    title={tip}
                    style={{
                      padding: '5px',
                      color: COLORS.t3,
                      fontSize: 8,
                      textTransform: i === 3 ? 'none' : 'uppercase',
                      letterSpacing: '0.05em',
                      textAlign: i >= 4 ? 'right' : i === 3 ? 'center' : 'left',
                      cursor: 'help',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedCAs.map((c) => {
                const cov = getWebCoverage(c.trustedBy, c.parent, trustedCAs, browserCoverage);
                const isExp = caExpanded === c.caOwner;
                const dEntry = trustedCAs.find(x => x.id === c.id);
                return (
                  <React.Fragment key={c.caOwner}>
                  <tr onClick={() => setCaExpanded(isExp ? null : c.caOwner)} style={{ borderBottom: `1px solid ${COLORS.bd}`, cursor: 'pointer', background: isExp ? COLORS.s2 : 'transparent' }}>
                    <td
                      style={{
                        padding: '5px',
                        color: COLORS.tx,
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={c.caOwner}
                    >
                      <span style={{ fontSize: 9, color: isExp ? COLORS.ac : COLORS.t3, marginRight: 4 }}>{isExp ? '▼' : '▶'}</span>
                      {dn(c.caOwner)}
                    </td>
                    <td style={{ padding: '5px', color: COLORS.t2, fontSize: 9 }}>{c.jurisdictionCountry}</td>
                    <td style={{ padding: '5px' }}>
                      <RiskBadge risk={c.jurisdictionRisk} />
                    </td>
                    <td style={{ padding: '5px', textAlign: 'center' }}>
                      <AxisDots axes={c.axes} />
                    </td>
                    <td
                      style={{
                        padding: '5px',
                        textAlign: 'right',
                        fontFamily: FONT_MONO,
                        fontSize: 9,
                        color: c.storeCount >= 4 ? COLORS.gn : c.storeCount >= 2 ? COLORS.am : COLORS.t3,
                      }}
                    >
                      {c.storeCount}/4
                    </td>
                    <td
                      style={{
                        padding: '5px',
                        textAlign: 'right',
                        fontFamily: FONT_MONO,
                        fontSize: 9,
                        color: COLORS.t3,
                      }}
                    >
                      {c.rootCount}
                    </td>
                    <td
                      style={{
                        padding: '5px',
                        textAlign: 'right',
                        fontFamily: FONT_MONO,
                        fontSize: 9,
                        color: c.certs > 1e6 ? COLORS.tx : COLORS.t2,
                      }}
                    >
                      {c.certs > 0 ? f(c.certs) : '—'}
                    </td>
                    <td
                      style={{
                        padding: '5px',
                        textAlign: 'right',
                        fontFamily: FONT_MONO,
                        fontSize: 9,
                        color: cov > 0.9 ? COLORS.rd : cov > 0.5 ? COLORS.am : COLORS.t3,
                      }}
                    >
                      {(cov * 100).toFixed(0)}%
                    </td>
                  </tr>
                  {isExp && dEntry && <tr><td colSpan={8} style={{ padding: 0 }}><CADetail d={dEntry} /></td></tr>}
                  </React.Fragment>
                );
              })}
              {pagedCAs.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: COLORS.t3, fontSize: 10 }}>
                    No CAs in this risk tier
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Legislation table ── */}
      <Card>
        <CardTitle
          sub="Click any row to expand legislation details with statutory excerpts, source links, and affected CAs."
          right={<Paginator count={pageSize} setCount={setPageSize} />}
        >
          Legislation by Jurisdiction
        </CardTitle>

        <div style={{ marginBottom: 10 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search country or law…"
            style={{
              width: '100%',
              maxWidth: 320,
              padding: '6px 10px',
              fontSize: 10,
              background: COLORS.bg,
              border: `1px solid ${COLORS.bd}`,
              borderRadius: 6,
              color: COLORS.tx,
              fontFamily: FONT_SANS,
              outline: 'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = COLORS.bl)}
            onBlur={(e) => (e.target.style.borderColor = COLORS.bd)}
          />
          {(search || riskFilter) && (
            <span style={{ fontSize: 9, color: COLORS.t3, marginLeft: 8 }}>
              {filtered.length} of {laws.length}
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px 12px',
            fontSize: 9,
            color: COLORS.t3,
            marginBottom: 10,
          }}
        >
          {['high', 'moderate', 'low'].map((risk) => (
            <span
              key={risk}
              style={{ cursor: 'pointer', opacity: riskFilter && riskFilter !== risk ? 0.4 : 1 }}
              onClick={() => setRiskFilter(riskFilter === risk ? null : risk)}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: RC[risk],
                  opacity: 0.7,
                  marginRight: 4,
                  verticalAlign: 'middle',
                }}
              />
              {RL[risk]} ({stats.byRisk[risk]})
            </span>
          ))}
          {riskFilter && (
            <span style={{ color: COLORS.ac, cursor: 'pointer' }} onClick={() => setRiskFilter(null)}>
              Clear
            </span>
          )}
        </div>

        <div style={{ maxHeight: 560, overflowY: 'auto' }}>
          <table style={compactTableStyle}>
            <thead style={{ position: 'sticky', top: 0, background: COLORS.s1, zIndex: 1 }}>
              <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                {[['Jurisdiction', 'Country with compulsion legislation'], ['Risk', 'Assessed compulsion risk level'], ['\uD83D\uDD11 \uD83D\uDCDD \uD83D\uDD07', 'Key Seizure · Compelled Issuance · Secrecy'], ['Key Legislation', 'Primary laws enabling government key access or compelled operations'], ['CAs', 'Publicly trusted CAs headquartered in this jurisdiction'], ['Roots', 'Total root certificates from CAs in this jurisdiction'], ['Certs', 'Total unexpired precertificates from CAs in this jurisdiction']].map(([h, tip], i) => (
                  <th
                    key={h}
                    title={tip}
                    style={{
                      padding: '5px',
                      color: COLORS.t3,
                      fontSize: 8,
                      textTransform: i === 2 ? 'none' : 'uppercase',
                      letterSpacing: '0.05em',
                      textAlign: i >= 4 ? 'right' : i === 2 ? 'center' : 'left',
                      cursor: 'help',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((j) => {
                const exp = caExposure[j.country];
                const isExp = expanded === j.country;
                return (
                  <React.Fragment key={j.country}>
                    <tr
                      style={{ borderBottom: `1px solid ${COLORS.bd}`, cursor: 'pointer' }}
                      onClick={() => setExpanded(isExp ? null : j.country)}
                    >
                      <td style={{ padding: '6px 5px', color: COLORS.tx }}>
                        <span style={{ fontSize: 9, color: isExp ? COLORS.ac : COLORS.t3, marginRight: 4 }}>
                          {isExp ? '▼' : '▶'}
                        </span>
                        {j.country}
                      </td>
                      <td style={{ padding: '6px 5px' }}>
                        <RiskBadge risk={j.risk} />
                      </td>
                      <td style={{ padding: '6px 5px', textAlign: 'center' }}>
                        <AxisDots axes={j.axes} />
                      </td>
                      <td
                        style={{
                          padding: '6px 5px',
                          color: COLORS.t2,
                          fontSize: 9,
                          maxWidth: 260,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {j.laws.map((l) => l.name).join('; ')}
                      </td>
                      <td
                        style={{
                          padding: '6px 5px',
                          textAlign: 'right',
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          color: exp?.count > 0 ? COLORS.am : COLORS.t3,
                        }}
                      >
                        {exp?.count || 0}
                      </td>
                      <td
                        style={{
                          padding: '6px 5px',
                          textAlign: 'right',
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          color: COLORS.t3,
                        }}
                      >
                        {exp?.roots || 0}
                      </td>
                      <td
                        style={{
                          padding: '6px 5px',
                          textAlign: 'right',
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          color: COLORS.t3,
                        }}
                      >
                        {exp?.certs > 0 ? f(exp.certs) : '—'}
                      </td>
                    </tr>

                    {isExp && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, background: COLORS.s2 }}>
                          <div style={{ padding: '12px 14px' }}>
                            <div style={{ fontSize: 10, color: COLORS.t2, marginBottom: 12, lineHeight: 1.5 }}>
                              {j.summary}
                            </div>

                            {j.laws.map((law, li) => (
                              <div
                                key={li}
                                style={{
                                  marginBottom: 10,
                                  padding: '8px 10px',
                                  background: COLORS.s1,
                                  borderRadius: 6,
                                  border: `1px solid ${COLORS.bd}`,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 8,
                                  }}
                                >
                                  <div>
                                    <div style={{ fontSize: 10, color: COLORS.tx, fontWeight: 500 }}>{law.name}</div>
                                    <div style={{ fontSize: 9, color: COLORS.t3, marginTop: 1 }}>{law.section}</div>
                                  </div>
                                  <a
                                    href={law.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: 8,
                                      color: COLORS.ac,
                                      textDecoration: 'none',
                                      whiteSpace: 'nowrap',
                                      padding: '2px 6px',
                                      borderRadius: 3,
                                      border: `1px solid ${COLORS.ac}33`,
                                    }}
                                  >
                                    Source ↗
                                  </a>
                                </div>
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: COLORS.t2,
                                    marginTop: 6,
                                    lineHeight: 1.5,
                                    borderLeft: `2px solid ${RC[j.risk]}44`,
                                    paddingLeft: 8,
                                    fontStyle: 'italic',
                                  }}
                                >
                                  "{law.excerpt}"
                                </div>
                              </div>
                            ))}

                            {exp?.count > 0 && (
                              <div style={{ marginTop: 6, fontSize: 9, color: COLORS.am }}>
                                <span style={{ fontWeight: 500 }}>Affected CAs: </span>
                                {exp.cas.map((d) => dn(d.caOwner)).join(' · ')}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: COLORS.t3, fontSize: 10 }}>
                    No results
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pageSize > 0 && filtered.length > pageSize && (
          <div style={{ fontSize: 9, color: COLORS.t3, marginTop: 8, textAlign: 'center' }}>
            Showing {visible.length} of {filtered.length} ·{' '}
            <span style={{ color: COLORS.ac, cursor: 'pointer' }} onClick={() => setPageSize(0)}>
              Show all
            </span>
          </div>
        )}
      </Card>

      {/* ── Risk definitions ── */}
      <Card>
        <CardTitle>Risk Level Definitions</CardTitle>
        <div style={{ display: 'grid', gap: 6 }}>
          {Object.entries(jurisdictionRisk?.meta?.risk_levels || {}).map(([level, def]) => (
            <div key={level} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <RiskBadge risk={level} />
              <span style={{ fontSize: 9, color: COLORS.t2, lineHeight: 1.5 }}>{def}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Compulsion axes legend ── */}
      <Card>
        <CardTitle sub="Three independent questions determine whether a government can silently compromise a CA. Purpose-built means a legislature specifically created a legal tool for this power. General means a court could order it the same way it orders production of any business record.">
          Compulsion Axes
        </CardTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {AXIS_KEYS.map((k) => (
            <div key={k} style={{ padding: '8px 10px', borderRadius: 6, background: COLORS.bg, border: `1px solid ${COLORS.bd}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.t2, marginBottom: 4 }}>
                {AXIS_ICONS[k]} {AXIS_LABELS[k]}
              </div>
              <div style={{ fontSize: 9, color: COLORS.t3, lineHeight: 1.5 }}>
                {k === 'key_seizure' && 'Can the government compel disclosure of CA private signing keys?'}
                {k === 'compelled_issuance' && 'Can the government force a CA to issue a specific certificate?'}
                {k === 'secrecy' && 'Can the government prohibit the CA from disclosing the compulsion to root programs, auditors, or subscribers?'}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 9, color: COLORS.t3, marginTop: 10 }}>
          <span><AxisDot value="purpose" size={8} /> Purpose-built statute</span>
          <span><AxisDot value="general" size={8} /> General judicial process</span>
          <span><AxisDot value="none" size={8} /> No authority / protected</span>
        </div>
      </Card>

      <div
        style={{
          fontSize: 8,
          color: COLORS.t3,
          marginTop: 8,
          lineHeight: 1.6,
          borderTop: `1px solid ${COLORS.bd}`,
          paddingTop: 6,
        }}
      >
        <strong style={{ color: COLORS.t2 }}>Methodology:</strong> Legislation data is cross-verified against Wikipedia
        Key Disclosure Law, official legislation sites, EFF, Global Partners Digital, Comparitech, and CA/B Forum
        context. Risk levels reflect the strength and scope of government authority to compel key disclosure or CA
        cooperation — not the likelihood of exercise. "Exposure" means the CA is headquartered in that jurisdiction; it
        does not mean the CA's operations or subscribers are located there.{' '}
        <strong style={{ color: COLORS.t2 }}>Scope:</strong> Only currently trusted CAs (included in at least one major
        trust store). Distrusted CAs are excluded even if they were historically in a high-risk jurisdiction.{' '}
        <strong style={{ color: COLORS.t2 }}>Limitation:</strong> Jurisdiction is based on CA owner country from CCADB.
        A CA incorporated in one country may operate infrastructure in another. Subsidiary relationships and operational
        geography are not captured.
      </div>
    </div>
  );
};

export default JurisdictionView;
