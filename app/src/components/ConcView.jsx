import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Treemap } from 'recharts';
import { COLORS, FONT_MONO, FONT_SANS } from '../constants';
import { dn } from '../helpers';
import { Card, CardTitle, StatCard, ChartTooltip as TT, ChartWrap, TabIntro, MethodologyCard, MethodologyItem } from './shared';
import CADetail from './CADetail';
import { usePipeline } from '../PipelineContext';
import {
  cardHeaderStyle, controlRowStyle, footnoteStyle, searchInputNarrow, statGridStyle,
} from '../styles';

const TREEMAP_COLORS = [
  COLORS.ac,
  COLORS.cy,
  COLORS.pu,
  COLORS.gn,
  COLORS.am,
  COLORS.pk,
  COLORS.or,
  COLORS.tl,
  '#a78bfa',
  '#fb923c',
];

/**
 * ConcView — Concentration Risk tab.
 *
 * Visualizes WebPKI market concentration via treemap, cumulative
 * S-curve, and ranked ladder. Uses HHI index to quantify how
 * concentrated issuance is among the top CAs.
 */
const ConcView = () => {
  const { trustedCAs } = usePipeline();
  const data = trustedCAs;

  const totalCerts = useMemo(() => data.reduce((sum, d) => sum + d.certs, 0), [data]);

  const [expanded, setExpanded] = useState(null);
  const [concPageSize, setConcPageSize] = useState(25);
  const [concFilter, setConcFilter] = useState('');

  /* Cumulative share points */
  const points = useMemo(() => {
    let cumCerts = 0;
    return data.map((d, i) => {
      cumCerts += d.certs;
      return {
        rank: i + 1,
        ca: d.caOwner,
        cumPct: parseFloat(((cumCerts / totalCerts) * 100).toFixed(2)),
        indPct: parseFloat(((d.certs / totalCerts) * 100).toFixed(4)),
      };
    });
  }, [data, totalCerts]);

  /* Area chart data */
  const areaData = useMemo(() => points.map((p) => ({ rank: p.rank, pct: p.cumPct, name: p.ca })), [points]);

  /* Treemap data: top 10 + "Others" */
  const treemapData = useMemo(() => {
    const top10 = data.slice(0, 10);
    const restValue = Math.max(0, totalCerts - top10.reduce((sum, d) => sum + d.certs, 0));
    return [
      ...top10.map((d, i) => ({
        name: d.caOwner,
        size: d.certs,
        pct: ((d.certs / totalCerts) * 100).toFixed(1),
        fill: TREEMAP_COLORS[i],
      })),
      {
        name: `Others (${data.length - 10})`,
        size: restValue,
        pct: ((restValue / totalCerts) * 100).toFixed(1),
        fill: COLORS.t3,
      },
    ];
  }, [data, totalCerts]);

  /** Treemap custom content renderer */
  const TreemapCell = ({ x, y, width: w, height: h, name, pct, fill }) => {
    if (!name || w < 20 || h < 16) return null;
    const maxChars = Math.floor((w - 12) / 7);
    const label = maxChars > 3 && name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name;
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={fill} opacity={0.55} stroke={COLORS.bg} strokeWidth={2} rx={4} />
        {w > 45 && h > 28 && (
          <text
            x={x + 6}
            y={y + 16}
            fill={COLORS.tx}
            fontSize={w > 130 ? 14 : 11}
            fontWeight={600}
            fontFamily={FONT_SANS}
          >
            {label}
          </text>
        )}
        {w > 45 && h > 42 && (
          <text x={x + 6} y={y + (w > 130 ? 33 : 30)} fill="rgba(255,255,255,0.6)" fontSize={10} fontFamily={FONT_MONO}>
            {pct}%
          </text>
        )}
      </g>
    );
  };

  /* HHI = sum of squared market shares */
  const hhiValue = useMemo(
    () => Math.round(data.reduce((sum, d) => sum + Math.pow((d.certs / totalCerts) * 100, 2), 0)),
    [data, totalCerts],
  );
  const hhiLabel =
    hhiValue > 2500 ? 'highly concentrated' : hhiValue > 1500 ? 'moderately concentrated' : 'unconcentrated';

  return (
    <div>
      <TabIntro tabId="conc" quote="Concentration creates single points of catastrophic failure.">
        {(() => {
          const top3Pct = points[2]?.cumPct?.toFixed(0) || '—';
          const leEntry = data.find(d => (d.ca || d.caOwner || '').toLowerCase().includes('let\'s encrypt') || (d.ca || d.caOwner || '').toLowerCase().includes('isrg'));
          const lePct = leEntry ? ((leEntry.certs / totalCerts) * 100).toFixed(0) : null;
          return (
            <>
              Certificate issuance in the WebPKI is top-heavy: the top 3 CAs account for {top3Pct}% of all unexpired certificates
              {lePct ? `, with Let's Encrypt alone at ${lePct}%` : ''}.
              {' '}A single distrust event or operational failure at that scale would force millions of sites through emergency certificate replacement.
              CAs use this view to benchmark their position and the scrutiny that comes with it.
              Relying parties see why CA diversification and automated certificate lifecycle management are structural requirements for resilience.
            </>
          );
        })()}
      </TabIntro>

      {/* ── Summary stats ── */}
      <div
        style={{ ...statGridStyle, marginBottom: 24 }}
      >
        <StatCard
          l="Top 3 Control"
          v={`${points[2]?.cumPct?.toFixed ? points[2].cumPct.toFixed(2) : points[2]?.cumPct || 0}%`}
          c={COLORS.ac}
        />
        <StatCard l="Top 5 Control" v={`${points[4]?.cumPct || 0}%`} c={COLORS.cy} />
        <StatCard l="Top 7 Control" v={`${points[6]?.cumPct || 0}%`} c={COLORS.pu} />
        <StatCard
          l="HHI Index"
          v={hhiValue.toLocaleString()}
          s={hhiLabel}
          c={hhiValue > 2500 ? COLORS.rd : COLORS.am}
        />
      </div>

      {/* ── Treemap ── */}
      <Card>
        <CardTitle sub="Proportional area represents each CA's share of unexpired certificates. Larger boxes indicate greater issuance volume.">
          Market Share Treemap
        </CardTitle>
        <ChartWrap height={340}>
          <ResponsiveContainer width="100%" height="100%">
            <Treemap data={treemapData} dataKey="size" content={<TreemapCell />} isAnimationActive={false} />
          </ResponsiveContainer>
        </ChartWrap>
      </Card>

      {/* ── Cumulative S-curve ── */}
      <Card>
        <CardTitle sub="S-curve showing how quickly cumulative market share saturates.">
          Cumulative Concentration Curve
        </CardTitle>
        <ChartWrap height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={areaData} margin={{ left: 40, right: 20, top: 5, bottom: 20 }}>
              <defs>
                <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.ac} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.ac} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.bd} />
              <XAxis
                dataKey="rank"
                tick={{ fill: COLORS.t3, fontSize: 9 }}
                axisLine={{ stroke: COLORS.bd }}
                tickLine={false}
                label={{ value: 'CA Rank', position: 'insideBottom', offset: -12, fill: COLORS.t3, fontSize: 9 }}
              />
              <YAxis
                tick={{ fill: COLORS.t3, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
                label={{
                  value: 'Cumulative %',
                  angle: -90,
                  position: 'insideLeft',
                  offset: -5,
                  fill: COLORS.t3,
                  fontSize: 9,
                }}
              />
              <Tooltip
                content={(p) => (
                  <TT
                    {...p}
                    render={(d) => (
                      <>
                        <div style={{ fontWeight: 600, color: COLORS.tx }}>
                          #{d.rank} {d.name}
                        </div>
                        <div style={{ color: COLORS.t2 }}>Cumulative: {d.pct.toFixed(2)}%</div>
                      </>
                    )}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="pct"
                stroke={COLORS.ac}
                strokeWidth={2}
                fill="url(#cg)"
                dot={false}
                activeDot={{ r: 4, fill: COLORS.ac }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartWrap>
      </Card>

      {/* ── Concentration Ladder ── */}
      <Card>
        <div
          style={cardHeaderStyle}
        >
          <CardTitle sub="Ranked by cumulative market share. Click any row to expand CA details.">
            Concentration Ladder
          </CardTitle>
          <div style={controlRowStyle}>
            <input
              value={concFilter}
              onChange={(e) => setConcFilter(e.target.value)}
              placeholder="Filter CAs..."
              style={searchInputNarrow}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {[10, 25, 0].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setConcPageSize(n);
                    setExpanded(null);
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: 9,
                    borderRadius: 4,
                    cursor: 'pointer',
                    border: `1px solid ${concPageSize === n ? COLORS.bl : COLORS.bd}`,
                    background: concPageSize === n ? COLORS.s2 : 'transparent',
                    color: concPageSize === n ? COLORS.t2 : COLORS.t3,
                  }}
                >
                  {n === 0 ? 'All' : n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {(() => {
          const filteredPts = concFilter
            ? points.filter((p) => dn(p.ca).toLowerCase().includes(concFilter.toLowerCase()))
            : points;
          const shownPts = concPageSize === 0 ? filteredPts : filteredPts.slice(0, concPageSize);

          return (
            <div>
              {shownPts.map((p) => {
                const d = data.find((x) => x.rank === p.rank);
                const isExp = expanded === p.rank;
                return (
                  <React.Fragment key={p.rank}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 0',
                        borderBottom: `1px solid ${COLORS.bd}`,
                        cursor: 'pointer',
                        background: isExp ? COLORS.s2 : 'transparent',
                      }}
                      onClick={() => setExpanded(isExp ? null : p.rank)}
                    >
                      <span
                        style={{ width: 22, fontSize: 9, color: COLORS.t3, textAlign: 'right', fontFamily: FONT_MONO }}
                      >
                        {p.rank}
                      </span>
                      <span style={{ fontSize: 9, color: isExp ? COLORS.ac : COLORS.t3 }}>{isExp ? '▼' : '▶'}</span>
                      <span
                        title={p.ca}
                        style={{
                          width: 180,
                          fontSize: 11,
                          color: COLORS.tx,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {dn(p.ca)}
                      </span>
                      <div style={{ flex: 1, height: 12, background: COLORS.bg, borderRadius: 6, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${p.cumPct}%`,
                            background: `linear-gradient(90deg,${COLORS.ac}66,${COLORS.cy}66)`,
                            borderRadius: 6,
                          }}
                        />
                      </div>
                      <span
                        style={{ width: 54, fontSize: 10, color: COLORS.t2, textAlign: 'right', fontFamily: FONT_MONO }}
                      >
                        {p.cumPct.toFixed(2)}%
                      </span>
                      <span
                        style={{ width: 50, fontSize: 9, color: COLORS.t3, textAlign: 'right', fontFamily: FONT_MONO }}
                      >
                        +{p.indPct < 0.01 ? '<0.01' : p.indPct.toFixed(2)}%
                      </span>
                    </div>
                    {isExp && d && (
                      <div style={{ padding: '0 0 4px 30px' }}>
                        <CADetail d={d} />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}
      </Card>

      <div
        style={footnoteStyle}
      >
        <strong style={{ color: COLORS.t2 }}>HHI (Herfindahl–Hirschman Index)</strong> = sum of squared market shares.
        Standard concentration metric used by DOJ/FTC. &lt;1,500 = unconcentrated, 1,500–2,500 = moderately
        concentrated, &gt;2,500 = highly concentrated. In the WebPKI context this measures issuance concentration, not
        market power — free CAs exist, so high share doesn't imply pricing leverage. Concentration matters for blast radius (misissuance impact), root program negotiating dynamics, and ecosystem resilience if a major CA is distrusted. Data: unexpired precertificates from CT logs via crt.sh, attributed to root CA owner. Scope:
        currently trusted CAs only (included in at least one of Mozilla, Chrome, Microsoft, or Apple trust stores).
        crt.sh attributes certificates to the root owner, not the issuing CA — see Market Share tab footnotes for
        implications.
      </div>

      <MethodologyCard>
        <MethodologyItem label="Concentration metric">Share of total unexpired certificates issued by each CA. HHI (Herfindahl-Hirschman Index) measures market concentration — higher values indicate fewer CAs account for more issuance.</MethodologyItem>
        <MethodologyItem label="Risk">If a top CA is compromised or distrusted, the blast radius is proportional to their market share. Concentration in few CAs creates systemic single points of failure.</MethodologyItem>
      </MethodologyCard>
    </div>
  );
};

export default ConcView;
