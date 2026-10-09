/**
 * T-149 (andecobs-214): "Remove the icons of the 'Quizzes' & 'Quiz Bank'".
 *
 * The two tab labels carried hardcoded emoji (📋, 📚) plus a plain-text 🔒
 * for the trial-locked state, while the rest of this screen already draws
 * icons from src/components/icons.jsx (Sparkles, Trash, Edit on these same
 * cards). A tab label needs no icon at all, so the two decorative emoji are
 * removed outright; the lock is real state (a trial account's Quiz Bank is
 * actually gated), so it is replaced with the shared Lock icon, never deleted.
 *
 * Source-text test, the pattern recordToolbarAndTitles.test.jsx uses: a full
 * render needs a heavy dependency mock for a claim that's really about what
 * the JSX contains.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./quizzes.jsx', import.meta.url)), 'utf8')

describe('T-149 — Quizzes / Quiz Bank tabs carry no emoji', () => {
  it('has no emoji left anywhere in the tab switcher', () => {
    expect(src).not.toMatch(/📋|📚|🔒/)
  })

  it('the Quizzes tab is plain text', () => {
    expect(src).toMatch(/>\s*Quizzes\s*<\/button>/)
  })

  it('the Quiz Bank tab still shows the trial lock, as a real icon, not deleted', () => {
    expect(src).toMatch(/Quiz Bank\{locks\.quizBank && <Lock\b/)
  })

  it('imports Lock and BookOpen from the shared icon set', () => {
    expect(src).toMatch(/from '@\/components\/icons'/)
    expect(src).toMatch(/\bLock\b/)
    expect(src).toMatch(/\bBookOpen\b/)
  })
})
