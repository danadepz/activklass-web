/**
 * T-154 (andecobs-220): the announcement textarea had no limit at all --
 * `routes/teacher/announcements.jsx:392-399` was a `<textarea>` with a fixed
 * `height: 110`, so it *looked* bounded while accepting anything pasted into
 * it. Pinned here: the textarea carries `maxLength={ANNOUNCEMENT_MAX}` and a
 * visible counter, and the submit handler refuses a paste over the limit
 * through `announcementError` (the maxLength attribute alone does not stop
 * every browser's paste, and some silently truncate with no message).
 *
 * Static markup -- this page has no existing test file, so the mocking here
 * follows `gradingTargetClasses.test.jsx`'s pattern for a page built on
 * `useQuery`/`useMutation`/`useTeacherClasses`.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), getDocs: vi.fn(), query: vi.fn(), serverTimestamp: vi.fn(), where: vi.fn(), writeBatch: vi.fn(),
}))
vi.mock('@/lib/notifications', () => ({ notifyStudents: vi.fn() }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/Skeleton', () => ({ SkeletonList: () => null }))

import AnnouncementsPage from './announcements.jsx'
import { ANNOUNCEMENT_MAX, announcementError } from '@/lib/validation'

describe('Announcement message carries a maxLength and a counter (T-154)', () => {
  const html = renderToStaticMarkup(<AnnouncementsPage />)

  it('caps the textarea at ANNOUNCEMENT_MAX', () => {
    expect(html).toMatch(new RegExp(`id="ann-content"[^>]*maxLength="${ANNOUNCEMENT_MAX}"`))
  })

  it('shows a 0-count counter on first render', () => {
    expect(html).toContain(`0/${ANNOUNCEMENT_MAX}`)
  })
})

describe('announcementError refuses a paste over the limit (T-154)', () => {
  it('accepts exactly the limit and refuses one character over', () => {
    expect(announcementError('x'.repeat(ANNOUNCEMENT_MAX))).toBe('')
    expect(announcementError('x'.repeat(ANNOUNCEMENT_MAX + 1))).toMatch(/too long/)
  })
})
