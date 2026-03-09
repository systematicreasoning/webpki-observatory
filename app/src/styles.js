/**
 * styles.js — Shared style objects for repeated patterns.
 *
 * Components import named styles from here instead of duplicating inline
 * style objects. This ensures visual consistency and makes design changes
 * a single-point edit.
 *
 * Naming convention:
 *   - Layout containers: *Style (e.g., statGridStyle, toolbarStyle)
 *   - Table elements: th*, td*, table* (e.g., thStyle, tdMono)
 *   - Row states: *RowStyle (e.g., expandableRowStyle)
 *   - Text: *Text (e.g., footnoteText, sectionLabel)
 *   - Inline elements: *Inline (e.g., expandChevron)
 */
import { COLORS, FONT_MONO, FONT_SANS } from './constants';

// ── Layout ──

/** Stat grid used at the top of most views */
export const statGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))',
  gap: 16,
  marginBottom: 28,
};

export const narrowStatGrid = {
  ...statGridStyle,
  gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))',
};

/** Filter/pagination toolbar row */
export const toolbarStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 14,
  gap: 8,
};

/** Flex row with right-aligned controls */
export const controlRowStyle = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexShrink: 0,
};

/** Card header with title + controls */
export const cardHeaderStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 8,
  marginBottom: 12,
};

/** Scrollable container for wide tables */
export const scrollXStyle = {
  overflowX: 'auto',
};

// ── Tables ──

/** Standard table (11px) */
export const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11,
  fontFamily: FONT_SANS,
};

/** Compact table (10px) — most tab tables */
export const compactTableStyle = {
  ...tableStyle,
  fontSize: 10,
};

/** Tiny table (9px) — nested/detail tables */
export const tinyTableStyle = {
  ...tableStyle,
  fontSize: 9,
};

/** Standard table header cell */
export const thStyle = {
  padding: '7px 5px',
  color: COLORS.t3,
  fontWeight: 500,
  fontSize: 9,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  cursor: 'help',
};

/** Compact table header (8px, used in detail tables) */
export const thCompact = {
  ...thStyle,
  padding: '5px',
  fontSize: 8,
  letterSpacing: '0.05em',
};

/** Standard table cell */
export const tdStyle = {
  padding: '6px 5px',
  borderBottom: `1px solid ${COLORS.bd}`,
};

/** Compact table cell */
export const tdCompact = {
  padding: '4px 5px',
  borderBottom: `1px solid ${COLORS.bd}`,
};

/** Monospace cell (numbers, hashes) */
export const monoCell = {
  fontFamily: FONT_MONO,
  fontSize: 10,
};

/** Small monospace cell */
export const monoCellSmall = {
  fontFamily: FONT_MONO,
  fontSize: 9,
};

/** Row border */
export const rowBorder = {
  borderBottom: `1px solid ${COLORS.bd}`,
};

/** Row that highlights on hover and supports click-to-expand */
export const expandableRowStyle = (isExpanded) => ({
  borderBottom: `1px solid ${COLORS.bd}`,
  cursor: 'pointer',
  background: isExpanded ? COLORS.s2 : 'transparent',
  transition: 'background 0.1s',
});

/** Expanded detail cell (colSpan, no padding) */
export const expandedCellStyle = {
  padding: 0,
};

// ── Expand/collapse chevron ──

export const expandChevron = (isExpanded) => ({
  fontSize: 9,
  color: isExpanded ? COLORS.ac : COLORS.t3,
  marginRight: 3,
});

// ── Inputs ──

/** Search/filter input */
export const searchInputStyle = {
  background: COLORS.bg,
  border: `1px solid ${COLORS.bd}`,
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 11,
  color: COLORS.tx,
  fontFamily: FONT_SANS,
  width: 200,
  maxWidth: '100%',
  outline: 'none',
};

/** Narrow search input (160px, used in cards with tight layouts) */
export const searchInputNarrow = {
  ...searchInputStyle,
  width: 160,
};

/** Page size / filter button */
export const pageButtonStyle = (isActive) => ({
  padding: '4px 8px',
  fontSize: 10,
  borderRadius: 4,
  cursor: 'pointer',
  border: `1px solid ${isActive ? COLORS.bl : COLORS.bd}`,
  background: isActive ? COLORS.s2 : 'transparent',
  color: isActive ? COLORS.t2 : COLORS.t3,
});

/** Small page button (9px, used in tight layouts) */
export const pageButtonSmall = (isActive) => ({
  ...pageButtonStyle(isActive),
  fontSize: 9,
});

/** Minimal text button (show more, show all) */
export const textButtonStyle = {
  fontSize: 9,
  color: COLORS.t3,
  background: 'transparent',
  border: `1px solid ${COLORS.bd}`,
  borderRadius: 4,
  padding: '3px 8px',
  cursor: 'pointer',
};

// ── Bars & Charts ──

/** Proportional bar container (32px tall) */
export const barContainerStyle = {
  height: 32,
  borderRadius: 6,
  overflow: 'hidden',
  display: 'flex',
};

/** Shorter proportional bar (20px) */
export const barContainerShort = {
  ...barContainerStyle,
  height: 20,
  borderRadius: 4,
};

/** Background bar track */
export const barTrackStyle = {
  height: '100%',
  background: COLORS.bg,
  borderRadius: 4,
  overflow: 'hidden',
};

/** Filled bar segment (needs width and background set inline) */
export const barFillStyle = {
  height: '100%',
  borderRadius: 4,
};

// ── Text Styles ──

/** Footnote / methodology text at bottom of views */
export const footnoteStyle = {
  fontSize: 8,
  color: COLORS.t3,
  marginTop: 8,
  lineHeight: 1.6,
  borderTop: `1px solid ${COLORS.bd}`,
  paddingTop: 6,
};

/** Section label (uppercase, small) */
export const sectionLabelStyle = {
  fontSize: 9,
  color: COLORS.t3,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
};

/** Metric label (tiny uppercase) */
export const metricLabelStyle = {
  fontSize: 8,
  color: COLORS.t3,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 2,
};

/** CA name in table (truncated) */
export const caNameCell = {
  padding: '6px 5px',
  color: COLORS.tx,
  fontWeight: 500,
  maxWidth: 180,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** Country cell (truncated) */
export const countryCell = {
  padding: '6px 5px',
  color: COLORS.t2,
  fontSize: 10,
  maxWidth: 90,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// ── Badges & Indicators ──

/** Legend row beneath charts */
export const legendRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 12px',
  fontSize: 8,
  color: COLORS.t3,
};

/** Small colored dot for legends */
export const legendDot = (color, size = 6) => ({
  display: 'inline-block',
  width: size,
  height: size,
  borderRadius: '50%',
  background: color,
  marginRight: 3,
  verticalAlign: 'middle',
});

/** Small colored square for legends */
export const legendSquare = (color, size = 8) => ({
  display: 'inline-block',
  width: size,
  height: size,
  borderRadius: 2,
  background: color,
  marginRight: 3,
  verticalAlign: 'middle',
});

/** Info/caveat tag (small colored label) */
export const infoTag = (color) => ({
  fontSize: 7,
  padding: '1px 3px',
  borderRadius: 2,
  background: `${color}18`,
  color: color,
  border: `1px solid ${color}33`,
});

/** Warning callout box */
export const warningCallout = {
  background: 'rgba(245,158,11,0.08)',
  border: '1px solid rgba(245,158,11,0.2)',
  borderRadius: 6,
  padding: '8px 12px',
  marginBottom: 12,
  fontSize: 9,
  color: COLORS.am,
  lineHeight: 1.5,
};
