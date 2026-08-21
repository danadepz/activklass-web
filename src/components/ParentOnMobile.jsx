import { useAuth } from '../context/useAuth'
import SignOutButton from './SignOutButton'

/**
 * What a guardian sees if they sign in on the web.
 *
 * The guardian experience is the mobile app BY DESIGN, not by backlog: code
 * redemption, child switching and the scoped grade/attendance views are all
 * built there (see backend docs/07-parent-mobile-outline.md), and guardians on
 * phones is the realistic deployment.
 *
 * This replaced a generic RolePlaceholder that told them the portal was
 * "coming soon" and that "the teacher side is being built first". Both had
 * stopped being true -- student, admin and superadmin portals all ship now --
 * and the first was actively misleading: it asked a parent to wait for
 * something that is not being built, instead of pointing at the app where
 * their child's records already are.
 */
export default function ParentOnMobile() {
  const { profile } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center max-w-md">
        <h1 className="text-2xl font-bold text-indigo-700">ActivKlass</h1>
        <p className="text-slate-700 mt-4">
          Hi {profile.first_name} — ActivKlass for guardians is a{' '}
          <span className="font-semibold">mobile app</span>.
        </p>
        <p className="text-slate-700 mt-3">
          Sign in there with this same email and password to see your child&rsquo;s grades,
          attendance and quiz results.
        </p>
        <SignOutButton className="mt-6 rounded-lg bg-indigo-600 text-white px-5 py-2 font-medium hover:bg-indigo-700" />
      </div>
    </div>
  )
}
