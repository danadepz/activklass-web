/**
 * The signed-in teacher's quizzes, from Firestore.
 *
 * Owned by the logic lane (see OWNERSHIP.md). The quizzes page listed these
 * via GET /api/quizzes -- the Flask/SQLite copy -- while the questions, status
 * and class links it displayed all lived in Firestore. Two stores, written in
 * sequence with no transaction, so a failed second write left them disagreeing.
 *
 * Firestore is the system of record: mobile talks to it directly and never
 * calls Flask, and student attempts are written there.
 */
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'

export const quizzesKey = (teacherId) => ['fs-quizzes', teacherId]

export async function fetchQuizzes(teacherId) {
  const snap = await getDocs(
    query(collection(db, 'quizzes'), where('teacher_id', '==', teacherId)),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function useQuizzes(options = {}) {
  const { profile } = useAuth()
  const teacherId = profile?.id
  return useQuery({
    ...options,
    queryKey: quizzesKey(teacherId),
    queryFn: () => fetchQuizzes(teacherId),
    enabled: !!teacherId && (options.enabled ?? true),
  })
}
