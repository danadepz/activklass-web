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

/* T-82, Option C (2026-09-26): a superadmin approves an Institution request
   before any money moves -- identity first, payment second. The school and
   its subscription exist and are real (an admin has been promoted, unlike a
   `pending`/`declined` school nobody is a member of yet) but carry no
   trial -- `approved_unpaid` is neither "off" (SCHOOL_OFF above) nor
   "working", so it gates to its own screen (/pay-to-activate) rather than
   /suspended, which would tell an approved admin to contact their school
   office about a suspension that never happened. */
export function schoolApprovedUnpaid(school, isSuperAdmin) {
  return !isSuperAdmin && school?.subscription_status === 'approved_unpaid'
}
