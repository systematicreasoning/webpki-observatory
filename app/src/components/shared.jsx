import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { COLORS, STORE_COLORS, FONT_MONO, FONT_SANS, STALE, COUNTRY_COORDS } from '../constants';
import { f, dn } from '../helpers';
import { PipelineContext as PipelineCtx } from '../PipelineContext';

// ── Atoms ──

export const Card = ({ children, style }) => (
  <div
    style={{
      background: COLORS.s1,
      borderRadius: 10,
      border: `1px solid ${COLORS.bd}`,
      padding: '14px 16px',
      marginBottom: 12,
      overflow: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);

export const CardTitle = ({ children, sub }) => (
  <div style={{ marginBottom: sub ? 10 : 16 }}>
    <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.tx, letterSpacing: '-0.01em' }}>{children}</div>
    {sub && <div style={{ fontSize: 10, color: COLORS.t3, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>}
  </div>
);

/**
 * TabIntro — epigraph + explanatory paragraph shown at the top of each tab.
 * `quote` is the italic lead-in (aphorism or framing line).
 * `children` is the explanatory body text.
 */
export const TabIntro = ({ quote, tabId, children }) => {
  const ctx = React.useContext(PipelineCtx);
  const generated = tabId && ctx?.tabIntros?.[tabId];
  return (
  <div
    style={{
      marginBottom: 20,
      padding: '14px 16px',
      background: COLORS.s1,
      borderRadius: 10,
      border: `1px solid ${COLORS.bd}`,
      lineHeight: 1.65,
    }}
  >
    {quote && (
      <div
        style={{
          fontSize: 12,
          fontStyle: 'italic',
          color: COLORS.t2,
          marginBottom: 8,
          borderLeft: `2px solid ${COLORS.ac}`,
          paddingLeft: 10,
        }}
      >
        {quote}
      </div>
    )}
    <div style={{ fontSize: 11, color: COLORS.t3 }}>
      {generated || children}
    </div>
  </div>
  );
};

export const StatCard = ({ l, v, s, c }) => (
  <div style={{ textAlign: 'center' }}>
    <div
      style={{
        fontSize: 28,
        fontWeight: 700,
        color: c || COLORS.tx,
        fontFamily: FONT_MONO,
        letterSpacing: '-0.03em',
        lineHeight: 1,
      }}
    >
      {v}
    </div>
    <div style={{ fontSize: 10, color: COLORS.t2, marginTop: 4 }}>{l}</div>
    {s && <div style={{ fontSize: 9, color: COLORS.t3, marginTop: 1 }}>{s}</div>}
  </div>
);

/** Trust store inclusion dots: mozilla, chrome, microsoft, apple */
export const TrustDots = ({ tb, sz = 6 }) => (
  <span style={{ display: 'inline-flex', gap: 2 }}>
    {['mozilla', 'chrome', 'microsoft', 'apple'].map((s) => (
      <span
        key={s}
        title={s}
        style={{
          width: sz,
          height: sz,
          borderRadius: '50%',
          display: 'inline-block',
          background: tb[s] ? STORE_COLORS[s] : COLORS.bd,
          border: tb[s] ? 'none' : `1px solid ${COLORS.bl}`,
        }}
      />
    ))}
  </span>
);

/** Capability badge: TLS, EV, S/MIME, CS */
export const Badge = ({ on, l, inf }) => (
  <span
    style={{
      fontSize: 8,
      padding: '1px 4px',
      borderRadius: 2,
      fontFamily: FONT_MONO,
      background: on ? (inf ? 'rgba(245,158,11,0.08)' : COLORS.ag) : 'transparent',
      color: on ? (inf ? COLORS.am : COLORS.ac) : COLORS.t3,
      border: `1px solid ${on ? (inf ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)') : COLORS.bd}`,
    }}
  >
    {l}
    {inf && on ? '*' : ''}
  </span>
);

/** Incident rate colored dot.
 * Thresholds calibrated for all-time PPM (incidents / all-time certs * 1M):
 *   Green: < 10 per M (volume CAs with clean records)
 *   Amber: 10-1000 per M (typical range)
 *   Red: > 1000 per M (high rate relative to issuance history)
 */
export const RateDot = ({ ppm, size = 8 }) => {
  if (ppm === null || ppm === undefined) {
    return (
      <span
        style={{ width: size, height: size, borderRadius: '50%', display: 'inline-block', background: COLORS.bd }}
        title="No data"
      />
    );
  }
  const cl = ppm > 1000 ? COLORS.rd : ppm > 10 ? COLORS.am : COLORS.gn;
  return (
    <span
      style={{ width: size, height: size, borderRadius: '50%', display: 'inline-block', background: cl, opacity: 0.8 }}
      title={`${ppm.toFixed(2)} incidents per M all-time certs`}
    />
  );
};

/** Recharts custom tooltip wrapper */
export const ChartTooltip = ({ active, payload, render }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: COLORS.s2,
        border: `1px solid ${COLORS.bl}`,
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 11,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      {render(payload[0].payload)}
    </div>
  );
};

/** Chart wrapper: ensures ResponsiveContainer gets correct dimensions */
export const ChartWrap = ({ height, children }) => {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div ref={ref} style={{ height, width: '100%', minWidth: 280, position: 'relative', overflowX: 'auto' }}>
      {ready ? (
        children
      ) : (
        <div
          style={{
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: COLORS.t3,
            fontSize: 10,
          }}
        >
          Loading chart...
        </div>
      )}
    </div>
  );
};

/** Data staleness indicator */
export const DataMeta = ({ source, updated, tab }) => {
  if (!updated) return null;
  const age = Math.round((Date.now() - new Date(updated).getTime()) / 3600000);
  const policy = STALE[tab] || { warn: 48, crit: 168 };
  const stale = age > policy.crit ? 'critical' : age > policy.warn ? 'warning' : 'ok';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 9,
        color: stale === 'critical' ? COLORS.rd : stale === 'warning' ? COLORS.am : COLORS.t3,
        marginBottom: stale !== 'ok' ? 12 : 0,
      }}
    >
      {stale === 'critical' && (
        <span
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: `1px solid ${COLORS.rd}`,
            borderRadius: 4,
            padding: '3px 8px',
          }}
        >
          Data is {Math.round(age / 24)} days old. There may be a pipeline issue. Please report at
          github.com/systematicreasoning/webpki-observatory.
        </span>
      )}
      {stale === 'warning' && (
        <span
          style={{
            background: 'rgba(245,158,11,0.1)',
            border: `1px solid ${COLORS.am}`,
            borderRadius: 4,
            padding: '3px 8px',
          }}
        >
          Data is {Math.round(age / 24)} days old. Next pipeline run should refresh it.
        </span>
      )}
    </div>
  );
};

/** Placeholder for tabs whose pipeline data isn't populated yet */
export const DataPending = ({ tab, source, description }) => (
  <Card style={{ border: `1px dashed ${COLORS.bl}` }}>
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◇</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.t2, marginBottom: 6 }}>{tab}</div>
      <div
        style={{ fontSize: 11, color: COLORS.t3, lineHeight: 1.6, maxWidth: 480, margin: '0 auto', marginBottom: 12 }}
      >
        {description}
      </div>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: COLORS.bg,
          borderRadius: 6,
          padding: '6px 12px',
          border: `1px solid ${COLORS.bd}`,
        }}
      >
        <span style={{ fontSize: 9, color: COLORS.t3 }}>Data source:</span>
        <span style={{ fontSize: 9, color: COLORS.t2, fontFamily: FONT_MONO }}>{source}</span>
      </div>
    </div>
  </Card>
);

/** Tab bar navigation */
export const TabBar = ({ tabs, active, onSelect }) => {
  const scrollRef = useRef(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 4);
    setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [checkScroll]);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: 'smooth' });
  };

  const arrowStyle = (side) => ({
    position: 'absolute',
    [side]: 0,
    top: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    zIndex: 2,
    background: `linear-gradient(${side === 'left' ? '90deg' : '270deg'}, ${COLORS.s1} 60%, transparent)`,
    padding: '0 6px',
    cursor: 'pointer',
    border: 'none',
    color: COLORS.t2,
    fontSize: 14,
    fontFamily: FONT_SANS,
  });

  return (
    <div style={{ position: 'relative', marginBottom: 24 }}>
      {showLeft && (
        <button onClick={() => scroll(-1)} style={arrowStyle('left')} aria-label="Scroll tabs left">
          ◀
        </button>
      )}
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          gap: 1,
          background: COLORS.s1,
          borderRadius: 8,
          padding: 3,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        {tabs.map((t) => {
          const jsonPaths = {
            market:       '$.market',
            trust:        '$.trustSurface',
            conc:         '$.concentration',
            tail:         '$.market[?(@.share<0.01)]',
            geo:          '$.geography',
            gov:          '$.governmentRisk',
            jurisdiction: '$.jurisdictionRisk',
            ops:          '$.incidents',
            crypto:       '$.cryptoSummary',
            distrust:     '$.distrustEvents',
            policy:       '$.brThresholds',
            governance:   '$.governance',
            community:    '$.ecosystemParticipation',
          };
          return (
          <button
            key={t.id}
            onClick={(e) => {
              onSelect(t.id);
              e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
            data-tab-id={t.id}
            data-json-path={jsonPaths[t.id] || `$.${t.id}`}
            data-json-source="https://webpki.systematicreasoning.com/llm_snapshot.json"
            aria-selected={active === t.id}
            role="tab"
            style={{
              flex: '1 0 auto',
              minWidth: 0,
              padding: '9px 8px',
              background: active === t.id ? COLORS.s2 : 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              color: active === t.id ? COLORS.tx : COLORS.t3,
              fontSize: 11,
              fontWeight: active === t.id ? 600 : 400,
              fontFamily: FONT_SANS,
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {t.l}
          </button>
          );
        })}
      </div>
      {showRight && (
        <button onClick={() => scroll(1)} style={arrowStyle('right')} aria-label="Scroll tabs right">
          ▶
        </button>
      )}
    </div>
  );
};

/** Page size selector */
export const Paginator = ({ count, setCount, options = [10, 15, 25, 0] }) => (
  <div style={{ display: 'flex', gap: 4 }}>
    {options.map((n) => (
      <button
        key={n}
        onClick={() => setCount(n)}
        style={{
          padding: '4px 8px',
          fontSize: 10,
          borderRadius: 4,
          cursor: 'pointer',
          border: `1px solid ${count === n ? COLORS.bl : COLORS.bd}`,
          background: count === n ? COLORS.s2 : 'transparent',
          color: count === n ? COLORS.t2 : COLORS.t3,
        }}
      >
        {n === 0 ? 'All' : n}
      </button>
    ))}
  </div>
);

// ── World Map (d3 + SVG) ──

import worldAtlasData from 'world-atlas/countries-110m.json';

export const GeoMap = ({ pins, legend, height = 280 }) => {
  const svgRef = useRef();
  const gRef = useRef();
  const [world, setWorld] = useState(null);
  const [hov, setHov] = useState(null);
  const [mapError, setMapError] = useState(false);
  const zoomRef = useRef(null);

  useEffect(() => {
    try {
      const t = worldAtlasData;
      const obj = t.objects.countries;
      const arcToCoords = (topology, arc) => {
        const a = topology.arcs[arc < 0 ? ~arc : arc];
        let x = 0,
          y = 0;
        const coords = a.map((d) => {
          x += d[0];
          y += d[1];
          return [x, y];
        });
        if (arc < 0) coords.reverse();
        return coords;
      };
      const decodeArc = (topology) => {
        const { scale, translate } = topology.transform || { scale: [1, 1], translate: [0, 0] };
        return (c) => [c[0] * scale[0] + translate[0], c[1] * scale[1] + translate[1]];
      };
      const decode = t.transform ? decodeArc(t) : (c) => c;
      const ringCoords = (topology, ring) => {
        let coords = [];
        ring.forEach((arcIdx) => {
          const c = arcToCoords(topology, arcIdx);
          coords = coords.concat(c);
        });
        return coords.map(decode);
      };
      const features = obj.geometries.map((geom) => {
        let coordinates;
        if (geom.type === 'Polygon') {
          coordinates = geom.arcs.map((ring) => ringCoords(t, ring));
        } else if (geom.type === 'MultiPolygon') {
          coordinates = geom.arcs.map((polygon) => polygon.map((ring) => ringCoords(t, ring)));
        } else {
          coordinates = [];
        }
        return {
          type: 'Feature',
          geometry: { type: geom.type, coordinates },
          properties: geom.properties || {},
          id: geom.id,
        };
      });
      setWorld({ type: 'FeatureCollection', features });
    } catch (e) {
      setMapError(true);
    }
  }, []);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);
    const zoom = d3
      .zoom()
      .scaleExtent([0.8, 8])
      .on('zoom', (e) => {
        g.attr('transform', e.transform);
      });
    zoomRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(-180, -30).scale(1.4));
    return () => svg.on('.zoom', null);
  }, [world]);

  const handleZoom = (dir) => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg
      .transition()
      .duration(300)
      .call(zoomRef.current.scaleBy, dir === 'in' ? 1.5 : 1 / 1.5);
  };

  const rendered = useMemo(() => {
    if (!world) return null;
    const W = 720,
      H = height;
    const proj = d3
      .geoNaturalEarth1()
      .fitSize([W - 20, H - 20], world)
      .translate([W / 2, H / 2]);
    const path = d3.geoPath(proj);
    return { W, H, proj, countries: world.features.map((f) => ({ d: path(f), name: f.properties?.name || '' })) };
  }, [world, height]);

  if (mapError) {
    return (
      <div
        style={{
          height,
          background: COLORS.bg,
          borderRadius: 8,
          border: `1px solid ${COLORS.bd}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ color: COLORS.t3, fontSize: 11 }}>Map data unavailable</span>
      </div>
    );
  }
  if (!rendered) {
    return (
      <div
        style={{
          height,
          background: COLORS.bg,
          borderRadius: 8,
          border: `1px solid ${COLORS.bd}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ color: COLORS.t3, fontSize: 11 }}>Loading map...</span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${rendered.W} ${rendered.H}`}
        style={{
          width: '100%',
          height: 'auto',
          background: COLORS.bg,
          borderRadius: 8,
          border: `1px solid ${COLORS.bd}`,
          cursor: 'grab',
        }}
      >
        <defs>
          <radialGradient id="glow">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
        </defs>
        <g ref={gRef}>
          {rendered.countries.map(
            (c, i) => c.d && <path key={i} d={c.d} fill={COLORS.s1} stroke={COLORS.bd} strokeWidth={0.5} />,
          )}
          {pins.map((pin, i) => {
            const [x, y] = rendered.proj([pin.lng, pin.lat]);
            const r = pin.r || 5;
            return (
              <g key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} style={{ cursor: 'pointer' }}>
                <circle cx={x} cy={y} r={r + 6} fill={pin.color} opacity={0.1} />
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={pin.color}
                  opacity={hov === i ? 1 : 0.75}
                  stroke={hov === i ? COLORS.wh : pin.color}
                  strokeWidth={hov === i ? 2 : 1}
                />
                {pin.label && (r >= 3 || hov === i) && (
                  <text
                    x={x}
                    y={y - r - 4}
                    textAnchor="middle"
                    fill={COLORS.tx}
                    fontSize={hov === i ? 9 : 7.5}
                    fontFamily={FONT_SANS}
                    fontWeight={500}
                  >
                    {pin.label}
                  </text>
                )}
                {pin.count && pin.count > 1 && (
                  <text
                    x={x}
                    y={y + 3}
                    textAnchor="middle"
                    fill={COLORS.bg}
                    fontSize={7}
                    fontFamily={FONT_MONO}
                    fontWeight={700}
                  >
                    {pin.count}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button
          onClick={() => handleZoom('in')}
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            border: `1px solid ${COLORS.bd}`,
            background: COLORS.s2,
            color: COLORS.t2,
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
          }}
        >
          +
        </button>
        <button
          onClick={() => handleZoom('out')}
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            border: `1px solid ${COLORS.bd}`,
            background: COLORS.s2,
            color: COLORS.t2,
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
          }}
        >
          −
        </button>
      </div>
      {hov !== null && pins[hov]?.tooltip && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: COLORS.s2,
            border: `1px solid ${COLORS.bl}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 10,
            maxWidth: 200,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          {pins[hov].tooltip}
        </div>
      )}
      {legend && (
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8, fontSize: 9, color: COLORS.t3 }}
        >
          {legend.map((l, i) => (
            <span key={i}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: l.color,
                  opacity: 0.75,
                  marginRight: 4,
                  verticalAlign: 'middle',
                }}
              />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Pin builders: each tab projects its own lens onto the geography ──

export const buildPins = {
  market: (cas) => {
    const byC = {};
    cas.forEach((d) => {
      if (!d.country || !COUNTRY_COORDS[d.country]) return;
      if (!byC[d.country]) byC[d.country] = { co: d.country, v: 0, n: 0, cas: [] };
      byC[d.country].v += d.certs;
      byC[d.country].n++;
      byC[d.country].cas.push(d.caOwner);
    });
    const mx = Math.max(...Object.values(byC).map((c) => c.v), 0);
    return Object.values(byC).map((c) => ({
      lat: COUNTRY_COORDS[c.co].lat,
      lng: COUNTRY_COORDS[c.co].lng,
      label: c.co,
      color: COLORS.ac,
      r: Math.max(4, Math.min(14, 3 + Math.sqrt(c.v / mx) * 11)),
      count: c.n > 1 ? c.n : null,
      tooltip: (
        <div>
          <div style={{ fontWeight: 600, color: COLORS.tx }}>{c.co}</div>
          <div style={{ color: COLORS.t2 }}>
            {c.n} CA{c.n > 1 ? 's' : ''} · {f(c.v)} certs
          </div>
          <div style={{ color: COLORS.t3, fontSize: 9, marginTop: 2 }}>
            {c.cas.slice(0, 5).join(', ')}
            {c.cas.length > 5 ? ` +${c.cas.length - 5} more` : ''}
          </div>
        </div>
      ),
    }));
  },

  trust: (cas) => {
    const byC = {};
    cas.forEach((d) => {
      if (!d.country || !COUNTRY_COORDS[d.country]) return;
      if (!byC[d.country]) byC[d.country] = { co: d.country, maxTs: 0, roots: 0, n: 0, cas: [] };
      byC[d.country].maxTs = Math.max(byC[d.country].maxTs, d.storeCount);
      byC[d.country].roots += d.rootCount;
      byC[d.country].n++;
      byC[d.country].cas.push(d.caOwner);
    });
    const mx = Math.max(...Object.values(byC).map((c) => c.roots), 1);
    return Object.values(byC).map((c) => {
      const cl = c.maxTs >= 4 ? COLORS.gn : c.maxTs >= 3 ? COLORS.am : c.maxTs >= 2 ? COLORS.t2 : COLORS.rd;
      return {
        lat: COUNTRY_COORDS[c.co].lat,
        lng: COUNTRY_COORDS[c.co].lng,
        label: c.co,
        color: cl,
        r: Math.max(4, Math.min(12, 3 + Math.sqrt(c.roots / mx) * 9)),
        count: c.n > 1 ? c.n : null,
        tooltip: (
          <div>
            <div style={{ fontWeight: 600, color: COLORS.tx }}>{c.co}</div>
            <div style={{ color: COLORS.t2 }}>
              {c.n} CA{c.n > 1 ? 's' : ''} · {c.roots} roots
            </div>
            <div style={{ color: cl, fontSize: 9 }}>Max trust: {c.maxTs}/4 stores</div>
          </div>
        ),
      };
    });
  },

  tail: (cas, headSize) => {
    const tail = cas.slice(headSize);
    const byC = {};
    tail.forEach((d) => {
      if (!d.country || !COUNTRY_COORDS[d.country]) return;
      if (!byC[d.country]) byC[d.country] = { co: d.country, n: 0, cas: [] };
      byC[d.country].n++;
      byC[d.country].cas.push(d.caOwner);
    });
    const mx = Math.max(...Object.values(byC).map((c) => c.n), 1);
    return Object.values(byC).map((c) => ({
      lat: COUNTRY_COORDS[c.co].lat,
      lng: COUNTRY_COORDS[c.co].lng,
      label: c.co,
      color: COLORS.ac,
      r: Math.max(4, Math.min(12, 3 + Math.sqrt(c.n / mx) * 8)),
      count: c.n > 1 ? c.n : null,
      tooltip: (
        <div>
          <div style={{ fontWeight: 600, color: COLORS.tx }}>{c.co}</div>
          <div style={{ color: COLORS.t2 }}>
            {c.n} tail CA{c.n > 1 ? 's' : ''}
          </div>
          <div style={{ color: COLORS.t3, fontSize: 9, marginTop: 2 }}>{c.cas.join(', ')}</div>
        </div>
      ),
    }));
  },

  geo: (regions, regionColors) => {
    const pins = [];
    regions.forEach((r) => {
      const cl = regionColors[r.rg] || COLORS.t3;
      r.cs.forEach((c) => {
        const co = COUNTRY_COORDS[c.c];
        if (!co) return;
        const mx = Math.max(...regions.flatMap((g) => g.cs.map((x) => x.p), 0));
        pins.push({
          lat: co.lat,
          lng: co.lng,
          label: c.c,
          color: cl,
          r: Math.max(3, Math.min(14, 3 + Math.sqrt(c.p / mx) * 11)),
          count: c.n > 1 ? c.n : null,
          tooltip: (
            <div>
              <div style={{ fontWeight: 600, color: COLORS.tx }}>{c.c}</div>
              <div style={{ color: COLORS.t2 }}>
                {c.n} CA{c.n > 1 ? 's' : ''} · {c.p >= 0.01 ? c.p.toFixed(2) : c.p.toFixed(4)}% issuance
              </div>
              <div style={{ color: COLORS.t3, fontSize: 9 }}>{r.rg}</div>
            </div>
          ),
        });
      });
    });
    return pins;
  },
};

// ── Certificate Viewer ──
// Uses @peculiar/certificates-viewer-react, the official React wrapper.
// PEM headers are stripped since the component expects raw base64 DER.

import { PeculiarCertificateViewer } from '@peculiar/certificates-viewer-react';

const certViewerDarkTheme = {
  '--pv-color-white': '#0f1729',
  '--pv-color-black': COLORS.tx,
  '--pv-color-primary': '#60a5fa',
  '--pv-color-primary-contrast': '#0f1729',
  '--pv-color-primary-tint-1': COLORS.ac,
  '--pv-color-primary-tint-2': '#2563eb',
  '--pv-color-primary-tint-3': '#1d4ed8',
  '--pv-color-primary-tint-4': '#1e3a5f',
  '--pv-color-primary-tint-5': '#172554',
  '--pv-color-secondary': COLORS.cy,
  '--pv-color-secondary-tint-5': '#164e63',
  '--pv-color-gray-1': COLORS.tx,
  '--pv-color-gray-2': '#cbd5e1',
  '--pv-color-gray-3': '#1e293b',
  '--pv-color-gray-4': '#253349',
  '--pv-color-gray-5': '#334155',
  '--pv-color-gray-6': '#475569',
  '--pv-color-gray-7': '#64748b',
  '--pv-color-gray-8': COLORS.t2,
  '--pv-color-gray-9': '#cbd5e1',
  '--pv-color-gray-10': COLORS.tx,
  '--pv-color-wrong': COLORS.rd,
  '--pv-color-success': '#22c55e',
  '--pv-color-attention': COLORS.am,
  '--pv-font-family': "'IBM Plex Sans', sans-serif",
};

const certViewerLightTheme = {
  '--pv-color-white': '#ffffff',
  '--pv-color-black': '#0f172a',
  '--pv-color-primary': '#2563eb',
  '--pv-color-primary-contrast': '#ffffff',
  '--pv-color-primary-tint-1': '#3b82f6',
  '--pv-color-primary-tint-2': '#60a5fa',
  '--pv-color-primary-tint-3': '#93c5fd',
  '--pv-color-primary-tint-4': '#dbeafe',
  '--pv-color-primary-tint-5': '#eff6ff',
  '--pv-color-secondary': '#0891b2',
  '--pv-color-secondary-tint-5': '#e0f2fe',
  '--pv-color-gray-1': '#0f172a',
  '--pv-color-gray-2': '#334155',
  '--pv-color-gray-3': '#f1f5f9',
  '--pv-color-gray-4': '#e2e8f0',
  '--pv-color-gray-5': '#cbd5e1',
  '--pv-color-gray-6': '#94a3b8',
  '--pv-color-gray-7': '#64748b',
  '--pv-color-gray-8': '#475569',
  '--pv-color-gray-9': '#334155',
  '--pv-color-gray-10': '#0f172a',
  '--pv-color-wrong': '#dc2626',
  '--pv-color-success': '#059669',
  '--pv-color-attention': '#d97706',
  '--pv-font-family': "'IBM Plex Sans', sans-serif",
};

export const CertViewer = ({ sha256, pem: embeddedPem }) => {
  if (!embeddedPem) {
    return (
      <div style={{ padding: '12px 0', fontSize: 9, color: COLORS.t3 }}>
        Certificate PEM not yet available. Will be populated on next pipeline run.
      </div>
    );
  }

  const b64 = embeddedPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');

  const ctx = React.useContext(PipelineCtx);
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const certTheme = isDark ? certViewerDarkTheme : certViewerLightTheme;

  return (
    <div
      style={{
        marginTop: 8,
        borderRadius: 6,
        border: `1px solid ${COLORS.bd}`,
        ...certTheme,
      }}
    >
      <PeculiarCertificateViewer certificate={b64} download />
    </div>
  );
};

/** Methodology disclosure card — consistent pattern across all tabs */
export const MethodologyCard = ({ children }) => (
  <div style={{
    background: COLORS.bg, border: `1px solid ${COLORS.bd}`, borderRadius: 10,
    padding: '14px 16px', marginTop: 16,
  }}>
    <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.tx, marginBottom: 10 }}>Methodology</div>
    <div style={{ fontSize: 9, color: COLORS.t3, lineHeight: 1.7 }}>{children}</div>
  </div>
);

/** Individual methodology topic within a MethodologyCard */
export const MethodologyItem = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <span style={{ color: COLORS.t2, fontWeight: 600 }}>{label}.</span>{' '}{children}
  </div>
);
