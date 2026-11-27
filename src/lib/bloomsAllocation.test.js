import { describe, expect, it } from 'vitest'
import {
  BALANCED_BLOOM_WEIGHTS, automaticBloomAllocation, BLOOMS_ORDER,
  questionTypeCompatibility, validateBloomAllocation,
} from './bloomsAllocation'

const six = [...BLOOMS_ORDER]
const total = (counts) => Object.values(counts).reduce((sum, value) => sum + Number(value), 0)

describe('Bloom allocation', () => {
  it('uses Balanced as the only automatic weight policy', () => {
    const expected = [2, 2, 2, 2, 1, 1]
    expect(BLOOMS_ORDER.map((level) => BALANCED_BLOOM_WEIGHTS[level])).toEqual(expected)
    expect(BLOOMS_ORDER.map((level) => automaticBloomAllocation(10, BLOOMS_ORDER)[level])).toEqual(expected)
  })

  it('distributes ten questions across all six levels using Balanced', () => {
    expect(automaticBloomAllocation(10, six)).toEqual({ remember: 2, understand: 2, apply: 2, analyze: 2, evaluate: 1, create: 1 })
  })

  it('reserves one per level for six levels and five questions validation rejects the impossible request', () => {
    expect(validateBloomAllocation({ count: 5, selectedLevels: six, allocation: {} })).toMatch(/at least 6 questions/)
  })

  it.each([5, 10, 15, 20])('allocates the supported UI count %i exactly', (count) => {
    const result = automaticBloomAllocation(count, ['remember', 'apply', 'analyze'])
    expect(total(result)).toBe(count)
    expect(validateBloomAllocation({ count, selectedLevels: ['remember', 'apply', 'analyze'], allocation: result })).toBeNull()
  })

  it('reserves one each, then applies Balanced weights and canonical-order largest-remainder ties', () => {
    expect(automaticBloomAllocation(5, ['remember', 'apply'])).toEqual({
      remember: 3, understand: 0, apply: 2, analyze: 0, evaluate: 0, create: 0,
    })
  })

  it('validates manual totals, selected minima and unselected zeros', () => {
    const allocation = { remember: 2, understand: 0, apply: 3, analyze: 0, evaluate: 0, create: 0 }
    expect(validateBloomAllocation({ count: 5, selectedLevels: ['remember', 'apply'], allocation })).toBeNull()
    expect(validateBloomAllocation({ count: 5, selectedLevels: ['remember', 'apply'], allocation: { ...allocation, apply: 2 } })).toMatch(/total 5/)
    expect(validateBloomAllocation({ count: 5, selectedLevels: ['remember', 'apply'], allocation: { ...allocation, apply: 0 } })).toMatch(/at least one/)
    expect(validateBloomAllocation({ count: 5, selectedLevels: ['remember'], allocation: { ...allocation, apply: 1 } })).toMatch(/Unselected level Applying/)
    expect(validateBloomAllocation({ count: 5, selectedLevels: [], allocation })).toMatch(/Select at least one/)
    expect(validateBloomAllocation({ count: 5, selectedLevels: ['remember'], allocation: { remember: 5 } })).toMatch(/all six Bloom levels/)
  })

  it('blocks incompatible combinations and warns on a less direct type', () => {
    expect(questionTypeCompatibility({ create: 2 }, ['mcq'])[0]).toMatchObject({ blocked: true })
    expect(questionTypeCompatibility({ create: 2 }, ['essay'])).toEqual([])
    expect(questionTypeCompatibility({ analyze: 1 }, ['mcq'])[0]).toMatchObject({ blocked: false })
    expect(questionTypeCompatibility({ analyze: 1 }, ['mcq'])[0].message).toMatch(/scenario or case/)
    expect(questionTypeCompatibility({ create: 1 }, ['essay'])).toEqual([])
    expect(questionTypeCompatibility({ create: 1 }, ['mcq', 'essay'])[0].message).toContain('multiple choice will be excluded')
  })
})
