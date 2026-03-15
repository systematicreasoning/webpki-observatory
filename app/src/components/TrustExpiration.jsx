import React, { useState, useMemo } from 'react';
import { COLORS, STORE_COLORS, FONT_MONO, FONT_SANS } from '../constants';
import { dn, parseDate, yearsDiff } from '../helpers';
import { Card, CardTitle, TrustDots, Paginator } from './shared';
import CADetail from './CADetail';
import { compactTableStyle, expandedCellStyle, scrollXStyle } from '../styles';

const now = new Date();

/**
 * RootExpirationTimeline — Expiration bucket bar, soonest-expiring table,
 * and median root age. Extracted from TrustView for readability.
 */
const RootExpirationTimeline = ({ roots, caData }) => {
  const [timelineCount, setTimelineCount] = useState(10);
  const [timelineFilter, setTimelineFilter] = useState('');
  const [expandedCert, setExpandedCert] = useState(null);

  const allRoots = useMemo(() => {
    const arr = [];
    Object.entries(roots).forEach(([caId, list]) => list.forEach((r) => arr.push({ ...r, caId })));
    return arr;
  }, [roots]);

  const buckets = [
    { l: '< 1 year', min: 0, max: 1, c: COLORS.rd },
    { l: '1-3 years', min: 1, max: 3, c: COLORS.am },
    { l: '3-5 years', min: 3, max: 5, c: COLORS.am },
    { l: '5-10 years', min: 5, max: 10, c: COLORS.t2 },
    { l: '> 10 years', min: 10, max: 999, c: COLORS.gn },
  ];

  const bData = useMemo(() => buckets.map((b) => {
    const n = allRoots.filter((r) => {
      const y = yearsDiff(parseDate(r.validTo), now);
      return y >= b.min && y < b.max;
    }).length;
    return { ...b, n };
  }), [allRoots]);

  const totalR = allRoots.length;

  const expSoon = useMemo(() => allRoots
    .map((r) => ({
      name: r.name, validTo: r.validTo, yrs: yearsDiff(parseDate(r.validTo), now),
      stores: r.stores, caId: r.caId, sha256: r.sha256,
    }))
    .filter((r) => r.yrs > 0)
    .sort((a, b) => a.yrs - b.yrs), [allRoots]);

  const filteredTimeline = timelineFilter
    ? expSoon.filter((r) => dn(r.caId).toLowerCase().includes(timelineFilter.toLowerCase()) || r.name.toLowerCase().includes(timelineFilter.toLowerCase()))
    : expSoon;
  const shownTimeline = timelineCount === 0 ? filteredTimeline : filteredTimeline.slice(0, timelineCount);

  const medianAge = useMemo(() => {
    const sorted = allRoots.map((r) => yearsDiff(now, parseDate(r.validFrom))).sort((a, b) => a - b);
    return sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)].toFixed(1) : '0';
  }, [allRoots]);

  return (
    <Card>
      <CardTitle sub="Root certificates sorted by expiration date. Click any row to expand CA details.">
        Root Expiration Timeline
      </CardTitle>
      <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
        {bData.filter((b) => b.n > 0).map((b) => (
          <div key={b.l} style={{ width: `${(b.n / totalR) * 100}%`, background: b.c, opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${COLORS.bg}` }} title={`${b.l}: ${b.n} roots`}>
            {(b.n / totalR) * 100 > 5 && <span style={{ fontSize: 9, color: COLORS.tx, fontWeight: 500 }}>{b.n}</span>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 8, color: COLORS.t3, marginBottom: 12 }}>
        {bData.filter((b) => b.n > 0).map((b) => (
          <span key={b.l}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 2, background: b.c, opacity: 0.5, marginRight: 3, verticalAlign: 'middle' }} />
            {b.l}: {b.n}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: COLORS.t3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Soonest Expiring ({expSoon.length} non-expired roots)
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={timelineFilter} onChange={(e) => setTimelineFilter(e.target.value)} placeholder="Filter CAs..." style={{ background: COLORS.bg, border: `1px solid ${COLORS.bd}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, color: COLORS.tx, fontFamily: FONT_SANS, width: 160, outline: 'none' }} />
          <Paginator count={timelineCount} setCount={setTimelineCount} options={[10, 15, 25, 0]} />
        </div>
      </div>
      <div style={scrollXStyle}>
        <div style={{ overflowX: 'auto' }}>
        <table style={compactTableStyle}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
              {['Root Certificate', 'CA Owner', 'Stores', 'Expires', 'Time Left'].map((h) => (
                <th key={h} style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: h === 'Time Left' ? 'right' : h === 'Stores' ? 'center' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownTimeline.map((r) => {
              const isOpen = expandedCert === (r.sha256 || r.name);
              return (
                <React.Fragment key={r.name + r.validTo}>
                  <tr onClick={() => setExpandedCert(isOpen ? null : r.sha256 || r.name)} style={{ borderBottom: `1px solid ${COLORS.bd}`, cursor: 'pointer', background: isOpen ? COLORS.s2 : 'transparent' }}>
                    <td title={r.name} style={{ padding: '4px 5px', color: COLORS.tx, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 9, color: isOpen ? COLORS.ac : COLORS.t3, marginRight: 4 }}>{isOpen ? '▼' : '▶'}</span>
                      {r.name}
                    </td>
                    <td style={{ padding: '4px 5px', color: COLORS.t2, fontSize: 9 }}>{dn(r.caId)}</td>
                    <td style={{ padding: '4px 5px', textAlign: 'center' }}>
                      <TrustDots tb={{ mozilla: r.stores.includes('M'), chrome: r.stores.includes('C'), microsoft: r.stores.includes('S'), apple: r.stores.includes('A') }} />
                    </td>
                    <td style={{ padding: '4px 5px', color: COLORS.t2, fontFamily: FONT_MONO, fontSize: 9 }}>{r.validTo}</td>
                    <td style={{ padding: '4px 5px', textAlign: 'right', fontFamily: FONT_MONO, fontSize: 9, color: r.yrs < 0 ? COLORS.rd : r.yrs < 1 ? COLORS.rd : r.yrs < 3 ? COLORS.am : COLORS.t2 }}>
                      {r.yrs < 0 ? 'expired' : r.yrs.toFixed(1) + 'y'}
                    </td>
                  </tr>
                  {isOpen && (() => {
                    const dEntry = caData.find((x) => x.id === r.caId || x.caSlug === r.caId);
                    return dEntry ? <tr><td colSpan={5} style={expandedCellStyle}><CADetail d={dEntry} /></td></tr> : null;
                  })()}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        </div> {/* overflow wrapper */}
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 8, color: COLORS.t3, marginTop: 6 }}>
        {[['mozilla', 'Mozilla'], ['chrome', 'Chrome'], ['microsoft', 'Microsoft'], ['apple', 'Apple']].map(([k, l]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STORE_COLORS[k], display: 'inline-block' }} /> {l}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 6 }}>
        Based on {totalR} currently-included root certificates across {Object.keys(roots).length} CA owners.
        Median root age: {medianAge} years.
      </div>
    </Card>
  );
};

export default RootExpirationTimeline;
