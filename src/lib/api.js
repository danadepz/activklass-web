import { auth } from './firebase'

// Empty by default so requests stay same-origin and go through the Vite proxy
// (see vite.config.js). Set VITE_API_URL only to point at a deployed API.
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(status, code, message, body = null) {
    super(message)
    this.status = status
    this.code = code
    // The full response body. Some endpoints return per-item detail alongside
    // a non-2xx status -- bulk user creation reports which rows failed and why
    // -- and a bare message would throw that away.
    this.body = body
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
    throw new ApiError(res.status, data?.error ?? 'unknown', data?.message ?? res.statusText, data)
  }
  return data
}
