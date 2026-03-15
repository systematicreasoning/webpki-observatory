import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { COLORS, FONT_MONO, FONT_SANS } from '../constants';
import { dn, f } from '../helpers';
import { Card, CardTitle, StatCard, ChartWrap, GeoMap, buildPins, TabIntro, MethodologyCard, MethodologyItem } from './shared';
import CADetail from './CADetail';
import { usePipeline } from '../PipelineContext';
import {
  footnoteStyle, statGridStyle, tinyTableStyle,
} from '../styles';

/**
 * GeoView — Geographic Risk tab.
 *
 * Maps CA organizations by jurisdiction. Compares certificate issuance
 * share with CA organization count by region. The divergence between
 * "by issuance" and "by CA count" reveals trust surface efficiency:
 * Europe has 96 CAs but only 10.6% of issuance.
 */
const GeoView = () => {
  const { trustedCAs, geography } = usePipeline();
  const rc = { 'United States': COLORS.ac, Europe: COLORS.cy, 'Asia-Pacific': COLORS.am };
  const totalCAs = geography.reduce((s, r) => s + r.n, 0);
  const [selRegion, setSelRegion] = useState(null);
  const [selCountry, setSelCountry] = useState(null);
  const [regPage, setRegPage] = useState(10);
  const [ctyPage, setCtyPage] = useState(10);
  const regionData = geography.map((r) => ({
    name: r.rg === 'United States' ? 'US' : r.rg === 'Asia-Pacific' ? 'APAC' : r.rg,
    full: r.rg,
    value: r.n,
    fill: rc[r.rg] || COLORS.t3,
  }));
  const countries = [];
  geography.forEach((r) =>
    r.cs.forEach((c) => countries.push({ name: c.c, value: c.n, fill: rc[r.rg] || COLORS.t3, region: r.rg })),
  );
  countries.sort((a, b) => b.value - a.value);
  // Build CA list per region and country — trusted CAs only
  const casByRegion = useMemo(() => {
    const m = {};
    geography.forEach((r) => {
      m[r.rg] = trustedCAs.filter((d) => r.cs.some((c) => c.c === d.country));
    });
    return m;
  }, [trustedCAs]);
  const casByCountry = useMemo(() => {
    const m = {};
    countries.forEach((c) => {
      if (!m[c.name]) m[c.name] = trustedCAs.filter((d) => d.country === c.name);
    });
    return m;
  }, [trustedCAs]);
  return (
    <div>
      <TabIntro quote="Geography is destiny — especially in PKI.">
        Where the world's trusted CAs are headquartered, and how certificate issuance volume distributes across regions and countries. Geographic concentration matters because CA operations are subject to the laws, political pressures, and regulatory regimes of their home jurisdiction. A region that hosts a disproportionate share of issuance becomes a single point of geopolitical risk — sanctions, conflict, or regulatory shifts in one country can ripple across the global WebPKI. This view helps relying parties assess their sovereign exposure and gives CAs context for how their home jurisdiction shapes their risk profile.
      </TabIntro>

      <div
        style={{ ...statGridStyle, gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}
      >
        <StatCard
          l="United States"
          v={`${(geography[0]?.p || 0).toFixed(1)}%`}
          s={`${geography[0]?.n || 0} CAs`}
          c={COLORS.ac}
        />
        <StatCard
          l="Europe"
          v={`${(geography[1]?.p || 0).toFixed(1)}%`}
          s={`${geography[1]?.n || 0} CAs`}
          c={COLORS.cy}
        />
        <StatCard
          l="Asia-Pacific"
          v={`${(geography[2]?.p || 0).toFixed(2)}%`}
          s={`${geography[2]?.n || 0} CAs`}
          c={COLORS.am}
        />
      </div>

      {/* Donut charts: by region and by country */}
      {(() => {
        const RADIAN = Math.PI / 180;
        const lbl = ({ cx, cy, midAngle, innerRadius, outerRadius, value, percent }) => {
          if (percent < 0.06) return null;
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
              fontSize={9}
              fontFamily={FONT_SANS}
            >
              {value}
            </text>
          );
        };
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
            <Card>
              <CardTitle sub="Left: CA count by region. Right: certificate issuance share. Click a segment to see CAs.">
                CAs by Region
              </CardTitle>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 8,
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 8,
                      color: COLORS.t3,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginBottom: 2,
                    }}
                  >
                    By CA Count
                  </div>
                  <ChartWrap height={150}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={regionData}
                          dataKey="value"
                          cx="50%"
                          cy="50%"
                          innerRadius={28}
                          outerRadius={55}
                          paddingAngle={2}
                          label={lbl}
                          labelLine={false}
                          onClick={(_, idx) => {
                            setSelRegion(selRegion === idx ? null : idx);
                            setRegPage(10);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          {regionData.map((d, i) => (
                            <Cell
                              key={i}
                              fill={d.fill}
                              opacity={selRegion === null || selRegion === i ? 0.7 : 0.2}
                              stroke={selRegion === i ? COLORS.tx : 'none'}
                              strokeWidth={selRegion === i ? 2 : 0}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartWrap>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 8,
                      color: COLORS.t3,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginBottom: 2,
                    }}
                  >
                    By Issuance
                  </div>
                  <ChartWrap height={150}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={geography.map((r) => ({
                            name: r.rg === 'United States' ? 'US' : r.rg === 'Asia-Pacific' ? 'APAC' : r.rg,
                            value: Math.max(r.p, 0.3),
                            pct: r.p,
                            fill: rc[r.rg] || COLORS.t3,
                          }))}
                          dataKey="value"
                          cx="50%"
                          cy="50%"
                          innerRadius={28}
                          outerRadius={55}
                          paddingAngle={1}
                          labelLine={false}
                          label={({ cx, cy, midAngle, innerRadius, outerRadius, payload }) => {
                            if (payload.pct < 1) return null;
                            const RADIAN = Math.PI / 180;
                            const r2 = innerRadius + (outerRadius - innerRadius) * 0.5;
                            const x = cx + r2 * Math.cos(-midAngle * RADIAN);
                            const y = cy + r2 * Math.sin(-midAngle * RADIAN);
                            return (
                              <text
                                x={x}
                                y={y}
                                fill={COLORS.tx}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={8}
                                fontFamily={FONT_MONO}
                              >
                                {payload.pct >= 1 ? payload.pct.toFixed(0) + '%' : ''}
                              </text>
                            );
                          }}
                          onClick={(_, idx) => {
                            setSelRegion(selRegion === idx ? null : idx);
                            setRegPage(10);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          {geography.map((r, i) => (
                            <Cell
                              key={i}
                              fill={rc[r.rg] || COLORS.t3}
                              opacity={selRegion === null || selRegion === i ? 0.7 : 0.2}
                              stroke={selRegion === i ? COLORS.tx : 'none'}
                              strokeWidth={selRegion === i ? 2 : 0}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartWrap>
                </div>
                {selRegion !== null &&
                  (() => {
                    const rName = regionData[selRegion].full;
                    const cas = (casByRegion[rName] || []).sort((a, b) => b.certs - a.certs);
                    const shown = cas.slice(0, regPage);
                    return (
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        <div
                          style={{ fontSize: 9, color: regionData[selRegion].fill, fontWeight: 600, marginBottom: 3 }}
                        >
                          {rName} ({cas.length} CAs)
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                        <table
                          style={tinyTableStyle}
                        >
                          <tbody>
                            {shown.map((d) => (
                              <tr key={d.id} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                                <td
                                  style={{
                                    padding: '2px 4px',
                                    color: COLORS.tx,
                                    maxWidth: 90,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {d.caOwner.split(/[\s,]/)[0]}
                                </td>
                                <td
                                  style={{
                                    padding: '2px 4px',
                                    textAlign: 'right',
                                    fontFamily: FONT_MONO,
                                    color: COLORS.t2,
                                    fontSize: 8,
                                  }}
                                >
                                  {f(d.certs)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div> {/* overflow wrapper */}
                        {cas.length > regPage && (
                          <div style={{ textAlign: 'center', marginTop: 3 }}>
                            <button
                              onClick={() => setRegPage((p) => p + 10)}
                              style={{
                                fontSize: 8,
                                color: COLORS.t3,
                                background: 'transparent',
                                border: `1px solid ${COLORS.bd}`,
                                borderRadius: 4,
                                padding: '2px 6px',
                                cursor: 'pointer',
                              }}
                            >
                              +{cas.length - regPage} more
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
              </div>
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
                {regionData.map((d, i) => (
                  <span
                    key={d.name}
                    onClick={() => {
                      setSelRegion(selRegion === i ? null : i);
                      setRegPage(10);
                    }}
                    style={{ cursor: 'pointer', opacity: selRegion === null || selRegion === i ? 1 : 0.4 }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: d.fill,
                        opacity: 0.7,
                        marginRight: 3,
                        verticalAlign: 'middle',
                      }}
                    />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </Card>
            <Card>
              <CardTitle sub="CA organizations by country of jurisdiction. Click a segment to see CAs.">
                CAs by Country
              </CardTitle>
              <div style={{ display: 'grid', gridTemplateColumns: selCountry !== null ? 'repeat(auto-fit, minmax(260px, 1fr))' : '1fr', gap: 12 }}>
                <div>
                  <ChartWrap height={180}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={countries}
                          dataKey="value"
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={70}
                          paddingAngle={1}
                          label={lbl}
                          labelLine={false}
                          onClick={(_, idx) => {
                            setSelCountry(selCountry === idx ? null : idx);
                            setCtyPage(10);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          {countries.map((d, i) => (
                            <Cell
                              key={i}
                              fill={d.fill}
                              opacity={
                                selCountry === null || selCountry === i
                                  ? 0.4 + (0.4 * (countries.length - i)) / countries.length
                                  : 0.15
                              }
                              stroke={selCountry === i ? COLORS.tx : 'none'}
                              strokeWidth={selCountry === i ? 2 : 0}
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
                                <div style={{ color: COLORS.t2 }}>{d.value} CAs</div>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartWrap>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      gap: '4px 8px',
                      fontSize: 8,
                      color: COLORS.t3,
                    }}
                  >
                    {countries.slice(0, 8).map((d, i) => (
                      <span
                        key={d.name}
                        onClick={() => {
                          setSelCountry(selCountry === i ? null : i);
                          setCtyPage(10);
                        }}
                        style={{ cursor: 'pointer', opacity: selCountry === null || selCountry === i ? 1 : 0.4 }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: d.fill,
                            opacity: 0.7,
                            marginRight: 2,
                            verticalAlign: 'middle',
                          }}
                        />
                        {d.name} ({d.value})
                      </span>
                    ))}
                    {countries.length > 8 && <span>+{countries.length - 8} more</span>}
                  </div>
                </div>
                {selCountry !== null &&
                  (() => {
                    const cName = countries[selCountry]?.name;
                    const cas = (casByCountry[cName] || []).sort((a, b) => b.certs - a.certs);
                    const shown = cas.slice(0, ctyPage);
                    return (
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        <div style={{ overflowX: 'auto' }}>
                        <table
                          style={tinyTableStyle}
                        >
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                              {['CA', 'Certs'].map((h) => (
                                <th
                                  key={h}
                                  style={{
                                    padding: '3px 5px',
                                    color: COLORS.t3,
                                    fontSize: 7,
                                    textTransform: 'uppercase',
                                    textAlign: h === 'Certs' ? 'right' : 'left',
                                  }}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {shown.map((d) => (
                              <tr key={d.id} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                                <td
                                  style={{
                                    padding: '2px 5px',
                                    color: COLORS.tx,
                                    maxWidth: 120,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {d.caOwner.split(/[\s,]/)[0]}
                                </td>
                                <td
                                  style={{
                                    padding: '2px 5px',
                                    textAlign: 'right',
                                    fontFamily: FONT_MONO,
                                    color: COLORS.t2,
                                  }}
                                >
                                  {f(d.certs)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div> {/* overflow wrapper */}
                        {cas.length > ctyPage && (
                          <div style={{ textAlign: 'center', marginTop: 4 }}>
                            <button
                              onClick={() => setCtyPage((p) => p + 10)}
                              style={{
                                fontSize: 8,
                                color: COLORS.t3,
                                background: 'transparent',
                                border: `1px solid ${COLORS.bd}`,
                                borderRadius: 4,
                                padding: '2px 6px',
                                cursor: 'pointer',
                              }}
                            >
                              +{cas.length - ctyPage} more
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
              </div>
            </Card>
          </div>
        );
      })()}

      {/* Two proportional bars: one by issuance, one by CA count */}
      <Card>
        <CardTitle sub="Comparing certificate issuance share with CA organization count by region. ">
          Jurisdictional Distribution
        </CardTitle>

        <div style={{ fontSize: 10, color: COLORS.t2, marginBottom: 4 }}>By Certificate Issuance</div>
        <div style={{ height: 32, borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 12 }}>
          {geography.map((r) => {
            const cl = rc[r.rg] || COLORS.t3;
            const w = Math.max(r.p, 0.5);
            return (
              <div
                key={r.rg}
                style={{
                  width: `${w}%`,
                  background: cl,
                  opacity: 0.65,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: r.p > 5 ? 'flex-start' : 'center',
                  paddingLeft: r.p > 5 ? 8 : 0,
                  borderRight: `1px solid ${COLORS.bg}`,
                }}
              >
                {r.p > 3 && (
                  <span style={{ fontSize: r.p > 15 ? 12 : 9, fontWeight: 600, color: COLORS.tx }}>
                    {r.rg === 'United States' ? 'US' : r.rg === 'Asia-Pacific' ? 'APAC' : r.rg}{' '}
                    {r.p >= 1 ? r.p.toFixed(1) : r.p.toFixed(2)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 10, color: COLORS.t2, marginBottom: 4 }}>By CA Organization Count</div>
        <div style={{ height: 32, borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 10 }}>
          {geography.map((r) => {
            const cl = rc[r.rg] || COLORS.t3;
            const w = (r.n / totalCAs) * 100;
            return (
              <div
                key={r.rg}
                style={{
                  width: `${w}%`,
                  background: cl,
                  opacity: 0.65,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: w > 20 ? 'flex-start' : 'center',
                  paddingLeft: w > 20 ? 8 : 0,
                  borderRight: `1px solid ${COLORS.bg}`,
                }}
              >
                {w > 8 && (
                  <span style={{ fontSize: w > 30 ? 12 : 9, fontWeight: 600, color: COLORS.tx }}>
                    {r.rg === 'United States' ? 'US' : r.rg === 'Asia-Pacific' ? 'APAC' : r.rg} {r.n}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 12, fontSize: 9, color: COLORS.t3 }}>
          {geography.map((r) => (
            <span key={r.rg}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: rc[r.rg] || COLORS.t3,
                  opacity: 0.65,
                  marginRight: 3,
                  verticalAlign: 'middle',
                }}
              />
              {r.rg} ({r.n} CAs · {r.p >= 1 ? r.p.toFixed(1) : r.p.toFixed(2)}%)
            </span>
          ))}
        </div>
      </Card>

      {/* Geographic map */}
      <Card>
        <CardTitle sub="Each dot represents a country with at least one CA organization. Dot size reflects certificate issuance volume, color indicates region.">
          Geographic Distribution
        </CardTitle>
        <GeoMap
          height={280}
          pins={useMemo(() => buildPins.geo(geography, rc), [])}
          legend={[
            { color: COLORS.ac, label: 'United States' },
            { color: COLORS.cy, label: 'Europe' },
            { color: COLORS.am, label: 'Asia-Pacific' },
          ]}
        />
      </Card>

      {/* Paired comparison */}
      <Card>
        <CardTitle sub="Paired bars comparing CA organization count with issuance volume per region. ">
          CA Count vs Issuance by Region
        </CardTitle>
        {geography.map((r) => {
          const cl = rc[r.rg] || COLORS.t3;
          const maxN = Math.max(...geography.map((d) => d.n), 0);
          const maxP = Math.max(...geography.map((d) => d.share), 0);
          return (
            <div key={r.rg} style={{ padding: '10px 0', borderBottom: `1px solid ${COLORS.bd}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: cl, fontWeight: 700, width: 100 }}>{r.rg}</span>
                <span style={{ fontSize: 9, color: COLORS.t3, fontFamily: FONT_MONO }}>{r.cs.length} countries</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: COLORS.t2, width: 70, textAlign: 'right' }}>CA Orgs</span>
                <div
                  style={{
                    flex: 1,
                    height: 20,
                    background: COLORS.bg,
                    borderRadius: 4,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(r.n / maxN) * 100}%`,
                      background: cl,
                      opacity: 0.7,
                      borderRadius: 4,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: 8,
                      top: 3,
                      fontSize: 10,
                      color: COLORS.tx,
                      fontFamily: FONT_MONO,
                      fontWeight: 600,
                    }}
                  >
                    {r.n}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 9, color: COLORS.t2, width: 70, textAlign: 'right' }}>Issuance</span>
                <div
                  style={{
                    flex: 1,
                    height: 20,
                    background: COLORS.bg,
                    borderRadius: 4,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(r.p / maxP) * 100}%`,
                      background: cl,
                      opacity: 0.35,
                      borderRadius: 4,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: 8,
                      top: 3,
                      fontSize: 10,
                      color: COLORS.tx,
                      fontFamily: FONT_MONO,
                    }}
                  >
                    {r.p >= 1 ? r.p.toFixed(1) : r.p.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Per-region country breakdowns */}
      {geography.map((r) => (
        <Card key={r.rg}>
          <CardTitle>
            {r.rg}{' '}
            <span style={{ fontWeight: 400, fontSize: 10, color: COLORS.t2, fontFamily: FONT_MONO }}>
              {r.p.toFixed(2)}% · {f(r.v)} certs · {r.n} CAs
            </span>
          </CardTitle>
          {r.cs.map((c) => (
            <div key={c.c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: COLORS.t2, width: 140 }}>{c.c}</span>
              <div style={{ flex: 1, height: 10, background: COLORS.bg, borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min((c.p / r.cs[0].p) * 100, 100)}%`,
                    background: rc[r.rg] || COLORS.ac,
                    opacity: 0.45,
                    borderRadius: 4,
                  }}
                />
              </div>
              <span style={{ fontSize: 9, color: COLORS.t3, fontFamily: FONT_MONO, width: 50, textAlign: 'right' }}>
                {c.p < 0.01 ? '<0.01' : c.p.toFixed(2)}%
              </span>
              <span style={{ fontSize: 9, color: COLORS.t3, fontFamily: FONT_MONO, width: 24, textAlign: 'right' }}>
                {c.n}
              </span>
            </div>
          ))}
        </Card>
      ))}

      <div
        style={footnoteStyle}
      >
        <strong style={{ color: COLORS.t2 }}>Jurisdiction</strong> = country of the CA owner organization as recorded in
        CCADB, not where the CA's servers are located or where its subscribers are. A CA headquartered in Belgium (e.g.,
        GlobalSign) issues certificates used worldwide. <strong style={{ color: COLORS.t2 }}>Issuance share</strong>{' '}
        uses unexpired precertificates from CT logs via crt.sh, attributed to root CA owner. The divergence between CA count and issuance share by region shows where trust surface is concentrated versus distributed. Scope: currently trusted CAs only. Regional groupings and per-country counts are recomputed from the
        trusted CA set at build time.
      </div>

      <MethodologyCard>
        <MethodologyItem label="Jurisdiction">Derived from the CCADB CA Owner country field. Country-to-region mapping uses custom geographic groupings (United States separate, Europe, Asia-Pacific, Americas, Middle East / Africa) reflecting WebPKI concentration patterns rather than UN M49 standard groupings.</MethodologyItem>
        <MethodologyItem label="Government classification">Manually curated structural relationships identify CAs with government ownership or affiliation. "Government-affiliated" includes state-owned, military, and regulatory body CAs.</MethodologyItem>
        <MethodologyItem label="Limitation">Country reflects jurisdiction of incorporation per CCADB — not where infrastructure is operated, where subscribers are located, or where the CA may be subject to legal process. CAs with global operations face multi-jurisdictional exposure not captured here. A CA headquartered in one country may primarily serve another.</MethodologyItem>
      </MethodologyCard>
    </div>
  );
};

export default GeoView;
