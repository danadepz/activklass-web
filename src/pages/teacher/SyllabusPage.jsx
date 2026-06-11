import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

let keyCounter = 0
const newKey = () => `k${++keyCounter}`

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

function emptyModule() {
  return { _key: newKey(), id: null, title: '', description: '', topics: [emptyTopic()] }
}

function emptyTopic() {
  return { _key: newKey(), id: null, title: '', objectivesText: '' }
}

function move(list, index, delta) {
  const next = [...list]
  const target = index + delta
  if (target < 0 || target >= next.length) return list
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function GenerateModal({ classId, clazz, onClose, onDraft }) {
  const [form, setForm] = useState({
    subject: clazz?.subject ?? '',
    grade_level: clazz?.grade_level ?? '',
    duration_weeks: 10,
    notes: '',
  })
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function generate(e) {
    e.preventDefault()
    setGenerating(true)
    setError(null)
    try {
      const { draft } = await api(`/api/classes/${classId}/syllabus/generate`, {
        method: 'POST',
        body: form,
      })
      onDraft(draft)
    } catch (err) {
      setError(err.message)
      setGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center px-4 z-10">
      <form onSubmit={generate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">Generate Syllabus with AI</h3>
        <p className="text-sm text-slate-500">
          AI drafts the structure — you review and edit everything before saving.
        </p>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Subject</span>
            <input
              required
              value={form.subject}
              onChange={set('subject')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Grade level</span>
            <input
              value={form.grade_level}
              onChange={set('grade_level')}
              placeholder="Grade 7"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Duration (weeks)</span>
          <input
            type="number"
            min="1"
            max="40"
            value={form.duration_weeks}
            onChange={set('duration_weeks')}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes for the AI (optional)</span>
          <textarea
            rows={2}
            value={form.notes}
            onChange={set('notes')}
            placeholder="e.g. emphasize problem solving; align with DepEd MELCs"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={generating}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating ? 'Generating… (can take a minute)' : 'Generate draft'}
          </button>
        </div>
      </form>
    </div>
  )
}

function SyllabusEditor({ classId, initial, isAiDraft, onSaved }) {
  const [tree, setTree] = useState(initial)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

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
      const body = {
        title: tree.title,
        description: tree.description,
        modules: tree.modules.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          topics: m.topics.map((t) => ({
            id: t.id,
            title: t.title,
            learning_objectives: t.objectivesText
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
          })),
        })),
      }
      if (isAiDraft) body.source = 'ai_generated'
      await api(`/api/classes/${classId}/syllabus`, { method: 'PUT', body })
      onSaved()
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
        <button
          onClick={() => setModules([...tree.modules, emptyModule()])}
          className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50"
        >
          + Add module
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-indigo-600 text-white px-5 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save syllabus'}
        </button>
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

  const { data: classData } = useQuery({
    queryKey: ['class', classId],
    queryFn: () => api(`/api/classes/${classId}`),
  })
  const { data, isLoading } = useQuery({
    queryKey: ['syllabus', classId],
    queryFn: () => api(`/api/classes/${classId}/syllabus`),
  })

  if (isLoading) return <p className="text-slate-400">Loading syllabus…</p>

  const clazz = classData?.class
  const saved = data?.syllabus
  const aiAvailable = data?.ai_available

  const onSaved = () => {
    setDraft(null)
    queryClient.invalidateQueries({ queryKey: ['syllabus', classId] })
    setEditorKey((k) => k + 1)
  }

  const initial = draft
    ? toDraftState(draft.tree, draft.ai ? 'ai_generated' : 'manual')
    : saved
      ? toDraftState(saved, saved.source)
      : null

  return (
    <div>
      <Link to={`/teacher/classes/${classId}`} className="text-sm text-indigo-600 hover:underline">
        ← Back to {clazz?.name ?? 'class'}
      </Link>
      <div className="flex items-start justify-between mt-2 max-w-3xl">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Syllabus</h2>
          <p className="text-slate-500 mt-1">
            Modules and topics drive performance mapping, quizzes, and scaffold recommendations.
          </p>
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          disabled={!aiAvailable}
          title={aiAvailable ? undefined : 'Set ANTHROPIC_API_KEY in backend/.env to enable AI generation'}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
        >
          ✨ Generate with AI
        </button>
      </div>

      {initial ? (
        <SyllabusEditor
          key={`${editorKey}-${draft ? 'draft' : 'saved'}`}
          classId={classId}
          initial={initial}
          isAiDraft={draft?.ai ?? false}
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
              disabled={!aiAvailable}
              title={aiAvailable ? undefined : 'Set ANTHROPIC_API_KEY in backend/.env to enable AI generation'}
              className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-40"
            >
              ✨ Generate with AI
            </button>
          </div>
        </div>
      )}

      {showGenerate && (
        <GenerateModal
          classId={classId}
          clazz={clazz}
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
