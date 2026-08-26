import { ink, muted, faint, line, serif, mono } from '@/theme'

/**
 * Icon-chip heading for the admin console cards, mirroring the card language
 * used across the teacher and student panes (44px tinted chip + serif title).
 * `action` renders on the right — search fields, export buttons, status pills.
 */
export default function CardHead({ icon, tint = 'rgba(14,42,92,0.07)', title, sub, count, action, style }) {
  return (
    <div className="flex flex-wrap items-center gap-3" style={style}>
      <span
        aria-hidden="true"
        style={{ width: 44, height: 44, borderRadius: 12, background: tint, border: `1px solid ${line}`, display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 20 }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <h2 style={{ ...serif, fontSize: 20, color: ink, margin: 0 }}>
          {title}
          {count != null && <span style={{ ...mono, fontSize: 13, color: faint, marginLeft: 8, fontWeight: 400 }}>{count}</span>}
        </h2>
        {sub && <p style={{ fontSize: 13, color: muted, margin: '3px 0 0', lineHeight: 1.55, maxWidth: 640 }}>{sub}</p>}
      </div>
      {action}
    </div>
  )
}
