/* A school whose subscription was switched off takes every member with it
   (owner's decision, 2026-08-30): the admin console and each teacher and
   student carrying its school_id. The status is read from schools/{id},
   where the super admin API mirrors it, because members may not read the
   subscription itself. Only these two statuses gate; a trial that has run
   out is recorded but not enforced yet. Superadmins are never gated -- they
   are the ones who switch it back on. */
const SCHOOL_OFF = new Set(['suspended', 'cancelled'])
export function schoolSuspended(school, isSuperAdmin) {
  return !isSuperAdmin && SCHOOL_OFF.has(school?.subscription_status)
}
