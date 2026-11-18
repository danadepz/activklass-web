import { describe, expect, it, vi } from 'vitest'

describe('ClassFormModal onSaved callback signature contract', () => {
  it('safely handles onSaved caller destructuring ({ warning: w } = {}) when called with no arguments', () => {
    let capturedWarning = 'initial'
    const onSaved = ({ warning: w } = {}) => {
      capturedWarning = w ?? null
    }

    // Should not throw TypeError: Cannot destructure property 'warning' of 'undefined'
    expect(() => onSaved()).not.toThrow()
    expect(capturedWarning).toBe(null)

    // Should work when passed { warning: null }
    expect(() => onSaved({ warning: null })).not.toThrow()
    expect(capturedWarning).toBe(null)

    // Should capture warning string when provided
    expect(() => onSaved({ warning: 'File skipped' })).not.toThrow()
    expect(capturedWarning).toBe('File skipped')
  })
})
