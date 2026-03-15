import React, { useMemo } from 'react';
import { COLORS, FONT_MONO, FONT_SANS } from '../constants';
import { dn, parseDate } from '../helpers';
import { Card, CardTitle, Paginator } from './shared';
import { scrollXStyle } from '../styles';

/**
 * RootExpirationHeatmap — CA × year grid showing when roots expire.
 * Extracted from TrustView for readability.
 */
const RootExpirationHeatmap = ({ roots, caData, heatmapCount, setHeatmapCount }) => {
  const { allRootsHM, caYears, caIds, years, yrTotals, maxCount, minYr, maxYr } = useMemo(() => {
    const allRootsHM = [];
    Object.entries(roots).forEach(([caId, arr]) => arr.forEach((r) => allRootsHM.push({ ...r, caId })));

    const caYears = {};
    allRootsHM.forEach((r) => {
      const yr = parseDate(r.validTo).getFullYear();
      const ca = r.caId;
      if (!caYears[ca]) caYears[ca] = {};
      caYears[ca][yr] = (caYears[ca][yr] || 0) + 1;
    });

    const yearSet = new Set();
    Object.values(caYears).forEach((y) => Object.keys(y).forEach((k) => yearSet.add(parseInt(k))));
    const allYears = [...yearSet].sort();
    const minYr = Math.max(2025, allYears[0] || 2025);
    const maxYr = Math.min(2040, allYears[allYears.length - 1] || 2040);
    const years = allYears.filter((y) => y >= minYr && y <= maxYr);

    const caIds = Object.keys(caYears).sort((a, b) => {
      const minA = Math.min(...Object.keys(caYears[a]).map(Number), Infinity);
      const minB = Math.min(...Object.keys(caYears[b]).map(Number), Infinity);
      return minA - minB;
    });

    const maxCount = Math.max(...Object.values(caYears).flatMap((y) => Object.values(y), 0), 1);

    const yrTotals = {};
    years.forEach((y) => {
      yrTotals[y] = 0;
      caIds.forEach((ca) => { yrTotals[y] += caYears[ca][y] || 0; });
    });

    return { allRootsHM, caYears, caIds, years, yrTotals, maxCount, minYr, maxYr };
  }, [roots]);

  const caName = (id) => {
    const d = caData.find((x) => x.id === id);
    return d ? dn(d.caOwner) : dn(id);
  };

  const trustedCount = caData.filter((d) => d.matched && (d.storeCount > 0 || d.parent)).length;

  return (
    <Card>
      <CardTitle sub={`${allRootsHM.length} roots across ${caIds.length} of ${trustedCount} trusted CAs. CAs without embedded root data are not shown. Each cell shows roots expiring in that year.`}>
        Root Expiration Heatmap
      </CardTitle>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Paginator count={heatmapCount} setCount={setHeatmapCount} options={[10, 15, 25, 0]} />
      </div>
      <div style={scrollXStyle}>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 8, fontFamily: FONT_MONO, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '4px 6px', color: COLORS.t3, fontSize: 7, textAlign: 'left', position: 'sticky', left: 0, background: COLORS.s1, zIndex: 1, minWidth: 90 }}>CA Owner</th>
              {years.map((y) => (
                <th key={y} style={{ padding: '4px 3px', color: y <= 2026 ? COLORS.rd : y <= 2029 ? COLORS.am : COLORS.t3, fontSize: 7, textAlign: 'center', minWidth: 28, borderBottom: `2px solid ${yrTotals[y] > 10 ? COLORS.am : COLORS.bd}` }}>{y}</th>
              ))}
              <th style={{ padding: '4px 6px', color: COLORS.t3, fontSize: 7, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(heatmapCount === 0 ? caIds : caIds.slice(0, heatmapCount)).map((ca) => {
              const total = Object.values(caYears[ca]).reduce((s, n) => s + n, 0);
              return (
                <tr key={ca}>
                  <td style={{ padding: '3px 6px', color: COLORS.tx, fontSize: 8, fontFamily: FONT_SANS, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: COLORS.s1, zIndex: 1, borderBottom: `1px solid ${COLORS.bd}` }}>{caName(ca)}</td>
                  {years.map((y) => {
                    const n = caYears[ca][y] || 0;
                    const intensity = n > 0 ? Math.max(0.15, n / maxCount) : 0;
                    const color = y <= 2026 ? COLORS.rd : y <= 2029 ? COLORS.am : COLORS.ac;
                    return (
                      <td key={y} style={{ padding: '2px 3px', textAlign: 'center', borderBottom: `1px solid ${COLORS.bd}`, background: n > 0 ? color : undefined, opacity: n > 0 ? 0.15 + intensity * 0.6 : 1, borderRadius: 0 }} title={n > 0 ? `${caName(ca)}: ${n} root${n > 1 ? 's' : ''} expiring in ${y}` : ''}>
                        {n > 0 && <span style={{ color: COLORS.tx, fontSize: 8, fontWeight: n >= 3 ? 700 : n >= 2 ? 600 : 400, opacity: 1 }}>{n}</span>}
                      </td>
                    );
                  })}
                  <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: FONT_MONO, fontSize: 8, color: COLORS.t2, borderBottom: `1px solid ${COLORS.bd}` }}>{total}</td>
                </tr>
              );
            })}
            <tr style={{ borderTop: `2px solid ${COLORS.bl}` }}>
              <td style={{ padding: '4px 6px', color: COLORS.t2, fontSize: 8, fontWeight: 600, position: 'sticky', left: 0, background: COLORS.s1, zIndex: 1 }}>Total</td>
              {years.map((y) => (
                <td key={y} style={{ padding: '3px 3px', textAlign: 'center', fontSize: 8, fontWeight: 600, color: yrTotals[y] > 10 ? COLORS.am : yrTotals[y] > 0 ? COLORS.t2 : COLORS.t3 }}>{yrTotals[y] || ''}</td>
              ))}
              <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: FONT_MONO, fontSize: 8, color: COLORS.tx, fontWeight: 600 }}>{allRootsHM.length}</td>
            </tr>
          </tbody>
        </table>
        </div> {/* overflow wrapper */}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 8, color: COLORS.t3, marginTop: 6 }}>
        {[
          { l: '2025-2026 (imminent)', c: COLORS.rd },
          { l: '2027-2029', c: COLORS.am },
          { l: '2030+', c: COLORS.ac },
        ].map((item) => (
          <span key={item.l}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: item.c, opacity: 0.5, marginRight: 3, verticalAlign: 'middle' }} />
            {item.l}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          Showing {minYr}-{maxYr} · {years.length} years · {allRootsHM.length} roots
        </span>
      </div>
    </Card>
  );
};

export default RootExpirationHeatmap;
