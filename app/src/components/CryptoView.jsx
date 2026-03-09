import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Treemap,
  AreaChart,
  Area,
  CartesianGrid,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  ComposedChart,
} from 'recharts';
import * as d3 from 'd3';
import { COLORS, STORE_COLORS, FONT_MONO, FONT_SANS, COUNTRY_COORDS } from '../constants';
import { dn, f, fl, parseDate, yearsDiff, slugify, getIncidentRate, getWebCoverage } from '../helpers';
import {
  Card,
  CardTitle,
  StatCard,
  TrustDots,
  Badge,
  RateDot,
  ChartTooltip as TT,
  ChartWrap,
  GeoMap,
  DataMeta,
  DataPending,
  Paginator,
  buildPins,
  CertViewer,
  TabIntro,
} from './shared';
import CADetail from './CADetail';
import { usePipeline } from '../PipelineContext';
import { STANDARDS_BODY_SOURCES, ALGO_THRESHOLDS } from '../constants';
import { keyBelowStandard, hashBelowStandard, standardsStatusColor, standardsStatusLabel } from '../helpers';
import { compactTableStyle, expandedCellStyle, scrollXStyle } from '../styles';

/** Page size selector for tables */
const Pg = ({ cnt, setCnt }) => (
  <div style={{ display: 'flex', gap: 4 }}>
    {[10, 15, 25, 0].map((n) => (
      <button
        key={n}
        onClick={() => setCnt(n)}
        style={{
          padding: '4px 8px',
          fontSize: 10,
          borderRadius: 4,
          cursor: 'pointer',
          border: `1px solid ${cnt === n ? COLORS.bl : COLORS.bd}`,
          background: cnt === n ? COLORS.s2 : 'transparent',
          color: cnt === n ? COLORS.t2 : COLORS.t3,
        }}
      >
        {n === 0 ? 'All' : n}
      </button>
    ))}
  </div>
);

/**
 * CryptoView — Cryptographic Posture tab.
 *
 * Analyzes root certificate algorithms across the WebPKI: key family
 * (RSA vs ECC), key sizes, signature hashes, and compliance against
 * five standards bodies (NIST, ECRYPT-CSA, BSI, ANSSI, NSA CNSA).
 * Root self-signatures are not validated during chain building;
 * SHA-1 on a self-signed root is not a vulnerability.
 */
const CryptoView = () => {
  const { roots: pipelineRoots, caData, rootAlgo } = usePipeline();
  const [pageCount, setPageCount] = useState(15);
  const [filterText, setFilterText] = useState('');
  const [expiryPageCount, setExpiryPageCount] = useState(10);
  const [expandedCert, setExpandedCert] = useState(null);
  const [pemCache, setPemCache] = useState({});
  const [expandedPostureCA, setExpandedPostureCA] = useState(null);

  // Fetch PEM from per-CA JSON when a cert is expanded
  const expandCert = useCallback(
    (certKey, caId) => {
      if (expandedCert === certKey) {
        setExpandedCert(null);
        return;
      }
      setExpandedCert(certKey);
      if (pemCache[certKey]) return;
      fetch(`data/ca/${caId}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data) => {
          const root = data.roots?.find((r) => r.sha256?.toUpperCase() === certKey?.toUpperCase());
          if (root?.pem) {
            setPemCache((prev) => ({ ...prev, [certKey]: root.pem }));
          }
        })
        .catch((err) => {
          console.warn(`[CryptoView] Failed to load PEM for ${caId}:`, err.message);
        });
    },
    [expandedCert, pemCache],
  );

  // Flatten all roots from pipeline root_algorithms.json with computed fields.
  // This replaces the static ROOT_ALGO_DATA (22 CAs) with pipeline data (all 89 CAs, 335 roots).
  const allRoots = useMemo(() => {
    return (rootAlgo || []).map((r) => {
      const vf = r.not_before || '';
      const vt = r.not_after || '';
      const created = vf ? parseDate(vf) : null;
      const expires = vt ? parseDate(vt) : null;
      const now = new Date();
      const yrsLeft = expires ? yearsDiff(expires, now) : null;
      return {
        n: r.name,
        caId: r.ca_id,
        msId: r.ms_id || r.ca_id,
        caOwner: r.ca_owner,
        family: r.key_family,
        bits: r.key_bits,
        curve: r.curve,
        sig: r.sig_hash,
        vf,
        vt,
        created,
        expires,
        yrsLeft,
        stores: r.stores || '',
        sha256: r.sha256 || '',
        algoLabel: r.key_family === 'RSA' ? `RSA-${r.key_bits}` : r.curve || `ECC-${r.key_bits}`,
        keyFlags: keyBelowStandard(r.key_family, r.key_bits),
        hashFlags: hashBelowStandard(r.sig_hash),
      };
    });
  }, [rootAlgo]);

  const rsaRoots = allRoots.filter((r) => r.family === 'RSA');
  const eccRoots = allRoots.filter((r) => r.family === 'ECC');
  const rsaPct = Math.round((rsaRoots.length / allRoots.length) * 100);
  const eccPct = 100 - rsaPct;

  // Key size distribution
  const keySizes = useMemo(() => {
    const counts = {};
    allRoots.forEach((r) => {
      const key = r.algoLabel;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        pct: ((count / allRoots.length) * 100).toFixed(1),
        family: name.startsWith('RSA') ? 'RSA' : 'ECC',
      }));
  }, [allRoots]);

  // Signature hash distribution
  const sigAlgos = useMemo(() => {
    const counts = {};
    allRoots.forEach((r) => {
      counts[r.sig] = (counts[r.sig] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        pct: ((count / allRoots.length) * 100).toFixed(1),
      }));
  }, [allRoots]);

  const sha1Roots = allRoots.filter((r) => r.sig === 'SHA-1');
  const rsa2048Roots = allRoots.filter((r) => r.family === 'RSA' && r.bits === 2048);

  // Resolve IDs to display names via caData. Uses ms_id (market_share slug)
  // to bridge between root_algorithms pipeline slugs and CA_DATA IDs.
  const caDisplayName = (slugId, msId) => {
    const match = caData.find((x) => x.id === (msId || slugId));
    return match ? dn(match.caOwner) : slugId;
  };

  // Per-CA algorithm posture with standards body flags
  const perCaAlgo = useMemo(() => {
    const byCA = {};
    allRoots.forEach((r) => {
      if (!byCA[r.caId])
        byCA[r.caId] = {
          id: r.caId,
          msId: r.msId,
          rsa: 0,
          ecc: 0,
          total: 0,
          rsa2048: 0,
          sha1: 0,
          sha256: 0,
          sha384: 0,
          sha512: 0,
          belowBodies: new Set(),
        };
      const ca = byCA[r.caId];
      ca.total++;
      if (r.family === 'RSA') {
        ca.rsa++;
        if (r.bits <= 2048) ca.rsa2048++;
      } else ca.ecc++;
      if (r.sig === 'SHA-1') ca.sha1++;
      if (r.sig === 'SHA-256') ca.sha256++;
      if (r.sig === 'SHA-384') ca.sha384++;
      if (r.sig === 'SHA-512') ca.sha512++;
      r.keyFlags.forEach((flag) => ca.belowBodies.add(flag));
      r.hashFlags.forEach((flag) => ca.belowBodies.add(flag));
    });
    return Object.values(byCA)
      .map((ca) => ({ ...ca, belowBodies: [...ca.belowBodies].sort() }))
      .sort((a, b) => b.total - a.total);
  }, [allRoots]);

  const filteredCAs = useMemo(() => {
    const query = filterText.toLowerCase();
    return query
      ? perCaAlgo.filter((ca) => caDisplayName(ca.id, ca.msId).toLowerCase().includes(query) || ca.id.includes(query))
      : perCaAlgo;
  }, [perCaAlgo, filterText]);
  const shownCAs = pageCount === 0 ? filteredCAs : filteredCAs.slice(0, pageCount);

  // Root creation timeline
  const timeline = useMemo(() => {
    const byYear = {};
    allRoots
      .filter((r) => r.created)
      .forEach((r) => {
        const year = r.created.getFullYear();
        if (!byYear[year]) byYear[year] = { year, rsa: 0, ecc: 0 };
        if (r.family === 'RSA') byYear[year].rsa++;
        else byYear[year].ecc++;
      });
    return Object.values(byYear).sort((a, b) => a.year - b.year);
  }, [allRoots]);

  // Soonest expiring with algo data
  const allExpiry = useMemo(
    () =>
      allRoots
        .filter((r) => r.yrsLeft !== null)
        .map((r) => ({
          name: r.name,
          caId: r.caId,
          algo: r.algoLabel,
          sig: r.sig,
          expires: r.vt,
          yrsLeft: r.yrsLeft,
          family: r.family,
          keyFlags: r.keyFlags,
          hashFlags: r.hashFlags,
          stores: r.stores,
          sha256: r.sha256,
        }))
        .filter((r) => r.yrsLeft > 0)
        .sort((a, b) => a.yrsLeft - b.yrsLeft),
    [allRoots],
  );
  const shownExpiry = expiryPageCount === 0 ? allExpiry : allExpiry.slice(0, expiryPageCount);

  // Standards matrix sections
  const thresholdSections = useMemo(() => {
    const sections = [];
    let currentSection = null;
    ALGO_THRESHOLDS.forEach((t) => {
      if (t.section !== currentSection) {
        sections.push({ section: t.section, items: [] });
        currentSection = t.section;
      }
      sections[sections.length - 1].items.push(t);
    });
    return sections;
  }, []);

  const casWithFlags = perCaAlgo.filter((ca) => ca.belowBodies.length > 0).length;

  return (
    <div>
      <TabIntro quote="Cryptography has a shelf life. The question is whether yours expired already.">
        Root certificate algorithm distribution, key sizes, and expiry timelines evaluated against deprecation guidance from NIST, BSI, and NSA/CNSA. The WebPKI still relies heavily on RSA-2048 roots that multiple standards bodies have flagged for deprecation or disqualification. Some CAs have already deployed ECC roots; others remain entirely anchored to aging primitives. This tab tracks which CAs meet or fall below each standards body's thresholds, maps the root expiry timeline to identify upcoming forced transitions, and gives relying parties visibility into the cryptographic foundation their certificate chains rest on — including how prepared each CA is for the eventual post-quantum migration.
      </TabIntro>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <StatCard l="Root Certificates" v={allRoots.length} c={COLORS.ac} />
        <StatCard l="RSA Roots" v={`${rsaPct}%`} s={`${rsaRoots.length} roots`} c={COLORS.am} />
        <StatCard l="ECC Roots" v={`${eccPct}%`} s={`${eccRoots.length} roots`} c={COLORS.gn} />
        <StatCard l="RSA-2048 Roots" v={rsa2048Roots.length} s="below BSI / CNSA min" c={COLORS.rd} />
        <StatCard l="CAs Below Standard" v={casWithFlags} s="at least one body" c={COLORS.rd} />
      </div>

      {/* Algorithm split */}
      <Card>
        <CardTitle sub="Key algorithm family and key size distribution across currently-included root certificates. ">
          Root Algorithm Distribution
        </CardTitle>
        <div style={{ display: 'flex', height: 36, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
          <div
            style={{
              width: `${rsaPct}%`,
              background: COLORS.am,
              opacity: 0.6,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 10,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.tx }}>
              RSA {rsaPct}% ({rsaRoots.length})
            </span>
          </div>
          <div
            style={{
              flex: 1,
              background: COLORS.gn,
              opacity: 0.6,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 10,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.tx }}>
              ECC {eccPct}% ({eccRoots.length})
            </span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: COLORS.t2, fontWeight: 600, marginBottom: 6 }}>Key Size</div>
            {keySizes.map((k) => (
              <div key={k.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 10,
                    color: k.family === 'RSA' ? COLORS.am : COLORS.gn,
                    width: 70,
                    fontFamily: FONT_MONO,
                  }}
                >
                  {k.name}
                </span>
                <div style={{ flex: 1, height: 14, background: COLORS.bg, borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${(k.count / allRoots.length) * 100}%`,
                      background: k.family === 'RSA' ? COLORS.am : COLORS.gn,
                      opacity: 0.5,
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span style={{ fontSize: 9, color: COLORS.t3, fontFamily: FONT_MONO, width: 44, textAlign: 'right' }}>
                  {k.count} ({k.pct}%)
                </span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 10, color: COLORS.t2, fontWeight: 600, marginBottom: 6 }}>
              Signature Hash Algorithm
            </div>
            {sigAlgos.map((s) => {
              const cl =
                s.name === 'SHA-1'
                  ? COLORS.rd
                  : s.name === 'SHA-256'
                    ? COLORS.t2
                    : s.name === 'SHA-384'
                      ? COLORS.gn
                      : COLORS.cy;
              return (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: cl, width: 70, fontFamily: FONT_MONO }}>{s.name}</span>
                  <div style={{ flex: 1, height: 14, background: COLORS.bg, borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(s.count / allRoots.length) * 100}%`,
                        background: cl,
                        opacity: 0.5,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 9, color: COLORS.t3, fontFamily: FONT_MONO, width: 44, textAlign: 'right' }}>
                    {s.count} ({s.pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Standards body matrix */}
      <Card>
        <CardTitle sub="How algorithms used in the WebPKI compare against recommendations from five standards bodies, covering both key sizes and hash algorithms. Thresholds from published recommendations.">
          Standards Body Recommendations
        </CardTitle>
        <div style={scrollXStyle}>
          <table style={compactTableStyle}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                <th
                  style={{
                    padding: '6px',
                    color: COLORS.t3,
                    fontSize: 8,
                    textAlign: 'left',
                    textTransform: 'uppercase',
                  }}
                >
                  Algorithm
                </th>
                {STANDARDS_BODY_SOURCES.map((s) => (
                  <th
                    key={s.id}
                    style={{
                      padding: '6px',
                      color: s.color,
                      fontSize: 8,
                      textAlign: 'center',
                      textTransform: 'uppercase',
                    }}
                  >
                    <div>{s.name}</div>
                    <div style={{ fontSize: 7, fontWeight: 400, color: COLORS.t3 }}>{s.doc}</div>
                  </th>
                ))}
                <th
                  style={{
                    padding: '6px',
                    color: COLORS.t3,
                    fontSize: 8,
                    textAlign: 'left',
                    textTransform: 'uppercase',
                  }}
                >
                  WebPKI Context
                </th>
              </tr>
            </thead>
            <tbody>
              {thresholdSections.map((sec) => (
                <React.Fragment key={sec.section}>
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: '8px 6px 4px',
                        fontSize: 9,
                        fontWeight: 600,
                        color: COLORS.t2,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        borderBottom: `1px solid ${COLORS.bd}`,
                        background: COLORS.bg,
                      }}
                    >
                      {sec.section}
                    </td>
                  </tr>
                  {sec.items.map((t) => (
                    <tr key={t.algo} style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                      <td
                        style={{
                          padding: '6px',
                          color: COLORS.tx,
                          fontFamily: FONT_MONO,
                          fontSize: 10,
                          fontWeight: 500,
                        }}
                      >
                        {t.algo}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <span style={{ color: standardsStatusColor(t.nist), fontWeight: 600 }}>
                          {standardsStatusLabel(t.nist)}
                        </span>
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <span style={{ color: standardsStatusColor(t.ecrypt), fontWeight: 600 }}>
                          {standardsStatusLabel(t.ecrypt)}
                        </span>
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <span style={{ color: standardsStatusColor(t.bsi), fontWeight: 600 }}>
                          {standardsStatusLabel(t.bsi)}
                        </span>
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <span style={{ color: standardsStatusColor(t.anssi), fontWeight: 600 }}>
                          {standardsStatusLabel(t.anssi)}
                        </span>
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <span style={{ color: standardsStatusColor(t.cnsa), fontWeight: 600 }}>
                          {standardsStatusLabel(t.cnsa)}
                        </span>
                      </td>
                      <td style={{ padding: '6px', fontSize: 9, color: COLORS.t3, maxWidth: 200 }}>{t.webpki}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 8, color: COLORS.t3, marginTop: 8 }}
        >
          <span>
            <span style={{ color: COLORS.gn }}>✓</span> Recommended
          </span>
          <span>
            <span style={{ color: COLORS.gn }}>min</span> Minimum acceptable
          </span>
          <span>
            <span style={{ color: COLORS.am }}>→2030</span> Acceptable through ~2030
          </span>
          <span>
            <span style={{ color: COLORS.rd }}>✗</span> Below minimum / deprecated
          </span>
          <span style={{ marginLeft: 'auto' }}>Data: keylength.com</span>
        </div>
      </Card>

      {/* Timeline */}
      <Card>
        <CardTitle sub="Root certificates by creation year and algorithm. ">Root Creation Timeline</CardTitle>
        <ChartWrap height={200}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timeline} margin={{ left: 30, right: 10, top: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.bd} />
              <XAxis
                dataKey="year"
                tick={{ fill: COLORS.t3, fontSize: 9 }}
                axisLine={{ stroke: COLORS.bd }}
                tickLine={false}
              />
              <YAxis tick={{ fill: COLORS.t3, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip
                content={(p) => (
                  <TT
                    {...p}
                    render={(d) => (
                      <>
                        <div style={{ fontWeight: 600, color: COLORS.tx }}>{d.year}</div>
                        <div style={{ color: COLORS.am }}>RSA: {d.rsa}</div>
                        <div style={{ color: COLORS.gn }}>ECC: {d.ecc}</div>
                      </>
                    )}
                  />
                )}
              />
              <Bar dataKey="rsa" stackId="a" fill={COLORS.am} opacity={0.6} />
              <Bar dataKey="ecc" stackId="a" fill={COLORS.gn} opacity={0.6} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrap>
        <div style={{ display: 'flex', gap: 14, fontSize: 9, color: COLORS.t3, marginTop: 4 }}>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 2,
                background: COLORS.am,
                opacity: 0.6,
                marginRight: 4,
                verticalAlign: 'middle',
              }}
            />
            RSA
          </span>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 2,
                background: COLORS.gn,
                opacity: 0.6,
                marginRight: 4,
                verticalAlign: 'middle',
              }}
            />
            ECC
          </span>
        </div>
      </Card>

      {/* Per-CA posture */}
      <Card>
        <CardTitle sub="Key algorithm, signature hash, and standards body compliance per CA at the root layer. The Below Standard column shows which bodies' minimums at least one of this CA's roots falls below.">
          Per-CA Root Cryptographic Posture
        </CardTitle>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            gap: 8,
          }}
        >
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter CAs..."
            style={{
              background: COLORS.bg,
              border: `1px solid ${COLORS.bd}`,
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 11,
              color: COLORS.tx,
              fontFamily: FONT_SANS,
              width: 200,
              outline: 'none',
            }}
          />
          <Pg cnt={pageCount} setCnt={setPageCount} />
        </div>
        <div style={scrollXStyle}>
          <table style={compactTableStyle}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                {[['CA Owner', 'CA organization name'], ['Roots', 'Total root certificates'], ['RSA', 'RSA root count'], ['ECC', 'ECC root count'], ['Signature Hashes', 'Hash algorithms used in root self-signatures'], ['Below Standard', 'Standards bodies whose minimums at least one root falls below'], ['Algorithm Mix', 'Proportional RSA vs ECC root distribution']].map(
                  ([h, tip], i) => (
                    <th
                      key={h}
                      title={tip}
                      style={{
                        padding: '5px',
                        color: COLORS.t3,
                        fontSize: 8,
                        textTransform: 'uppercase',
                        cursor: 'help',
                        letterSpacing: '0.04em',
                        textAlign: i <= 1 || i >= 5 ? 'left' : 'right',
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {shownCAs.map((ca) => {
                const sigParts = [];
                if (ca.sha384 > 0) sigParts.push({ name: '384', n: ca.sha384, c: COLORS.gn });
                if (ca.sha256 > 0) sigParts.push({ name: '256', n: ca.sha256, c: COLORS.t2 });
                if (ca.sha512 > 0) sigParts.push({ name: '512', n: ca.sha512, c: COLORS.cy });
                if (ca.sha1 > 0) sigParts.push({ name: 'SHA-1', n: ca.sha1, c: COLORS.rd });
                const clean = ca.belowBodies.length === 0;
                const isExp = expandedPostureCA === ca.id;
                const dEntry = caData.find((d) => d.id === ca.msId || d.id === ca.id || d.caSlug === ca.id);
                return (
                  <React.Fragment key={ca.id}>
                    <tr
                      onClick={() => setExpandedPostureCA(isExp ? null : ca.id)}
                      style={{
                        borderBottom: `1px solid ${COLORS.bd}`,
                        cursor: 'pointer',
                        background: isExp ? COLORS.s2 : 'transparent',
                      }}
                    >
                      <td style={{ padding: '5px', color: COLORS.tx, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 9, color: isExp ? COLORS.ac : COLORS.t3, marginRight: 4 }}>
                          {isExp ? '▼' : '▶'}
                        </span>
                        {caDisplayName(ca.id, ca.msId)}
                      </td>
                      <td style={{ padding: '5px', fontFamily: FONT_MONO, color: COLORS.t2 }}>{ca.total}</td>
                      <td style={{ padding: '5px', textAlign: 'right', fontFamily: FONT_MONO, color: COLORS.am }}>
                        {ca.rsa || '—'}
                      </td>
                      <td style={{ padding: '5px', textAlign: 'right', fontFamily: FONT_MONO, color: COLORS.gn }}>
                        {ca.ecc || '—'}
                      </td>
                      <td style={{ padding: '5px' }}>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {sigParts.map((s) => (
                            <span
                              key={s.name}
                              style={{
                                fontSize: 8,
                                fontFamily: FONT_MONO,
                                color: s.c,
                                padding: '1px 4px',
                                border: `1px solid ${s.c}33`,
                                borderRadius: 2,
                                background: `${s.c}11`,
                              }}
                            >
                              {s.name}×{s.n}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '5px' }}>
                        {clean ? (
                          <span style={{ fontSize: 8, color: COLORS.gn, fontFamily: FONT_MONO }}>✓ Clean</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {ca.belowBodies.map((b) => {
                              const bodyColor = STANDARDS_BODY_SOURCES.find((s) => s.name === b || s.name.includes(b));
                              return (
                                <span
                                  key={b}
                                  style={{
                                    fontSize: 8,
                                    fontFamily: FONT_MONO,
                                    color: bodyColor?.color || COLORS.rd,
                                    padding: '1px 4px',
                                    border: `1px solid ${bodyColor?.color || COLORS.rd}44`,
                                    borderRadius: 2,
                                    background: `${bodyColor?.color || COLORS.rd}11`,
                                  }}
                                >
                                  {b}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '5px', width: '16%' }}>
                        <div style={{ display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden' }}>
                          {ca.rsa2048 > 0 && (
                            <div
                              style={{
                                width: `${(ca.rsa2048 / ca.total) * 100}%`,
                                background: COLORS.rd,
                                opacity: 0.6,
                              }}
                              title={`${ca.rsa2048} RSA-2048`}
                            />
                          )}
                          {ca.rsa - ca.rsa2048 > 0 && (
                            <div
                              style={{
                                width: `${((ca.rsa - ca.rsa2048) / ca.total) * 100}%`,
                                background: COLORS.am,
                                opacity: 0.5,
                              }}
                              title={`${ca.rsa - ca.rsa2048} RSA ≥4096`}
                            />
                          )}
                          {ca.ecc > 0 && (
                            <div
                              style={{ width: `${(ca.ecc / ca.total) * 100}%`, background: COLORS.gn, opacity: 0.5 }}
                              title={`${ca.ecc} ECC`}
                            />
                          )}
                        </div>
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
        </div>
        <div
          style={{
            fontSize: 8,
            color: COLORS.t3,
            marginTop: 8,
            lineHeight: 1.6,
            borderTop: `1px solid ${COLORS.bd}`,
            paddingTop: 6,
          }}
        >
          <strong style={{ color: COLORS.t2 }}>Note on root self-signatures:</strong> Root CA certificates are
          self-signed. The signature on a root is not validated during chain building by relying parties. A root is
          trusted because it is in the trust store, not because its self-signature validates. SHA-1 self-signed roots
          are not a vulnerability. The signature hash and Below Standard columns are indicators of root generation era,
          not current cryptographic exposure in the certificate chain.
        </div>
        <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 4, lineHeight: 1.5 }}>
          <strong style={{ color: COLORS.t2 }}>Below Standard:</strong> Flags which standards bodies' current minimums
          at least one root falls below. Key size: RSA-2048 is below BSI (3000 min), CNSA (3072 min), ECRYPT (3072
          recommended). Hash: SHA-256 is below CNSA (SHA-384 min). SHA-1 is deprecated by all bodies. A CA with both
          legacy and modern roots will show flags for the legacy roots even if newer roots meet all standards.
          <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
            <span>Algorithm mix: </span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: COLORS.rd,
                  opacity: 0.6,
                  marginRight: 2,
                  verticalAlign: 'middle',
                }}
              />
              RSA-2048
            </span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: COLORS.am,
                  opacity: 0.5,
                  marginRight: 2,
                  verticalAlign: 'middle',
                }}
              />
              RSA ≥4096
            </span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: COLORS.gn,
                  opacity: 0.5,
                  marginRight: 2,
                  verticalAlign: 'middle',
                }}
              />
              ECC
            </span>
          </span>
        </div>
      </Card>

      {/* Soonest expiring with algo data */}
      <Card>
        <CardTitle sub="Roots approaching expiration, with algorithm and standards body compliance. When a root expires, every chain beneath it must transition.">
          Soonest Expiring Roots
        </CardTitle>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Pg cnt={expiryPageCount} setCnt={setExpiryPageCount} />
        </div>
        <div style={scrollXStyle}>
          <table style={compactTableStyle}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.bd}` }}>
                {[
                  ['Root Certificate', 'Root certificate common name'],
                  ['CA Owner', 'CA organization operating this root'],
                  ['Stores', 'Trust store inclusion'],
                  ['Key Algo', 'Key algorithm and size'],
                  ['Sig Hash', 'Signature hash algorithm (self-signature)'],
                  ['Below Standard', 'Standards bodies whose minimums this root falls below'],
                  ['Expires', 'Certificate expiration date'],
                  ['Years Left', 'Time until expiration'],
                ].map(([h, tip]) => (
                  <th
                    key={h}
                    title={tip}
                    style={{
                      padding: '5px',
                      color: COLORS.t3,
                      fontSize: 8,
                      textTransform: 'uppercase',
                      cursor: 'help',
                      textAlign: h === 'Years Left' ? 'right' : 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownExpiry.map((r, i) => {
                const allFlags = [...new Set([...r.keyFlags, ...r.hashFlags])].sort();
                const certKey = r.sha256 || r.name + i;
                const isOpen = expandedCert === certKey;
                return (
                  <React.Fragment key={certKey}>
                    <tr
                      onClick={() => expandCert(certKey, r.caId)}
                      style={{
                        borderBottom: `1px solid ${COLORS.bd}`,
                        cursor: 'pointer',
                        background: isOpen ? COLORS.s2 : 'transparent',
                      }}
                    >
                      <td
                        style={{
                          padding: '4px 5px',
                          color: COLORS.tx,
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span style={{ fontSize: 9, color: isOpen ? COLORS.ac : COLORS.t3, marginRight: 4 }}>
                          {isOpen ? '▼' : '▶'}
                        </span>
                        {r.name}
                      </td>
                      <td style={{ padding: '4px 5px', color: COLORS.t2, fontSize: 9 }}>{caDisplayName(r.caId, r.msId)}</td>
                      <td style={{ padding: '4px 5px', textAlign: 'center' }}>
                        <TrustDots
                          tb={{
                            mozilla: (r.stores || '').includes('M'),
                            chrome: (r.stores || '').includes('C'),
                            microsoft: (r.stores || '').includes('S'),
                            apple: (r.stores || '').includes('A'),
                          }}
                        />
                      </td>
                      <td
                        style={{
                          padding: '4px 5px',
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          color: r.family === 'RSA' ? COLORS.am : COLORS.gn,
                        }}
                      >
                        {r.algo}
                      </td>
                      <td
                        style={{
                          padding: '4px 5px',
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          color: r.sig === 'SHA-1' ? COLORS.rd : COLORS.t2,
                        }}
                      >
                        {r.sig}
                      </td>
                      <td style={{ padding: '4px 5px' }}>
                        {allFlags.length === 0 ? (
                          <span style={{ fontSize: 8, color: COLORS.gn }}>✓</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            {allFlags.map((b) => {
                              const bc = STANDARDS_BODY_SOURCES.find((s) => s.name === b || s.name.includes(b));
                              return (
                                <span
                                  key={b}
                                  style={{
                                    fontSize: 7,
                                    fontFamily: FONT_MONO,
                                    color: bc?.color || COLORS.rd,
                                    padding: '1px 3px',
                                    border: `1px solid ${bc?.color || COLORS.rd}44`,
                                    borderRadius: 2,
                                  }}
                                >
                                  {b}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '4px 5px', color: COLORS.t3, fontFamily: FONT_MONO, fontSize: 9 }}>
                        {r.expires}
                      </td>
                      <td
                        style={{
                          padding: '4px 5px',
                          textAlign: 'right',
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          color:
                            r.yrsLeft < 0
                              ? COLORS.rd
                              : r.yrsLeft < 3
                                ? COLORS.rd
                                : r.yrsLeft < 5
                                  ? COLORS.am
                                  : COLORS.t2,
                        }}
                      >
                        {r.yrsLeft < 0 ? 'expired' : parseFloat(r.yrsLeft).toFixed(1) + 'y'}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={expandedCellStyle}>
                          <div
                            style={{
                              padding: '8px 12px',
                              background: COLORS.s1,
                              borderBottom: `1px solid ${COLORS.bd}`,
                            }}
                          >
                            <CertViewer sha256={r.sha256} pem={pemCache[certKey]} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 8, color: COLORS.t3, marginTop: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: STORE_COLORS.mozilla,
                display: 'inline-block',
              }}
            />{' '}
            Mozilla
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: STORE_COLORS.chrome,
                display: 'inline-block',
              }}
            />{' '}
            Chrome
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: STORE_COLORS.microsoft,
                display: 'inline-block',
              }}
            />{' '}
            Microsoft
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: STORE_COLORS.apple,
                display: 'inline-block',
              }}
            />{' '}
            Apple
          </span>
        </div>
      </Card>

      <div style={{ fontSize: 8, color: COLORS.t3, marginTop: 8, lineHeight: 1.6 }}>
        Root algorithm data from CCADB for {new Set((rootAlgo || []).map((r) => r.ca_id)).size} CA owners (
        {allRoots.length} roots). Intermediate certificate data, where algorithm migration actually happens at the
        issuance layer, is not yet available. A CA with RSA-only roots can issue ECC leaf certificates through
        cross-signed ECC intermediates. Standards body data from keylength.com.
      </div>
    </div>
  );
};

export default CryptoView;
