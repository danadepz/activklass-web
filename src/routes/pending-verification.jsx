import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { idNumberError, linkError } from '@/lib/validation'
import AuthLayout, { SubmitButton, AuthError, AuthNotice } from '@/components/AuthLayout'
import { authInputStyle, authLabelStyle } from '@/components/authStyles'
import SignOutButton from '@/components/SignOutButton'
import { ink, muted, navy, line } from '@/theme'

export const ID_TYPES = [
  { value: 'school_id', label: 'School / employee ID' },
  { value: 'prc', label: 'PRC license' },
]

/**
 * The screen behind the identity-verification gate in components/ProtectedRoute.
 *
 * A teacher who registered on their own (the "Individual" path) is unknown to
 * us until a developer has looked at the ID they linked: nobody at a school
 * vouched for them the way an admin-issued account is vouched for. Until that
 * review lands, this is the one screen the account can reach. Like the
 * temporary-password gate it is a workflow gate, not security — the rules
 * decide what the account can read, and a pending teacher can read the same
 * things an approved one can. It keeps an unreviewed stranger from building
 * a gradebook of real students' names before we have checked who they are.
 *
 * Sign out stays reachable, as everywhere a screen has one exit.
 */
export default function PendingVerification() {
  const { profile, refreshProfile } = useAuth()
  const status = profile?.verification_status
  const [idType, setIdType] = useState(profile?.verification_id_type ?? ID_TYPES[0].value)
  const [idNumber, setIdNumber] = useState(profile?.verification_id_number ?? '')
  const [idLink, setIdLink] = useState(profile?.verification_id_link ?? '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Nothing to wait for: an approved account, or one that never went through
  // self-registration, has no business here.
  if (!status || status === 'approved') return <Navigate to="/portal" replace />

  const rejected = status === 'rejected'

  async function resubmit(e) {
    e.preventDefault()
    setError(null)
    const problem = idNumberError(idNumber) || linkError(idLink)
    if (problem) { setError(problem); return }
    setBusy(true)
    try {
      // A person may move their own status back to pending, and only to
      // pending (firestore.rules) — the review itself is the developers'.
      await updateDoc(doc(db, 'users', profile.id ?? profile.uid), {
        verification_status: 'pending',
        verification_id_type: idType,
        verification_id_number: idNumber.trim(),
        verification_id_link: idLink.trim(),
        verification_submitted_at: serverTimestamp(),
      })
      await refreshProfile()
    } catch {
      setError('Could not send that. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={rejected ? 'We could not verify that ID' : 'Verifying your account'}
      subtitle={
        rejected
          ? 'Have another look at what you sent, fix it, and send it again.'
          : 'A member of the ActivKlass team checks every self-registered teacher before their account opens.'
      }
    >
      <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
        {rejected ? (
          <form onSubmit={resubmit} className="flex flex-col gap-4">
            {profile.verification_note && (
              <AuthNotice>
                <strong>From the reviewer:</strong> {profile.verification_note}
              </AuthNotice>
            )}
            {error && <AuthError>{error}</AuthError>}
            <div>
              <label htmlFor="pv-type" style={authLabelStyle}>ID type</label>
              <select id="pv-type" className="ak-input" value={idType} onChange={(e) => setIdType(e.target.value)} style={{ ...authInputStyle, cursor: 'pointer' }}>
                {ID_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pv-number" style={authLabelStyle}>ID number</label>
              <input id="pv-number" className="ak-input" required value={idNumber} onChange={(e) => setIdNumber(e.target.value)} style={authInputStyle} />
            </div>
            <div>
              <label htmlFor="pv-link" style={authLabelStyle}>Link to a photo of the ID</label>
              <input id="pv-link" className="ak-input" type="url" required placeholder="https://drive.google.com/…" value={idLink} onChange={(e) => setIdLink(e.target.value)} style={authInputStyle} />
              <p style={{ fontSize: 12, color: '#9AA6BD', margin: '8px 0 0', lineHeight: 1.5 }}>
                Share the photo from Google Drive or OneDrive with “anyone with the link”.
              </p>
            </div>
            <SubmitButton type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Sending…' : 'Send again'}
            </SubmitButton>
          </form>
        ) : (
          <>
            <p style={{ fontSize: 14, color: ink, margin: '0 0 6px', fontWeight: 600 }}>
              Your ID is with the team.
            </p>
            <p style={{ fontSize: 13, color: muted, margin: '0 0 14px', lineHeight: 1.55 }}>
              We are checking the {ID_TYPES.find((t) => t.value === profile.verification_id_type)?.label.toLowerCase() ?? 'ID'} you
              linked. This usually takes a working day. Sign in again after that — if it is
              approved you go straight to your classes and your free month starts then, not
              now; if we need something else you will see it here.
            </p>
            <p style={{ fontSize: 12.5, color: muted, margin: 0 }}>
              Signed in as <strong style={{ color: navy }}>{profile.email}</strong>
            </p>
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <SignOutButton className="transition hover:opacity-70" style={{ fontSize: 14, fontWeight: 700, color: navy, background: 'none', border: 'none', cursor: 'pointer' }} />
      </div>
    </AuthLayout>
  )
}
