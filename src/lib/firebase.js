import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** Env vars still missing from web/.env.local — empty when fully configured. */
export const missingFirebaseKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => `VITE_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`)

export const firebaseConfigured = missingFirebaseKeys.length === 0

// Initializing with missing keys throws at module load (white screen) —
// guard so the app can render setup instructions instead.
export const firebaseApp = firebaseConfigured ? initializeApp(firebaseConfig) : null
export const auth = firebaseConfigured ? getAuth(firebaseApp) : null
// Firestore is the primary database (see docs/05-prepare-gap-analysis.md).
export const db = firebaseConfigured ? getFirestore(firebaseApp) : null
// Cloud Storage holds optional file attachments (e.g. class syllabus uploads).
export const storage = firebaseConfigured ? getStorage(firebaseApp) : null
