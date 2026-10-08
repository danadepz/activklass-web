import { useEffect, useId, useRef, useState } from 'react'
import { navy, ink, muted, line, sansFamily as sans } from '@/theme'

/**
 * The one ⓘ control for this class's tabs (T-137, reused by T-140). Opens on
 * click, not hover -- a tablet has no hover -- and is a real <button>, so
 * keyboard focus plus Enter/Space already opens it with no extra wiring.
 * Dismisses on Escape, on an outside click, and on its own close button.
 */
export default function InfoTooltip({ label = 'How this is calculated', children }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, borderRadius: '50%', marginLeft: 6,
          border: `1px solid ${open ? navy : 'rgba(14,42,92,0.25)'}`,
          background: open ? 'rgba(14,42,92,0.08)' : 'transparent',
          color: navy, fontSize: 12.5, fontWeight: 700, fontFamily: sans,
          lineHeight: 1, cursor: 'pointer', padding: 0,
        }}
      >
        ⓘ
      </button>
      <span
        id={panelId}
        role="tooltip"
        hidden={!open}
        style={{
          position: 'absolute', top: '140%', left: 0, zIndex: 20,
          width: 'min(360px, 80vw)', background: '#FFFFFF', border: `1px solid ${line}`,
          borderRadius: 12, padding: '12px 14px', boxShadow: '0 8px 24px rgba(14,42,92,0.16)',
          fontSize: 12.5, fontWeight: 400, lineHeight: 1.55, color: ink, fontFamily: sans,
        }}
      >
        {children}
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          style={{
            display: 'block', marginTop: 10, padding: 0, border: 'none', background: 'none',
            color: muted, fontSize: 11.5, fontWeight: 700, fontFamily: sans, cursor: 'pointer',
          }}
        >
          Close
        </button>
      </span>
    </span>
  )
}
