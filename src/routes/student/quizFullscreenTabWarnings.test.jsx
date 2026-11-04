/**
 * T-236 (maykel_64440-310) — Fullscreen and tab-switch warnings for quiz taker.
 *
 * Requirements:
 * 1. Warning beforehand on StartCard: Fullscreen and tab-switch warning in rules list.
 * 2. Fullscreen request on Start button.
 * 3. In Runner:
 *    - Full screen / Exit full screen toggle button.
 *    - visibilitychange triggers tab switch warning.
 *    - Tab switch warning 1 informs student one warning used.
 *    - Tab switch warning 2 informs student two warnings used.
 *    - Tab switch warning 3 informs student of exceeding limit without unrecoverable lock.
 *    - Modal allows returning to quiz and re-entering fullscreen.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ profile: { id: 's1', role: 'student', first_name: 'Test', last_name: 'Student' } }),
}))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), query: vi.fn(), where: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import {
  StartCard,
  tabSwitchWarningTitle,
  tabSwitchWarningMessage,
} from './quiz-player.jsx'

const quizPlayerSrc = readFileSync(fileURLToPath(new URL('./quiz-player.jsx', import.meta.url)), 'utf8')

describe('T-236 — Fullscreen and tab-switch warnings', () => {
  const quiz = {
    id: 'q1',
    title: 'Midterm Assessment',
    status: 'published',
    questions: [
      { id: 'q1', qtype: 'mcq', text: 'Sample question?', options: [{ id: 'a', text: 'Option A' }] },
    ],
  }

  describe('Warning beforehand on StartCard', () => {
    it('displays the Fullscreen and tab-switch warning in the rules list', () => {
      expect(typeof StartCard).toBe('function')
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <StartCard quiz={quiz} attempts={[]} classId="c1" onStarted={() => {}} />
        </MemoryRouter>,
      )
      expect(html).toContain('Fullscreen and tab switches')
      expect(html).toContain('The quiz will open in fullscreen. Switching tabs or leaving the page triggers warnings and is recorded for your teacher.')
    })

    it('requests fullscreen on documentElement when Start is pressed', () => {
      expect(quizPlayerSrc).toMatch(/document\.documentElement\?\.requestFullscreen\(\)/)
    })
  })

  describe('Tab-switch warning titles and messages', () => {
    it('formats warning 1 as 1 of 3 and states one warning has been used', () => {
      expect(typeof tabSwitchWarningTitle).toBe('function')
      expect(typeof tabSwitchWarningMessage).toBe('function')
      expect(tabSwitchWarningTitle?.(1)).toBe('Tab switch warning (1 of 3)')
      expect(tabSwitchWarningMessage?.(1)).toContain('One warning has been used')
      expect(tabSwitchWarningMessage?.(1)).toContain('recorded and visible to your teacher')
    })

    it('formats warning 2 as 2 of 3 and states two warnings have been used', () => {
      expect(typeof tabSwitchWarningTitle).toBe('function')
      expect(typeof tabSwitchWarningMessage).toBe('function')
      expect(tabSwitchWarningTitle?.(2)).toBe('Tab switch warning (2 of 3)')
      expect(tabSwitchWarningMessage?.(2)).toContain('Two warnings have been used')
      expect(tabSwitchWarningMessage?.(2)).toContain('recorded and visible to your teacher')
    })

    it('formats warning 3 and informs student of the count without unrecoverable lock', () => {
      expect(typeof tabSwitchWarningTitle).toBe('function')
      expect(typeof tabSwitchWarningMessage).toBe('function')
      expect(tabSwitchWarningTitle?.(3)).toBe('Tab switch warning (3)')
      expect(tabSwitchWarningMessage?.(3)).toContain('left the quiz page 3 times')
      expect(tabSwitchWarningMessage?.(3)).toContain('sees every time you switch tabs')
    })
  })

  describe('Runner fullscreen and tab-switch handling', () => {
    it('provides a Full screen button in the quiz header', () => {
      expect(quizPlayerSrc).toContain('Full screen')
      expect(quizPlayerSrc).toContain('Exit full screen')
    })

    it('listens for visibilitychange and arms the tab switch warning', () => {
      expect(quizPlayerSrc).toContain("document.addEventListener('visibilitychange', onVisibility)")
      expect(quizPlayerSrc).toMatch(/setTabWarning\(count\)/)
    })

    it('renders the tab-switch warning modal with Return to quiz action', () => {
      expect(quizPlayerSrc).toContain('Tab switch warning modal')
      expect(quizPlayerSrc).toContain('Return to quiz')
      expect(quizPlayerSrc).toContain('tabSwitchWarningTitle(tabWarning)')
      expect(quizPlayerSrc).toContain('tabSwitchWarningMessage(tabWarning)')
    })
  })
})
