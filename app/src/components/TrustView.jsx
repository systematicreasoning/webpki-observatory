import React, { useState, useMemo } from 'react';
import { COLORS, STORE_COLORS, FONT_MONO, FONT_SANS } from '../constants';
import { dn, f, fl, getIncidentRate } from '../helpers';
import { Card, CardTitle, StatCard, TrustDots, RateDot, GeoMap, Paginator, buildPins, TabIntro, MethodologyCard, MethodologyItem } from './shared';
import RootExpirationTimeline from './TrustExpiration';
import RootExpirationHeatmap from './TrustHeatmap';
import { usePipeline } from '../PipelineContext';
import {
  cardHeaderStyle, compactTableStyle, scrollXStyle, statGridStyle, tableStyle,
} from '../styles';

const now = new Date();

const STORE_NAMES = { mozilla: 'Mozilla', chrome: 'Chrome', apple: 'Apple', microsoft: 'Microsoft' };
const ALL_STORES = ['mozilla', 'chrome', 'apple', 'microsoft'];

/**
 * TrustDisagreements — Data-driven trust store divergence table.
 *
 * Replaces the hardcoded 7-entry list. Computes disagreements dynamically
 * from caData: any CA with trust_store_count between 1 and 3 is a
 * disagreement. Sorted by web coverage gap (most impactful first).
 * Uses browserCoverage to compute what % of the web each missing store
 * represents.
 */
const TrustDisagreements = ({ caData, browserCoverage }) => {
  const [pageSize, setPageSize] = useState(10);

  const disagreements = useMemo(() => {
    return caData
      .filter((ca) => ca.storeCount > 0 && ca.storeCount < 4)
      .map((ca) => {
        const tb = ca.trustedBy || {};
        const inStores = ALL_STORES.filter((s) => tb[s]);
        const missing = ALL_STORES.filter((s) => !tb[s]);

        // Web coverage the CA can reach
        let reachable = 0;
        inStores.forEach((s) => { reachable += browserCoverage[s] || 0; });

        // Web coverage gap from missing stores
        let gap = 0;
        missing.forEach((s) => { gap += browserCoverage[s] || 0; });

        // Severity: missing chrome is catastrophic, missing only microsoft is negligible
        const missingChrome = missing.includes('chrome');
        const missingApple = missing.includes('apple');
        const onlyMsft = inStores.length === 1 && inStores[0] === 'microsoft';

        return {
          ca: ca.caOwner,
          certs: ca.certs || 0,
          country: ca.country || '',
          inStores,
          missing,
          reachable,
          gap,
          storeCount: ca.storeCount,
          missingChrome,
          missingApple,
          onlyMsft,
        };
      })
      .sort((a, b) => {
        // Sort: highest gap first, then by certs within same gap tier
        if (Math.abs(a.gap - b.gap) > 0.01) return b.gap - a.gap;
        return b.certs - a.certs;
      });
  }, [caData, browserCoverage]);

  const shown = pageSize === 0 ? disagreements : disagreements.slice(0, pageSize);
  const withCerts = disagreements.filter((d) => d.certs > 0);
  const msftOnly = disagreements.filter((d) => d.onlyMsft);

  return (
    <Card>
      <div style={{ ...cardHeaderStyle, marginBottom: 10 }}>
        <CardTitle sub={`${disagreements.length} CAs are trusted by some but not all root programs. ${withCerts.length} have active certificate issuance. ${msftOnly.length} are Microsoft-only. Sorted by web coverage gap.`}>
          Trust Store Disagreements
        </CardTitle>
        <Paginator count={pageSize} setCount={setPageSize} options={[10, 25, 0]} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={compactTableStyle}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
              {['CA', 'Country', 'Certs', 'In', 'Missing', 'Web Gap'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: '5px 6px',
                    color: COLORS.t3,
                    fontSize: 8,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    textAlign: i >= 2 ? 'right' : 'left',
                    fontFamily: FONT_MONO,
                    fontWeight: 500,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.ca} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                <td
                  style={{
                    padding: '5px 6px',
                    color: COLORS.tx,
                    fontWeight: 500,
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={d.ca}
                >
                  {dn(d.ca)}
                </td>
                <td style={{ padding: '5px 6px', color: COLORS.t3, fontSize: 9 }}>{d.country}</td>
                <td
                  style={{
                    padding: '5px 6px',
                    textAlign: 'right',
                    fontFamily: FONT_MONO,
                    fontSize: 9,
                    color: d.certs > 0 ? COLORS.t2 : COLORS.t3,
                  }}
                >
                  {d.certs > 0 ? f(d.certs) : '—'}
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    {d.inStores.map((s) => (
                      <span
                        key={s}
                        title={STORE_NAMES[s]}
                        style={{
                          display: 'inline-block',
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: STORE_COLORS[s],
                        }}
                      />
                    ))}
                  </span>
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    {d.missing.map((s) => (
                      <span
                        key={s}
                        title={`Missing: ${STORE_NAMES[s]}`}
                        style={{
                          display: 'inline-block',
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          border: `1.5px dashed ${STORE_COLORS[s]}`,
                        }}
                      />
                    ))}
                  </span>
                </td>
                <td
                  style={{
                    padding: '5px 6px',
                    textAlign: 'right',
                    fontFamily: FONT_MONO,
                    fontSize: 9,
                    fontWeight: 600,
                    color:
                      d.gap > 0.5
                        ? COLORS.rd
                        : d.gap > 0.1
                          ? COLORS.am
                          : COLORS.t3,
                  }}
                >
                  {(d.gap * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 14, fontSize: 9, color: COLORS.t3, marginTop: 8 }}>
        {ALL_STORES.map((s) => (
          <span key={s}>
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: STORE_COLORS[s],
                marginRight: 3,
                verticalAlign: 'middle',
              }}
            />
            {STORE_NAMES[s]}
          </span>
        ))}
        <span style={{ marginLeft: 8 }}>
          <span
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              border: `1.5px dashed ${COLORS.t3}`,
              marginRight: 3,
              verticalAlign: 'middle',
            }}
          />
          Missing
        </span>
      </div>

      <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 6, lineHeight: 1.5 }}>
        Web Gap = browser market share using the missing root program(s), based on StatCounter data.
        Missing Chrome ({(browserCoverage.chrome * 100).toFixed(0)}% gap) is the most impactful single-store
        exclusion. Missing only Microsoft ({'<'}1% gap) has negligible web impact but affects Windows
        enterprise and non-browser TLS. Solid dots = trusted. Dashed = not included.
      </div>
    </Card>
  );
};

/**
 * TrustView — Trust Surface tab.
 *
 * Analyzes root store intersection patterns, per-store comparison metrics,
 * trust surface geography, root expiration timeline with heatmap,
 * capability distribution, subscriber impact by store combination,
 * and notable trust store disagreements between the four major programs.
 */
const TrustView = () => {
  const { browserCoverage, caData, incidentCounts, intersections, roots } = usePipeline();
  const [heatmapCount, setHeatmapCount] = useState(15);
  const so = ['Mozilla', 'Chrome', 'Apple', 'Microsoft'];
  return (
    <div>
      <TabIntro quote="A certificate is only as trusted as the root program that includes it.">
        The four major root programs — Chrome, Mozilla, Apple, and Microsoft — each make independent inclusion decisions. When they disagree, some CAs end up trusted by certain browsers but not others, creating coverage gaps and inconsistent security postures across the ecosystem. This tab maps every root certificate intersection, tracks inclusion timelines, and highlights the CAs caught in the gaps. Relying parties can assess whether their CA choice delivers consistent cross-browser trust, and CAs can see exactly where their store coverage falls short.
      </TabIntro>

      <div
        style={statGridStyle}
      >
        <StatCard l="CAs in All 4 Stores" v={intersections.allFourStores.owners} s="CA owners" c={COLORS.gn} />
        <StatCard l="Roots in All 4 Stores" v={intersections.allFourStores.roots} s={`of ${intersections.totalRoots} total`} />
        <StatCard l="Trusted CAs" v={intersections.activeOwners} c={COLORS.ac} />
        <StatCard l="Total Included Roots" v={intersections.totalRoots} />
      </div>
      <Card>
        <CardTitle
          sub={`${intersections.allFourStores.roots} roots from ${intersections.allFourStores.owners} CA owners appear in all 4 stores. ${intersections.rootCombinations[0].count} roots are Microsoft-only. Bars show how many roots each store combination shares.`}
        >
          Root Certificate Intersections
        </CardTitle>
        {(() => {
          const maxCount = Math.max(...intersections.rootCombinations.map((c) => c.count));
          return intersections.rootCombinations.map((c, i) => {
          const lb = c.s.join(' ∩ ');
          const a4 = c.stores.length === 4;
          const one = c.stores.length === 1;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span
                title={lb}
                style={{
                  fontSize: 9,
                  color: a4 ? COLORS.gn : COLORS.t2,
                  width: 220,
                  flexShrink: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: a4 ? 600 : 400,
                  textAlign: 'right',
                }}
              >
                {lb}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 18,
                  background: COLORS.bg,
                  borderRadius: 4,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${(c.count / maxCount) * 100}%`,
                    background: a4 ? COLORS.gn : one ? COLORS.t3 : COLORS.cy,
                    opacity: a4 ? 0.7 : 0.45,
                    borderRadius: 4,
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    left: 6,
                    top: 2,
                    fontSize: 9,
                    color: COLORS.tx,
                    fontFamily: FONT_MONO,
                    fontWeight: 500,
                  }}
                >
                  {c.count}
                </span>
              </div>
            </div>
          );
        });
        })()}
      </Card>
      <Card>
        <CardTitle sub="Sorted by root count. Web Share = browser market share using this root program (StatCounter). Cert Coverage = percentage of all certificates issued by CAs in this store.">
          Root Store Comparison
        </CardTitle>
        {(() => {
          const minR = Math.min(...Object.values(intersections.perStore).map((d) => d.roots), Infinity);
          const stores = Object.entries(intersections.perStore)
            .map(([s, d]) => {
              const storeCas = caData.filter((ca) => ca.storeCount > 0 && ca.trustedBy[s.toLowerCase()]);
              let totalInc = 0,
                totalV = 0;
              storeCas.forEach((ca) => {
                const r = getIncidentRate(incidentCounts, ca.id, ca.certs, ca.allTimeCerts);
                if (r) {
                  totalInc += r.n;
                  totalV += ca.allTimeCerts || ca.certs;
                }
              });
              const weightedRate = totalV > 0 ? (totalInc / totalV) * 1e6 : null;
              const storeCerts = storeCas.reduce((sum, ca) => sum + (ca.certs || 0), 0);
              const totalCerts = caData.reduce((sum, x) => sum + (x.certs || 0), 0);
              const certCov = totalCerts > 0 ? storeCerts / totalCerts : 0;
              return {
                s,
                r: d.roots,
                o: d.owners,
                rpo: (d.roots / d.owners).toFixed(1),
                delta: d.roots - minR,
                avgOps: weightedRate,
                webShare: browserCoverage[s.toLowerCase()] || 0,
                certCov,
              };
            })
            .sort((a, b) => b.r - a.r);
          const maxR = stores[0].r;
          return (
            <div>
              <div style={scrollXStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                      {[
                        ['Store', 'Root program operator'],
                        ['Roots', 'Total root certificates in this store'],
                        ['Owners', 'Distinct CA organizations in this store'],
                        ['Roots / Owner', 'Average root certificates per CA organization'],
                        ['Delta', 'Root count difference from Chrome (smallest store)'],
                        ['Web Share', 'Browser market share using this root program (StatCounter)'],
                        ['Cert Coverage', 'Percentage of all unexpired certificates issued by CAs in this store'],
                        ['Portfolio Ops‡', 'Weighted incident rate across all CAs in this store (per million certs)'],
                      ].map(([h, tip], i) => (
                        <th
                          key={h}
                          title={tip}
                          style={{
                            padding: '7px 6px',
                            color: COLORS.t3,
                            fontWeight: 500,
                            fontSize: 9,
                            textAlign: i > 1 ? 'right' : 'left',
                            letterSpacing: '0.03em',
                            textTransform: 'uppercase',
                            cursor: 'help',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((st) => {
                      const c = STORE_COLORS[st.s.toLowerCase()];
                      return (
                        <tr key={st.s} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                          <td style={{ padding: '7px 6px' }}>
                            <span style={{ color: c, fontWeight: 600 }}>{st.s}</span>
                          </td>
                          <td style={{ padding: '7px 6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  flex: 1,
                                  height: 8,
                                  background: COLORS.bg,
                                  borderRadius: 4,
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${(st.r / maxR) * 100}%`,
                                    background: c,
                                    opacity: 0.6,
                                    borderRadius: 4,
                                  }}
                                />
                              </div>
                              <span
                                style={{
                                  fontFamily: FONT_MONO,
                                  fontSize: 11,
                                  color: COLORS.tx,
                                  fontWeight: 500,
                                  minWidth: 30,
                                  textAlign: 'right',
                                }}
                              >
                                {st.r}
                              </span>
                            </div>
                          </td>
                          <td
                            style={{
                              padding: '7px 6px',
                              textAlign: 'right',
                              fontFamily: FONT_MONO,
                              fontSize: 11,
                              color: COLORS.t2,
                            }}
                          >
                            {st.o}
                          </td>
                          <td
                            style={{
                              padding: '7px 6px',
                              textAlign: 'right',
                              fontFamily: FONT_MONO,
                              fontSize: 11,
                              color: st.rpo > 3 ? COLORS.am : COLORS.t2,
                            }}
                          >
                            {st.rpo}
                          </td>
                          <td
                            style={{
                              padding: '7px 6px',
                              textAlign: 'right',
                              fontFamily: FONT_MONO,
                              fontSize: 11,
                              color: st.delta > 100 ? COLORS.rd : st.delta > 30 ? COLORS.am : COLORS.t3,
                            }}
                          >
                            {st.delta > 0 ? `+${st.delta}` : '—'}
                          </td>
                          <td
                            style={{
                              padding: '7px 6px',
                              textAlign: 'right',
                              fontFamily: FONT_MONO,
                              fontSize: 11,
                              color: st.webShare > 0.5 ? COLORS.gn : st.webShare > 0.1 ? COLORS.t2 : COLORS.t3,
                            }}
                          >
                            {(st.webShare * 100).toFixed(1)}%
                          </td>
                          <td
                            style={{
                              padding: '7px 6px',
                              textAlign: 'right',
                              fontFamily: FONT_MONO,
                              fontSize: 11,
                              color: COLORS.gn,
                            }}
                          >
                            {(st.certCov * 100).toFixed(2)}%
                          </td>
                          <td style={{ padding: '7px 6px', textAlign: 'right' }}>
                            {st.avgOps !== null ? (
                              <span style={{ fontFamily: FONT_MONO, fontSize: 11 }}>
                                <RateDot ppm={st.avgOps} size={6} />{' '}
                                <span
                                  style={{
                                    color: st.avgOps > 100 ? COLORS.rd : st.avgOps > 1 ? COLORS.am : COLORS.gn,
                                    marginLeft: 3,
                                  }}
                                >
                                  {st.avgOps.toFixed(1)}
                                </span>
                              </span>
                            ) : (
                              <span style={{ color: COLORS.t3, fontSize: 10 }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </Card>
      <Card>
        <CardTitle sub="CAs by jurisdiction. Dot color = maximum trust store breadth. Dot size = root certificate count.">
          Trust Surface by Jurisdiction
        </CardTitle>
        <GeoMap
          height={260}
          pins={useMemo(() => buildPins.trust(caData.filter((d) => d.storeCount > 0)), [caData])}
          legend={[
            { color: COLORS.gn, label: 'All 4 stores' },
            { color: COLORS.am, label: '3 stores' },
            { color: COLORS.t2, label: '1–2 stores' },
          ]}
        />
      </Card>


      {/* Root Expiration Timeline */}
      <RootExpirationTimeline roots={roots} caData={caData} />

      {/* Root Expiration Heatmap */}
      <RootExpirationHeatmap roots={roots} caData={caData} heatmapCount={heatmapCount} setHeatmapCount={setHeatmapCount} />


      {/* Capability Distribution */}
      {(() => {
        const matched = caData.filter((d) => d.matched && (d.storeCount > 0 || d.parent));
        const totalCAs = matched.length;
        const totalCerts = matched.reduce((s, d) => s + d.certs, 0);
        const caps = [
          { k: 'tls', l: 'TLS', c: COLORS.ac },
          { k: 'ev', l: 'EV', c: COLORS.pu },
          { k: 'smime', l: 'S/MIME', c: COLORS.cy },
          { k: 'codeSigning', l: 'Code Signing', c: COLORS.am },
        ];
        const capData = caps.map((cap) => {
          const cas = matched.filter((d) => d[cap.k]);
          const certs = cas.reduce((s, d) => s + d.certs, 0);
          return {
            ...cap,
            n: cas.length,
            pct: ((cas.length / totalCAs) * 100).toFixed(0),
            certs,
            certPct: ((certs / totalCerts) * 100).toFixed(1),
          };
        });
        // Full capability count
        const full = matched.filter((d) => d.tls && d.ev && d.smime && d.codeSigning).length;
        return (
          <Card>
            <CardTitle sub="What certificate types each CA is authorized to issue, and how much of total issuance each capability represents. ">
              Capability Distribution
            </CardTitle>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))',
                gap: 12,
                marginBottom: 16,
              }}
            >
              {capData.map((cap) => (
                <div
                  key={cap.k}
                  style={{
                    background: COLORS.bg,
                    borderRadius: 6,
                    padding: '10px 12px',
                    border: `1px solid ${COLORS.bd}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      color: COLORS.t3,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: 4,
                    }}
                  >
                    {cap.l}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: cap.c, fontFamily: FONT_MONO }}>{cap.n}</span>
                    <span style={{ fontSize: 9, color: COLORS.t3 }}>CAs ({cap.pct}%)</span>
                  </div>
                  <div style={{ fontSize: 9, color: COLORS.t2, marginTop: 2 }}>{cap.certPct}% of certificates</div>
                </div>
              ))}
            </div>
            {/* Paired bars: CA count vs cert share */}
            {capData.map((cap) => (
              <div key={cap.k} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ width: 80, fontSize: 10, color: cap.c, fontWeight: 500 }}>{cap.l}</span>
                  <span style={{ fontSize: 8, color: COLORS.t3, width: 50 }}>{cap.n} CAs</span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 8, color: COLORS.t3, width: 50 }}>CAs</span>
                  <div style={{ flex: 1, height: 10, background: COLORS.bg, borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(cap.n / totalCAs) * 100}%`,
                        background: cap.c,
                        opacity: 0.6,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 8, color: COLORS.t3, fontFamily: FONT_MONO, width: 30, textAlign: 'right' }}>
                    {cap.pct}%
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 8, color: COLORS.t3, width: 50 }}>Certs</span>
                  <div style={{ flex: 1, height: 10, background: COLORS.bg, borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${parseFloat(cap.certPct)}%`,
                        background: cap.c,
                        opacity: 0.35,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 8, color: COLORS.t3, fontFamily: FONT_MONO, width: 30, textAlign: 'right' }}>
                    {cap.certPct}%
                  </span>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 8 }}>
              {full} of {totalCAs} CAs ({((full / totalCAs) * 100).toFixed(0)}%) carry all four capability types.
              Capability data from CCADB CA Owner metadata; inferred capabilities marked with * in Market Share table.
            </div>
          </Card>
        );
      })()}

      {/* Store Divergence: Subscriber Impact by Store Combination */}
      <Card>
        <CardTitle sub="What each trust store combination means for web browser coverage based on StatCounter market share data. ">
          Subscriber Impact by Store Combination
        </CardTitle>
        {[
          { combo: 'All 4 stores', stores: ['mozilla', 'chrome', 'microsoft', 'apple'], count: intersections.allFourStores.owners },
          {
            combo: 'Chrome + Apple + Mozilla',
            stores: ['mozilla', 'chrome', 'apple'],
            count:
              intersections.ownerCombinations.find(
                (c) => c.stores.length === 3 && c.stores.includes('Apple') && c.stores.includes('Chrome') && c.stores.includes('Mozilla'),
              )?.count || 1,
          },
          {
            combo: 'Chrome + Microsoft + Mozilla',
            stores: ['mozilla', 'chrome', 'microsoft'],
            count:
              intersections.ownerCombinations.find(
                (c) =>
                  c.stores.length === 3 && c.stores.includes('Chrome') && c.stores.includes('Microsoft') && c.stores.includes('Mozilla'),
              )?.count || 6,
          },
          {
            combo: 'Mozilla + Microsoft',
            stores: ['mozilla', 'microsoft'],
            count:
              intersections.ownerCombinations.find((c) => c.stores.length === 2 && c.stores.includes('Microsoft') && c.stores.includes('Mozilla'))
                ?.count || 4,
          },
          {
            combo: 'Microsoft only',
            stores: ['microsoft'],
            count: intersections.ownerCombinations.find((c) => c.stores.length === 1 && c.stores[0] === 'Microsoft')?.count || 37,
          },
          {
            combo: 'Mozilla only',
            stores: ['mozilla'],
            count: intersections.ownerCombinations.find((c) => c.stores.length === 1 && c.stores[0] === 'Mozilla')?.count || 2,
          },
        ].map((row) => {
          const coverage = row.stores.reduce((s, st) => s + browserCoverage[st], 0);
          const covPct = Math.min(coverage * 100, 100);
          return (
            <div key={row.combo} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 200, fontSize: 10, color: COLORS.t2, flexShrink: 0 }}>{row.combo}</span>
              <div
                style={{
                  flex: 1,
                  height: 22,
                  background: COLORS.bg,
                  borderRadius: 4,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${covPct}%`,
                    background: covPct > 90 ? COLORS.gn : covPct > 50 ? COLORS.am : covPct > 5 ? COLORS.t3 : COLORS.rd,
                    opacity: 0.5,
                    borderRadius: 4,
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    left: 8,
                    top: 4,
                    fontSize: 9,
                    color: COLORS.tx,
                    fontFamily: FONT_MONO,
                  }}
                >
                  {covPct.toFixed(1)}% web coverage
                </span>
              </div>
              <span
                style={{
                  fontSize: 9,
                  color: COLORS.t3,
                  fontFamily: FONT_MONO,
                  width: 50,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                {row.count} CAs
              </span>
            </div>
          );
        })}
        <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 6 }}>
          Web coverage from StatCounter (global all-platforms): Chrome ~{(browserCoverage.chrome * 100).toFixed(0)}% (includes Edge, Samsung
          Internet, Opera), Apple ~{(browserCoverage.apple * 100).toFixed(0)}%, Mozilla ~{(browserCoverage.mozilla * 100).toFixed(1)}%, Microsoft {'<'}{Math.max(0.5, (browserCoverage.microsoft * 100)).toFixed(1)}%.
        </div>
      </Card>

      {/* Notable Trust Store Disagreements — data-driven from caData */}
      <TrustDisagreements caData={caData} browserCoverage={browserCoverage} />

      <MethodologyCard>
        <MethodologyItem label="Trust stores">Four major browser root programs: Chrome, Mozilla, Apple, Microsoft. Inclusion data from CCADB AllCertificateRecordsCSVFormatv4.</MethodologyItem>
        <MethodologyItem label="Web coverage">Browser market share mapped to root programs via StatCounter: Chrome includes Edge, Samsung Internet, Opera, and other Chromium browsers. Microsoft's web share is near 0% because Edge uses Chrome's root store, but Microsoft's store matters for Windows enterprise TLS, S/MIME, and code signing.</MethodologyItem>
        <MethodologyItem label="Portfolio Ops‡">Weighted incident rate across all CAs in a store = (total Bugzilla incidents for CAs in this store / total all-time certs for CAs in this store) × 1,000,000. Reflects the aggregate operational track record of each store's CA portfolio.</MethodologyItem>
        <MethodologyItem label="Disagreements">CAs trusted by some but not all root programs. Web coverage gap = sum of browser market share for stores that don't trust the CA. Sorted by gap — missing Chrome (~78%) is the most impactful single-store exclusion.</MethodologyItem>
        <MethodologyItem label="Exclusive roots">Roots trusted by only one store. High exclusive counts indicate that store accepts CAs no peer has validated. Counted at the individual root certificate level, not CA owner level.</MethodologyItem>
        <MethodologyItem label="Expiration">Root certificate notAfter dates. Some clients (e.g., Android) unconditionally trust roots in their store even after expiry. Root programs use removal schedules rather than relying on expiry dates alone.</MethodologyItem>
      </MethodologyCard>
    </div>
  );
};

export default TrustView;
