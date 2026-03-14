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
  Card, CardTitle, DataPending, StatCard, TabIntro, MethodologyCard, MethodologyItem,
} from './shared';
import { usePipeline } from '../PipelineContext';
import { footnoteStyle, statGridStyle } from '../styles';

/* ── Local constants ── */

const STORE_NAMES = { chrome: 'Chrome', mozilla: 'Mozilla', apple: 'Apple', microsoft: 'Microsoft' };
const STORE_ORDER = ['chrome', 'mozilla', 'apple', 'microsoft'];

const Dot = ({ store, size = 8 }) => (
  <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: STORE_COLORS[store], verticalAlign: 'middle' }} />
);

/* ── Metric definitions (color thresholds — config, not data) ── */
// recent thresholds are lower since the window is shorter (5 events, 12 quarters, 50 ballots)
const METRICS = [
  { key: 'enforcement', label: 'Enforcement', tip: 'total actions to protect users', good: 'high',
    color: (v, tot) => v === `${tot}/${tot}` ? COLORS.gn : parseInt(v) >= tot - 1 ? COLORS.am : COLORS.rd },
  { key: 'led', label: 'First Public Action', tip: 'first to publicly announce distrust', good: 'high',
    color: (v, _tot, isRecent) => isRecent
      ? (v > 1 ? COLORS.gn : v > 0 ? COLORS.am : COLORS.rd)
      : (v > 5 ? COLORS.gn : v > 0 ? COLORS.am : COLORS.rd) },
  { key: 'never_acted', label: 'Never Acted', tip: 'peers acted, this store didn\u2019t', good: 'low',
    color: (v) => v === 0 ? COLORS.gn : v <= 1 ? COLORS.am : COLORS.rd },
  { key: 'oversight', label: 'Bugzilla Oversight', tip: '% comments on CA incidents', good: 'high',
    color: (v) => { const n = parseInt(v); return n > 50 ? COLORS.gn : n > 0 ? COLORS.am : COLORS.rd; } },
  { key: 'proposed', label: 'Ballots Proposed', tip: 'SC + NetSec', good: 'high',
    color: (v, _tot, isRecent) => isRecent
      ? (v > 4 ? COLORS.gn : v > 0 ? COLORS.am : COLORS.rd)
      : (v > 10 ? COLORS.gn : v > 0 ? COLORS.am : COLORS.rd) },
  { key: 'voted', label: 'SC Vote Participation', tip: 'TLS policy \u2014 recent ballots', good: 'high',
    color: (v) => { const n = parseInt(v); return n > 10 ? COLORS.gn : n > 6 ? COLORS.am : COLORS.rd; } },
  { key: 'substantive', label: 'Security-Improving Ballots', tip: 'ballots that improve the WebPKI', good: 'high',
    color: (v, _tot, isRecent) => isRecent
      ? (v > 4 ? COLORS.gn : v > 0 ? COLORS.am : COLORS.rd)
      : (v > 12 ? COLORS.gn : v > 5 ? COLORS.am : COLORS.rd) },
  { key: 'divider' },
  { key: 'owners', label: 'CA Owners Trusted', tip: 'organizations in store \u2014 current', good: 'low',
    color: (v) => v > 70 ? COLORS.rd : v > 55 ? COLORS.am : COLORS.t2 },
  { key: 'roots', label: 'Root Certificates', tip: 'individual roots \u2014 current', good: 'low',
    color: (v) => v > 250 ? COLORS.rd : v > 190 ? COLORS.am : COLORS.t2 },
  { key: 'exclusive', label: 'Exclusive Roots', tip: 'no other store trusts \u2014 current', good: 'low',
    color: (v) => v > 100 ? COLORS.rd : v > 10 ? COLORS.am : COLORS.t2 },
  { key: 'gov', label: 'Gov-Affiliated CAs', tip: 'state-owned / operated \u2014 current', good: 'low',
    color: (v) => v > 18 ? COLORS.rd : v > 14 ? COLORS.am : COLORS.t2 },
  { key: 'still_trusts', label: 'Still Trusts Removed CAs', tip: 'CAs peers removed \u2014 current', good: 'low',
    color: (v) => v > 2 ? COLORS.rd : v > 0 ? COLORS.am : COLORS.gn },
];

// "Recent" window definitions:
//   Enforcement: distrust events from 2021 onward
//   Oversight:   last 12 quarters of oversight_quarterly
//   Ballots:     ballot_classification.recent (last 50 ballots) + recent_votes (14 ballots) for vote participation
const RECENT_YEAR_CUTOFF = 2021;

/* ── Derived data ── */
function useReportCard(d, isRecent) {
  return useMemo(() => {
    if (!d) return { reportCard: {}, totalEvents: 0 };

    const allEvents = d.distrust_events || [];
    const recentEvents = allEvents.filter(e => (e.year || 0) >= RECENT_YEAR_CUTOFF);
    const events = isRecent ? recentEvents : allEvents;
    const totalEvents = isRecent ? recentEvents.length : (d.enforcement?.chrome?.total || allEvents.length);

    // Recent oversight: sum last 12 quarters per store
    const allQuarters = d.oversight_quarterly || [];
    const recentQuarters = allQuarters.slice(-12);

    const reportCard = {};
    for (const s of STORE_ORDER) {
      const e = d.enforcement?.[s] || {};
      const c = d.program_comment_summary?.[s] || {};
      const p = d.policy_leadership?.programs?.[s] || {};
      const sp = d.store_posture?.[s] || {};
      const bcAll = d.ballot_classification?.browser_summary?.[s] || {};
      const bcRecent = d.ballot_classification?.recent?.browser_summary?.[s] || {};

      // Recent enforcement: count from filtered events
      const acted = isRecent
        ? events.filter(ev => ev[s] !== 'trusted' && ev[s] != null).length
        : (e.acted || 0);
      const led = isRecent
        ? events.filter(ev => ev.leader === s).length
        : (e.initiated || 0);
      const neverActed = totalEvents - acted;

      // Recent oversight: use pipeline-computed recent_oversight_comments directly.
      // This is exact — per-comment timestamps filtered to >= 2021, LLM-classified,
      // no estimation from quarterly proxy data needed.
      let oversightPct;
      if (isRecent) {
        const recentOC = c.recent_oversight_comments ?? c.oversight_comments ?? 0;
        const recentSI = c.self_incident_comments || 0; // self-incident timing not separately tracked; use all-time as denominator proxy
        const recentSubstantive = recentOC + recentSI;
        oversightPct = recentSubstantive > 0
          ? `${Math.min(100, Math.round((recentOC / recentSubstantive) * 100))}%`
          : `${c.oversight_pct || 0}%`;
      } else {
        oversightPct = `${c.oversight_pct || 0}%`;
      }

      // Voted: for recent, count yes votes in recent_votes (14 ballots)
      const recentVotes = d.policy_leadership?.recent_votes || [];
      const votedRecent = recentVotes.filter(v => v[s] === 'yes').length;

      const bc = isRecent ? bcRecent : bcAll;

      reportCard[s] = {
        enforcement: `${acted}/${totalEvents}`,
        led,
        never_acted: neverActed,
        oversight: oversightPct,
        proposed: isRecent ? (bcRecent.endorsed || 0) : (p.proposed || 0),
        voted: isRecent
          ? `${votedRecent}/${recentVotes.length}`
          : `${p.voted || 0}/${p.ballots_with_votes || 0}`,
        substantive: bc.substantive || 0,
        // Trust surface metrics are always current snapshot — no time filter applies
        owners: sp.owners || 0,
        roots: sp.roots || 0,
        exclusive: sp.exclusive_count || 0,
        gov: sp.gov_ca_count || 0,
        still_trusts: (e.still_trusts || []).length,
      };
    }
    return { reportCard, totalEvents };
  }, [d, isRecent]);
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
  const [reportCardView, setReportCardView] = useState('recent');
  const isRecentRC = reportCardView === 'recent';
  const { reportCard, totalEvents } = useReportCard(d, isRecentRC);
  const allQuarters = d.oversight_quarterly || [];
  const [oversightView, setOversightView] = useState('recent');
  const quarters = oversightView === 'recent' ? allQuarters.slice(-12) : allQuarters;
  const maxOv = Math.max(...STORE_ORDER.map(s => (d.program_comment_summary?.[s]?.substantive_comments || d.program_comment_summary?.[s]?.total_comments || 0)), 1);
  const maxQC = Math.max(...quarters.map(q => Math.max(...STORE_ORDER.map(s => q[`${s}_comments`] || 0))), 1);
  const [incidentOversightView, setIncidentOversightView] = useState('recent');
  const [incidentDetectionView, setIncidentDetectionView] = useState('recent');
  const allBugCreation = d.bug_creation_by_year || [];
  const bugCreation = incidentDetectionView === 'recent'
    ? allBugCreation.filter(r => r.y >= RECENT_YEAR_CUTOFF)
    : allBugCreation;
  const allDiscoveryByYear = (d.discovery_methods?.by_year || []);
  const discoveryByYear = incidentDetectionView === 'recent'
    ? allDiscoveryByYear.filter(r => r.y >= RECENT_YEAR_CUTOFF)
    : allDiscoveryByYear;
  const bugTotals = incidentDetectionView === 'recent'
    ? STORE_ORDER.reduce((acc, s) => {
        acc[s] = bugCreation.reduce((sum, y) => sum + (y[s] || 0), 0);
        return acc;
      }, { other: bugCreation.reduce((sum, y) => sum + (y.other || 0), 0) })
    : d.bug_creation_totals || {};
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <CardTitle sub="Green = strong. Amber = moderate. Red = weak or concerning. Top: governance activity (higher is better). Bottom: trust surface scope (larger stores need more governance to maintain assurance).">
            Program Report Card
          </CardTitle>
          <div style={{ display: 'flex', gap: 2, background: COLORS.bg, borderRadius: 6, padding: 2, flexShrink: 0 }}>
            {[['recent', 'Recent'], ['all', 'All Time']].map(([v, l]) => (
              <button key={v} onClick={() => setReportCardView(v)} style={{
                padding: '3px 10px', fontSize: 10, fontWeight: reportCardView === v ? 600 : 400, borderRadius: 4,
                cursor: 'pointer', border: 'none', background: reportCardView === v ? COLORS.ac : 'transparent',
                color: reportCardView === v ? COLORS.wh : COLORS.t3,
              }}>{l}</button>
            ))}
          </div>
        </div>
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
                      TRUST SURFACE <span style={{ color: COLORS.bd, marginLeft: 4 }}>larger surface = more to govern{isRecentRC ? ' \u2014 current snapshot' : ''}</span>
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
                      const col = m.color(val, totalEvents, isRecentRC);
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
          {isRecentRC ? (
            <><strong style={{ color: COLORS.t2 }}>Recent:</strong>{` enforcement events since ${RECENT_YEAR_CUTOFF} (${totalEvents} of 15 total), oversight last 12 quarters (3 years), ballots last 50 SC ballots. Trust surface metrics are always current snapshot — no time filter applies there. `}</>
          ) : (
            `Enforcement: ${totalEvents} events since 2011. Oversight: Bugzilla (${d.meta?.bugs_with_comments || 0} bugs, ${(d.meta?.total_comments_analyzed || 0).toLocaleString()} comments — admin noise filtered by LLM). Ballots: SC (${d.policy_leadership?.by_working_group?.server_certificate?.total_ballots || 0}) + NS (${d.policy_leadership?.by_working_group?.network_security?.total_ballots || 0}), all time. `
          )}
          Store size reflects policy philosophy, not just governance quality: Chrome is deliberately selective (value must exceed risk, only one new CA accepted),
          Mozilla is the fastest gateway for new CAs, Apple is highly selective, and Microsoft processes root rollovers quickly.
          A larger store is not automatically worse — but it does require proportionally more governance activity to maintain assurance.
        </div>
      </Card>

      {/* ═══ OVERSIGHT TREND ═══ */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <CardTitle sub="Quarterly oversight comments per program. Each row scaled to its own peak so patterns are visible. Faded bars = single-person quarters (continuity risk).">
            Oversight Trend and Concentration Risk
          </CardTitle>
          <div style={{ display: 'flex', gap: 2, background: COLORS.bg, borderRadius: 6, padding: 2, flexShrink: 0 }}>
            {[['recent', 'Recent'], ['all', 'All Time']].map(([v, l]) => (
              <button key={v} onClick={() => setOversightView(v)} style={{
                padding: '3px 10px', fontSize: 10, fontWeight: oversightView === v ? 600 : 400, borderRadius: 4,
                cursor: 'pointer', border: 'none', background: oversightView === v ? COLORS.ac : 'transparent',
                color: oversightView === v ? COLORS.wh : COLORS.t3,
              }}>{l}</button>
            ))}
          </div>
        </div>
        {STORE_ORDER.map(prog => {
          const vals = quarters.map(q => q[`${prog}_comments`] || 0);
          const people = quarters.map(q => q[`${prog}_people`] || 0);
          const progPeak = Math.max(...vals, 1);
          const peakQ = quarters[vals.indexOf(progPeak)]?.quarter || '';
          const current = vals[vals.length - 1] || 0;
          const conc = d.oversight_concentration?.[prog] || {};
          const barH = 36;
          return (
            <div key={prog} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${COLORS.bd}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Dot store={prog} size={8} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: STORE_COLORS[prog] }}>{STORE_NAMES[prog]}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 9, fontFamily: FONT_MONO, color: COLORS.t3 }}>
                  <span>now <span style={{ color: COLORS.tx, fontWeight: 600 }}>{current}</span>/qtr</span>
                  <span>peak <span style={{ color: COLORS.tx, fontWeight: 600 }}>{progPeak}</span> <span style={{ fontSize: 7 }}>({peakQ})</span></span>
                  {conc.unique_contributors > 0 && <span>{conc.unique_contributors} people · top1 <span style={{ color: conc.top_contributor_pct > 80 ? COLORS.rd : conc.top_contributor_pct > 50 ? COLORS.am : COLORS.gn, fontWeight: 600 }}>{conc.top_contributor_pct}%</span></span>}
                </div>
              </div>
              <div style={{ display: 'flex', height: barH + 12, alignItems: 'flex-end', gap: 1 }}>
                {vals.map((v, i) => {
                  const h = progPeak > 0 ? (v / progPeak) * barH : 0;
                  const singlePerson = people[i] <= 1 && v > 0;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {v > 0 && h > 14 && <span style={{ fontSize: 6, fontFamily: FONT_MONO, color: COLORS.t3, marginBottom: 1 }}>{v}</span>}
                      <div style={{
                        width: '100%', height: Math.max(h, v > 0 ? 2 : 0),
                        background: STORE_COLORS[prog],
                        opacity: singlePerson ? 0.4 : 0.85,
                        borderRadius: '2px 2px 0 0',
                        borderBottom: singlePerson && v > 3 ? `2px solid ${COLORS.rd}` : 'none',
                      }} />
                    </div>
                  );
                })}
              </div>
              {/* Tiny scale indicator */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 7, color: COLORS.t3, marginTop: 1, opacity: 0.5 }}>
                max {progPeak}
              </div>
            </div>
          );
        })}
        {quarters.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7, color: COLORS.t3, marginTop: -4 }}>
            <span>{quarters[0]?.quarter}</span>
            {quarters.length > 8 && <span>{quarters[Math.floor(quarters.length / 4)]?.quarter}</span>}
            <span>{quarters[Math.floor(quarters.length / 2)]?.quarter}</span>
            {quarters.length > 8 && <span>{quarters[Math.floor(quarters.length * 3 / 4)]?.quarter}</span>}
            <span>{quarters[quarters.length - 1]?.quarter}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, fontSize: 8, color: COLORS.t3, marginTop: 8 }}>
          <span><span style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, background: COLORS.t2, opacity: 0.85, marginRight: 3, verticalAlign: 'middle' }} />Multi-contributor</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, background: COLORS.t2, opacity: 0.4, marginRight: 3, verticalAlign: 'middle', borderBottom: `2px solid ${COLORS.rd}` }} />Single contributor</span>
        </div>
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

      {/* ═══ INCLUSION VELOCITY ═══ */}
      {d.inclusion_velocity?.mozilla_stats && (() => {
        const iv = d.inclusion_velocity;
        const stats = iv.mozilla_stats;
        const pending = (iv.mozilla_pending || []).sort((a, b) => b.days_waiting - a.days_waiting);
        return (
          <Card>
            <CardTitle sub={`${stats.pending_count} CAs currently in Mozilla's inclusion pipeline. Based on Bugzilla CA Certificate Root Inclusion Request bugs.`}>
              Inclusion Velocity (Mozilla)
            </CardTitle>
            <div style={statGridStyle}>
              <StatCard l="Median Wait" v={`${stats.median_days}d`} s={`${(stats.median_days / 365).toFixed(1)} years`} c={stats.median_days > 365 ? COLORS.am : COLORS.gn} />
              <StatCard l="Mean Wait" v={`${stats.mean_days}d`} s={`${(stats.mean_days / 365).toFixed(1)} years`} c={COLORS.t2} />
              <StatCard l="Longest Pending" v={`${stats.longest_pending_days}d`} s={`${(stats.longest_pending_days / 365).toFixed(1)} years`} c={COLORS.rd} />
              <StatCard l="Pending" v={stats.pending_count} s={`${stats.completed_count} completed`} c={COLORS.ac} />
            </div>
            {pending.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                    <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CA</th>
                    <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Filed</th>
                    <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Waiting</th>
                    <th style={{ padding: '5px', color: COLORS.t3, fontSize: 8, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Stage</th>
                  </tr></thead>
                  <tbody>
                    {pending.slice(0, 15).map(p => (
                      <tr key={p.bug} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                        <td style={{ padding: '4px 5px', color: COLORS.tx, fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <a href={`https://bugzilla.mozilla.org/show_bug.cgi?id=${p.bug}`} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.tx, textDecoration: 'none' }}>{p.ca}</a>
                        </td>
                        <td style={{ padding: '4px 5px', fontFamily: FONT_MONO, fontSize: 9, color: COLORS.t3, textAlign: 'right' }}>{p.filed}</td>
                        <td style={{ padding: '4px 5px', fontFamily: FONT_MONO, fontSize: 9, textAlign: 'right', color: p.days_waiting > 1000 ? COLORS.rd : p.days_waiting > 365 ? COLORS.am : COLORS.t2 }}>
                          {p.days_waiting}d ({(p.days_waiting / 365).toFixed(1)}y)
                        </td>
                        <td style={{ padding: '4px 5px', fontSize: 9, color: COLORS.t3 }}>{p.stage || '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pending.length > 15 && (
                  <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 4 }}>
                    Showing 15 of {pending.length} pending applications (sorted by wait time)
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 6, lineHeight: 1.4 }}>
              Wait times measured from Bugzilla bug creation to present for pending, or to resolution for completed. Mozilla is shown because it is the only program with a fully public, trackable inclusion pipeline. Other programs accept applications but do not publish queue status.
            </div>
          </Card>
        );
      })()}

      {/* ═══ ENFORCEMENT ═══ */}
      <Card>
        <CardTitle sub={`${totalEvents} events since 2011 where root programs acted to protect users.`}>Actions to Protect Users</CardTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead><tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
            <th style={{ padding: '4px 5px', color: COLORS.t3, fontSize: 8, textAlign: 'left' }}>CA</th>
            <th style={{ padding: '4px 5px', color: COLORS.t3, fontSize: 8, textAlign: 'center' }}>Year</th>
            {STORE_ORDER.map(s => <th key={s} style={{ padding: '4px 5px', textAlign: 'center' }}><Dot store={s} size={6} /></th>)}
            <th style={{ padding: '4px 5px', color: COLORS.t3, fontSize: 8, textAlign: 'left' }}>First*</th>
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
        <div style={{ fontSize: 9, color: COLORS.t3, marginTop: 6, lineHeight: 1.4 }}>
          * "First" = first program to publicly announce action. Apple often acts before other programs but does not announce on Bugzilla or mailing lists — their actions may predate public announcements from other programs.
        </div>
      </Card>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <CardTitle sub={`Oversight = genuine governance comments on other CAs' compliance bugs. Self-incident = responding to your own CA's issues. ${d.meta?.bugs_with_comments || 0} bugs, ${(d.meta?.total_comments_analyzed || 0).toLocaleString()} comments after LLM admin filtering (${(d.meta?.total_comments_raw || 0).toLocaleString()} raw).`}>
            Incident Oversight
          </CardTitle>
          <div style={{ display: 'flex', gap: 2, background: COLORS.bg, borderRadius: 6, padding: 2, flexShrink: 0 }}>
            {[['recent', 'Recent'], ['all', 'All Time']].map(([v, l]) => (
              <button key={v} onClick={() => setIncidentOversightView(v)} style={{
                padding: '3px 10px', fontSize: 10, fontWeight: incidentOversightView === v ? 600 : 400, borderRadius: 4,
                cursor: 'pointer', border: 'none', background: incidentOversightView === v ? COLORS.ac : 'transparent',
                color: incidentOversightView === v ? COLORS.wh : COLORS.t3,
              }}>{l}</button>
            ))}
          </div>
        </div>
        {(() => {
          // In recent mode, use pipeline-computed recent_oversight_comments directly —
          // exact per-comment timestamps, LLM-classified, no quarterly approximation needed.
          const isRO = incidentOversightView === 'recent';
          const pcs = d.program_comment_summary || {};

          const windowMax = Math.max(...STORE_ORDER.map(s => {
            const cs = pcs[s] || {};
            if (!isRO) return cs.substantive_comments || cs.total_comments || 0;
            return (cs.recent_oversight_comments || 0) + (cs.self_incident_comments || 0);
          }), 1);

          return STORE_ORDER.map(s => {
            const cs = pcs[s] || {};
            let oc, sic, pct;
            if (!isRO) {
              oc = cs.oversight_comments || 0;
              sic = cs.self_incident_comments || 0;
              pct = cs.oversight_pct || 0;
            } else {
              // Use exact recent_oversight_comments from pipeline (2021+, LLM-filtered)
              oc = cs.recent_oversight_comments ?? cs.oversight_comments ?? 0;
              sic = cs.self_incident_comments || 0;
              const combined = oc + sic;
              pct = combined > 0 ? Math.min(100, Math.round((oc / combined) * 100)) : 0;
              if (cs.oversight_pct === 0) pct = 0;
            }
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ width: 66, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Dot store={s} size={6} />
                  <span style={{ fontSize: 9, color: STORE_COLORS[s], fontWeight: 500 }}>{STORE_NAMES[s]}</span>
                </div>
                <div style={{ flex: 1, height: 20, display: 'flex', borderRadius: 4, overflow: 'hidden' }}>
                  {oc > 0 && <div style={{ width: `${(oc / windowMax) * 100}%`, background: STORE_COLORS[s], opacity: 0.8, display: 'flex', alignItems: 'center', paddingLeft: oc > 40 ? 6 : 2 }}>
                    {oc > 40 && <span style={{ fontSize: 8, color: COLORS.wh, fontFamily: FONT_MONO, fontWeight: 600 }}>{oc}</span>}
                  </div>}
                  {sic > 0 && <div style={{ width: `${(sic / windowMax) * 100}%`, background: STORE_COLORS[s], opacity: 0.25, display: 'flex', alignItems: 'center', paddingLeft: sic > 40 ? 6 : 2 }}>
                    {sic > 40 && <span style={{ fontSize: 8, color: COLORS.t3, fontFamily: FONT_MONO }}>{sic}</span>}
                  </div>}
                </div>
                <span style={{ fontSize: 9, fontFamily: FONT_MONO, width: 33, textAlign: 'right', fontWeight: 600, color: pct > 50 ? COLORS.gn : pct > 0 ? COLORS.am : COLORS.rd }}>{pct}%</span>
              </div>
            );
          });
        })()}
        <div style={{ fontSize: 9, color: COLORS.t3, marginTop: 8, lineHeight: 1.4, borderTop: `1px solid ${COLORS.bd}`, paddingTop: 6 }}>
          {incidentOversightView === 'recent' ? (
            <><strong style={{ color: COLORS.t2 }}>Recent: {RECENT_YEAR_CUTOFF}–present.</strong>{' Genuine oversight comments only — empty workflow events and LLM-classified administrative process excluded. '}</>
          ) : (
            'All time: 2014–present. Genuine oversight comments only — empty workflow events and LLM-classified administrative process excluded. '
          )}
          Programs that govern through private channels appear underrepresented. Mozilla's count is inflated by administrative closures — a single employee commented on every bug as a process step. Microsoft's 0% reflects public Bugzilla only, not private governance.
        </div>
      </Card>

      {/* ═══ INCIDENT DETECTION ═══ */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <CardTitle sub="Who files Bugzilla bugs, and how were incidents actually discovered? Filing a bug is a process step — the actual discovery may have been by a researcher, auditor, root program, or the CA's own monitoring.">
            Incident Detection
          </CardTitle>
          <div style={{ display: 'flex', gap: 2, background: COLORS.bg, borderRadius: 6, padding: 2, flexShrink: 0 }}>
            {[['recent', 'Recent'], ['all', 'All Time']].map(([v, l]) => (
              <button key={v} onClick={() => setIncidentDetectionView(v)} style={{
                padding: '3px 10px', fontSize: 10, fontWeight: incidentDetectionView === v ? 600 : 400, borderRadius: 4,
                cursor: 'pointer', border: 'none', background: incidentDetectionView === v ? COLORS.ac : 'transparent',
                color: incidentDetectionView === v ? COLORS.wh : COLORS.t3,
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', height: 90, alignItems: 'flex-end', gap: 2 }}>
          {bugCreation.map(y => {
            const total = STORE_ORDER.reduce((a, s) => a + (y[s] || 0), 0) + (y.other || 0);
            return (
              <div key={y.y} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {total > 0 && <span style={{ fontSize: 7, fontFamily: FONT_MONO, color: COLORS.t3, marginBottom: 1 }}>{total}</span>}
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
          <span style={{ marginLeft: 'auto' }}>{(bugTotals.other || 0).toLocaleString()} CA-filed</span>
        </div>

        {/* Discovery method breakdown */}
        {d.discovery_methods && (() => {
          const dm = d.discovery_methods;
          const isRecDet = incidentDetectionView === 'recent';
          // Recompute totals from filtered by_year rows in recent mode
          const t = isRecDet
            ? discoveryByYear.reduce((acc, y) => {
                for (const k of ['self_detected','external_researcher','root_program','community','audit','unknown']) {
                  acc[k] = (acc[k] || 0) + (y[k] || 0);
                }
                return acc;
              }, {})
            : dm.totals || {};
          const total = Object.values(t).reduce((a, v) => a + v, 0);
          const unknownPct = total > 0 ? Math.round((t.unknown || 0) / total * 100) : 100;
          const DISC_COLORS = {
            self_detected: COLORS.gn, external_researcher: COLORS.am, root_program: COLORS.ac,
            community: COLORS.pu, audit: COLORS.g5, unknown: '#1f2937',
          };
          const DISC_LABELS = {
            self_detected: 'Self-Detected', external_researcher: 'Externally Reported',
            root_program: 'Root Program', community: 'Community', audit: 'Audit', unknown: 'Unclassified',
          };
          const DISC_ORDER = ['self_detected', 'external_researcher', 'root_program', 'community', 'audit', 'unknown'];

          return (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.bd}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.tx, marginBottom: 4 }}>How Were Incidents Discovered?</div>
              {unknownPct > 80 ? (
                <div style={{ fontSize: 9, color: COLORS.t3, lineHeight: 1.5, padding: '8px 0' }}>
                  Classification in progress — collecting incident report text from Bugzilla comments.{' '}
                  {total - (t.unknown || 0)} of {total} bugs classified so far ({100 - unknownPct}%).
                  Discovery categories: self-detected (CA's own monitoring), externally reported (researcher/customer),
                  root program (browser found it), community (CT logs, linting tools), and audit.
                </div>
              ) : (
                <>
                  {/* Stacked bar showing discovery method proportions */}
                  <div style={{ display: 'flex', height: 28, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                    {DISC_ORDER.map(m => {
                      const v = t[m] || 0;
                      if (v === 0) return null;
                      return (
                        <div key={m} title={`${DISC_LABELS[m]}: ${v} (${Math.round(v / total * 100)}%)`}
                          style={{ width: `${(v / total) * 100}%`, background: DISC_COLORS[m], opacity: 0.85 }} />
                      );
                    })}
                  </div>
                  {/* Per-year breakdown */}
                  {discoveryByYear.length > 0 && (
                    <div style={{ display: 'flex', height: 60, alignItems: 'flex-end', gap: 2, marginBottom: 4 }}>
                      {discoveryByYear.map(y => {
                        const yTotal = y.total || 1;
                        return (
                          <div key={y.y} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: 7, fontFamily: FONT_MONO, color: COLORS.t3, marginBottom: 1 }}>{yTotal}</span>
                            <div style={{ width: '100%', height: 40, display: 'flex', flexDirection: 'column-reverse' }}>
                              {DISC_ORDER.filter(m => m !== 'unknown').map(m => {
                                const v = y[m] || 0;
                                if (v === 0) return null;
                                return <div key={m} style={{ width: '100%', height: (v / yTotal) * 40, background: DISC_COLORS[m], opacity: 0.85 }} />;
                              })}
                            </div>
                            <span style={{ fontSize: 7, color: COLORS.t3, marginTop: 2 }}>{String(y.y).slice(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 8, color: COLORS.t3 }}>
                    {DISC_ORDER.map(m => {
                      const v = t[m] || 0;
                      if (v === 0) return null;
                      return (
                        <span key={m}>
                          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: DISC_COLORS[m], opacity: 0.85, marginRight: 3, verticalAlign: 'middle' }} />
                          {DISC_LABELS[m]} <span style={{ fontFamily: FONT_MONO, fontWeight: 600 }}>{v}</span>
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })()}
        <div style={{ fontSize: 9, color: COLORS.t3, marginTop: 8, lineHeight: 1.4, borderTop: `1px solid ${COLORS.bd}`, paddingTop: 6 }}>
          {incidentDetectionView === 'recent' ? (
            <><strong style={{ color: COLORS.t2 }}>Recent: {RECENT_YEAR_CUTOFF}–present.</strong>{' Bug filing totals and discovery method proportions reflect this window only. '}</>
          ) : (
            'All time: 2014–present. '
          )}
          Bug filing counts show who opened the Bugzilla bug, not who discovered the issue. A root program filing a bug may be splitting an existing incident into per-CA threads rather than independently discovering a new compliance failure.
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
          Comment authors attributed to root programs by email domain. {d.meta?.bugs_with_comments || 0} of {d.meta?.bugs_total || 0} bugs sampled ({d.meta?.bugs_with_comments && d.meta?.bugs_total ? Math.round((d.meta.bugs_with_comments / d.meta.bugs_total) * 100) : 0}%), {(d.meta?.total_comments_analyzed || 0).toLocaleString()} comments after LLM admin filtering ({(d.meta?.total_comments_raw || 0).toLocaleString()} raw). Admin-filtered comments include short acknowledgments, boilerplate survey notices, tracking bug openers, and status pings with no technical content.
          "Oversight" = comments on CA compliance bugs. "Self-incident" = responding to your own CA's compliance failures.
          Mozilla's oversight count is inflated by administrative bug closures — until the incident-reporting account was created, a single Mozilla employee commented to close every bug as a process step, not as governance review. This accounts for the 99% single-contributor concentration shown above.
          Microsoft operates a CA — {d.program_comment_summary?.microsoft?.self_incident_comments || 0} of their {d.program_comment_summary?.microsoft?.substantive_comments || d.program_comment_summary?.microsoft?.total_comments || 0} governance comments are self-incident responses, not oversight.
          Bugzilla data has survivorship bias: CAs not yet trusted by any store rarely file incident bugs because there is no enforcement mechanism requiring them to.
        </MethodologyItem>
        <MethodologyItem label="Enforcement">
          {totalEvents} events curated from root program announcements, Bugzilla, CCADB status, and Apple support documents.
          "First" = first program to publicly announce action. "Never Acted" = CCADB still shows trust while peers removed.
          Each root program discloses enforcement differently: Chrome publishes blog posts. Mozilla uses Bugzilla threads. Microsoft publishes monthly CTL deployment notices.
          Apple publishes support documents with SHA-256 hashes but does not announce on Bugzilla or mailing lists — their actions may predate other programs' public announcements. "First" is biased toward programs that announce loudly.
        </MethodologyItem>
        <MethodologyItem label="Incident Detection">
          Bug filing counts reflect who opened the Bugzilla bug, not who discovered the issue. A root program filing a bug may be splitting an existing incident into per-CA threads (administrative action) rather than independently discovering a new compliance failure. The "How Were Incidents Discovered?" breakdown attempts to classify actual discovery method separately from filer.
        </MethodologyItem>
        <MethodologyItem label="Policy Leadership">
          Ballot proposers/endorsers scraped from cabforum.org across {Object.keys(d.policy_leadership?.by_working_group || {}).length} working groups ({Object.values(d.policy_leadership?.by_working_group || {}).reduce((a, w) => a + (w.total_ballots || 0), 0)} total ballots).
          Vote participation from {d.policy_leadership?.programs?.chrome?.ballots_with_votes || 0} most recent SC ballots with published results.
          Vote participation includes yes, no, and abstain votes. Not voting may reflect policy disagreement, a deliberate choice not to legitimize a ballot, or capacity constraints — it is not inherently a governance failure.
          Ballot counts treat all ballots equally — a future enhancement could weight by impact.
          This tab tracks root program participation only. Some CAs actively participate in incident discussions — this ecosystem-level oversight is a separate analysis not captured here.
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
        <MethodologyItem label="Data and Definitions">
          Unit of analysis: CA Owner (organization level). Certificate counts: unexpired precertificates from CT logs via crt.sh, grouped by Root Owner.
          Incident rate (Ops‡): cumulative Bugzilla bugs / all-time certs, per million (lifetime, not annual).
          Usage period (†): 365 / (all-time certs / unexpired certs) — measures replacement behavior, not validity period.
          Web coverage: trust store presence × StatCounter browser share (Chrome ~77%, Apple ~18%, Mozilla ~2.5%, Microsoft {'<'}1%).
          Pipeline runs daily at 06:00 UTC. crt.sh/CCADB warn after 48h, critical after 7d.
        </MethodologyItem>
      </MethodologyCard>
    </div>
  );
};

export default GovernanceRiskView;
