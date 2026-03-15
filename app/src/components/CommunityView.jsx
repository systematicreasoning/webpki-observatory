/**
 * CommunityView — Tab 13: Ecosystem Health
 *
 * Shows voluntary ecosystem contribution by CA organizations and individuals
 * beyond their own compliance obligations. Three signals:
 *   1. Bugzilla engagement on other CAs' compliance bugs
 *   2. CA/B Forum ballot proposals and endorsements (not votes)
 *   3. Proactive bug filing about other CAs' issues
 *
 * The CABF member roster is used as the baseline — all 56 CA members appear
 * even with zero engagement, making absence as visible as presence.
 *
 * Data source: data/community_engagement.json (from fetch_community.py)
 */
import React, { useState, useMemo } from 'react';
import { COLORS, FONT_MONO, FONT_SANS } from '../constants';
import {
  Card, CardTitle, DataPending, StatCard, TabIntro,
  MethodologyCard, MethodologyItem,
} from './shared';
import { usePipeline } from '../PipelineContext';
import { statGridStyle, footnoteStyle } from '../styles';

/* ── helpers ── */

function score(org) {
  const bz = org.bugzilla?.bugs_engaged || 0;
  const p  = org.ballots?.proposed || 0;
  const e  = org.ballots?.endorsed || 0;
  const f  = org.bug_filing?.bugs_filed || 0;
  return bz * 2 + p * 3 + e + f * 3;
}

function scoreInd(ind) {
  return (ind.bugzilla?.bugs_engaged || 0) * 2 + (ind.bug_filing?.bugs_filed || 0) * 3;
}

const MiniBar = ({ value, max, color, width = 60 }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
      <div style={{ width, height: 6, background: COLORS.bd, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: value > 0 ? COLORS.t2 : COLORS.t3, minWidth: 22, textAlign: 'right' }}>
        {value > 0 ? value : '—'}
      </span>
    </div>
  );
};

const MemberBadge = ({ isMember }) => isMember ? (
  <span style={{
    fontSize: 8, fontFamily: FONT_MONO, fontWeight: 700,
    padding: '1px 5px', borderRadius: 3,
    background: 'rgba(59,130,246,0.1)', color: COLORS.ac,
    border: `1px solid rgba(59,130,246,0.2)`,
    letterSpacing: '0.05em',
  }}>CABF</span>
) : null;

const ZeroRow = ({ org }) => (
  <tr style={{ borderBottom: `1px solid ${COLORS.bd}`, opacity: 0.45 }}>
    <td style={{ padding: '5px 8px', fontSize: 11, color: COLORS.t3 }}>{org}</td>
    <td style={{ padding: '5px 8px', textAlign: 'center' }}><MemberBadge isMember /></td>
    <td colSpan={6} style={{ padding: '5px 8px', fontSize: 10, color: COLORS.t3, fontStyle: 'italic' }}>
      no public ecosystem contribution recorded
    </td>
  </tr>
);

/* ── Main component ── */

const CommunityView = () => {
  const { communityData } = usePipeline();

  if (!communityData) {
    return (
      <DataPending
        tab="Ecosystem Participation"
        source="fetch_community.py → community_engagement.json"
        description="Run: python pipeline/fetch_community.py"
      />
    );
  }

  const d = communityData;
  const [isRecent, setIsRecent] = useState(true);
  const [orgSort, setOrgSort] = useState('score');
  const [showAllZero, setShowAllZero] = useState(false);
  const [showAllInds, setShowAllInds] = useState(false);

  const orgs = d.organizations || {};
  const inds = d.individuals || {};
  const balInds = d.ballot_individuals || {};

  // ── Derived stats ──
  const { activeMembers, zeroMembers, totalBzBugs, topOrg } = useMemo(() => {
    const members = Object.entries(orgs).filter(([, o]) => o.cabf_member);
    const active = members.filter(([, o]) => score(o) > 0);
    const zero = members.filter(([, o]) => score(o) === 0);
    const totalBugs = Object.values(orgs).reduce((s, o) => s + (o.bugzilla?.bugs_engaged || 0), 0);
    const top = Object.entries(orgs).sort((a, b) => score(b[1]) - score(a[1]))[0];
    return {
      activeMembers: active.length,
      zeroMembers: zero.length,
      totalBzBugs: totalBugs,
      topOrg: top ? top[0] : '—',
    };
  }, [orgs]);

  // ── Sorted org rows ──
  const orgRows = useMemo(() => {
    const get = (org, o) => {
      const bz  = isRecent ? (o.bugzilla?.recent_bugs_engaged || 0) : (o.bugzilla?.bugs_engaged || 0);
      const tech= isRecent ? (o.bugzilla?.recent_technical_comments || 0) : (o.bugzilla?.technical_comments || 0);
      const p   = isRecent ? (o.ballots?.recent_proposed || 0) : (o.ballots?.proposed || 0);
      const e   = isRecent ? (o.ballots?.recent_endorsed || 0) : (o.ballots?.endorsed || 0);
      const f   = isRecent ? (o.bug_filing?.recent_bugs_filed || 0) : (o.bug_filing?.bugs_filed || 0);
      const s   = bz * 2 + p * 3 + e + f * 3;
      return { org, o, bz, tech, p, e, f, s };
    };

    const rows = Object.entries(orgs).map(([org, o]) => get(org, o));

    const sortFns = {
      score: (a, b) => b.s - a.s || a.org.localeCompare(b.org),
      name:  (a, b) => a.org.localeCompare(b.org),
      bz:    (a, b) => b.bz - a.bz || b.s - a.s,
      ballot:(a, b) => (b.p + b.e) - (a.p + a.e) || b.s - a.s,
      filing:(a, b) => b.f - a.f || b.s - a.s,
    };

    return rows.sort(sortFns[orgSort] || sortFns.score);
  }, [orgs, isRecent, orgSort]);

  const maxBz    = Math.max(...orgRows.map(r => r.bz), 1);
  const maxBallot= Math.max(...orgRows.map(r => r.p + r.e), 1);
  const maxFiling= Math.max(...orgRows.map(r => r.f), 1);

  const activeOrgRows = orgRows.filter(r => r.s > 0);
  const zeroOrgRows   = orgRows.filter(r => r.s === 0 && r.o.cabf_member);

  // ── Sorted individuals ──
  const indRows = useMemo(() => {
    return Object.entries(inds)
      .map(([email, o]) => {
        const bz   = isRecent ? (o.bugzilla?.recent_bugs_engaged || 0) : (o.bugzilla?.bugs_engaged || 0);
        const tech = isRecent ? (o.bugzilla?.recent_technical_comments || 0) : (o.bugzilla?.technical_comments || 0);
        const f    = isRecent ? (o.bug_filing?.recent_bugs_filed || 0) : (o.bug_filing?.bugs_filed || 0);
        const balEntry = Object.entries(balInds).find(([name]) =>
          email.toLowerCase().includes(name.toLowerCase().split(' ')[0]) ||
          name.toLowerCase().includes(email.split('@')[0].toLowerCase())
        );
        const bp = balEntry ? balEntry[1].proposed : 0;
        const be = balEntry ? balEntry[1].endorsed : 0;
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
        wgs: o.ballots?.working_groups || [],
      }))
      .filter(r => r.p + r.e > 0)
      .sort((a, b) => (b.p * 3 + b.e) - (a.p * 3 + a.e));
  }, [orgs, isRecent]);

  const maxBalP = Math.max(...balOrgRows.map(r => r.p), 1);

  const SortBtn = ({ id, label }) => (
    <button onClick={() => setOrgSort(id)} style={{
      padding: '2px 8px', fontSize: 9, fontFamily: FONT_MONO,
      borderRadius: 3, border: `1px solid ${orgSort === id ? COLORS.ac : COLORS.bd}`,
      background: orgSort === id ? 'rgba(59,130,246,0.12)' : 'transparent',
      color: orgSort === id ? COLORS.ac : COLORS.t3, cursor: 'pointer',
    }}>{label}</button>
  );

  const thStyle = {
    padding: '5px 8px', fontSize: 9, fontFamily: FONT_MONO,
    color: COLORS.t3, textAlign: 'left', fontWeight: 600,
    letterSpacing: '0.05em', textTransform: 'uppercase',
    borderBottom: `1px solid ${COLORS.bd}`,
    whiteSpace: 'nowrap',
  };

  const toggleStyle = {
    display: 'flex', gap: 2, background: COLORS.bg,
    borderRadius: 6, padding: 2, flexShrink: 0,
  };
  const toggleBtn = (active) => ({
    padding: '3px 10px', fontSize: 10, borderRadius: 4,
    cursor: 'pointer', border: 'none',
    background: active ? COLORS.ac : 'transparent',
    color: active ? COLORS.wh : COLORS.t3,
    fontWeight: active ? 600 : 400,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <TabIntro quote="It might actually motivate CAs to engage more in Bugzilla incidents of other CAs and CABF discussions, including ballot proposals and endorsements. — Dimitris Zacharopoulos, HARICA">
        This tab measures voluntary ecosystem contribution — participation in CA compliance
        governance beyond a CA's own obligations. Three signals: Bugzilla engagement on other
        CAs' bugs, CA/B Forum ballot proposals and endorsements, and proactive bug filing.
        All 56 CABF CA members appear as rows, including those with zero engagement.
        Absence is intentionally visible.
      </TabIntro>

      {/* ── Stat cards ── */}
      <div style={statGridStyle}>
        <StatCard l="Active CA Members" v={activeMembers} s={`of ${activeMembers + zeroMembers} CABF CA members`} />
        <StatCard l="Silent Members" v={zeroMembers} s="no recorded community contribution" c={zeroMembers > 30 ? COLORS.am : COLORS.t2} />
        <StatCard l="Other-CA Bugs Engaged" v={totalBzBugs.toLocaleString()} s="governance comments on other CAs' incidents" />
        <StatCard l="Most Active Org" v={topOrg.length > 18 ? topOrg.slice(0, 16) + '…' : topOrg} s="by combined signal" c={COLORS.ac} />
      </div>

      {/* ── CA Organizations ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
          <CardTitle sub="All CABF CA members shown. Sorted by combined activity. CABF badge = formal CA/B Forum member.">
            CA Organization Participation
          </CardTitle>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <SortBtn id="score" label="Score" />
              <SortBtn id="name" label="Name" />
              <SortBtn id="bz" label="Bugzilla" />
              <SortBtn id="ballot" label="Ballots" />
              <SortBtn id="filing" label="Filing" />
            </div>
            <div style={toggleStyle}>
              {[['all', 'All Time'], ['recent', 'Recent']].map(([v, l]) => (
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
              <th style={{ ...thStyle, width: '20%' }} colSpan={2}>Bugzilla Engagement</th>
              <th style={{ ...thStyle, width: '18%' }} colSpan={2}>Ballot Leadership</th>
              <th style={{ ...thStyle, width: '18%' }}>Proactive Filing</th>
              <th style={{ ...thStyle, width: '10%' }}>People</th>
            </tr>
            <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
              <th style={{ ...thStyle, paddingTop: 0, borderBottom: 'none' }}></th>
              <th style={{ ...thStyle, paddingTop: 0, borderBottom: 'none' }}></th>
              <th style={{ ...thStyle, paddingTop: 0, borderBottom: 'none', color: COLORS.t3 }}>Other-CA bugs</th>
              <th style={{ ...thStyle, paddingTop: 0, borderBottom: 'none', color: COLORS.t3 }}>Technical cmts</th>
              <th style={{ ...thStyle, paddingTop: 0, borderBottom: 'none', color: COLORS.t3 }}>Proposed</th>
              <th style={{ ...thStyle, paddingTop: 0, borderBottom: 'none', color: COLORS.t3 }}>Endorsed</th>
              <th style={{ ...thStyle, paddingTop: 0, borderBottom: 'none', color: COLORS.t3 }}>Bugs filed</th>
              <th style={{ ...thStyle, paddingTop: 0, borderBottom: 'none' }}></th>
            </tr>
          </thead>
          <tbody>
            {activeOrgRows.map(({ org, o, bz, tech, p, e, f }) => (
              <tr key={org} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                <td style={{ padding: '6px 8px', fontSize: 11, color: COLORS.tx, fontWeight: 500 }}>{org}</td>
                <td style={{ padding: '6px 8px' }}><MemberBadge isMember={o.cabf_member} /></td>
                <td style={{ padding: '6px 8px' }}>
                  <MiniBar value={bz} max={maxBz} color={COLORS.ac} />
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <MiniBar value={tech} max={maxBz} color={COLORS.cy} width={48} />
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <MiniBar value={p} max={maxBalP} color={COLORS.gn} />
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <MiniBar value={e} max={maxBallot} color={COLORS.tl} width={48} />
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <MiniBar value={f} max={maxFiling} color={COLORS.pu} />
                </td>
                <td style={{ padding: '6px 8px', fontSize: 9, color: COLORS.t3, maxWidth: 120 }}>
                  {(o.ballots?.individuals || []).slice(0, 2).join(', ')}
                  {(o.ballots?.individuals || []).length > 2 && ` +${(o.ballots.individuals.length - 2)}`}
                </td>
              </tr>
            ))}

            {/* Zero-engagement CABF members */}
            {zeroOrgRows.length > 0 && (
              <>
                <tr>
                  <td colSpan={8} style={{ padding: '8px 8px 4px', fontSize: 10, color: COLORS.t3, borderTop: `1px solid ${COLORS.bd}` }}>
                    <button
                      onClick={() => setShowAllZero(v => !v)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.t3, fontSize: 10, fontFamily: FONT_MONO, padding: 0 }}
                    >
                      {showAllZero ? '▲' : '▼'} {zeroOrgRows.length} CABF member{zeroOrgRows.length !== 1 ? 's' : ''} with no recorded community contribution
                    </button>
                  </td>
                </tr>
                {showAllZero && zeroOrgRows.map(({ org }) => (
                  <ZeroRow key={org} org={org} />
                ))}
              </>
            )}
          </tbody>
        </table>

        <div style={{ ...footnoteStyle, marginTop: 8 }}>
          {isRecent
            ? <><strong style={{ color: COLORS.t2 }}>Recent:</strong>{' Bugzilla 2021+, last 50 CABF ballots. '}</>
            : 'All time: 2014–present. '}
          Bugzilla: genuine governance comments on other CAs only — admin noise and self-incident excluded.
          Ballots: proposals and endorsements only — votes excluded (membership obligation).
          Filing: bugs opened about other CAs' compliance issues.
          Root program staff (Chrome, Mozilla, Apple, Microsoft) excluded — they have the Governance Risk tab.
        </div>
      </Card>

      {/* ── Ballot Leadership detail ── */}
      <Card>
        <CardTitle sub="CA/B Forum ballots proposed and endorsed by CA organizations. Proposals carry higher weight — requires writing ballot language and building consensus. Endorsements = co-sponsorship. Votes excluded.">
          Standards Leadership — Ballot Proposals and Endorsements
        </CardTitle>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          {balOrgRows.map(({ org, p, e, people, wgs }) => (
            <div key={org} style={{
              background: COLORS.s2, borderRadius: 6, padding: '8px 12px',
              border: `1px solid ${COLORS.bd}`, minWidth: 160, flex: '1 1 160px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.tx, marginBottom: 4 }}>{org}</div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 14, color: COLORS.gn, fontWeight: 700 }}>{p}</span>
                <span style={{ fontSize: 9, color: COLORS.t3, alignSelf: 'flex-end', paddingBottom: 2 }}>proposed</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 14, color: COLORS.tl, fontWeight: 700 }}>{e}</span>
                <span style={{ fontSize: 9, color: COLORS.t3, alignSelf: 'flex-end', paddingBottom: 2 }}>endorsed</span>
              </div>
              {wgs.length > 0 && (
                <div style={{ fontSize: 8, color: COLORS.t3, fontFamily: FONT_MONO }}>{wgs.join(' · ')}</div>
              )}
              {people.length > 0 && (
                <div style={{ fontSize: 9, color: COLORS.t3, marginTop: 3 }}>
                  {people.slice(0, 3).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* ── Individuals ── */}
      <Card>
        <CardTitle sub="Individuals participating in ecosystem governance — not affiliated with a root program or acting in a root program capacity. Includes CA staff participating as individuals, independent researchers, and CABF Interested Parties.">
          Individual Participants
        </CardTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '32%' }}>Participant</th>
              <th style={{ ...thStyle, width: 60 }}>CABF</th>
              <th style={{ ...thStyle, width: '20%' }}>Bugzilla bugs</th>
              <th style={{ ...thStyle, width: '16%' }}>Technical</th>
              <th style={{ ...thStyle, width: '14%' }}>Bugs filed</th>
              <th style={{ ...thStyle, width: '18%' }}>Ballots</th>
            </tr>
          </thead>
          <tbody>
            {indRows.slice(0, SHOW_IND).map(({ email, bz, tech, f, bp, be, ip }) => {
              const maxB = Math.max(maxIndBz, 1);
              const maxF2 = Math.max(maxIndF, 1);
              return (
                <tr key={email} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                  <td style={{ padding: '5px 8px' }}>
                    <div style={{ fontSize: 11, color: COLORS.tx, fontFamily: FONT_MONO }}>{email}</div>
                    {ip && <div style={{ fontSize: 9, color: COLORS.ac, marginTop: 1 }}>{ip}</div>}
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    {ip && (
                      <span style={{
                        fontSize: 8, fontFamily: FONT_MONO, fontWeight: 700,
                        padding: '1px 4px', borderRadius: 3,
                        background: 'rgba(16,185,129,0.1)', color: COLORS.gn,
                        border: `1px solid rgba(16,185,129,0.2)`,
                      }}>IP</span>
                    )}
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <MiniBar value={bz} max={maxB} color={COLORS.ac} />
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <MiniBar value={tech} max={maxB} color={COLORS.cy} width={48} />
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <MiniBar value={f} max={maxF2} color={COLORS.pu} />
                  </td>
                  <td style={{ padding: '5px 8px', fontFamily: FONT_MONO, fontSize: 10, color: COLORS.t3 }}>
                    {bp > 0 || be > 0 ? `${bp}P / ${be}E` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {indRows.length > 20 && (
          <button
            onClick={() => setShowAllInds(v => !v)}
            style={{
              marginTop: 8, background: 'none', border: `1px solid ${COLORS.bd}`,
              borderRadius: 4, cursor: 'pointer', color: COLORS.t3, fontSize: 10,
              fontFamily: FONT_MONO, padding: '4px 12px', width: '100%',
            }}
          >
            {showAllInds ? '▲ Show fewer' : `▼ Show all ${indRows.length} participants`}
          </button>
        )}
        <div style={{ ...footnoteStyle, marginTop: 8 }}>
          IP = CABF Interested Party (formal observer status).
          Ballot proposals/endorsements shown where parseable from cabforum.org ballot text.
          Some contributions (mailing list activity, in-person meeting participation) are not captured.
        </div>
      </Card>

      {/* ── Methodology ── */}
      <MethodologyCard>
        <MethodologyItem label="What This Measures">
          Voluntary ecosystem contribution beyond a CA's own compliance obligations.
          Three signals: Bugzilla engagement on other CAs' compliance bugs (commenting substantively on incidents you are not party to), CA/B Forum ballot proposals and endorsements (not votes — votes are a membership obligation), and proactive bug filing (opening Bugzilla bugs about compliance issues you found in other CAs' certificates or operations).
          Root program staff are excluded — they have their own tab (Governance Risk).
          Self-incident responses are excluded — a CA commenting on its own bugs is compliance behavior, not community contribution.
        </MethodologyItem>
        <MethodologyItem label="The CABF Baseline">
          All 56 current CA/B Forum CA members appear as rows, including those with zero engagement across all three signals.
          This is intentional. The motivation for this tab — as articulated by Dimitris Zacharopoulos of HARICA — is that visible public participation records may encourage broader engagement.
          A CA seeing their row blank next to peers who actively participate creates a legible accountability signal that no private reporting mechanism can provide.
          Absence does not imply bad CA behavior — a CA with zero incidents and zero community engagement may be doing everything right. But the public record shows only what it shows.
        </MethodologyItem>
        <MethodologyItem label="Bugzilla Engagement">
          Comments on other CAs' compliance bugs, filtered for genuine governance content.
          LLM-classified (claude-haiku): first pass removes administrative noise (acknowledgments, boilerplate survey notices, tracking bug openers).
          Second pass separates technical comments (cert/CRL analysis, specific BR citations, investigative questions about CA practices) from process comments (status requests, procedural reminders).
          Both technical and process comments count toward bug engagement. Technical comments are shown separately as the higher-quality signal.
          {d.meta?.total_orgs ? ` ${d.meta.total_orgs} participating organizations and individuals in corpus.` : ''}
        </MethodologyItem>
        <MethodologyItem label="Ballot Leadership">
          Scraped from cabforum.org across SC (Server Certificate), CSC (Code Signing), SMC (S/MIME), and NS (Network Security) working groups.
          Proposer = wrote the ballot language and drove it to vote. Endorser = co-sponsored the ballot. Both require active engagement with the substance of the policy change.
          Vote participation is intentionally excluded — all CA members are expected to vote. Proposing and endorsing is voluntary and signals genuine investment in standards direction.
          Recent window = last 50 ballots across all working groups.
        </MethodologyItem>
        <MethodologyItem label="Proactive Bug Filing">
          Counts bugs opened about compliance issues found in other CAs' certificates or operations.
          Excludes self-incident reporting (a CA filing bugs about its own issues) and bugs filed by root program staff in their official capacity.
          Time-bounded attribution: Wayne Thayer's Fastly-addressed comments are attributed to Mozilla for the period he was Mozilla's root program lead (2017–2020), consistent with the Governance Risk tab.
          This is the rarest and highest-signal behavior — it requires independent monitoring capability and the initiative to surface issues publicly rather than privately.
        </MethodologyItem>
        <MethodologyItem label="Individuals Section">
          Individuals who participate in ecosystem governance without a CA or root program hat.
          Includes CA staff participating as individuals (e.g., commenting outside their organizational role), independent researchers, security professionals, and CABF Interested Parties.
          CABF Interested Party (IP) = formal observer status with signed IPR agreement. Can participate on mailing lists and in discussions but cannot vote.
          Email addresses are shown as-is from the public Bugzilla record. Name resolution is not attempted for privacy reasons.
          Ballot activity for individuals is parsed from ballot proposer/endorser text and matched by name — some entries may be incomplete.
        </MethodologyItem>
        <MethodologyItem label="What This Does Not Capture">
          Private mailing list participation (mdsp, CABF member list), in-person meeting contributions, bilateral CA-to-CA communication, and OTR collaboration on ballots.
          The observable record is not a complete record. It is, however, the only record available for independent accountability.
        </MethodologyItem>
      </MethodologyCard>

    </div>
  );
};

export default CommunityView;
