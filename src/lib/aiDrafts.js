/**
 * Structural validation for AI-generated syllabus and module drafts.
 *
 * Pure -- no I/O, no prompt text, no endpoint names -- so every rule here is
 * testable without spending Gemini quota. ai.js calls the two entry points from
 * validateSyllabusDraft and validateModuleDraft.
 *
 * Why this exists: checkMelcCode validates the competency code and nothing
 * else, so a topic with no title at all passed every check and became a blank
 * row in the syllabus tree -- unnameable, and inherited by any quiz generated
 * against it, since generateQuiz takes the title as its `topic` string.
 *
 * Deliberately knows nothing about MELC codes; annotateTopics in ai.js owns
 * those. The drop-vs-warn split follows validateQuizDraft: an item that cannot
 * be used is dropped so one bad topic does not cost a teacher the other twenty,
 * and anything a teacher can still fix by typing is kept with a warning.
 */

/** Stored form of a title: trimmed, but internal spacing left alone. */
function cleanTitle(value) {
  return String(value ?? '').trim()
}

/**
 * Comparison form of a title. Collapsed and lowercased, because "Quadratic
 * Equations" and "quadratic  equations" are the same row to a teacher looking
 * at the tree -- and the same topic to anyone picking one for a quiz.
 */
function titleKey(value) {
  return cleanTitle(value).replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Consumers read `learning_objectives ?? objectives` (the student class page,
 * remediation, and the syllabus editor all do), so clean whichever key the
 * draft actually carries. Writing the other one would leave the blank entries
 * on display and the cleaned copy unread.
 */
const OBJECTIVE_KEYS = ['learning_objectives', 'objectives']

function objectivesKey(topic) {
  return OBJECTIVE_KEYS.find((key) => topic?.[key] != null) ?? 'objectives'
}

/**
 * Normalise an objectives list to non-empty strings.
 *
 * A model that returns one objective as a bare string still meant one
 * objective, so that is wrapped rather than discarded. Objects and arrays are
 * dropped instead of stringified -- "[object Object]" is truthy, so coercing
 * would put that literal text on a teacher's screen as a learning objective.
 */
function cleanObjectives(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  return list
    .map((entry) => (entry != null && typeof entry === 'object' ? '' : String(entry ?? '').trim()))
    .filter(Boolean)
}

/**
 * Structural problem that makes a generated topic unusable, or null.
 *
 * Only the title qualifies today. A topic with a title but no objectives is
 * still a usable row -- a teacher can write the objectives -- so that is a
 * warning below, not a drop.
 */
export function topicProblem(topic) {
  if (!cleanTitle(topic?.title)) return 'empty title'
  return null
}

/**
 * Drop unusable topics, normalise the survivors, and append warnings.
 *
 * `where` prefixes every warning so a teacher knows which module to open.
 * Warnings are aggregated per list rather than emitted per topic: a draft where
 * the model skipped objectives entirely would otherwise produce one warning per
 * topic and bury the ones that matter.
 *
 * Duplicate titles are kept, not dropped. Both copies may carry real, distinct
 * content and distinct MELC codes, and deleting one to tidy the tree is the
 * worse error -- the same call annotateTopics makes for duplicated codes.
 */
export function pruneTopics(topics, where, warnings) {
  const kept = []
  const dropped = []
  const duplicates = []
  const withoutObjectives = []
  const seenTitles = new Map()

  const incoming = Array.isArray(topics) ? topics : []
  incoming.forEach((topic, i) => {
    const problem = topicProblem(topic)
    if (problem) {
      dropped.push(`topic ${i + 1} (${problem})`)
      return
    }

    const title = cleanTitle(topic.title)
    const key = objectivesKey(topic)
    const objectives = cleanObjectives(topic[key])
    if (!objectives.length) withoutObjectives.push(`"${title}"`)

    const prior = seenTitles.get(titleKey(title))
    if (prior) duplicates.push(`"${title}" (topics ${prior} and ${i + 1})`)
    else seenTitles.set(titleKey(title), i + 1)

    kept.push({ ...topic, title, [key]: objectives })
  })

  if (dropped.length) {
    warnings.push(
      `${where}dropped ${dropped.length} unusable topic(s): ${dropped.join(', ')}.`,
    )
  }
  if (duplicates.length) {
    warnings.push(
      `${where}duplicate topic title(s): ${duplicates.join(', ')}. ` +
        'Rename or merge before publishing.',
    )
  }
  if (withoutObjectives.length) {
    warnings.push(
      `${where}no learning objectives on ${withoutObjectives.join(', ')}. ` +
        'Quizzes generated from these get no objectives to work from.',
    )
  }
  return kept
}

/**
 * Prune every module's topics and report the empty ones.
 *
 * Modules are never dropped, only reported. That keeps the returned array index
 * aligned with the incoming one, which matters because ai.js labels modules by
 * position when it annotates MELC codes -- and an empty module is still a
 * heading a teacher may want to fill in rather than lose.
 */
export function pruneModules(modules, warnings) {
  const incoming = Array.isArray(modules) ? modules : []
  return incoming.map((mod, i) => {
    const title = cleanTitle(mod?.title)
    const label = title || `Module ${i + 1}`
    if (!title) warnings.push(`Module ${i + 1} has no title.`)

    const arrived = Array.isArray(mod?.topics) ? mod.topics.length : 0
    const topics = pruneTopics(mod?.topics, `${label}: `, warnings)
    if (!topics.length) {
      warnings.push(
        arrived
          ? `${label} has no usable topics left — all ${arrived} were dropped.`
          : `${label} has no topics.`,
      )
    }
    return { ...mod, title, topics }
  })
}

/**
 * Structural pass over a whole syllabus draft → { modules, warnings }.
 *
 * Throws when nothing survives, for the reason validateQuizDraft does: an empty
 * draft would otherwise be handed to the editor as a tree with no rows, which
 * reads as a bug in the page rather than as a generation that came back empty.
 */
export function validateSyllabusStructure(draft) {
  if (!Array.isArray(draft?.modules)) {
    throw new Error('The AI returned a syllabus with no modules. Try generating again.')
  }
  const warnings = []
  const modules = pruneModules(draft.modules, warnings)
  if (!modules.some((mod) => mod.topics.length)) {
    throw new Error(
      `The AI returned ${draft.modules.length} module(s), none with a usable topic. ` +
        'Try generating again, or give a fuller subject description.',
    )
  }
  return { modules, warnings }
}

/** Structural pass over a single generated module → { topics, warnings }. */
export function validateModuleStructure(draft) {
  if (!Array.isArray(draft?.topics)) {
    throw new Error('The AI returned a module with no topics. Try generating again.')
  }
  const warnings = []
  const topics = pruneTopics(draft.topics, '', warnings)
  if (!topics.length) {
    throw new Error(
      `The AI returned ${draft.topics.length} topic(s), none of them usable. ` +
        'Try generating again, or say more about what the module should cover.',
    )
  }
  return { topics, warnings }
}
