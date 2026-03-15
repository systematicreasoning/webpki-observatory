import React, { useState, useMemo } from 'react';
import { COLORS, FONT_MONO, FONT_SANS } from '../constants';
import { dn, f, fl } from '../helpers';
import { Card, CardTitle, StatCard, TrustDots, GeoMap, buildPins, TabIntro, MethodologyCard, MethodologyItem } from './shared';
import CADetail from './CADetail';
import { usePipeline } from '../PipelineContext';
import {
  cardHeaderStyle, compactTableStyle, controlRowStyle, expandedCellStyle, footnoteStyle, searchInputNarrow, statGridStyle,
} from '../styles';

/**
 * TailView — Long Tail Risk tab.
 *
 * Highlights CAs below the 99.99% cumulative issuance threshold.
 * The head/tail boundary is computed dynamically from the data —
 * head = fewest CAs that collectively account for ≥99.99% of all
 * unexpired certificates. Everything below is tail.
 *
 * Every trusted root carries equal technical capability regardless
 * of volume. Tail CAs in all 4 stores represent the highest
 * risk-to-utility ratio in the ecosystem.
 */
const TAIL_THRESHOLD = 99.99;

const TailView = () => {
  const { trustedCAs } = usePipeline();
  const data = trustedCAs;

  const tot = useMemo(() => data.reduce((s, d) => s + d.certs, 0), [data]);

  // Compute the head/tail boundary dynamically from the 99.99% threshold.
  const headSize = useMemo(() => {
    let cum = 0;
    for (let i = 0; i < data.length; i++) {
      cum += data[i].certs;
      if ((cum / tot) * 100 >= TAIL_THRESHOLD) return i + 1;
    }
    return data.length;
  }, [data, tot]);

  const tail = data.slice(headSize);
  const head = data.slice(0, headSize);
  const tailCerts = tail.reduce((s, d) => s + d.certs, 0);
  const headCerts = head.reduce((s, d) => s + d.certs, 0);
  const tailPct = (tailCerts / tot) * 100;

  const [expanded, setExpanded] = useState(null);
  const [tailPageSize, setTailPageSize] = useState(25);
  const [tailFilter, setTailFilter] = useState('');

  return (
    <div>
      <TabIntro quote="The long tail is where oversight goes to die.">
        Dozens of CAs issue only a handful of certificates yet carry the same root-level trust as the largest issuers. Low issuance volume means less operational practice, less community scrutiny, and higher per-certificate risk. These tail CAs are disproportionately represented in past distrust events. This tab separates the "head" — the fewest CAs that collectively account for the vast majority of issuance — from the "tail" that accounts for the remainder, letting relying parties identify CAs where limited scale may signal limited maturity, and giving root programs a lens for risk-proportionate oversight.
      </TabIntro>

      {/* ── Summary stats ── */}
      <div
        style={{ ...statGridStyle, marginBottom: 20 }}
      >
        <StatCard l="Tail CAs" v={tail.length} s={`share ${tailPct.toFixed(2)}%`} c={COLORS.am} />
        <StatCard l="Tail Certificates" v={f(tailCerts)} s="total unexpired" />
        <StatCard l="Avg per Tail CA" v={f(Math.round(tailCerts / (tail.length || 1)))} s="unexpired" c={COLORS.t3} />
        <StatCard l="Head CAs" v={headSize} s={`control ${(100 - tailPct).toFixed(2)}%`} c={COLORS.ac} />
        <StatCard l="Head Certificates" v={f(headCerts)} s="total unexpired" />
        <StatCard l="Avg per Head CA" v={f(Math.round(headCerts / (headSize || 1)))} s="unexpired" c={COLORS.ac} />
      </div>

      {/* ── Head vs Tail proportional bar ── */}
      <Card>
        <CardTitle
          sub={`Proportional split at the ${TAIL_THRESHOLD}% cumulative issuance threshold. Head = fewest CAs covering ≥${TAIL_THRESHOLD}% of certificates.`}
        >
          Tail vs Head
        </CardTitle>
        <div style={{ display: 'flex', height: 32, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
          <div
            style={{
              width: `${tailPct}%`,
              minWidth: 40,
              background: COLORS.am,
              opacity: 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 9, color: COLORS.tx, fontWeight: 600 }}>
              {tail.length} CAs = {tailPct.toFixed(2)}%
            </span>
          </div>
          <div
            style={{
              flex: 1,
              background: COLORS.ac,
              opacity: 0.6,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 8,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.tx }}>
              {headSize} CAs = {(100 - tailPct).toFixed(2)}%
            </span>
          </div>
        </div>
      </Card>

      {/* ── Tail CAs by trust store presence ── */}
      <Card>
        <CardTitle sub="Tail CAs grouped by how many of the 4 major trust stores include them.">
          Tail CAs by Trust Store Presence
        </CardTitle>
        {(() => {
          const groups = [
            { n: 4, l: 'All 4 stores', c: COLORS.rd },
            { n: 3, l: '3 stores', c: COLORS.am },
            { n: 2, l: '2 stores', c: COLORS.t2 },
            { n: 1, l: '1 store', c: COLORS.t3 },
            { n: 0, l: 'No stores', c: COLORS.t3 },
          ];
          return (
            <div>
              {groups.map((g) => {
                const cas = tail.filter((d) => d.storeCount === g.n);
                if (!cas.length) return null;
                return (
                  <div key={g.n} style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontSize: 11, color: g.c, fontWeight: 600 }}>{g.l}</span>
                      <span style={{ fontSize: 10, color: COLORS.t2, fontFamily: FONT_MONO }}>{cas.length} CAs</span>
                    </div>
                    <div style={{ height: 20, background: COLORS.bg, borderRadius: 4, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${(cas.length / tail.length) * 100}%`,
                          background: g.c,
                          opacity: 0.5,
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Card>

      {/* ── Tail risk jurisdiction map ── */}
      <Card>
        <CardTitle sub="Tail CAs by country of jurisdiction. Size reflects how many tail CAs are in each jurisdiction.">
          Tail CAs by Jurisdiction
        </CardTitle>
        <GeoMap
          height={240}
          pins={useMemo(() => buildPins.tail(data, headSize), [data, headSize])}
          legend={[
            { color: COLORS.ac, label: 'Dot size = tail CA count' },
          ]}
        />
      </Card>

      {/* ── Tail CA table ── */}
      <Card>
        <div
          style={cardHeaderStyle}
        >
          <CardTitle sub={`CAs below the ${TAIL_THRESHOLD}% cumulative issuance threshold. Click any row to expand.`}>
            Tail CAs
          </CardTitle>
          <div style={controlRowStyle}>
            <input
              value={tailFilter}
              onChange={(e) => setTailFilter(e.target.value)}
              placeholder="Filter CAs..."
              style={searchInputNarrow}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {[10, 25, 0].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setTailPageSize(n);
                    setExpanded(null);
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: 9,
                    borderRadius: 4,
                    cursor: 'pointer',
                    border: `1px solid ${tailPageSize === n ? COLORS.bl : COLORS.bd}`,
                    background: tailPageSize === n ? COLORS.s2 : 'transparent',
                    color: tailPageSize === n ? COLORS.t2 : COLORS.t3,
                  }}
                >
                  {n === 0 ? 'All' : n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div style={{ overflowX: 'auto' }}>
          <table style={compactTableStyle}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                {[
                  ['#', 'Rank by issuance volume'],
                  ['CA Owner', 'Organization operating the CA'],
                  ['Trust', 'Root store inclusion'],
                  ['Certs', 'Unexpired precertificates'],
                  ['Share', 'Percentage of all certificates'],
                  ['Country', 'Jurisdiction from CCADB'],
                ].map(([h, tip], i) => (
                  <th
                    key={h}
                    title={tip}
                    style={{
                      padding: '5px',
                      color: COLORS.t3,
                      fontSize: 8,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      textAlign: [0, 3, 4].includes(i) ? 'right' : i === 2 ? 'center' : 'left',
                      cursor: 'help',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const fTail = tailFilter
                  ? tail.filter(
                      (d) =>
                        dn(d.caOwner).toLowerCase().includes(tailFilter.toLowerCase()) ||
                        d.country?.toLowerCase().includes(tailFilter.toLowerCase()),
                    )
                  : tail;
                return (tailPageSize === 0 ? fTail : fTail.slice(0, tailPageSize)).map((d, i) => {
                  const p = (d.certs / tot) * 100;
                  const isExp = expanded === d.rank;
                  return (
                    <React.Fragment key={d.rank}>
                      <tr
                        style={{
                          borderBottom: `1px solid ${COLORS.bd}`,
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
                            padding: '4px 5px',
                            textAlign: 'right',
                            color: COLORS.t3,
                            fontFamily: FONT_MONO,
                            fontSize: 9,
                          }}
                        >
                          {headSize + i + 1}
                        </td>
                        <td style={{ padding: '4px 5px', color: COLORS.tx }}>
                          <span style={{ fontSize: 9, color: isExp ? COLORS.ac : COLORS.t3, marginRight: 3 }}>
                            {isExp ? '▼' : '▶'}
                          </span>
                          {dn(d.caOwner)}
                        </td>
                        <td style={{ padding: '4px 5px', textAlign: 'center' }}>
                          <TrustDots tb={d.trustedBy} sz={5} />
                        </td>
                        <td
                          style={{
                            padding: '4px 5px',
                            textAlign: 'right',
                            fontFamily: FONT_MONO,
                            fontSize: 9,
                            color: COLORS.t3,
                          }}
                        >
                          {fl(d.certs)}
                        </td>
                        <td
                          style={{
                            padding: '4px 5px',
                            textAlign: 'right',
                            fontFamily: FONT_MONO,
                            fontSize: 9,
                            color: COLORS.t3,
                          }}
                        >
                          {p < 0.01 ? '<0.01%' : p.toFixed(2) + '%'}
                        </td>
                        <td style={{ padding: '4px 5px', color: COLORS.t3, fontSize: 9 }}>{d.country || '—'}</td>
                      </tr>
                      {isExp && (
                        <tr>
                          <td colSpan={6} style={expandedCellStyle}>
                            <CADetail d={d} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
          </div> {/* overflow wrapper */}
        </div>
      </Card>

      <div
        style={footnoteStyle}
      >
        <strong style={{ color: COLORS.t2 }}>Tail definition:</strong> Head = the fewest CAs whose cumulative issuance ≥
        {TAIL_THRESHOLD}% of all unexpired certificates. Currently {headSize} CAs. Everything below is "tail." The
        boundary is computed dynamically from the data on each pipeline run.{' '}
        <strong style={{ color: COLORS.t2 }}>Why it matters:</strong> Every trusted root certificate carries the same
        technical capability regardless of how many certificates the CA issues. A root in all 4 trust stores can issue
        certificates trusted by ~97% of web browsers whether it issues 500 million certs or 5. Tail CAs in all 4 stores
        have the widest blast radius relative to their ecosystem contribution. Data:
        unexpired precertificates from CT logs via crt.sh. Scope: currently trusted CAs only.
      </div>

      <MethodologyCard>
        <MethodologyItem label="Threshold">Head = the fewest CAs whose cumulative issuance accounts for ≥99.99% of all unexpired certificates. Computed dynamically on each pipeline run, so the boundary adapts as the market evolves. Everything below is "tail."</MethodologyItem>
        <MethodologyItem label="Store grouping">Tail CAs grouped by trust store presence (4, 3, 2, or 1 store). Tail CAs in all 4 stores represent the highest risk-to-utility ratio: maximum blast radius (~97% web coverage) with minimal ecosystem contribution.</MethodologyItem>
        <MethodologyItem label="Risk">Low-volume CAs have less operational experience, fewer incident reports, and less community scrutiny. Tail CAs are disproportionately represented in historical distrust events. They represent disproportionate attack surface relative to their contribution.</MethodologyItem>
        <MethodologyItem label="Data">Unexpired precertificates from CT logs via crt.sh. Scope: currently trusted CAs only.</MethodologyItem>
      </MethodologyCard>
    </div>
  );
};

export default TailView;
