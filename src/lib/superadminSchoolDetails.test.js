/**
 * updateSchoolDetails sends only the fields it was given, under the names the
 * backend reads (PATCH /api/superadmin/schools/{id}/details). An unchanged
 * field must not be sent: the server treats a present field as a request to
 * validate and write it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.fn()
vi.mock('@/lib/api', () => ({ api: (...args) => api(...args) }))

const { updateSchoolDetails } = await import('./superadmin')

describe('updateSchoolDetails', () => {
  beforeEach(() => api.mockReset())

  it('PATCHes the school details route', async () => {
    await updateSchoolDetails('school-a', { name: 'Alpha High' })
    expect(api).toHaveBeenCalledWith('/api/superadmin/schools/school-a/details', {
      method: 'PATCH',
      body: { name: 'Alpha High' },
    })
  })

  it('maps camelCase fields to the backend names and omits what is not given', async () => {
    await updateSchoolDetails('s1', { loginPrefix: 'alp', adminEmail: 'a@b.test' })
    expect(api.mock.calls[0][1].body).toEqual({ login_prefix: 'alp', admin_email: 'a@b.test' })
  })
})
