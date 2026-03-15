import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { COLORS, FONT_MONO, FONT_SANS } from '../constants';
import { dn, f } from '../helpers';
import { Card, CardTitle, StatCard, ChartWrap, TabIntro, MethodologyCard, MethodologyItem } from './shared';
import CADetail from './CADetail';
import { usePipeline } from '../PipelineContext';
import {
  compactTableStyle, expandedCellStyle, statGridStyle,
} from '../styles';

/**
 * PolicyView — Policy Impact tab.
 *
 * Projects the impact of upcoming Baseline Requirements validity
 * reductions (200d Mar 2026, 100d Mar 2027, 47d Mar 2029) on each
 * CA's subscriber base. "Usage period" measures actual replacement
 * behavior, not the validity period on the certificate.
 */
const PolicyView = () => {
  const { trustedCAs, rpeData } = usePipeline();

  const data = trustedCAs;

  const casWithUsage = useMemo(
    () => data.filter((d) => d.avgDays && d.avgDays > 0).sort((a, b) => b.avgDays - a.avgDays),
    [data],
  );
  const thresholds = [
    { d: 200, l: '200d', c: COLORS.am, dt: 'Mar 2026' },
    { d: 100, l: '100d', c: COLORS.am, dt: 'Mar 2027' },
    { d: 47, l: '47d', c: COLORS.rd, dt: 'Mar 2029' },
  ];
  const readyCount = casWithUsage.filter((d) => d.avgDays <= 47).length;
  const totalCerts = casWithUsage.reduce((s, d) => s + d.certs, 0);
  const [selTier, setSelTier] = useState(null);
  const [policyPage, setPolicyPage] = useState(10);
  const [policyExp, setPolicyExp] = useState(null);
  const [ballotView, setBallotView] = useState('recent');
  const tiers = [
    { label: 'Replaces < 47d', desc: '< 47d avg replacement', cas: casWithUsage.filter((c) => c.avgDays <= 47), color: COLORS.gn },
    {
      label: 'Replaces 47–100d',
      desc: '47-100d avg replacement',
      cas: casWithUsage.filter((c) => c.avgDays > 47 && c.avgDays <= 100),
      color: COLORS.ac,
    },
    {
      label: 'Replaces 100–200d',
      desc: '100-200d avg replacement',
      cas: casWithUsage.filter((c) => c.avgDays > 100 && c.avgDays <= 200),
      color: COLORS.am,
    },
    { label: 'Replaces > 200d', desc: '> 200d avg replacement', cas: casWithUsage.filter((c) => c.avgDays > 200), color: COLORS.rd },
  ].filter((t) => t.cas.length > 0);
  const filteredCAs = selTier !== null ? tiers[selTier].cas : casWithUsage;
  const pagedCAs = filteredCAs.slice(0, policyPage);
  return (
    <div>
      <TabIntro tabId="policy" quote="Policy shapes the Web PKI.">
        Minimum practices evolve with threats and technology: some CAs lead, others follow, some lag. The CA/Browser Forum's Baseline Requirements are tightening maximum certificate validity: 200 days (March 15 2026), 100 days (March 15 2027), and 47 days (March 15 2029). This tab measures each CA's actual certificate usage period — how frequently their subscribers replace certificates — against those thresholds. CAs operating well above the next deadline face the largest subscriber disruption. CAs already below the 47-day target have proven their automation story. Relying parties can assess which CAs are prepared for the upcoming reductions and which are likely to struggle.
      </TabIntro>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.tx, marginBottom: 4 }}>BR Validity Readiness</div>
        <div style={{ fontSize: 10, color: COLORS.t3, lineHeight: 1.5 }}>
          How prepared each CA is for the upcoming Baseline Requirements validity reductions. Measures actual certificate replacement behavior, not the validity period printed on the certificate.
        </div>
      </div>

      <div
        style={statGridStyle}
      >
        <StatCard l="CAs with Usage Data" v={casWithUsage.length} c={COLORS.ac} />
        <StatCard
          l="Replaces > 200d"
          v={casWithUsage.filter((d) => d.avgDays > 200).length}
          s="subscribers rarely renew"
          c={COLORS.rd}
        />
        <StatCard l="Replaces < 47d" v={readyCount} s="automation-ready" c={COLORS.gn} />
        <StatCard
          l="Median Usage"
          v={casWithUsage.length > 0 ? casWithUsage[Math.floor(casWithUsage.length / 2)].avgDays + 'd' : '—'}
          c={COLORS.t2}
        />
      </div>

      <Card>
        <CardTitle sub="Average certificate replacement period vs upcoming BR max validity thresholds (200d Mar 2026, 100d Mar 2027, 47d Mar 2029). Replacement period measures how often subscribers actually renew — not the validity period on the certificate. A CA issuing 90-day certs whose subscribers renew at 30 days has a 30-day replacement period.">
          BR Validity Impact
        </CardTitle>
        {thresholds.map((t, i) => {
          const affected = casWithUsage.filter((d) => d.avgDays > t.d);
          const ready = casWithUsage.filter((d) => d.avgDays <= t.d);
          const affectedCerts = affected.reduce((s, d) => s + d.certs, 0);
          return (
            <div key={t.d} style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: t.c, fontFamily: FONT_MONO }}>
                  {t.l} max{' '}
                  <span style={{ fontSize: 9, fontWeight: 400, color: COLORS.t3, marginLeft: 4 }}>{t.dt}</span>
                </span>
                <span style={{ fontSize: 9, color: COLORS.t2 }}>
                  {affected.length} CAs above · {totalCerts > 0 ? ((affectedCerts / totalCerts) * 100).toFixed(1) : 0}%
                  of certificates
                </span>
              </div>
              <div style={{ height: 20, borderRadius: 4, overflow: 'hidden', display: 'flex', background: COLORS.bg }}>
                <div
                  style={{
                    width: `${(affected.length / (casWithUsage.length || 1)) * 100}%`,
                    background: t.c,
                    opacity: 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {affected.length > 0 && <span style={{ fontSize: 8, color: COLORS.tx }}>{affected.length}</span>}
                </div>
                <div
                  style={{
                    flex: 1,
                    background: COLORS.gn,
                    opacity: 0.15,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 4,
                  }}
                >
                  <span style={{ fontSize: 8, color: COLORS.t2 }}>{ready.length} ready</span>
                </div>
              </div>
              {affected.length > 0 && affected.length <= 6 && (
                <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 2 }}>
                  {affected.map((d) => d.caOwner.split(/[\s,]/)[0]).join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* Usage Period Distribution - interactive donut + filtered table */}
      <Card>
        <CardTitle sub="CAs grouped by average certificate usage period relative to upcoming BR max validity thresholds. Click a segment to filter the table.">
          Usage Period Distribution
        </CardTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <div>
            {(() => {
              const pieData = tiers.map((t) => ({
                name: t.label,
                value: t.cas.length,
                fill: t.color,
                certs: t.cas.reduce((s, c) => s + c.certs, 0),
              }));
              const RADIAN = Math.PI / 180;
              const lbl = ({ cx, cy, midAngle, innerRadius, outerRadius, value, percent }) => {
                if (percent < 0.08) return null;
                const r = innerRadius + (outerRadius - innerRadius) * 0.5;
                const x = cx + r * Math.cos(-midAngle * RADIAN);
                const y = cy + r * Math.sin(-midAngle * RADIAN);
                return (
                  <text
                    x={x}
                    y={y}
                    fill={COLORS.tx}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontWeight={600}
                    fontFamily={FONT_MONO}
                  >
                    {value}
                  </text>
                );
              };
              return (
                <ChartWrap height={200}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        paddingAngle={2}
                        label={lbl}
                        labelLine={false}
                        onClick={(_, idx) => {
                          setSelTier(selTier === idx ? null : idx);
                          setPolicyPage(10);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {pieData.map((d, i) => (
                          <Cell
                            key={i}
                            fill={d.fill}
                            opacity={selTier === null || selTier === i ? 0.7 : 0.2}
                            stroke={selTier === i ? COLORS.tx : 'none'}
                            strokeWidth={selTier === i ? 2 : 0}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        content={(p) => {
                          if (!p.active || !p.payload?.length) return null;
                          const d = p.payload[0].payload;
                          return (
                            <div
                              style={{
                                background: COLORS.s2,
                                border: `1px solid ${COLORS.bl}`,
                                borderRadius: 8,
                                padding: '8px 12px',
                                fontSize: 10,
                              }}
                            >
                              <div style={{ fontWeight: 600, color: COLORS.tx }}>{d.name}</div>
                              <div style={{ color: COLORS.t2 }}>
                                {d.value} CAs · {totalCerts > 0 ? ((d.certs / totalCerts) * 100).toFixed(1) : 0}% of
                                certs
                              </div>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartWrap>
              );
            })()}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '4px 12px',
                fontSize: 9,
                color: COLORS.t3,
                marginTop: 4,
              }}
            >
              {tiers.map((t, i) => (
                <span
                  key={t.label}
                  onClick={() => {
                    setSelTier(selTier === i ? null : i);
                    setPolicyPage(10);
                  }}
                  style={{
                    cursor: 'pointer',
                    opacity: selTier === null || selTier === i ? 1 : 0.4,
                    transition: 'opacity 0.2s',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: t.color,
                      opacity: 0.7,
                      marginRight: 3,
                      verticalAlign: 'middle',
                    }}
                  />
                  {t.label} ({t.cas.length})
                </span>
              ))}
            </div>
            {selTier !== null && (
              <div style={{ textAlign: 'center', marginTop: 6 }}>
                <button
                  onClick={() => setSelTier(null)}
                  style={{
                    fontSize: 9,
                    color: COLORS.t3,
                    background: 'transparent',
                    border: `1px solid ${COLORS.bd}`,
                    borderRadius: 4,
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Show all
                </button>
              </div>
            )}
          </div>
          <div>
            <div style={{ overflowX: 'auto' }}>
            <table style={compactTableStyle}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                  {[['CA', 'CA organization name'], ['Usage', 'Average certificate usage period in days'], ['Threshold', 'Next BR validity threshold this CA must meet']].map(([h, tip]) => (
                    <th
                      key={h}
                      style={{
                        padding: '4px 6px',
                        color: COLORS.t3,
                        fontSize: 8,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        textAlign: h === 'CA' ? 'left' : 'right',
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
                  const cl =
                    c.avgDays > 200 ? COLORS.rd : c.avgDays > 100 ? COLORS.am : c.avgDays > 47 ? COLORS.ac : COLORS.gn;
                  const th = c.avgDays > 200 ? '200d' : c.avgDays > 100 ? '100d' : c.avgDays > 47 ? '47d' : '—';
                  const isExp = policyExp === c.id;
                  const dEntry = data.find((x) => x.id === c.id);
                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        onClick={() => setPolicyExp(isExp ? null : c.id)}
                        style={{
                          borderBottom: `1px solid ${COLORS.bd}`,
                          cursor: 'pointer',
                          background: isExp ? COLORS.s2 : 'transparent',
                        }}
                      >
                        <td
                          style={{
                            padding: '3px 6px',
                            color: COLORS.tx,
                            maxWidth: 160,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ fontSize: 9, color: isExp ? COLORS.ac : COLORS.t3, marginRight: 3 }}>
                            {isExp ? '▼' : '▶'}
                          </span>
                          {dn(c.caOwner)}
                        </td>
                        <td
                          style={{
                            padding: '3px 6px',
                            textAlign: 'right',
                            fontFamily: FONT_MONO,
                            fontSize: 9,
                            color: cl,
                          }}
                        >
                          {c.avgDays}d
                        </td>
                        <td style={{ padding: '3px 6px', textAlign: 'right', fontSize: 9, color: cl }}>{th}</td>
                      </tr>
                      {isExp && dEntry && (
                        <tr>
                          <td colSpan={3} style={expandedCellStyle}>
                            <CADetail d={dEntry} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            </div> {/* overflow wrapper */}
            {filteredCAs.length > policyPage && (
              <div style={{ textAlign: 'center', marginTop: 6 }}>
                <button
                  onClick={() => setPolicyPage((p) => p + 10)}
                  style={{
                    fontSize: 9,
                    color: COLORS.t3,
                    background: 'transparent',
                    border: `1px solid ${COLORS.bd}`,
                    borderRadius: 4,
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Show more ({filteredCAs.length - policyPage} remaining)
                </button>
              </div>
            )}
            {policyPage > 10 && (
              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <button
                  onClick={() => setPolicyPage(10)}
                  style={{
                    fontSize: 9,
                    color: COLORS.t3,
                    background: 'transparent',
                    border: `1px solid ${COLORS.bd}`,
                    borderRadius: 4,
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Show less
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <MethodologyCard>
        <MethodologyItem label="Usage period">365 / (all-time certs / unexpired certs). Measures how frequently a CA's subscribers actually replace certificates, not the validity period configured on the certificate. A CA issuing 90-day certs whose subscribers renew at 60 days has a ~22-day usage period.</MethodologyItem>
        <MethodologyItem label="BR schedule">CA/B Forum Baseline Requirements are reducing maximum certificate validity: 200 days (March 15 2026), 100 days (March 15 2027), 47 days (March 15 2029). CAs whose average usage period exceeds the next threshold face the largest subscriber disruption.</MethodologyItem>
        <MethodologyItem label="Limitation">Usage period is a population average. It does not capture subscriber heterogeneity — a CA may have some subscribers with 30-day automation and others doing manual annual renewal.</MethodologyItem>
      </MethodologyCard>

      {/* ═══ BALLOT CONTRIBUTIONS ═══ */}
      {rpeData?.ballot_classification && (() => {
        const bcAll = rpeData.ballot_classification;
        const bcRecent = bcAll.recent || bcAll;
        const bc = ballotView === 'recent' && bcAll.recent ? bcRecent : bcAll;
        const isRecent = ballotView === 'recent' && bcAll.recent;
        const STORE_COLORS_L = { chrome: '#4285f4', mozilla: '#ff6611', apple: '#a3aaae', microsoft: '#22d3ee' };
        const STORE_NAMES_L = { chrome: 'Chrome', mozilla: 'Mozilla', apple: 'Apple', microsoft: 'Microsoft' };
        const STORE_ORDER_L = ['chrome', 'mozilla', 'apple', 'microsoft'];
        const CAT_LABELS = {
          security_modernization: 'Security Modernization', validation_improvement: 'Validation Improvement',
          incident_response: 'Incident Response', infrastructure: 'Infrastructure',
          transparency_profiles: 'Transparency & Profiles', audit_standards: 'Audit Standards',
          cleanup: 'Cleanup', governance: 'Governance', uncategorized: 'Other',
        };
        const CAT_COLORS_L = {
          security_modernization: COLORS.rd, validation_improvement: COLORS.am, incident_response: COLORS.gn,
          infrastructure: COLORS.ac, transparency_profiles: COLORS.pu, audit_standards: COLORS.g5,
          cleanup: '#374151', governance: '#1f2937', uncategorized: '#111827',
        };
        const SUB_CATS = ['security_modernization', 'validation_improvement', 'incident_response', 'infrastructure', 'transparency_profiles', 'audit_standards'];
        const maxBar = Math.max(
          ...STORE_ORDER_L.map(s => Math.max(bc.browser_summary?.[s]?.total || 0, bc.browser_summary?.[s]?.endorsed || 0)),
          ...(bc.top_ca_contributors || []).map(c => Math.max(c.total, c.endorsed || 0)), 1
        );
        const tgl = (on) => ({ padding: '3px 10px', fontSize: 10, fontWeight: on ? 600 : 400, borderRadius: 4, cursor: 'pointer', border: 'none', background: on ? COLORS.ac : 'transparent', color: on ? COLORS.wh : COLORS.t3 });

        return (
          <>
            <div style={{ borderTop: `1px solid ${COLORS.bd}`, margin: '28px 0 20px', paddingTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.tx, marginBottom: 4 }}>Who Shapes Policy</div>
                <div style={{ fontSize: 10, color: COLORS.t3, lineHeight: 1.5 }}>
                  {isRecent ? `Last ${bc.total_ballots}` : bc.total_ballots} ballots classified. {bc.substantive_ballots} ({Math.round((bc.substantive_ballots / Math.max(bc.total_ballots, 1)) * 100)}%) substantive.
                </div>
              </div>
              {bcAll.recent && <div style={{ display: 'flex', gap: 2, background: COLORS.bg, borderRadius: 6, padding: 2 }}>
                <button style={tgl(ballotView === 'recent')} onClick={() => setBallotView('recent')}>Recent</button>
                <button style={tgl(ballotView === 'all')} onClick={() => setBallotView('all')}>All Time</button>
              </div>}
            </div>

            <Card>
              <CardTitle sub={`Ballots proposed and endorsed by each root program. ${isRecent ? 'Last 50 ballots.' : 'All time.'}`}>Browser Root Program Contributions</CardTitle>
              {STORE_ORDER_L.map(s => {
                const bs = bc.browser_summary?.[s] || {};
                const cats = bs.by_category || {};
                return (
                  <div key={s} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <div style={{ width: 70, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: STORE_COLORS_L[s] }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: STORE_COLORS_L[s] }}>{STORE_NAMES_L[s]}</span>
                      </div>
                      <span style={{ fontSize: 9, fontFamily: FONT_MONO, color: COLORS.t2 }}>{bs.total || 0} proposed · {bs.endorsed || 0} endorsed · {bs.substantive || 0} substantive</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 70, marginBottom: 2 }}>
                      <span style={{ fontSize: 7, color: COLORS.t3, width: 42 }}>proposed</span>
                      <div style={{ flex: 1, display: 'flex', height: 18, borderRadius: 3, overflow: 'hidden' }}>
                        {Object.keys(CAT_LABELS).map(cat => { const v = cats[cat] || 0; return v === 0 ? null : <div key={cat} style={{ width: `${(v / maxBar) * 100}%`, background: CAT_COLORS_L[cat], opacity: SUB_CATS.includes(cat) ? 0.85 : 0.35, borderRight: '1px solid #080c14', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{v >= 2 && <span style={{ fontSize: 7, fontFamily: FONT_MONO, color: COLORS.wh, fontWeight: 600, textShadow: '0 0 2px rgba(0,0,0,0.6)' }}>{v}</span>}</div>; })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 70 }}>
                      <span style={{ fontSize: 7, color: COLORS.t3, width: 42 }}>endorsed</span>
                      <div style={{ flex: 1, height: 12, borderRadius: 3, overflow: 'hidden', background: COLORS.bg }}>
                        <div style={{ width: `${((bs.endorsed || 0) / maxBar) * 100}%`, height: '100%', background: STORE_COLORS_L[s], opacity: 0.4, borderRadius: 3 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontSize: 8, color: COLORS.t3 }}>
                {SUB_CATS.map(cat => <span key={cat}><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: CAT_COLORS_L[cat], opacity: 0.85, marginRight: 3, verticalAlign: 'middle' }} />{CAT_LABELS[cat]}</span>)}
                <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: '#374151', opacity: 0.35, marginRight: 3, verticalAlign: 'middle' }} />Procedural</span>
                <span style={{ marginLeft: 4, borderLeft: `1px solid ${COLORS.bd}`, paddingLeft: 8 }}>
                  <span style={{ display: 'inline-block', width: 14, height: 7, borderRadius: 2, background: COLORS.t2, opacity: 0.4, marginRight: 3, verticalAlign: 'middle' }} />Endorsed
                </span>
              </div>
            </Card>

            <Card>
              <CardTitle sub={`Top CA organizations by ballots proposed and endorsed. ${isRecent ? 'Last 50.' : 'All time.'}`}>CA Contributions</CardTitle>
              {(bc.top_ca_contributors || []).slice(0, 8).map(ca => (
                <div key={ca.name} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <div style={{ width: 90, fontSize: 10, fontWeight: 500, color: COLORS.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ca.name}</div>
                    <span style={{ fontSize: 9, fontFamily: FONT_MONO, color: COLORS.t2 }}>{ca.total} proposed · {ca.endorsed || 0} endorsed · {ca.substantive} substantive</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 90, marginBottom: 2 }}>
                    <span style={{ fontSize: 7, color: COLORS.t3, width: 42 }}>proposed</span>
                    <div style={{ flex: 1, display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden' }}>
                      {Object.keys(CAT_LABELS).map(cat => { const v = (ca.by_category || {})[cat] || 0; return v === 0 ? null : <div key={cat} style={{ width: `${(v / maxBar) * 100}%`, background: CAT_COLORS_L[cat], opacity: SUB_CATS.includes(cat) ? 0.85 : 0.35, borderRight: '1px solid #080c14', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{v >= 2 && <span style={{ fontSize: 7, fontFamily: FONT_MONO, color: COLORS.wh, fontWeight: 600, textShadow: '0 0 2px rgba(0,0,0,0.6)' }}>{v}</span>}</div>; })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 90 }}>
                    <span style={{ fontSize: 7, color: COLORS.t3, width: 42 }}>endorsed</span>
                    <div style={{ flex: 1, height: 10, borderRadius: 3, overflow: 'hidden', background: COLORS.bg }}>
                      <div style={{ width: `${((ca.endorsed || 0) / maxBar) * 100}%`, height: '100%', background: COLORS.t2, opacity: 0.4, borderRadius: 3 }} />
                    </div>
                  </div>
                </div>
              ))}
            </Card>

            <Card>
              <CardTitle sub={`Ballots by category, browsers vs CAs. ${isRecent ? 'Last 50.' : 'All time.'}`}>Ballots by Category</CardTitle>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead><tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                  <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'left' }}>Category</th>
                  <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'center' }}>Browsers</th>
                  <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'center' }}>CAs</th>
                  <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'center' }}>Total</th>
                </tr></thead>
                <tbody>
                  {Object.entries(CAT_LABELS).map(([cat, label]) => { const ct = bc.category_totals?.[cat] || {}; if (!ct.total) return null; const isSub = SUB_CATS.includes(cat); return (
                    <tr key={cat} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                      <td style={{ padding: '4px 5px', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: CAT_COLORS_L[cat], opacity: isSub ? 0.85 : 0.35 }} /><span style={{ color: isSub ? COLORS.tx : COLORS.t3, fontWeight: isSub ? 500 : 400 }}>{label}</span></td>
                      <td style={{ padding: '4px 5px', textAlign: 'center', fontFamily: FONT_MONO, fontSize: 9, color: COLORS.t2 }}>{ct.browsers || 0}</td>
                      <td style={{ padding: '4px 5px', textAlign: 'center', fontFamily: FONT_MONO, fontSize: 9, color: COLORS.t2 }}>{ct.cas || 0}</td>
                      <td style={{ padding: '4px 5px', textAlign: 'center', fontFamily: FONT_MONO, fontSize: 9, fontWeight: 600, color: isSub ? COLORS.tx : COLORS.t3 }}>{ct.total}</td>
                    </tr>); })}
                </tbody>
              </table>
              </div> {/* overflow wrapper */}
            </Card>

            <MethodologyCard>
              <MethodologyItem label="Classification">Each ballot classified by title pattern matching into 9 categories. Substantive = improves security, validation, infrastructure, or transparency. Procedural = cleanup, governance, uncategorized.</MethodologyItem>
              <MethodologyItem label="Attribution">Proposers attributed by name/org matching. Endorser text stripped before matching to avoid misattribution. Endorser counts tracked separately. CAs propose the majority of ballots.</MethodologyItem>
              <MethodologyItem label="Limitations">Title-based classification may miscategorize ambiguous ballots. All ballots weighted equally regardless of impact. "Recent 50" reflects the most recent across all working groups.</MethodologyItem>
            </MethodologyCard>
          </>
        );
      })()}
    </div>
  );
};

export default PolicyView;
