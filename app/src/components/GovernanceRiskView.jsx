/**
 * GovernanceRiskView — Tab 12: Governance Risk
 *
 * Compares how effectively Chrome, Mozilla, Apple, and Microsoft govern the
 * CAs they trust — enforcement, oversight, policy leadership, and trust surface.
 *
 * Data source: data/root_program_effectiveness.json (from fetch_rpe.py)
 */
import React, { useState, useMemo } from 'react';
import { COLORS, STORE_COLORS, FONT_MONO, FONT_SANS } from '../constants';
import {
  Card, CardTitle, DataPending, TabIntro, MethodologyCard, MethodologyItem,
} from './shared';
import { usePipeline } from '../PipelineContext';
import { footnoteStyle } from '../styles';

/* ── Local constants ── */

const STORE_NAMES = { chrome: 'Chrome', mozilla: 'Mozilla', apple: 'Apple', microsoft: 'Microsoft' };
const STORE_ORDER = ['chrome', 'mozilla', 'apple', 'microsoft'];

const Dot = ({ store, size = 8 }) => (
  <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: STORE_COLORS[store], verticalAlign: 'middle' }} />
);

/* ── Metric definitions (color thresholds — config, not data) ── */
const METRICS = [
  { key: 'enforcement', label: 'Enforcement', tip: 'total actions to protect users', good: 'high',
    color: (v, tot) => v === `${tot}/${tot}` ? COLORS.gn : parseInt(v) >= tot - 1 ? COLORS.am : COLORS.rd },
  { key: 'led', label: 'Led Actions to Protect Users', tip: 'was first program to act', good: 'high',
    color: (v) => v > 5 ? COLORS.gn : v > 0 ? COLORS.am : COLORS.rd },
  { key: 'never_acted', label: 'Never Acted', tip: 'peers acted, this store didn\u2019t', good: 'low',
    color: (v) => v === 0 ? COLORS.gn : v <= 1 ? COLORS.am : COLORS.rd },
  { key: 'oversight', label: 'Bugzilla Oversight', tip: '% comments on other CAs', good: 'high',
    color: (v) => { const n = parseInt(v); return n > 50 ? COLORS.gn : n > 0 ? COLORS.am : COLORS.rd; } },
  { key: 'proposed', label: 'Ballots Proposed', tip: 'SC + NetSec', good: 'high',
    color: (v) => v > 10 ? COLORS.gn : v > 0 ? COLORS.am : COLORS.rd },
  { key: 'voted', label: 'SC Vote Participation', tip: 'TLS policy — recent ballots', good: 'high',
    color: (v) => { const n = parseInt(v); return n > 10 ? COLORS.gn : n > 6 ? COLORS.am : COLORS.rd; } },
  { key: 'divider' },
  { key: 'owners', label: 'CA Owners Trusted', tip: 'organizations in store', good: 'low',
    color: (v) => v > 70 ? COLORS.rd : v > 55 ? COLORS.am : COLORS.t2 },
  { key: 'roots', label: 'Root Certificates', tip: 'individual roots', good: 'low',
    color: (v) => v > 250 ? COLORS.rd : v > 190 ? COLORS.am : COLORS.t2 },
  { key: 'exclusive', label: 'Exclusive Roots', tip: 'no other store trusts', good: 'low',
    color: (v) => v > 100 ? COLORS.rd : v > 10 ? COLORS.am : COLORS.t2 },
  { key: 'gov', label: 'Gov-Affiliated CAs', tip: 'state-owned / operated', good: 'low',
    color: (v) => v > 18 ? COLORS.rd : v > 14 ? COLORS.am : COLORS.t2 },
  { key: 'still_trusts', label: 'Still Trusts Removed CAs', tip: 'CAs peers removed', good: 'low',
    color: (v) => v > 2 ? COLORS.rd : v > 0 ? COLORS.am : COLORS.gn },
];

/* ── Derived data ── */
function useReportCard(d) {
  return useMemo(() => {
    if (!d) return { reportCard: {}, totalEvents: 0 };
    const totalEvents = d.enforcement?.chrome?.total || 15;
    const reportCard = {};
    for (const s of STORE_ORDER) {
      const e = d.enforcement?.[s] || {};
      const c = d.program_comment_summary?.[s] || {};
      const p = d.policy_leadership?.programs?.[s] || {};
      const sp = d.store_posture?.[s] || {};
      reportCard[s] = {
        enforcement: `${e.acted || 0}/${e.total || 0}`,
        led: e.initiated || 0,
        never_acted: (e.total || 0) - (e.acted || 0),
        oversight: `${c.oversight_pct || 0}%`,
        proposed: p.proposed || 0,
        voted: `${p.voted || 0}/${p.ballots_with_votes || 0}`,
        owners: sp.owners || 0,
        roots: sp.roots || 0,
        exclusive: sp.exclusive_count || 0,
        gov: sp.gov_ca_count || 0,
        still_trusts: (e.still_trusts || []).length,
      };
    }
    return { reportCard, totalEvents };
  }, [d]);
}

/* ── Main component ── */

const GovernanceRiskView = () => {
  const { rpeData } = usePipeline();

  if (!rpeData) {
    return (
      <DataPending
        tab="Governance Risk"
        source="fetch_rpe.py → root_program_effectiveness.json"
        description="This tab compares how effectively each root program governs the CAs it trusts. Run: python pipeline/fetch_rpe.py"
      />
    );
  }

  const d = rpeData;
  const { reportCard, totalEvents } = useReportCard(d);
  const quarters = d.oversight_quarterly || [];
  const maxOv = Math.max(...STORE_ORDER.map(s => (d.program_comment_summary?.[s]?.total_comments || 0)), 1);
  const maxQC = Math.max(...quarters.map(q => Math.max(...STORE_ORDER.map(s => q[`${s}_comments`] || 0))), 1);
  const bugCreation = d.bug_creation_by_year || [];
  const bugTotals = d.bug_creation_totals || {};
  const maxBugYr = Math.max(...bugCreation.map(y => (y.chrome || 0) + (y.mozilla || 0) + (y.apple || 0) + (y.microsoft || 0)), 1);

  const bgMap = {
    [COLORS.gn]: 'rgba(16,185,129,0.18)', [COLORS.am]: 'rgba(245,158,11,0.18)',
    [COLORS.rd]: 'rgba(239,68,68,0.18)', [COLORS.t2]: 'rgba(148,163,184,0.06)',
  };

  return (
    <div>
      <TabIntro quote="Who watches the watchmen?">
        Root programs decide who gets trusted and who gets removed. Not all of them govern with the same
        intensity. This tab compares Chrome, Mozilla, Apple, and Microsoft on enforcement, oversight,
        policy leadership, and trust store size — because a program that trusts more CAs but invests less
        in governance creates risk everyone else absorbs.
      </TabIntro>

      {/* ═══ REPORT CARD ═══ */}
      <Card>
        <CardTitle sub="Green = strong. Amber = moderate. Red = weak or concerning. Top: governance activity (higher is better). Bottom: trust surface scope (larger stores need more governance to maintain assurance).">
          Program Report Card
        </CardTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ padding: '8px 6px', width: '30%' }} />
              {STORE_ORDER.map(s => (
                <th key={s} style={{ padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <Dot store={s} size={10} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: STORE_COLORS[s] }}>{STORE_NAMES[s]}</span>
                  </div>
                </th>
              ))}
            </tr></thead>
            <tbody>
              {METRICS.map((m, i) => {
                if (m.key === 'divider') return (
                  <tr key={i}><td colSpan={5} style={{ padding: '6px 0' }}>
                    <div style={{ borderTop: `1px solid ${COLORS.bl || COLORS.bd}`, marginTop: 2, paddingTop: 6, fontSize: 8, color: COLORS.t3 }}>
                      TRUST SURFACE <span style={{ color: COLORS.bd, marginLeft: 4 }}>larger surface = more to govern</span>
                    </div>
                  </td></tr>
                );
                return (
                  <tr key={m.key}>
                    <td style={{ padding: '8px 6px', borderBottom: `1px solid ${COLORS.bd}` }}>
                      <div style={{ fontSize: 10, color: COLORS.t2, fontWeight: 500 }}>{m.label}</div>
                      <div style={{ fontSize: 8, color: COLORS.t3 }}>{m.tip}</div>
                    </td>
                    {STORE_ORDER.map(s => {
                      const val = reportCard[s]?.[m.key];
                      const col = m.color(val, totalEvents);
                      return (
                        <td key={s} style={{
                          padding: '8px 6px', textAlign: 'center', fontFamily: FONT_MONO, fontSize: 13,
                          fontWeight: 700, color: col, background: bgMap[col] || 'transparent',
                          borderBottom: `1px solid ${COLORS.bd}`, borderLeft: `1px solid ${COLORS.bg}`,
                        }}>{val}</td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ ...footnoteStyle, marginTop: 10 }}>
          Enforcement: {totalEvents} events. Oversight: Bugzilla ({d.meta?.bugs_with_comments || 0} bugs, {(d.meta?.total_comments_analyzed || 0).toLocaleString()} comments).
          Ballots: SC ({d.policy_leadership?.by_working_group?.server_certificate?.total_ballots || 0}) + NS ({d.policy_leadership?.by_working_group?.network_security?.total_ballots || 0}).
          Store size reflects policy philosophy, not just governance quality: Chrome is deliberately selective (value must exceed risk, only one new CA accepted),
          Mozilla is the fastest gateway for new CAs, Apple is highly selective, and Microsoft processes root rollovers quickly.
          A larger store is not automatically worse — but it does require proportionally more governance activity to maintain assurance.
        </div>
      </Card>

      {/* ═══ OVERSIGHT TREND ═══ */}
      <Card>
        <CardTitle sub="Quarterly oversight comments per program. Faded bars with red underline = single-person quarters. Concentration in few contributors is a continuity risk.">
          Oversight Trend and Concentration Risk
        </CardTitle>
        {STORE_ORDER.map(prog => {
          const vals = quarters.map(q => q[`${prog}_comments`] || 0);
          const people = quarters.map(q => q[`${prog}_people`] || 0);
          const peak = Math.max(...vals, 1);
          const peakQ = quarters[vals.indexOf(peak)]?.quarter || '';
          const current = vals[vals.length - 1] || 0;
          const conc = d.oversight_concentration?.[prog] || {};
          return (
            <div key={prog} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <div style={{ width: 70, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Dot store={prog} size={7} /><span style={{ fontSize: 10, fontWeight: 600, color: STORE_COLORS[prog] }}>{STORE_NAMES[prog]}</span>
                </div>
                <span style={{ fontSize: 8, fontFamily: FONT_MONO, color: COLORS.t3 }}>
                  peak {peak} ({peakQ}) → now {current}
                  {conc.unique_contributors > 0 && <span style={{ marginLeft: 6 }}>{conc.unique_contributors} people, top1={conc.top_contributor_pct}%</span>}
                </span>
              </div>
              <div style={{ display: 'flex', height: 28, alignItems: 'flex-end', gap: 1, marginLeft: 70 }}>
                {vals.map((v, i) => {
                  const h = maxQC > 0 ? (v / maxQC) * 28 : 0;
                  return (
                    <div key={i} title={`${quarters[i]?.quarter}: ${v} comments, ${people[i]} people`}
                      style={{
                        flex: 1, height: Math.max(h, v > 0 ? 2 : 0), background: STORE_COLORS[prog],
                        opacity: people[i] <= 1 && v > 0 ? 0.5 : 0.85, borderRadius: '2px 2px 0 0',
                        borderBottom: people[i] <= 1 && v > 10 ? `2px solid ${COLORS.rd}` : 'none',
                      }} />
                  );
                })}
              </div>
            </div>
          );
        })}
        {quarters.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginLeft: 70, fontSize: 7, color: COLORS.t3, marginTop: 2 }}>
            <span>{quarters[0]?.quarter}</span>
            <span>{quarters[Math.floor(quarters.length / 2)]?.quarter}</span>
            <span>{quarters[quarters.length - 1]?.quarter}</span>
          </div>
        )}
      </Card>

      {/* ═══ NOTABLE GAPS ═══ */}
      <Card>
        <CardTitle sub="Where root store decisions diverge — on inclusion or enforcement.">Notable Inclusion and Trust Gaps</CardTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead><tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
            <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'left' }}>CA</th>
            <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'right' }}>Certs</th>
            {STORE_ORDER.map(s => <th key={s} style={{ padding: '5px', textAlign: 'center' }}><Dot store={s} size={6} /></th>)}
            <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'right' }}>Gap</th>
          </tr></thead>
          <tbody>
            {(d.notable_gaps?.current || []).length > 0 && (
              <tr><td colSpan={8} style={{ padding: '6px 5px 3px', fontSize: 8, color: COLORS.am, fontWeight: 600, textTransform: 'uppercase' }}>Current</td></tr>
            )}
            {(d.notable_gaps?.current || []).slice(0, 6).map(g => (
              <tr key={g.ca} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                <td style={{ padding: '4px 5px', color: COLORS.tx, fontWeight: 500 }}>{g.ca.length > 25 ? g.ca.slice(0, 25) + '…' : g.ca} (#{g.rank})</td>
                <td style={{ padding: '4px 5px', fontFamily: FONT_MONO, fontSize: 9, color: COLORS.t2, textAlign: 'right' }}>{g.certs >= 1000 ? `${Math.round(g.certs / 1000)}K` : g.certs}</td>
                {STORE_ORDER.map(s => <td key={s} style={{ padding: '4px 5px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: g.stores?.[s] === 'included' ? COLORS.gn : COLORS.rd }}>{g.stores?.[s] === 'included' ? '\u2713' : '\u2717'}</td>)}
                <td style={{ padding: '4px 5px', fontFamily: FONT_MONO, fontSize: 9, textAlign: 'right', color: COLORS.am }}>{g.wait_years ? `${g.wait_years}yr` : '\u2014'}</td>
              </tr>
            ))}
            {(d.notable_gaps?.distrust_divergences || []).length > 0 && (
              <>
                <tr><td colSpan={8} style={{ padding: '8px 5px 3px', fontSize: 8, color: COLORS.rd, fontWeight: 600, textTransform: 'uppercase' }}>Distrust Divergences</td></tr>
                {d.notable_gaps.distrust_divergences.map(g => (
                  <tr key={g.ca} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                    <td colSpan={2} style={{ padding: '4px 5px', color: COLORS.tx, fontWeight: 500 }}>{g.ca}</td>
                    {STORE_ORDER.map(s => <td key={s} style={{ padding: '4px 5px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: (g.still_trusted_by || []).includes(s) ? COLORS.rd : COLORS.gn }}>{(g.still_trusted_by || []).includes(s) ? '\u2717' : '\u2713'}</td>)}
                    <td />
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </Card>

      {/* ═══ ENFORCEMENT ═══ */}
      <Card>
        <CardTitle sub={`${totalEvents} events since 2011 where root programs acted to protect users.`}>Actions to Protect Users</CardTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead><tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
            <th style={{ padding: '4px 5px', color: COLORS.t3, fontSize: 8, textAlign: 'left' }}>CA</th>
            <th style={{ padding: '4px 5px', color: COLORS.t3, fontSize: 8, textAlign: 'center' }}>Year</th>
            {STORE_ORDER.map(s => <th key={s} style={{ padding: '4px 5px', textAlign: 'center' }}><Dot store={s} size={6} /></th>)}
            <th style={{ padding: '4px 5px', color: COLORS.t3, fontSize: 8, textAlign: 'left' }}>Led</th>
          </tr></thead>
          <tbody>
            {(d.distrust_events || []).map(ev => (
              <tr key={ev.ca} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                <td style={{ padding: '3px 5px', color: COLORS.tx, fontWeight: 500 }}>{ev.ca}</td>
                <td style={{ padding: '3px 5px', fontFamily: FONT_MONO, fontSize: 9, color: COLORS.t3, textAlign: 'center' }}>{ev.year}</td>
                {STORE_ORDER.map(s => (
                  <td key={s} style={{ padding: '3px 5px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: ev[s] === 'trusted' ? COLORS.rd : COLORS.gn }}>
                    {ev[s] === 'trusted' ? '\u2717' : ev[s] === 'constrained' ? '\u25D0' : '\u2713'}
                  </td>
                ))}
                <td style={{ padding: '3px 5px', fontSize: 9, color: STORE_COLORS[ev.leader], fontWeight: 600 }}>{STORE_NAMES[ev.leader]}</td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${COLORS.bd}` }}>
              <td style={{ padding: '5px', fontWeight: 600, color: COLORS.t2, fontSize: 9 }}>TOTAL</td><td />
              {STORE_ORDER.map(s => {
                const acted = d.enforcement?.[s]?.acted || 0;
                return <td key={s} style={{ padding: '5px', textAlign: 'center', fontFamily: FONT_MONO, fontWeight: 700, fontSize: 11, color: acted >= totalEvents ? COLORS.gn : acted >= totalEvents - 1 ? COLORS.am : COLORS.rd }}>{acted}/{totalEvents}</td>;
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </Card>

      {/* ═══ INCIDENT OVERSIGHT ═══ */}
      <Card>
        <CardTitle sub={`Oversight = commenting on OTHER CAs' incidents. Self-incident = responding to your OWN. ${d.meta?.bugs_with_comments || 0} bugs, ${(d.meta?.total_comments_analyzed || 0).toLocaleString()} comments.`}>
          Incident Oversight
        </CardTitle>
        {['mozilla', 'chrome', 'apple', 'microsoft'].map(s => {
          const cs = d.program_comment_summary?.[s] || {};
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ width: 66, display: 'flex', alignItems: 'center', gap: 4 }}><Dot store={s} size={6} /><span style={{ fontSize: 9, color: STORE_COLORS[s], fontWeight: 500 }}>{STORE_NAMES[s]}</span></div>
              <div style={{ flex: 1, height: 20, display: 'flex', borderRadius: 4, overflow: 'hidden' }}>
                {(cs.oversight_comments || 0) > 0 && <div style={{ width: `${((cs.oversight_comments || 0) / maxOv) * 100}%`, background: STORE_COLORS[s], opacity: 0.8, display: 'flex', alignItems: 'center', paddingLeft: (cs.oversight_comments || 0) > 40 ? 6 : 2 }}>{(cs.oversight_comments || 0) > 40 && <span style={{ fontSize: 8, color: '#fff', fontFamily: FONT_MONO, fontWeight: 600 }}>{cs.oversight_comments}</span>}</div>}
                {(cs.self_incident_comments || 0) > 0 && <div style={{ width: `${((cs.self_incident_comments || 0) / maxOv) * 100}%`, background: STORE_COLORS[s], opacity: 0.25, display: 'flex', alignItems: 'center', paddingLeft: (cs.self_incident_comments || 0) > 40 ? 6 : 2 }}>{(cs.self_incident_comments || 0) > 40 && <span style={{ fontSize: 8, color: COLORS.t3, fontFamily: FONT_MONO }}>{cs.self_incident_comments}</span>}</div>}
              </div>
              <span style={{ fontSize: 9, fontFamily: FONT_MONO, width: 33, textAlign: 'right', fontWeight: 600, color: (cs.oversight_pct || 0) > 50 ? COLORS.gn : (cs.oversight_pct || 0) > 0 ? COLORS.am : COLORS.rd }}>{cs.oversight_pct || 0}%</span>
            </div>
          );
        })}
      </Card>

      {/* ═══ INCIDENT DETECTION ═══ */}
      <Card>
        <CardTitle sub={`Who files Bugzilla bugs? ${(bugTotals.other || 0).toLocaleString()} of ${Object.values(bugTotals).reduce((a, v) => a + v, 0).toLocaleString()} bugs (${Math.round(((bugTotals.other || 0) / Math.max(Object.values(bugTotals).reduce((a, v) => a + v, 0), 1)) * 100)}%) are CA self-reports. The remainder shows which root programs actively detect issues.`}>
          Incident Detection
        </CardTitle>
        <div style={{ display: 'flex', height: 80, alignItems: 'flex-end', gap: 2 }}>
          {bugCreation.map(y => {
            const total = STORE_ORDER.reduce((a, s) => a + (y[s] || 0), 0);
            return (
              <div key={y.y} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', height: 70, display: 'flex', flexDirection: 'column-reverse' }}>
                  {STORE_ORDER.map(s => {
                    const v = y[s] || 0;
                    if (v === 0) return null;
                    return <div key={s} style={{ width: '100%', height: (v / maxBugYr) * 70, background: STORE_COLORS[s], opacity: 0.8 }} />;
                  })}
                </div>
                <span style={{ fontSize: 7, color: COLORS.t3, marginTop: 2 }}>{String(y.y).slice(2)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 8, color: COLORS.t3 }}>
          {STORE_ORDER.map(s => (
            <span key={s}><Dot store={s} size={5} /> <span style={{ color: STORE_COLORS[s], fontWeight: 600 }}>{bugTotals[s] || 0}</span> {STORE_NAMES[s]}</span>
          ))}
          <span style={{ marginLeft: 'auto' }}>{(bugTotals.other || 0).toLocaleString()} CA self-reports</span>
        </div>
      </Card>

      {/* ═══ VOTE MATRIX ═══ */}
      <Card>
        <CardTitle sub="How each root program voted on recent Server Certificate ballots.">Recent SC Ballot Votes</CardTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead><tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
            <th style={{ padding: '4px 5px', color: COLORS.t3, fontSize: 8, textAlign: 'left' }}>Ballot</th>
            {STORE_ORDER.map(s => <th key={s} style={{ padding: '4px 5px', textAlign: 'center' }}><Dot store={s} size={6} /></th>)}
          </tr></thead>
          <tbody>
            {(d.policy_leadership?.recent_votes || []).map(v => (
              <tr key={v.id} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                <td style={{ padding: '3px 5px', fontSize: 9 }}><span style={{ fontFamily: FONT_MONO, color: COLORS.t3, marginRight: 4 }}>{v.id}</span><span style={{ color: COLORS.tx }}>{v.title}</span></td>
                {STORE_ORDER.map(s => <td key={s} style={{ padding: '3px 5px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: v[s] === 'yes' ? COLORS.gn : COLORS.t3 }}>{v[s] === 'yes' ? '\u2713' : '\u2014'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ═══ CROSS-WG ═══ */}
      <Card>
        <CardTitle sub="Proposed + endorsed ballots per working group.">Policy Engagement by Working Group</CardTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead><tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
            <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'left' }}>Working Group</th>
            <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'center' }}>N</th>
            {STORE_ORDER.map(s => <th key={s} style={{ padding: '5px', textAlign: 'center' }}><Dot store={s} size={6} /></th>)}
          </tr></thead>
          <tbody>
            {Object.entries(d.policy_leadership?.by_working_group || {}).map(([key, wg]) => (
              <tr key={key} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                <td style={{ padding: '5px', color: COLORS.tx, fontSize: 9, fontWeight: 500 }}>{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
                <td style={{ padding: '5px', textAlign: 'center', fontFamily: FONT_MONO, fontSize: 9, color: COLORS.t3 }}>{wg.total_ballots}</td>
                {STORE_ORDER.map(s => {
                  const p = wg.programs?.[s] || {};
                  const prop = p.proposed || 0;
                  const end = p.endorsed || 0;
                  return <td key={s} style={{ padding: '5px', textAlign: 'center', fontSize: 9, fontFamily: FONT_MONO }}>
                    {prop + end > 0 ? <span style={{ color: prop > 0 ? COLORS.tx : COLORS.t2 }}>{prop}<span style={{ color: COLORS.t3 }}>+{end}</span></span> : <span style={{ color: COLORS.t3 }}>{'\u2014'}</span>}
                  </td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ═══ METHODOLOGY ═══ */}
      <MethodologyCard>
        <MethodologyItem label="Bugzilla Oversight">
          Comment authors attributed to root programs by email domain. {d.meta?.bugs_with_comments || 0} of {d.meta?.bugs_total || 0} bugs sampled ({d.meta?.bugs_with_comments && d.meta?.bugs_total ? Math.round((d.meta.bugs_with_comments / d.meta.bugs_total) * 100) : 0}%), {(d.meta?.total_comments_analyzed || 0).toLocaleString()} comments analyzed.
          "Oversight" = comments on other CAs' bugs. "Self-incident" = responding to your own CA's compliance failures.
          Microsoft operates a CA — {d.program_comment_summary?.microsoft?.self_incident_comments || 0} of their {d.program_comment_summary?.microsoft?.total_comments || 0} comments are self-incident responses, not governance.
          Bugzilla data has survivorship bias: CAs not yet trusted by any store rarely file incident bugs because there is no enforcement mechanism requiring them to.
        </MethodologyItem>
        <MethodologyItem label="Enforcement">
          {totalEvents} events curated from root program announcements, Bugzilla, CCADB status, and Apple support documents.
          "Led" = first program to publicly announce action. "Never Acted" = CCADB still shows trust while peers removed.
          Each root program discloses enforcement differently: Chrome publishes blog posts. Mozilla uses Bugzilla threads. Microsoft publishes monthly CTL deployment notices.
          Apple publishes support documents with SHA-256 hashes but does not announce on Bugzilla or mailing lists — their actions may be undercounted. "Led" is biased toward programs that announce loudly.
        </MethodologyItem>
        <MethodologyItem label="Policy Leadership">
          Ballot proposers/endorsers scraped from cabforum.org across {Object.keys(d.policy_leadership?.by_working_group || {}).length} working groups ({Object.values(d.policy_leadership?.by_working_group || {}).reduce((a, w) => a + (w.total_ballots || 0), 0)} total ballots).
          Vote participation from {d.policy_leadership?.programs?.chrome?.ballots_with_votes || 0} most recent SC ballots with published results.
          Ballot counts treat all ballots equally — a future enhancement could weight by impact.
          This tab tracks root program participation only. Some CAs actively participate in other CAs' incident discussions — this ecosystem-level oversight is a separate analysis not captured here.
        </MethodologyItem>
        <MethodologyItem label="Trust Store Changelogs">
          Chrome: complete history from Chromium source code git log (since 2022).
          Microsoft: monthly deployment notices scraped from learn.microsoft.com (since 2020).
          Mozilla: Bugzilla inclusion/removal bugs with exact timestamps.
          Apple: no public changelog — daily CCADB snapshots will build history over time from diffs.
        </MethodologyItem>
        <MethodologyItem label="Inclusion Gaps">
          Auto-detected: CAs with rank ≤ 100 or {'>'} 100 certs missing from at least one store. Wait time from root cert creation date (proxy — CAs may not apply simultaneously).
          Mozilla pipeline stages use Bugzilla whiteboard labels which are not always applied consistently.
        </MethodologyItem>
        <MethodologyItem label="Limitations and Bias">
          Root programs participate in public forums unequally — Mozilla uses Bugzilla as its primary governance channel, so Mozilla activity is naturally overrepresented there.
          Chrome, Apple, and Microsoft may conduct significant governance work through private channels that leave no public trace.
          A program showing low public participation may still be actively governing — but without public evidence, relying parties cannot verify this.
          The data here reflects what the ecosystem can observe, which is also what creates accountability.
        </MethodologyItem>
      </MethodologyCard>
    </div>
  );
};

export default GovernanceRiskView;
