/**
 * The Syllabus topic select in the quiz editor.
 *
 * A quiz's `topic_id` is the only link between it and a sub-module: the
 * Modules tab, Scaffold Topics and the student's review guide all find a
 * quiz's mastery through it. Until 2026-09-13 only the Generate dialog could
 * set it, so a hand-made quiz was Uncategorized for life and a generated one
 * could never be moved. The editor now offers the same choice, built from
 * the syllabi of the classes the quiz is assigned to -- the pure part lives
 * here so it can be tested without a render.
 */

/**
 * The options for the select: every sub-module of every assigned class's
 * syllabus, once each, labelled "Module · Sub-module" -- and prefixed with
 * the class section when the options come from more than one syllabus, so
 * two "Module 1 · Introduction" rows can be told apart.
 *
 * @param {string[]} classIds the quiz's assigned classes
 * @param {object[]} classes the teacher's classes (id, section)
 * @param {Record<string, {id: string|null, data: object|null}>} syllabusByClass
 *   each assigned class's resolved syllabus -- `id` is the syllabi/{id} id or
 *   null for the seed's per-class document (DATA-MODEL.md rule 3)
 * @returns {{ id: string, label: string, module_id: string|null, syllabus_id: string|null }[]}
 */
export function topicOptions(classIds, classes, syllabusByClass) {
  const sources = classIds
    .map((cid) => ({ clazz: classes.find((c) => c.id === cid), syl: syllabusByClass[cid] }))
    .filter((s) => s.syl?.data?.modules?.length)
  // The same syllabus serving several classes is one source, not several.
  const distinct = new Set(sources.map((s) => s.syl.id ?? `class:${s.clazz?.id}`))
  const prefix = distinct.size > 1
  const seen = new Set()
  const out = []
  for (const { clazz, syl } of sources) {
    for (const m of syl.data.modules ?? []) {
      for (const t of m.topics ?? []) {
        if (!t?.id || seen.has(t.id)) continue
        seen.add(t.id)
        const label = `${m.title ?? 'Module'} · ${t.title ?? 'Sub-module'}`
        out.push({
          id: t.id,
          label: prefix && clazz?.section ? `${clazz.section}: ${label}` : label,
          module_id: m.id ?? null,
          syllabus_id: syl.id ?? null,
        })
      }
    }
  }
  return out
}

/**
 * What a pick writes onto the quiz. Clearing the select unfiles the quiz
 * (`topic_id: null`, the state the bank shows as Uncategorized) and drops the
 * module and syllabus with it, since neither means anything without a topic.
 * A topic id that is not among the options -- the class it came from was
 * unticked -- is kept as it was rather than silently dropped.
 */
export function topicPatch(topicId, options, current = {}) {
  if (!topicId) return { topic_id: null, module_id: null, syllabus_id: null }
  const picked = options.find((o) => o.id === topicId)
  if (!picked) {
    return {
      topic_id: current.topic_id ?? null,
      module_id: current.module_id ?? null,
      syllabus_id: current.syllabus_id ?? null,
    }
  }
  return { topic_id: picked.id, module_id: picked.module_id, syllabus_id: picked.syllabus_id }
}
