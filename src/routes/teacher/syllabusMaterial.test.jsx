/**
 * T-249 (andecobs-332): a generated syllabus gave an outline and no learning
 * material. Owner's choice (2026-11-14): a summary and key terms per sub-module,
 * generated in the same call; no model-made links; full lesson text deferred.
 *
 * Pinned: what the teacher gets from Generate -- the material arrives as a note
 * on each sub-module in the unsaved draft -- and that the note's text is there to
 * read and edit in the draft editor before Save, which is the only write.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {},
  api: vi.fn(async () => ({
    draft: {
      title: 'Grade 10 Math',
      description: '',
      curriculum_standard: 'DepEd',
      modules: [{
        title: 'Polynomials',
        description: '',
        topics: [{
          title: 'Polynomial division',
          melc_code: '',
          objectives: ['Divide polynomials using long division'],
          summary: 'Students divide one polynomial by another and check the remainder.',
          key_terms: [{ term: 'Dividend', definition: 'The polynomial being divided.' }],
        }],
      }],
    },
  })),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), deleteDoc: vi.fn(), doc: vi.fn(), getDocs: vi.fn(), query: vi.fn(),
  where: vi.fn(), writeBatch: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
}))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [] }) }))
vi.mock('@/hooks/useSyllabi', () => ({ useSyllabi: () => ({ data: [], isLoading: false }) }))
vi.mock('./GenerateModuleModal', () => ({ default: () => null }))
vi.mock('@/lib/attachments', () => ({ uploadAttachment: vi.fn(), isSafeLink: () => true }))
vi.mock('@/components/AttachmentField', () => ({ default: () => null }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/Skeleton', () => ({ SkeletonList: () => null }))
vi.mock('@/components/ui/useAsyncAction', () => ({ useAsyncAction: (fn) => [fn, false] }))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))

import { generateSyllabus, withTopicMaterial, TOPIC_MATERIAL_TITLE } from '@/lib/ai'
import { setDoc } from 'firebase/firestore'
import { toDraftState, TopicResourceEditor } from './syllabus.jsx'

async function generatedTopic() {
  const draft = await generateSyllabus({ subjectCode: 'MATH10', gradeLevel: 'Grade 10', durationWeeks: 10 })
  return toDraftState(draft, 'ai_generated').modules[0].topics[0]
}

describe('T-249 — a generated syllabus carries learning material', () => {
  it('puts the summary and key terms on the sub-module as a note, in the unsaved draft only', async () => {
    const topic = await generatedTopic()
    const note = topic.resources.find((r) => r.title === TOPIC_MATERIAL_TITLE)
    expect(note?.resource_type).toBe('rich_text')
    expect(note.content_markdown).toContain('Students divide one polynomial by another')
    expect(note.content_markdown).toContain('• Dividend — The polynomial being divided.')
    expect(note.url).toBe('')
    // Generating writes nothing: students read saved syllabi only, and Save is the one write.
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('shows the teacher the note text in an editable box before Save', async () => {
    const topic = await generatedTopic()
    const html = renderToStaticMarkup(
      <TopicResourceEditor syllabusId="s1" topic={topic} onChange={() => {}} />,
    )
    const box = html.match(/<textarea[^>]*aria-label="Edit Summary and key terms"[^>]*>([\s\S]*?)<\/textarea>/)
    expect(box, 'no editable box for the generated note').not.toBeNull()
    expect(box[1]).toContain('Students divide one polynomial by another')
  })

  it('leaves a topic without material untouched, and never invents a link', () => {
    const plain = { title: 'T', objectives: ['x'], summary: '  ', key_terms: [] }
    expect(withTopicMaterial(plain)).toEqual({ title: 'T', objectives: ['x'] })
    const withTerms = withTopicMaterial({ title: 'T', key_terms: [{ term: 'Root', definition: '' }] })
    expect(withTerms.resources.map((r) => r.resource_type)).toEqual(['rich_text'])
    expect(withTerms.resources[0].content_markdown).toBe('Key terms:\n• Root')
  })
})
