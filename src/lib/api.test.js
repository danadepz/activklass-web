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

const { api, ApiError, normalizeApiPath } = await import('./api')

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

describe('path normalization (normalizeApiPath)', () => {
  it('prepends /api to relative paths missing the prefix', () => {
    expect(normalizeApiPath('/quiz_attempts/123/submit')).toBe('/api/quiz_attempts/123/submit')
    expect(normalizeApiPath('quiz_attempts/123/submit')).toBe('/api/quiz_attempts/123/submit')
    expect(normalizeApiPath('api/quiz_attempts/123/submit')).toBe('/api/quiz_attempts/123/submit')
  })

  it('does not duplicate an existing /api prefix', () => {
    expect(normalizeApiPath('/api/quiz_attempts/123/submit')).toBe('/api/quiz_attempts/123/submit')
    expect(normalizeApiPath('/api')).toBe('/api')
    expect(normalizeApiPath('/api/')).toBe('/api/')
    expect(normalizeApiPath('/api?foo=bar')).toBe('/api?foo=bar')
    expect(normalizeApiPath('/api#hash')).toBe('/api#hash')
  })

  it('preserves query strings and URL-encoded identifiers', () => {
    const path = '/students/lookup?email=user%2B1%40test.com&name=A%26B'
    expect(normalizeApiPath(path)).toBe('/api/students/lookup?email=user%2B1%40test.com&name=A%26B')

    const unprefixed = 'students/lookup?student_number=ABC%20123'
    expect(normalizeApiPath(unprefixed)).toBe('/api/students/lookup?student_number=ABC%20123')
  })

  it('preserves trailing slashes consistently', () => {
    expect(normalizeApiPath('/quizzes/')).toBe('/api/quizzes/')
    expect(normalizeApiPath('/api/quizzes/')).toBe('/api/quizzes/')
  })

  it('preserves absolute external URLs and protocol-relative URLs without rewriting', () => {
    expect(normalizeApiPath('https://example.com/api/test')).toBe('https://example.com/api/test')
    expect(normalizeApiPath('http://localhost:5000/api/health')).toBe('http://localhost:5000/api/health')
    expect(normalizeApiPath('//cdn.example.com/lib.js')).toBe('//cdn.example.com/lib.js')
  })

  it('rejects invalid or empty path arguments with TypeError', () => {
    expect(() => normalizeApiPath('')).toThrow(TypeError)
    expect(() => normalizeApiPath('   ')).toThrow(TypeError)
    expect(() => normalizeApiPath(null)).toThrow(TypeError)
    expect(() => normalizeApiPath(undefined)).toThrow(TypeError)
    expect(() => normalizeApiPath(123)).toThrow(TypeError)
  })
})

describe('api client integration with normalized paths', () => {
  it('routes an unprefixed relative path through fetch with /api', async () => {
    let capturedUrl = null
    let capturedOptions = null
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      capturedUrl = url
      capturedOptions = opts
      return jsonResponse(200, { ok: true })
    }))

    const body = { answers: { q1: 'b' }, expired: false }
    const result = await api('/quiz_attempts/attempt-456/submit', {
      method: 'POST',
      body,
    })

    expect(capturedUrl).toBe('/api/quiz_attempts/attempt-456/submit')
    expect(capturedOptions.method).toBe('POST')
    expect(JSON.parse(capturedOptions.body)).toEqual(body)
    expect(capturedOptions.headers.Authorization).toBe('Bearer test-token')
    expect(capturedOptions.headers['Content-Type']).toBe('application/json')
    expect(result).toEqual({ ok: true })
  })

  it('does not double-prefix when path already has /api', async () => {
    let capturedUrl = null
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      capturedUrl = url
      return jsonResponse(200, { ok: true })
    }))

    await api('/api/quiz_attempts/attempt-789/submit')
    expect(capturedUrl).toBe('/api/quiz_attempts/attempt-789/submit')
  })

  it('fetches external URLs directly without prepending /api or base url', async () => {
    let capturedUrl = null
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      capturedUrl = url
      return jsonResponse(200, { external: true })
    }))

    await api('https://external-service.com/webhook')
    expect(capturedUrl).toBe('https://external-service.com/webhook')
  })
})
