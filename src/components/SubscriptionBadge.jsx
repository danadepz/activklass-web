/**
 * The subscription indicator a teacher sees beside their name and on the
 * dashboard. Two shapes of the same fact: a compact chip for the dark
 * sidebar profile card, and a small status box for the dashboard header.
 * The words come from describeSubscription(); this only colours them.
 */
import { Link } from 'react-router-dom'
import { gold, green, red, goldDeep, muted, line, mono } from '@/theme'
import { useMySubscription } from '@/hooks/useMySubscription'
import { useAuth } from '@/context/useAuth'

const TONE = {
  active:  { fg: green,     bg: 'rgba(31,138,91,0.12)',   border: 'rgba(31,138,91,0.3)' },
  school:  { fg: '#2A6DB5', bg: 'rgba(63,169,245,0.14)',  border: 'rgba(63,169,245,0.35)' },
  trial:   { fg: goldDeep,  bg: 'rgba(245,197,24,0.18)',  border: 'rgba(245,197,24,0.45)' },
  expired: { fg: red,       bg: 'rgba(192,57,43,0.10)',   border: 'rgba(192,57,43,0.3)' },
  lapsed:  { fg: red,       bg: 'rgba(192,57,43,0.10)',   border: 'rgba(192,57,43,0.3)' },
  none:    { fg: muted,     bg: 'rgba(14,42,92,0.06)',    border: line },
}

/** Sidebar chip, on the navy profile card. Renders nothing while loading. */
export function SubscriptionChip({ style }) {
  const view = useMySubscription()
  if (view.isLoading || view.kind === 'none') return null
  const onDark = { active: gold, school: '#9CD3FF', trial: gold, expired: '#FF9A8B', lapsed: '#FF9A8B' }[view.kind] ?? gold
  const text = view.kind === 'active' ? 'Subscribed' : view.kind === 'trial' ? `Trial · ${view.detail}` : view.label
  return (
    <span
      title={`${view.label} · ${view.detail}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4,
        padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
        letterSpacing: '0.02em', color: onDark, background: 'rgba(250,250,246,0.08)',
        border: `1px solid ${onDark}55`, whiteSpace: 'nowrap', maxWidth: '100%',
        overflow: 'hidden', textOverflow: 'ellipsis', ...style,
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: onDark, flexShrink: 0 }} />
      {text}
    </span>
  )
}

/**
 * Dashboard box: label, detail and -- for a teacher who owns their plan -- a
 * link to the Account page to manage it.
 *
 * A teacher issued by a school gets a different box, because they own
 * nothing here: their school pays and their admin administers. Sending them
 * to /teacher/account under the words "Manage your plan" offered a control
 * that is not theirs. Theirs states the school and, when the school document
 * carries one, the address to ask -- which is the question they actually
 * arrive with, since a school teacher cannot create a student account and
 * the class page now tells them to ask their admin for one.
 *
 * Branching on view.kind rather than accountKind(profile) is deliberate:
 * describeSubscription already reads profile.school_id first, so 'school' is
 * true with Flask stopped, and it additionally catches a teacher absorbed
 * into an institution subscription whose school_id has not moved yet.
 */
export function SubscriptionBox() {
  const view = useMySubscription()
  const { school } = useAuth()
  if (view.isLoading || view.kind === 'none') return null
  const tone = TONE[view.kind] ?? TONE.none

  if (view.kind === 'school') {
    const adminEmail = school?.contact_email
    return (
      <div
        style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, background: tone.bg, border: `1px solid ${tone.border}` }}
      >
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: tone.fg, flexShrink: 0 }} />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: tone.fg, letterSpacing: '0.01em' }}>{view.label}</span>
          <span style={{ ...mono, fontSize: 11, color: tone.fg, opacity: 0.85 }}>{school?.name || view.detail}</span>
          {adminEmail && (
            <a
              href={`mailto:${adminEmail}`}
              style={{ ...mono, fontSize: 10.5, color: tone.fg, opacity: 0.85, textDecoration: 'underline', marginTop: 2 }}
            >
              Ask your admin
            </a>
          )}
        </span>
      </div>
    )
  }

  return (
    <Link
      to="/teacher/account"
      title="Manage your plan on the Account page"
      className="inline-flex items-center gap-2.5 transition hover:brightness-[0.98]"
      style={{ padding: '8px 14px', borderRadius: 10, background: tone.bg, border: `1px solid ${tone.border}`, textDecoration: 'none' }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: tone.fg, flexShrink: 0 }} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: tone.fg, letterSpacing: '0.01em' }}>{view.label}</span>
        <span style={{ ...mono, fontSize: 11, color: tone.fg, opacity: 0.85 }}>{view.detail}</span>
        {/* A running trial took no card at registration and a tester asked why
            (T-54). Say so here too, and when one will be asked -- before it ends,
            no date, because the payment provider is still the owner's decision. */}
        {view.kind === 'trial' && (
          <span style={{ fontSize: 10.5, color: tone.fg, opacity: 0.85, marginTop: 2 }}>
            No card needed for the trial. We'll ask for payment details before it ends.
          </span>
        )}
      </span>
    </Link>
  )
}

/** Inline "Available on a paid plan" note beside a greyed-out feature. */
export function PaidPlanHint({ children = 'Available on a paid plan', style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: goldDeep, ...style }}>
      <span aria-hidden>🔒</span>
      {children}
      <Link to="/teacher/account" style={{ color: goldDeep, textDecoration: 'underline' }}>Upgrade</Link>
    </span>
  )
}
