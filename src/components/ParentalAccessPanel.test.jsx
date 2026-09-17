/**
 * T-66 (triplecookiemonster-85): the student's guardian link code said who it
 * was for ("Give this to your parent or guardian") but not where it goes, so
 * the parent it was handed to went to the web sign-in page and found nothing.
 * The caption now names the ActivKlass mobile app, where a guardian creates
 * their account with the code.
 *
 * The code sits behind "Show my code" (the panel's own first `useState`,
 * `revealed`), which a static render cannot click; the test hands that one
 * call `true` and every other call the real hook, the way
 * `teacher/classes/$classId/rosterView.test.jsx` opens its modal. The first
 * assertion -- the code itself is on the page -- proves the seed landed.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const seed = vi.hoisted(() => ({ reveal: false, used: false }))

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      if (init === false && seed.reveal && !seed.used) {
        seed.used = true
        return real.useState(true)
      }
      return real.useState(init)
    },
  }
})

import ParentalAccessPanel from './ParentalAccessPanel.jsx'

function render({ reveal, ...props }) {
  seed.reveal = reveal
  seed.used = false
  return renderToStaticMarkup(<ParentalAccessPanel {...props} />)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
}

describe('T-66 — the guardian code says where it goes', () => {
  it('under a shown code, tells the student the parent enters it in the ActivKlass mobile app', () => {
    const page = render({ reveal: true, code: 'NZ9V2J' })
    expect(page).toContain('NZ9V2J')
    expect(page).toMatch(/Give this to your parent or guardian — they enter it in the ActivKlass mobile app to create their account\./)
    expect(page).toMatch(/You still approve or decline every request it produces\./)
  })

  it('shows no code, and no such caption, before the student asks for it', () => {
    const page = render({ reveal: false, code: 'NZ9V2J' })
    expect(page).not.toContain('NZ9V2J')
    expect(page).toContain('Show my code')
  })
})
