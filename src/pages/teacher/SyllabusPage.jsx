import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api } from '../../lib/api'

let keyCounter = 0
const newKey = () => `k${++keyCounter}`
const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

function toDraftState(tree, source) {
  return {
    title: tree.title ?? '',
    description: tree.description ?? '',
    source,
    modules: (tree.modules ?? []).map((m) => ({
      _key: newKey(),
      id: m.id ?? null,
      title: m.title ?? '',
      description: m.description ?? '',
      topics: (m.topics ?? []).map((t) => ({
        _key: newKey(),
        id: t.id ?? null,
        title: t.title ?? '',
        objectivesText: (t.learning_objectives ?? t.objectives ?? []).join('\n'),
      })),
    })),
  }
}

/* Map the AI microservice's canned DepEd Grade 10 Math syllabus
   (GET /api/syllabus) into the editor tree: quarters become modules and each
   competency module becomes an editable topic. */
function fromCannedSyllabus(canned) {
  const byQuarter = new Map()
  for (const m of canned.modules ?? []) {
    const q = m.quarter ?? 1
    if (!byQuarter.has(q)) byQuarter.set(q, [])
    byQuarter.get(q).push(m)
  }
  const modules = [...byQuarter.keys()]
    .sort((a, b) => a - b)
    .map((q) => ({
      title: `Quarter ${q}`,
      description: '',
      topics: byQuarter.get(q).map((m) => ({
        title: m.title,
        learning_objectives: m.description ? [m.description] : [],
      })),
    }))
  return {
    title: `${canned.subject ?? ''} — ${canned.grade_level ?? ''}`.trim(),
    description: canned.curriculum ?? '',
    modules,
  }
}

function emptyTopic() {
  return { _key: newKey(), id: null, title: '', objectivesText: '' }
}

function emptyModule() {
  return { _key: newKey(), id: null, title: '', description: '', topics: [emptyTopic()] }
}

function move(list, index, delta) {
  const next = [...list]
  const target = index + delta
  if (target < 0 || target >= next.length) return list
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function GenerateModal({ classMeta, onClose, onDraft }) {
  const [subjectCode, setSubjectCode] = useState('')
  const [subjectDesc, setSubjectDesc] = useState(classMeta?.subject ?? '')
  const [gradeLevel, setGradeLevel] = useState(classMeta?.grade_level ?? '')
  const [durationWeeks, setDurationWeeks] = useState(10)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)

  const inputCls =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white w-full'

  async function generate() {
    if (!subjectCode.trim() && !subjectDesc.trim()) {
      setError('Please provide a subject code or description')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const res = await api(`/api/classes/${classMeta.id}/syllabus/generate`, {
        method: 'POST',
        body: {
          subject_code: subjectCode.trim(),
          subject_description: subjectDesc.trim(),
          grade_level: gradeLevel.trim() || undefined,
          duration_weeks: durationWeeks,
          notes: notes.trim() || undefined,
        },
      })
      onDraft(res.draft)
    } catch (err) {
      setError(err.message)
      setGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center px-4 z-10">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-800">Generate Syllabus with AI</h3>
        <p className="text-sm text-slate-500">
          Specify your subject details below. The AI will dynamically align the topics to DepEd MELCs (for K-12) or CHED CMO (for college) standards.
        </p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Subject Code</label>
            <input
              type="text"
              placeholder="e.g. MATH10 or GE-MMW"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Subject Name</label>
            <input
              type="text"
              placeholder="e.g. Mathematics"
              value={subjectDesc}
              onChange={(e) => setSubjectDesc(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Grade / Year Level</label>
            <input
              type="text"
              placeholder="e.g. Grade 10"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Duration (Weeks)</label>
            <input
              type="number"
              min="1"
              max="40"
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(Number(e.target.value))}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Additional Instructions (Notes)</label>
          <textarea
            rows="3"
            placeholder="e.g. Focus on quadratic equations and sequences..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onClose}
            disabled={generating}
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={generate}
            disabled={generating}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating ? 'Generating draft...' : '✨ Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SyllabusEditor({ classId, initial, isAiDraft, isNewDraft, onSaved }) {
  const [tree, setTree] = useState(initial)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(isNewDraft ?? isAiDraft)

  const setModules = (modules) => setTree((t) => ({ ...t, modules }))
  const updateModule = (mIdx, patch) =>
    setModules(tree.modules.map((m, i) => (i === mIdx ? { ...m, ...patch } : m)))
  const updateTopic = (mIdx, tIdx, patch) =>
    updateModule(mIdx, {
      topics: tree.modules[mIdx].topics.map((t, i) => (i === tIdx ? { ...t, ...patch } : t)),
    })

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const modules = tree.modules.map((m) => ({
        id: m.id || newId(),
        title: m.title,
        description: m.description,
        topics: m.topics.map((t) => ({
          id: t.id || newId(),
          title: t.title,
          learning_objectives: t.objectivesText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        })),
      }))

      const payload = {
        class_id: classId,
        title: tree.title,
        description: tree.description,
        source: isAiDraft ? 'ai_generated' : tree.source || 'manual',
        modules,
      }

      // Save to Firestore for direct client queries (like quizzes)
      await setDoc(doc(db, 'classes', classId, 'syllabus', 'current'), {
        ...payload,
        updated_at: serverTimestamp(),
      })

      // Save to Flask backend database (SQLite) for AI features & sync
      await api(`/api/classes/${classId}/syllabus`, {
        method: 'PUT',
        body: payload,
      })

      setIsEditing(false)
      onSaved(payload)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteWholeSyllabus() {
    if (!window.confirm('Are you sure you want to delete the entire syllabus? This cannot be undone.')) return
    setSaving(true)
    setError(null)
    try {
      await deleteDoc(doc(db, 'classes', classId, 'syllabus', 'current'))
      await api(`/api/classes/${classId}/syllabus`, {
        method: 'DELETE',
      })
      onSaved(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl">
      {isAiDraft && (
        <p className="text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 mt-4">
          ✨ AI-generated draft — review and edit below, then save. Nothing is stored until you save.
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{error}</p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-4 space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Syllabus title</span>
          <input
            value={tree.title}
            onChange={(e) => setTree((t) => ({ ...t, title: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Description</span>
          <textarea
            rows={2}
            value={tree.description}
            onChange={(e) => setTree((t) => ({ ...t, description: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>

      {tree.modules.map((module, mIdx) => (
        <div key={module._key} className="bg-white rounded-xl border border-slate-200 p-5 mt-4">
          <div className="flex items-start gap-2">
            <span className="rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 mt-2">
              M{mIdx + 1}
            </span>
            <div className="flex-1 space-y-2">
              <input
                placeholder="Module title"
                value={module.title}
                onChange={(e) => updateModule(mIdx, { title: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                placeholder="Module description (optional)"
                value={module.description}
                onChange={(e) => updateModule(mIdx, { description: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => setModules(move(tree.modules, mIdx, -1))} title="Move up" className="text-slate-400 hover:text-slate-600 px-1">↑</button>
              <button onClick={() => setModules(move(tree.modules, mIdx, 1))} title="Move down" className="text-slate-400 hover:text-slate-600 px-1">↓</button>
              <button
                onClick={() => {
                  if (window.confirm(`Remove module "${module.title || mIdx + 1}" and its topics?`)) {
                    setModules(tree.modules.filter((_, i) => i !== mIdx))
                  }
                }}
                title="Remove module"
                className="text-slate-400 hover:text-red-600 px-1"
              >
                ×
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-3 pl-9">
            {module.topics.map((topic, tIdx) => (
              <div key={topic._key} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <input
                    placeholder={`Topic ${tIdx + 1} title`}
                    value={topic.title}
                    onChange={(e) => updateTopic(mIdx, tIdx, { title: e.target.value })}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button onClick={() => updateModule(mIdx, { topics: move(module.topics, tIdx, -1) })} title="Move up" className="text-slate-400 hover:text-slate-600">↑</button>
                  <button onClick={() => updateModule(mIdx, { topics: move(module.topics, tIdx, 1) })} title="Move down" className="text-slate-400 hover:text-slate-600">↓</button>
                  <button
                    onClick={() => updateModule(mIdx, { topics: module.topics.filter((_, i) => i !== tIdx) })}
                    title="Remove topic"
                    className="text-slate-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
                <textarea
                  rows={Math.max(2, topic.objectivesText.split('\n').length)}
                  placeholder={'Learning objectives — one per line\ne.g. Identify proper and improper fractions'}
                  value={topic.objectivesText}
                  onChange={(e) => updateTopic(mIdx, tIdx, { objectivesText: e.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
            <button
              onClick={() => updateModule(mIdx, { topics: [...module.topics, emptyTopic()] })}
              className="text-sm text-indigo-600 font-medium hover:underline"
            >
              + Add topic
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between mt-4 pb-8">
        {isEditing ? (
          <button
            onClick={() => setModules([...tree.modules, emptyModule()])}
            className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50"
          >
            + Add module
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={deleteWholeSyllabus}
                disabled={saving}
                className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-indigo-600 text-white px-5 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="rounded-lg border border-indigo-300 text-indigo-700 px-5 py-2 font-medium hover:bg-indigo-50"
            >
              ✏️ Edit
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SyllabusPage() {
  const { classId } = useParams()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(null) // { tree, ai } — unsaved draft being edited
  const [showGenerate, setShowGenerate] = useState(false)
  const [editorKey, setEditorKey] = useState(0)

  const { data: clazz } = useQuery({
    queryKey: ['fs-class-meta', classId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'classes', classId))
      return snap.exists() ? { id: snap.id, ...snap.data() } : null
    },
  })
  const { data: saved, isLoading } = useQuery({
    queryKey: ['fs-syllabus', classId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'classes', classId, 'syllabus', 'current'))
      return snap.exists() ? snap.data() : null
    },
  })

  if (isLoading) return <p className="text-slate-400">Loading syllabus…</p>

  const onSaved = (newSyllabus) => {
    queryClient.setQueryData(['fs-syllabus', classId], newSyllabus)
    setDraft(null)
    setEditorKey((k) => k + 1)
  }

  const initial = draft
    ? toDraftState(draft.tree, draft.ai ? 'ai_generated' : 'manual')
    : saved
      ? toDraftState(saved, saved.source)
      : null

  return (
    <div>
      <div className="flex items-start justify-between max-w-3xl">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Syllabus</h2>
          <p className="text-slate-500 mt-1">
            Modules and topics drive performance mapping, quizzes, and scaffold recommendations.
          </p>
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
        >
          ✨ Generate with AI
        </button>
      </div>

      {clazz?.syllabus_file && (
        <a
          href={clazz.syllabus_file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:border-indigo-300"
        >
          📄 Attached syllabus file: {clazz.syllabus_file.name}
        </a>
      )}

      {initial ? (
        <SyllabusEditor
          key={`${editorKey}-${draft ? 'draft' : 'saved'}`}
          classId={classId}
          initial={initial}
          isAiDraft={draft?.ai ?? false}
          isNewDraft={!!draft}
          onSaved={onSaved}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 mt-6 text-center max-w-3xl">
          <p className="text-slate-500">No syllabus yet for this class.</p>
          <div className="flex gap-3 justify-center mt-4">
            <button
              onClick={() =>
                setDraft({
                  ai: false,
                  tree: {
                    title: `${clazz?.subject ?? ''} Syllabus`.trim(),
                    description: '',
                    modules: [{ title: '', description: '', topics: [{ title: '', objectives: [] }] }],
                  },
                })
              }
              className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 font-medium hover:bg-indigo-50"
            >
              Build manually
            </button>
            <button
              onClick={() => setShowGenerate(true)}
              className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700"
            >
              ✨ Generate with AI
            </button>
          </div>
        </div>
      )}

      {showGenerate && (
        <GenerateModal
          classMeta={clazz}
          onClose={() => setShowGenerate(false)}
          onDraft={(d) => {
            setShowGenerate(false)
            setDraft({ ai: true, tree: d })
            setEditorKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
