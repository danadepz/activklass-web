/**
 * The signed-in teacher's question bank, from Firestore.
 *
 * Owned by the logic lane (see OWNERSHIP.md). The bank was the last part of
 * the quiz domain still on Flask/Postgres after quizzes and syllabi moved --
 * it had no Firestore counterpart, so it was left behind rather than
 * dual-written.
 *
 * Filtering by folder is client-side. The Flask version took syllabus_id /
 * topic_id as query parameters and refetched on every folder click; doing the
 * same in Firestore would need a composite index per filter shape for a
 * collection that holds a few hundred documents per teacher at most. One
 * fetch, filtered in memory, is fewer reads and makes switching folders
 * instant. `filterBankedQuestions` is the shared predicate.
 *
 * The API used to join syllabus_title / topic_title onto each row. Nothing
 * rendered them, so they are not denormalised here -- add them at write time
 * if a caller ever needs them, since Firestore cannot join.
 */
import { useQuery } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { splitAgainstBank, toBankPayload } from '@/lib/questionBank'
import { useAuth } from '@/context/useAuth'

const COLLECTION = 'banked_questions'

export const bankedQuestionsKey = (teacherId) => ['fs-banked-questions', teacherId]

export async function fetchBankedQuestions(teacherId) {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('teacher_id', '==', teacherId)),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function useBankedQuestions(options = {}) {
  const { profile } = useAuth()
  const teacherId = profile?.id
  return useQuery({
    ...options,
    queryKey: bankedQuestionsKey(teacherId),
    queryFn: () => fetchBankedQuestions(teacherId),
    enabled: !!teacherId && (options.enabled ?? true),
  })
}

/**
 * Folder filter, matching what the Flask query parameters used to select.
 *
 * `node` is the selected tree node: {type: 'uncategorized'} for questions
 * filed under no syllabus, {type: 'topic', topicId} or {type: 'syllabus',
 * syllabusId}. A null node selects everything.
 */
export function filterBankedQuestions(questions, node) {
  if (!node) return questions
  if (node.type === 'uncategorized') return questions.filter((q) => !q.syllabus_id)
  if (node.type === 'topic') return questions.filter((q) => q.topic_id === node.topicId)
  if (node.type === 'syllabus') return questions.filter((q) => q.syllabus_id === node.syllabusId)
  return questions
}

/** Create or update one banked question. Returns its id. */
export async function saveBankedQuestion({ teacherId, id, payload }) {
  if (id) {
    // teacher_id is deliberately not rewritten: ownership is set once, and
    // the Firestore rule checks it against the existing document.
    await updateDoc(doc(db, COLLECTION, id), { ...payload, updated_at: serverTimestamp() })
    return id
  }
  const ref = await addDoc(collection(db, COLLECTION), {
    ...payload,
    teacher_id: teacherId,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  })
  return ref.id
}

export async function deleteBankedQuestion(id) {
  await deleteDoc(doc(db, COLLECTION, id))
}

/**
 * Bank a whole set of questions at once, skipping anything already there.
 *
 * This is what makes the bank fill itself: a generated quiz is 5-20 questions
 * and nobody clicks 💾 twenty times. One `writeBatch` instead of N `addDoc`
 * calls -- twenty round trips would have the teacher watching a spinner after
 * the generation they already waited ~30s for, and a failure halfway would
 * leave the bank half-written with no way to tell which half.
 *
 * The bank is re-fetched rather than taking the React Query cache: the cache
 * may be minutes old, or never populated at all on a page that has not opened
 * the bank tab, and either one turns "skip duplicates" into "write duplicates".
 * It is one query against the teacher's own documents, on an action that just
 * made a network call to an LLM.
 *
 * Returns the same counts `describeBankResult` formats.
 */
export async function bankQuestions({ teacherId, questions, topicId, syllabusId, origin, sourceQuizId }) {
  const existing = await fetchBankedQuestions(teacherId)
  const { fresh, duplicates, unusable } = splitAgainstBank(questions, existing)

  // A batch is capped at 500 writes. A quiz cannot reach that today, but the
  // chunking costs three lines and the failure it prevents is silent.
  for (let i = 0; i < fresh.length; i += 400) {
    const batch = writeBatch(db)
    for (const { question } of fresh.slice(i, i + 400)) {
      batch.set(doc(collection(db, COLLECTION)), {
        ...toBankPayload(question, { topicId, syllabusId, origin, sourceQuizId }),
        teacher_id: teacherId,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      })
    }
    await batch.commit()
  }

  return { saved: fresh.length, duplicates: duplicates.length, unusable: unusable.length }
}
