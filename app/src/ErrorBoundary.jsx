import React from 'react';
import { COLORS, FONT_SANS } from './constants';

/**
 * ErrorBoundary — Catches rendering errors in child components.
 *
 * Wraps each tab so a crash in one doesn't take down the entire dashboard.
 * Shows a recovery UI with the error message and a retry button.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary] ${this.props.label || 'Component'} crashed:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: COLORS.s1,
            borderRadius: 10,
            border: `1px solid ${COLORS.rd}33`,
            padding: '32px 24px',
            textAlign: 'center',
            fontFamily: FONT_SANS,
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>⚠</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.t2, marginBottom: 8 }}>
            {this.props.label || 'This section'} encountered an error
          </div>
          <div style={{ fontSize: 11, color: COLORS.t3, marginBottom: 16, maxWidth: 480, margin: '0 auto 16px' }}>
            {this.state.error?.message || 'An unexpected error occurred while rendering this tab.'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: COLORS.s2,
              border: `1px solid ${COLORS.bd}`,
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 11,
              color: COLORS.t2,
              cursor: 'pointer',
              fontFamily: FONT_SANS,
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
