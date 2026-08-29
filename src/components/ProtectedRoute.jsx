import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { schoolSuspended } from '../lib/schoolStatus'

function FullScreenMessage({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-500">
      {children}
    </div>
  )
}

/**
 * Wrap routes that require a signed-in user; pass `roles` to restrict further,
 * or `superAdmin` for the developer console.
 *
 * `superAdmin` is checked against the Firebase custom claim rather than a role,
 * because an admin can write any users/{uid} document — a role string would be
 * self-grantable. This guard is convenience only: every /api/superadmin route
 * re-verifies the claim server-side, so hiding the UI is not the security
 * boundary.
 *
 * `allowTempPassword` opts a route out of the temporary-password gate below.
 * Only /change-password sets it — that is the screen the gate sends people to,
 * so gating it too would be a redirect loop.
 */
export default function ProtectedRoute({
  roles,
  superAdmin = false,
  allowTempPassword = false,
  allowUnverified = false,
  allowSuspended = false,
}) {
  const { status, profile, school, errorDetail, isSuperAdmin } = useAuth()

  if (status === 'loading') return <FullScreenMessage>Loading…</FullScreenMessage>
  if (status === 'signed_out') return <Navigate to="/login" replace />
  if (status === 'not_registered') return <Navigate to="/register" replace />
  if (status === 'error') {
    return (
      <FullScreenMessage>
        {errorDetail ?? 'Could not reach the ActivKlass server. Is the API running?'}
      </FullScreenMessage>
    )
  }
  /* An account an admin provisioned starts on a password an admin chose, and
     `is_temp_password` stays true until the holder replaces it themselves. Gate
     here rather than in the login redirect (which is where the mobile app does
     it) because a login redirect is only the first hop: a bookmark, a refresh
     or a pasted deep link all land straight on a screen without passing through
     it. Every protected route in App.jsx goes through this component, so this is
     the one place that covers all of them. It is a workflow gate, not a security
     boundary — firestore.rules is what actually decides what the account can
     read, and it does not care what password is on it. */
  if (!allowTempPassword && profile.is_temp_password) {
    return <Navigate to="/change-password" replace />
  }
  /* Same shape, second flag. A teacher who registered on their own carries
     `verification_status` from the moment the profile exists, and only a
     developer moves it to 'approved' (routes/superadmin/verifications). An
     admin-issued teacher never has the field, so the gate does not see them.
     Only /pending-verification opts out, for the same redirect-loop reason as
     above. Workflow gate, not security — see the note in that route. */
  if (!allowUnverified && awaitingVerification(profile)) {
    return <Navigate to="/pending-verification" replace />
  }
  /* Third gate, same shape: only /suspended opts out, for the same
     redirect-loop reason. Workflow gate, not security -- records stay
     readable under the rules; what stops is the app. */
  if (!allowSuspended && schoolSuspended(school, isSuperAdmin)) {
    return <Navigate to="/suspended" replace />
  }
  if (superAdmin && !isSuperAdmin) return <Navigate to="/portal" replace />
  if (roles && !roles.includes(profile.role)) return <Navigate to="/portal" replace />
  return <Outlet />
}

function awaitingVerification(profile) {
  const v = profile?.verification_status
  return profile?.role === 'teacher' && Boolean(v) && v !== 'approved'
}


/** Sends "/" to the right home page per role. */
export function RoleHomeRedirect() {
  const { status, profile, school, errorDetail, isSuperAdmin } = useAuth()
  if (status === 'loading') return <FullScreenMessage>Loading…</FullScreenMessage>
  if (status === 'signed_out') return <Navigate to="/login" replace />
  if (status === 'not_registered') return <Navigate to="/register" replace />
  if (status === 'error') {
    return (
      <FullScreenMessage>
        {errorDetail ?? 'Could not reach the ActivKlass server. Is the API running?'}
      </FullScreenMessage>
    )
  }
  // Still on the password staff issued: finish that before anything else.
  // Checked ahead of the super-admin branch so a developer account on a
  // temporary password is not waved past its own gate.
  if (profile.is_temp_password) return <Navigate to="/change-password" replace />
  if (awaitingVerification(profile)) return <Navigate to="/pending-verification" replace />
  if (schoolSuspended(school, isSuperAdmin)) return <Navigate to="/suspended" replace />
  // Developers land in the ops console. Checked before role, since we hold a
  // normal role too — the claim is what distinguishes us.
  if (isSuperAdmin) return <Navigate to="/superadmin" replace />
  const home = {
    teacher: '/teacher',
    admin: '/admin',
    student: '/student',
    parent: '/parent',
  }[profile.role]
  return <Navigate to={home ?? '/login'} replace />
}
