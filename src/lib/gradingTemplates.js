/**
 * Named, reusable grading configurations (Phase 2 §3).
 *
 * A template holds a *configuration*, never a class. Applying one is two
 * explicit steps the teacher takes: load it into the Grade Config form, then
 * press Save & Sync — the existing path, with its existing confirmation that
 * names the affected classes and warns that recorded grades are recomputed.
 *
 * That split is the whole design, and it is what gives §3 the property it asks
 * for: because a class stores its own copy of the configuration at Save & Sync
 * (`gradebooks/{classId}`), **editing a template can never reach back and
 * change a class that was configured from it earlier.** There is no live link
 * to break, and no silent recalculation to be surprised by.
 *
 * Everything here goes through Flask. `grading_templates` is closed to clients
 * in firestore.rules on purpose (see the comment there): the endpoints read
 * `teacher_id` and `school_id` from the verified token, so a client cannot
 * write into another teacher's list or another school's shared pool.
 */
import { api } from '@/lib/api'

export const TEMPLATE_SCOPES = [
  { value: 'private', label: 'Only me', hint: 'Just your own list.' },
  { value: 'school', label: 'My school', hint: 'Teachers at your school can use and copy it, but not edit it.' },
]

/** Own templates plus any shared across the teacher's school. */
export async function listTemplates() {
  const res = await api('/api/grading-templates')
  return { templates: res?.templates ?? [], available: res?.available !== false }
}

/**
 * The configuration half of a template, built from the Grade Config form.
 *
 * Component and period ids are carried through verbatim. That matters beyond
 * tidiness: an assessment points at a component id, so re-saving a class from
 * the same template keeps the scores already recorded against those columns
 * attached to them instead of orphaning them.
 */
export function templateFromSetup({
  name,
  description = '',
  scope = 'private',
  gradingMode,
  passingPercent,
  scaleDirection,
  structure,
  labWeight,
  periods,
  components,
  archivedLabComponents,
}) {
  const body = {
    name,
    description,
    scope,
    grading_mode: gradingMode,
    grading_structure: structure,
    periods,
    components,
  }
  if (structure === 'lecture_lab') body.lab_weight_percent = Number(labWeight)
  if (passingPercent !== undefined && passingPercent !== '') {
    body.passing_percent = Number(passingPercent)
  }
  if (scaleDirection) body.point_scale_direction = scaleDirection
  if (archivedLabComponents?.length) body.archived_lab_components = archivedLabComponents
  return body
}

export const createTemplate = (body) =>
  api('/api/grading-templates', { method: 'POST', body })

export const updateTemplate = (id, body) =>
  api(`/api/grading-templates/${id}`, { method: 'PUT', body })

export const duplicateTemplate = (id, name) =>
  api(`/api/grading-templates/${id}/duplicate`, { method: 'POST', body: name ? { name } : {} })

export const deleteTemplate = (id) =>
  api(`/api/grading-templates/${id}`, { method: 'DELETE' })

/** "3 periods · 5 components · Lecture with Laboratory" for a template card. */
export function describeTemplate(t) {
  const parts = [
    `${t.periods?.length ?? 0} period${t.periods?.length === 1 ? '' : 's'}`,
    `${t.components?.length ?? 0} component${t.components?.length === 1 ? '' : 's'}`,
  ]
  parts.push(t.grading_structure === 'lecture_lab' ? 'Lecture with Laboratory' : 'Lecture only')
  return parts.join(' · ')
}

/** "2 classes use it" — counted from the gradebooks the teacher already loaded. */
export function countClassesUsing(template, gradebooks) {
  if (!template || !gradebooks?.length) return 0
  const ids = new Set((template.components ?? []).map((c) => c.id).filter(Boolean))
  if (!ids.size) return 0
  return gradebooks.filter((gb) => {
    const theirs = (gb?.components ?? []).map((c) => c.id)
    // "Uses it" means every component the template defines is present on the
    // class, by id -- a weaker match would count any class that happens to
    // share one component name with it.
    return theirs.length > 0 && [...ids].every((id) => theirs.includes(id))
  }).length
}

/** A saved template, back into the shape the Grade Config editors hold. */
export function setupFromTemplate(t) {
  const rows = (list) =>
    (list ?? []).map((r) => ({
      id: r.id ?? null,
      name: r.name ?? '',
      weight_percent: String(r.weight_percent ?? ''),
      ...(r.track ? { track: r.track } : {}),
      ...(r.required ? { required: true } : {}),
    }))
  return {
    grading_mode: t.grading_mode ?? 'deped_k12',
    grading_structure: t.grading_structure ?? 'lecture_only',
    lab_weight_percent: t.lab_weight_percent,
    passing_percent: t.passing_percent,
    point_scale_direction: t.point_scale_direction,
    periods: rows(t.periods),
    components: rows(t.components),
    archived_lab_components: rows(t.archived_lab_components),
  }
}
