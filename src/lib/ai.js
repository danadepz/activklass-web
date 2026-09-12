/**
 * Every AI call the web app makes, plus the prompt shaping around them.
 *
 * Owned by the AI lane (see OWNERSHIP.md). Pages import these functions and
 * render the result -- they should not build prompts or name endpoints
 * themselves, so tuning what we ask the model means editing this file only.
 *
 * Backed by Flask + Gemini, except /api/predict -- that one is a scikit-learn
 * Random Forest trained in-process on synthetic data, not a Gemini call, and
 * its output is a triage heuristic rather than a finding about a student.
 *
 * The backend also exposes /api/map_struggle, /api/remediate, /api/grade_essay
 * and /api/generate_scaffold; add wrappers here as the UI grows into them.
 */
import { api, ApiError } from './api'
import { validateModuleStructure, validateSyllabusStructure } from './aiDrafts'

/**
 * Teacher-readable text for the failures these endpoints actually return.
 *
 * The pages all render `err.message` straight into their error banner, so the
 * message thrown from here is the message a teacher reads. Anything not listed
 * falls through to the backend's own text, which is already written for
 * teachers in the validation and quota cases ("Pick a syllabus topic or
 * describe one", "Daily AI generation limit reached (20/day)").
 *
 * Deliberately NOT reassuring about server faults. A 500 here means generation
 * is genuinely down, and "something went wrong, try again" invites a teacher to
 * retry a thing that cannot work. Say it is a server problem and stop.
 */
const AI_ERROR_MESSAGES = {
  ai_not_configured:
    'AI generation is switched off: the server has no Gemini API key set. ' +
    'This needs an administrator, not a retry.',
  ai_failed:
    'The AI service did not return a usable draft. Trying again usually works; ' +
    'if it keeps failing the model may be overloaded.',
  unauthorized: 'Your session expired. Sign in again, then retry.',
  no_session: 'Your session expired. Sign in again, then retry.',
  forbidden: 'This account does not have teacher access to AI generation.',
}

/**
 * Map a thrown error to something worth showing a teacher.
 *
 * `action` is a gerund phrase naming the attempt ("generating the quiz") so the
 * banner says which step failed -- pages call several endpoints and a bare
 * "server error" does not tell anyone where to look.
 */
function aiErrorMessage(err, action) {
  // Not an ApiError means fetch itself failed -- backend down, proxy
  // misconfigured, connection dropped. There is no response to read a code from.
  if (!(err instanceof ApiError)) {
    return `Could not reach the server while ${action}. Check that the backend is running, then retry.`
  }

  const known = AI_ERROR_MESSAGES[err.code]
  if (known) return known

  // Quota and validation already carry teacher-facing text from the backend.
  if (err.code === 'ai_quota' || err.code === 'validation' || err.code === 'bad_request') {
    return err.message
  }

  // Anything else at 5xx is an unhandled server fault. The endpoint never got
  // far enough to name a cause, so `message` is a bare status line like
  // "INTERNAL SERVER ERROR" -- useless in a banner. Name the step instead and
  // keep the status, which is the one detail worth relaying to whoever debugs it.
  if (err.status >= 500) {
    return `The server failed while ${action} (HTTP ${err.status}). This is a backend fault, not a problem with what you entered.`
  }

  return err.message
}

/**
 * Run an AI request, translating failures on the way out.
 *
 * The original error is kept as `cause`, and `code`/`status` are copied onto
 * the rethrown error so callers can still branch on them -- rewriting the
 * message must not cost anyone the ability to tell quota from outage.
 */
async function withAIErrors(action, run) {
  try {
    return await run()
  } catch (err) {
    const message = aiErrorMessage(err, action)
    if (message === err.message) throw err
    const wrapped = new Error(message, { cause: err })
    wrapped.code = err.code
    wrapped.status = err.status
    throw wrapped
  }
}

/**
 * The question types the endpoint understands, and the difficulties it accepts.
 *
 * Exported so a page can build its controls from this list instead of
 * hardcoding a parallel copy that drifts. The backend silently discards types
 * it does not recognise and falls back to ["mcq", "true_false"] when nothing
 * valid is left, which is worse than it sounds: the extra true_false items
 * then fail draft validation as unrequested and the whole generation can come
 * back empty. Better to reject a bad value here than debug that.
 */
export const QUIZ_TYPES = ['mcq', 'true_false', 'matching', 'short_answer', 'essay']
export const QUIZ_DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed']
export const QUIZ_QUESTION_LIMITS = { min: 1, max: 30 }

/**
 * Build the `notes` string the backend appends to its prompt.
 *
 * Two kinds of text end up here and they are not equivalent: class metadata we
 * derived (subject, Bloom's level) and whatever the teacher typed. The backend
 * labels the whole string "Additional instructions from the teacher", so
 * merging them tells the model a subject code was a teacher's instruction, and
 * leaves it no way to resolve a conflict -- a teacher asking for something
 * easier reads exactly like the Bloom's hint demanding analysis.
 *
 * So they are kept as separate lines with the precedence stated. Only stating
 * it when both are present; a lone context line needs no tie-breaker.
 */
function buildQuizNotes({ instructions, bloomsLevel, subject, subjectCode, targetLevel } = {}) {
  const context = [
    subject && `Subject: ${subject}.`,
    subjectCode && `Subject code: ${subjectCode}.`,
    targetLevel && `Target level: ${targetLevel}.`,
    bloomsLevel && `Target cognitive level (Bloom's): ${bloomsLevel}.`,
  ]
    .filter(Boolean)
    .join(' ')

  const teacher = (instructions ?? '').trim()
  if (!teacher) return context
  if (!context) return teacher

  return [
    teacher,
    `Class context: ${context}`,
    "Where the teacher's instructions conflict with the class context, follow the instructions.",
  ].join('\n')
}

/**
 * Why a drafted question cannot be used, or null if it is fine.
 *
 * These are answerability checks, not quality ones -- we cannot tell whether a
 * distractor is plausible, but we can tell that an MCQ with no correct option
 * is unanswerable. Nothing downstream catches these: the pages POST only
 * id/title/class_ids to /api/quizzes and write the questions straight to
 * Firestore, so the backend's parse_questions validation never sees them.
 */
function questionProblem(q, allowedTypes) {
  if (!(q?.text ?? '').trim()) return 'empty question text'
  if (!allowedTypes.includes(q.type)) return `unrequested type "${q.type}"`

  switch (q.type) {
    case 'mcq': {
      const options = (q.options ?? []).map((o) => (o?.text ?? '').trim())
      if (options.length < 2) return `only ${options.length} option(s)`
      if (options.some((t) => !t)) return 'blank option text'
      // Zero correct answers marks every student wrong; two makes the "right"
      // answer arbitrary. Both look fine in a review screen.
      const correct = (q.options ?? []).filter((o) => o.correct === true).length
      if (correct !== 1) return `${correct} correct options, expected exactly 1`
      // Duplicated options are unanswerable even when exactly one is flagged.
      if (new Set(options.map((t) => t.toLowerCase())).size !== options.length) {
        return 'duplicate option text'
      }
      return null
    }
    case 'true_false':
      return typeof q.answer === 'boolean' ? null : 'missing true/false answer'
    case 'short_answer':
      return (q.accepted_answers ?? []).some((a) => (a ?? '').trim())
        ? null
        : 'no accepted answers'
    case 'matching': {
      const pairs = (q.pairs ?? []).filter(
        (pair) => (pair?.left ?? '').trim() && (pair?.right ?? '').trim(),
      )
      return pairs.length >= 2 ? null : `only ${pairs.length} complete pair(s)`
    }
    case 'essay':
      return (q.rubric ?? '').trim() ? null : 'missing rubric'
    default:
      return `unknown type "${q.type}"`
  }
}

/**
 * Drop unusable questions from a draft, keeping the rest.
 *
 * Dropping beats throwing: a single malformed item should not cost a teacher
 * the other 29 and the ~30s they waited for them. Throwing beats returning
 * nothing: a zero-question quiz would otherwise be created and navigated to.
 *
 * Note for future call sites: this validates every type the schema allows, and
 * `draftToQuestions` below now maps all five faithfully -- a page only needs to
 * ask for them via `types`.
 */
function validateQuizDraft(draft, allowedTypes, requestedCount, objectives = []) {
  if (!Array.isArray(draft?.questions)) {
    throw new Error('The AI returned a draft with no questions. Try generating again.')
  }

  const kept = []
  const dropped = []
  draft.questions.forEach((q, i) => {
    const problem = questionProblem(q, allowedTypes)
    if (problem) dropped.push(`Q${i + 1} (${problem})`)
    else kept.push(q)
  })

  if (!kept.length) {
    throw new Error(
      `The AI returned ${draft.questions.length} question(s), none of them usable. ` +
        'Try generating again, or rephrase the topic.',
    )
  }

  const tagged = tagObjectives(kept, objectives)

  const warnings = []
  if (dropped.length) {
    warnings.push(`Dropped ${dropped.length} malformed question(s): ${dropped.join(', ')}`)
  }
  if (requestedCount && kept.length < requestedCount) {
    warnings.push(`Asked for ${requestedCount} questions, kept ${kept.length}.`)
  }
  const off = tagged.map((q, i) => (q.off_objective ? `Q${i + 1}` : null)).filter(Boolean)
  if (off.length) {
    warnings.push(`${off.length} question(s) not tied to a listed objective: ${off.join(', ')}.`)
  }
  // The pages have no warning surface yet, so this is the only place a teacher
  // or dev can currently see that a draft was trimmed.
  if (warnings.length) console.warn('[ai] quiz draft:', warnings.join(' '))

  return { ...draft, questions: tagged, warnings }
}

/** Case, spacing and trailing punctuation are not differences in an objective. */
const normaliseObjective = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s.;:!]+$/, '')
    .trim()

/**
 * Mark every drafted question with the objective it claims to assess, and flag
 * the ones that name none of the objectives the model was given.
 *
 * This is the review screen's only evidence that a question stayed inside
 * what the module taught. The prompt tells the model to assess only the listed
 * objectives and to copy the one each question assesses word for word; a
 * question that copies none of them is the one most likely to be testing
 * something the students never studied, and the editor shows it as such.
 *
 * Nothing is dropped here. A flagged question may be perfectly fair -- the
 * teacher taught it under a different wording -- so the flag asks for a look,
 * and the teacher decides. When no objectives were supplied there is nothing to
 * check against, so nothing is flagged: the warning for that case belongs
 * before generation, on the topic picker, not after.
 */
export function tagObjectives(questions, objectives = []) {
  const listed = objectives.map(normaliseObjective).filter(Boolean)
  return (questions ?? []).map((q) => {
    const objective = String(q?.objective ?? '').trim()
    if (!listed.length) return { ...q, objective, off_objective: false }
    const key = normaliseObjective(objective)
    const matched = !!key && listed.some((o) => o === key || o.includes(key) || key.includes(o))
    return { ...q, objective, off_objective: !matched }
  })
}

/**
 * Draft a quiz from a topic, returning only questions that survive validation.
 *
 * `instructions` is the teacher's own free text; `hints` is class metadata we
 * derived for them. Both reach the model, kept apart -- see buildQuizNotes.
 *
 * `objectives` are the topic's learning objectives. The backend used to look
 * these up from a Postgres Topic row; that was the endpoint's last database
 * dependency, so they now travel with the request. Pages already hold them --
 * the topic picker is built from the Firestore syllabus doc, which carries
 * `objectives` on every topic.
 *
 * Only 'mcq' is requested by default, which is the conservative choice rather
 * than a limitation: `draftToQuestions` maps every type the schema allows, so a
 * page can pass any subset of QUIZ_TYPES. The teacher quizzes page exposes this
 * as a picker; the remediation scaffolds page still asks for plain MCQ drill.
 *
 * Invalid `types` / `difficulty` throw rather than being quietly corrected --
 * the backend's own coercion turns a typo into a differently-shaped quiz with
 * no error, which is the harder bug to find.
 */
export async function generateQuiz({
  topic,
  topicId = null,
  numQuestions,
  types = ['mcq'],
  difficulty = 'mixed',
  instructions,
  objectives = [],
  hints,
}) {
  const badTypes = types.filter((t) => !QUIZ_TYPES.includes(t))
  if (badTypes.length) {
    throw new Error(`Unknown question type(s): ${badTypes.join(', ')}`)
  }
  if (!types.length) throw new Error('Pick at least one question type')
  if (!QUIZ_DIFFICULTIES.includes(difficulty)) {
    throw new Error(`Unknown difficulty: ${difficulty}`)
  }

  // The endpoint clamps to this range silently. Clamping here too means the
  // shortfall warning below compares against what was actually asked for.
  const { min, max } = QUIZ_QUESTION_LIMITS
  const count = Math.min(Math.max(Math.round(Number(numQuestions)) || min, min), max)

  const cleanObjectives = objectives
    .filter((o) => typeof o === 'string')
    .map((o) => o.trim())
    .filter(Boolean)

  const { draft } = await withAIErrors('generating the quiz', () =>
    api('/api/quizzes/generate', {
      method: 'POST',
      body: {
        topic,
        topic_id: topicId,
        objectives: cleanObjectives,
        num_questions: count,
        types,
        difficulty,
        notes: buildQuizNotes({ ...hints, instructions }),
      },
    }),
  )
  return validateQuizDraft(draft, types, count, cleanObjectives)
}

const newQuestionId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

/**
 * Turn a validated draft into questions the quiz builder and player understand.
 *
 * The pages used to each keep their own `aiToQuestions`, and both hardcoded
 * `qtype: 'mcq'` while reading only `options`. Everything else the schema can
 * return -- `answer`, `accepted_answers`, `pairs`, `rubric` -- was dropped on
 * the floor, so a true/false item arrived in the builder as a multiple choice
 * question with zero options: unanswerable, and impossible to grade. The AI's
 * own `points` was discarded too, flattening a 5-point essay to 1.
 *
 * Shapes below mirror the builder's toEditable/toPayload and lib/quizGrading
 * exactly. They are the same field names the mobile player reads, so a quiz
 * generated here grades identically on both clients.
 */
export function draftToQuestions(draft) {
  return (draft?.questions ?? []).map((q) => {
    const base = {
      id: newQuestionId(),
      qtype: q.type,
      text: q.text ?? '',
      // The schema asks for 1-5 by difficulty. Falling back to 1 keeps a
      // missing or unparseable value from making the question worthless.
      points: Number(q.points) > 0 ? Number(q.points) : 1,
      ai_generated: true,
      // The objective the model says this assesses, and whether that was one
      // of the objectives it was given (tagObjectives). The editor shows a
      // flagged question so the teacher checks it was actually taught.
      objective: String(q.objective ?? '').trim(),
      off_objective: q.off_objective === true,
    }
    switch (q.type) {
      case 'mcq':
        return {
          ...base,
          options: (q.options ?? []).map((o) => ({
            id: newQuestionId(),
            text: o.text ?? '',
            is_correct: !!o.correct,
          })),
        }
      case 'true_false':
        return { ...base, answer_key: { value: !!q.answer } }
      case 'short_answer':
        return {
          ...base,
          answer_key: {
            answers: (q.accepted_answers ?? [])
              .map((a) => String(a ?? '').trim())
              .filter(Boolean),
          },
        }
      case 'matching':
        return {
          ...base,
          answer_key: {
            pairs: (q.pairs ?? [])
              .filter((pair) => (pair?.left ?? '').trim() && (pair?.right ?? '').trim())
              .map((pair) => ({ left: pair.left, right: pair.right })),
          },
        }
      case 'essay':
        return { ...base, rubric: q.rubric ?? '' }
      default:
        // validateQuizDraft drops unknown types before this runs; coercing to
        // an empty MCQ rather than throwing keeps one odd item from costing
        // the teacher the whole generated set.
        return { ...base, qtype: 'mcq', options: [] }
    }
  })
}

/**
 * DepEd MELC competency code grammar, e.g. M10AL-Ia-1.
 *
 *   M       subject letters      M, S, EN, AP, ESP, MAPEH ...
 *   10      grade, or a range    "11/12" in EN11/12RWS-IIIbf-3
 *   AL      content domain       AL algebra, GE geometry, LT living things ...
 *   I       quarter              I, II, III, IV
 *   a       week(s)              a | a-b | bf | c-d -- official docs use both
 *   1       competency number
 *
 * Built from codes the model actually returns, not from a spec: S9LT-Ia-b-26,
 * EN11/12RWS-IIIbf-3 and M10GE-IIc-d-1 are all real shapes, and a stricter
 * pattern would reject them as fabrications.
 */
const MELC_CODE = /^([A-Z]+)(\d+(?:\/\d+)?)([A-Z]+)-(IV|I{1,3})([a-z]+(?:-[a-z]+)*)-(\d+)$/

/**
 * What we can and cannot say about a generated code.
 *
 * `unverified` is named for what it is. No MELC dataset exists in this project,
 * so nothing here confirms a code is real -- only that it is shaped like one
 * and does not contradict the requested grade. A page must not render it as
 * "DepEd verified", which is exactly what the old bare string invited.
 */
export const MELC_STATUS = {
  absent: 'absent',
  unverified: 'unverified',
  gradeMismatch: 'grade_mismatch',
  malformed: 'malformed',
}

/** Wording a page can show directly, so nobody has to invent a label. */
export const MELC_STATUS_LABEL = {
  absent: 'No MELC code',
  unverified: 'Format valid — not checked against the official MELC list',
  grade_mismatch: 'Competency belongs to a different grade level',
  malformed: 'Not a MELC code — cleared',
}

/** Grades named in a free-text level ("Grade 10", "Grades 11-12"). */
function gradesIn(gradeLevel) {
  return String(gradeLevel ?? '').match(/\d+/g) ?? []
}

function checkMelcCode(code, gradeLevel) {
  const raw = (code ?? '').trim()
  if (!raw) return { status: MELC_STATUS.absent }

  const parts = MELC_CODE.exec(raw)
  if (!parts) return { status: MELC_STATUS.malformed }

  const codeGrades = parts[2].split('/')
  const wanted = gradesIn(gradeLevel)
  // No requested grade to compare against is not a mismatch -- college
  // syllabi have no grade level at all.
  if (wanted.length && !wanted.some((g) => codeGrades.includes(g))) {
    return { status: MELC_STATUS.gradeMismatch, code: raw, codeGrades, wanted }
  }
  return { status: MELC_STATUS.unverified, code: raw }
}

/**
 * Tag every topic with a MELC status and collect what a teacher should see
 * before publishing.
 *
 * Malformed codes are cleared: a string that cannot be a MELC code is a
 * fabrication, and showing it next to real ones lends it their credibility.
 *
 * Grade mismatches are kept. The model returns Grade 9 codes for a Grade 10
 * request on quadratics and variation -- and those genuinely ARE Grade 9
 * competencies, so the code may be right and the grade tag merely surprising.
 * A Grade 10 class reviewing Grade 9 material is normal. Deleting a real code
 * to tidy the output would be the worse error, so this flags and keeps.
 */
function annotateTopics(topics, gradeLevel, where, warnings, seen) {
  return (topics ?? []).map((topic, i) => {
    const label = `${where}${topic?.title || `topic ${i + 1}`}`
    const result = checkMelcCode(topic?.melc_code, gradeLevel)
    const out = { ...topic, melc_status: result.status }

    if (result.status === MELC_STATUS.malformed) {
      warnings.push(`${label}: "${topic.melc_code}" is not a MELC code — cleared.`)
      out.melc_code = ''
    } else if (result.code !== undefined) {
      // Store the trimmed form. Stray whitespace passes the pattern but would
      // make "M10AL-Ia-1 " and "M10AL-Ia-1" different keys everywhere after.
      out.melc_code = result.code
    }
    if (result.status === MELC_STATUS.gradeMismatch) {
      warnings.push(
        `${label}: ${topic.melc_code} is a Grade ${result.codeGrades.join('/')} competency, ` +
          `but this is Grade ${result.wanted.join('/')}. Correct if unintended.`,
      )
    }

    // Two topics claiming one competency means at least one is mislabelled.
    if (out.melc_code) {
      const prior = seen.get(out.melc_code)
      if (prior) warnings.push(`${out.melc_code} is on both "${prior}" and "${label}".`)
      else seen.set(out.melc_code, label)
    }
    return out
  })
}

/** Annotate a whole syllabus draft. Shape is preserved; codes are never invented. */
function validateSyllabusDraft(draft, gradeLevel) {
  const warnings = []
  const seen = new Map()
  // Structure first (see aiDrafts.js). A topic dropped for having no title must
  // not still claim its MELC code in `seen` -- that would raise a duplicate-code
  // warning against the kept topic that legitimately holds it.
  const { modules: shaped, warnings: structureWarnings } = validateSyllabusStructure(draft)
  const modules = shaped.map((mod, i) => ({
    ...mod,
    topics: annotateTopics(
      mod.topics,
      gradeLevel,
      `${mod.title || `Module ${i + 1}`} / `,
      warnings,
      seen,
    ),
  }))
  if (structureWarnings.length) {
    console.warn('[ai] syllabus structure:', structureWarnings.join(' '))
  }
  if (warnings.length) console.warn('[ai] syllabus MELC codes:', warnings.join(' '))
  return { ...draft, modules, melcWarnings: warnings, structureWarnings }
}

/** Annotate a single generated module. */
function validateModuleDraft(draft, gradeLevel) {
  const warnings = []
  const seen = new Map()
  const { topics: shaped, warnings: structureWarnings } = validateModuleStructure(draft)
  const topics = annotateTopics(shaped, gradeLevel, '', warnings, seen)
  if (structureWarnings.length) {
    console.warn('[ai] module structure:', structureWarnings.join(' '))
  }
  if (warnings.length) console.warn('[ai] module MELC codes:', warnings.join(' '))
  return { ...draft, topics, melcWarnings: warnings, structureWarnings }
}

/**
 * Draft a syllabus. The backend aligns topics to DepEd MELCs (K-12) or CHED
 * CMO (college) based on the subject details given.
 *
 * Requires at least one of subjectCode / subjectDescription; the API rejects
 * the request otherwise.
 *
 * Every topic comes back with a `melc_status`, and the draft with
 * `melcWarnings`. Nothing here confirms a code exists -- see MELC_STATUS.
 */
export async function generateSyllabus({
  subjectCode = '',
  subjectDescription = '',
  gradeLevel,
  durationWeeks,
  notes,
}) {
  const { draft } = await withAIErrors('generating the syllabus', () =>
    api('/api/syllabus/generate', {
      method: 'POST',
      body: {
        subject_code: subjectCode.trim(),
        subject_description: subjectDescription.trim(),
        grade_level: gradeLevel?.trim() || undefined,
        duration_weeks: durationWeeks,
        notes: notes?.trim() || undefined,
      },
    }),
  )
  return validateSyllabusDraft(draft, gradeLevel)
}

/**
 * Draft ONE module to insert into a syllabus that already exists.
 *
 * Deliberately not "generate the syllabus again with an extra unit": that would
 * replace modules the teacher has edited and change the topic ids that quizzes
 * and remediation point at. Adding a unit must not cost a term's work.
 *
 * `existingTitles` is what turns this from a guess into an insertion — without
 * the surrounding modules the model re-covers ground the class already did.
 */
export async function generateModule({
  brief,
  subjectCode = '',
  subjectDescription = '',
  gradeLevel,
  existingTitles = [],
  topicCount = 4,
}) {
  const { draft } = await withAIErrors('generating the module', () =>
    api('/api/syllabus/generate-module', {
      method: 'POST',
      body: {
        module_brief: brief,
        subject_code: subjectCode,
        subject_description: subjectDescription,
        grade_level: gradeLevel?.trim() || undefined,
        existing_titles: existingTitles,
        topic_count: topicCount,
      },
    }),
  )
  return validateModuleDraft(draft, gradeLevel)
}

/**
 * The six indicators /api/predict scores, mapped to the fitted forest's global
 * feature importances. Weights are measured from the model, not guessed, and
 * sum to 1.0 -- they let us report how much of the signal a caller supplied.
 *
 * Three levels and three trends. The trends are the half that makes this an
 * early warning rather than a second opinion: a student on 80 who is sliding
 * and a student on 80 who is steady look identical on the levels alone, and
 * the model separates them 0.99 vs 0.10. Together the trends are 53% of the
 * basis, so a caller that supplies only levels is under half-covered however
 * complete its gradebook looks.
 *
 * tests/test_risk_model.py in the backend asserts these stay in step with the
 * fitted forest, so a retrain that shifts them fails the backend suite rather
 * than silently skewing the coverage figure a teacher reads.
 */
const RISK_FEATURE_WEIGHTS = {
  prior_average_grade: 0.26,
  attendance_trend: 0.21,
  missing_work_rate: 0.17,
  quiz_trend: 0.15,
  quiz_average: 0.13,
  attendance_rate: 0.08,
}

/** The leading half -- what lets the model fire before the gradebook does. */
export const RISK_LEADING_FEATURES = ['attendance_trend', 'quiz_trend', 'missing_work_rate']

/**
 * Plain-language reasons, keyed by the `code` the backend attaches to each
 * out-of-band indicator it was actually given.
 *
 * Two audiences, two wordings, one source. "Needs attention" is not something
 * a student can act on; "your attendance has fallen" is, and it names the one
 * thing that would move the projection back. `student` is second person and
 * avoids verdict language; `teacher` is terse enough to scan down a list.
 */
export const RISK_SIGNAL_COPY = {
  attendance_falling: {
    student: (v) => `your attendance has dropped about ${Math.round(Math.abs(v) * 100)} points recently`,
    teacher: (v) => `attendance down ~${Math.round(Math.abs(v) * 100)} pts`,
  },
  work_not_submitted: {
    // "work", not "assessments": this pools assessments a teacher marked
    // missing with quizzes that closed unattempted, and a student who skipped
    // three quizzes should not be told their assessments are the problem.
    student: (v) => `you have not turned in ${Math.round(v * 100)}% of your work so far`,
    teacher: (v) => `${Math.round(v * 100)}% of work not submitted`,
  },
  quiz_scores_falling: {
    student: (v) => `your recent quiz scores are about ${Math.round(Math.abs(v))} points below your earlier ones`,
    teacher: (v) => `quiz scores down ~${Math.round(Math.abs(v))} pts`,
  },
  attendance_low: {
    student: (v) => `your attendance is at ${Math.round(v * 100)}%`,
    teacher: (v) => `attendance ${Math.round(v * 100)}%`,
  },
  quiz_average_low: {
    student: (v) => `your quiz average is ${Math.round(v)}%`,
    teacher: (v) => `quiz average ${Math.round(v)}%`,
  },
  grade_low: {
    student: (v) => `your current grade is ${Math.round(v)}`,
    teacher: (v) => `grade ${Math.round(v)}`,
  },
}

/** Signals rendered for one audience, worst-first as the backend ranked them. */
export function riskReasons(signals, audience = 'teacher') {
  return (signals ?? [])
    .map((s) => RISK_SIGNAL_COPY[s.code]?.[audience]?.(s.value))
    .filter(Boolean)
}

const RISK_FEATURES = Object.keys(RISK_FEATURE_WEIGHTS)

/**
 * The app stores attendance as a percentage -- student/index.jsx renders
 * `{attendance_rate}% present` -- but the model wants 0.0-1.0. Passing 45 for
 * 45% scores *safer* than sending nothing at all, so normalise here rather
 * than trusting every call site to remember.
 *
 * Anything above 1 is unambiguously a percentage. Exactly 1 is read as 100%,
 * not 1%, which is the only reading that occurs in practice.
 */
function toAttendanceRate(value) {
  // Guarded before Number(), which turns both null and '' into 0 -- a silent
  // "zero attendance" is the worst possible reading of "we didn't measure it".
  if (value == null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n > 1 ? n / 100 : n
}

/**
 * camelCase indicators -> the snake_case vector the endpoint expects, keeping
 * only what was actually measured.
 *
 * Omitting a field is not neutral: the backend fills gaps with healthy cohort
 * defaults (attendance 0.92, prior grade 82, quiz 80), so a student we know
 * only a failing grade for still comes back `on_track`. We report what we sent
 * so callers can qualify the result instead of presenting a guess as a finding.
 */
function buildRiskIndicators({
  attendanceRate,
  priorAverageGrade,
  quizAverage,
  attendanceTrend,
  quizTrend,
  missingWorkRate,
} = {}) {
  const candidates = {
    attendance_rate: attendanceRate == null ? undefined : toAttendanceRate(attendanceRate),
    prior_average_grade: priorAverageGrade,
    quiz_average: quizAverage,
    // Trends are already differences, so they are NOT run through
    // toAttendanceRate -- a -0.26 drop is not a percentage to normalise, and
    // halving it would understate exactly the signal we added it for.
    attendance_trend: attendanceTrend,
    quiz_trend: quizTrend,
    missing_work_rate: missingWorkRate,
  }

  const indicators = {}
  for (const feature of RISK_FEATURES) {
    const value = candidates[feature]
    if (value == null || value === '') continue
    const n = Number(value)
    if (Number.isFinite(n)) indicators[feature] = n
  }
  return indicators
}

/**
 * Reshape one raw /api/predict result, annotating it with how much of the
 * model's basis we supplied.
 *
 * `top_factors` is deliberately renamed. The backend derives it from
 * `model.feature_importances_`, which is global to the forest -- every student
 * gets the same three factors in the same order regardless of their input. It
 * reads like a per-student explanation and is not one, so it is exposed under
 * a name that cannot be mistaken for one.
 */
function shapeRiskResult(raw, indicators) {
  const supplied = Object.keys(indicators)
  const coverage = supplied.reduce((sum, f) => sum + RISK_FEATURE_WEIGHTS[f], 0)
  return {
    flag: raw.risk_flag,
    atRisk: raw.risk_flag === 'high_risk',
    probability: raw.risk_probability,
    supplied,
    missing: RISK_FEATURES.filter((f) => !supplied.includes(f)),
    coverage: Math.round(coverage * 100) / 100,
    globalFactors: raw.top_factors ?? [],
    // Per-student, unlike globalFactors: which of THIS student's indicators are
    // out of band. This is what the two panels name to a reader; the
    // probability alone is not something anyone can act on.
    signals: raw.signals ?? [],
    // What the model learned from, carried through from the backend rather
    // than restated here. When the synthetic dataset is replaced with real
    // labelled exports, `real_data` flips server-side and every view stops
    // disclaiming without anyone editing copy in three files.
    training: raw.training ?? null,
  }
}

/**
 * Score one student's remediation risk with the Random Forest behind
 * /api/predict.
 *
 * Pass whatever indicators exist; unmeasured ones are left out rather than
 * faked. Check `coverage` before rendering a flag -- at 0 the answer is the
 * backend's defaults with no student in it, and even a confident-looking
 * probability means nothing.
 *
 * The model is currently trained on a synthetic dataset generated at startup
 * (no labelled Activklass history exists yet), so treat output as a triage
 * heuristic, not evidence about a specific student.
 */
export async function predictRisk(indicators) {
  const built = buildRiskIndicators(indicators)
  const raw = await withAIErrors('scoring student risk', () =>
    api('/api/predict', {
      method: 'POST',
      body: { indicators: built },
    }),
  )
  return shapeRiskResult(raw, built)
}

/**
 * Batch form: one request for a whole roster instead of N.
 *
 * Takes `[{ studentId, indicators }]` and returns the same shape as
 * predictRisk plus `studentId`, in the order given.
 */
export async function predictRiskBatch(students = []) {
  if (!students.length) return []

  const built = students.map((s) => buildRiskIndicators(s.indicators ?? s))
  const { results } = await withAIErrors('scoring student risk', () =>
    api('/api/predict', {
      method: 'POST',
      body: {
        students: students.map((s, i) => ({
          student_id: s.studentId ?? s.student_id ?? null,
          indicators: built[i],
        })),
      },
    }),
  )

  return (results ?? []).map((raw, i) => ({
    studentId: raw.student_id ?? students[i]?.studentId ?? null,
    ...shapeRiskResult(raw, built[i]),
  }))
}
