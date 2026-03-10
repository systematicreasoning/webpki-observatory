import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  LabelList,
} from 'recharts';
import { COLORS, FONT_MONO, FONT_SANS, COUNTRY_COORDS } from '../constants';
import { dn, f, fl } from '../helpers';
import {
  Card,
  CardTitle,
  StatCard,
  RateDot,
  ChartTooltip as TT,
  ChartWrap,
  GeoMap,
  DataPending,
  Paginator,
  TabIntro,
  MethodologyCard,
  MethodologyItem,
} from './shared';
import CADetail from './CADetail';
import { usePipeline } from '../PipelineContext';
import { compactTableStyle, expandedCellStyle, scrollXStyle } from '../styles';

/**
 * OpsMap — Jurisdiction map for operational risk.
 * Aggregates incidents by CA country, supports absolute count
 * and per-million-certs normalized views.
 */
const OpsMap = ({ incidents }) => {
  const { caData } = usePipeline();
  const [mapMode, setMapMode] = useState('ppm');
  const pins = useMemo(() => {
    const byC = {};
    incidents.forEach((ca) => {
      const m = caData.find((x) => x.id === ca.id);
      const co = m?.country;
      if (!co || !COUNTRY_COORDS[co]) return;
      if (!byC[co]) byC[co] = { co, n: 0, v: 0, cas: [], ppm: [] };
      byC[co].n += ca.n;
      byC[co].cas.push(ca.ca);
      if (m) byC[co].v += m.certs;
      if (ca.ppm) byC[co].ppm.push(parseFloat(ca.ppm));
    });
    const entries = Object.values(byC).map((c) => ({
      ...c,
      avgPpm: c.ppm.length > 0 ? c.ppm.reduce((a, b) => a + b, 0) / c.ppm.length : null,
    }));
    if (mapMode === 'abs') {
      const mx = Math.max(...entries.map((c) => c.n), 1);
      return entries.map((c) => {
        const pct = c.n / mx;
        const cl = pct > 0.6 ? COLORS.rd : pct > 0.3 ? COLORS.am : COLORS.gn;
        return {
          lat: COUNTRY_COORDS[c.co].lat,
          lng: COUNTRY_COORDS[c.co].lng,
          label: c.co,
          color: cl,
          r: Math.max(4, Math.min(14, 3 + Math.sqrt(pct) * 11)),
          tooltip: (
            <div>
              <div style={{ fontWeight: 600, color: COLORS.tx }}>{c.co}</div>
              <div style={{ color: COLORS.t2 }}>
                {c.n} incidents · {c.cas.length} CAs
              </div>
              <div style={{ color: COLORS.t3, fontSize: 9 }}>{c.cas.join(', ')}</div>
            </div>
          ),
        };
      });
    } else {
      const withRate = entries.filter((c) => c.avgPpm !== null);
      const mx = Math.max(...withRate.map((c) => c.avgPpm), 0.01);
      return withRate.map((c) => {
        const pct = c.avgPpm / mx;
        const cl = pct > 0.6 ? COLORS.rd : pct > 0.3 ? COLORS.am : COLORS.gn;
        return {
          lat: COUNTRY_COORDS[c.co].lat,
          lng: COUNTRY_COORDS[c.co].lng,
          label: c.co,
          color: cl,
          r: Math.max(4, Math.min(14, 3 + Math.sqrt(pct) * 11)),
          tooltip: (
            <div>
              <div style={{ fontWeight: 600, color: COLORS.tx }}>{c.co}</div>
              <div style={{ color: COLORS.t2 }}>{c.avgPpm.toFixed(2)} per M certs</div>
              <div style={{ color: COLORS.t3, fontSize: 9 }}>
                {c.n} incidents · {f(c.certs)} certs
              </div>
            </div>
          ),
        };
      });
    }
  }, [incidents, mapMode]);
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <CardTitle
          sub={
            mapMode === 'abs'
              ? 'Dot size and color reflect total incident count. Red = highest concentration of incidents.'
              : 'Dot size and color reflect incidents per million certificates issued. Red = highest rate relative to issuance volume.'
          }
        >
          Operational Risk by Jurisdiction
        </CardTitle>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {[
            ['ppm', 'Per M Certs'],
            ['abs', 'Absolute'],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setMapMode(k)}
              style={{
                padding: '4px 8px',
                fontSize: 9,
                borderRadius: 4,
                cursor: 'pointer',
                border: `1px solid ${mapMode === k ? COLORS.bl : COLORS.bd}`,
                background: mapMode === k ? COLORS.s2 : 'transparent',
                color: mapMode === k ? COLORS.t2 : COLORS.t3,
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <GeoMap
        height={260}
        pins={pins}
        legend={[
          { color: COLORS.rd, label: 'High' },
          { color: COLORS.am, label: 'Medium' },
          { color: COLORS.gn, label: 'Low' },
        ]}
      />
    </Card>
  );
};

/**
 * OpsView — Operational Risk tab.
 *
 * Visualizes CA incident data from Bugzilla CA Certificate Compliance.
 * Includes annual volume trends, AI-classified incident taxonomy
 * (misissuance, revocation, governance, validation), self-report rates,
 * and a detection capability scatter plot.
 */
const OpsView = () => {
  const { caData, incidentsData } = usePipeline();

  if (!incidentsData || !incidentsData.total || !incidentsData.years || incidentsData.years.length === 0)
    return (
      <div>
        <DataPending
          tab="Operational Risk"
          source="Bugzilla CA Certificate Compliance"
          description="This tab visualizes CA operational risk derived from Mozilla's incident tracking dataset. The pipeline fetches bugs from Bugzilla, classifies incidents using AI, normalizes by issuance volume, and distinguishes self-reported from externally discovered issues. Data generation requires the pipeline to run with an Anthropic API key for classification."
        />
        <Card>
          <CardTitle>What This Tab Will Show</CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              [
                'Annual Incident Volume',
                'The enforcement arc from 2014 to present, showing how root program oversight evolved',
              ],
              [
                'Top 20 CAs by Incident Count',
                'Ranked by raw count, but with self-report % and per-million-certs normalization to provide fair context',
              ],
              [
                'Incident Classification',
                'AI-classified into categories: misissuance, CRL/OCSP, audit, policy violation, disclosure, key management',
              ],
              [
                'Self-Report vs External',
                'Distinguishes CAs that find their own problems from those whose issues are discovered by researchers or root programs',
              ],
              [
                'Ecosystem-Wide Incidents',
                'Identifies bugs that hit many CAs simultaneously (e.g. serial number entropy) and separates them from unique operational failures',
              ],
              [
                'Jurisdictional Map',
                'Geographic distribution of operational risk, with distrusted CA jurisdictions highlighted',
              ],
            ].map(([title, desc]) => (
              <div
                key={title}
                style={{
                  background: COLORS.bg,
                  borderRadius: 6,
                  padding: '10px 12px',
                  border: `1px solid ${COLORS.bd}`,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.t2, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 9, color: COLORS.t3, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  // When incidentsData is populated, render the full visualizations
  const d = incidentsData;
  const maxCA = d.cas[0]?.n || 1;
  const peakYear = d.years.reduce((a, b) => (b.n > a.n ? b : a), { n: 0 });
  const curYear = d.years[d.years.length - 1];
  const curPace = curYear ? Math.round(curYear.n * (365 / (new Date().getMonth() * 30.4 + new Date().getDate()))) : 0;
  const top20Share = Math.round((d.cas.reduce((s, c) => s + c.n, 0) / d.total) * 100);
  const avgSelf = d.cas.length > 0 ? Math.round(d.cas.reduce((s, c) => s + c.selfPct, 0) / d.cas.length) : 0;
  const withPpm = d.cas.map((ca) => {
    const m = caData.find((x) => x.id === ca.id);
    const allTime = m?.allTimeCerts || 0;
    return { ...ca, ppm: allTime > 0 ? ((ca.n / allTime) * 1e6).toFixed(2) : null };
  });
  const [opsCnt, setOpsCnt] = useState(10);
  const [opsExp, setOpsExp] = useState(null);
  const [srCnt, setSrCnt] = useState(10);
  const [fpCnt, setFpCnt] = useState(10);
  const [opsFilter, setOpsFilter] = useState('');
  const opsFiltered = useMemo(() => {
    const q = opsFilter.toLowerCase();
    return q ? withPpm.filter((c) => c.ca.toLowerCase().includes(q)) : withPpm;
  }, [withPpm, opsFilter]);
  const opsShown = opsCnt === 0 ? opsFiltered : opsFiltered.slice(0, opsCnt);
  return (
    <div>
      <TabIntro quote="By their incidents you shall know them.">
        Public compliance failures from Mozilla's Bugzilla CA Certificate Compliance tracker, normalized per million certificates issued to enable fair comparison across CAs of vastly different scale. Raw incident counts reward small CAs and penalize large ones; normalization reveals actual operational maturity independent of volume. Self-reported versus externally-discovered incident ratios show which CAs have mature internal detection. CAs see where they stand relative to peers and where to invest in process improvement. Relying parties get an objective, data-driven reliability signal that marketing materials will never provide.
      </TabIntro>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <StatCard l="Incidents" v={fl(d.total)} s={`${d.ca_count} CAs with incidents`} c={COLORS.ac} />
        <StatCard l="Peak Year" v={peakYear.y} s={`${peakYear.n} incidents`} c={COLORS.am} />
        <StatCard
          l={`${curYear.y} YTD`}
          v={curYear.n}
          s={`~${curPace} annualized`}
          c={curPace > peakYear.n ? COLORS.rd : COLORS.t2}
        />
        <StatCard l="Top 20 Share" v={`${top20Share}%`} s="of all incidents" />
        <StatCard l="Avg Self-Report" v={`${avgSelf}%`} s={`across ${d.cas.length} CAs`} c={COLORS.gn} />
      </div>

      <Card>
        <CardTitle sub="Incidents filed under Bugzilla CA Certificate Compliance by year.">
          Annual Incident Volume
        </CardTitle>
        <ChartWrap height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={d.years} margin={{ left: 30, right: 10, top: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="og" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.ac} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.ac} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.bd} />
              <XAxis
                dataKey="y"
                tick={{ fill: COLORS.t3, fontSize: 9 }}
                axisLine={{ stroke: COLORS.bd }}
                tickLine={false}
              />
              <YAxis tick={{ fill: COLORS.t3, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip
                content={(p) => (
                  <TT
                    {...p}
                    render={(x) => (
                      <>
                        <div style={{ fontWeight: 600, color: COLORS.tx }}>
                          {x.y}
                          {x.y === 2026 ? ' (YTD)' : ''}
                        </div>
                        <div style={{ color: COLORS.t2 }}>{x.n} incidents</div>
                      </>
                    )}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="n"
                stroke={COLORS.ac}
                strokeWidth={2}
                fill="url(#og)"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const isCurrent = payload.y === new Date().getFullYear();
                  return isCurrent ? (
                    <circle cx={cx} cy={cy} r={4} fill="none" stroke={COLORS.am} strokeWidth={2} strokeDasharray="3 2" />
                  ) : (
                    <circle cx={cx} cy={cy} r={3} fill={COLORS.bg} stroke={COLORS.ac} strokeWidth={2} />
                  );
                }}
                activeDot={{ r: 5, fill: COLORS.ac }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartWrap>
        <div style={{ fontSize: 9, color: COLORS.am, marginTop: 4 }}>
          ⚠ {d.years[d.years.length - 1]?.y} is year-to-date — dashed dot marks incomplete data. ~{curPace} incidents annualized at current pace.
        </div>
      </Card>

      {d.categories.length || d.yearsByClass.length || d.fingerprints.length ? (
        (() => {
          const CC = {
            mi: { l: 'Misissuance', c: '#e6a237' },
            rv: { l: 'Revocation', c: COLORS.rd },
            gv: { l: 'Governance', c: COLORS.gn },
            vl: { l: 'Validation', c: COLORS.pu },
          };
          const ybc = d.yearsByClass || [];
          const fp = d.fingerprints || [];
          return (
            <>
              {ybc.length > 0 && (
                <Card>
                  <CardTitle sub="Incident types by year. Stacked bars show the evolving mix of misissuance, revocation, governance, and validation issues.">
                    Incidents by Class
                  </CardTitle>
                  <ChartWrap height={240}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ybc} margin={{ left: 30, right: 10, top: 15, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.bd} />
                        <XAxis
                          dataKey="y"
                          tick={{ fill: COLORS.t3, fontSize: 9 }}
                          axisLine={{ stroke: COLORS.bd }}
                          tickLine={false}
                        />
                        <YAxis tick={{ fill: COLORS.t3, fontSize: 9 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          content={(p) => (
                            <TT
                              {...p}
                              render={(x) => (
                                <>
                                  <div style={{ fontWeight: 600, color: COLORS.tx }}>{x.y}</div>
                                  {[
                                    ['mi', 'Misissuance'],
                                    ['rv', 'Revocation'],
                                    ['gv', 'Governance'],
                                    ['vl', 'Validation'],
                                  ].map(
                                    ([k, l]) =>
                                      x[k] > 0 && (
                                        <div key={k} style={{ color: CC[k].c }}>
                                          {l}: {x[k]}
                                        </div>
                                      ),
                                  )}
                                  <div style={{ color: COLORS.t2, marginTop: 2 }}>
                                    Total: {(x.mi || 0) + (x.rv || 0) + (x.gv || 0) + (x.vl || 0)}
                                  </div>
                                </>
                              )}
                            />
                          )}
                        />
                        <Bar dataKey="mi" stackId="a" fill={CC.mi.c} opacity={0.8} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="rv" stackId="a" fill={CC.rv.c} opacity={0.8} />
                        <Bar dataKey="gv" stackId="a" fill={CC.gv.c} opacity={0.8} />
                        <Bar dataKey="vl" stackId="a" fill={CC.vl.c} opacity={0.8} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartWrap>
                  <div style={{ display: 'flex', gap: 14, fontSize: 9, color: COLORS.t3, marginTop: 4 }}>
                    {Object.entries(CC).map(([k, v]) => (
                      <span key={k}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: v.c,
                            opacity: 0.8,
                            marginRight: 4,
                            verticalAlign: 'middle',
                          }}
                        />
                        {v.l}
                      </span>
                    ))}
                  </div>
                </Card>
              )}

              {fp.length > 0 && (
                <Card>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}
                  >
                    <CardTitle sub="Per-CA breakdown of incident types by classification.">
                      CA Incident Fingerprints
                    </CardTitle>
                    <Paginator count={fpCnt} setCount={setFpCnt} options={[10, 15, 25, 0]} />
                  </div>
                  {(fpCnt === 0 ? fp : fp.slice(0, fpCnt)).map((ca) => {
                    const tot = ca.mi + ca.rv + ca.gv + ca.vl;
                    return (
                      <div key={ca.ca} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span
                          title={ca.ca}
                          style={{
                            width: 130,
                            fontSize: 10,
                            color: COLORS.tx,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ca.ca.length > 18 ? ca.ca.split(/[\s,]/)[0] : ca.ca}
                        </span>
                        <div style={{ flex: 1, height: 16, borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
                          {[
                            ['mi', CC.mi.c],
                            ['rv', CC.rv.c],
                            ['gv', CC.gv.c],
                            ['vl', CC.vl.c],
                          ].map(
                            ([k, c]) => {
                              const pct = tot > 0 ? (ca[k] / tot) * 100 : 0;
                              return ca[k] > 0 && (
                                <div
                                  key={k}
                                  style={{
                                    width: `${pct}%`, background: c, opacity: 0.8,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    overflow: 'hidden',
                                  }}
                                  title={`${CC[k].l}: ${ca[k]} (${pct.toFixed(0)}%)`}
                                >
                                  {pct >= 12 && (
                                    <span style={{ fontSize: 7, fontWeight: 600, color: '#fff', textShadow: '0 0 2px rgba(0,0,0,0.5)' }}>
                                      {pct.toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                              );
                            },
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: 9,
                            color: COLORS.t3,
                            fontFamily: FONT_MONO,
                            width: 28,
                            textAlign: 'right',
                          }}
                        >
                          {tot}
                        </span>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', gap: 14, fontSize: 9, color: COLORS.t3, marginTop: 8 }}>
                    {Object.entries(CC).map(([k, v]) => (
                      <span key={k}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: v.c,
                            opacity: 0.8,
                            marginRight: 4,
                            verticalAlign: 'middle',
                          }}
                        />
                        {v.l}
                      </span>
                    ))}
                  </div>
                </Card>
              )}

              {!ybc.length && (
                <Card>
                  <CardTitle sub="Incident types derived from Bugzilla whiteboard tags and bug summaries.">
                    Incident Classification
                  </CardTitle>
                  <div style={{ height: 32, borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 10 }}>
                    {d.categories.map((c) => {
                      const catColors = {
                        Misissuance: COLORS.rd,
                        'CRL / OCSP': COLORS.am,
                        Audit: COLORS.pu,
                        'Policy Violation': COLORS.pk,
                        'Revocation Delay': '#f97316',
                        Disclosure: COLORS.cy,
                        Other: COLORS.t3,
                      };
                      const total = d.categories.reduce((s, x) => s + x.n, 0);
                      const w = (c.n / total) * 100;
                      return (
                        <div
                          key={c.cat}
                          style={{
                            width: `${w}%`,
                            background: catColors[c.cat] || COLORS.t3,
                            opacity: 0.7,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRight: `1px solid ${COLORS.bg}`,
                          }}
                          title={`${c.cat}: ${c.n} (${w.toFixed(1)}%)`}
                        >
                          {w > 6 && (
                            <span style={{ fontSize: 8, color: COLORS.tx, fontWeight: 500 }}>{w.toFixed(0)}%</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 9, color: COLORS.t3 }}>
                    {d.categories.map((c) => (
                      <span key={c.cat}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background:
                              {
                                Misissuance: COLORS.rd,
                                'CRL / OCSP': COLORS.am,
                                Audit: COLORS.pu,
                                'Policy Violation': COLORS.pk,
                                'Revocation Delay': '#f97316',
                                Disclosure: COLORS.cy,
                                Other: COLORS.t3,
                              }[c.cat] || COLORS.t3,
                            opacity: 0.7,
                            marginRight: 3,
                          }}
                        />
                        {c.cat} ({c.n})
                      </span>
                    ))}
                  </div>
                </Card>
              )}

              <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 2, lineHeight: 1.5 }}>
                Classification definitions: <strong style={{ color: COLORS.t2 }}>Misissuance</strong> = certificates
                issued violating the BRs (wrong SANs, encoding errors, serial number issues).{' '}
                <strong style={{ color: COLORS.t2 }}>Revocation</strong> = CRL/OCSP infrastructure failures and delayed
                revocation. <strong style={{ color: COLORS.t2 }}>Governance</strong> = audit qualifications, CPS
                violations, disclosure failures, CP/CPS non-compliance.{' '}
                <strong style={{ color: COLORS.t2 }}>Validation</strong> = domain/organization validation process
                failures.
              </div>
            </>
          );
        })()
      ) : (
        <DataPending
          tab="Incident Classification"
          source="Anthropic API (classification pipeline)"
          description="Incident taxonomy requires the classification pipeline to run. It categorizes each Bugzilla bug into Misissuance, Revocation, Governance, or Validation using AI analysis, then produces per-year and per-CA breakdowns. This enables the stacked bar chart showing how incident types evolve over time and per-CA fingerprints showing each CA's operational profile."
        />
      )}

      <Card>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <CardTitle sub="Per M Certs normalizes for issuance volume. Only currently trusted CAs shown.">
            CAs by Incident Count
          </CardTitle>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <input
              value={opsFilter}
              onChange={(e) => setOpsFilter(e.target.value)}
              placeholder="Filter CAs..."
              style={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.bd}`,
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                color: COLORS.tx,
                fontFamily: FONT_SANS,
                width: 160,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {[10, 20, 0].map((n) => (
                <button
                  key={n}
                  onClick={() => setOpsCnt(n)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 9,
                    borderRadius: 4,
                    cursor: 'pointer',
                    border: `1px solid ${opsCnt === n ? COLORS.bl : COLORS.bd}`,
                    background: opsCnt === n ? COLORS.s2 : 'transparent',
                    color: opsCnt === n ? COLORS.t2 : COLORS.t3,
                  }}
                >
                  {n === 0 ? 'All' : n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={scrollXStyle}>
          <table style={compactTableStyle}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                {[
                  ['#', 'Rank by incident count'],
                  ['CA', 'CA organization (CCADB canonical name)'],
                  ['Incidents', 'Total Bugzilla CA Certificate Compliance bugs filed'],
                  ['Self-Report', 'Percentage of incidents self-reported by the CA vs discovered externally'],
                  ['Per M Certs', 'Incidents per million all-time certificates (normalizes for volume and time)'],
                  ['', 'Incident count bar'],
                ].map(([h, tip], i) => (
                  <th
                    key={i}
                    title={tip}
                    style={{
                      padding: '6px 5px',
                      color: COLORS.t3,
                      fontSize: 8,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      textAlign: i >= 2 ? 'right' : i === 5 ? 'left' : 'left',
                      cursor: tip ? 'help' : 'default',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {opsShown.map((ca, i) => {
                const dEntry = caData.find((x) => x.id === ca.id);
                const isExp = opsExp === ca.ca;
                return (
                  <React.Fragment key={ca.ca}>
                    <tr
                      style={{ borderBottom: `1px solid ${COLORS.bd}`, cursor: dEntry ? 'pointer' : 'default' }}
                      onClick={() => dEntry && setOpsExp(isExp ? null : ca.ca)}
                    >
                      <td
                        style={{
                          padding: '5px',
                          textAlign: 'right',
                          color: COLORS.t3,
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                        }}
                      >
                        {i + 1}
                      </td>
                      <td
                        title={ca.ca}
                        style={{
                          padding: '5px',
                          color: COLORS.tx,
                          maxWidth: 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {dEntry && (
                          <span style={{ fontSize: 9, color: isExp ? COLORS.ac : COLORS.t3, marginRight: 3 }}>
                            {isExp ? '▼' : '▶'}
                          </span>
                        )}
                        {dn(ca.ca)}
                      </td>
                      <td
                        style={{
                          padding: '5px',
                          textAlign: 'right',
                          fontFamily: FONT_MONO,
                          fontSize: 10,
                          color: COLORS.tx,
                        }}
                      >
                        {ca.n}
                      </td>
                      <td style={{ padding: '5px', textAlign: 'right', fontFamily: FONT_MONO, fontSize: 10 }}>
                        <span style={{ color: ca.selfPct > 60 ? COLORS.gn : ca.selfPct > 30 ? COLORS.t2 : COLORS.am }}>
                          {ca.selfPct}%
                        </span>
                      </td>
                      <td style={{ padding: '5px', textAlign: 'right', fontFamily: FONT_MONO, fontSize: 10 }}>
                        <span
                          style={{
                            color: ca.ppm && parseFloat(ca.ppm) > 1 ? COLORS.rd : ca.ppm ? COLORS.t2 : COLORS.t3,
                          }}
                        >
                          <RateDot ppm={ca.ppm ? parseFloat(ca.ppm) : 0} size={5} /> {ca.ppm || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '5px', width: '30%' }}>
                        <div
                          style={{
                            position: 'relative',
                            height: 16,
                            background: COLORS.bg,
                            borderRadius: 3,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              height: '100%',
                              width: '100%',
                              background: COLORS.s1,
                              borderRadius: 3,
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              height: '100%',
                              width: `${(ca.n / maxCA) * 100}%`,
                              background: COLORS.ac,
                              opacity: 0.6,
                              borderRadius: 3,
                            }}
                          />
                          <span
                            style={{
                              position: 'absolute',
                              right: 4,
                              top: 2,
                              fontSize: 8,
                              color: COLORS.tx,
                              fontFamily: FONT_MONO,
                            }}
                          >
                            {ca.n}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {isExp && dEntry && (
                      <tr>
                        <td colSpan={6} style={expandedCellStyle}>
                          <CADetail d={dEntry} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 9, color: COLORS.t3, marginTop: 8, lineHeight: 1.5 }}>
          High incident count does not indicate low maturity. Volume CAs and transparent self-reporters accumulate more
          bugs. Self-Report: proportion filed by the CA itself (higher = more transparent). Per M Certs: incidents per
          million unexpired certificates (normalizes for volume).
          {d.distrusted_excluded &&
            d.distrusted_excluded.length > 0 &&
            ` Excluded ${d.distrusted_excluded.length} distrusted CAs (${d.distrusted_excluded.map((c) => c.caOwner).join(', ')}): no longer in any trust store.`}
        </div>
      </Card>

      {/* Operational risk jurisdiction map */}
      <OpsMap incidents={withPpm} />

      {/* Self-Report Rate */}
      {(() => {
        const allSorted = [...withPpm]
          .filter((ca) => ca.ca)
          .sort((a, b) => {
            const oa = incidentsData.cas.find((x) => x.id === a.id);
            const ob = incidentsData.cas.find((x) => x.id === b.id);
            return (ob?.selfPct || 0) - (oa?.selfPct || 0);
          })
          .map((ca) => {
            const o = incidentsData.cas.find((x) => x.id === ca.id);
            return {
              name: ca.ca.length > 18 ? ca.ca.split(/[\s,]/)[0] : ca.ca,
              full: ca.ca,
              selfPct: o?.selfPct || 0,
              selfN: o?.self || 0,
              extN: o?.ext || 0,
              n: o?.n || 0,
            };
          });
        const sorted = srCnt === 0 ? allSorted : allSorted.slice(0, srCnt);
        return (
          <Card>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <CardTitle sub="Self-report rate: proportion of incidents filed by the CA itself.">
                Self-Report Rate
              </CardTitle>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {[10, 20, 0].map((n) => (
                  <button
                    key={n}
                    onClick={() => setSrCnt(n)}
                    style={{
                      padding: '4px 8px',
                      fontSize: 9,
                      borderRadius: 4,
                      cursor: 'pointer',
                      border: `1px solid ${srCnt === n ? COLORS.bl : COLORS.bd}`,
                      background: srCnt === n ? COLORS.s2 : 'transparent',
                      color: srCnt === n ? COLORS.t2 : COLORS.t3,
                    }}
                  >
                    {n === 0 ? 'All' : n}
                  </button>
                ))}
              </div>
            </div>
            <ChartWrap height={Math.max(200, sorted.length * 24)}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sorted} layout="vertical" margin={{ left: 10, right: 40, top: 5, bottom: 5 }}>
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: COLORS.t3, fontSize: 9 }}
                    axisLine={{ stroke: COLORS.bd }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: COLORS.t2, fontSize: 9, fontFamily: FONT_SANS }}
                    axisLine={false}
                    tickLine={false}
                    width={100}
                  />
                  <Tooltip
                    content={(p) => (
                      <TT
                        {...p}
                        render={(x) => (
                          <>
                            <div style={{ fontWeight: 600, color: COLORS.tx }}>{x.full}</div>
                            <div style={{ color: COLORS.t2 }}>
                              {x.selfPct}% self-reported ({x.selfN} of {x.n})
                            </div>
                          </>
                        )}
                      />
                    )}
                  />
                  <ReferenceLine x={50} stroke={COLORS.bl} strokeDasharray="4 4" />
                  <Bar dataKey="selfPct" radius={[0, 4, 4, 0]} barSize={14}>
                    {sorted.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.selfPct > 60 ? COLORS.gn : d.selfPct > 30 ? COLORS.am : COLORS.rd}
                        fillOpacity={0.6}
                      />
                    ))}
                    <LabelList dataKey="selfPct" position="right" formatter={(v) => `${v}%`} style={{ fill: COLORS.t3, fontSize: 8, fontFamily: FONT_MONO }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartWrap>
            <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 4 }}>
              Dashed line = 50%. Green = strong (&gt;60%). Amber = moderate (30-60%). Red = weak (&lt;30%). Self-report
              attribution based on Bugzilla bug creator email domain matching.
            </div>
          </Card>
        );
      })()}

      {/* Detection Capability vs Incident Density scatter */}
      {(() => {
        const scatter = incidentsData.cas
          .map((ca) => {
            const m = caData.find((x) => x.id === ca.id);
            if (!m) return null;
            const allTime = m.allTimeCerts || m.certs;
            if (!allTime) return null;
            const ppm = (ca.n / allTime) * 1e6;
            return {
              name: ca.ca.length > 20 ? ca.ca.split(/[\s,]/)[0] : ca.ca,
              full: ca.ca,
              x: ca.selfPct,
              y: ppm,
              z: Math.max(40, Math.min(400, Math.sqrt(m.certs / 1e4))),
              n: ca.n,
              certs: allTime,
            };
          })
          .filter(Boolean);
        return (
          <Card>
            <CardTitle sub="X-axis: self-report rate. Y-axis: incidents per million certs (log scale).">
              Detection Capability vs Incident Density
            </CardTitle>
            <ChartWrap height={320}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ left: 50, right: 20, top: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.bd} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0, 100]}
                    tick={{ fill: COLORS.t3, fontSize: 9 }}
                    axisLine={{ stroke: COLORS.bd }}
                    tickLine={false}
                    label={{
                      value: 'Self-Report Rate %',
                      position: 'insideBottom',
                      offset: -8,
                      fill: COLORS.t3,
                      fontSize: 9,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    scale="log"
                    domain={['auto', 'auto']}
                    tick={{ fill: COLORS.t3, fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    label={{
                      value: 'Incidents per M Certs (log)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: -8,
                      fill: COLORS.t3,
                      fontSize: 9,
                    }}
                  />
                  <ZAxis type="number" dataKey="z" range={[40, 400]} />
                  <ReferenceLine x={50} stroke={COLORS.bl} strokeDasharray="5 5" />
                  <Tooltip
                    content={(p) => (
                      <TT
                        {...p}
                        render={(x) => (
                          <>
                            <div style={{ fontWeight: 600, color: COLORS.tx }}>{x.full}</div>
                            <div style={{ color: COLORS.t2 }}>Self-report: {x.x}%</div>
                            <div style={{ color: COLORS.t2 }}>
                              {x.n} incidents · {f(x.certs)} certs
                            </div>
                            <div style={{ color: COLORS.t2 }}>{x.y.toFixed(2)} per M certs</div>
                          </>
                        )}
                      />
                    )}
                  />
                  <Scatter data={scatter}>
                    {scatter.map((d, i) => (
                      <Cell key={i} fill={d.x < 30 ? COLORS.rd : d.x < 60 ? COLORS.am : COLORS.gn} fillOpacity={0.7} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </ChartWrap>
            <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 4 }}>
              Dot color: <span style={{ color: COLORS.gn }}>●</span> &gt;60% self-report{' '}
              <span style={{ color: COLORS.am }}>●</span> 30-60% <span style={{ color: COLORS.rd }}>●</span> &lt;30%.
              Dot size reflects issuance volume. All data from Bugzilla CA Certificate Compliance + crt.sh.
            </div>
          </Card>
        );
      })()}

      <div style={{ fontSize: 9, color: COLORS.t3, textAlign: 'center', marginTop: 8 }}>
        Data: Bugzilla CA Certificate Compliance · {d.total} bugs · {d.ca_count} CAs · Pipeline snapshot March 2026
      </div>

      <MethodologyCard>
        <MethodologyItem label="Incident rate (Ops‡)">Cumulative Bugzilla CA Certificate Compliance bugs (2014-present) divided by all-time certificates issued, per million. Lifetime rate, not annual. Uses all-time denominator to match the all-time numerator.</MethodologyItem>
        <MethodologyItem label="Classification">Incident tags (misissuance, revocation delay, etc.) from Bugzilla whiteboard labels and LLM classification of bug summaries. Some bugs may have incomplete or missing tags.</MethodologyItem>
        <MethodologyItem label="Limitation">Only captures publicly-filed Bugzilla incidents. CAs not yet in any trust store rarely file incidents. Higher incident counts may indicate better self-reporting, not worse operations.</MethodologyItem>
      </MethodologyCard>
    </div>
  );
};

export { OpsMap };
export default OpsView;
