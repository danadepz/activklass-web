/**
 * The other teachers at the signed-in teacher's school.
 *
 * Owned by the logic lane (see OWNERSHIP.md). This replaced teacher groups
 * on 2026-08-30: the owner decided colleagues at one school are grouped by
 * being at that school -- no code, no request, no invite.
 *
 * Two different fields say "same school", and which one applies depends on
 * how the account was made. A teacher issued by a school carries `school_id`
 * -- the billing link, written by the admin console and the provisioning
 * endpoint. A teacher who registered alone carries `teaching_school_id`, the
 * `school_directory` id they picked (see lib/schoolDirectory.js), which is
 * affiliation only and never billing.
 *
 * It shipped reading `teaching_school_id` alone, and nothing but
 * registration and the picker below ever writes that field, so the card came
 * out backwards: empty for the teachers who genuinely are a school together,
 * populated for solo teachers who share a school name and may not know each
 * other. `school_id` wins where present, because it is the stronger claim --
 * someone put them on that school's roll -- and it is the only one an
 * admin-issued teacher has.
 *
 * A plain Firestore query: the rules let any teacher read teacher profiles,
 * and two equality filters need no composite index. Only teachers who have
 * passed the identity review (or were issued by a school, and so never had
 * one) are listed -- the school is self-declared at sign-up, so the ID check
 * is what keeps a stranger claiming "UCB" out of UCB's list. Deactivated
 * accounts are dropped too.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'

export const schoolColleaguesKey = (field, schoolId) => ['school-colleagues', field, schoolId]

/**
 * Pure: which field groups this teacher, and under what name.
 *
 * `field` is the users field to match on, `id` its value, and `issued` says
 * the grouping came from the school that pays. The name follows the same
 * split -- the school document for an issued teacher, the affiliation label
 * they typed for everyone else -- so the heading never reads a name from one
 * school beside a list drawn from another. An empty `id` means there is
 * nothing to group by, and the card offers the directory picker instead.
 */
export function colleagueGroup(profile, school) {
  if (profile?.school_id) {
    return {
      field: 'school_id',
      id: profile.school_id,
      schoolName: school?.name ?? '',
      issued: true,
    }
  }
  return {
    field: 'teaching_school_id',
    id: profile?.teaching_school_id ?? '',
    schoolName: profile?.teaching_school_name ?? '',
    issued: false,
  }
}

/** Pure: which fetched profiles count as colleagues of `selfId`, A→Z by last name. */
export function pickColleagues(users, selfId) {
  return users
    .filter((u) => u.id !== selfId)
    .filter((u) => !u.verification_status || u.verification_status === 'approved')
    .filter((u) => u.status !== 'inactive' && !u.disabled)
    .sort((a, b) =>
      String(a.last_name ?? '').localeCompare(String(b.last_name ?? ''))
      || String(a.first_name ?? '').localeCompare(String(b.first_name ?? '')))
}

export function useSchoolColleagues() {
  const { profile, school } = useAuth()
  const { field, id: schoolId, schoolName, issued } = colleagueGroup(profile, school)
  const { data, isLoading, isError } = useQuery({
    queryKey: schoolColleaguesKey(field, schoolId),
    queryFn: async () => {
      // The role filter stays: firestore.rules allows the read because the
      // document is a teacher's, and the engine can only prove that from a
      // query that says so. Two equality filters, so no composite index.
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('role', '==', 'teacher'),
        where(field, '==', schoolId),
      ))
      return pickColleagues(snap.docs.map((d) => ({ id: d.id, ...d.data() })), profile.id)
    },
    enabled: !!schoolId && !!profile?.id,
    staleTime: 5 * 60 * 1000,
  })
  return {
    schoolId,
    schoolName,
    issued,
    colleagues: data ?? [],
    isLoading: !!schoolId && isLoading,
    isError,
  }
}
