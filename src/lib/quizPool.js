/**
 * What one student sees when they open a quiz: which questions, in what order,
 * with options in what order.
 *
 * Pure and **deterministic**, which is the whole point. The web player used to
 * shuffle with `Math.random()` in a state initialiser, so a refresh reshuffled
 * the paper. That was survivable while every student answered every question --
 * answers are keyed by question id, not by position -- but it stops being
 * survivable the moment a quiz draws 10 questions from a pool of 30: a refresh
 * would hand the student a different paper, and the answers they had already
 * given would belong to questions no longer on it.
 *
 * Seeding on (quiz, student, attempt) instead means the draw is stable across
 * refreshes and devices, different for every student, and different again on a
 * retake -- without storing anything before the attempt is submitted.
 *
 * Ported to activklass-mobile/src/lib/quizPool.ts. Both players must draw the
 * same paper for the same student, or a student who starts on the web and
 * finishes on their phone sits two different quizzes. Keep the two in step;
 * this copy is the original.
 */

/**
 * FNV-1a over a string, as an unsigned 32-bit int.
 *
 * Chosen because it is short enough to port by eye and has no dependencies.
 * It is not a cryptographic hash and does not need to be: a student who
 * reverse-engineers their own seed learns the order of their own paper, which
 * they can already see.
 */
export function hashSeed(value) {
  let hash = 0x811c9dc5
  const text = String(value ?? '')
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32 — small, fast, and identical across JS engines. */
export function seededRandom(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates against a seeded generator. Returns a new array. */
export function shuffleSeeded(items, seed) {
  const out = [...(items ?? [])]
  const random = seededRandom(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** The seed for one student's sitting of one quiz. */
export function seedFor({ quizId, studentId, attemptNumber = 1 }) {
  return hashSeed(`${quizId}::${studentId}::${attemptNumber}`)
}

/**
 * Why a pooled quiz cannot be sat, or null.
 *
 * Equal points across the pool is a hard requirement rather than a nicety. If
 * item A is worth 5 and item B worth 1, two students drawing different subsets
 * sit papers marked out of different totals -- their raw scores are not
 * comparable, and the class record has one `total_points` column to put them
 * in. Requiring equal points keeps the draw fair by construction and keeps the
 * record honest, at the cost of one validation message.
 */
export function poolProblem(quiz) {
  if (!quiz?.pool_enabled) return null
  const questions = quiz.questions ?? []
  const draw = Number(quiz.pool_draw_count)

  if (!Number.isFinite(draw) || draw < 1) {
    return 'Set how many questions to draw from the pool.'
  }
  if (draw > questions.length) {
    return `The pool has ${questions.length} question(s) but draws ${draw}. Add more questions or lower the draw.`
  }
  if (!questions.length) return 'A pooled quiz needs questions in its pool.'

  const points = new Set(questions.map((q) => Number(q.points) || 0))
  if (points.size > 1) {
    return `Every question in a pool must be worth the same points, so that each student's paper is marked out of the same total. This pool has ${[...points].sort((a, b) => a - b).join(', ')}.`
  }
  return null
}

/** What a pooled quiz is marked out of; the whole paper when it is not pooled. */
export function drawTotalPoints(quiz) {
  const questions = quiz?.questions ?? []
  if (!quiz?.pool_enabled) {
    return questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0)
  }
  const per = Number(questions[0]?.points) || 0
  return per * (Number(quiz.pool_draw_count) || 0)
}

/**
 * The paper this student sits.
 *
 * Order of operations matters. The draw happens first and on the pool in its
 * stored order, so the *set* a student gets does not depend on whether
 * shuffling is on; shuffling then decides the order of that set. Doing it the
 * other way round would make turning shuffle on silently change which
 * questions everyone gets.
 *
 * Options are shuffled per question with a seed derived from the question id,
 * so adding a question to the quiz does not reorder the options of the others.
 */
export function questionsForStudent(quiz, { studentId, attemptNumber = 1 } = {}) {
  const all = quiz?.questions ?? []
  const seed = seedFor({ quizId: quiz?.id, studentId, attemptNumber })

  let questions = all
  if (quiz?.pool_enabled) {
    const draw = Number(quiz.pool_draw_count) || all.length
    questions = shuffleSeeded(all, seed).slice(0, Math.min(draw, all.length))
  }

  if (quiz?.shuffle_questions) {
    // A second, different seed: with the same one, a pooled quiz would draw
    // and then order by the identical permutation, which is not wrong but
    // makes the two settings indistinguishable when read from the data.
    questions = shuffleSeeded(questions, seed ^ 0x9e3779b9)
  }

  if (quiz?.shuffle_options) {
    questions = questions.map((q) =>
      q.qtype === 'mcq' && (q.options ?? []).length
        ? { ...q, options: shuffleSeeded(q.options, seed ^ hashSeed(q.id)) }
        : q,
    )
  }

  return questions
}

/**
 * The ids of the questions an attempt was actually sat against.
 *
 * Stored on the attempt so the feedback page renders the student's paper
 * rather than the whole pool, and so a teacher looking at a two-year-old
 * attempt can still tell which ten of the thirty it covered.
 */
export function questionIdsOf(questions) {
  return (questions ?? []).map((q) => q.id).filter(Boolean)
}

/**
 * The questions an existing attempt was sat against, for review.
 *
 * Attempts written before pooling existed carry no `question_ids`; those sat
 * the whole quiz, so falling back to every question is the correct reading of
 * them rather than a guess.
 */
export function questionsOfAttempt(quiz, attempt) {
  const all = quiz?.questions ?? []
  const ids = attempt?.question_ids
  if (!Array.isArray(ids) || !ids.length) return all
  const byId = new Map(all.map((q) => [q.id, q]))
  return ids.map((id) => byId.get(id)).filter(Boolean)
}

/**
 * The paper an *open* attempt is sitting, rebuilt from what was stored.
 *
 * Different from `questionsForStudent`, and deliberately so. That one derives
 * the paper from the quiz as it is right now; this one reads the ids the
 * attempt recorded when Start was pressed. If the teacher edits the quiz while
 * someone is halfway through it, the student keeps the paper they were given
 * rather than having questions appear and disappear around them.
 *
 * Option order is still derived rather than stored -- it is the same seeded
 * shuffle, so it reproduces exactly, and storing an order per question would
 * triple the size of every attempt document for nothing.
 */
export function questionsForAttempt(quiz, attempt, { studentId } = {}) {
  const base = questionsOfAttempt(quiz, attempt)
  if (!quiz?.shuffle_options) return base
  const seed = seedFor({
    quizId: quiz?.id,
    studentId,
    attemptNumber: attempt?.attempt_number ?? 1,
  })
  return base.map((q) =>
    q.qtype === 'mcq' && (q.options ?? []).length
      ? { ...q, options: shuffleSeeded(q.options, seed ^ hashSeed(q.id)) }
      : q,
  )
}
