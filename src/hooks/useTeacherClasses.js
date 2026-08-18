/**
 * The signed-in teacher's classes, straight from Firestore.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Eight pages ran this identical
 * query inline; they now share one definition, so changing what a "class list"
 * means -- ordering, archived filtering, extra fields -- is one edit.
 *
 * Invalidate with the ['fs-classes'] prefix, which the existing
 * queryClient.invalidateQueries({ queryKey: ['fs-classes'] }) calls already do.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'

export const teacherClassesKey = (teacherId) => ['fs-classes', teacherId]

export async function fetchTeacherClasses(teacherId) {
  const snap = await getDocs(
    query(collection(db, 'classes'), where('teacher_id', '==', teacherId)),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function useTeacherClasses(options = {}) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: teacherClassesKey(profile?.id),
    queryFn: () => fetchTeacherClasses(profile.id),
    enabled: !!profile?.id,
    ...options,
  })
}
