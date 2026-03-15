/**
 * PipelineContext: provides all pipeline data to the component tree.
 *
 * Instead of threading caData, browserCoverage, roots, govRisk, incidentsData,
 * and incidentCounts through props to every component that needs them, this
 * context makes them available via usePipeline().
 */
import React, { createContext, useContext, useMemo } from 'react';
import {
  CA_DATA,
  BR_VALIDITY,
  BROWSER_COVERAGE,
  INTERSECTIONS,
  GEOGRAPHY,
  GOV_RISK,
  INCIDENTS_DATA,
  ROOTS,
  INCIDENT_COUNTS,
  JURISDICTION_RISK,
  ROOT_ALGO,
  DISTRUST_DATA,
  RPE_DATA,
  COMMUNITY_DATA,
  CHROME_CHANGELOG,
} from './data';

const PipelineContext = createContext(null);

export function PipelineProvider({ children }) {
  const value = useMemo(
    () => {
      // Defensive defaults: if a pipeline field is missing or malformed,
      // provide a safe empty value so components don't crash.
      const caData = Array.isArray(CA_DATA) ? CA_DATA : [];
      const brValidity = Array.isArray(BR_VALIDITY) ? BR_VALIDITY : [];
      const browserCoverage = BROWSER_COVERAGE || { chrome: 0, apple: 0, mozilla: 0, microsoft: 0 };
      const intersections = INTERSECTIONS || { rc: [], oc: [], ps: {}, a4: { r: 0, o: 0 }, ao: 0, tr: 0 };
      const geography = Array.isArray(GEOGRAPHY) ? GEOGRAPHY : [];
      const govRisk = GOV_RISK || { t: {}, n: 0, cas: [] };
      const incidentsData = INCIDENTS_DATA || { total: 0, total_with_distrusted: 0, ca_count: 0, ca_count_with_distrusted: 0, years: [], categories: [], cas: [], yearsByClass: [], fingerprints: [], distrusted_excluded: [], distrusted_years: [] };
      const roots = ROOTS || {};
      const incidentCounts = INCIDENT_COUNTS || {};
      const jurisdictionRisk = JURISDICTION_RISK || { jurisdictions: [] };
      const rootAlgo = Array.isArray(ROOT_ALGO) ? ROOT_ALGO : [];
      const distrustData = DISTRUST_DATA || { events: [], stats: {}, taxonomy: {} };
      const rpeData = RPE_DATA || null;
      const communityData = COMMUNITY_DATA || null;
      const chromeChangelog = CHROME_CHANGELOG || null;
      const trustedCAs = caData.filter((d) => d.storeCount > 0 || d.parent);

      return {
        caData, brValidity, browserCoverage, intersections, geography,
        govRisk, incidentsData, roots, incidentCounts, jurisdictionRisk,
        rootAlgo, distrustData, rpeData, communityData, chromeChangelog, trustedCAs,
      };
    },
    [],
  );

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}

/** Hook to access pipeline data from any component */
export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error('usePipeline must be used within PipelineProvider');
  return ctx;
}
