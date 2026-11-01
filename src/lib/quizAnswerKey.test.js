/**
 * Group 7 (audit F-06): the answers must not be in the quiz document.
 *
 * `quizzes/{quizId}` is readable by every signed-in account and has to stay
 * that way -- the student class page lists it with
 * `where('class_ids','array-contains', classId)`, and scoping the read through
 * a `get()` denies that query outright (firestore.rules writes out the
 * emulator result). So these tests pin the other half of the fix: whatever
 * goes into that document carries no answer, and the half that does is written
 * to `quiz_keys/{quizId}` in the SAME batch.
 *
 * The Python original is app/services/quiz_answer_keys.py, covered by
 * activklass-backend/tests/test_quiz_answer_keys.py. The two have to agree
 * about the shape: the server grades from the document this client writes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({ writes: [], committed: 0, keyDoc: undefined, throwOnGet: false }))

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db, coll, id) => ({ coll, id }),
  serverTimestamp: () => 'SERVER_TS',
  getDoc: async (ref) => {
    if (fs.throwOnGet) throw new Error('permission-denied')
    const data = ref.coll === 'quiz_keys' ? fs.keyDoc : undefined
    return { exists: () => data !== undefined, id: ref.id, data: () => data }
  },
  writeBatch: () => ({
    set: (ref, data) => fs.writes.push({ op: 'set', ...ref, data }),
    update: (ref, data) => fs.writes.push({ op: 'update', ...ref, data }),
    delete: (ref) => fs.writes.push({ op: 'delete', ...ref }),
    commit: async () => { fs.committed += 1 },
  }),
}))

const {
  QuizKeyReadError,
  QuizKeyNotFoundError,
  QuizKeyMalformedError,
  attachKeyIfNeeded,
  deleteQuizWithKey,
  hasInlineKeys,
  loadAnswerKey,
  loadQuizWithKey,
  mergeQuestions,
  splitQuestions,
  writeQuizWithKey,
} = await import('./quizAnswerKey.js')
const { correctAnswerText, gradeQuiz, matchingChoices, matchingLefts, studentAnswerText } =
  await import('./quizGrading.js')

function questions() {
  return [
    {
      id: 'q1', qtype: 'mcq', text: 'Capital?', points: 2,
      options: [
        { id: 'o1', text: 'Manila', is_correct: true },
        { id: 'o2', text: 'Cebu', is_correct: false },
      ],
    },
    { id: 'q2', qtype: 'true_false', text: 'Boils at 100C.', points: 1, answer_key: { value: true } },
    { id: 'q3', qtype: 'short_answer', text: 'Powerhouse?', points: 1, answer_key: { answers: ['mitochondria'] } },
    {
      id: 'q4', qtype: 'matching', text: 'Match.', points: 2,
      answer_key: { pairs: [{ left: 'Rizal', right: 'Noli' }, { left: 'Bonifacio', right: 'Katipunan' }] },
    },
    { id: 'q5', qtype: 'essay', text: 'Discuss.', points: 4, rubric: 'Both causes.' },
  ]
}

beforeEach(() => {
  fs.writes = []
  fs.committed = 0
  fs.keyDoc = undefined
  fs.throwOnGet = false
})

describe('splitQuestions — nothing an answer could be read from survives', () => {
  it('strips is_correct and answer_key from every question', () => {
    const { questions: pub } = splitQuestions(questions())
    const serialised = JSON.stringify(pub)
    expect(serialised).not.toContain('is_correct')
    expect(serialised).not.toContain('answer_key')
  })

  it('keeps everything the student legitimately needs', () => {
    const { questions: pub } = splitQuestions(questions())
    expect(pub[0].text).toBe('Capital?')
    expect(pub[0].options.map((o) => o.text)).toEqual(['Manila', 'Cebu'])
    expect(pub[0].options.map((o) => o.id)).toEqual(['o1', 'o2'])
    expect(pub[1].points).toBe(1)
  })

  it('moves each answer into the key, keyed by question id', () => {
    const { keys } = splitQuestions(questions())
    expect(keys.q1.correct_option_ids).toEqual(['o1'])
    expect(keys.q2.answer_key).toEqual({ value: true })
    expect(keys.q3.answer_key.answers).toEqual(['mitochondria'])
    expect(keys.q4.answer_key.pairs).toHaveLength(2)
  })

  it('leaves an essay rubric in the quiz document, deliberately', () => {
    // Scope boundary, not an oversight: a rubric is grading guidance rather
    // than an answer, and the student is already shown it on the feedback
    // page. Moving it would buy no confidentiality and would blank that panel
    // for every historical attempt.
    const { questions: pub } = splitQuestions(questions())
    expect(pub[4].rubric).toBe('Both causes.')
  })

  it('denormalises matching terms unpaired, with the rights sorted', () => {
    const { questions: pub } = splitQuestions(questions())
    // Rows in ask order, choices sorted -- if the rights kept pair order, the
    // nth choice would answer the nth row and the split would give it away.
    expect(pub[3].matching.lefts).toEqual(['Rizal', 'Bonifacio'])
    expect(pub[3].matching.rights).toEqual(['Katipunan', 'Noli'])
  })

  it('is idempotent, so a double save cannot blank a good key', () => {
    const first = splitQuestions(questions())
    const second = splitQuestions(first.questions)
    expect(second.questions).toEqual(first.questions)
    expect(second.keys.q1.correct_option_ids).toBeUndefined()
    expect(first.keys.q1.correct_option_ids).toEqual(['o1'])
  })

  it('drops the key of a deleted question', () => {
    const remaining = questions().slice(1)
    const { keys } = splitQuestions(remaining)
    expect(keys.q1).toBeUndefined()
    expect(keys.q2).toBeDefined()
  })
})

describe('mergeQuestions — the teacher gets the shape every screen already reads', () => {
  it('round-trips to the same grade', () => {
    const original = questions()
    const { questions: pub, keys } = splitQuestions(original)
    const answers = { q1: 'o1', q2: true, q3: 'Mitochondria', q4: { 0: 'Noli', 1: 'Katipunan' } }
    expect(gradeQuiz({ questions: mergeQuestions(pub, keys) }, answers).total_score)
      .toBe(gradeQuiz({ questions: original }, answers).total_score)
  })

  it('stays aligned when the questions are reordered', () => {
    const { questions: pub, keys } = splitQuestions(questions())
    const merged = mergeQuestions([...pub].reverse(), keys)
    const byId = Object.fromEntries(merged.map((q) => [q.id, q]))
    expect(byId.q1.options.find((o) => o.is_correct).id).toBe('o1')
    expect(byId.q2.answer_key).toEqual({ value: true })
  })

  it('returns a question unchanged when its key is missing', () => {
    const { questions: pub } = splitQuestions(questions())
    const merged = mergeQuestions(pub, {})
    expect(merged[0]).toEqual(pub[0])
    // And the grader scores it 0 rather than throwing.
    expect(gradeQuiz({ questions: merged }, { q1: 'o1' }).total_score).toBe(0)
  })

  it('restores the correct answer text for the teacher views', () => {
    const { questions: pub, keys } = splitQuestions(questions())
    expect(correctAnswerText(pub[0])).toBe('—')
    expect(correctAnswerText(mergeQuestions(pub, keys)[0])).toBe('Manila')
  })

  it('reveals nothing for any type when the key is absent', () => {
    // true_false used to fall through to 'False' here -- a wrong answer stated
    // as confidently as a right one, and the normal case on a student client
    // once the key moved out of the quiz document.
    const { questions: pub } = splitQuestions(questions())
    expect(pub.slice(0, 4).map(correctAnswerText)).toEqual(['—', '—', '—', '—'])
  })
})

describe('the student player still works without the key', () => {
  it('reads matching rows and choices off the public question', () => {
    const { questions: pub } = splitQuestions(questions())
    expect(matchingLefts(pub[3])).toEqual(['Rizal', 'Bonifacio'])
    expect(matchingChoices(pub[3])).toEqual(['Katipunan', 'Noli'])
  })

  it('falls back to answer_key for a quiz the migration has not reached', () => {
    const legacy = questions()[3]
    expect(matchingLefts(legacy)).toEqual(['Rizal', 'Bonifacio'])
    expect(matchingChoices(legacy)).toEqual(['Noli', 'Katipunan'])
  })

  it('renders the student’s own matching answer off the public question', () => {
    const { questions: pub } = splitQuestions(questions())
    expect(studentAnswerText(pub[3], { 0: 'Noli', 1: 'Katipunan' }))
      .toBe('Rizal → Noli; Bonifacio → Katipunan')
  })
})

describe('writeQuizWithKey — two documents, one batch', () => {
  it('puts no answer into the quiz document', () => {
    writeQuizWithKey('qz', { title: 'T', class_ids: ['c1'] }, questions(), { teacherId: 't1' })
    const quizWrite = fs.writes.find((w) => w.coll === 'quizzes')
    const serialised = JSON.stringify(quizWrite.data)
    expect(serialised).not.toContain('is_correct')
    expect(serialised).not.toContain('answer_key')
    // The matching terms ARE in there -- the player has to draw them. What is
    // not is the pairing: `rights` is sorted, so position n does not answer
    // row n, and the document gives no way to recover which goes with which.
    expect(quizWrite.data.questions[3].matching).toEqual({
      lefts: ['Rizal', 'Bonifacio'],
      rights: ['Katipunan', 'Noli'],
    })
    expect(serialised).not.toContain('pairs')
  })

  it('puts the answers into quiz_keys under the same id', () => {
    writeQuizWithKey('qz', { title: 'T', class_ids: ['c1'] }, questions(), { teacherId: 't1' })
    const keyWrite = fs.writes.find((w) => w.coll === 'quiz_keys')
    expect(keyWrite.id).toBe('qz')
    expect(keyWrite.data.keys.q1.correct_option_ids).toEqual(['o1'])
  })

  it('commits both in one batch, so the key can never answer the previous paper', async () => {
    await writeQuizWithKey('qz', { title: 'T' }, questions(), { teacherId: 't1' })
    expect(fs.writes).toHaveLength(2)
    expect(fs.committed).toBe(1)
  })

  it('stamps the teacher_id the rules scope every read and write off', () => {
    writeQuizWithKey('qz', { class_ids: ['c1'] }, questions(), { teacherId: 't1', schoolId: 's1' })
    const keyWrite = fs.writes.find((w) => w.coll === 'quiz_keys')
    expect(keyWrite.data.teacher_id).toBe('t1')
    expect(keyWrite.data.school_id).toBe('s1')
    expect(keyWrite.data.class_ids).toEqual(['c1'])
  })

  it('falls back to the quiz payload’s own teacher_id when none is passed', () => {
    writeQuizWithKey('qz', { teacher_id: 't9' }, questions(), {})
    expect(fs.writes.find((w) => w.coll === 'quiz_keys').data.teacher_id).toBe('t9')
  })

  it('uses update for an edit and set for a create', () => {
    writeQuizWithKey('qz', {}, questions(), { teacherId: 't1', merge: true, keyLoaded: true })
    expect(fs.writes.find((w) => w.coll === 'quizzes').op).toBe('update')
    fs.writes = []
    writeQuizWithKey('qz', {}, questions(), { teacherId: 't1' })
    expect(fs.writes.find((w) => w.coll === 'quizzes').op).toBe('set')
  })

  it('replaces the key document wholesale, so a removed question leaves no stale key', () => {
    // A merge would leave q1's answer behind in a document the teacher reads,
    // answering a question that no longer exists.
    writeQuizWithKey('qz', {}, questions().slice(1), { teacherId: 't1' })
    const keyWrite = fs.writes.find((w) => w.coll === 'quiz_keys')
    expect(keyWrite.op).toBe('set')
    expect(Object.keys(keyWrite.data.keys)).toEqual(['q2', 'q3', 'q4', 'q5'])
  })
})

describe('deleteQuizWithKey', () => {
  it('deletes both documents in one batch', async () => {
    await deleteQuizWithKey('qz')
    expect(fs.writes.map((w) => `${w.op}:${w.coll}`)).toEqual(['delete:quizzes', 'delete:quiz_keys'])
    expect(fs.committed).toBe(1)
  })
})

describe('loading and fail-closed key protections (G7-02)', () => {
  beforeEach(() => {
    fs.throwOnGet = false
    fs.keyDoc = undefined
    fs.writes = []
    fs.committed = 0
  })

  it('hasInlineKeys tells a legacy quiz from a separated one', () => {
    expect(hasInlineKeys(questions())).toBe(true)
    expect(hasInlineKeys(splitQuestions(questions()).questions)).toBe(false)
    expect(hasInlineKeys([])).toBe(false)
  })

  it('1. successful key read returns the key map', async () => {
    const { keys } = splitQuestions(questions())
    fs.keyDoc = { keys }
    const loaded = await loadAnswerKey('qz')
    expect(loaded).toEqual(keys)
  })

  it('2. key read permission failure throws QuizKeyReadError', async () => {
    fs.throwOnGet = true
    await expect(loadAnswerKey('qz')).rejects.toThrow(QuizKeyReadError)
  })

  it('3. key read network/error failure throws QuizKeyReadError', async () => {
    fs.throwOnGet = true
    await expect(loadAnswerKey('qz')).rejects.toThrow('permission-denied')
  })

  it('4. missing key document returns null from loadAnswerKey', async () => {
    fs.keyDoc = undefined
    expect(await loadAnswerKey('qz')).toBeNull()
  })

  it('5. malformed key document throws QuizKeyMalformedError', async () => {
    fs.keyDoc = { keys: 'not-an-object' }
    await expect(loadAnswerKey('qz')).rejects.toThrow(QuizKeyMalformedError)
  })

  it('6. save after failed key read is refused via keyLoaded: false', () => {
    expect(() =>
      writeQuizWithKey('qz', { title: 'T' }, questions(), { teacherId: 't1', keyLoaded: false }),
    ).toThrow(QuizKeyReadError)
    expect(fs.writes).toHaveLength(0)
    expect(fs.committed).toBe(0)
  })

  it('7. key remains unchanged on failure: attachKeyIfNeeded throws rather than overwriting with empty key', async () => {
    fs.throwOnGet = true
    const { questions: pub } = splitQuestions(questions())
    await expect(attachKeyIfNeeded({ id: 'qz', questions: pub })).rejects.toThrow(QuizKeyReadError)
  })

  it('attachKeyIfNeeded leaves a legacy quiz alone without reading quiz_keys', async () => {
    fs.throwOnGet = true // Even if key read fails, legacy quiz has inline keys
    const legacy = { id: 'qz', questions: questions() }
    const out = await attachKeyIfNeeded(legacy)
    expect(out.questions[0].options.find((o) => o.is_correct).id).toBe('o1')
  })

  it('attachKeyIfNeeded throws QuizKeyNotFoundError for separated quiz when key is missing', async () => {
    fs.keyDoc = undefined
    const { questions: pub } = splitQuestions(questions())
    await expect(attachKeyIfNeeded({ id: 'qz', questions: pub })).rejects.toThrow(QuizKeyNotFoundError)
  })

  it('attachKeyIfNeeded merges the key document for a separated quiz when key exists', async () => {
    const { questions: pub, keys } = splitQuestions(questions())
    fs.keyDoc = { keys }
    const out = await attachKeyIfNeeded({ id: 'qz', questions: pub })
    expect(out.questions[0].options.find((o) => o.is_correct).id).toBe('o1')
    expect(out.questions[1].answer_key).toEqual({ value: true })
    expect(out._keyLoaded).toBe(true)
  })

  it('loadQuizWithKey returns null for a quiz that does not exist', async () => {
    expect(await loadQuizWithKey('nope')).toBeNull()
  })

  it('refuses writeQuizWithKey on existing quiz update without proven key-load (V-06)', () => {
    expect(() =>
      writeQuizWithKey('qz', { title: 'T' }, questions(), { teacherId: 't1', merge: true }),
    ).toThrow(QuizKeyReadError)
    expect(fs.writes).toHaveLength(0)
  })

  it('succeeds writeQuizWithKey on existing quiz update when quiz._keyLoaded === true (V-06)', () => {
    expect(() =>
      writeQuizWithKey('qz', { title: 'T' }, questions(), { teacherId: 't1', merge: true, quiz: { _keyLoaded: true } }),
    ).not.toThrow()
    expect(fs.writes).toHaveLength(2)
  })

  it('succeeds writeQuizWithKey on new quiz creation without requiring keyLoaded (V-06)', () => {
    expect(() =>
      writeQuizWithKey('new-qz', { title: 'New' }, questions(), { teacherId: 't1', merge: false }),
    ).not.toThrow()
    expect(fs.writes).toHaveLength(2)
  })

  it('safely loads essay-only / keyless quiz without requiring quiz_keys document (V-05)', async () => {
    fs.keyDoc = undefined
    const essayQuiz = {
      id: 'qz-essay',
      questions: [{ id: 'e1', qtype: 'essay', text: 'Analyze the text.', points: 5, rubric: 'Clarity and depth.' }],
    }
    const out = await attachKeyIfNeeded(essayQuiz)
    expect(out._keyLoaded).toBe(true)
    expect(out.questions).toHaveLength(1)
    expect(out.questions[0].id).toBe('e1')
  })

  it('safely loads quiz with empty questions without requiring quiz_keys document (V-05)', async () => {
    fs.keyDoc = undefined
    const emptyQuiz = { id: 'qz-empty', questions: [] }
    const out = await attachKeyIfNeeded(emptyQuiz)
    expect(out._keyLoaded).toBe(true)
    expect(out.questions).toEqual([])
  })
})
