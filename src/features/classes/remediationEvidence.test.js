import { describe, expect, it } from 'vitest'
import {
  remediationEvidenceInstructions,
  remediationEvidenceSummary,
  remediationPracticeConfig,
  scaffoldMaterialsToGuidance,
  targetedRemediationEvidence,
} from './remediationEvidence.js'

describe('remediation evidence explanation', () => {
  it('reports observed topic scores and qualifies the signal without claiming prerequisite failure', () => {
    const text = remediationEvidenceSummary({ evidenceByStudent: { s1: 60, s2: 82 } }, ['s1', 's2'])
    expect(text).toContain('1 of 2 selected students')
    expect(text).toContain('(60%, 82%)')
    expect(text).toContain('not a diagnosis of prerequisite knowledge')
  })

  it('states when selected students have no measured evidence', () => {
    expect(remediationEvidenceSummary({ evidenceByStudent: {} }, ['s1']))
      .toContain('no measured performance basis yet')
  })
})

const baseQuiz = { id: 'quiz-1', title: 'Unit check', topic_id: 'topic-a' }
const question = (id, blooms_level, topic_id = 'topic-a', objective = `Objective ${id}`) => ({ question_id: id, blooms_level, topic_id, topic_label: topic_id, objective })
const scored = (id, earned, possible, extra = {}) => ({ id, earned, possible, pending: false, ...extra })
const attempt = (student_id, n, total_score, per_question, metadata, extra = {}) => ({
  student_id, attempt_number: n, status: 'graded', total_score,
  total_possible: per_question.reduce((sum, item) => sum + item.possible, 0),
  question_ids: per_question.map((item) => item.id), per_question,
  ...(metadata === undefined ? {} : { question_metadata: metadata }),
  ...extra,
})

describe('targeted remediation evidence', () => {
  it('selects incorrect and partial-credit item evidence from each learner’s best attempt', () => {
    const weak = attempt('student-a', 1, 1, [scored('q1', 0, 3), scored('q2', 1, 4)], [question('q1', 'remember'), question('q2', 'apply')])
    const lower = attempt('student-a', 2, 0, [scored('q1', 0, 3)], [question('q1', 'remember')])
    const evidence = targetedRemediationEvidence({
      topicId: 'topic-a', topicLabel: 'Fractions', targetStudentIds: ['student-a'],
      nameById: { 'student-a': 'Student A' }, quizzes: [baseQuiz], attemptsByQuiz: { 'quiz-1': [lower, weak] },
    })
    expect(evidence.students[0]).toMatchObject({ displayName: 'Student A', topicScore: { earnedPoints: 1, maximumPoints: 7, percentage: 14.29 }, pendingCount: 0 })
    expect(evidence.students[0].items.map(({ questionLabel, bloomsLevel, outcome }) => [questionLabel, bloomsLevel, outcome])).toEqual([
      ['Question 1', 'remember', 'incorrect'], ['Question 2', 'apply', 'partial'],
    ])
  })

  it('associates each result with its frozen topic, objective and Bloom level across multiple topics', () => {
    const quiz = { ...baseQuiz, topic_id: 'topic-currently-edited' }
    const result = attempt('student-a', 1, 1, [scored('q-a', 0, 2), scored('q-b', 1, 2)], [
      question('q-a', 'analyze', 'topic-a', 'Compare two models'),
      question('q-b', 'evaluate', 'topic-b', 'Judge the evidence'),
    ])
    const topicA = targetedRemediationEvidence({ topicId: 'topic-a', topicLabel: 'A', targetStudentIds: ['student-a'], quizzes: [quiz], attemptsByQuiz: { [quiz.id]: [result] } })
    const topicB = targetedRemediationEvidence({ topicId: 'topic-b', topicLabel: 'B', targetStudentIds: ['student-a'], quizzes: [quiz], attemptsByQuiz: { [quiz.id]: [result] } })
    expect(topicA.students[0].items).toMatchObject([{ topicId: 'topic-a', objective: 'Compare two models', bloomsLevel: 'analyze' }])
    expect(topicB.students[0].items).toMatchObject([{ topicId: 'topic-b', objective: 'Judge the evidence', bloomsLevel: 'evaluate' }])
  })

  it('does not use an edited quiz topic when a historical snapshot has no topic reference', () => {
    const result = attempt('student-a', 1, 0, [scored('q1', 0, 2)], [{ question_id: 'q1', blooms_level: null, topic_id: null }])
    const evidence = targetedRemediationEvidence({ topicId: 'topic-a', targetStudentIds: ['student-a'], quizzes: [baseQuiz], attemptsByQuiz: { 'quiz-1': [result] } })
    expect(evidence.students[0].items).toEqual([])
    expect(evidence.students[0].topicScore).toBeNull()
  })

  it('sets pending manual grading aside from scores and flagged difficulties', () => {
    const result = attempt('student-a', 1, 2, [
      scored('q1', 2, 2), scored('essay', 0, 8, { earned: null, pending: true }),
    ], [question('q1', 'understand'), question('essay', 'evaluate')], { status: 'submitted' })
    const evidence = targetedRemediationEvidence({ topicId: 'topic-a', targetStudentIds: ['student-a'], quizzes: [baseQuiz], attemptsByQuiz: { 'quiz-1': [result] } })
    expect(evidence.students[0]).toMatchObject({ topicScore: { earnedPoints: 2, maximumPoints: 2, percentage: 100 }, pendingCount: 1, pendingPoints: 8, items: [] })
    expect(evidence.aiEvidence).toEqual([])
  })

  it('keeps missing or legacy snapshot metadata Unknown and uses existing topic-only evidence where available', () => {
    const legacy = attempt('legacy-student', 1, 2, [scored('legacy-q', 2, 5)], undefined)
    const evidence = targetedRemediationEvidence({
      topicId: 'topic-a', topicLabel: 'Fractions', targetStudentIds: ['legacy-student'],
      quizzes: [baseQuiz], attemptsByQuiz: { 'quiz-1': [legacy] },
    })
    expect(evidence.students[0].items[0]).toMatchObject({ bloomsLevel: null, objective: null, topicLabel: 'Fractions', outcome: 'partial' })
    expect(evidence.aiEvidence[0].difficulties[0].blooms_level).toBeNull()
    expect(remediationEvidenceInstructions(evidence)).toContain('A null Bloom level means Unknown')
  })

  it('does not mix selected learners and sends no student IDs, names, question text, answers, or keys to AI', () => {
    const first = attempt('student-secret-1', 1, 0, [scored('private-q1', 0, 2)], [{ ...question('private-q1', 'remember'), objective: 'Recall the key terms' }])
    const second = attempt('student-secret-2', 1, 1, [scored('private-q2', 1, 3)], [{ ...question('private-q2', 'analyze'), objective: 'Compare evidence' }])
    const evidence = targetedRemediationEvidence({
      topicId: 'topic-a', targetStudentIds: ['student-secret-1', 'student-secret-2'],
      nameById: { 'student-secret-1': 'Alice Private', 'student-secret-2': 'Bob Private' },
      quizzes: [baseQuiz], attemptsByQuiz: { 'quiz-1': [first, second] },
    })
    expect(evidence.students.map((row) => row.items.map((item) => item.bloomsLevel))).toEqual([['remember'], ['analyze']])
    const promptInput = remediationEvidenceInstructions(evidence)
    for (const privateValue of ['student-secret-1', 'Alice Private', 'private-q1', 'Bob Private', 'correct_answer', 'answer_key']) expect(promptInput).not.toContain(privateValue)
    expect(promptInput).toContain('Learner 1')
    expect(promptInput).toContain('Learner 2')
  })

  it('keeps an untagged partial-credit result Unknown and excludes pending-only work', () => {
    const highLegacy = attempt('student-a', 1, 9, [scored('q1', 9, 10)], undefined)
    const pendingOnly = attempt('student-b', 1, 0, [scored('q2', 0, 5, { earned: null, pending: true })], [question('q2', 'create')], { status: 'submitted' })
    const evidence = targetedRemediationEvidence({ topicId: 'topic-a', targetStudentIds: ['student-a', 'student-b'], quizzes: [baseQuiz], attemptsByQuiz: { 'quiz-1': [highLegacy, pendingOnly] } })
    expect(evidence.students[0].items).toMatchObject([{ bloomsLevel: null, outcome: 'partial' }])
    expect(evidence.students[0].hasEvidence).toBe(true)
    expect(evidence.aiEvidence[0].difficulties[0].blooms_level).toBeNull()
    expect(evidence.students[1].items).toEqual([])
    expect(evidence.students[1].pendingCount).toBe(1)
    expect(evidence.students[1].hasEvidence).toBe(false)
    expect(evidence.hasScoredEvidence).toBe(true)
  })

  it('supports topic-level legacy scores only when a graded total with its own maximum exists', () => {
    const topicOnly = attempt('student-a', 1, 5, [], undefined, { total_score: 5, total_possible: 10 })
    delete topicOnly.per_question
    const evidence = targetedRemediationEvidence({ topicId: 'topic-a', targetStudentIds: ['student-a'], quizzes: [baseQuiz], attemptsByQuiz: { 'quiz-1': [topicOnly] } })
    expect(evidence.students[0]).toMatchObject({ topicScore: { earnedPoints: 5, maximumPoints: 10, percentage: 50 }, items: [], hasEvidence: true })
    expect(evidence.aiEvidence[0].difficulties).toEqual([])
  })
})

describe('targeted remediation content and linked quiz compatibility', () => {
  it('uses Balanced quotas across only observed cognitive levels', () => {
    const config = remediationPracticeConfig({ aiEvidence: [{ difficulties: [{ blooms_level: 'remember' }, { blooms_level: 'analyze' }] }] })
    expect(config.bloomsLevels).toEqual(['remember', 'analyze'])
    expect(config.bloomAllocation).toEqual({ remember: 5, understand: 0, apply: 0, analyze: 5, evaluate: 0, create: 0 })
    expect(config.types).toEqual(['mcq'])
    expect(config.usedRecordedBloomLevels).toBe(true)
  })

  it('uses compatible short-answer or original essay types for Evaluating and Creating', () => {
    expect(remediationPracticeConfig({ aiEvidence: [{ difficulties: [{ blooms_level: 'evaluate' }] }] }).types).toEqual(['short_answer'])
    expect(remediationPracticeConfig({ aiEvidence: [{ difficulties: [{ blooms_level: 'create' }] }] }).types).toEqual(['essay'])
  })

  it('keeps the existing Applying practice default without treating missing Bloom tags as evidence', () => {
    expect(remediationPracticeConfig({ aiEvidence: [{ difficulties: [{ blooms_level: null }] }] })).toMatchObject({
      bloomsLevels: ['apply'], bloomAllocation: { remember: 0, understand: 0, apply: 10, analyze: 0, evaluate: 0, create: 0 }, usedRecordedBloomLevels: false,
    })
  })

  it('formats teacher-reviewable concept, explanation, example and answer-free practice content', () => {
    const guidance = scaffoldMaterialsToGuidance({
      concept_summary: 'A fraction names equal parts.',
      targeted_explanations: [{ focus: 'Equivalent fractions', explanation: 'Scale numerator and denominator by the same factor.' }],
      step_by_step_example: { problem: '2/4', steps: ['Divide both by 2'], final_answer: '1/2' },
      practice_exercises: [{ prompt: 'Simplify 3/6.', hint: 'Find the greatest common factor.' }],
      correct_answer: 'private-key-from-invalid-model-output',
    })
    expect(guidance).toContain('## Concept summary')
    expect(guidance).toContain('## Explanations for the observed learning gaps')
    expect(guidance).toContain('## Worked example')
    expect(guidance).toContain('## Practice exercises')
    expect(guidance).toContain('Hint: Find the greatest common factor.')
    expect(guidance).not.toContain('private-key-from-invalid-model-output')
    expect(guidance).not.toContain('correct_answer')
  })
})
