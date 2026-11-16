/** The admin Users screen destination after student account creation. */
export function studentAccountsDestination(result) {
  const created = result?.role === 'student'
    ? [result.user].filter(Boolean)
    : result?.role === 'bulk-student'
      ? result.created ?? []
      : []
  if (!created.length) return null
  const one = created.length === 1 ? created[0] : null
  const search = one
    ? [one.login_id, one.student_number, one.lrn, one.first_name, one.last_name].find(Boolean) ?? ''
    : ''
  return { roleFilter: 'student', search }
}
