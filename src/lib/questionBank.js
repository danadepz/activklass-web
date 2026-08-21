/**
 * Fingerprinting and de-duplication for the teacher's question bank.
 *
 * Pure -- no Firestore, no React -- so the rules that decide "this item is
 * already in the bank" are testable without a project. The writes themselves
 * live in hooks/useBankedQuestions.js.
 *
 * Why this exists: until now the bank only filled when a teacher clicked 💾 on
 * one question at a time, so in practice it stayed empty and `Import from
 * Bank` had nothing to offer. Banking every generated question fixes that, but
 * only if duplicates are stopped at the door -- generate three quizzes on the
 * same topic and the model returns near-identical stems each time. Without a
 * fingerprint, auto-banking makes the bank *worse* the more it is used.
 */

/**
 * Comparison form of a question stem.
 *
 * Case, punctuation and spacing all vary between generations of the same item
 * ("What is the slope?" vs "What is the slope"), and none of that difference
 * is one a teacher would call a second question. Digits are kept: "solve for
 * x when x + 2 = 5" and "... = 7" are genuinely different items.
 */
function normaliseText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Identity of a banked question: its type plus its normalised stem.
 *
 * Options are deliberately excluded. The same stem with reshuffled or reworded
 * choices is the same item to a teacher, and including the choices would let
 * every regeneration slip past as "new". The type is included because "The
 * mitochondrion is the powerhouse of the cell" is a real true/false item and a
 * useless multiple-choice one -- both can earn a place in the bank.
 *
 * Returns '' for a question with no usable stem, which callers treat as
 * un-bankable rather than as a duplicate of every other blank.
 */
export function questionFingerprint(question) {
  const text = normaliseText(question?.text)
  if (!text) return ''
  return `${question?.qtype ?? 'mcq'}::${text}`
}

/**
 * Split incoming questions into what should be written and what already exists.
 *
 * `existing` is the teacher's whole bank as fetched -- fingerprints are
 * computed from `text`/`qtype`, not read from a stored field, so questions
 * banked before this module existed still de-duplicate correctly and no
 * backfill is needed.
 *
 * The batch is also de-duplicated against itself: a single draft can come back
 * with the same stem twice, and writing both would seed the bank with the very
 * duplicates this is meant to prevent.
 *
 * Blank-stemmed questions are reported separately from duplicates. They are
 * both "not written", but only one of them is a teacher's own item coming back
 * around, and the toast should not call an empty question a duplicate.
 */
export function splitAgainstBank(questions, existing = []) {
  const seen = new Set(
    existing.map((q) => questionFingerprint(q)).filter(Boolean),
  )
  const fresh = []
  const duplicates = []
  const unusable = []

  for (const question of questions ?? []) {
    const fingerprint = questionFingerprint(question)
    if (!fingerprint) {
      unusable.push(question)
      continue
    }
    if (seen.has(fingerprint)) {
      duplicates.push(question)
      continue
    }
    seen.add(fingerprint)
    fresh.push({ question, fingerprint })
  }

  return { fresh, duplicates, unusable }
}

/**
 * Editor/quiz-document question → the shape `banked_questions` stores.
 *
 * `id` is dropped: inside a quiz it identifies one instance of the item, and
 * carrying it into the bank would make two quizzes share an id after an
 * import. The document id is the banked item's identity.
 *
 * `origin` and `source_quiz_id` are provenance. They cost one field each and
 * they are what lets the bank browser ever say "AI-generated, from your
 * Chapter 3 quiz" instead of presenting hand-written and generated items as
 * the same thing.
 */
export function toBankPayload(question, { topicId = null, syllabusId = null, origin = 'manual', sourceQuizId = null } = {}) {
  const rest = { ...(question ?? {}) }
  delete rest.id
  delete rest._key
  return {
    ...rest,
    topic_id: topicId || null,
    syllabus_id: syllabusId || null,
    origin,
    source_quiz_id: sourceQuizId || null,
    text_hash: questionFingerprint(question),
  }
}

/**
 * One sentence describing what a bank write did, for the toast.
 *
 * Silence on the skipped items would be the wrong call: a teacher who
 * generates a second quiz on the same topic and sees "0 saved" with no reason
 * reads it as a broken button, not as the bank working.
 */
export function describeBankResult({ saved = 0, duplicates = 0, unusable = 0 } = {}) {
  const parts = []
  if (saved) parts.push(`${saved} question${saved === 1 ? '' : 's'} saved to your Quiz Bank`)
  if (duplicates) parts.push(`${duplicates} already in the bank`)
  if (unusable) parts.push(`${unusable} skipped (no question text)`)
  if (!parts.length) return 'Nothing to save to the Quiz Bank.'
  return `${parts.join(' · ')}.`
}
