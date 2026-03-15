import React, { useState } from 'react';
import { COLORS, FONT_MONO, FONT_SANS, COUNTRY_COORDS } from '../constants';
import { dn, f, fl, getIncidentRate } from '../helpers';
import { Card, CardTitle, StatCard, RateDot, GeoMap, TabIntro, MethodologyCard, MethodologyItem } from './shared';
import CADetail from './CADetail';
import { usePipeline } from '../PipelineContext';
import {
  compactTableStyle, expandedCellStyle, statGridStyle,
} from '../styles';

/**
 * GovTable — Expandable table of government-classified CAs.
 * Classifications are structural (state ownership, legislative mandate)
 * not based on customer relationships.
 */
const GovTable = () => {
  const { govRisk, caData, incidentCounts } = usePipeline();
  const [govExp, setGovExp] = useState(null);
  return (
    <div style={{ maxHeight: 500, overflowY: 'auto' }}>
      <div style={{ overflowX: 'auto' }}>
      <table style={compactTableStyle}>
        <thead style={{ position: 'sticky', top: 0, background: COLORS.s1 }}>
          <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
            {[['CA', 'CA organization name'], ['Type', 'Government-operated or state-owned enterprise'], ['Jurisdiction', 'Country of government affiliation'], ['Relationship', 'Nature of government structural tie'], ['Stores', 'Trust store inclusion count (out of 4)'], ['Certs', 'Unexpired precertificates'], ['Ops‡', 'Incident rate per million certificates']].map(([h, tip], i) => (
              <th
                key={h}
                title={tip}
                style={{
                  padding: '5px',
                  color: COLORS.t3,
                  fontSize: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  textAlign: [4, 5].includes(i) ? 'right' : i === 6 ? 'center' : 'left',
                  cursor: 'help',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {govRisk.cas.map((c) => {
            const dEntry = caData.find((x) => x.id === c.id);
            const r = getIncidentRate(incidentCounts, c.id, c.certs, dEntry?.allTimeCerts);
            const isExp = govExp === c.caOwner;
            return (
              <React.Fragment key={c.caOwner}>
                <tr
                  style={{ borderBottom: `1px solid ${COLORS.bd}`, cursor: dEntry ? 'pointer' : 'default' }}
                  onClick={() => dEntry && setGovExp(isExp ? null : c.caOwner)}
                >
                  <td
                    style={{
                      padding: '4px 5px',
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
                    <span title={c.caOwner}>{c.caOwner}</span>
                  </td>
                  <td style={{ padding: '4px 5px', fontSize: 9 }}>
                    <span style={{ color: c.type === 'GO' ? COLORS.am : COLORS.cy }}>
                      {c.type === 'GO' ? 'Government' : 'State Enterprise'}
                    </span>
                  </td>
                  <td style={{ padding: '4px 5px', color: COLORS.t2, fontSize: 9 }}>{c.jurisdiction}</td>
                  <td
                    title={c.influence}
                    style={{
                      padding: '4px 5px',
                      color: COLORS.t3,
                      fontSize: 9,
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.influence}
                  </td>
                  <td
                    style={{
                      padding: '4px 5px',
                      textAlign: 'right',
                      fontFamily: FONT_MONO,
                      fontSize: 9,
                      color: c.storeCount >= 4 ? COLORS.rd : COLORS.t2,
                    }}
                  >
                    {c.storeCount}/4
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
                    {c.certs > 0 ? fl(c.certs) : '—'}
                  </td>
                  <td style={{ padding: '4px 5px', textAlign: 'center' }}>
                    <RateDot ppm={r?.ppm ?? null} size={6} />
                  </td>
                </tr>
                {isExp && dEntry && (
                  <tr>
                    <td colSpan={7} style={expandedCellStyle}>
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
    </div>
  );
};

// ═══ GOVERNMENT RISK ═══
/**
 * GovView — Government Risk tab.
 *
 * Tracks government-operated and state-owned enterprise CAs.
 * 24 of 91 trusted CAs have structural government ties spanning
 * 13 jurisdictions. 10 are in all 4 trust stores.
 */
const GovView = () => {
  const { govRisk, intersections } = usePipeline();
  const totalActive = intersections.activeOwners;
  const govPct = ((govRisk.n / totalActive) * 100).toFixed(0);
  const govIn4 = govRisk.cas.filter((c) => c.storeCount >= 4).length;
  return (
    <div>
      <TabIntro quote="When the state is the CA, the threat model changes.">
        Government-operated and state-owned CAs carry risks that commercial operators do not: legal compulsion to issue certificates for surveillance, political incentives that override technical governance, and accountability structures that answer to sovereigns rather than subscribers. This tab identifies every government and state-owned enterprise with trusted root certificates, tracks their trust store inclusion across all four root programs, and quantifies their share of the WebPKI. Classifications are based on structural ownership ties only — not customer relationships. Relying parties can assess how much of their certificate dependency chain runs through state actors.
      </TabIntro>

      <div
        style={statGridStyle}
      >
        <StatCard l="Gov/State CAs" v={govRisk.n} c={COLORS.am} />
        <StatCard l="Share of Trusted CAs" v={`${govPct}%`} c={COLORS.am} />
        <StatCard l="Government-Operated" v={govRisk.t.go.c} c={COLORS.am} />
        <StatCard l="State-Owned Enterprise" v={govRisk.t.se.c} c={COLORS.cy} />
        <StatCard l="In All 4 Trust Stores" v={govIn4} s={`of ${govRisk.n} gov/state`} c={COLORS.rd} />
      </div>

      {/* Proportional bar: gov vs private among trusted CAs */}
      <Card>
        <CardTitle sub="Government-operated = directly run by a government agency. State-owned enterprise = entity with direct state ownership. Customer relationships are not structural ties.">
          Government Presence in the WebPKI
        </CardTitle>

        <div style={{ fontSize: 10, color: COLORS.t2, marginBottom: 4 }}>By CA Organization Count</div>
        <div style={{ height: 32, borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
          <div
            style={{
              width: `${(govRisk.t.go.c / totalActive) * 100}%`,
              background: COLORS.am,
              opacity: 0.7,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 9, color: COLORS.tx, fontWeight: 600 }}>{govRisk.t.go.c}</span>
          </div>
          <div
            style={{
              width: `${(govRisk.t.se.c / totalActive) * 100}%`,
              background: COLORS.cy,
              opacity: 0.6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 9, color: COLORS.tx, fontWeight: 600 }}>{govRisk.t.se.c}</span>
          </div>
          <div
            style={{
              flex: 1,
              background: COLORS.t3,
              opacity: 0.15,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 8,
            }}
          >
            <span style={{ fontSize: 9, color: COLORS.t2 }}>Commercial & Non-Profit ({totalActive - govRisk.n})</span>
          </div>
        </div>

        <div style={{ fontSize: 10, color: COLORS.t2, marginBottom: 4 }}>By Certificate Issuance</div>
        <div style={{ height: 32, borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
          <div
            style={{
              width: `${govRisk.t.go.p}%`,
              minWidth: govRisk.t.go.p > 0.1 ? undefined : 3,
              background: COLORS.am,
              opacity: 0.7,
            }}
          />
          <div
            style={{
              width: `${govRisk.t.se.p}%`,
              minWidth: govRisk.t.se.p > 0.1 ? undefined : 3,
              background: COLORS.cy,
              opacity: 0.6,
            }}
          />
          <div
            style={{
              flex: 1,
              background: COLORS.t3,
              opacity: 0.15,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 8,
            }}
          >
            <span style={{ fontSize: 9, color: COLORS.t2 }}>
              Commercial & Non-Profit ({(100 - govRisk.t.go.p - govRisk.t.se.p).toFixed(1)}%)
            </span>
          </div>
        </div>

        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 9, color: COLORS.t3, marginBottom: 6 }}
        >
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 2,
                background: COLORS.am,
                opacity: 0.7,
                marginRight: 4,
                verticalAlign: 'middle',
              }}
            />{' '}
            Government ({govRisk.t.go.c} CAs · {govRisk.t.go.p.toFixed(2)}%)
          </span>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 2,
                background: COLORS.cy,
                opacity: 0.6,
                marginRight: 4,
                verticalAlign: 'middle',
              }}
            />{' '}
            State Enterprise ({govRisk.t.se.c} CAs · {govRisk.t.se.p.toFixed(2)}%)
          </span>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 2,
                background: COLORS.t3,
                opacity: 0.15,
                marginRight: 4,
                verticalAlign: 'middle',
              }}
            />{' '}
            Commercial & Non-Profit ({totalActive - govRisk.n})
          </span>
        </div>
      </Card>

      {/* Gov CAs by trust store count */}
      <Card>
        <CardTitle sub="Government CAs grouped by how many of the 4 major trust stores include them.">
          Trust Store Presence of Government CAs
        </CardTitle>
        {[4, 3, 2, 1].map((n) => {
          const cas = govRisk.cas.filter((c) => c.storeCount === n);
          if (!cas.length) return null;
          return (
            <div key={n} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span
                  style={{ fontSize: 11, color: n === 4 ? COLORS.rd : n >= 3 ? COLORS.am : COLORS.t2, fontWeight: 500 }}
                >
                  {n === 4 ? 'All 4 stores' : n + ' store' + (n > 1 ? 's' : '')}
                </span>
                <span style={{ fontSize: 10, color: COLORS.t2, fontFamily: FONT_MONO }}>{cas.length} CAs</span>
              </div>
              <div style={{ height: 14, background: COLORS.bg, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(cas.length / govRisk.n) * 100}%`,
                    background: n === 4 ? COLORS.rd : n >= 3 ? COLORS.am : COLORS.t3,
                    opacity: 0.4,
                    borderRadius: 3,
                  }}
                />
              </div>
              <div style={{ fontSize: 9, color: COLORS.t3, lineHeight: 1.5 }}>
                {cas.map((c) => c.caOwner).join(' · ')}
              </div>
            </div>
          );
        })}
      </Card>

      <Card>
        <CardTitle sub="Government and state-enterprise CAs by country of jurisdiction.">
          Jurisdictional Map
        </CardTitle>
        <GeoMap
          pins={govRisk.cas.reduce((acc, c) => {
            const co = COUNTRY_COORDS[c.jurisdiction];
            if (!co) return acc;
            const ex = acc.find((p) => p.label === c.jurisdiction);
            if (ex) {
              ex.count++;
              ex.tooltip = (
                <div>
                  <div style={{ fontWeight: 600, color: COLORS.tx }}>{c.jurisdiction}</div>
                  <div style={{ color: COLORS.t2 }}>{ex.count} CAs</div>
                </div>
              );
            } else {
              acc.push({
                lat: co.lat,
                lng: co.lng,
                label: c.jurisdiction,
                color: c.type === 'GO' ? COLORS.am : COLORS.cy,
                r: 5,
                count: 1,
                tooltip: (
                  <div>
                    <div style={{ fontWeight: 600, color: COLORS.tx }}>{c.jurisdiction}</div>
                    <div style={{ color: COLORS.t2 }}>1 CA · {c.type === 'GO' ? 'Government' : 'State Enterprise'}</div>
                    <div style={{ color: COLORS.t3, fontSize: 9 }}>{c.caOwner}</div>
                  </div>
                ),
              });
            }
            return acc;
          }, [])}
          legend={[
            { color: COLORS.am, label: 'Government-Operated' },
            { color: COLORS.cy, label: 'State-Owned Enterprise' },
          ]}
        />
      </Card>

      <Card>
        <CardTitle sub="Government and state-enterprise CAs with structural relationship details. Click any row to expand.">
          All Classified CAs
        </CardTitle>
        <GovTable />
      </Card>

      <MethodologyCard>
        <MethodologyItem label="Classification">
          "Government-operated" = directly run by a government agency (e.g., FNMT is a division of Spain's Royal Mint).
          "State-owned enterprise" = entity with direct state ownership or legislative mandate (e.g., Chunghwa Telecom is majority state-owned).
          Classifications are based on structural ownership and legislative relationships only — customer relationships with government agencies do not qualify.
        </MethodologyItem>
        <MethodologyItem label="Share metric">
          "Share of Trusted CAs" = government and state-owned CAs as a percentage of all currently trusted CA organizations by count.
          Certificate issuance volume from gov/state CAs is substantially lower than their CA count share — most high-volume issuance comes from commercial CAs.
          The risk is structural (trusted root presence), not volumetric.
        </MethodologyItem>
        <MethodologyItem label="Source">
          Manually curated gov_classifications.json, cross-referenced with official corporate registries, legislation, and CCADB metadata.
        </MethodologyItem>
        <MethodologyItem label="Scope">
          Currently trusted CAs only (at least one root in Mozilla, Chrome, Microsoft, or Apple). Distrusted CAs with historical government ties (e.g., US FPKI) are excluded.
        </MethodologyItem>
      </MethodologyCard>
    </div>
  );
};

export { GovTable };
export default GovView;
