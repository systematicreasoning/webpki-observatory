import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { COLORS, STORE_COLORS, FONT_MONO, FONT_SANS } from '../constants';
import { dn, f, fl, getIncidentRate, getWebCoverage } from '../helpers';
import { Card, CardTitle, TrustDots, Badge, RateDot, ChartWrap, GeoMap, buildPins } from './shared';
import CADetail from './CADetail';
import { usePipeline } from '../PipelineContext';
import { expandedCellStyle, scrollXStyle, tableStyle } from '../styles';

const DONUT_COLORS = [
  COLORS.ac,
  '#0ea5e9',
  COLORS.cy,
  '#8b5cf6',
  '#a855f7',
  '#6366f1',
  COLORS.gn,
  '#14b8a6',
  '#f97316',
  '#ec4899',
];

/**
 * MarketView — Market Share tab.
 *
 * Shows the market concentration donut, world map by jurisdiction,
 * and a sortable/filterable table of all CAs ranked by unexpired
 * precertificate count from crt.sh.
 */
const MarketView = () => {
  const { brValidity, browserCoverage, trustedCAs, caData, incidentCounts } = usePipeline();

  const data = trustedCAs;
  const [pageSize, setPageSize] = useState(15);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(null);

  const totalCerts = useMemo(() => data.reduce((sum, d) => sum + d.certs, 0), [data]);

  const filtered = useMemo(() => {
    const query = filter.toLowerCase();
    return query
      ? data.filter((d) => d.caOwner.toLowerCase().includes(query) || d.country.toLowerCase().includes(query))
      : data;
  }, [data, filter]);

  const shown = pageSize === 0 ? filtered : filtered.slice(0, pageSize);

  const PageButtons = ({ onReset }) => (
    <div style={{ display: 'flex', gap: 4 }}>
      {[10, 15, 25, 0].map((n) => (
        <button
          key={n}
          onClick={() => {
            setPageSize(n);
            if (onReset) onReset();
          }}
          style={{
            padding: '4px 8px',
            fontSize: 10,
            borderRadius: 4,
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
  );

  return (
    <div>
      {/* Page size selector (top) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginBottom: 14,
          gap: 8,
        }}
      >
        <PageButtons onReset={() => setExpanded(null)} />
      </div>

      {/* ── Market Concentration Donut ── */}
      <Card>
        <CardTitle sub="Unexpired precertificates by CA owner, sourced from Certificate Transparency logs via crt.sh. ">
          Market Concentration
        </CardTitle>

        {(() => {
          const topN = data.slice(0, 10).map((d, i) => ({
            name: dn(d.caOwner),
            value: d.certs,
            pct: ((d.certs / totalCerts) * 100).toFixed(1),
            fill: DONUT_COLORS[i % DONUT_COLORS.length],
          }));
          const otherValue = data.slice(10).reduce((sum, d) => sum + d.certs, 0);
          const otherPct = ((otherValue / totalCerts) * 100).toFixed(1);
          const donutData = [
            ...topN,
            { name: `Other (${data.length - 10})`, value: otherValue, pct: otherPct, fill: COLORS.t3 },
          ];
          const top3Pct = ((data.slice(0, 3).reduce((sum, d) => sum + d.certs, 0) / totalCerts) * 100).toFixed(0);

          return (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
                <div style={{ flex: '0 1 400px', minWidth: 280, maxWidth: 400 }}>
                  <ChartWrap height={280}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="55%"
                          outerRadius="85%"
                          paddingAngle={0.5}
                          stroke="none"
                          strokeWidth={0}
                        >
                          {donutData.map((d, i) => (
                            <Cell key={i} fill={d.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={(p) => {
                            const d = p?.payload?.[0]?.payload;
                            if (!d) return null;
                            return (
                              <div
                                style={{
                                  background: COLORS.s1,
                                  border: `1px solid ${COLORS.bd}`,
                                  borderRadius: 6,
                                  padding: '8px 12px',
                                  fontSize: 11,
                                }}
                              >
                                <div style={{ fontWeight: 600, color: COLORS.tx }}>{d.name}</div>
                                <div style={{ color: COLORS.t2 }}>
                                  {fl(d.value)} certificates ({d.pct}%)
                                </div>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartWrap>
                </div>

                {/* Legend */}
                <div style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {donutData.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: d.fill, flexShrink: 0 }} />
                      <span
                        style={{
                          color: COLORS.t2,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {d.name}
                      </span>
                      <span style={{ fontFamily: FONT_MONO, color: COLORS.tx, fontSize: 9 }}>{d.pct}%</span>
                    </div>
                  ))}
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 9,
                      color: COLORS.t3,
                      borderTop: `1px solid ${COLORS.bd}`,
                      paddingTop: 6,
                    }}
                  >
                    Top 3 CAs control {top3Pct}% of all certificates
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </Card>

      {/* ── Market share world map ── */}
      <Card>
        <CardTitle sub="Dot size represents certificate issuance volume. Jurisdiction is derived from CCADB CA owner metadata.">
          CA Issuance by Jurisdiction
        </CardTitle>
        <GeoMap
          height={260}
          pins={useMemo(() => buildPins.market(shown), [shown])}
          legend={[{ color: COLORS.ac, label: 'Dot size = issuance volume' }]}
        />
      </Card>

      {/* ── Filter and page controls ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter CAs..."
          style={{
            background: COLORS.bg,
            border: `1px solid ${COLORS.bd}`,
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 11,
            color: COLORS.tx,
            fontFamily: FONT_SANS,
            width: 200,
            outline: 'none',
          }}
        />
        <PageButtons onReset={() => setExpanded(null)} />
      </div>

      {/* ── CA Table ── */}
      <div style={scrollXStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
              {[
                ['#', 'Rank by issuance volume'],
                ['CA Owner', 'Organization operating the CA, from CCADB'],
                ['Trust', 'Root store inclusion: Mozilla, Chrome, Microsoft, Apple'],
                ['Certificates', 'Unexpired precertificates from CT logs'],
                ['Share', 'Percentage of all unexpired precertificates'],
                ['Cumul.', 'Cumulative share up to this rank'],
                ['Usage†', 'Average certificate usage period in days (see footnote)'],
                ['Ops‡', 'Incident rate per million certificates (see footnote)'],
                ['Country', 'Jurisdiction from CCADB CA Owner metadata'],
                ['Capabilities', 'Certificate types this CA can issue'],
              ].map(([header, tip], i) => (
                <th
                  key={header}
                  title={tip}
                  style={{
                    padding: '7px 5px',
                    color: COLORS.t3,
                    fontWeight: 500,
                    fontSize: 9,
                    textAlign: [0, 3, 4, 5, 6].includes(i) ? 'right' : [2, 7, 9].includes(i) ? 'center' : 'left',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    cursor: 'help',
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {shown.map((d) => {
              const sharePct = (d.certs / totalCerts) * 100;
              let cumulative = 0;
              for (let j = 0; j <= filtered.indexOf(d); j++) {
                cumulative += (filtered[j].certs / totalCerts) * 100;
              }
              const isExp = expanded === d.rank;
              const rate = getIncidentRate(incidentCounts, d.id, d.certs, d.allTimeCerts);
              const webCov = getWebCoverage(d.trustedBy, d.parent, trustedCAs, browserCoverage);

              return (
                <React.Fragment key={d.rank}>
                  <tr
                    style={{
                      borderBottom: `1px solid ${COLORS.bd}`,
                      transition: 'background 0.1s',
                      cursor: 'pointer',
                      background: isExp ? COLORS.s2 : 'transparent',
                    }}
                    onClick={() => setExpanded(isExp ? null : d.rank)}
                    onMouseEnter={(e) => {
                      if (!isExp) e.currentTarget.style.background = COLORS.s2;
                    }}
                    onMouseLeave={(e) => {
                      if (!isExp) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <td
                      style={{
                        padding: '6px 5px',
                        textAlign: 'right',
                        color: COLORS.t3,
                        fontFamily: FONT_MONO,
                        fontSize: 9,
                      }}
                    >
                      {d.rank}
                    </td>
                    <td style={{ padding: '6px 5px', color: COLORS.tx, fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 9, color: isExp ? COLORS.ac : COLORS.t3, marginRight: 2 }}>
                          {isExp ? '▼' : '▶'}
                        </span>
                        <span
                          title={d.caOwner}
                          style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {dn(d.caOwner)}
                        </span>
                        {!d.matched && !d.inferred && !d.parent && (
                          <span
                            style={{
                              fontSize: 7,
                              padding: '1px 3px',
                              borderRadius: 2,
                              background: 'rgba(245,158,11,0.1)',
                              color: COLORS.am,
                            }}
                            title="CA owner name from crt.sh did not match any CCADB CA Owner record"
                          >
                            ?
                          </span>
                        )}
                        {d.parent && (
                          <span
                            style={{
                              fontSize: 7,
                              padding: '1px 3px',
                              borderRadius: 2,
                              background: 'rgba(6,182,212,0.1)',
                              color: COLORS.cy,
                            }}
                            title={`Externally-operated subordinate CA under ${d.parent}`}
                          >
                            via {d.parent}
                          </span>
                        )}
                        {d.issuanceCaveat && d.storeCount >= 4 && d.certs < 1000000 && (
                          <span
                            style={{
                              fontSize: 7,
                              padding: '1px 3px',
                              borderRadius: 2,
                              background: 'rgba(245,158,11,0.1)',
                              color: COLORS.am,
                            }}
                            title={
                              d.note ||
                              'Issuance data may be incomplete due to cross-signed certificate chain attribution'
                            }
                          >
                            ⚠
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '6px 5px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <TrustDots tb={d.trustedBy} />
                        <span style={{ fontSize: 8, color: COLORS.t3, fontFamily: FONT_MONO }}>
                          {(webCov * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '6px 5px',
                        textAlign: 'right',
                        color: COLORS.tx,
                        fontFamily: FONT_MONO,
                        fontSize: 10,
                      }}
                    >
                      {fl(d.certs)}
                    </td>
                    <td style={{ padding: '6px 5px', textAlign: 'right', fontFamily: FONT_MONO, fontSize: 10 }}>
                      <span style={{ color: sharePct > 10 ? COLORS.ac : sharePct > 1 ? COLORS.cy : COLORS.t2 }}>
                        {sharePct.toFixed(2)}%
                      </span>
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
                      {cumulative.toFixed(2)}%
                    </td>
                    <td style={{ padding: '6px 5px', textAlign: 'right', fontFamily: FONT_MONO, fontSize: 9 }}>
                      <span
                        style={{
                          color:
                            d.avgMonths && d.avgMonths < 15
                              ? COLORS.gn
                              : d.avgMonths && d.avgMonths < 50
                                ? COLORS.t2
                                : COLORS.am,
                        }}
                        title={`${d.avgDays || '?'}d avg · ${d.avgMonths || '?'}% of ${brValidity[0].days}d BR max`}
                      >
                        {d.avgDays ? d.avgDays + 'd' : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 5px', textAlign: 'center' }}>
                      <RateDot ppm={rate?.ppm ?? null} />
                    </td>
                    <td
                      style={{
                        padding: '6px 5px',
                        color: COLORS.t2,
                        fontSize: 10,
                        maxWidth: 90,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={d.country}
                    >
                      {d.country || '—'}
                    </td>
                    <td style={{ padding: '6px 5px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', gap: 2 }}>
                        <Badge on={d.tls} l="TLS" inf={d.inferred} />
                        <Badge on={d.ev} l="EV" inf={d.inferred} />
                        <Badge on={d.smime} l="S/MIME" inf={d.inferred} />
                        <Badge on={d.codeSigning} l="CS" inf={d.inferred} />
                      </span>
                    </td>
                  </tr>
                  {isExp && (
                    <tr>
                      <td colSpan={10} style={expandedCellStyle}>
                        <CADetail d={d} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Inferred note */}
      {data.some((d) => d.inferred) && (
        <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 8 }}>
          * Inferred from parent CA. May be further constrained by intermediate certificate EKU.
        </div>
      )}

      {/* ── Footnotes ── */}
      <div
        style={{
          fontSize: 8,
          color: COLORS.t3,
          marginTop: 6,
          lineHeight: 1.6,
          borderTop: `1px solid ${COLORS.bd}`,
          paddingTop: 6,
        }}
      >
        <div>
          † <strong style={{ color: COLORS.t2 }}>Avg Usage Period</strong> = estimated average time a certificate
          remains in active use before replacement (365 / turnover ratio). Not the validity period on the certificate.
          E.g. Let's Encrypt issues 90-day certs but avg usage is ~22 days due to 60-day auto-renewal. BR max validity
          is currently {brValidity[0].days} days, dropping to {brValidity[1].days}d on {brValidity[1].from}.
        </div>
        <div style={{ marginTop: 3 }}>
          ‡ <strong style={{ color: COLORS.t2 }}>Ops Rate</strong> = cumulative incidents per million all-time
          certificates (Bugzilla CA Certificate Compliance).{' '}
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: COLORS.gn,
              verticalAlign: 'middle',
            }}
          />{' '}
          &lt;10/M{' '}
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: COLORS.am,
              verticalAlign: 'middle',
              marginLeft: 4,
            }}
          />{' '}
          10-1K/M{' '}
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: COLORS.rd,
              verticalAlign: 'middle',
              marginLeft: 4,
            }}
          />{' '}
          &gt;1K/M{' '}
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: COLORS.bd,
              verticalAlign: 'middle',
              marginLeft: 4,
            }}
          />{' '}
          no data. High rates for low-issuance CAs reflect small denominators. Green includes CAs with zero known
          incidents.
        </div>
        <div style={{ marginTop: 3 }}>
          ? = CA owner name from crt.sh did not match any CCADB CA Owner record. Typically an externally-operated
          subordinate CA, legacy issuer, or naming inconsistency.
        </div>
        <div style={{ marginTop: 3 }}>
          Trust column:{' '}
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: STORE_COLORS.mozilla,
              verticalAlign: 'middle',
            }}
          />{' '}
          Mozilla{' '}
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: STORE_COLORS.chrome,
              verticalAlign: 'middle',
              marginLeft: 6,
            }}
          />{' '}
          Chrome{' '}
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: STORE_COLORS.microsoft,
              verticalAlign: 'middle',
              marginLeft: 6,
            }}
          />{' '}
          Microsoft{' '}
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: STORE_COLORS.apple,
              verticalAlign: 'middle',
              marginLeft: 6,
            }}
          />{' '}
          Apple. Hollow dot = not included. Percentage = estimated web browser coverage.
        </div>
        <div style={{ marginTop: 3 }}>
          Certificate counts from crt.sh (CT logs, grouped by Root Owner). CA metadata from CCADB. Bar chart scale
          reflects extreme concentration; tail CAs appear as zero-width bars. Click any row for details.
        </div>
        <div style={{ marginTop: 3 }}>
          ⚠ crt.sh attributes certificates to the owner of the root they chain to, not the operating CA. CAs that issue
          through cross-signed intermediates under another CA's root (e.g. Amazon ACM issuing through Starfield/GoDaddy
          roots) will appear undercounted, with their volume attributed to the root owner. CAs marked with ⚠ have known
          attribution gaps.
        </div>
      </div>
    </div>
  );
};

export default MarketView;
