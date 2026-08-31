import { green, red, goldDeep } from '@/theme'

/* Three tones, not two. `warn` was added for the things that are worth seeing
   and are not wrong -- two accounts sharing a name, say. Before it, anything
   that was not an error rendered green, so a caution read as a success. */
const TONES = {
  error: { fg: red, bg: 'rgba(192,57,43,0.07)', border: 'rgba(192,57,43,0.3)' },
  warn: { fg: goldDeep, bg: 'rgba(245,197,24,0.13)', border: 'rgba(245,197,24,0.45)' },
  ok: { fg: green, bg: 'rgba(31,138,91,0.08)', border: 'rgba(31,138,91,0.3)' },
}

export default function Notice({ tone = 'error', children }) {
  if (!children) return null
  const t = TONES[tone] ?? TONES.ok
  return (
    <div role="alert" style={{
      fontSize: 13, borderRadius: 10, padding: '10px 12px',
      color: t.fg, background: t.bg, border: `1px solid ${t.border}`,
    }}>
      {children}
    </div>
  )
}
