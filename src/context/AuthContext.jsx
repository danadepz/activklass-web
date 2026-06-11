import { useEffect, useState, useCallback } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { api } from '../lib/api'
import { AuthContext } from './auth-context'

/**
 * Auth state machine:
 *  loading        — waiting for Firebase / profile fetch
 *  signed_out     — no Firebase session
 *  not_registered — Firebase session exists but no Activklass user row (finish registration)
 *  signed_in      — Firebase session + Activklass profile loaded
 */
export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [errorDetail, setErrorDetail] = useState(null)

  const loadProfile = useCallback(async () => {
    try {
      const { user } = await api('/api/auth/me')
      setProfile(user)
      setStatus('signed_in')
      setErrorDetail(null)
    } catch (err) {
      setProfile(null)
      if (err.code === 'not_registered') {
        setStatus('not_registered')
      } else {
        setStatus('error')
        setErrorDetail(
          err.status
            ? `The API rejected the request: ${err.message} (HTTP ${err.status}). ` +
              'If you just changed backend/.env, fully restart "npm run dev".'
            : 'Could not reach the Activklass server. Is the API running on port 5000?',
        )
      }
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

