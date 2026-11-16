/** Build a same-origin return target from the originating class and plan ids. */
export function remediationReturnPath(origin) {
  if (!/^[A-Za-z0-9_-]+$/.test(origin?.classId ?? '') || !/^[A-Za-z0-9_-]+$/.test(origin?.planId ?? '')) return null
  return `/teacher/classes/${encodeURIComponent(origin.classId)}/scaffolds?editPlan=${encodeURIComponent(origin.planId)}`
}
