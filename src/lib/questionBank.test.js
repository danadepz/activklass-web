/**
 * Unit tests for the bank fingerprint in ./questionBank.js.
 *
 * Auto-banking writes to Firestore on every generation, so a fingerprint that
 * is too loose silently drops a teacher's item and one that is too strict
 * fills the bank with the same stem twenty times. Both failures are invisible
 * until the bank is already unusable, which is why they are pinned here.
 */
import { describe, expect, it } from 'vitest'
import {
  describeBankResult,
  questionFingerprint,
  splitAgainstBank,
  toBankPayload,
  withQuestionTopic,
} from './questionBank.js'

const mcq = (text, points = 1) => ({
  id: 'q1',
  qtype: 'mcq',
  text,
  points,
  options: [
    { id: 'o1', text: 'Right', is_correct: true },
    { id: 'o2', text: 'Wrong', is_correct: false },
  ],
})

describe('questionFingerprint', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(questionFingerprint(mcq('What is the slope?')))
      .toBe(questionFingerprint(mcq('what  is the SLOPE')))
  })

  it('keeps digits significant', () => {
    expect(questionFingerprint(mcq('Solve x + 2 = 5')))
      .not.toBe(questionFingerprint(mcq('Solve x + 2 = 7')))
  })

  it('separates the same stem asked as a different question type', () => {
    expect(questionFingerprint({ qtype: 'mcq', text: 'Water boils at 100C' }))
      .not.toBe(questionFingerprint({ qtype: 'true_false', text: 'Water boils at 100C' }))
  })

  it('ignores reworded options on the same stem', () => {
    const a = mcq('Name the powerhouse of the cell')
    const b = { ...a, options: [{ id: 'x', text: 'Mitochondria', is_correct: true }] }
    expect(questionFingerprint(a)).toBe(questionFingerprint(b))
  })

  it('returns an empty fingerprint for a blank stem', () => {
    expect(questionFingerprint(mcq('   '))).toBe('')
    expect(questionFingerprint(null)).toBe('')
  })
})

describe('splitAgainstBank', () => {
  it('keeps questions the bank has never seen', () => {
    const result = splitAgainstBank([mcq('Define photosynthesis')], [mcq('Define osmosis')])
    expect(result.fresh).toHaveLength(1)
    expect(result.duplicates).toHaveLength(0)
  })

  it('skips a question already banked under different punctuation', () => {
    const result = splitAgainstBank([mcq('Define photosynthesis.')], [mcq('define Photosynthesis')])
    expect(result.fresh).toHaveLength(0)
    expect(result.duplicates).toHaveLength(1)
  })

  it('de-duplicates the incoming batch against itself', () => {
    const result = splitAgainstBank([mcq('Define osmosis'), mcq('Define osmosis!')], [])
    expect(result.fresh).toHaveLength(1)
    expect(result.duplicates).toHaveLength(1)
  })

  it('reports blank questions apart from duplicates', () => {
    const result = splitAgainstBank([mcq(''), mcq('')], [])
    expect(result.unusable).toHaveLength(2)
    expect(result.duplicates).toHaveLength(0)
    expect(result.fresh).toHaveLength(0)
  })

  it('de-duplicates against a bank whose rows have no stored hash', () => {
    // Questions banked before text_hash existed carry only text/qtype.
    const legacy = [{ qtype: 'mcq', text: 'Define osmosis' }]
    expect(splitAgainstBank([mcq('Define osmosis')], legacy).duplicates).toHaveLength(1)
  })
})

describe('toBankPayload', () => {
  it('drops the in-quiz id and editor key, and stamps provenance', () => {
    const payload = toBankPayload(
      { ...mcq('Define osmosis'), _key: 'k1' },
      { topicId: 't1', topicLabel: 'Module · Topic', syllabusId: 's1', origin: 'ai_generated', sourceQuizId: 'quiz1' },
    )
    expect(payload.id).toBeUndefined()
    expect(payload._key).toBeUndefined()
    expect(payload).toMatchObject({
      qtype: 'mcq',
      topic_id: 't1',
      topic_label: 'Module · Topic',
      syllabus_id: 's1',
      origin: 'ai_generated',
      source_quiz_id: 'quiz1',
    })
    expect(payload.options).toHaveLength(2)
    expect(payload.text_hash).toBe(questionFingerprint(mcq('Define osmosis')))
  })

  it('normalises missing ids to null rather than undefined', () => {
    // Firestore rejects undefined; a bare toBankPayload(q) must still write.
    const payload = toBankPayload(mcq('Define osmosis'))
    expect(payload.topic_id).toBeNull()
    expect(payload.topic_label).toBeNull()
    expect(payload.syllabus_id).toBeNull()
    expect(payload.source_quiz_id).toBeNull()
    expect(payload.origin).toBe('manual')
  })

  it('keeps optional Bloom, topic label and objective metadata when banking a question', () => {
    const payload = toBankPayload({
      ...mcq('Analyze the chart'), blooms_level: 'analyze', topic_id: 'topic-7',
      topic_label: 'Data · Trends', objective: 'Compare rates over time',
    })
    expect(payload).toMatchObject({
      blooms_level: 'analyze', topic_id: 'topic-7', topic_label: 'Data · Trends',
      objective: 'Compare rates over time',
    })
  })
})

describe('withQuestionTopic', () => {
  it('attaches the selected stable id and label without touching Bloom or objective data', () => {
    const [question] = withQuestionTopic([
      { ...mcq('Compare sources'), blooms_level: 'analyze', objective: 'Compare evidence' },
    ], { topicId: 'topic-4', topicLabel: 'Module · Sources' })
    expect(question).toMatchObject({
      topic_id: 'topic-4', topic_label: 'Module · Sources',
      blooms_level: 'analyze', objective: 'Compare evidence',
    })
  })
})

describe('describeBankResult', () => {
  it('names the skipped duplicates so "0 saved" is never unexplained', () => {
    expect(describeBankResult({ saved: 0, duplicates: 10 }))
      .toBe('10 already in the bank.')
  })

  it('reads as one sentence when everything happened at once', () => {
    expect(describeBankResult({ saved: 1, duplicates: 2, unusable: 1 }))
      .toBe('1 question saved to your Quiz Bank · 2 already in the bank · 1 skipped (no question text).')
  })

  it('does not claim success when there was nothing to write', () => {
    expect(describeBankResult({})).toBe('Nothing to save to the Quiz Bank.')
  })
})
