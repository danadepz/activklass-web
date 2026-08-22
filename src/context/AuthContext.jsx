import { useEffect, useState, useCallback } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { AuthContext } from './auth-context'

/**
 * Auth state machine:
 *  loading        — waiting for Firebase / profile fetch
 *  signed_out     — no Firebase session
 *  not_registered — Firebase session exists but no users/{uid} doc (finish registration)
 *  signed_in      — Firebase session + Firestore profile loaded
 *
 * The profile (including role, which drives routing) lives in the Firestore
 * 'users' collection — see PREPARE.md §2 and docs/05-prepare-gap-analysis.md.
 */
export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [errorDetail, setErrorDetail] = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const loadProfile = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid
      if (!uid) throw new Error('Not signed in')

      /* Super admin is a Firebase custom claim, NOT users/{uid}.role.
         firestore.rules lets an admin write any profile including its role
         field, so a role string would be self-grantable by any school admin.
         The claim is only settable through the Admin SDK — see the backend's
         `flask grant-superadmin`. It rides in the ID token, so a freshly
         granted developer must re-login (or wait for a refresh) to see it. */
      const token = await auth.currentUser.getIdTokenResult()
      setIsSuperAdmin(token.claims.superadmin === true)

      const snap = await getDoc(doc(db, 'users', uid))
      if (!snap.exists()) {
        setProfile(null)
        setStatus('not_registered')
        return
      }
      setProfile({ id: uid, ...snap.data() })
      setStatus('signed_in')
      setErrorDetail(null)
    } catch (err) {
      setProfile(null)
      setIsSuperAdmin(false)
      setStatus('error')
      /* Two audiences, two messages. Whoever is signed in gets a sentence
         about their account; whoever is running the app gets the code and the
         fix in the console. Putting "deploy the security rules" in front of a
         teacher named a tool they do not have and a problem they cannot fix. */
      console.error('[AuthContext] profile load failed:', err.code ?? '', err)
      const hint =
        {
          'permission-denied':
            'Your account does not have access yet. Ask your school administrator to check it.',
          unavailable:
            'We could not reach the server. Check your connection — an ad-blocker or shield can also block it.',
          'failed-precondition':
            'This school is not set up yet. Ask your school administrator to finish setup.',
        }[err.code] ?? 'Check your connection and try again.'
      setErrorDetail(`Could not load your account. ${hint}`)
    }
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user)
      if (user) {
        setStatus('loading')
        loadProfile()
      } else {
        setProfile(null)
        setIsSuperAdmin(false)
        setStatus('signed_out')
      }
    })
  }, [loadProfile])

  const logout = useCallback(() => signOut(auth), [])

  return (
    <AuthContext.Provider
      value={{ firebaseUser, profile, status, errorDetail, isSuperAdmin, logout, refreshProfile: loadProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

