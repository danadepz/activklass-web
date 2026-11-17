import { describe, expect, it, vi } from 'vitest'

/* Enter in a class-record score box moves to the same column on the next
   student's row (Shift+Enter: the previous). It is only focus movement --
   nothing is saved -- so this checks which input receives focus, using small
   stand-ins for the DOM (the suite runs without a browser). */
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
const { moveFocusOnEnter } = await import('./record.jsx')

const input = (col, { disabled = false } = {}) => ({
  dataset: { gridCol: col },
  disabled,
  focus: vi.fn(),
  select: vi.fn(),
})

function press(target, all, opts = {}) {
  const e = {
    key: 'Enter',
    shiftKey: false,
    nativeEvent: {},
    target,
    currentTarget: { querySelectorAll: () => all },
    preventDefault: vi.fn(),
    ...opts,
  }
  moveFocusOnEnter(e)
  return e
}

describe('Enter moves down a column of the class record', () => {
  it('goes to the same assessment on the next student, skipping other columns', () => {
    const a1 = input('a'); const b1 = input('b'); const a2 = input('a'); const b2 = input('b')
    const e = press(a1, [a1, b1, a2, b2])
    expect(e.preventDefault).toHaveBeenCalled()
    expect(a2.focus).toHaveBeenCalled()
    expect(a2.select).toHaveBeenCalled()
    expect(b1.focus).not.toHaveBeenCalled()
    expect(b2.focus).not.toHaveBeenCalled()
  })

  it('Shift+Enter goes back up', () => {
    const a1 = input('a'); const a2 = input('a')
    press(a2, [a1, a2], { shiftKey: true })
    expect(a1.focus).toHaveBeenCalled()
  })

  it('stays put on the last student', () => {
    const a1 = input('a'); const a2 = input('a')
    press(a2, [a1, a2])
    expect(a1.focus).not.toHaveBeenCalled()
    expect(a2.focus).not.toHaveBeenCalled()
  })

  it('skips a locked (disabled) box', () => {
    const a1 = input('a'); const a2 = input('a', { disabled: true }); const a3 = input('a')
    press(a1, [a1, a2, a3])
    expect(a2.focus).not.toHaveBeenCalled()
    expect(a3.focus).toHaveBeenCalled()
  })

  it('ignores other keys and inputs that are not grid cells', () => {
    const a1 = input('a'); const a2 = input('a')
    const tab = press(a1, [a1, a2], { key: 'Tab' })
    expect(tab.preventDefault).not.toHaveBeenCalled()
    expect(a2.focus).not.toHaveBeenCalled()
    const stray = { dataset: {}, disabled: false, focus: vi.fn(), select: vi.fn() }
    const e = press(stray, [a1, a2])
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})
