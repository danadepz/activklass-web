import { useAuth } from '../context/useAuth'
import { navy, navyDeep, cream, gold, sansFamily } from '@/theme'
import AuthLayout from './AuthLayout'
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
 *
 * It renders in the same branded card shell as /login and /register, so a
 * guardian who lands here sees the product they signed up for, not an
 * unfinished page -- the words are the point, the shell just carries them.
 */
export default function ParentOnMobile() {
  const { profile } = useAuth()

  return (
    <AuthLayout
      variant="card"
      title="ActivKlass for guardians is the mobile app"
      subtitle={`Hi ${profile?.first_name ?? 'there'} — sign in there with this same email and password to see your child’s grades, attendance and quiz results.`}
    >
      <div className="flex justify-center">
        <SignOutButton
          className="ak-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3FA9F5] focus-visible:ring-offset-2"
          style={{
            padding: '14px 28px',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: sansFamily,
            color: cream,
            background: navy,
            border: 'none',
            borderRadius: 11,
            cursor: 'pointer',
            boxShadow: `0 3px 0 ${navyDeep}, 0 10px 24px -12px rgba(14,42,92,0.5)`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          Sign out
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: gold }} />
        </SignOutButton>
      </div>
    </AuthLayout>
  )
}
