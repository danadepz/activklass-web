/**
 * What the API client tells the user when a call does not come back.
 *
 * These exist because of a teacher walkthrough. Vite was running and Flask was
 * not, so every /api call was connection-refused -- and six unrelated features
 * were reported as broken, one of them as "no error shown". There *was* an
 * error: the browser's own "Failed to fetch", rendered straight into an error
 * banner beside a row of the user's spreadsheet. Technically a message, and
 * useless as one.
 *
 * The distinction these lock down is between "the server said no" and "the
 * server never answered". They are different problems with different fixes,
 * and only the second one is the user's environment rather than their data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// api.js pulls in Firebase for the ID token; the token is not what is under
// test, so the module is stubbed rather than initialised.
vi.mock('./firebase', () => ({
  auth: { currentUser: { getIdToken: async () => 'test-token' } },
}))

const { api, ApiError } = await import('./api')

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: 'Status ' + status,
  text: async () => JSON.stringify(payload),
})

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('when the server never answers', () => {
  it('reports an unreachable server, not "Failed to fetch"', async () => {
    // Exactly what the browser does on connection-refused.
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))

    const err = await api('/api/anything').catch((e) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('unreachable')
    expect(err.message).toMatch(/cannot reach the activklass server/i)
    // The phrase that sent testers chasing the wrong bug must not survive into
    // anything a user reads.
    expect(err.message).not.toMatch(/failed to fetch/i)
  })

  it('keeps the original error reachable for the console', async () => {
    const cause = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn(async () => { throw cause }))

    const err = await api('/api/anything').catch((e) => e)
    expect(err.cause).toBe(cause)
  })

  it('treats an HTML body as a missing server, not a missing record', async () => {
    // The dev server answering with its index page because the /api proxy had
    // nothing behind it. Reporting the raw status text ("Not Found") sends the
    // reader looking for a record that was never the problem.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '<!doctype html><html><body>vite</body></html>',
    })))

    const err = await api('/api/anything').catch((e) => e)
    expect(err.code).toBe('unreachable')
    expect(err.message).toMatch(/did not answer/i)
  })
})

describe('when the server answers', () => {
  it('passes a JSON error through untouched', async () => {
    // Callers branch on these. Bulk upload reads err.body for per-row detail,
    // and the roster form branches on err.code -- both must keep working.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, {
      error: 'validation',
      message: 'Request body must contain a non-empty students list',
      failed: [{ row: 0, reason: 'missing email' }],
    })))

    const err = await api('/api/x', { method: 'POST', body: {} }).catch((e) => e)

    expect(err.status).toBe(400)
    expect(err.code).toBe('validation')
    expect(err.message).toMatch(/non-empty students list/)
    expect(err.body.failed).toHaveLength(1)
  })

  it('falls back to the status text when there is no JSON message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 500, statusText: 'Internal Server Error', text: async () => '',
    })))

    const err = await api('/api/x').catch((e) => e)
    expect(err.code).toBe('unknown')
    expect(err.message).toBe('Internal Server Error')
  })

  it('returns the parsed body on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { summary: { created: 2 } })))
    await expect(api('/api/x')).resolves.toEqual({ summary: { created: 2 } })
  })
})

describe('before the request is made', () => {
  it('refuses without a signed-in user rather than sending an unauthenticated call', async () => {
    const { auth } = await import('./firebase')
    const original = auth.currentUser
    auth.currentUser = null
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const err = await api('/api/x').catch((e) => e)

    expect(err.status).toBe(401)
    expect(err.code).toBe('no_session')
    expect(fetchSpy).not.toHaveBeenCalled()
    auth.currentUser = original
  })
})
