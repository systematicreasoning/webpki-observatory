/**
 * App.jsx — Shell component for the WebPKI Observatory.
 *
 * Handles tab routing via URL hash, wraps the view layer in PipelineProvider
 * so every component can access pipeline data without prop threading, and
 * renders the site header, tab bar, active view, and methodology footer.
 *
 * All 12 tab components are lazy-loaded — only the active tab's code is
 * fetched. This reduces the initial bundle from ~1.8MB to ~400KB.
 */
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { COLORS, FONT_SANS } from './constants';
import { TabBar } from './components/shared';
import { PipelineProvider, usePipeline } from './PipelineContext';

import ErrorBoundary from './ErrorBoundary';

const MarketView = lazy(() => import('./components/MarketView'));
const TrustView = lazy(() => import('./components/TrustView'));
const ConcView = lazy(() => import('./components/ConcView'));
const TailView = lazy(() => import('./components/TailView'));
const GeoView = lazy(() => import('./components/GeoView'));
const GovView = lazy(() => import('./components/GovView'));
const OpsView = lazy(() => import('./components/OpsView'));
const PolicyView = lazy(() => import('./components/PolicyView'));
const CryptoView = lazy(() => import('./components/CryptoView'));
const JurisdictionView = lazy(() => import('./components/JurisdictionView'));
const DistrustView = lazy(() => import('./components/DistrustView'));
const GovernanceRiskView = lazy(() => import('./components/GovernanceRiskView'));
const CommunityView = lazy(() => import('./components/CommunityView'));

const TABS = [
  // Act 1 — The landscape
  { id: 'market',      l: 'Market Share' },
  { id: 'trust',       l: 'Trust Surface' },
  { id: 'conc',        l: 'Concentration Risk' },
  { id: 'tail',        l: 'Long Tail Risk' },
  // Act 2 — Risk vectors
  { id: 'geo',         l: 'Geographic Risk' },
  { id: 'gov',         l: 'Government Risk' },
  { id: 'jurisdiction',l: 'Jurisdiction Risk' },
  // Act 3 — CA behavior
  { id: 'ops',         l: 'Operational Risk' },
  { id: 'crypto',      l: 'Cryptographic Posture' },
  { id: 'distrust',    l: 'Distrust History' },
  // Act 4 — Governance accountability
  { id: 'policy',      l: 'BR Readiness' },
  { id: 'governance',  l: 'Governance Risk' },
  { id: 'community',   l: 'Ecosystem Participation' },
];

const VALID_TAB_IDS = TABS.map((t) => t.id);

function getTabFromHash() {
  const h = window.location.hash.replace('#', '');
  return VALID_TAB_IDS.includes(h) ? h : 'market';
}

/** Loading fallback shown while a tab chunk is fetched */
function TabLoading() {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: COLORS.t3, fontSize: 11 }}>
      Loading...
    </div>
  );
}

/** Inner shell that can use usePipeline() */
function AppContent() {
  const { intersections, roots } = usePipeline();

  const [tab, setTabState] = useState(getTabFromHash);

  // ── Theme ──
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch {}
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const setTab = (id) => {
    setTabState(id);
    window.location.hash = id;
  };

  // Sync tab state with browser back/forward
  useEffect(() => {
    const onHash = () => setTabState(getTabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Update browser tab title to match active view
  useEffect(() => {
    const label = TABS.find((t) => t.id === tab)?.l || 'Market Share';
    document.title = `WebPKI Observatory \u2013 ${label}`;
  }, [tab]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.bg,
        color: COLORS.tx,
        fontFamily: FONT_SANS,
      }}
    >
      {/* Fonts and Peculiar certificates-viewer web component */}
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(12px, 4vw, 28px) clamp(12px, 3vw, 24px)', overflowX: 'clip' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 12,
            marginBottom: 28,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.03em' }}>
              <a href="https://webpki.systematicreasoning.com/" style={{ color: COLORS.ac, textDecoration: 'none' }}>WebPKI</a> Observatory
            </h1>
            <p style={{ fontSize: 9, color: COLORS.t3, margin: '4px 0 0' }}>
              All data reflects currently trusted CAs only. Distrusted CAs are excluded.
            </p>
          </div>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: COLORS.s2,
              border: `1px solid ${COLORS.bd}`,
              borderRadius: 6,
              color: COLORS.t2,
              cursor: 'pointer',
              fontSize: 14,
              padding: '4px 10px',
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>

        {/* Tab navigation */}
        <TabBar tabs={TABS} active={tab} onSelect={setTab} />

        {/* Active view — lazy-loaded, each wrapped in ErrorBoundary */}
        <Suspense fallback={<TabLoading />}>
          {tab === 'market' && (
            <ErrorBoundary label="Market Share">
              <MarketView />
            </ErrorBoundary>
          )}
          {tab === 'trust' && (
            <ErrorBoundary label="Trust Surface">
              <TrustView />
            </ErrorBoundary>
          )}
          {tab === 'conc' && (
            <ErrorBoundary label="Concentration Risk">
              <ConcView />
            </ErrorBoundary>
          )}
          {tab === 'tail' && (
            <ErrorBoundary label="Long Tail Risk">
              <TailView />
            </ErrorBoundary>
          )}
          {tab === 'geo' && (
            <ErrorBoundary label="Geographic Risk">
              <GeoView />
            </ErrorBoundary>
          )}
          {tab === 'gov' && (
            <ErrorBoundary label="Government Risk">
              <GovView />
            </ErrorBoundary>
          )}
          {tab === 'jurisdiction' && (
            <ErrorBoundary label="Jurisdiction Risk">
              <JurisdictionView />
            </ErrorBoundary>
          )}
          {tab === 'ops' && (
            <ErrorBoundary label="Operational Risk">
              <OpsView />
            </ErrorBoundary>
          )}
          {tab === 'policy' && (
            <ErrorBoundary label="BR Readiness">
              <PolicyView />
            </ErrorBoundary>
          )}
          {tab === 'crypto' && (
            <ErrorBoundary label="Cryptographic Posture">
              <CryptoView />
            </ErrorBoundary>
          )}
          {tab === 'distrust' && (
            <ErrorBoundary label="Distrust History">
              <DistrustView />
            </ErrorBoundary>
          )}
          {tab === 'governance' && (
            <ErrorBoundary label="Governance Risk">
              <GovernanceRiskView />
            </ErrorBoundary>
          )}
          {tab === 'community' && (
            <ErrorBoundary label="Ecosystem Participation">
              <CommunityView />
            </ErrorBoundary>
          )}
        </Suspense>

        {/* Footer: data sources and methodology */}
        <Footer intersections={intersections} roots={roots} />
      </div>
    </div>
  );
}

/** Data source footer */
function Footer({ intersections, roots }) {
  return (
    <div
      style={{
        marginTop: 32,
        paddingTop: 16,
        borderTop: `1px solid ${COLORS.bd}`,
        fontSize: 9,
        color: COLORS.t3,
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span>
          Data: crt.sh cert-populations (Root Owner) + CCADB AllCertificateRecordsCSVFormatv4 + Bugzilla CA Certificate
          Compliance + StatCounter browser market share
          {' · '}
          <a href="/llm_snapshot.json" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.t3, textDecoration: 'underline' }}>LLM Snapshot</a>
          {' · '}
          <a href="/schema.json" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.t3, textDecoration: 'underline' }}>Schema</a>
        </span>
        <span><a href="https://SystematicReasoning.com" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.t3, textDecoration: 'none' }}>Systematic Reasoning, Inc.</a></span>
      </div>
    </div>
  );
}

/** Root component wraps everything in PipelineProvider */
export default function App() {
  return (
    <PipelineProvider>
      <AppContent />
    </PipelineProvider>
  );
}
