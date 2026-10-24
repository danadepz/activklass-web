/**
 * T-189 (andecobs-297, maykel_64440-303), casing round six: the bell
 * notification a posted announcement sends read "New announcement" /
 * "Urgent announcement" in sentence case, the only piece of the student
 * portal casing rounds one through four never reached. docs/UI-COPY.md
 * calls this a label (category 7/8), so Title Case.
 */
import { describe, expect, it } from 'vitest'
import { announcementNotificationPrefix } from './announcements.jsx'

describe('announcementNotificationPrefix', () => {
  it('title-cases the general-post label', () => {
    expect(announcementNotificationPrefix('general')).toBe('New Announcement')
  })

  it('title-cases the urgent-post label', () => {
    expect(announcementNotificationPrefix('urgent')).toBe('Urgent Announcement')
  })

  it('falls back to the general label for an unrecognised category', () => {
    expect(announcementNotificationPrefix('reminder')).toBe('New Announcement')
  })
})
