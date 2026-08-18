/**
 * Every AI call the web app makes, plus the prompt shaping around them.
 *
 * Owned by the AI lane (see OWNERSHIP.md). Pages import these functions and
 * render the result -- they should not build prompts or name endpoints
 * themselves, so tuning what we ask the model means editing this file only.
 *
 * Backed by Flask + Gemini. The backend also exposes /api/predict,
 * /api/map_struggle, /api/remediate, /api/grade_essay and
 * /api/generate_scaffold; add wrappers here as the UI grows into them.
 */
import { api } from './api'

/**
 * Free-text hints the quiz prompt builder appends verbatim. Bloom's level and
 * subject are not first-class fields on the endpoint, so they ride along here.
 */
function buildQuizNotes({ bloomsLevel, subject, subjectCode, targetLevel } = {}) {
  return [
    bloomsLevel && `Target cognitive level (Bloom's): ${bloomsLevel}.`,
    subject && `Subject: ${subject}.`,
    subjectCode && `Subject code: ${subjectCode}.`,
    targetLevel && `Target level: ${targetLevel}.`,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Draft a quiz from a topic. Returns the raw AI draft -- callers map it into
 * their own question shape.
 *
 * Only 'mcq' is requested by default: every current call site renders
 * multiple-choice items and would drop anything else on the floor.
 */
export async function generateQuiz({
  topic,
  topicId = null,
  numQuestions,
  types = ['mcq'],
  difficulty = 'mixed',
  hints,
}) {
  const { draft } = await api('/api/quizzes/generate', {
    method: 'POST',
    body: {
      topic,
      topic_id: topicId,
      num_questions: Number(numQuestions),
      types,
      difficulty,
      notes: buildQuizNotes(hints),
    },
  })
  return draft
}

/**
 * Draft a syllabus. The backend aligns topics to DepEd MELCs (K-12) or CHED
 * CMO (college) based on the subject details given.
 *
 * Requires at least one of subjectCode / subjectDescription; the API rejects
 * the request otherwise.
 */
export async function generateSyllabus({
  subjectCode = '',
  subjectDescription = '',
  gradeLevel,
  durationWeeks,
  notes,
}) {
  const { draft } = await api('/api/syllabus/generate', {
    method: 'POST',
    body: {
      subject_code: subjectCode.trim(),
      subject_description: subjectDescription.trim(),
      grade_level: gradeLevel?.trim() || undefined,
      duration_weeks: durationWeeks,
      notes: notes?.trim() || undefined,
    },
  })
  return draft
}
