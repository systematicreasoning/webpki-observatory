import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { COLORS, FONT_MONO, FONT_SANS } from '../constants';
import { dn, f } from '../helpers';
import { Card, CardTitle, StatCard, ChartWrap, TabIntro } from './shared';
import CADetail from './CADetail';
import { usePipeline } from '../PipelineContext';
import { compactTableStyle, expandedCellStyle } from '../styles';

/**
 * PolicyView — Policy Impact tab.
 *
 * Projects the impact of upcoming Baseline Requirements validity
 * reductions (200d Mar 2026, 100d Mar 2027, 47d Mar 2029) on each
 * CA's subscriber base. "Usage period" measures actual replacement
 * behavior, not the validity period on the certificate.
 */
const PolicyView = () => {
  const { trustedCAs } = usePipeline();

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
  const tiers = [
    { label: 'Below 47d', desc: '< 47d', cas: casWithUsage.filter((c) => c.avgDays <= 47), color: COLORS.gn },
    {
      label: '47 to 100d',
      desc: '47-100d',
      cas: casWithUsage.filter((c) => c.avgDays > 47 && c.avgDays <= 100),
      color: COLORS.ac,
    },
    {
      label: '100 to 200d',
      desc: '100-200d',
      cas: casWithUsage.filter((c) => c.avgDays > 100 && c.avgDays <= 200),
      color: COLORS.am,
    },
    { label: 'Above 200d', desc: '> 200d', cas: casWithUsage.filter((c) => c.avgDays > 200), color: COLORS.rd },
  ].filter((t) => t.cas.length > 0);
  const filteredCAs = selTier !== null ? tiers[selTier].cas : casWithUsage;
  const pagedCAs = filteredCAs.slice(0, policyPage);
  return (
    <div>
      <TabIntro quote="Policy shapes the Web PKI.">
        Minimum practices evolve with threats and technology: some CAs lead, others follow, some lag. The CA/Browser Forum's Baseline Requirements are tightening maximum certificate validity from 398 days down to 200 days (March 2026), 100 days (March 2027), and eventually 47 days (March 2029). This tab measures each CA's actual certificate usage period — how frequently their subscribers replace certificates — against those incoming thresholds. CAs operating well above the next deadline face the largest subscriber disruption. CAs already below the 47-day target have proven their automation story. Relying parties can assess which CAs are prepared for the policy changes ahead and which are likely to struggle.
      </TabIntro>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <StatCard l="CAs with Usage Data" v={casWithUsage.length} c={COLORS.ac} />
        <StatCard
          l="Above 200d Limit"
          v={casWithUsage.filter((d) => d.avgDays > 200).length}
          s="need renewal changes"
          c={COLORS.rd}
        />
        <StatCard l="Below 47d Target" v={readyCount} s="below threshold" c={COLORS.gn} />
        <StatCard
          l="Median Usage"
          v={casWithUsage.length > 0 ? casWithUsage[Math.floor(casWithUsage.length / 2)].avgDays + 'd' : '—'}
          c={COLORS.t2}
        />
      </div>

      <Card>
        <CardTitle sub="Average certificate usage period vs upcoming BR max validity thresholds (200d Mar 2026, 100d Mar 2027, 47d Mar 2029).">
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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

      <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 8, lineHeight: 1.5 }}>
        "Usage period" is average time before replacement, not the validity period on the certificate. CAs with short
        usage periods have subscriber bases that already automate renewal. BR max validity schedule: 200d from Mar 2026,
        100d from Mar 2027, 47d from Mar 2029.
      </div>
    </div>
  );
};

export default PolicyView;
