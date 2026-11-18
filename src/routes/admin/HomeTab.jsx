import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/useAuth'
import { resetPassword, adminSchoolKey, fetchSchoolSettings } from '@/lib/admin'
import { navy, ink, faint, green, red, line, mono } from '@/theme'
import { User, Key } from '@/components/icons'
import ChangePassword from '@/components/ChangePassword'
import { confirmDialog, promptDialog } from '@/components/ui/dialogs'
import { card, btnGhost } from './ui'
import CardHead from './CardHead'
import Notice from './Notice'
import { initialsOf } from './AccountMenu'
import { resetPasswordPromptSpec, LoginPrefixCard, TermDatesCard } from './UsersTab'

/**
 * The admin's home: the school's own settings (login prefix and term dates),
 * who is signed in, and the password they sign in with.
 *
 * The signed-in admin used to be one row among thousands in the Users table.
 * They live here instead, view-only -- nothing about their own account is
 * edited from this card except the temporary-password reset the Users row
 * always offered.
 */
function Field({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: faint, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: ink, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  )
}

function Chip({ fg, bg, children }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: fg, background: bg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

export default function HomeTab() {
  const { profile, school } = useAuth()
  const qc = useQueryClient()
  const {
    data: settings, isPending: schoolPending, error: schoolError, refetch: refetchSchool,
  } = useQuery({ queryKey: adminSchoolKey, queryFn: fetchSchoolSettings })
  const refreshSchool = () => qc.invalidateQueries({ queryKey: adminSchoolKey })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const active = (profile.status ?? 'active') === 'active'
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Administrator'

  async function doReset() {
    setDone('')
    const pw = await promptDialog(resetPasswordPromptSpec(profile))
    if (pw == null) return
    // Same weight as the Users row's reset: this puts the account on a
    // temporary password and asks for a new one at the next sign-in.
    if (!(await confirmDialog({
      title: 'Reset your own password?',
      message: 'You will be asked to choose a new password the next time you sign in.',
      confirmLabel: 'Reset Password',
    }))) return
    setBusy(true); setError('')
    try {
      await resetPassword(profile.id, pw)
      setDone('Your password was reset. You will choose a new one the next time you sign in.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {/* The school's own settings first, side by side; they stack on a narrow
          screen. Moved here from the Users tab. */}
      <div style={{ display: 'grid', gap: 22, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))' }}>
        <LoginPrefixCard settings={settings} pending={schoolPending} error={schoolError}
                         onRetry={refetchSchool} onSaved={refreshSchool} />
        <TermDatesCard settings={settings} pending={schoolPending} error={schoolError}
                       onRetry={refetchSchool} onSaved={refreshSchool} />
      </div>

      <section style={{ ...card, padding: 22 }}>
        <CardHead
          icon={<User className="w-5 h-5" style={{ color: navy }} />}
          tint="rgba(14,42,92,0.07)"
          title="My Account"
          sub="The account you are signed in with. These details are view-only."
          style={{ marginBottom: 18 }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingBottom: 18, borderBottom: `1px solid ${line}` }}>
          <span
            aria-hidden="true"
            style={{ width: 56, height: 56, borderRadius: '50%', background: '#F5C518', color: navy, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20, flexShrink: 0 }}
          >
            {initialsOf(profile)}
          </span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: ink }}>{name}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Chip fg={navy} bg="rgba(14,42,92,0.08)">School Admin</Chip>
              <Chip fg={active ? green : red} bg={active ? 'rgba(31,138,91,0.10)' : 'rgba(192,57,43,0.08)'}>
                {active ? 'active' : 'inactive'}
              </Chip>
            </div>
          </div>
          <button type="button" style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  onClick={doReset} disabled={busy}>
            <Key className="h-4 w-4" />
            {busy ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', paddingTop: 18 }}>
          <Field label="Sign-in"><span style={{ ...mono, fontSize: 13 }}>{profile.login_id ?? profile.email}</span></Field>
          {profile.email && profile.login_id && <Field label="Email">{profile.email}</Field>}
          <Field label="School">{school?.name ?? '—'}</Field>
        </div>

        {(error || done) && (
          <div style={{ marginTop: 14 }}>
            <Notice>{error}</Notice>
            <Notice tone="ok">{done}</Notice>
          </div>
        )}
      </section>

      <ChangePassword />
    </div>
  )
}
