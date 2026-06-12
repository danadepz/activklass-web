import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

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

// Local development against the Firebase emulator suite
// (firebase emulators:start). Toggle via VITE_FIREBASE_EMULATOR in .env.local.
export const usingEmulator =
  firebaseConfigured && import.meta.env.VITE_FIREBASE_EMULATOR === 'true'
if (usingEmulator) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, 'localhost', 8080)
}
