import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

function FullScreenMessage({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-500">
      {children}
    </div>
  )
}

/** Wrap routes that require a signed-in user; pass `roles` to restrict further. */
export default function ProtectedRoute({ roles }) {
  const { status, profile, errorDetail } = useAuth()

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
  if (roles && !roles.includes(profile.role)) return <Navigate to="/portal" replace />
  return <Outlet />
}

/** Sends "/" to the right home page per role. */
export function RoleHomeRedirect() {
  const { status, profile, errorDetail } = useAuth()
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
  const home = {
    teacher: '/teacher',
    admin: '/admin',
    student: '/student',
    parent: '/parent',
  }[profile.role]
  return <Navigate to={home ?? '/login'} replace />
}
