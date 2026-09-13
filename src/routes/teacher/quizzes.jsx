import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { draftToQuestions, generateQuiz, QUIZ_TYPES } from '@/lib/ai'
import {
  bankQuestions,
  deleteBankedQuestion,
  filterBankedQuestions,
  saveBankedQuestion,
  useBankedQuestions,
} from '@/hooks/useBankedQuestions'
import { describeBankResult } from '@/lib/questionBank'
import { LIFECYCLE_TABS, lifecycleOf } from '@/lib/quizAttempts'
import { describeWindow, fromQuiz } from '@/lib/deliverables'
import { useAuth } from '@/context/useAuth'
import { ArrowRight, Plus, Sparkles, Trash, Edit } from '@/components/icons'
import { navy, navyDeep, ink, gold, goldDeep, muted, faint, green, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import { useQuizzes } from '@/hooks/useQuizzes'
import { useSyllabi } from '@/hooks/useSyllabi'
import { confirmDialog } from '@/components/ui/dialogs'
import { toast } from '@/components/ui/toast'
import { SkeletonList } from '@/components/ui/Skeleton'
import { useAsyncAction } from '@/components/ui/useAsyncAction'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'
import { useMySubscription } from '@/hooks/useMySubscription'
import { PaidPlanHint } from '@/components/SubscriptionBadge'

const STATUS_PILL = {
  draft: { label: 'Draft', color: muted, bg: 'rgba(14,42,92,0.06)', border: 'rgba(14,42,92,0.15)' },
  published: { label: 'Published', color: green, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.4)' },
  closed: { label: 'Closed', color: goldDeep, bg: 'rgba(245,197,24,0.18)', border: 'rgba(245,197,24,0.5)' },
}
/* Lifecycle, not status. `status` alone put a quiz that opens next Monday and
   one that is open right now in the same bucket, which is the distinction a
   teacher on a Monday morning actually needs. LIFECYCLE_TABS derives it from
   opens_at / closes_at / status in lib/quizAttempts.js, so the student player
   and this list agree on what "open" means. */
const FILTERS = ['all', ...LIFECYCLE_TABS.map((t) => t.id)]
const FILTER_LABELS = {
  all: 'All',
  ...Object.fromEntries(LIFECYCLE_TABS.map((t) => [t.id, t.label])),
}
const FILTER_HINTS = Object.fromEntries(LIFECYCLE_TABS.map((t) => [t.id, t.hint]))

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: ink, marginBottom: 7 }
const fieldStyle = {
  width: '100%', padding: '12px 14px', fontSize: 14, fontFamily: sans, color: ink,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10,
}
const btnModalGhost = {
  padding: '12px 20px', fontSize: 14, fontWeight: 600, fontFamily: sans, color: '#3A4A6B',
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer',
}
const btnModalPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 9, padding: '12px 20px', fontSize: 14,
  fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none',
  borderRadius: 10, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}`,
}

function GoldArrow() {
  return (
    <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy }}>
      <ArrowRight className="h-3 w-3" />
    </span>
  )
}

function AlertBox({ children }) {
  return (
    <div role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>
      {children}
    </div>
  )
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

function totalPoints(questions) {
  return (questions ?? []).reduce((sum, q) => sum + (Number(q.points) || 0), 0)
}

function blankQuiz({ classIds, teacherId, title, generatedBy = 'manual', questions = [], extra = {} }) {
  return {
    class_ids: classIds,
    teacher_id: teacherId,
    title,
    status: 'draft',
    instructions: '',
    time_limit_minutes: null,
    attempts_allowed: 1,
    shuffle_questions: false,
    prevent_backtracking: false,
    opens_at: null,
    closes_at: null,
    assigned_to: 'all',
    generated_by: generatedBy,
    questions,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    ...extra,
  }
}

export function GenerateQuizModal({ classes, onClose, initialClassId = '', initialTopicId = '' }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Generate a quiz with AI', closeOnBackdrop: false })
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { locks } = useMySubscription()
  const openedWithClassId = initialClassId || classes[0]?.id || ''
  const openedWithForm = {
    topic_id: initialTopicId,
    topic: '',
    count: 10,
    blooms_level: 'apply',
    types: ['mcq'],
    // On by default: the bank exists to be reused, and a teacher who has to
    // opt in every time ends up with the empty bank we started with. It is
    // still a checkbox rather than automatic, because banking writes to a
    // list the teacher owns and a silent write is the wrong surprise.
    save_to_bank: true,
  }
  const [selectedClassId, setSelectedClassId] = useState(openedWithClassId)
  const [form, setForm] = useState(openedWithForm)
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)
  // Clear puts the dialog back to how it opened -- including a class or topic
  // Scaffold Topics pre-picked, which the teacher did not enter. Same control
  // as the Generate Syllabus dialog; disabled until something has changed.
  const isUntouched =
    selectedClassId === openedWithClassId &&
    Object.keys(openedWithForm).every((k) => String(form[k]) === String(openedWithForm[k]))
  function clearForm() {
    setSelectedClassId(openedWithClassId)
    setForm(openedWithForm)
    setError(null)
  }
  const selectStyle = { ...fieldStyle, cursor: 'pointer' }
  const BLOOMS_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
  const COUNT_OPTIONS = [5, 10, 15, 20]
  // Labelled for teachers; the keys are what /api/quizzes/generate accepts.
  const TYPE_LABELS = {
    mcq: 'Multiple choice',
    true_false: 'True / False',
    short_answer: 'Short answer',
    matching: 'Matching',
    essay: 'Essay',
  }
  const toggleType = (t) =>
    setForm((f) => {
      const next = f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t]
      // generateQuiz throws on an empty list, and an empty list would make the
      // backend silently fall back to ['mcq', 'true_false'] anyway.
      return next.length ? { ...f, types: next } : f
    })

  const { data: selectedClassMeta } = useQuery({
    queryKey: ['fs-class-meta-gen', selectedClassId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'classes', selectedClassId))
      return snap.exists() ? snap.data() : null
    },
    enabled: !!selectedClassId,
  })

  // Load syllabus for the selected class to list topics. A syllabus lives in
  // two places (DATA-MODEL.md, rule 3): `syllabi/{syllabus_id}` first, then
  // the seed's `classes/{id}/syllabus/current` -- the same order the Scaffold
  // Topics page reads, so a quiz made here lands under a topic that page
  // shows. Reading only the first left a seeded class with an empty dropdown
  // and every quiz it generated unlinked from any topic.
  const { data: syllabus, isFetched: syllabusFetched } = useQuery({
    queryKey: ['fs-syllabus-gen', selectedClassId, selectedClassMeta?.syllabus_id],
    queryFn: async () => {
      if (selectedClassMeta?.syllabus_id) {
        const snap = await getDoc(doc(db, 'syllabi', selectedClassMeta.syllabus_id))
        if (snap.exists()) return snap.data()
      }
      const cur = await getDoc(doc(db, 'classes', selectedClassId, 'syllabus', 'current'))
      return cur.exists() ? cur.data() : null
    },
    enabled: !!selectedClassId && !!selectedClassMeta,
  })

  const topics = []
  if (syllabus?.modules) {
    syllabus.modules.forEach((m) => {
      if (m.topics) {
        m.topics.forEach((t) => {
          // Objectives travel with the request: they are the fence the model is
          // told to stay inside, and the reference the review screen flags
          // drifted questions against. The syllabus page writes
          // learning_objectives; older documents carry objectives.
          const objectives = (t.learning_objectives ?? t.objectives ?? [])
            .filter((o) => typeof o === 'string' && o.trim())
          topics.push({ id: t.id, label: `${m.title} · ${t.title}`, title: t.title, module_id: m.id, objectives })
        })
      }
    })
  }

  const pickedTopic = topics.find((t) => t.id === form.topic_id)
  // A topic that arrived on the URL (the class page's "+ Add -> Quiz") may
  // not be in the syllabus of the class picked here -- the same syllabus can
  // serve several classes, and a seeded class keeps its own copy. Say so
  // rather than silently showing the first option, and let the description
  // field back in so the teacher is not stuck.
  const topicMissing = !!form.topic_id && syllabusFetched && !pickedTopic

  async function generate(e) {
    e.preventDefault()
    const picked = pickedTopic
    const topicText = (picked?.title || form.topic).trim()
    if (!topicText) {
      setError('Pick a syllabus topic or describe one')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const quiz = await generateQuiz({
        topic: topicText,
        topicId: picked?.id ?? null,
        objectives: picked?.objectives ?? [],
        numQuestions: form.count,
        types: form.types,
        hints: {
          bloomsLevel: form.blooms_level,
          subject: selectedClassMeta?.subject,
          subjectCode: selectedClassMeta?.subject_code,
        },
      })

      const quizId = newId()
      const questions = draftToQuestions(quiz)
      const payload = blankQuiz({
        classIds: selectedClassId ? [selectedClassId] : [],
        teacherId: profile.id,
        title: quiz.title || `Quiz: ${topicText}`,
        generatedBy: 'ai_generated',
        questions,
        extra: {
          topic_id: picked?.id ?? null,
          module_id: picked?.module_id || null,
          // Carried so the quiz editor can file its own 💾 saves under the
          // right syllabus folder; only this dialog knows which syllabus the
          // class is on.
          syllabus_id: selectedClassMeta?.syllabus_id || null,
          ai_source: quiz.source || null,
        },
      })

      await setDoc(doc(db, 'quizzes', quizId), {
        ...payload,
        id: quizId,
        updated_at: serverTimestamp(),
      })

      // After the quiz doc, never before: the quiz is what the teacher asked
      // for, and a bank write that fails must not cost them the generation.
      if (form.save_to_bank && !locks.quizBank) {
        try {
          const result = await bankQuestions({
            teacherId: profile.id,
            questions,
            topicId: picked?.id ?? null,
            syllabusId: selectedClassMeta?.syllabus_id || null,
            origin: 'ai_generated',
            sourceQuizId: quizId,
          })
          toast.success(describeBankResult(result))
        } catch (err) {
          toast.error(`Quiz created, but the Quiz Bank save failed: ${err.message}`)
        }
      }

      navigate(`/teacher/quizzes/${quizId}`)
    } catch (err) {
      setError(err.message)
      setGenerating(false)
    }
  }

  return (
    <div {...overlayProps} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <form {...panelProps} onSubmit={generate} style={{ margin: 'auto', width: '100%', maxWidth: 1024, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: navy, color: gold, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>Generate Quiz with AI</h2>
        </div>
        <div style={{ padding: '24px 28px', overflowY: 'auto' }} className="flex flex-col gap-4">
          <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.55, margin: 0 }}>
            Builds a draft quiz from a topic. You review every question and answer key in the
            editor before anything reaches students.
          </p>
          {/* The guide a teacher asked for (T-59): what each field changes, in the
              order the form asks for it. A native <details>, open, so a first
              generation sees it and a repeat user can fold it; no component --
              the Generate Syllabus dialog carries its own copy of the block. */}
          <details open style={{ background: 'rgba(14,42,92,0.04)', border: '1px solid rgba(14,42,92,0.08)', borderRadius: 10, padding: '10px 14px' }}>
            <summary style={{ fontSize: 13, fontWeight: 600, color: navy, cursor: 'pointer', userSelect: 'none' }}>
              How to get a good draft
            </summary>
            <ol style={{ listStyle: 'decimal', margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, color: muted, lineHeight: 1.55, display: 'grid', gap: 4 }}>
              <li>Pick the class first — its syllabus topics fill the list below.</li>
              <li>Pick a syllabus topic rather than typing one: the questions stay inside that topic's learning objectives, and the editor flags any that stray.</li>
              <li>Choose how many questions, the thinking level, and the question types. Essays are marked by you.</li>
              <li>Generate draft opens the quiz in the editor. Check each question and its key, then publish.</li>
            </ol>
          </details>
          {error && <AlertBox>{error}</AlertBox>}

          <div>
            <label style={labelStyle}>Target Class Context</label>
            <select className="ak-input" value={selectedClassId} onChange={(e) => { setSelectedClassId(e.target.value); setForm(f => ({ ...f, topic_id: f.topic_id === initialTopicId ? f.topic_id : '' })) }} style={selectStyle}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.section} ({c.subject})</option>
              ))}
            </select>
          </div>

          {topics.length > 0 ? (
            <div>
              <label style={labelStyle}>Syllabus topic</label>
              <select className="ak-input" value={form.topic_id} onChange={(e) => setForm((f) => ({ ...f, topic_id: e.target.value }))} style={selectStyle}>
                <option value="">— Describe a topic instead —</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              {/* The highest-drift case: with no objectives the model has only a
                  title to go on, and fills the gap with its own idea of the
                  subject -- which may not be what was taught. Said before
                  generating, because after it the flag has nothing to check. */}
              {topicMissing && (
                <p role="status" style={{ fontSize: 12, color: goldDeep, margin: '8px 0 0', lineHeight: 1.5 }}>
                  The sub-module you came from is not in this class's syllabus. Pick the class it
                  belongs to, or describe the topic below.
                </p>
              )}
              {pickedTopic?.objectives.length === 0 && (
                <p role="status" style={{ fontSize: 12, color: goldDeep, margin: '8px 0 0', lineHeight: 1.5 }}>
                  This topic has no learning objectives written, so the AI only has its title to go on
                  and may test things you did not teach. Add objectives on the Syllabus page first, or
                  review the draft closely.
                </p>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: faint, margin: 0 }}>Tip: build a syllabus first and you can target its topics here.</p>
          )}
          {(!form.topic_id || topicMissing) && (
            <div>
              <label style={labelStyle}>Topic Description</label>
              <input className="ak-input" required={!form.topic_id} placeholder="e.g. Arithmetic sequences" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} style={fieldStyle} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label style={labelStyle}># Questions</label>
              <select className="ak-input" value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))} style={selectStyle}>
                {COUNT_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Thinking level (Bloom's)</label>
              <select className="ak-input capitalize" value={form.blooms_level} onChange={(e) => setForm((f) => ({ ...f, blooms_level: e.target.value }))} style={selectStyle}>
                {BLOOMS_LEVELS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
          <p style={{ fontSize: 11.5, color: faint, margin: '-6px 0 0', lineHeight: 1.45 }}>
            Thinking level is how hard students must think: Remember recalls facts, Apply uses them, Create makes something new.
          </p>

          <div>
            <label style={labelStyle}>Question types</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {QUIZ_TYPES.map((t) => {
                const on = form.types.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    aria-pressed={on}
                    className="transition hover:brightness-105"
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      padding: '6px 12px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      background: on ? navy : '#FFFFFF',
                      color: on ? gold : muted,
                      border: `1px solid ${on ? navy : 'rgba(14,42,92,0.16)'}`,
                    }}
                  >
                    {TYPE_LABELS[t] ?? t}
                  </button>
                )
              })}
            </div>
            <p style={{ fontSize: 11.5, color: faint, margin: '8px 0 0' }}>
              Essays are graded by you, not auto-marked.
            </p>
          </div>

          {/* The bank is a paid-plan feature: a trial sees the option, greyed,
              and the generation itself goes ahead without banking. */}
          <label className="flex items-start gap-2.5" style={{ borderTop: '1px solid rgba(14,42,92,0.07)', paddingTop: 16, cursor: locks.quizBank ? 'not-allowed' : 'pointer', opacity: locks.quizBank ? 0.55 : 1 }}>
            <input
              type="checkbox"
              checked={form.save_to_bank && !locks.quizBank}
              disabled={locks.quizBank}
              onChange={(e) => setForm((f) => ({ ...f, save_to_bank: e.target.checked }))}
              style={{ marginTop: 2, accentColor: navy, width: 15, height: 15, cursor: locks.quizBank ? 'not-allowed' : 'pointer' }}
            />
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: ink }}>
                Also save these to my Quiz Bank
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: faint, marginTop: 2 }}>
                Filed under this topic, ready to reuse. Questions already in your bank are skipped.
              </span>
            </span>
          </label>
          {locks.quizBank && <PaidPlanHint style={{ marginTop: 8 }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }}>
          <button
            type="button"
            onClick={clearForm}
            disabled={generating || isUntouched}
            className="mr-auto text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline disabled:opacity-40 disabled:hover:no-underline"
          >
            Clear form
          </button>
          <button type="button" onClick={onClose} disabled={generating} className="transition hover:brightness-105 disabled:opacity-50" style={btnModalGhost}>
            Cancel
          </button>
          <button type="submit" disabled={generating} className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={btnModalPrimary}>
            {generating ? 'Generating…' : 'Generate draft'}
            <GoldArrow />
          </button>
        </div>
      </form>
    </div>
  )
}

function CreateQuizModal({ classes, onClose }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Create a new quiz', closeOnBackdrop: false })
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [title, setTitle] = useState('')
  const [selectedClassIds, setSelectedClassIds] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const toggleClass = (id) => {
    setSelectedClassIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function create(e) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Quiz title is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const quizId = newId()
      const payload = blankQuiz({
        classIds: selectedClassIds,
        teacherId: profile.id,
        title: title.trim(),
      })

      await setDoc(doc(db, 'quizzes', quizId), {
        ...payload,
        id: quizId,
        updated_at: serverTimestamp(),
      })

      navigate(`/teacher/quizzes/${quizId}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div {...overlayProps} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <form {...panelProps} onSubmit={create} style={{ width: '100%', maxWidth: 460, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>Create New Quiz</h2>
        </div>
        <div style={{ padding: '24px 28px', overflowY: 'auto' }} className="flex flex-col gap-4">
          {error && <AlertBox>{error}</AlertBox>}
          <div>
            <label style={labelStyle}>Quiz Title</label>
            <input className="ak-input" required placeholder="e.g. Chapter 1 Quiz" value={title} onChange={(e) => setTitle(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Assign to Classes (Optional)</label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-100 p-2 rounded-lg">
              {classes.map((clazz) => {
                const checked = selectedClassIds.includes(clazz.id)
                return (
                  <label key={clazz.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer text-sm">
                    <input type="checkbox" checked={checked} onChange={() => toggleClass(clazz.id)} className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
                    <span>{clazz.section} · {clazz.subject}</span>
                  </label>
                )
              })}
            </div>
            {/* Optional here and required to publish, which is a gap a teacher
                should hear about now rather than from the Publish button at
                the bottom of a finished quiz. The AI dialog preselects a class,
                so an unassigned draft is something only this path produces. */}
            {selectedClassIds.length === 0 && (
              <p style={{ fontSize: 11.5, color: faint, margin: '6px 0 0' }}>
                You can assign later, but a quiz needs at least one class before it can be published.
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={saving} className="transition hover:brightness-105" style={btnModalGhost}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className="transition hover:brightness-110" style={btnModalPrimary}>
            {saving ? 'Creating…' : 'Create Quiz'}
            <GoldArrow />
          </button>
        </div>
      </form>
    </div>
  )
}

function QuizCard({ quiz, classes, onDelete }) {
  const [removeQuiz, removing] = useAsyncAction(() => onDelete(quiz.id))
  // Nothing in this client writes question_count / total_points -- only the Flask
  // model does, and quizzes are Firestore-direct here. Derive both from the
  // questions the list query already returned, and keep a stored value if one
  // exists (a quiz that came through the backend).
  const count = quiz.question_count ?? (quiz.questions?.length ?? 0)
  const points = quiz.total_points ?? totalPoints(quiz.questions)
  const s = STATUS_PILL[quiz.status] ?? STATUS_PILL.draft
  const isAi = quiz.generated_by === 'ai_generated'
  // The same sentence the student's dashboard and class page print for this
  // window (lib/deliverables.js), so "Due Fri 19 Sep, 11:59 PM" here is
  // exactly what they read. The pill beside it is the teacher's status; this
  // is the date. classId only feeds the href, which the card does not use.
  const window = describeWindow(fromQuiz(quiz, { classId: quiz.class_ids?.[0] ?? '' }))

  const assignedClasses = classes.filter((c) => (quiz.class_ids ?? []).includes(c.id))

  return (
    <div
      className="ak-card-hov block relative bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition"
    >
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 10 }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 999 }}>
            {s.label}
          </span>
          <span title="What students read for this quiz's window" style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', fontSize: 11, fontWeight: 600, color: muted, background: 'rgba(14,42,92,0.04)', border: '1px solid rgba(14,42,92,0.12)', borderRadius: 999 }}>
            {window}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAi && (
            <span className="inline-flex items-center gap-1" style={{ ...mono, fontSize: 11, color: blueText, fontWeight: 600 }}>
              <Sparkles className="h-3 w-3" /> AI
            </span>
          )}
          <button
            onClick={removeQuiz}
            disabled={removing}
            title="Delete quiz"
            aria-label="Delete quiz"
            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition disabled:opacity-40"
          >
            <Trash className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: ink, lineHeight: 1.3 }}>{quiz.title}</div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {assignedClasses.length === 0 ? (
          <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Not assigned</span>
        ) : (
          assignedClasses.map((c) => (
            /* Section alone ("Newton") does not say what the quiz is for.
               Same ` · ` form the Assign modal above already uses. */
            <span key={c.id} className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {c.subject ? `${c.section} · ${c.subject}` : c.section}
            </span>
          ))
        )}
      </div>

      <div className="flex items-center gap-4" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(14,42,92,0.07)' }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Items</div>
          <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: ink, marginTop: 2 }}>{count}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Points</div>
          <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: ink, marginTop: 2 }}>{points}</div>
        </div>
        <Link to={`/teacher/quizzes/${quiz.id}`} style={{ ...mono, marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: navy, textDecoration: 'none' }} className="hover:underline">
          Open →
        </Link>
      </div>
    </div>
  )
}

const TYPE_LABELS = {
  mcq: 'Multiple choice',
  true_false: 'True / False',
  matching: 'Matching',
  short_answer: 'Short answer',
  essay: 'Essay',
}

function BankedQuestionCard({ question, onEdit, onDelete }) {
  const [removeQuestion, removing] = useAsyncAction(() => onDelete(question.id))
  const s = question
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 14, padding: 18, marginBottom: 12 }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ ...mono, background: navy, color: gold, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
          {TYPE_LABELS[s.qtype] || s.qtype}
        </span>
        <span className="text-xs text-slate-400">{s.points} pts</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => onEdit(s)} className="text-indigo-600 hover:text-indigo-800 p-1 rounded hover:bg-slate-50 transition" title="Edit">
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={removeQuestion}
            disabled={removing}
            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition disabled:opacity-40"
            title="Delete question"
            aria-label="Delete question"
          >
            <Trash className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="break-words" style={{ fontSize: 14, fontWeight: 600, color: ink, margin: '0 0 10px' }}>{s.text}</p>

      {s.qtype === 'mcq' && s.options && (
        <div className="space-y-1 mb-3 pl-2">
          {s.options.map((o, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${o.is_correct ? 'bg-green-500' : 'bg-slate-300'}`} />
              <span className={`break-words flex-1 ${o.is_correct ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                {o.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {s.qtype === 'true_false' && s.answer_key && (
        <p className="text-xs text-slate-600 mb-3 pl-2">
          Correct: <span className="font-bold">{s.answer_key.value ? 'True' : 'False'}</span>
        </p>
      )}

      {s.qtype === 'short_answer' && s.answer_key && (
        <p className="text-xs text-slate-600 mb-3 pl-2 break-words">
          Correct Answers: <span className="font-bold">{(s.answer_key.answers || []).join(', ')}</span>
        </p>
      )}

      {s.qtype === 'matching' && s.answer_key && (
        <div className="space-y-1 mb-3 pl-2 text-xs text-slate-600">
          {(s.answer_key.pairs || []).map((p, idx) => (
            <div key={idx} className="break-words">
              <span className="font-semibold">{p.left}</span> &rarr; <span>{p.right}</span>
            </div>
          ))}
        </div>
      )}

      {s.qtype === 'essay' && s.rubric && (
        <p className="text-xs text-slate-600 mb-3 pl-2 italic">
          Rubric: {s.rubric}
        </p>
      )}

      {s.tags && (
        <div className="flex flex-wrap gap-1 mt-2">
          {s.tags.split(',').map(t => t.trim()).filter(Boolean).map((t, idx) => (
            <span key={idx} className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function BankedQuestionModal({ question, syllabi, onClose, onSave }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Edit a banked question', closeOnBackdrop: false })
  const [qtype, setQtype] = useState(question.qtype || 'mcq')
  const [text, setText] = useState(question.text || '')
  const [points, setPoints] = useState(String(question.points ?? 1))
  const [tags, setTags] = useState(question.tags || '')
  const [options, setOptions] = useState(question.options || [
    { text: '', is_correct: true },
    { text: '', is_correct: false }
  ])
  const [tfValue, setTfValue] = useState(question.answer_key?.value !== undefined ? question.answer_key.value : true)
  const [answersText, setAnswersText] = useState((question.answer_key?.answers || []).join('\n'))
  const [pairs, setPairs] = useState(question.answer_key?.pairs || [
    { left: '', right: '' },
    { left: '', right: '' }
  ])
  const [rubric, setRubric] = useState(question.rubric || '')
  const [syllabusId, setSyllabusId] = useState(question.syllabus_id || '')
  const [topicId, setTopicId] = useState(question.topic_id || '')
  /* Validation used to fire five alert()s. An OS box takes the reader out of
     the form to dismiss news about a field they can no longer see; this keeps
     the message in the footer, beside the Save button they just pressed, and
     clears the moment they change the question type. */
  const [formError, setFormError] = useState('')
  const [runSave, saving] = useAsyncAction(onSave)

  const selectedSyllabus = syllabi.find(s => s.id === syllabusId)
  const topicsList = []
  if (selectedSyllabus?.modules) {
    selectedSyllabus.modules.forEach(m => {
      if (m.topics) {
        m.topics.forEach(t => {
          topicsList.push({ id: t.id, label: `${m.title} · ${t.title}` })
        })
      }
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!text.trim()) {
      setFormError('Question text is required.')
      return
    }

    const payload = {
      qtype,
      text: text.trim(),
      points: Number(points) || 1,
      tags: tags.trim() || null,
      syllabus_id: syllabusId || null,
      topic_id: topicId || null,
    }

    if (qtype === 'mcq') {
      const cleanedOptions = options.map(o => ({ ...o, text: o.text.trim() })).filter(o => o.text)
      if (cleanedOptions.length < 2) {
        setFormError('Give the question at least 2 options with text in them.')
        return
      }
      if (!cleanedOptions.some(o => o.is_correct)) {
        setFormError('Mark one option as the correct answer.')
        return
      }
      payload.options = cleanedOptions
    } else if (qtype === 'true_false') {
      payload.answer_key = { value: tfValue }
    } else if (qtype === 'short_answer') {
      const answers = answersText.split('\n').map(s => s.trim()).filter(Boolean)
      if (answers.length === 0) {
        setFormError('Provide at least one accepted answer, one per line.')
        return
      }
      payload.answer_key = { answers }
    } else if (qtype === 'matching') {
      const cleanedPairs = pairs.map(p => ({ left: p.left.trim(), right: p.right.trim() })).filter(p => p.left && p.right)
      if (cleanedPairs.length < 2) {
        setFormError('Provide at least 2 matching pairs with both sides filled in.')
        return
      }
      payload.answer_key = { pairs: cleanedPairs }
    } else if (qtype === 'essay') {
      payload.rubric = rubric.trim() || null
    }

    setFormError('')
    runSave(payload)
  }

  return (
    <div {...overlayProps} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <form {...panelProps} onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 520, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>
            {question.id ? 'Edit Banked Question' : 'Add Question to Bank'}
          </h2>
        </div>

        <div style={{ padding: '24px 28px', overflowY: 'auto' }} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Question Type</label>
              <select value={qtype} onChange={(e) => setQtype(e.target.value)} className="ak-input" style={fieldStyle}>
                {Object.entries(TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Points</label>
              <input type="number" min="0.5" step="0.5" value={points} onChange={(e) => setPoints(e.target.value)} className="ak-input" style={fieldStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Question Text</label>
            <textarea rows={2} required placeholder="Question text" value={text} onChange={(e) => setText(e.target.value)} className="ak-input" style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>

          {/* Type-specific inputs */}
          {qtype === 'mcq' && (
            <div>
              <label style={labelStyle}>Options</label>
              <div className="space-y-2">
                {options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" checked={o.is_correct} onChange={() => setOptions(options.map((x, j) => ({ ...x, is_correct: j === i })))} style={{ accentColor: navy }} />
                    <input placeholder={`Option ${i + 1}`} value={o.text} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className="ak-input" style={{ ...fieldStyle, flex: 1 }} />
                    <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} disabled={options.length <= 2} title={`Remove option ${i + 1}`} aria-label={`Remove option ${i + 1}`} className="text-red-500 disabled:opacity-30">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => setOptions([...options, { text: '', is_correct: false }])} className="text-xs font-semibold text-indigo-600 hover:underline">
                  + Add option
                </button>
              </div>
            </div>
          )}

          {qtype === 'true_false' && (
            <div>
              <label style={labelStyle}>Correct Answer</label>
              <div className="flex gap-4">
                {[true, false].map((v) => (
                  <label key={String(v)} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="radio" checked={tfValue === v} onChange={() => setTfValue(v)} style={{ accentColor: navy }} />
                    {v ? 'True' : 'False'}
                  </label>
                ))}
              </div>
            </div>
          )}

          {qtype === 'short_answer' && (
            <div>
              <label style={labelStyle}>Accepted Answers (One per line)</label>
              <textarea rows={2} placeholder="Answer options" value={answersText} onChange={(e) => setAnswersText(e.target.value)} className="ak-input" style={{ ...fieldStyle, resize: 'vertical' }} />
            </div>
          )}

          {qtype === 'matching' && (
            <div>
              <label style={labelStyle}>Matching Pairs</label>
              <div className="space-y-2">
                {pairs.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input placeholder="Left" value={p.left} onChange={(e) => setPairs(pairs.map((x, j) => j === i ? { ...x, left: e.target.value } : x))} className="ak-input" style={{ ...fieldStyle, flex: 1 }} />
                    <span className="text-slate-400">&rarr;</span>
                    <input placeholder="Right" value={p.right} onChange={(e) => setPairs(pairs.map((x, j) => j === i ? { ...x, right: e.target.value } : x))} className="ak-input" style={{ ...fieldStyle, flex: 1 }} />
                    <button type="button" onClick={() => setPairs(pairs.filter((_, j) => j !== i))} title={`Remove pair ${i + 1}`} aria-label={`Remove pair ${i + 1}`} className="text-red-500">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => setPairs([...pairs, { left: '', right: '' }])} className="text-xs font-semibold text-indigo-600 hover:underline">
                  + Add pair
                </button>
              </div>
            </div>
          )}

          {qtype === 'essay' && (
            <div>
              <label style={labelStyle}>Grading Rubric</label>
              <textarea rows={2} placeholder="Essay criteria" value={rubric} onChange={(e) => setRubric(e.target.value)} className="ak-input" style={{ ...fieldStyle, resize: 'vertical' }} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Syllabus (Subject)</label>
              <select value={syllabusId} onChange={(e) => { setSyllabusId(e.target.value); setTopicId('') }} className="ak-input" style={fieldStyle}>
                <option value="">— Uncategorized —</option>
                {syllabi.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Topic</label>
              <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="ak-input" disabled={!syllabusId} style={fieldStyle}>
                <option value="">— General subject level —</option>
                {topicsList.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Tags (Comma-separated)</label>
            <input placeholder="e.g. midterm, difficult" value={tags} onChange={(e) => setTags(e.target.value)} className="ak-input" style={fieldStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }}>
          {formError && (
            <p role="alert" style={{ flex: 1, margin: 0, fontSize: 12.5, lineHeight: 1.4, color: red, textAlign: 'left' }}>
              {formError}
            </p>
          )}
          <button type="button" onClick={onClose} className="transition hover:brightness-105" style={btnModalGhost}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="transition hover:brightness-110 disabled:opacity-50"
            style={btnModalPrimary}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

function QuizBankBrowser({ syllabi }) {
  const { profile } = useAuth()
  const [selectedNode, setSelectedNode] = useState({ type: 'uncategorized' })
  const [expandedSyllabi, setExpandedSyllabi] = useState({})
  const [expandedModules, setExpandedModules] = useState({})
  const [search, setSearch] = useState('')
  const [showQuestionModal, setShowQuestionModal] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState(null)

  const toggleSyllabus = (id) => {
    setExpandedSyllabi(prev => ({ ...prev, [id]: !prev[id] }))
  }
  const toggleModule = (id) => {
    setExpandedModules(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // One fetch of the teacher's whole bank; the folder filter is applied in
  // memory, so switching folders does not refetch.
  const { data: allBankedQuestions = [], isLoading: isLoadingBank, refetch: refetchBank } =
    useBankedQuestions()
  const bankedQuestions = filterBankedQuestions(allBankedQuestions, selectedNode)

  const handleSaveQuestion = async (payload) => {
    try {
      await saveBankedQuestion({
        teacherId: profile.id,
        id: editingQuestion?.id,
        payload,
      })
      setShowQuestionModal(false)
      setEditingQuestion(null)
      refetchBank()
      toast.success('Question saved to your bank.')
    } catch (err) {
      toast.error(`Could not save the question: ${err.message}`)
    }
  }

  const handleDeleteQuestion = async (id) => {
    if (!(await confirmDialog({
      title: 'Delete this question from the bank?',
      message: 'Quizzes that already contain a copy of it are not affected - only the banked original goes.',
      confirmLabel: 'Delete question',
      tone: 'danger',
    }))) return
    try {
      await deleteBankedQuestion(id)
      refetchBank()
      toast.success('Question removed from your bank.')
    } catch (err) {
      toast.error(`Could not delete the question: ${err.message}`)
    }
  }

  const filteredQuestions = bankedQuestions.filter(q => {
    const term = search.toLowerCase().trim()
    if (!term) return true
    const textMatch = q.text.toLowerCase().includes(term)
    const tagMatch = q.tags?.toLowerCase().includes(term)
    return textMatch || tagMatch
  })

  return (
    <div className="flex gap-4 min-h-[500px]">
      {/* Left sidebar directory tree */}
      <div className="w-64 flex-shrink-0 border-r border-slate-200 pr-4">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Folders</h4>
        <div className="space-y-1">
          <button
            onClick={() => setSelectedNode({ type: 'uncategorized' })}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-medium transition ${
              selectedNode.type === 'uncategorized'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>📦</span>
            <span>General / Uncategorized</span>
          </button>

          {syllabi.map(s => {
            const isExpanded = !!expandedSyllabi[s.id]
            const isSelected = selectedNode.type === 'syllabus' && selectedNode.syllabusId === s.id
            return (
              <div key={s.id} className="space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <button
                    onClick={() => setSelectedNode({ type: 'syllabus', syllabusId: s.id })}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-medium transition min-w-0 ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>📚</span>
                    <span className="truncate">{s.title}</span>
                  </button>
                  {s.modules?.length > 0 && (
                    <button
                      onClick={() => toggleSyllabus(s.id)}
                      aria-expanded={!!expandedSyllabi[s.id]}
                      title={expandedSyllabi[s.id] ? `Collapse ${s.title}` : `Expand ${s.title}`}
                      aria-label={expandedSyllabi[s.id] ? `Collapse ${s.title}` : `Expand ${s.title}`}
                      className="p-1 hover:bg-slate-100 rounded text-slate-400 flex-shrink-0"
                    >
                      <span className={`block text-[10px] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                        ▶
                      </span>
                    </button>
                  )}
                </div>

                {isExpanded && s.modules?.map(m => {
                  const isModExpanded = !!expandedModules[m.id]
                  return (
                    <div key={m.id} className="pl-4 space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <span className="text-xs font-semibold text-slate-400 truncate py-1 flex-1 min-w-0">
                          📂 {m.title}
                        </span>
                        {m.topics?.length > 0 && (
                          <button
                            onClick={() => toggleModule(m.id)}
                            aria-expanded={!!expandedModules[m.id]}
                            title={expandedModules[m.id] ? `Collapse ${m.title}` : `Expand ${m.title}`}
                            aria-label={expandedModules[m.id] ? `Collapse ${m.title}` : `Expand ${m.title}`}
                            className="p-0.5 hover:bg-slate-100 rounded text-slate-400 flex-shrink-0"
                          >
                            <span className={`block text-[8px] transition-transform duration-200 ${isModExpanded ? 'rotate-90' : ''}`}>
                              ▶
                            </span>
                          </button>
                        )}
                      </div>

                      {isModExpanded && m.topics?.map(t => {
                        const isTopicSelected = selectedNode.type === 'topic' && selectedNode.topicId === t.id
                        return (
                          <button
                            key={t.id}
                            onClick={() => setSelectedNode({ type: 'topic', topicId: t.id, syllabusId: s.id })}
                            className={`w-full pl-6 pr-2 py-1.5 rounded text-left text-xs font-medium transition truncate block min-w-0 ${
                              isTopicSelected
                                ? 'text-indigo-600 bg-indigo-50/50 font-semibold'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                            }`}
                          >
                            📄 {t.title}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Right pane: questions list */}
      <div className="flex-1 pl-4 min-w-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-800 break-words leading-snug">
              {selectedNode.type === 'uncategorized' && 'General / Uncategorized Questions'}
              {selectedNode.type === 'syllabus' && `Questions under "${syllabi.find(s => s.id === selectedNode.syllabusId)?.title || ''}"`}
              {selectedNode.type === 'topic' && 'Questions under topic'}
            </h3>
            {selectedNode.type === 'topic' && (
              <p className="text-xs text-slate-400 mt-0.5 break-words">
                Syllabus: {syllabi.find(s => s.id === selectedNode.syllabusId)?.title}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setEditingQuestion({
                qtype: 'mcq',
                text: '',
                points: 1,
                options: [
                  { text: '', is_correct: true },
                  { text: '', is_correct: false }
                ],
                tags: '',
                syllabus_id: selectedNode.syllabusId || '',
                topic_id: selectedNode.topicId || '',
              })
              setShowQuestionModal(true)
            }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-[#0E2A5C] text-[#FAFAF6] hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Add Question
          </button>
        </div>

        <div className="mb-4">
          <input
            placeholder="Search questions by text or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ak-input w-full"
            style={{ ...fieldStyle, padding: '8px 12px' }}
          />
        </div>

        {isLoadingBank ? (
          <div className="p-8 text-center text-slate-500">Loading banked questions...</div>
        ) : filteredQuestions.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500">No questions found in this folder matching search criteria.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredQuestions.map(q => (
              <BankedQuestionCard
                key={q.id}
                question={q}
                onEdit={(q) => {
                  setEditingQuestion(q)
                  setShowQuestionModal(true)
                }}
                onDelete={handleDeleteQuestion}
              />
            ))}
          </div>
        )}
      </div>

      {showQuestionModal && editingQuestion && (
        <BankedQuestionModal
          question={editingQuestion}
          syllabi={syllabi}
          onClose={() => {
            setShowQuestionModal(false)
            setEditingQuestion(null)
          }}
          onSave={handleSaveQuestion}
        />
      )}
    </div>
  )
}

export default function QuizzesIndexPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  // Ongoing first: it is the only tab that can need attention today.
  const [filter, setFilter] = useState('ongoing')
  const [activeTab, setActiveTab] = useState('quizzes') // 'quizzes' or 'bank'
  const { locks } = useMySubscription()
  const [showCreate, setShowCreate] = useState(false)
  // ?topic={topicId} -- the class page's Modules tab sends "+ Add -> Quiz"
  // here with the sub-module it was under, so the Generate dialog opens on it.
  const [searchParams, setSearchParams] = useSearchParams()
  const topicParam = searchParams.get('topic') ?? ''
  const [showGenerate, setShowGenerate] = useState(!!topicParam)

  // Fetch classes
  const { data: classes } = useTeacherClasses()

  // Fetch quizzes
  const { data: sqliteQuizzes, isLoading, refetch } = useQuizzes()

  // Fetch syllabi for the Quiz Bank structure
  const { data: syllabi } = useSyllabi()

  // Which class the URL's topic belongs to: the syllabus that lists it, then
  // the class that points at that syllabus -- the first of them when several
  // share one, so the topic shows preselected and the teacher only changes
  // the class if that guess was wrong. ?class= settles it outright. A topic
  // held only in a seeded class's own copy resolves to nothing, and the
  // dialog then says the topic is not in the picked class's syllabus.
  const classParam = searchParams.get('class') ?? ''
  const presetClassId = (() => {
    if (!topicParam || !classes) return ''
    if (classParam && classes.some((c) => c.id === classParam)) return classParam
    const holder = (syllabi ?? []).find((s) =>
      (s.modules ?? []).some((m) => (m.topics ?? []).some((t) => t.id === topicParam)),
    )
    return holder ? (classes.find((c) => c.syllabus_id === holder.id)?.id ?? '') : ''
  })()
  // The dialog reads its presets once, on mount, so it waits for the data
  // they come from when a topic is on the URL.
  const presetsReady = !topicParam || (!!classes && !!syllabi)

  function closeGenerate() {
    setShowGenerate(false)
    // Drop the preset so a refresh or a second visit does not reopen the dialog.
    if (topicParam) setSearchParams({}, { replace: true })
  }

  async function handleDelete(quizId) {
    if (!(await confirmDialog({
      title: 'Delete this quiz?',
      message: 'Attempts students have already submitted are deleted with it, and the gradebook loses those scores. This cannot be undone.',
      confirmLabel: 'Delete quiz',
      tone: 'danger',
      typeToConfirm: 'DELETE',
    }))) return
    try {
      await deleteDoc(doc(db, 'quizzes', quizId))
      refetch()
      toast.success('Quiz deleted.')
    } catch (err) {
      toast.error(`Could not delete the quiz: ${err.message}`)
    }
  }

  if (isLoading) {
    return <SkeletonList count={5} height={92} label="Loading quizzes" />
  }

  const counts = {}
  for (const q of sqliteQuizzes) {
    const phase = lifecycleOf(q)
    counts[phase] = (counts[phase] ?? 0) + 1
  }
  counts.all = sqliteQuizzes.length

  const filteredQuizzes = sqliteQuizzes.filter(
    (q) => filter === 'all' || lifecycleOf(q) === filter,
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[clamp(28px,4vw,36px)]" style={{ ...serif, color: ink }}>Quiz Manager</h2>
          <p className="text-slate-500 mt-1">
            Build, generate, and manage all your quizzes globally.
          </p>
        </div>
        {activeTab === 'quizzes' && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-200 text-indigo-700 bg-white px-4 py-2 text-sm font-medium hover:bg-indigo-50"
            >
              <Plus className="h-4 w-4" /> Add Manually
            </button>
            <button
              onClick={() => setShowGenerate(true)}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition hover:brightness-110"
              style={{ background: '#0E2A5C', color: '#FAFAF6', border: 'none', cursor: 'pointer' }}
            >
              ✨ Generate with AI
            </button>
          </div>
        )}
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('quizzes')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
            activeTab === 'quizzes'
              ? 'border-[#0E2A5C] text-[#0E2A5C]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📋 Quizzes
        </button>
        <button
          onClick={() => setActiveTab('bank')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
            activeTab === 'bank'
              ? 'border-[#0E2A5C] text-[#0E2A5C]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📚 Quiz Bank{locks.quizBank && <span aria-hidden> 🔒</span>}
        </button>
      </div>

      {activeTab === 'quizzes' ? (
        <>
          <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                title={FILTER_HINTS[f]}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  filter === f
                    ? 'bg-[#0E2A5C] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                {FILTER_LABELS[f]}
                {/* The count is the reason to click, or the reason not to. */}
                <span style={{ ...mono, fontSize: 10, opacity: 0.75 }}>{counts[f] ?? 0}</span>
              </button>
            ))}
          </div>

          {filteredQuizzes.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <p className="text-slate-500">
                {filter === 'all'
                  ? 'No quizzes yet.'
                  : `Nothing ${FILTER_LABELS[filter].toLowerCase()} — ${FILTER_HINTS[filter].toLowerCase()}.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredQuizzes.map((quiz) => (
                <QuizCard
                  key={quiz.id}
                  quiz={quiz}
                  classes={classes ?? []}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        locks.quizBank ? (
          /* Greyed, not hidden: the trial should see what the bank is. The
             browser is read-only under the overlay; saving is blocked above. */
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', marginBottom: 12, background: 'rgba(245,197,24,0.12)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 12 }}>
              <span style={{ fontSize: 13.5, color: ink }}>
                <strong>The Quiz Bank is not included in the free trial.</strong> Your questions are still generated and saved to each quiz — the bank is where they become reusable across quizzes.
              </span>
              <PaidPlanHint />
            </div>
            <div style={{ opacity: 0.45, pointerEvents: 'none', userSelect: 'none' }} aria-disabled="true">
              <QuizBankBrowser syllabi={syllabi ?? []} />
            </div>
          </div>
        ) : (
          <QuizBankBrowser syllabi={syllabi ?? []} />
        )
      )}

      {showCreate && (
        <CreateQuizModal
          classes={classes ?? []}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showGenerate && presetsReady && (
        <GenerateQuizModal
          classes={classes ?? []}
          initialClassId={presetClassId}
          initialTopicId={topicParam}
          onClose={closeGenerate}
        />
      )}
    </div>
  )
}

