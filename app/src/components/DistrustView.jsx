/**
 * DistrustView — Tab 11: Distrust History
 *
 * Every CA removed from browser trust stores, classified from Bugzilla evidence,
 * MDSP mailing list threads, CCADB discussions, and root program announcements.
 *
 * Data source: pipeline/distrust/distrusted.json (embedded at build time)
 */
import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { COLORS, STORE_COLORS, FONT_MONO, FONT_SANS } from '../constants';
import {
  Card, CardTitle, StatCard, ChartTooltip as TT, ChartWrap, DataMeta, DataPending, Paginator, TabIntro,
  MethodologyCard, MethodologyItem,
} from './shared';
import { usePipeline } from '../PipelineContext';
import {
  statGridStyle, compactTableStyle, scrollXStyle, footnoteStyle, expandableRowStyle,
  expandChevron, expandedCellStyle, legendRowStyle, legendDot, infoTag, sectionLabelStyle,
} from '../styles';

/* ── Constants ── */

const POSTURE_COLORS = {
  willful_circumvention: COLORS.rd,
  argumentative_noncompliance: '#e879f9',
  negligent_noncompliance: COLORS.am,
  demonstrated_incompetence: '#38bdf8',
  accidental: COLORS.g5,
};

const POSTURE_LABELS = {
  willful_circumvention: 'Willful',
  argumentative_noncompliance: 'Argumentative',
  negligent_noncompliance: 'Negligent',
  demonstrated_incompetence: 'Incompetent',
  accidental: 'Accidental',
};

const PATHWAY_COLORS = {
  immediate: COLORS.rd, triggered: COLORS.or, gradual: COLORS.am, negotiated: COLORS.ac,
};
const PATHWAY_LABELS = {
  immediate: 'Immediate', triggered: 'Triggered', gradual: 'Gradual', negotiated: 'Negotiated',
};
const RESPONSE_LABELS = {
  cooperative: 'Cooperative', inadequate: 'Inadequate', deceptive: 'Deceptive',
  non_responsive: 'Non-Responsive', moot: 'Moot',
};
const RESPONSE_COLORS = {
  cooperative: COLORS.gn, inadequate: COLORS.am, deceptive: COLORS.rd,
  non_responsive: COLORS.g5, moot: COLORS.t3,
};
const ROOT_CAUSE_LABELS = {
  infrastructure_compromise: 'Infrastructure', misissuance: 'Misissuance',
  compliance_failure: 'Compliance', operational_security: 'Operational',
  organizational_trust: 'Organizational',
};
const MILESTONE_COLORS = {
  first_bug: COLORS.t3, incident: COLORS.rd, public_discovery: COLORS.or,
  mdsp_escalation: COLORS.am, root_program_announcement: COLORS.ac,
  distrust_effective: COLORS.pu, business_outcome: COLORS.g5,
};
const MILESTONE_LABELS = {
  first_bug: 'First Bug', incident: 'Incident', public_discovery: 'Discovery',
  mdsp_escalation: 'MDSP Escalation', root_program_announcement: 'RP Announcement',
  distrust_effective: 'Distrust Effective', business_outcome: 'Business Outcome',
};
const TIER_COLORS = {
  curated: COLORS.gn, high: COLORS.ac, medium_high: COLORS.am, medium: COLORS.t3, low: COLORS.rd,
};
const TIER_LABELS = {
  curated: 'Curated', high: 'High', medium_high: 'Med-High', medium: 'Medium', low: 'Low',
};

const TAG_SHORT = {
  baseline_requirements_violations: 'BR Violations', pattern_of_issues: 'Pattern of Issues',
  rogue_certificate_issuance: 'Rogue Issuance', inadequate_incident_response: 'Inadequate Response',
  lack_of_meaningful_improvement: 'No Improvement', non_responsive_to_root_programs: 'Non-Responsive',
  unauthorized_delegation: 'Unauthorized Delegation', validation_bypass: 'Validation Bypass',
  delayed_or_refused_revocation: 'Delayed Revocation', certificates_used_for_mitm: 'MITM Usage',
  audit_deficiencies: 'Audit Deficiencies', active_deception: 'Active Deception',
  hidden_corporate_changes: 'Hidden Corp Changes', argued_rules_dont_apply: 'Argued Rules N/A',
  minimized_severity: 'Minimized Severity', operational_security_failures: 'OpSec Failures',
  limited_ecosystem_value: 'Limited Value', demonstrated_lack_of_understanding: 'Lack of Understanding',
  infrastructure_compromise: 'Infrastructure Breach', concealed_breach_or_incident: 'Concealed Breach',
  ties_to_adversarial_entities: 'Adversarial Ties', recharacterized_incidents: 'Recharacterized',
};

const SRC_NAMES = {
  'blog.mozilla.org': 'Mozilla Blog', 'security.googleblog.com': 'Chrome Blog',
  'krebsonsecurity.com': 'Krebs on Security', 'venafi.com': 'Venafi',
  'www.theregister.com': 'The Register', 'www.ghacks.net': 'gHacks',
  'www.feistyduck.com': 'Feisty Duck', 'ian.sh': 'Ian Carroll',
  'threatpost.com': 'Threatpost', 'groups.google.com': 'MDSP',
  'arstechnica.com': 'Ars Technica', 'www.washingtonpost.com': 'Washington Post',
  'blog.cloudflare.com': 'Cloudflare Blog', 'www.bleepingcomputer.com': 'Bleeping Computer',
  'en.wikipedia.org': 'Wikipedia', 'www.enisa.europa.eu': 'ENISA',
  'digitalcommons.usf.edu': 'Journal of Strategic Security',
  'www.researchgate.net': 'ResearchGate',
};

/* ── Helpers ── */

const fmtTag = (t) => TAG_SHORT[t] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fmtRunway = (days) => {
  if (!days || days <= 0) return '—';
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  return y > 0 ? `${y}y ${m}m` : `${m}m`;
};
const srcName = (url) => {
  try { const d = new URL(url).hostname; return SRC_NAMES[d] || d.replace('www.', ''); }
  catch { return 'Link'; }
};

/* ── Small components ── */

const PostureBadge = ({ posture, small }) => {
  const c = POSTURE_COLORS[posture] || COLORS.t3;
  return (
    <span style={{
      ...infoTag(c), fontSize: small ? 9 : 11, fontWeight: 600, fontFamily: FONT_MONO,
    }}>
      {POSTURE_LABELS[posture] || posture}
    </span>
  );
};

const TierBadge = ({ tier }) => {
  const c = TIER_COLORS[tier] || COLORS.t3;
  return <span style={{ ...infoTag(c), fontSize: 9, fontFamily: FONT_MONO }}>{TIER_LABELS[tier] || tier}</span>;
};

const TagPill = ({ tag, active, onClick }) => (
  <span
    onClick={onClick}
    style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 3,
      fontSize: 9, fontFamily: FONT_MONO, cursor: onClick ? 'pointer' : 'default',
      color: active ? COLORS.ac : COLORS.t2,
      background: active ? ALPHA.ac13 : COLORS.s2,
      border: `1px solid ${active ? ALPHA.ac27 : COLORS.bd}`,
      whiteSpace: 'nowrap',
    }}
  >
    {fmtTag(tag)}
  </span>
);

const DimBadge = ({ label, value, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ fontSize: 8, color: COLORS.t3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    <span style={{ ...infoTag(color || COLORS.t3), fontSize: 10, fontFamily: FONT_MONO }}>{value}</span>
  </div>
);

const FilterBtn = ({ label, active, color, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '2px 7px', borderRadius: 3, fontSize: 9, cursor: 'pointer',
      border: `1px solid ${active ? (color || COLORS.ac) : (color ? color + '44' : COLORS.bd)}`,
      background: active ? `${color || COLORS.ac}33` : 'transparent',
      color: active ? (color || COLORS.ac) : COLORS.t3,
      fontFamily: FONT_SANS,
    }}
  >
    {label}
  </button>
);

/* ── Sparkline ── */
const Sparkline = ({ quarterly, width = 220, height = 44 }) => {
  if (!quarterly || Object.keys(quarterly).length < 2) return null;
  const keys = Object.keys(quarterly);
  const vals = Object.values(quarterly);
  const mx = Math.max(...vals, 1);
  const barW = Math.max(3, Math.min(8, Math.floor(width / vals.length) - 1));
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.t3, marginBottom: 6 }}>Bug Velocity</div>
      <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        {vals.map((v, i) => (
          <div key={i} title={`${keys[i]}: ${v} bugs`} style={{
            width: barW, height: Math.max(2, (v / mx) * (height - 4)),
            background: COLORS.ac, opacity: 0.4 + (v / mx) * 0.6,
            borderRadius: '1px 1px 0 0', flexShrink: 0,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, fontFamily: FONT_MONO, color: COLORS.t3, marginTop: 2 }}>
        <span>{keys[0]}</span>
        {keys.length > 4 && <span>{keys[Math.floor(keys.length / 2)]}</span>}
        <span>{keys[keys.length - 1]}</span>
      </div>
    </div>
  );
};

/* ── Milestone timeline ── */
const MilestoneTimeline = ({ milestones }) => {
  if (!milestones?.length) return <span style={{ color: COLORS.t3, fontSize: 11 }}>Pre-Bugzilla event</span>;
  // Merge same-date distrust_effective entries
  const merged = [];
  for (const m of milestones) {
    if (m.type === 'distrust_effective' && m.store && merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (prev.type === 'distrust_effective' && prev.date === m.date) {
        prev._stores = (prev._stores || [prev.store]);
        prev._stores.push(m.store);
        continue;
      }
    }
    merged.push({ ...m });
  }
  return (
    <div style={{ position: 'relative', paddingLeft: 18 }}>
      <div style={{ position: 'absolute', left: 3, top: 4, bottom: 4, width: 1, background: COLORS.bd }} />
      {merged.map((m, i) => {
        const c = MILESTONE_COLORS[m.type] || COLORS.t3;
        let label = m.detail || MILESTONE_LABELS[m.type] || m.type;
        if (m._stores) {
          label = m._stores.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ') + ' distrust effective';
        } else if (m.type === 'distrust_effective' && m.store && !m.detail) {
          label = m.store.charAt(0).toUpperCase() + m.store.slice(1) + ' distrust effective';
        }
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, position: 'relative' }}>
            <div style={{ position: 'absolute', left: -18, top: 3, width: 8, height: 8, borderRadius: '50%', background: c, border: `2px solid ${COLORS.s1}` }} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: COLORS.t3, minWidth: 62, flexShrink: 0 }}>
              {m.date?.slice(0, 7)}
            </span>
            <span style={{ fontSize: 11, color: COLORS.t2, lineHeight: '15px' }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
};

/* ── Donut chart ── */
const PostureDonut = ({ distribution }) => {
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let cum = 0;
  const R = 70, r = 44, cx = 80, cy = 80;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 14px 12px' }}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        {entries.map(([k, v]) => {
          const frac = v / total;
          const start = cum;
          cum += frac * Math.PI * 2;
          const end = cum;
          const x1 = cx + R * Math.cos(start - Math.PI / 2);
          const y1 = cy + R * Math.sin(start - Math.PI / 2);
          const x2 = cx + R * Math.cos(end - Math.PI / 2);
          const y2 = cy + R * Math.sin(end - Math.PI / 2);
          const ix1 = cx + r * Math.cos(end - Math.PI / 2);
          const iy1 = cy + r * Math.sin(end - Math.PI / 2);
          const ix2 = cx + r * Math.cos(start - Math.PI / 2);
          const iy2 = cy + r * Math.sin(start - Math.PI / 2);
          const lg = frac > 0.5 ? 1 : 0;
          return (
            <path key={k}
              d={`M${x1},${y1} A${R},${R} 0 ${lg},1 ${x2},${y2} L${ix1},${iy1} A${r},${r} 0 ${lg},0 ${ix2},${iy2} Z`}
              fill={POSTURE_COLORS[k] || COLORS.t3} opacity={0.8} />
          );
        })}
        <text x={cx} y={cy - 5} textAnchor="middle" fill={COLORS.tx} fontSize={24} fontWeight={700} fontFamily={FONT_SANS}>{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill={COLORS.t3} fontSize={10} fontFamily={FONT_MONO}>events</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: POSTURE_COLORS[k], flexShrink: 0 }} />
            <span style={{ color: COLORS.t2, minWidth: 90 }}>{POSTURE_LABELS[k] || k}</span>
            <span style={{ fontFamily: FONT_MONO, color: COLORS.t3, fontSize: 10 }}>{v} ({Math.round(v / total * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Timeline axis ── */
const TimelineAxis = ({ events }) => {
  const minY = 2010.5, maxY = Math.max(new Date().getFullYear() + 0.5, events.reduce((m, e) => Math.max(m, e.year || 0), 0) + 1.5), range = maxY - minY;
  const sorted = [...events].sort((a, b) => (a.year || 0) - (b.year || 0));
  return (
    <Card>
      <div style={{ padding: '12px 14px' }}>
        {/* Year ticks */}
        <div style={{ position: 'relative', height: 12, margin: '0 20px' }}>
          {Array.from({ length: 8 }, (_, i) => 2011 + i * 2).map((y) => (
            <div key={y} style={{
              position: 'absolute', left: `${((y - minY) / range) * 100}%`, transform: 'translateX(-50%)',
              fontSize: 9, fontFamily: FONT_MONO, color: COLORS.t3,
            }}>{y}</div>
          ))}
        </div>
        {/* Dots + labels */}
        <div style={{ position: 'relative', height: 70, margin: '0 20px' }}>
          <div style={{ position: 'absolute', top: 35, left: 0, right: 0, height: 1, background: COLORS.bd }} />
          {sorted.map((e, i) => {
            const y = e.year || 2024;
            const pct = ((y - minY) / range) * 100;
            const c = POSTURE_COLORS[e.compliance_posture] || COLORS.t3;
            const sz = Math.max(5, Math.min(12, 5 + Math.sqrt((e.bugzilla_bugs || 0) / 10) * 3));
            const above = i % 2 === 0;
            return (
              <React.Fragment key={e.ca}>
                <div
                  title={`${e.ca} (${y}) — ${e.bugzilla_bugs || 0} bugs — ${POSTURE_LABELS[e.compliance_posture] || ''}`}
                  style={{
                    position: 'absolute', left: `${pct}%`, top: 35 - sz, transform: 'translateX(-50%)',
                    width: sz * 2, height: sz * 2, borderRadius: '50%', background: c,
                    border: `2px solid ${COLORS.s1}`, transition: 'transform 0.15s', cursor: 'default',
                  }}
                />
                <div style={{
                  position: 'absolute', left: `${pct}%`, top: above ? (35 - sz - 14) : (35 + sz + 3),
                  transform: 'translateX(-50%)', fontSize: 8, fontFamily: FONT_MONO,
                  color: COLORS.t2, whiteSpace: 'nowrap', textAlign: 'center',
                }}>
                  {e.ca.length > 12 ? e.ca.slice(0, 10) + '…' : e.ca}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        {/* Legend */}
        <div style={{ ...legendRowStyle, marginTop: 4 }}>
          <span style={{ fontWeight: 500, color: COLORS.t3 }}>Dot size = incident count · Color = posture:</span>
          {Object.entries(POSTURE_LABELS).map(([k, v]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={legendDot(POSTURE_COLORS[k])} />{v}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
};

/* ── Expanded detail ── */
const ExpandedDetail = ({ event: e, tagFilter, setTagFilter }) => {
  const t = e.timeline || {};
  const refs = e.references || {};
  const ev = e.evidence || {};
  const pc = POSTURE_COLORS[e.compliance_posture] || COLORS.t3;

  return (
    <tr>
      <td colSpan={9} style={expandedCellStyle}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '14px 16px' }}>
          {/* Left: classification */}
          <div style={{ flex: '1 1 360px', minWidth: 280 }}>
            <p style={{ fontSize: 12, color: COLORS.t2, lineHeight: '18px', margin: '0 0 12px' }}>{e.summary}</p>

            {/* Dimensions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <DimBadge label="Posture" value={POSTURE_LABELS[e.compliance_posture]} color={pc} />
              {e.distrust_pathway && <DimBadge label="Pathway" value={PATHWAY_LABELS[e.distrust_pathway]} color={PATHWAY_COLORS[e.distrust_pathway]} />}
              {e.response_quality && <DimBadge label="Response" value={RESPONSE_LABELS[e.response_quality]} color={RESPONSE_COLORS[e.response_quality]} />}
              {e.root_cause && <DimBadge label="Root Cause" value={ROOT_CAUSE_LABELS[e.root_cause] || e.root_cause} />}
            </div>

            {/* Tags */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...sectionLabelStyle, marginBottom: 4 }}>Contributing Factors</div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {(e.reason_tags || []).map((tag) => (
                  <TagPill key={tag} tag={tag} active={tagFilter === tag}
                    onClick={(ev) => { ev.stopPropagation(); setTagFilter(tagFilter === tag ? null : tag); }} />
                ))}
              </div>
            </div>

            {/* Evidence */}
            {ev.posture_evidence && (
              <div style={{ fontSize: 11, color: COLORS.t3, lineHeight: '16px', marginBottom: 10,
                padding: '8px 10px', background: COLORS.bg, borderRadius: 4, border: `1px solid ${COLORS.bd}` }}>
                <span style={{ fontWeight: 600, color: COLORS.t2 }}>Why this posture: </span>{ev.posture_evidence}
              </div>
            )}

            {/* Stats line */}
            <div style={{ fontSize: 10, color: COLORS.t3, display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              {t.bug_count > 0 && <span>{t.bug_count} Bugzilla incidents</span>}
              {ev.rp_comments_count > 0 && <span>{ev.rp_comments_count} RP comments</span>}
              {ev.ca_comments_count > 0 && <span>{ev.ca_comments_count} CA comments</span>}
              {t.runway_days > 0 && <span>Time to removal: {fmtRunway(t.runway_days)}</span>}
            </div>

            {/* Store badges */}
            {e.distrust_dates && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                {['chrome', 'mozilla', 'apple', 'microsoft'].map((s) => {
                  const d = e.distrust_dates[s];
                  const c = STORE_COLORS[s];
                  return (
                    <span key={s} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                      borderRadius: 3, fontSize: 10, fontFamily: FONT_MONO,
                      background: d ? `${c}22` : ALPHA.gn09,
                      color: d ? c : COLORS.gn,
                      border: `1px solid ${d ? `${c}44` : ALPHA.gn20}`,
                    }}>
                      {s}: {d || 'trusted'}
                    </span>
                  );
                })}
              </div>
            )}

            {/* References */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.bd}` }}>
              <div style={{ ...sectionLabelStyle, marginBottom: 6 }}>Primary Sources</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                {(refs.root_program_announcements || []).map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '3px 8px', background: ALPHA.ac07, border: `1px solid ${ALPHA.ac20}`, borderRadius: 3, fontSize: 10, color: COLORS.ac, textDecoration: 'none' }}>
                    {srcName(u)} ↗
                  </a>
                ))}
                {(refs.mdsp_threads || []).map((u, i) => (
                  <a key={`m${i}`} href={u} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '3px 8px', background: '#ff661112', border: '1px solid #ff661133', borderRadius: 3, fontSize: 10, color: COLORS.ac, textDecoration: 'none' }}>
                    MDSP{refs.mdsp_threads.length > 1 ? ` ${i + 1}` : ''} ↗
                  </a>
                ))}
                {(refs.ccadb_threads || []).map((u, i) => (
                  <a key={`c${i}`} href={u} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '3px 8px', background: ALPHA.cy07, border: `1px solid ${ALPHA.cy20}`, borderRadius: 3, fontSize: 10, color: COLORS.ac, textDecoration: 'none' }}>
                    CCADB{refs.ccadb_threads.length > 1 ? ` ${i + 1}` : ''} ↗
                  </a>
                ))}
                {t.bug_count > 0 && (
                  <a href={`https://bugzilla.mozilla.org/buglist.cgi?component=CA%20Certificate%20Compliance&query_format=advanced&short_desc=${encodeURIComponent(e.ca)}&short_desc_type=allwordssubstr`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ padding: '3px 8px', background: ALPHA.pu07, border: `1px solid ${ALPHA.pu20}`, borderRadius: 3, fontSize: 10, color: COLORS.ac, textDecoration: 'none' }}>
                    Bugzilla ({t.bug_count} bugs) ↗
                  </a>
                )}
              </div>
              {(refs.articles || []).length > 0 && (
                <>
                  <div style={{ ...sectionLabelStyle, marginBottom: 6 }}>Articles &amp; Reports</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {refs.articles.map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 8px',
                          background: COLORS.s2, border: `1px solid ${COLORS.bd}`, borderRadius: 3,
                          fontSize: 11, color: COLORS.t2, textDecoration: 'none',
                        }}>
                        <span style={{ fontSize: 9, color: COLORS.t3, fontFamily: FONT_MONO, minWidth: 90, flexShrink: 0 }}>{a.source}</span>
                        <span style={{ color: COLORS.tx }}>{a.title}</span>
                        <span style={{ color: COLORS.ac, marginLeft: 'auto', flexShrink: 0 }}>↗</span>
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: timeline + sparkline */}
          <div style={{ flex: '0 0 280px', minWidth: 220 }}>
            <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>Timeline</div>
            <MilestoneTimeline milestones={t.milestones} />
            {t.quarterly_bug_counts && Object.keys(t.quarterly_bug_counts).length > 1 && (
              <div style={{ marginTop: 16 }}>
                <Sparkline quarterly={t.quarterly_bug_counts} />
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
};

/* ── Main view ── */
export default function DistrustView() {
  const { distrustData } = usePipeline();

  const [sortBy, setSortBy] = useState('date');
  const [expanded, setExpanded] = useState(null);
  const [postureFilter, setPostureFilter] = useState(null);
  const [pathwayFilter, setPathwayFilter] = useState(null);
  const [tagFilter, setTagFilter] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [chartTagCount, setChartTagCount] = useState(10);

  const events = useMemo(() => {
    if (!distrustData?.events) return [];
    let list = [...distrustData.events];
    if (postureFilter) list = list.filter((e) => e.compliance_posture === postureFilter);
    if (pathwayFilter) list = list.filter((e) => e.distrust_pathway === pathwayFilter);
    if (tagFilter) list = list.filter((e) => (e.reason_tags || []).includes(tagFilter));
    if (sortBy === 'date') list.sort((a, b) => (b.year || 0) - (a.year || 0));
    else if (sortBy === 'bugs') list.sort((a, b) => (b.bugzilla_bugs || 0) - (a.bugzilla_bugs || 0));
    else if (sortBy === 'runway') list.sort((a, b) => ((b.timeline?.runway_days) || 0) - ((a.timeline?.runway_days) || 0));
    return list;
  }, [distrustData, sortBy, postureFilter, pathwayFilter, tagFilter]);

  const stats = distrustData?.stats || {};
  const allEvents = distrustData?.events || [];

  if (!allEvents.length) {
    return <DataPending tab="Distrust History" source="distrusted.json" description="distrust detection pipeline" />;
  }

  const pwCounts = {};
  allEvents.forEach((e) => { if (e.distrust_pathway) pwCounts[e.distrust_pathway] = (pwCounts[e.distrust_pathway] || 0) + 1; });
  const allTags = {};
  allEvents.forEach((e) => (e.reason_tags || []).forEach((t) => { allTags[t] = (allTags[t] || 0) + 1; }));
  const sortedTags = Object.entries(allTags).sort((a, b) => b[1] - a[1]);

  const tagFreq = chartTagCount === 0 ? Object.entries(stats.tag_frequency || {}) : Object.entries(stats.tag_frequency || {}).slice(0, chartTagCount);
  const maxTag = Math.max(...tagFreq.map(([, v]) => v), 1);

  const anyFilter = postureFilter || pathwayFilter || tagFilter;

  return (
    <div>
      <TabIntro tabId="distrust" quote={`"Those who cannot remember the past are condemned to repeat it." — George Santayana`}>
        Every CA distrust event in browser history — the root cause, the compliance posture, the response timeline, and the final outcome.
        {(() => {
          const OPS = new Set(['inadequate_incident_response','pattern_of_issues','lack_of_meaningful_improvement','non_responsive_to_root_programs','minimized_severity','active_deception','hidden_corporate_changes','recharacterized_incidents','concealed_breach_or_incident','delayed_or_refused_revocation','demonstrated_lack_of_understanding','argued_rules_dont_apply','limited_ecosystem_value']);
          const n = allEvents.filter(e => (e.reason_tags||[]).some(t => OPS.has(t))).length;
          const tot = allEvents.length;
          return `${n} of ${tot} events involved compliance operations failures: inadequate incident response, patterns of unresolved issues, concealment, or non-engagement with root programs. ${tot - n === 1 ? 'One event was' : tot - n + ' events were'} purely technical with no behavioral component. Distrust is almost always preceded by a pattern of compliance process failures — not a single certificate error.`;
        })()}
      </TabIntro>

      <CardTitle sub="Every CA removed from browser trust stores. Classification from Bugzilla evidence and root program announcements.">
        Distrust History
      </CardTitle>

      {/* Stats */}
      <div style={statGridStyle}>
        <StatCard l="Distrust Events" v={stats.total_events || allEvents.length} s={`${stats.year_range?.[0]}–${stats.year_range?.[1]}`} />
        {(() => {
          const patternCount = allEvents.filter(e =>
            (e.reason_tags || []).includes('pattern_of_issues')
          ).length;
          const total = allEvents.length;
          return (
            <StatCard
              l="Recurring Pattern of Issues"
              v={`${patternCount} of ${total}`}
              s="distrust events where compliance failures recurred across multiple years — not resolved after first incident"
              c={COLORS.rd}
            />
          );
        })()}
        {(() => {
          const OPS_TAGS = new Set([
            'inadequate_incident_response','pattern_of_issues','lack_of_meaningful_improvement',
            'non_responsive_to_root_programs','minimized_severity','active_deception',
            'hidden_corporate_changes','recharacterized_incidents','concealed_breach_or_incident',
            'delayed_or_refused_revocation','demonstrated_lack_of_understanding',
            'argued_rules_dont_apply','limited_ecosystem_value',
          ]);
          const opsCount = allEvents.filter(e =>
            (e.reason_tags || []).some(t => OPS_TAGS.has(t))
          ).length;
          const total = allEvents.length;
          return (
            <StatCard
              l="Compliance Operations Failures"
              v={`${opsCount} of ${total}`}
              s="distrust events involved inadequate response, concealment, or pattern of issues — not just technical errors"
              c={COLORS.am}
            />
          );
        })()}
        <StatCard l="Response-Quality Failures" v={`${stats.response_driven_pct || 73}%`} s="of events include minimizing, deceiving, or non-responsive behavior" c={COLORS.t2} />
      </div>

      {/* Timeline axis */}
      <TimelineAxis events={allEvents} />

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 12 }}>
        <Card>
          <CardTitle sub="Compliance stance at time of distrust">Posture Distribution</CardTitle>
          <PostureDonut distribution={stats.posture_distribution || {}} />
        </Card>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px 0' }}>
            <CardTitle sub="Failure patterns across all events">Reason Distribution</CardTitle>
            <Paginator count={chartTagCount} setCount={setChartTagCount} options={[10, 15, 0]} />
          </div>
          <div style={{ padding: '8px 14px 12px' }}>
            {tagFreq.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 10, color: COLORS.t2, width: 150, textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fmtTag(k)}
                </div>
                <div style={{ height: 14, borderRadius: '0 3px 3px 0', minWidth: 2, width: `${(v / maxTag) * 140}px`, background: ALPHA.ac53 }} />
                <span style={{ fontSize: 9, fontFamily: FONT_MONO, color: COLORS.t3, width: 20 }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Filter/Sort toolbar */}
      <Card style={{ padding: 0, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 }}>
            {anyFilter ? (
              <>
                {postureFilter && (
                  <PostureBadge posture={postureFilter} small />
                )}
                {pathwayFilter && (
                  <span style={{ ...infoTag(PATHWAY_COLORS[pathwayFilter]), fontSize: 9, fontFamily: FONT_MONO, cursor: 'pointer' }}
                    onClick={() => setPathwayFilter(null)}>
                    {PATHWAY_LABELS[pathwayFilter]} ✕
                  </span>
                )}
                {tagFilter && <TagPill tag={tagFilter} active onClick={() => setTagFilter(null)} />}
                <span style={{ fontSize: 10, color: COLORS.t3 }}>{events.length} of {allEvents.length}</span>
                <button onClick={() => { setPostureFilter(null); setPathwayFilter(null); setTagFilter(null); }}
                  style={{ padding: '2px 6px', border: `1px solid ${COLORS.bd}`, borderRadius: 3, background: 'transparent', color: COLORS.t3, fontSize: 9, cursor: 'pointer' }}>
                  Clear
                </button>
              </>
            ) : (
              <span style={{ fontSize: 10, color: COLORS.t3 }}>{allEvents.length} events</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {[['date', 'Date'], ['bugs', 'Incidents'], ['runway', 'Time to Removal']].map(([k, l]) => (
              <FilterBtn key={k} label={l} active={sortBy === k} onClick={() => setSortBy(k)} />
            ))}
          </div>
          <FilterBtn label={showFilters ? 'Hide Filters' : 'Show Filters'} active={showFilters}
            onClick={() => setShowFilters(!showFilters)} />
        </div>
        {showFilters && (
          <div style={{ padding: '0 14px 10px', borderTop: `1px solid ${COLORS.bd}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: '6px 10px', alignItems: 'start', fontSize: 9, paddingTop: 8 }}>
              <span style={{ color: COLORS.t3, paddingTop: 3, textAlign: 'right' }}>Posture</span>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {Object.entries(POSTURE_LABELS).map(([k, v]) => {
                  const cnt = allEvents.filter((e) => e.compliance_posture === k).length;
                  return cnt > 0 && (
                    <FilterBtn key={k} label={`${v} ${cnt}`} active={postureFilter === k}
                      color={POSTURE_COLORS[k]} onClick={() => setPostureFilter(postureFilter === k ? null : k)} />
                  );
                })}
              </div>
              <span style={{ color: COLORS.t3, paddingTop: 3, textAlign: 'right' }}>Pathway</span>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {Object.entries(pwCounts).sort((a, b) => b[1] - a[1]).map(([k, cnt]) => (
                  <FilterBtn key={k} label={`${PATHWAY_LABELS[k] || k} ${cnt}`} active={pathwayFilter === k}
                    color={PATHWAY_COLORS[k]} onClick={() => setPathwayFilter(pathwayFilter === k ? null : k)} />
                ))}
              </div>
              <span style={{ color: COLORS.t3, paddingTop: 3, textAlign: 'right' }}>Tags</span>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                {sortedTags.slice(0, 15).map(([t, cnt]) => (
                  <FilterBtn key={t} label={`${fmtTag(t)} ${cnt}`} active={tagFilter === t}
                    onClick={() => setTagFilter(tagFilter === t ? null : t)} />
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Events table */}
      <Card>
        <div style={scrollXStyle}>
          <div style={{ overflowX: 'auto' }}>
          <table style={compactTableStyle}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                <th style={{ width: 24, padding: '7px 4px' }} />
                <th style={{ textAlign: 'left', padding: '7px 8px', color: COLORS.t3, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>CA</th>
                <th style={{ textAlign: 'left', padding: '7px 8px', color: COLORS.t3, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Jurisdiction</th>
                <th style={{ padding: '7px 8px', color: COLORS.t3, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Year</th>
                <th style={{ padding: '7px 8px', color: COLORS.t3, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Posture</th>
                <th style={{ textAlign: 'left', padding: '7px 8px', color: COLORS.t3, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reason Tags</th>
                <th style={{ padding: '7px 8px', color: COLORS.t3, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bugs</th>
                <th style={{ padding: '7px 8px', color: COLORS.t3, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Time to Removal</th>
                <th style={{ padding: '7px 8px', color: COLORS.t3, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tier</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const isExp = expanded === e.ca;
                return (
                  <React.Fragment key={e.ca}>
                    <tr style={expandableRowStyle(isExp)} onClick={() => setExpanded(isExp ? null : e.ca)}>
                      <td style={{ ...expandChevron(isExp), padding: '6px 4px' }}>{isExp ? '▼' : '▶'}</td>
                      <td style={{ fontWeight: 600, color: COLORS.tx, whiteSpace: 'nowrap', padding: '6px 8px' }}>{e.ca}</td>
                      <td style={{ color: COLORS.t2, padding: '6px 8px' }}>{e.country || '—'}</td>
                      <td style={{ textAlign: 'center', fontFamily: FONT_MONO, padding: '6px 8px' }}>{e.year || '—'}</td>
                      <td style={{ padding: '6px 8px' }}><PostureBadge posture={e.compliance_posture} small /></td>
                      <td style={{ padding: '6px 8px' }}>
                        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                          {(e.reason_tags || []).map((t) => (
                            <TagPill key={t} tag={t} active={tagFilter === t}
                              onClick={(ev) => { ev.stopPropagation(); setTagFilter(tagFilter === t ? null : t); }} />
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: FONT_MONO, padding: '6px 8px' }}>{e.bugzilla_bugs || '—'}</td>
                      <td style={{ textAlign: 'center', fontFamily: FONT_MONO, fontSize: 11, padding: '6px 8px' }}>{fmtRunway(e.timeline?.runway_days)}</td>
                      <td style={{ textAlign: 'center', padding: '6px 8px' }}><TierBadge tier={e.classification_tier} /></td>
                    </tr>
                    {isExp && <ExpandedDetail event={e} tagFilter={tagFilter} setTagFilter={setTagFilter} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div> {/* overflow wrapper */}
        </div>
        <div style={{ ...footnoteStyle, padding: '6px 10px', borderTop: `1px solid ${COLORS.bd}` }}>
          Showing {events.length} of {allEvents.length} events
        </div>
      </Card>

      {/* Legend */}
      <div style={{ ...legendRowStyle, marginTop: 8 }}>
        <span style={{ fontWeight: 500, color: COLORS.t3 }}>Legend</span>
        <span style={{ color: COLORS.t3, fontWeight: 500 }}>Milestones:</span>
        {Object.entries(MILESTONE_LABELS).map(([k, v]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span style={legendDot(MILESTONE_COLORS[k])} />{v}
          </span>
        ))}
      </div>

      {/* Methodology */}
      <MethodologyCard>
        <MethodologyItem label="Compliance posture">
          <span style={{ color: COLORS.rd }}>Willful</span> (built systems to violate) ·{' '}
          <span style={{ color: '#e879f9' }}>Argumentative</span> (argued rules don't apply) ·{' '}
          <span style={{ color: COLORS.am }}>Negligent</span> (knew but didn't fix) ·{' '}
          <span style={{ color: '#38bdf8' }}>Incompetent</span> (didn't understand) ·{' '}
          <span style={{ color: COLORS.g5 }}>Accidental</span> (genuine mistake)
        </MethodologyItem>
        <MethodologyItem label="Distrust pathway">
          <span style={{ color: COLORS.rd }}>Immediate</span> (emergency) ·{' '}
          <span style={{ color: COLORS.or }}>Triggered</span> (external discovery) ·{' '}
          <span style={{ color: COLORS.am }}>Gradual</span> (accumulated incidents) ·{' '}
          <span style={{ color: COLORS.ac }}>Negotiated</span> (managed transition)
        </MethodologyItem>
        <MethodologyItem label="Response quality">
          <span style={{ color: COLORS.gn }}>Cooperative</span> → <span style={{ color: COLORS.am }}>Inadequate</span> → <span style={{ color: COLORS.rd }}>Deceptive</span>.
          How the CA engaged after issues were identified.
        </MethodologyItem>
        <MethodologyItem label="Contributing factors">
          {allEvents.length} events classified across {Object.keys(distrustData?.taxonomy || {}).length || 22} failure-pattern tags. Each supported by specific Bugzilla bug citations in the expanded detail view.
        </MethodologyItem>
        <MethodologyItem label="Classification tiers">
          <TierBadge tier="curated" /> hand-curated from root program announcements ·{' '}
          <TierBadge tier="high" /> LLM-classified from Bugzilla + cached metadata ·{' '}
          <TierBadge tier="medium_high" /> LLM-classified primarily from metadata ·{' '}
          <TierBadge tier="medium" /> Bugzilla only, some tags may be incomplete
        </MethodologyItem>
        <MethodologyItem label="Pipeline">
          CCADB detection → Bugzilla enrichment → LLM classification → merge.
          Caches Bugzilla profiles and classifications; only re-classifies when new bugs are filed or metadata is updated.
          {allEvents.length} events in corpus: {allEvents.filter(e => e.classification_tier === 'curated').length} hand-curated with full Bugzilla evidence review; {allEvents.filter(e => e.classification_tier !== 'curated').length} LLM-classified from Bugzilla incident records and CCADB metadata with manual review of tags and posture assignments.
          Accuracy figures are not formally tracked — all classifications are manually reviewed before publication.
        </MethodologyItem>
        <MethodologyItem label="Sources">
          Bugzilla CA Certificate Compliance, CCADB, mozilla.dev.security.policy, CCADB public list, root program blogs, security researcher reports.
        </MethodologyItem>
        <MethodologyItem label="Evidence basis">
          All classifications are based on publicly available evidence only. Root programs may possess non-public information — including private communications, confidential audit findings, or bilateral agreements — that influenced their decisions but is not reflected in this analysis.
        </MethodologyItem>
      </MethodologyCard>

      <DataMeta source="Bugzilla CA Certificate Compliance, CCADB, mozilla.dev.security.policy, CCADB public list"
        updated={distrustData.generated_at?.slice(0, 10)} tab="distrust" />
    </div>
  );
}
