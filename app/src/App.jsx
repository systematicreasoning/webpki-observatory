/**
 * App.jsx — Shell component for the WebPKI Observatory.
 *
 * Handles tab routing via URL hash, wraps the view layer in PipelineProvider
 * so every component can access pipeline data without prop threading, and
 * renders the site header, tab bar, active view, and methodology footer.
 */
import React, { useState, useEffect } from 'react';
import { COLORS, FONT_SANS } from './constants';
import { TabBar } from './components/shared';
import { PipelineProvider, usePipeline } from './PipelineContext';

import ErrorBoundary from './ErrorBoundary';

import MarketView from './components/MarketView';
import TrustView from './components/TrustView';
import ConcView from './components/ConcView';
import TailView from './components/TailView';
import GeoView from './components/GeoView';
import GovView from './components/GovView';
import OpsView from './components/OpsView';
import PolicyView from './components/PolicyView';
import CryptoView from './components/CryptoView';
import JurisdictionView from './components/JurisdictionView';
import DistrustView from './components/DistrustView';

const TABS = [
  { id: 'market', l: 'Market Share' },
  { id: 'trust', l: 'Trust Surface' },
  { id: 'conc', l: 'Concentration Risk' },
  { id: 'tail', l: 'Long Tail Risk' },
  { id: 'geo', l: 'Geographic Risk' },
  { id: 'gov', l: 'Government Risk' },
  { id: 'jurisdiction', l: 'Jurisdiction Risk' },
  { id: 'ops', l: 'Operational Risk' },
  { id: 'policy', l: 'Policy Impact' },
  { id: 'crypto', l: 'Cryptographic Posture' },
  { id: 'distrust', l: 'Distrust History' },
];

const VALID_TAB_IDS = TABS.map((t) => t.id);

function getTabFromHash() {
  const h = window.location.hash.replace('#', '');
  return VALID_TAB_IDS.includes(h) ? h : 'market';
}

/** Inner shell that can use usePipeline() */
function AppContent() {
  const { intersections, roots } = usePipeline();

  const [tab, setTabState] = useState(getTabFromHash);

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

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 24px', overflow: 'hidden' }}>
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
        </div>

        {/* Tab navigation */}
        <TabBar tabs={TABS} active={tab} onSelect={setTab} />

        {/* Active view — each wrapped in ErrorBoundary so one tab crashing doesn't take down the dashboard */}
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
          <ErrorBoundary label="Policy Impact">
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

        {/* Footer: data sources and methodology */}
        <Footer intersections={intersections} roots={roots} />
      </div>
    </div>
  );
}

/** Methodology and data source disclosure */
function Footer({ intersections, roots }) {
  const rootCount = Object.values(roots).reduce((s, a) => s + a.length, 0);
  const caCount = Object.keys(roots).length;

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
          marginBottom: 8,
        }}
      >
        <span>
          Data: crt.sh cert-populations (Root Owner) + CCADB AllCertificateRecordsCSVFormatv4 + Bugzilla CA Certificate
          Compliance + StatCounter browser market share
        </span>
        <span><a href="https://SystematicReasoning.com" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.t3, textDecoration: 'none' }}>Systematic Reasoning, Inc.</a></span>
      </div>

      <details style={{ cursor: 'pointer' }}>
        <summary style={{ color: COLORS.t2, fontWeight: 500, marginBottom: 4 }}>
          Methodology and Known Limitations
        </summary>
        <div style={{ marginTop: 6 }}>
          <MethodItem label="Unit of analysis">
            CA Owner (organization level). "{intersections.ao} trusted CA owners" = organizations with at least one root
            in any of the four major trust stores.
          </MethodItem>
          <MethodItem label="Certificate counts">
            Unexpired precertificates from CT logs via crt.sh, grouped by Root Owner.
          </MethodItem>
          <MethodItem label="Jurisdiction">
            Derived from the CCADB CA Owner country field. Government classifications use manually curated structural
            relationships.
          </MethodItem>
          <MethodItem label="Incident rate (Ops‡)">
            Cumulative Bugzilla CA Certificate Compliance bugs (2014-present) / all-time certificates issued, per
            million. Uses all-time denominator to match the all-time numerator. Lifetime rate, not annual. Lifetime
            rate, not annual.
          </MethodItem>
          <MethodItem label="Usage period (†)">
            365 / (all-time certs / unexpired certs). Measures replacement behavior, not validity period.
          </MethodItem>
          <MethodItem label="Web coverage">
            Trust store presence mapped to StatCounter browser market share. Chrome ~77%, Apple ~18%, Mozilla ~2.5%,
            Microsoft {'<'}1%.
          </MethodItem>
          <MethodItem label="Root data">
            {rootCount} roots across {caCount} CA owners from CCADB.
          </MethodItem>
          <MethodItem label="Data freshness">
            Pipeline runs daily. crt.sh/CCADB warn after 48h, critical after 7d. Bugzilla warns after 72h, critical
            after 14d.
          </MethodItem>
        </div>
      </details>
    </div>
  );
}

function MethodItem({ label, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <strong style={{ color: COLORS.t2 }}>{label}:</strong> {children}
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
