import { ink, muted, faint, line, mono } from '@/theme'

/**
 * Dev-only quick-login row for the sign-in page. TEMPORARY — delete this file,
 * its import in routes/login.jsx, and the VITE_DEV_LOGINS_B64 line in
 * .env.development.local when the test accounts are no longer needed.
 *
 * The credentials deliberately do NOT live in this file. They sit in
 * .env.development.local, which Vite loads *only* in development mode — so a
 * production build never sees the value and cannot inline it. That matters
 * because this repo has a GitHub remote: a password committed to source is in
 * the history for good, even after the line is deleted.
 *
 * Belt and braces, the whole component also no-ops unless import.meta.env.DEV.
 */
export default function DevQuickLogin({ onPick, disabled = false }) {
  if (!import.meta.env.DEV) return null

  const raw = import.meta.env.VITE_DEV_LOGINS_B64
  if (!raw) return null

  let accounts
  try {
    accounts = JSON.parse(atob(raw))
  } catch {
    return null // a malformed value should never break the real login form
  }
  if (!Array.isArray(accounts) || accounts.length === 0) return null

  return (
    <div style={{ border: `1px dashed ${line}`, borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 9 }}>
        <span style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: faint, textTransform: 'uppercase' }}>
          Dev only
        </span>
        <span style={{ fontSize: 12, color: muted }}>fills the form below</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {accounts.map((a) => (
          <button
            key={a.email}
            type="button" // never submits the form it sits inside
            onClick={() => onPick?.(a)}
            disabled={disabled}
            title={a.email}
            className="text-left transition hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              padding: '7px 12px',
              borderRadius: 9,
              border: `1px solid ${line}`,
              background: '#FFFFFF',
              cursor: 'pointer',
              lineHeight: 1.2,
            }}
          >
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: ink }}>{a.label}</span>
            {a.sub && <span style={{ display: 'block', fontSize: 10.5, color: faint, marginTop: 1 }}>{a.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
