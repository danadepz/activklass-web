/**
 * T-65 (maykel_64440-84): on Grade Config, changing one weight moved the
 * others with nothing on the card saying it would, and the rescaled halves
 * (67.5, 22.5) rendered clipped as "67.!" / "22." in a 76-px number box.
 *
 * Later reversed: the owner found the auto-rebalance itself the problem --
 * typing one weight kept knocking previously set weights into awkward
 * fractions (whack-a-mole). Weights are now manual: typing a number updates
 * only that row, the draggable range slider is gone, and a weight group
 * saves only once it totals exactly 100% (still `weightsValid`, covered in
 * lib/grading.test.js). `redistributeWeights` survives only behind the
 * explicit "Split evenly" button. What is pinned here now: both weight
 * cards say weights are manual, and the weight box is still wide enough for
 * a half-step like the tester's own 67.5.
 *
 * The box width is checked as the rendered inline style. 92 px leaves 52 px
 * of text room after the padding and the % suffix -- measured in headless
 * Chrome on 2026-09-17, "56.5" needs 28 px, plus ~15 px for the number
 * spinner Chrome draws on hover; at 76 px there were about 36 px, which is the clip.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// A saved setup already holding rescaled halves -- the tester's screenshot.
const preset = {
  grading_mode: 'deped_k12',
  periods: [
    { id: 'q1', name: 'Quarter 1', weight_percent: 49 },
    { id: 'q2', name: 'Quarter 2', weight_percent: 32 },
    { id: 'q3', name: 'Quarter 3', weight_percent: 9 },
    { id: 'q4', name: 'Quarter 4', weight_percent: 10 },
  ],
  components: [
    { id: 'ww', name: 'Written Works', weight_percent: 67.5 },
    { id: 'pt', name: 'Performance Tasks', weight_percent: 10 },
    { id: 'qa', name: 'Quarterly Assessment', weight_percent: 22.5 },
  ],
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: preset, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({ useParams: () => ({}) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
vi.mock('@/lib/gradebook', () => ({ syncEntries: vi.fn() }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [], isLoading: false }) }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import GlobalGradingSetupPage from './grading.jsx'

const HINT = 'Enter weights manually. Total must equal 100% to save.'

/* The weight boxes: number inputs stepping by halves (the Preview card's
   sample inputs are number inputs too, but not step 0.5). */
function weightBoxes(html) {
  return [...html.matchAll(/<input[^>]*type="number"[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /step="0\.5"/.test(tag))
}

describe('T-65 — Grade Config says the weights rebalance, and shows a half-step whole', () => {
  const html = renderToStaticMarkup(<GlobalGradingSetupPage />)

  it('renders both weight cards with the saved halves', () => {
    expect(html).toContain('Grading Periods')
    expect(html).toContain('Grade Components')
    const values = weightBoxes(html).map((tag) => tag.match(/value="([^"]*)"/)?.[1])
    expect(values).toEqual(['49', '32', '9', '10', '67.5', '10', '22.5'])
  })

  it('tells the teacher on BOTH cards that weights are typed manually', () => {
    expect(html.split(HINT).length - 1).toBe(2)
  })

  it('no longer renders a draggable range slider', () => {
    expect(html).not.toContain('type="range"')
  })

  it('makes every weight box wide enough for a half-step like 67.5 (not the 76 px that clipped it)', () => {
    const boxes = weightBoxes(html)
    expect(boxes.length).toBe(7)
    for (const tag of boxes) {
      const width = Number(tag.match(/width:\s*(\d+(?:\.\d+)?)px/)?.[1])
      const padRight = Number(tag.match(/padding-right:\s*(\d+(?:\.\d+)?)px/)?.[1] ?? 0)
      expect(width, tag).toBeGreaterThanOrEqual(92)
      // the % suffix sits in the right padding; the room left must stay >= the 52 px measured
      expect(width - padRight - 12 - 3, tag).toBeGreaterThanOrEqual(50)
    }
  })
})
