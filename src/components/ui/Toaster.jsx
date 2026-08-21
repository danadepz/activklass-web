import { useSyncExternalStore } from 'react'
import { green, red, blueText, ink, muted, sansFamily, navy, cream } from '@/theme'
import { dismissToast, getToasts, subscribeToasts } from '@/components/ui/toast'

/* ------------------------------------------------------------------ *
 * Toaster — the live region the toasts render into. Mounted once, in
 * main.jsx. Owned by the UI/UX lane (see OWNERSHIP.md).
 *
 * aria-live="polite", so a screen reader announces the text without yanking
 * focus out of whatever the reader was doing — which is the whole point of a
 * toast over the alert() it replaced.
 * ------------------------------------------------------------------ */

const TONES = {
  success: { accent: green, ring: false, icon: 'M3 8.5 6.2 12 13 4.5' },
  error: { accent: red, ring: true, icon: 'M8 4v5.2M8 11.6v.6' },
  info: { accent: blueText, ring: true, icon: 'M8 7.2v4.6M8 4.4v.6' },
}

function Toast({ item }) {
  const tone = TONES[item.type] ?? TONES.info
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        width: '100%',
        maxWidth: 400,
        padding: '13px 14px',
        background: '#FFFFFF',
        border: '1px solid rgba(14,42,92,0.10)',
        borderLeft: `4px solid ${tone.accent}`,
        borderRadius: 12,
        boxShadow: '0 18px 40px -18px rgba(14,42,92,0.38)',
        fontFamily: sansFamily,
        animation: 'ak-toast-in 0.18s ease both',
        pointerEvents: 'auto',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }}>
        {tone.ring && <circle cx="8" cy="8" r="6.6" stroke={tone.accent} strokeWidth="1.6" />}
        <path d={tone.icon} stroke={tone.accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <p style={{ flex: 1, margin: 0, fontSize: 13.5, lineHeight: 1.5, color: ink }}>{item.message}</p>

      {item.action && (
        <button
          type="button"
          onClick={() => { item.action.onClick?.(); dismissToast(item.id) }}
          style={{
            flexShrink: 0,
            background: navy,
            color: cream,
            border: 'none',
            borderRadius: 8,
            padding: '6px 11px',
            fontSize: 12.5,
            fontWeight: 700,
            fontFamily: sansFamily,
            cursor: 'pointer',
          }}
        >
          {item.action.label}
        </button>
      )}

      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismissToast(item.id)}
        style={{
          flexShrink: 0,
          background: 'transparent',
          border: 'none',
          color: muted,
          cursor: 'pointer',
          padding: 2,
          lineHeight: 0,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <line x1="2.5" y1="2.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <line x1="10.5" y1="2.5" x2="2.5" y2="10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export default function Toaster() {
  const list = useSyncExternalStore(subscribeToasts, getToasts, getToasts)

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
        maxWidth: 'calc(100vw - 32px)',
        pointerEvents: 'none',
      }}
    >
      {list.map((item) => (
        <Toast key={item.id} item={item} />
      ))}
    </div>
  )
}
