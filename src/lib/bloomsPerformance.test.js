import { describe, expect, it } from 'vitest'
import { aggregateBloomPerformance } from './bloomsPerformance'

const levels = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
const meta = (id, blooms_level) => ({ question_id: id, blooms_level, topic_id: `topic-${id}`, topic_label: 'Topic', objective: 'Objective' })
const result = (id, earned, possible, extra = {}) => ({ id, earned, possible, pending: false, ...extra })
const attempt = (student_id, attempt_number, { score = 0, metadata = [], perQuestion = [], questionIds = [] } = {}) => ({
  student_id, attempt_number, status: 'graded', total_score: score,
  question_metadata: metadata, per_question: perQuestion, question_ids: questionIds,
})
const aggregate = (attempts, quiz = { id: 'quiz-1', questions: [] }) => aggregateBloomPerformance({
  quizzes: [quiz], attemptsByQuiz: { [quiz.id]: attempts },
})

describe('Bloom performance aggregation from attempt snapshots', () => {
  it('aggregates scored results for all six cognitive levels', () => {
    const metadata = levels.map((level, i) => meta(`q${i}`, level))
    const scores = levels.map((_, i) => result(`q${i}`, i + 1, i + 1))
    const data = aggregate([attempt('s1', 1, { score: 21, metadata, perQuestion: scores })])
    for (const level of levels) expect(data.levels[level]).toMatchObject({ questionCount: 1, earnedPoints: levels.indexOf(level) + 1, maximumPoints: levels.indexOf(level) + 1, percentage: 100 })
  })

  it('weights unequal question values by points and retains partial credit', () => {
    const data = aggregate([attempt('s1', 1, {
      score: 4.5,
      metadata: [meta('q1', 'remember'), meta('q2', 'remember')],
      perQuestion: [result('q1', 2, 10), result('q2', 2.5, 5)],
    })])
    expect(data.levels.remember).toMatchObject({ questionCount: 2, earnedPoints: 4.5, maximumPoints: 15, percentage: 30 })
  })

  it('excludes pending manual grading while reporting its question and points', () => {
    const data = aggregate([attempt('s1', 1, {
      score: 2,
      metadata: [meta('mcq', 'apply'), meta('essay', 'apply')],
      perQuestion: [result('mcq', 2, 2), result('essay', 0, 6, { earned: null, pending: true })],
    })])
    expect(data.levels.apply).toMatchObject({ questionCount: 1, earnedPoints: 2, maximumPoints: 2, percentage: 100, pendingCount: 1, pendingPoints: 6 })
    expect(data.pending).toEqual({ questionCount: 1, maximumPoints: 6 })
  })

  it('includes a manually graded essay after the pending mark is cleared', () => {
    const data = aggregate([attempt('s1', 1, {
      score: 3,
      metadata: [meta('essay', 'evaluate')],
      perQuestion: [result('essay', 3, 5, { qtype: 'essay', pending: false })],
    })])
    expect(data.levels.evaluate).toMatchObject({ questionCount: 1, earnedPoints: 3, maximumPoints: 5, percentage: 60, pendingCount: 0 })
    expect(data.pending.questionCount).toBe(0)
  })

  it('distinguishes a zero score from a level with no scored questions', () => {
    const data = aggregate([attempt('s1', 0, { metadata: [meta('q1', 'remember')], perQuestion: [result('q1', 0, 4)] })])
    expect(data.levels.remember).toMatchObject({ questionCount: 1, earnedPoints: 0, maximumPoints: 4, percentage: 0 })
    expect(data.levels.create).toMatchObject({ questionCount: 0, maximumPoints: 0, percentage: null })
  })

  it('keeps untagged scored questions in Unknown alongside tagged levels', () => {
    const data = aggregate([attempt('s1', 1, {
      score: 3,
      metadata: [meta('q1', 'understand'), meta('q2', null)],
      perQuestion: [result('q1', 2, 3), result('q2', 1, 2)],
    })])
    expect(data.levels.understand).toMatchObject({ questionCount: 1, earnedPoints: 2, maximumPoints: 3, percentage: 66.67 })
    expect(data.unknown).toMatchObject({ questionCount: 1, earnedPoints: 1, maximumPoints: 2, percentage: 50 })
  })

  it('reports legacy and mobile-origin attempts without snapshots as Unknown, without inference', () => {
    const oldAttempt = attempt('legacy', 1, { score: 2, perQuestion: [result('old-q', 2, 4)], questionIds: ['old-q'] })
    const mobileAttempt = attempt('mobile', 1, { score: 0, perQuestion: [result('mobile-q', 0, 3)], questionIds: ['mobile-q'] })
    const data = aggregate([oldAttempt, mobileAttempt], {
      id: 'quiz-1', questions: [{ id: 'old-q', blooms_level: 'create' }, { id: 'mobile-q', blooms_level: 'remember' }],
    })
    expect(data.unknown).toMatchObject({ questionCount: 2, earnedPoints: 2, maximumPoints: 7, percentage: 28.57, attemptsWithoutMetadata: 2 })
    expect(data.levels.create.questionCount).toBe(0)
    expect(data.levels.remember.questionCount).toBe(0)
  })

  it('uses historical snapshot tags after editable quiz question tags change', () => {
    const data = aggregate([attempt('s1', 1, {
      score: 2,
      metadata: [meta('q1', 'analyze')],
      perQuestion: [result('q1', 2, 2)],
    })], { id: 'quiz-1', questions: [{ id: 'q1', blooms_level: 'create' }] })
    expect(data.levels.analyze.percentage).toBe(100)
    expect(data.levels.create.percentage).toBeNull()
  })

  it('uses the existing best-finished-attempt convention and ignores in-progress attempts', () => {
    const first = attempt('s1', 1, { score: 3, metadata: [meta('q1', 'remember')], perQuestion: [result('q1', 3, 5)] })
    const best = attempt('s1', 2, { score: 4, metadata: [meta('q2', 'apply')], perQuestion: [result('q2', 4, 5)] })
    const open = { ...attempt('s1', 3, { score: 100, metadata: [meta('q3', 'create')], perQuestion: [result('q3', 100, 100)] }), status: 'in_progress' }
    const data = aggregate([first, best, open])
    expect(data.selectedAttemptCount).toBe(1)
    expect(data.levels.apply.percentage).toBe(80)
    expect(data.levels.remember.questionCount).toBe(0)
    expect(data.levels.create.questionCount).toBe(0)
  })

  it('reports scored attempts with missing itemized question results without fabricating a breakdown', () => {
    const legacy = attempt('s1', 1, { score: 4, metadata: [meta('q1', 'remember')], questionIds: ['q1', 'q2'] })
    delete legacy.per_question
    const data = aggregate([legacy])
    expect(data.unknown).toMatchObject({ attemptsWithoutMetadata: 0, unitemizedAttempts: 1, unitemizedQuestions: 2 })
    expect(data.levels.remember).toMatchObject({ questionCount: 0, percentage: null })
  })
})
