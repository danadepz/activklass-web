/**
 * T-149 (maykel_64440-230): "Removal of the symbols for consistency."
 *
 * announcements.jsx dropped four emoji into an otherwise icon-set screen:
 * a 48px 📢 hero in the empty state, a 📣 beside "All classes" in the list,
 * a 📣 inside a <select> option (which a browser would just render as
 * literal text — a <select> option can't host a React icon), and a 📢 on
 * the Post Announcement submit button. The first, second and fourth are
 * decorative and now use the shared Megaphone icon; the option is plain
 * text with the emoji stripped, and the control is otherwise untouched.
 *
 * Source-text test, the pattern recordToolbarAndTitles.test.jsx uses: a full
 * render needs a heavy dependency mock for a claim that's really about what
 * the JSX contains.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./announcements.jsx', import.meta.url)), 'utf8')

describe('T-149 — Announcements carries no emoji', () => {
  it('has no 📢 or 📣 left anywhere in the file', () => {
    expect(src).not.toMatch(/📢|📣/)
  })

  it('imports the shared Megaphone icon', () => {
    expect(src).toMatch(/import \{ Megaphone \} from '@\/components\/icons'/)
  })

  it('the empty-state hero and the Post Announcement button both use it', () => {
    expect(src.match(/<Megaphone\b/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('the <option> is plain text, not rewritten into a different control', () => {
    expect(src).toContain('<option value="">All My Classes (Global)</option>')
  })
})
