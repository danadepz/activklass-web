import { auth } from './firebase'

// Empty by default so requests stay same-origin and go through the Vite proxy
// (see vite.config.js). Set VITE_API_URL only to point at a deployed API.
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(status, code, message, body = null, cause = undefined) {
    super(message)
    // Keeps the original TypeError reachable for the console without
    // putting "Failed to fetch" in front of a teacher.
    if (cause !== undefined) this.cause = cause
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
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (cause) {
    /* fetch rejects only when the request never got an answer at all: the API
       is not running, the machine is offline, DNS failed. The browser's own
       message for that is "Failed to fetch", and callers render err.message
       straight into their error banners -- so a teacher whose backend was
       simply not started read "Failed to fetch" beside a row of their
       spreadsheet and reported the feature as broken with no error.

       That is what actually happened during the teacher walkthrough: Vite was
       up, Flask was not, and six unrelated features were reported as failing.
       Naming the condition costs nothing and turns all of them into one
       recognisable message. */
    throw new ApiError(
      0,
      'unreachable',
      'Cannot reach the ActivKlass server. It may not be running — ask whoever ' +
        'set up your environment to start the API, then try again.',
      null,
      cause,
    )
  }

  /* Read as text first. A JSON parse failure and an empty body are different
     things, and HTML here means something other than the API answered -- the
     dev server returning its index page because the /api proxy had nothing to
     forward to. Reporting that as the raw status text ('Not Found') sends the
     reader looking for a missing record rather than a missing server. */
  const raw = await res.text()
  let data = null
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    if (data === null && raw.trimStart().startsWith('<')) {
      throw new ApiError(
        res.status,
        'unreachable',
        'The ActivKlass server did not answer this request. It may not be running — ' +
          'start the API and try again.',
        null,
      )
    }
    throw new ApiError(res.status, data?.error ?? 'unknown', data?.message ?? res.statusText, data)
  }
  return data
}
