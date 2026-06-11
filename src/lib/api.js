import { auth } from './firebase'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Authenticated fetch against the Flask API. Attaches the Firebase ID token. */
export async function api(path, { method = 'GET', body, requireAuth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (requireAuth) {
    const user = auth.currentUser
    if (!user) throw new ApiError(401, 'no_session', 'Not signed in')
    headers.Authorization = `Bearer ${await user.getIdToken()}`
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? 'unknown', data?.message ?? res.statusText)
  }
  return data
}
