/**
 * Class Oversight's Export button says how many classes it will download
 * (andecobs-35 / T-20).
 *
 * The export always followed the search box and the Show archived toggle --
 * `exportCsv` maps the filtered `rows`, not the school -- but the only place
 * that said so was the button's hover title. Beside a header reading "All
 * classes 13" and an empty search box, a tester read Export CSV as an
 * all-classes action, got thirteen classes when he wanted one, and asked for
 * a class picker. The gap was not the behaviour; it was that nothing on
 * screen showed the export following the filter.
 *
 * So the lock is the label: it must carry the same count the header does,
 * pluralise correctly at one, and go disabled with the "nothing matches"
 * title at zero. Static markup, the house pattern -- no DOM library, so the
 * count is varied through the data hook rather than by typing in the box.
 * `rows.length` is the one value the label, the title and the header all
 * read, so a stub of N rows is exactly a filter that matched N.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const overview = vi.fn()
vi.mock('@/hooks/useAdminOverview', () => ({ useAdminOverview: (...a) => overview(...a) }))
vi.mock('@/lib/csv', () => ({ downloadCsv: vi.fn(), stampedName: (p) => `${p}.csv` }))

import ClassesTab from './ClassesTab.jsx'

function classRows(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`, section: `Section ${i}`, subject: `Subject ${i}`, teacherName: `Teacher ${i}`,
    studentCount: 30, quizCount: 2, attemptCount: 40, gradedCount: 38, averagePct: 80, archived: false,
  }))
}

function withRows(n) {
  overview.mockReturnValue({
    isLoading: false, isError: false, error: null,
    data: {
      rows: classRows(n), users: [],
      stats: { totalUsers: 0, activeUsers: 0, teachers: 0, students: 0, parents: 0,
               classes: n, activeClasses: n, quizzes: 0, attempts: 0, schoolAverage: null },
    },
  })
  return renderToStaticMarkup(<ClassesTab />)
}

/** The export button's outer tag, so the title and disabled state can be read beside the label. */
function exportButton(html) {
  const m = html.match(/<button[^>]*>Export [^<]*<\/button>/)
  expect(m, 'no Export button rendered').toBeTruthy()
  return m[0]
}

beforeEach(() => overview.mockReset())

describe('Class Oversight export button (T-20)', () => {
  it('names the number of classes the filter left, not the school', () => {
    // Thirteen was the tester's screen: the header said 13, so must the button.
    const btn = exportButton(withRows(13))
    expect(btn).toContain('>Export 13 classes<')
    expect(btn).toContain('title="Download these 13 classes as a CSV file"')
    expect(btn).not.toContain('disabled')
  })

  it('reads as one class when the filter matched one -- the case he wanted', () => {
    const btn = exportButton(withRows(1))
    expect(btn).toContain('>Export 1 class<')
    expect(btn).not.toContain('classes')
    expect(btn).toContain('title="Download this class as a CSV file"')
  })

  it('is disabled with the unchanged tooltip when nothing matches', () => {
    const btn = exportButton(withRows(0))
    expect(btn).toContain('>Export 0 classes<')
    expect(btn).toContain('disabled')
    expect(btn).toContain('title="Nothing to export — no classes match this filter"')
  })

  it('agrees with the header count, which is what the tester was reading', () => {
    // Both come from rows.length. If either ever reads a different list the
    // button would again promise something the header does not.
    const html = withRows(7)
    expect(exportButton(html)).toContain('Export 7 classes')
    expect(html).toMatch(/All classes[\s\S]{0,400}?>7</)
  })
})
