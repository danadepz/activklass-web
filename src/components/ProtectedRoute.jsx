import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

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
 */
export default function ProtectedRoute({ roles, superAdmin = false }) {
  const { status, profile, errorDetail, isSuperAdmin } = useAuth()

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
  if (superAdmin && !isSuperAdmin) return <Navigate to="/portal" replace />
  if (roles && !roles.includes(profile.role)) return <Navigate to="/portal" replace />
  return <Outlet />
}

/** Sends "/" to the right home page per role. */
export function RoleHomeRedirect() {
  const { status, profile, errorDetail, isSuperAdmin } = useAuth()
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
