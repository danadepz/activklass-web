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

  const loadProfile = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid
      if (!uid) throw new Error('Not signed in')
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
      setStatus('error')
      const hint =
        {
          'permission-denied':
            'Firestore denied the read — deploy the security rules: firebase deploy --only firestore:rules',
          unavailable:
            'Firestore is unreachable — check your connection, and disable Brave Shields / ad-blockers for localhost (they block firestore.googleapis.com).',
          'failed-precondition':
            'The Firestore database may not be initialized for this project — create it in the Firebase console.',
        }[err.code] ?? 'Check your connection and Firebase configuration.'
      setErrorDetail(`Could not load your profile from Firestore (${err.code ?? err.message}). ${hint}`)
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
        setStatus('signed_out')
      }
    })
  }, [loadProfile])

  const logout = useCallback(() => signOut(auth), [])

  return (
    <AuthContext.Provider
      value={{ firebaseUser, profile, status, errorDetail, logout, refreshProfile: loadProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

