import { ink, muted, inkMuted, line, serifAlt as serif } from '@/theme'

/* ------------------------------------------------------------------ *
 * Card primitives — the dashboard design language, shared.
 *
 * Extracted from routes/teacher/index.jsx when the same look was rolled
 * out across the rest of the app, so a tinted stat card or a white panel
 * is styled in exactly one place. Brand tints pair with an icon color:
 *
 *   navy tint  rgba(14,42,92,0.07)   + navy
 *   blue tint  rgba(63,169,245,0.13) + blueText
 *   gold tint  rgba(245,197,24,0.15) + goldDeep
 *   green tint rgba(31,138,91,0.1)   + green
 * ------------------------------------------------------------------ */

/** Tinted stat tile: icon chip + label row over a big serif number. */
export function MetricCard({ label, value, sub, Icon, tint, iconColor, valueColor, highlight, loading }) {
  return (
    <div
      className="transition-all duration-150 hover:shadow-md hover:-translate-y-0.5"
      style={{
        background: tint,
        borderRadius: 14,
        padding: '18px 20px',
        border: highlight ? '1px solid rgba(245,197,24,0.55)' : `1px solid ${line}`,
        boxShadow: highlight ? '0 0 0 3px rgba(245,197,24,0.08)' : 'none',
      }}
    >
      <div className="flex items-center gap-3" style={{ marginBottom: 14 }}>
        {Icon && (
          <span style={{ width: 44, height: 44, borderRadius: 12, background: '#FFFFFF', color: iconColor, display: 'grid', placeItems: 'center', flexShrink: 0, border: `1px solid ${line}` }}>
            <Icon className="h-[22px] w-[22px]" />
          </span>
        )}
        <span style={{ fontSize: 14, fontWeight: 600, color: inkMuted, lineHeight: 1.25 }}>{label}</span>
      </div>
      {loading ? (
        <div className="animate-pulse rounded-lg bg-white/70" style={{ height: 40, width: 60 }} />
      ) : (
        <div className="flex items-baseline gap-2">
          <span style={{ ...serif, fontSize: 42, lineHeight: 1, color: valueColor ?? ink }}>{value}</span>
          {sub && <span style={{ fontSize: 12.5, color: muted }}>{sub}</span>}
        </div>
      )}
    </div>
  )
}

/** White content panel with a serif heading and an optional action slot. */
export function Panel({ title, sub, action, children, style }) {
  return (
    <section style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20, ...style }}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 style={{ ...serif, fontSize: 21, margin: 0, color: ink }}>{title}</h2>
            {sub && <p style={{ fontSize: 13, color: muted, margin: '3px 0 0' }}>{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
