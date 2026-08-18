/**
 * The signed-in teacher's syllabi, from Firestore.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Three pages listed syllabi via
 * GET /api/syllabus, which reads the Flask/SQLite copy, while every other read
 * of a syllabus came from Firestore -- so the list and the thing it linked to
 * were different stores kept in sync by hand.
 *
 * The Firestore document is a superset of the API payload (same tree, plus
 * teacher_id and updated_at), so nothing is lost by reading it here.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'

export const syllabiKey = (teacherId) => ['fs-syllabi', teacherId]

export async function fetchSyllabi(teacherId) {
  const snap = await getDocs(
    query(collection(db, 'syllabi'), where('teacher_id', '==', teacherId)),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function useSyllabi(options = {}) {
  const { profile } = useAuth()
  const teacherId = profile?.id
  return useQuery({
    ...options,
    queryKey: syllabiKey(teacherId),
    queryFn: () => fetchSyllabi(teacherId),
    enabled: !!teacherId && (options.enabled ?? true),
  })
}
