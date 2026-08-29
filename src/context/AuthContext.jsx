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
  /* The member's school document, when the profile carries a school_id.
     Loaded here rather than in a hook because ProtectedRoute gates on its
     subscription_status and runs before any page: a suspended school is
     suspended for everyone in it. Null for solo teachers and superadmins
     without a school, and null when the read fails -- a missing school must
     never lock anyone out, so the gate only acts on a status it has seen. */
  const [school, setSchool] = useState(null)

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
      const data = snap.data()
      let schoolDoc = null
      if (data.school_id) {
        try {
          const schoolSnap = await getDoc(doc(db, 'schools', data.school_id))
          if (schoolSnap.exists()) schoolDoc = { id: schoolSnap.id, ...schoolSnap.data() }
        } catch (err) {
          console.warn('[AuthContext] school load failed; treating as no school:', err.code ?? '', err)
        }
      }
      setSchool(schoolDoc)
      setProfile({ id: uid, ...data })
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
        setSchool(null)
        setIsSuperAdmin(false)
        setStatus('signed_out')
      }
    })
  }, [loadProfile])

  const logout = useCallback(() => signOut(auth), [])

  /* The forced change-password gate reads profile.is_temp_password, so the
     in-memory profile is corrected here rather than by re-reading Firestore.
     Firebase has already accepted the new password by the time this is called
     and the flag write is best effort (see components/ChangePassword) -- a
     write that failed must not bounce someone straight back to the gate they
     just satisfied. Worst case the stored flag is stale and they are asked once
     more at their next sign-in: a nuisance, not a lockout. */
  const markPasswordChanged = useCallback(() => {
    setProfile((p) => (p ? { ...p, is_temp_password: false } : p))
  }, [])

  return (
    <AuthContext.Provider
      value={{
        firebaseUser, profile, school, status, errorDetail, isSuperAdmin, logout,
        refreshProfile: loadProfile, markPasswordChanged,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

