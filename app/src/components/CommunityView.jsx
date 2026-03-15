/**
 * CommunityView — Ecosystem Participation
 *
 * Voluntary ecosystem contribution by CA organizations and individuals
 * beyond compliance obligations. Three signals:
 *   1. Bugzilla engagement on other CAs' compliance bugs
 *   2. CA/B Forum ballot proposals and endorsements (not votes)
 *   3. Proactive bug filing about other CAs' issues
 *
 * All 56 CABF CA members appear, including those with zero engagement.
 * Recent = 2021+ for all three signals (consistent window).
 *
 * Data: data/community_engagement.json (fetch_community.py)
 */
import React, { useState, useMemo } from 'react';
import { COLORS, FONT_MONO } from '../constants';
import {
  Card, CardTitle, DataPending, StatCard, TabIntro,
  MethodologyCard, MethodologyItem,
} from './shared';
import { usePipeline } from '../PipelineContext';
import { statGridStyle, footnoteStyle } from '../styles';

/* ── helpers ── */

/** Mask email to reduce scraping surface.
 *  Personal domains (gmail, hotmail, etc): show only masked local part — domain
 *  gives no org-affiliation signal and leaks provider unnecessarily.
 *  Org domains: keep domain for affiliation context, mask local part.
 *    agwa-bugs@mm.beanwood.com -> a********@mm.beanwood.com
 *    rdaurne77@gmail.com       -> r********
 *    dzacharo@harica.gr        -> d*******@harica.gr
 */
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'protonmail.com',
  'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com',
  'thisisntrocket.science', 'mm.beanwood.com', 'hezmatt.org',
  'fozzie.dev', 'hboeck.de', 'proton.me', 'scheitle.de',
]);

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 1) return email;
  const masked = `${local[0]}${'*'.repeat(local.length - 1)}`;
  return PERSONAL_DOMAINS.has(domain) ? masked : `${masked}@${domain}`;
}

function scoreOrg(o, recent) {
  const bz = recent ? (o.bugzilla?.recent_bugs_engaged || 0) : (o.bugzilla?.bugs_engaged || 0);
  const p  = recent ? (o.ballots?.recent_proposed || 0) : (o.ballots?.proposed || 0);
  const e  = recent ? (o.ballots?.recent_endorsed || 0) : (o.ballots?.endorsed || 0);
  const f  = recent ? (o.bug_filing?.recent_bugs_filed || 0) : (o.bug_filing?.bugs_filed || 0);
  return bz * 2 + p * 3 + e + f * 3;
}

/* ── sub-components ── */

const MiniBar = ({ value, max, color, width = 60 }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
      <div style={{ width, height: 6, background: COLORS.bd, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: value > 0 ? COLORS.t2 : COLORS.t3, minWidth: 22, textAlign: 'right' }}>
        {value > 0 ? value : String.fromCharCode(8212)}
      </span>
    </div>
  );
};

const CABFBadge = () => (
  <span style={{
    fontSize: 8, fontFamily: FONT_MONO, fontWeight: 700, padding: '1px 5px',
    borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: COLORS.ac,
    border: '1px solid rgba(59,130,246,0.2)', letterSpacing: '0.05em',
  }}>CABF</span>
);

const IPBadge = () => (
  <span style={{
    fontSize: 8, fontFamily: FONT_MONO, fontWeight: 700, padding: '1px 4px',
    borderRadius: 3, background: 'rgba(16,185,129,0.1)', color: COLORS.gn,
    border: '1px solid rgba(16,185,129,0.2)',
  }}>IP</span>
);

/* ── Over-time chart ── */

const CHART_YEARS = ['2017','2018','2019','2020','2021','2022','2023','2024','2025','2026'];
const ORG_COLORS = {
  Sectigo: '#f59e0b', HARICA: '#10b981', DigiCert: '#3b82f6',
  "Let's Encrypt": '#8b5cf6', Entrust: '#ef4444',
};
const TOP_CHART_ORGS = ['Sectigo', 'HARICA', "Let's Encrypt", 'DigiCert', 'Entrust'];

const OverTimeChart = ({ orgs }) => {
  const [metric, setMetric] = useState('bz');

  const series = useMemo(() => {
    return TOP_CHART_ORGS.map(org => {
      const o = orgs[org] || {};
      const years = CHART_YEARS.map(y => {
        if (metric === 'bz')     return o.bugzilla?.by_year?.[y] || 0;
        if (metric === 'ballot') return (o.ballots?.by_year?.[y]?.proposed || 0) + (o.ballots?.by_year?.[y]?.endorsed || 0);
        if (metric === 'filing') return o.bug_filing?.by_year?.[y] || 0;
        return 0;
      });
      return { org, years, color: ORG_COLORS[org] || COLORS.t3 };
    });
  }, [orgs, metric]);

  const maxVal = Math.max(...series.flatMap(s => s.years), 1);
  const BAR_H = 64;
  const recent2021idx = CHART_YEARS.indexOf('2021');

  const MetBtn = ({ id, label }) => (
    <button onClick={() => setMetric(id)} style={{
      padding: '2px 8px', fontSize: 9, fontFamily: FONT_MONO, borderRadius: 3,
      border: `1px solid ${metric === id ? COLORS.ac : COLORS.bd}`,
      background: metric === id ? 'rgba(59,130,246,0.12)' : 'transparent',
      color: metric === id ? COLORS.ac : COLORS.t3, cursor: 'pointer',
    }}>{label}</button>
  );

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <CardTitle sub="Top 5 CA organizations by year. Dashed line = 2021 recent window start.">
          Participation Over Time
        </CardTitle>
        <div style={{ display: 'flex', gap: 4 }}>
          <MetBtn id="bz"     label="Bugzilla" />
          <MetBtn id="ballot" label="Ballots" />
          <MetBtn id="filing" label="Filing" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {series.map(({ org, color }) => (
          <div key={org} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: COLORS.t2 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            {org}
          </div>
        ))}
      </div>

      <div style={{ position: 'relative' }}>
        {/* 2021 marker line */}
        <div style={{
          position: 'absolute',
          left: `${(recent2021idx / CHART_YEARS.length) * 100}%`,
          top: 0, height: BAR_H,
          width: 1, borderLeft: `1px dashed ${COLORS.ac}`,
          opacity: 0.4, zIndex: 1,
        }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: BAR_H + 18 }}>
          {CHART_YEARS.map((year, yi) => (
            <div key={year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: BAR_H, width: '100%', justifyContent: 'center' }}>
                {series.map(({ org, years, color }) => {
                  const v = years[yi];
                  const h = v > 0 ? Math.max(2, (v / maxVal) * BAR_H) : 0;
                  return (
                    <div key={org} style={{
                      width: `${Math.floor(80 / series.length)}%`,
                      height: h, background: color, opacity: 0.85,
                      borderRadius: '2px 2px 0 0', minWidth: 3,
                    }} title={`${org} ${year}: ${v}`} />
                  );
                })}
              </div>
              <div style={{ fontSize: 7, color: yi >= recent2021idx ? COLORS.t2 : COLORS.t3, marginTop: 3, fontFamily: FONT_MONO }}>
                {year.slice(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...footnoteStyle, marginTop: 4 }}>
        Bugzilla = governance comments on other CAs per year.
        Ballots = proposals + endorsements from cabforum.org URL dates.
        Dashed = 2021 recent window start. Years after 2021 shown in lighter label.
      </div>
    </Card>
  );
};

/* ── Main component ── */

const CommunityView = () => {
  const { communityData } = usePipeline();

  if (!communityData) {
    return (
      <DataPending
        tab="Ecosystem Participation"
        source="fetch_community.py -> community_engagement.json"
        description="Run: python pipeline/fetch_community.py"
      />
    );
  }

  const d = communityData;
  const [isRecent, setIsRecent] = useState(true);
  const [orgSort, setOrgSort] = useState('score');
  const [showAllZero, setShowAllZero] = useState(false);
  const [showAllInds, setShowAllInds] = useState(false);

  const orgs    = d.organizations || {};
  const inds    = d.individuals || {};
  const balInds = d.ballot_individuals || {};

  // ── Summary stats (all-time for cards) ──
  const stats = useMemo(() => {
    const members = Object.entries(orgs).filter(([, o]) => o.cabf_member);
    const active  = members.filter(([, o]) => scoreOrg(o, false) > 0);
    const zero    = members.filter(([, o]) => scoreOrg(o, false) === 0);
    const totalBz = Object.values(orgs).reduce((s, o) => s + (o.bugzilla?.bugs_engaged || 0), 0);
    const totalP  = Object.values(orgs).reduce((s, o) => s + (o.ballots?.proposed || 0), 0);
    const totalF  = Object.values(inds).reduce((s, o) => s + (o.bug_filing?.bugs_filed || 0), 0)
                  + Object.values(orgs).reduce((s, o) => s + (o.bug_filing?.bugs_filed || 0), 0);
    const top    = Object.entries(orgs).sort((a, b) => scoreOrg(b[1], false) - scoreOrg(a[1], false))[0];
    const topInd = Object.entries(inds)
      .map(([e, o]) => [e, (o.bugzilla?.bugs_engaged || 0) * 2 + (o.bug_filing?.bugs_filed || 0) * 3])
      .sort((a, b) => b[1] - a[1])[0];
    return {
      activeMembers: active.length,
      zeroMembers:   zero.length,
      totalBzBugs:   totalBz,
      totalProposed: totalP,
      totalFiled:    totalF,
      topOrg:  top?.[0] || String.fromCharCode(8212),
      topInd:  topInd?.[0] ? maskEmail(topInd[0]) : String.fromCharCode(8212),
    };
  }, [orgs, inds]);

  // ── Sorted org rows ──
  const orgRows = useMemo(() => {
    const rows = Object.entries(orgs).map(([org, o]) => {
      const bz   = isRecent ? (o.bugzilla?.recent_bugs_engaged || 0) : (o.bugzilla?.bugs_engaged || 0);
      const tech = isRecent ? (o.bugzilla?.recent_technical_comments || 0) : (o.bugzilla?.technical_comments || 0);
      const p    = isRecent ? (o.ballots?.recent_proposed || 0) : (o.ballots?.proposed || 0);
      const e    = isRecent ? (o.ballots?.recent_endorsed || 0) : (o.ballots?.endorsed || 0);
      const f    = isRecent ? (o.bug_filing?.recent_bugs_filed || 0) : (o.bug_filing?.bugs_filed || 0);
      const s    = bz * 2 + p * 3 + e + f * 3;
      return { org, o, bz, tech, p, e, f, s };
    });
    const fns = {
      score:  (a, b) => b.s - a.s || a.org.localeCompare(b.org),
      name:   (a, b) => a.org.localeCompare(b.org),
      bz:     (a, b) => b.bz - a.bz || b.s - a.s,
      ballot: (a, b) => (b.p + b.e) - (a.p + a.e) || b.s - a.s,
      filing: (a, b) => b.f - a.f || b.s - a.s,
    };
    return rows.sort(fns[orgSort] || fns.score);
  }, [orgs, isRecent, orgSort]);

  const maxBz     = Math.max(...orgRows.map(r => r.bz), 1);
  const maxBalP   = Math.max(...orgRows.map(r => r.p), 1);
  const maxBallot = Math.max(...orgRows.map(r => r.p + r.e), 1);
  const maxFiling = Math.max(...orgRows.map(r => r.f), 1);
  const activeOrgRows = orgRows.filter(r => r.s > 0);
  const zeroOrgRows   = orgRows.filter(r => r.s === 0 && r.o.cabf_member);

  // ── Sorted individuals ──
  const indRows = useMemo(() => {
    return Object.entries(inds)
      .map(([email, o]) => {
        const bz   = isRecent ? (o.bugzilla?.recent_bugs_engaged || 0) : (o.bugzilla?.bugs_engaged || 0);
        const tech = isRecent ? (o.bugzilla?.recent_technical_comments || 0) : (o.bugzilla?.technical_comments || 0);
        const f    = isRecent ? (o.bug_filing?.recent_bugs_filed || 0) : (o.bug_filing?.bugs_filed || 0);
        const found = Object.entries(balInds).find(([name]) =>
          email.toLowerCase().includes(name.toLowerCase().split(' ')[0]) ||
          name.toLowerCase().includes(email.split('@')[0].toLowerCase())
        );
        const bp = found ? (isRecent ? (found[1].recent_proposed || 0) : found[1].proposed) : 0;
        const be = found ? (isRecent ? (found[1].recent_endorsed || 0) : found[1].endorsed) : 0;
        const s  = bz * 2 + f * 3 + bp * 3 + be;
        return { email, o, bz, tech, f, bp, be, s, ip: o.cabf_interested_party };
      })
      .filter(r => r.s > 0)
      .sort((a, b) => b.s - a.s);
  }, [inds, balInds, isRecent]);

  const maxIndBz = Math.max(...indRows.map(r => r.bz), 1);
  const maxIndF  = Math.max(...indRows.map(r => r.f), 1);
  const SHOW_IND = showAllInds ? indRows.length : 20;

  // ── Ballot top contributors ──
  const balOrgRows = useMemo(() => {
    return Object.entries(orgs)
      .map(([org, o]) => ({
        org,
        p: isRecent ? (o.ballots?.recent_proposed || 0) : (o.ballots?.proposed || 0),
        e: isRecent ? (o.ballots?.recent_endorsed || 0) : (o.ballots?.endorsed || 0),
        people: o.ballots?.individuals || [],
        wgs:    o.ballots?.working_groups || [],
      }))
      .filter(r => r.p + r.e > 0)
      .sort((a, b) => (b.p * 3 + b.e) - (a.p * 3 + a.e));
  }, [orgs, isRecent]);

  // ── Shared styles ──
  const thStyle = {
    padding: '5px 8px', fontSize: 9, fontFamily: FONT_MONO, color: COLORS.t3,
    textAlign: 'left', fontWeight: 600, letterSpacing: '0.05em',
    textTransform: 'uppercase', borderBottom: `1px solid ${COLORS.bd}`, whiteSpace: 'nowrap',
  };
  const toggleStyle = {
    display: 'flex', gap: 2, background: COLORS.bg, borderRadius: 6, padding: 2, flexShrink: 0,
  };
  const toggleBtn = (active) => ({
    padding: '3px 10px', fontSize: 10, borderRadius: 4, cursor: 'pointer', border: 'none',
    background: active ? COLORS.ac : 'transparent',
    color: active ? COLORS.wh : COLORS.t3, fontWeight: active ? 600 : 400,
  });
  const SortBtn = ({ id, label }) => (
    <button onClick={() => setOrgSort(id)} style={{
      padding: '2px 8px', fontSize: 9, fontFamily: FONT_MONO, borderRadius: 3,
      border: `1px solid ${orgSort === id ? COLORS.ac : COLORS.bd}`,
      background: orgSort === id ? 'rgba(59,130,246,0.12)' : 'transparent',
      color: orgSort === id ? COLORS.ac : COLORS.t3, cursor: 'pointer',
    }}>{label}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <TabIntro quote="It might actually motivate CAs to engage more in Bugzilla incidents of other CAs and CABF discussions, including ballot proposals and endorsements. — Dimitris Zacharopoulos, HARICA">
        Voluntary ecosystem contribution beyond compliance obligations. Three signals: Bugzilla
        engagement on other CAs' bugs, CA/B Forum ballot proposals and endorsements, and proactive
        bug filing. All 56 CABF CA members appear — including those with zero contribution.
        Absence is intentionally visible.
      </TabIntro>

      {/* ── Stat cards ── */}
      <div style={{ ...statGridStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))' }}>
        <StatCard l="Active CA Members"  v={stats.activeMembers}  s={`of ${stats.activeMembers + stats.zeroMembers} CABF CAs`} />
        <StatCard l="Silent Members"     v={stats.zeroMembers}    s="no recorded contribution" c={stats.zeroMembers > 20 ? COLORS.am : COLORS.t2} />
        <StatCard l="Other-CA Bugs"      v={stats.totalBzBugs}    s="governance comments (all-time)" />
        <StatCard l="Ballots Proposed"   v={stats.totalProposed}  s="by CA organizations" c={COLORS.gn} />
        <StatCard l="Bugs Filed"         v={stats.totalFiled}     s="proactive, about other CAs" c={COLORS.pu} />
        <StatCard l="Top Organization"   v={stats.topOrg.length > 14 ? stats.topOrg.slice(0,13)+'…' : stats.topOrg} s="combined signal" c={COLORS.ac} />
        <StatCard l="Top Individual"     v={stats.topInd}         s="bugs engaged + filed" c={COLORS.cy} />
      </div>

      {/* ── Over-time chart ── */}
      <OverTimeChart orgs={orgs} />

      {/* ── CA Organizations table ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
          <CardTitle sub="All CABF CA members shown. Zero-engagement members collapsed below.">
            CA Organization Participation
          </CardTitle>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <SortBtn id="score"  label="Score" />
              <SortBtn id="name"   label="Name" />
              <SortBtn id="bz"     label="Bugzilla" />
              <SortBtn id="ballot" label="Ballots" />
              <SortBtn id="filing" label="Filing" />
            </div>
            <div style={toggleStyle}>
              {[['recent', 'Recent'], ['all', 'All Time']].map(([v, l]) => (
                <button key={v} style={toggleBtn(isRecent ? v === 'recent' : v === 'all')}
                  onClick={() => setIsRecent(v === 'recent')}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '22%' }}>Organization</th>
              <th style={{ ...thStyle, width: 50 }}></th>
              <th style={{ ...thStyle }} colSpan={2}>Bugzilla</th>
              <th style={{ ...thStyle }} colSpan={2}>Ballots</th>
              <th style={{ ...thStyle }}>Filing</th>
              <th style={{ ...thStyle }}>People</th>
            </tr>
            <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
              {['','','Other-CA bugs','Technical','Proposed','Endorsed','Bugs filed',''].map((h, i) => (
                <th key={i} style={{ ...thStyle, paddingTop: 0, borderBottom: 'none', color: COLORS.t3, fontSize: 8 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeOrgRows.map(({ org, o, bz, tech, p, e, f }) => (
              <tr key={org} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                <td style={{ padding: '6px 8px', fontSize: 11, color: COLORS.tx, fontWeight: 500 }}>{org}</td>
                <td style={{ padding: '6px 8px' }}>{o.cabf_member && <CABFBadge />}</td>
                <td style={{ padding: '6px 8px' }}><MiniBar value={bz}   max={maxBz}     color={COLORS.ac} /></td>
                <td style={{ padding: '6px 8px' }}><MiniBar value={tech} max={maxBz}     color={COLORS.cy} width={48} /></td>
                <td style={{ padding: '6px 8px' }}><MiniBar value={p}    max={maxBalP}   color={COLORS.gn} /></td>
                <td style={{ padding: '6px 8px' }}><MiniBar value={e}    max={maxBallot} color={COLORS.tl} width={48} /></td>
                <td style={{ padding: '6px 8px' }}><MiniBar value={f}    max={maxFiling} color={COLORS.pu} /></td>
                <td style={{ padding: '6px 8px', fontSize: 9, color: COLORS.t3, maxWidth: 160, lineHeight: 1.4 }}>
                  {(o.ballots?.individuals || []).join(', ')}
                </td>
              </tr>
            ))}

            {/* Zero-engagement CABF members */}
            {zeroOrgRows.length > 0 && (
              <>
                <tr>
                  <td colSpan={8} style={{ padding: '8px 8px 4px', borderTop: `1px solid ${COLORS.bd}` }}>
                    <button onClick={() => setShowAllZero(v => !v)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: COLORS.t3, fontSize: 10, fontFamily: FONT_MONO, padding: 0,
                    }}>
                      {showAllZero ? String.fromCharCode(9650) : String.fromCharCode(9660)}{' '}
                      {zeroOrgRows.length} CABF CA member{zeroOrgRows.length !== 1 ? 's' : ''} with no recorded community contribution
                    </button>
                  </td>
                </tr>
                {showAllZero && zeroOrgRows.map(({ org }) => (
                  <tr key={org} style={{ borderBottom: `1px solid ${COLORS.bd}`, opacity: 0.45 }}>
                    <td style={{ padding: '5px 8px', fontSize: 11, color: COLORS.t3 }}>{org}</td>
                    <td style={{ padding: '5px 8px' }}><CABFBadge /></td>
                    <td colSpan={6} style={{ padding: '5px 8px', fontSize: 10, color: COLORS.t3, fontStyle: 'italic' }}>
                      no public ecosystem contribution recorded
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>

        <div style={{ ...footnoteStyle, marginTop: 8 }}>
          {isRecent
            ? <><strong style={{ color: COLORS.t2 }}>Recent:</strong>{' Bugzilla and ballot data from the recent window only. '}</>
            : 'All time: 2014 to present. '}
          Bugzilla counts genuine governance comments only (LLM-filtered, self-incident excluded).
          Ballots: proposals and endorsements only — votes are a membership obligation and are excluded.
          Root program staff excluded.
        </div>
      </Card>

      {/* ── Standards Leadership ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <CardTitle sub="Proposals = wrote the ballot language. Endorsements = co-sponsored. Votes excluded — membership obligation.">
            Standards Leadership
          </CardTitle>
          <div style={toggleStyle}>
            {[['recent', 'Recent'], ['all', 'All Time']].map(([v, l]) => (
              <button key={v} style={toggleBtn(isRecent ? v === 'recent' : v === 'all')}
                onClick={() => setIsRecent(v === 'recent')}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          {balOrgRows.map(({ org, p, e, people, wgs }) => (
            <div key={org} style={{
              background: COLORS.s2, borderRadius: 6, padding: '8px 12px',
              border: `1px solid ${COLORS.bd}`, minWidth: 155, flex: '1 1 155px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.tx, marginBottom: 4 }}>{org}</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                <div>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 16, color: COLORS.gn, fontWeight: 700 }}>{p}</span>
                  <span style={{ fontSize: 9, color: COLORS.t3, marginLeft: 3 }}>proposed</span>
                </div>
                <div>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 16, color: COLORS.tl, fontWeight: 700 }}>{e}</span>
                  <span style={{ fontSize: 9, color: COLORS.t3, marginLeft: 3 }}>endorsed</span>
                </div>
              </div>
              {wgs.length > 0 && <div style={{ fontSize: 8, color: COLORS.t3, fontFamily: FONT_MONO }}>{wgs.join(' · ')}</div>}
              {people.length > 0 && (
                <div style={{ fontSize: 9, color: COLORS.t3, marginTop: 3, lineHeight: 1.5 }}>
                  {people.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ ...footnoteStyle, marginTop: 8 }}>
          People listed per organization reflect their affiliation at the time of the ballot — individuals who have since moved organizations may appear under a former employer.
        </div>
      </Card>

      {/* ── Individuals ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <CardTitle sub="Individuals participating without a CA or root program hat. Includes CA staff acting as individuals, independent researchers, and CABF Interested Parties (IP).">
            Individual Participants
          </CardTitle>
          <div style={toggleStyle}>
            {[['recent', 'Recent'], ['all', 'All Time']].map(([v, l]) => (
              <button key={v} style={toggleBtn(isRecent ? v === 'recent' : v === 'all')}
                onClick={() => setIsRecent(v === 'recent')}>{l}</button>
            ))}
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '34%' }}>Participant</th>
              <th style={{ ...thStyle, width: 50 }}>CABF</th>
              <th style={{ ...thStyle }}>Bugzilla bugs</th>
              <th style={{ ...thStyle }}>Technical</th>
              <th style={{ ...thStyle }}>Bugs filed</th>
              <th style={{ ...thStyle }}>Ballots</th>
            </tr>
          </thead>
          <tbody>
            {indRows.slice(0, SHOW_IND).map(({ email, bz, tech, f, bp, be, ip }) => (
              <tr key={email} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                <td style={{ padding: '5px 8px' }}>
                  <div style={{ fontSize: 11, color: COLORS.tx, fontFamily: FONT_MONO }}>{maskEmail(email)}</div>
                  {ip && <div style={{ fontSize: 9, color: COLORS.ac, marginTop: 1 }}>{ip}</div>}
                </td>
                <td style={{ padding: '5px 8px' }}>{ip && <IPBadge />}</td>
                <td style={{ padding: '5px 8px' }}><MiniBar value={bz}   max={maxIndBz} color={COLORS.ac} /></td>
                <td style={{ padding: '5px 8px' }}><MiniBar value={tech} max={maxIndBz} color={COLORS.cy} width={48} /></td>
                <td style={{ padding: '5px 8px' }}><MiniBar value={f}    max={maxIndF}  color={COLORS.pu} /></td>
                <td style={{ padding: '5px 8px', fontFamily: FONT_MONO, fontSize: 10, color: COLORS.t3 }}>
                  {bp > 0 || be > 0 ? `${bp}P / ${be}E` : String.fromCharCode(8212)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {indRows.length > 20 && (
          <button onClick={() => setShowAllInds(v => !v)} style={{
            marginTop: 8, background: 'none', border: `1px solid ${COLORS.bd}`,
            borderRadius: 4, cursor: 'pointer', color: COLORS.t3, fontSize: 10,
            fontFamily: FONT_MONO, padding: '4px 12px', width: '100%',
          }}>
            {showAllInds
              ? `${String.fromCharCode(9650)} Show fewer`
              : `${String.fromCharCode(9660)} Show all ${indRows.length} participants`}
          </button>
        )}
        <div style={{ ...footnoteStyle, marginTop: 8 }}>
          IP = CABF Interested Party (formal observer, signed IPR agreement).
          {isRecent ? ' Showing 2021+ activity.' : ''}
          Ballot activity matched by name from cabforum.org ballot text.
        </div>
      </Card>

      {/* ── Methodology ── */}
      <MethodologyCard>
        <MethodologyItem label="What This Measures">
          Voluntary ecosystem contribution beyond compliance obligations: Bugzilla engagement on
          other CAs' compliance bugs, CA/B Forum ballot proposals and endorsements (not votes),
          and proactive bug filing about issues found in other CAs' certificates or operations.
          Root program staff excluded. Self-incident responses excluded.
        </MethodologyItem>
        <MethodologyItem label="CABF Baseline and Recent Window">
          All 56 current CABF CA members appear as rows, including those with zero engagement.
          Absence is intentionally visible.
          Recent = 2021 and later for all three signals: Bugzilla comments by timestamp,
          ballot activity by ballot publication date extracted from cabforum.org URLs.
          This makes the Recent toggle consistent across all signals.
        </MethodologyItem>
        <MethodologyItem label="Bugzilla Engagement">
          LLM-classified (claude-haiku): genuine governance comments on other CAs only.
          Two columns shown: Other-CA bugs (any governance comment) and Technical (substantive
          analysis — cert or CRL findings, specific BR citations, investigative questions).
          {d.meta?.total_orgs ? ` ${d.meta.total_orgs} participating organizations and individuals in corpus.` : ''}
        </MethodologyItem>
        <MethodologyItem label="Ballot Leadership">
          Proposals carry more signal than endorsements — proposing requires writing ballot
          language and building consensus. Votes are excluded as a membership obligation.
          Scraped from cabforum.org across SC, CSC, SMC, NS working groups.
          Individual names normalized from raw text to resolve last-name-only references.
        </MethodologyItem>
        <MethodologyItem label="Proactive Bug Filing">
          Opening Bugzilla bugs about compliance issues found in other CAs' operations.
          Rarest and highest-signal behavior. Self-filing excluded via CA org alias matching.
        </MethodologyItem>
        <MethodologyItem label="What This Does Not Capture">
          Private mailing list participation, in-person meeting contributions, bilateral
          CA-to-CA communication, and OTR ballot collaboration. The observable record is not
          complete. It is, however, the only one available for independent accountability.
        </MethodologyItem>
      </MethodologyCard>

    </div>
  );
};

export default CommunityView;
