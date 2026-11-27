import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ reads: [], writes: [], updates: [], nextId: 'banked-1' }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'teacher-1' } }) }))
vi.mock('firebase/firestore', () => ({
  addDoc: async (ref, payload) => { state.writes.push({ ref, payload }); return { id: state.nextId } },
  collection: (_db, name) => ({ collection: name }),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  doc: (_db, name, id) => ({ collection: name, id }),
  getDocs: async () => ({ docs: state.reads.map((data, index) => ({ id: `bank-${index}`, data: () => data })) }),
  query: (...args) => args,
  serverTimestamp: () => 'SERVER_TS',
  updateDoc: async (ref, payload) => { state.updates.push({ ref, payload }) },
  where: (...args) => args,
  writeBatch: () => ({
    set: (ref, payload) => state.writes.push({ ref, payload }),
    commit: async () => {},
  }),
}))

const { bankQuestions, fetchBankedQuestions, saveBankedQuestion } = await import('./useBankedQuestions')

beforeEach(() => {
  state.reads = []
  state.writes = []
  state.updates = []
})

describe('question-bank metadata persistence', () => {
  const metadata = {
    qtype: 'essay', text: 'Evaluate two arguments', points: 4,
    blooms_level: 'evaluate', topic_id: 'topic-1', topic_label: 'Module · Topic',
    objective: 'Justify a conclusion',
  }

  it('retrieves stored question metadata without stripping optional legacy-compatible fields', async () => {
    state.reads = [{ ...metadata, teacher_id: 'teacher-1' }]
    expect(await fetchBankedQuestions('teacher-1')).toEqual([{ id: 'bank-0', ...metadata, teacher_id: 'teacher-1' }])
  })

  it('persists metadata on create and edit', async () => {
    await saveBankedQuestion({ teacherId: 'teacher-1', payload: metadata })
    expect(state.writes[0].payload).toMatchObject({ ...metadata, teacher_id: 'teacher-1' })
    await saveBankedQuestion({ teacherId: 'teacher-1', id: 'bank-0', payload: metadata })
    expect(state.updates[0].payload).toMatchObject(metadata)
  })

  it('preserves metadata when copying a question into the bank from a quiz', async () => {
    await bankQuestions({ teacherId: 'teacher-1', questions: [{ id: 'q1', ...metadata }], origin: 'manual' })
    expect(state.writes[0].payload).toMatchObject({
      blooms_level: 'evaluate', topic_id: 'topic-1', topic_label: 'Module · Topic',
      objective: 'Justify a conclusion', source_quiz_id: null,
    })
    expect(state.writes[0].payload.id).toBeUndefined()
  })
})
