import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/useAuth'
import { schoolSuspended } from '@/lib/schoolStatus'
import AuthLayout, { AuthNotice } from '@/components/AuthLayout'
import SignOutButton from '@/components/SignOutButton'
import { ink, muted, line } from '@/theme'

/**
 * Where every member of a switched-off school lands.
 *
 * Says what happened and who to ask, and no more: the person reading this
 * is a teacher or a student who cannot fix it, so the message points at the
 * school office rather than at us. Nothing is deleted -- when the school is
 * reactivated the next sign-in goes straight through -- and it says so,
 * because "suspended" with no such line reads as "your records are gone".
 * Sign-out stays available so a shared computer can switch accounts.
 */
export default function Suspended() {
  const { profile, school, isSuperAdmin } = useAuth()

  // Nothing to wait for here: not in a school, or the school is back on.
  if (!schoolSuspended(school, isSuperAdmin)) return <Navigate to="/portal" replace />

  const cancelled = school.subscription_status === 'cancelled'
  const schoolName = school.name ?? 'your school'
  const isAdmin = profile?.role === 'admin'

  return (
    <AuthLayout
      title={cancelled ? 'This school is no longer on ActivKlass' : 'Your school’s subscription is suspended'}
      subtitle={`${schoolName} has been ${cancelled ? 'cancelled' : 'suspended'} on ActivKlass, so accounts under it cannot sign in for now.`}
    >
      <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
        <AuthNotice>
          {isAdmin ? (
            <>
              <strong>Your school’s access is on hold.</strong> Reply to your ActivKlass invoice email,
              or contact the ActivKlass team, to have it switched back on. Every class, record and
              account is kept as it was and returns the moment the school is reactivated.
            </>
          ) : (
            <>
              <strong>Nothing of yours is lost.</strong> Your classes, grades and records are kept as
              they were. Ask your school office — they can settle this with ActivKlass — and sign in
              again once they say it is back.
            </>
          )}
        </AuthNotice>
        <p style={{ fontSize: 14, color: muted, margin: '18px 0 0', lineHeight: 1.5 }}>
          Signed in as <strong style={{ color: ink }}>{profile?.login_id ?? profile?.email}</strong>.
        </p>
        <div style={{ marginTop: 14 }}>
          <SignOutButton />
        </div>
      </div>
    </AuthLayout>
  )
}
