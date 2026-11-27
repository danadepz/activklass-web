export const BLOOMS_ORDER = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
export const BLOOMS_LABELS = {
  remember: 'Remembering', understand: 'Understanding', apply: 'Applying',
  analyze: 'Analyzing', evaluate: 'Evaluating', create: 'Creating',
}
export const BALANCED_BLOOM_WEIGHTS = {
  remember: 2, understand: 2, apply: 2, analyze: 2, evaluate: 1, create: 1,
}

// Original constructed response is required for Creating. Other levels accept
// every existing type, with a warning where selected types are less suitable.
export const BLOOM_TYPE_GUIDANCE = {
  remember: { compatible: ['mcq', 'true_false', 'matching', 'short_answer', 'essay'], warning: ['essay'] },
  understand: { compatible: ['mcq', 'true_false', 'matching', 'short_answer', 'essay'], warning: [] },
  apply: { compatible: ['mcq', 'true_false', 'matching', 'short_answer', 'essay'], warning: [] },
  analyze: { compatible: ['mcq', 'short_answer', 'essay'], warning: ['mcq'] },
  evaluate: { compatible: ['short_answer', 'essay'], warning: [] },
  create: { compatible: ['essay'], warning: [] },
}
const QUESTION_TYPE_NAMES = {
  mcq: 'multiple choice', true_false: 'true/false', short_answer: 'short answer',
  matching: 'matching', essay: 'essay',
}

export function validateBloomAllocation({ count, selectedLevels, allocation }) {
  if (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 30) return 'Question count must be a whole number from 1 to 30.'
  const levels = Array.isArray(selectedLevels) ? selectedLevels : []
  if (!levels.length) return 'Select at least one Bloom level.'
  if (new Set(levels).size !== levels.length) return 'Each Bloom level can be selected only once.'
  if (levels.some((level) => !BLOOMS_ORDER.includes(level))) return 'Choose valid Bloom levels.'
  if (count < levels.length) return `Choose at least ${levels.length} questions for the selected levels.`
  if (!allocation || typeof allocation !== 'object') return 'Set a question allocation for each selected level.'
  if (Object.keys(allocation).length !== BLOOMS_ORDER.length || BLOOMS_ORDER.some((level) => !(level in allocation))) return 'Provide an allocation value for all six Bloom levels.'
  for (const level of BLOOMS_ORDER) {
    const value = Number(allocation[level] ?? 0)
    if (!Number.isInteger(value) || value < 0) return 'Question allocations must be whole numbers of zero or more.'
    if (levels.includes(level) && value < 1) return `Allocate at least one question to ${BLOOMS_LABELS[level]}.`
    if (!levels.includes(level) && value !== 0) return `Unselected level ${BLOOMS_LABELS[level]} must have zero questions.`
  }
  const total = BLOOMS_ORDER.reduce((sum, level) => sum + Number(allocation[level] ?? 0), 0)
  return total === Number(count) ? null : `Allocations must total ${count} questions.`
}

export function automaticBloomAllocation(count, selectedLevels) {
  const levels = BLOOMS_ORDER.filter((level) => selectedLevels.includes(level))
  if (!levels.length || count < levels.length) throw new Error(validateBloomAllocation({ count, selectedLevels, allocation: {} }))
  const allocation = Object.fromEntries(BLOOMS_ORDER.map((level) => [level, 0]))
  levels.forEach((level) => { allocation[level] = 1 })
  const remaining = count - levels.length
  const effective = levels.map((level) => Math.max(1, Number(BALANCED_BLOOM_WEIGHTS[level]) || 0))
  const weightTotal = effective.reduce((a, b) => a + b, 0)
  const shares = levels.map((level, i) => {
    const exact = remaining * effective[i] / weightTotal
    return { level, whole: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  shares.forEach(({ level, whole }) => { allocation[level] += whole })
  const leftovers = remaining - shares.reduce((sum, row) => sum + row.whole, 0)
  shares.sort((a, b) => b.remainder - a.remainder || BLOOMS_ORDER.indexOf(a.level) - BLOOMS_ORDER.indexOf(b.level))
  for (let i = 0; i < leftovers; i += 1) allocation[shares[i].level] += 1
  return allocation
}

export function questionTypeCompatibility(allocation, types) {
  const issues = []
  for (const level of BLOOMS_ORDER) {
    if (!(Number(allocation?.[level]) > 0)) continue
    const guidance = BLOOM_TYPE_GUIDANCE[level]
    const incompatible = types.filter((type) => !guidance.compatible.includes(type))
    const compatible = types.filter((type) => guidance.compatible.includes(type))
    if (!compatible.length) {
      issues.push({
        level, blocked: true,
        message: `${BLOOMS_LABELS[level]} requires ${guidance.compatible.map((type) => type.replace('_', ' ')).join(' or ')}.`,
      })
    } else if (incompatible.length) {
      issues.push({
        level, blocked: false,
        message: `${BLOOMS_LABELS[level]} will use ${compatible.map((type) => QUESTION_TYPE_NAMES[type]).join(' or ')}; ${incompatible.map((type) => QUESTION_TYPE_NAMES[type]).join(', ')} will be excluded.`,
      })
    } else if (guidance.warning.some((type) => types.includes(type))) {
      const message = level === 'analyze' && types.includes('mcq')
        ? 'Analyzing multiple-choice questions should use a substantive scenario or case that requires interpreting evidence or relationships.'
        : `${BLOOMS_LABELS[level]} may be less direct with ${guidance.warning.filter((type) => types.includes(type)).map((type) => QUESTION_TYPE_NAMES[type]).join(', ')}.`
      issues.push({
        level, blocked: false,
        message,
      })
    }
  }
  return issues
}
