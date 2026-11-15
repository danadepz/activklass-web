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

/* T-256: both purge screens show success only on a server-confirmed completed
   purge, show an incomplete one as an error with a retry, and refresh every
   list a purge can touch. Source-read, like the rest of this file. */
describe('T-256 — purge feedback is never unconditional success', () => {
  for (const [name, source] of [['requests.jsx', requestsSource], ['index.jsx', indexSource]]) {
    it(`${name} decides success from the server result`, () => {
      expect(source).toMatch(/onSuccess: \(result\) => \{\s*(\/\/[^\n]*\n\s*)*const \{ ok, message \} = purgeResultMessage\(result,/)
      expect(source).toMatch(/if \(ok\) toast\.success\(message\)\s*else toast\.error\(message\)/)
      expect(source).not.toMatch(/toast\.success\('[^']*purged/)
    })

    it(`${name} reports an incomplete purge as an error and refreshes its list`, () => {
      expect(source).toMatch(/toast\.error\(purgeErrorMessage\(err,/)
      expect(source).toMatch(/if \(isIncompletePurge\(err\)\)/)
    })

    it(`${name} marks an incomplete purge and offers the retry`, () => {
      expect(source).toMatch(/purge_state === 'incomplete'/)
      expect(source).toMatch(/'Retry purge…' : 'Purge…'/)
    })
  }

  it('a request purge refreshes the subscriber list too, and a subscriber purge the request lists', () => {
    expect(requestsSource).toMatch(/invalidateQueries\(\{ queryKey: \['sa-subscribers'\] \}\)/)
    expect(indexSource).toMatch(/invalidateQueries\(\{ queryKey: PENDING_REQUESTS_KEY \}\)/)
    expect(indexSource).toMatch(/invalidateQueries\(\{ queryKey: \['sa-requests-approved'\] \}\)/)
  })

  it('the confirmation dialogs are still in front of both purges', () => {
    expect(requestsSource).toMatch(/onConfirm=\{\(\) => purge\.mutate\(purging\.id\)\}/)
    expect(indexSource).toMatch(/onConfirm=\{\(\) => purgeSub\.mutate\(purgingSubscriber\.id\)\}/)
  })
})
