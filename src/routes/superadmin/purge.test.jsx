import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const requestsSource = readFileSync(fileURLToPath(new URL('./requests.jsx', import.meta.url)), 'utf8')
const verificationsSource = readFileSync(fileURLToPath(new URL('./verifications.jsx', import.meta.url)), 'utf8')
const indexSource = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')
const superadminLibSource = readFileSync(fileURLToPath(new URL('../../lib/superadmin.js', import.meta.url)), 'utf8')
const purgeDialogSource = readFileSync(fileURLToPath(new URL('./PurgeConfirmDialog.jsx', import.meta.url)), 'utf8')

describe('Guarded Purge Feature — API library', () => {
  it('exports purgeRequest, purgeTeacher, and purgeSubscriber calling their endpoints', () => {
    expect(superadminLibSource).toMatch(/export function purgeRequest\(requestId\)/)
    expect(superadminLibSource).toMatch(/\/api\/superadmin\/requests\/\$\{requestId\}\/purge/)
    expect(superadminLibSource).toMatch(/export function purgeTeacher\(uid\)/)
    expect(superadminLibSource).toMatch(/\/api\/superadmin\/teachers\/\$\{uid\}\/purge/)
    expect(superadminLibSource).toMatch(/export function purgeSubscriber\(ownerId\)/)
    expect(superadminLibSource).toMatch(/\/api\/superadmin\/subscribers\/\$\{ownerId\}\/purge/)
  })
})

describe('Guarded Purge Feature — PurgeConfirmDialog component', () => {
  it('renders a warning explaining irreversible Auth and database deletion', () => {
    expect(purgeDialogSource).toMatch(/Firebase Authentication/)
    expect(purgeDialogSource).toMatch(/Confirm Purge/)
    expect(purgeDialogSource).toMatch(/Guarded:/)
  })
})

describe('Guarded Purge Feature — requests.jsx (Schools queue)', () => {
  it('wires up purgeRequest and PurgeConfirmDialog', () => {
    expect(requestsSource).toMatch(/purgeRequest/)
    expect(requestsSource).toMatch(/<PurgeConfirmDialog/)
    expect(requestsSource).toMatch(/purge\.mutate\(purging\.id\)/)
  })
})

describe('Guarded Purge Feature — verifications.jsx (Solo teachers queue)', () => {
  it('wires up purgeTeacher and PurgeConfirmDialog', () => {
    expect(verificationsSource).toMatch(/purgeTeacher/)
    expect(verificationsSource).toMatch(/<PurgeConfirmDialog/)
    expect(verificationsSource).toMatch(/purge\.mutate\(purging\.uid\)/)
  })
})

describe('Guarded Purge Feature — index.jsx (Subscribers tab)', () => {
  it('wires up purgeSubscriber and PurgeConfirmDialog', () => {
    expect(indexSource).toMatch(/purgeSubscriber/)
    expect(indexSource).toMatch(/<PurgeConfirmDialog/)
    expect(indexSource).toMatch(/purgeSub\.mutate\(purgingSubscriber\.id\)/)
  })
})
