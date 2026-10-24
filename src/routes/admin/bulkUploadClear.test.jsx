/**
 * T-188 (andecobs-292, Derickk): after choosing a CSV on Admin -> Users ->
 * Bulk upload, there was no way to put the screen back. "Choose File…" only
 * reopens the OS picker, "Download Template" does something unrelated, and
 * the only other control, "Create N accounts", is the one action a
 * conflict warning is telling the admin to avoid -- his screenshot staged
 * ten rows that all collided with existing logins, and the only button that
 * did anything was the one the red banner warned against.
 *
 * The reset already existed twice, inline, unreachable from any control:
 * the parse-failure branch of `onFile` and the post-create branch of
 * `upload()` each repeated the same handful of `setState` calls. This pins
 * the new "Clear File" button: offered only while something is staged (a
 * parsed file or a parse error), and calling it puts every piece of staged
 * state back to empty -- the five calls `reset()` now makes.
 *
 * Static markup, the house pattern -- no DOM library in this project
 * (`quizzesGenerateContext.test.jsx` is the model: capture a handler prop as
 * React builds the tree, then call it directly, rather than driving a real
 * click). `BulkUpload`'s own `useState` calls are intercepted in the order
 * the component makes them -- rows, fileName, parseError, result, busy,
 * preparing, showAllRows -- so a staged file can be seeded without a real
 * file picker, and the button's own setters can be read back directly.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const captured = { onClick: null }
const textOf = (children) => (Array.isArray(children) ? children.join('') : children ?? '')
const grab = (type, props) => {
  if (type === 'button' && props?.onClick && textOf(props.children).includes('Clear File')) {
    captured.onClick = props.onClick
  }
}
vi.mock('react/jsx-runtime', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    jsx: (type, props, ...rest) => { grab(type, props); return real.jsx(type, props, ...rest) },
    jsxs: (type, props, ...rest) => { grab(type, props); return real.jsxs(type, props, ...rest) },
  }
})
vi.mock('react/jsx-dev-runtime', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    jsxDEV: (type, props, ...rest) => { grab(type, props); return real.jsxDEV(type, props, ...rest) },
  }
})

// BulkUpload's own useState calls, in the order it makes them: (1) rows
// (2) fileName (3) parseError (4) result (5) busy (6) preparing
// (7) showAllRows. Every setter is wrapped so a call on it is recorded,
// and the first three (plus result/showAllRows) can be seeded to stage a
// file without ever touching the real file input.
const seed = { rows: [], fileName: '', parseError: '' }
let order = 0
let setterCalls = []
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      order += 1
      const slot = order
      const initial = slot === 1 ? seed.rows : slot === 2 ? seed.fileName : slot === 3 ? seed.parseError : init
      const [value, setValue] = real.useState(initial)
      const wrapped = (...args) => {
        setterCalls.push([slot, args[0]])
        return setValue(...args)
      }
      return [value, wrapped]
    },
  }
})

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/lib/admin', () => ({ bulkCreateUsers: vi.fn() }))
vi.mock('@/lib/roster', () => ({ parseCsv: vi.fn() }))
vi.mock('@/lib/xlsx', () => ({ downloadXlsx: vi.fn(), readXlsxRows: vi.fn() }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))

import BulkUpload from './BulkUpload.jsx'

const SETTINGS = { school: { name: 'Tabor Hill College', login_prefix: 'thc' } }
const STAGED_ROW = {
  first_name: 'Juan', last_name: 'Dela Cruz', role: 'student',
  student_number: '2026-0001', lrn: '123456789012', birthdate: '2010-01-01',
}

function render({ rows = [], fileName = '', parseError = '' } = {}) {
  seed.rows = rows
  seed.fileName = fileName
  seed.parseError = parseError
  order = 0
  setterCalls = []
  captured.onClick = null
  return renderToStaticMarkup(
    <BulkUpload role="student" onDone={() => {}} settings={SETTINGS} users={[]} />,
  )
}

beforeEach(() => {
  seed.rows = []; seed.fileName = ''; seed.parseError = ''
  order = 0; setterCalls = []; captured.onClick = null
})

describe('T-188 — a staged bulk-upload file can be cleared without reloading', () => {
  it('offers no Clear File control when nothing is staged', () => {
    const html = render()
    expect(html).not.toContain('Clear File')
    expect(captured.onClick).toBeNull()
  })

  it('renders Clear File beside the file actions once a file is staged', () => {
    const html = render({ rows: [STAGED_ROW], fileName: 'roster.csv' })
    expect(html).toContain('Clear File')
    expect(captured.onClick).toBeTruthy()
  })

  it('still offers Clear File on a parse failure, even with no rows staged', () => {
    const html = render({ parseError: 'Missing column(s): student_number' })
    expect(html).toContain('Clear File')
    expect(captured.onClick).toBeTruthy()
  })

  it('clicking it clears every piece of staged state -- what the tester reported', () => {
    render({ rows: [STAGED_ROW], fileName: 'roster.csv' })
    expect(captured.onClick, 'the Clear File button\'s onClick was not captured').toBeTruthy()

    captured.onClick()

    // setRows([]), setFileName(''), setParseError(''), setResult(null),
    // setShowAllRows(false) -- the five calls reset() makes.
    expect(setterCalls).toEqual(expect.arrayContaining([
      [1, []], [2, ''], [3, ''], [4, null], [7, false],
    ]))
  })
})
