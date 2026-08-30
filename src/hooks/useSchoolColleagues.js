/**
 * The other teachers at the signed-in teacher's school.
 *
 * Owned by the logic lane (see OWNERSHIP.md). This replaced teacher groups
 * on 2026-08-30: the owner decided colleagues at one school are grouped by
 * being at that school -- no code, no request, no invite. The school is the
 * `teaching_school_id` a teacher declared at registration (a
 * `school_directory` id such as `ucb`; see lib/schoolDirectory.js), which is
 * affiliation only and never the billing `school_id`.
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

export const schoolColleaguesKey = (schoolId) => ['school-colleagues', schoolId]

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
  const { profile } = useAuth()
  const schoolId = profile?.teaching_school_id || ''
  const { data, isLoading, isError } = useQuery({
    queryKey: schoolColleaguesKey(schoolId),
    queryFn: async () => {
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('role', '==', 'teacher'),
        where('teaching_school_id', '==', schoolId),
      ))
      return pickColleagues(snap.docs.map((d) => ({ id: d.id, ...d.data() })), profile.id)
    },
    enabled: !!schoolId && !!profile?.id,
    staleTime: 5 * 60 * 1000,
  })
  return {
    schoolId,
    schoolName: profile?.teaching_school_name ?? '',
    colleagues: data ?? [],
    isLoading: !!schoolId && isLoading,
    isError,
  }
}
