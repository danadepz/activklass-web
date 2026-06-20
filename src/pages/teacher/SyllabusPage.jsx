import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api } from '../../lib/api'
import { ArrowRight, Sparkles } from '../../components/icons'

const navy = '#0E2A5C'
const navyDeep = '#061840'
const ink = '#0A1733'
const gold = '#F5C518'
const muted = '#6A7A95'
const faint = '#9AA6BD'
const blueText = '#1E6FB0'
const red = '#C0392B'
const line = 'rgba(14,42,92,0.08)'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }
const sans = "'Plus Jakarta Sans', sans-serif"

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: ink, marginBottom: 7 }
const fieldStyle = {
  width: '100%', padding: '12px 14px', fontSize: 14, fontFamily: sans, color: ink,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10,
  transition: 'border-color 0.15s, box-shadow 0.15s',
}
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 9, padding: '12px 20px', fontSize: 14,
  fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none',
  borderRadius: 11, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}`,
}
const btnGhost = {
  padding: '12px 20px', fontSize: 14, fontWeight: 600, fontFamily: sans, color: '#3A4A6B',
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11, cursor: 'pointer',
}
const btnAdd = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', fontSize: 13,
  fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF',
  border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer',
}
const iconBtn = { color: faint, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 14, lineHeight: 1 }

function GenerateBtn({ onClick, style }) {
  return (
    <button onClick={onClick} className="transition hover:brightness-110" style={{ ...btnPrimary, padding: '11px 18px', fontSize: 13, ...style }}>
      <span style={{ color: gold, display: 'inline-flex' }}>
        <Sparkles className="h-4 w-4" />
      </span>
      Generate with AI
    </button>
  )
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

function GenerateModal({ onClose, onDraft }) {
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const canned = await api('/api/syllabus')
      onDraft(fromCannedSyllabus(canned))
    } catch (err) {
      setError(err.message)
      setGenerating(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: navy, color: gold, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>Generate Syllabus with AI</h2>
        </div>
        <div style={{ padding: '24px 28px' }} className="flex flex-col gap-4">
          <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.55, margin: 0 }}>
            Loads the DepEd-aligned <strong>Grade 10 Mathematics</strong> starter (Most Essential Learning
            Competencies) as an editable draft. Review and adjust everything before saving — nothing is
            stored until you save.
          </p>
          {error && <AlertBox>{error}</AlertBox>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)' }}>
          <button onClick={onClose} disabled={generating} className="transition hover:brightness-105 disabled:opacity-50" style={btnGhost}>
            Cancel
          </button>
          <button onClick={generate} disabled={generating} className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={btnPrimary}>
            {generating ? 'Loading…' : 'Load starter'}
            <GoldArrow />
          </button>
        </div>
      </div>
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

  const topicCount = tree.modules.reduce((n, m) => n + m.topics.length, 0)

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
      await setDoc(doc(db, 'classes', classId, 'syllabus', 'current'), {
        class_id: classId,
        title: tree.title,
        description: tree.description,
        source: isAiDraft ? 'ai_generated' : tree.source || 'manual',
        modules,
        updated_at: serverTimestamp(),
      })
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
        <div className="mt-4 flex items-center gap-2.5" style={{ background: 'rgba(63,169,245,0.06)', border: '1px solid rgba(63,169,245,0.3)', borderRadius: 11, padding: '12px 14px', fontSize: 13, color: ink }}>
          <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 7, background: 'rgba(63,169,245,0.2)', color: blueText, flexShrink: 0 }}>
            <Sparkles className="h-3 w-3" />
          </span>
          AI-generated draft — review and edit below, then save. Nothing is stored until you save.
        </div>
      )}
      {error && <div className="mt-4">{<AlertBox>{error}</AlertBox>}</div>}

      <div className="mt-4" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
        <div className="flex flex-col gap-3">
          <div>
            <label style={labelStyle}>Syllabus title</label>
            <input className="ak-input" value={tree.title} onChange={(e) => setTree((t) => ({ ...t, title: e.target.value }))} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea className="ak-input" rows={2} value={tree.description} onChange={(e) => setTree((t) => ({ ...t, description: e.target.value }))} style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>
          <div style={{ ...mono, fontSize: 12, color: faint }}>
            {tree.modules.length} module{tree.modules.length === 1 ? '' : 's'} · {topicCount} topic{topicCount === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {tree.modules.map((module, mIdx) => (
        <div key={module._key} className="mt-4" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
          <div className="flex items-start gap-3">
            <span style={{ ...mono, background: navy, color: gold, fontSize: 11, fontWeight: 700, padding: '6px 11px', borderRadius: 8, marginTop: 6, flexShrink: 0 }}>
              M{mIdx + 1}
            </span>
            <div className="flex flex-1 flex-col gap-2">
              <input className="ak-input" placeholder="Module title" value={module.title} onChange={(e) => updateModule(mIdx, { title: e.target.value })} style={{ ...fieldStyle, fontWeight: 700 }} />
              <input className="ak-input" placeholder="Module description (optional)" value={module.description} onChange={(e) => updateModule(mIdx, { description: e.target.value })} style={{ ...fieldStyle, fontSize: 13 }} />
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => setModules(move(tree.modules, mIdx, -1))} title="Move up" style={iconBtn} className="transition hover:text-[#0A1733]">↑</button>
              <button onClick={() => setModules(move(tree.modules, mIdx, 1))} title="Move down" style={iconBtn} className="transition hover:text-[#0A1733]">↓</button>
              <button
                onClick={() => {
                  if (window.confirm(`Remove module "${module.title || mIdx + 1}" and its topics?`)) {
                    setModules(tree.modules.filter((_, i) => i !== mIdx))
                  }
                }}
                title="Remove module"
                style={iconBtn}
                className="transition hover:text-[#C0392B]"
              >
                ×
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3" style={{ paddingLeft: 40 }}>
            {module.topics.map((topic, tIdx) => (
              <div key={topic._key} style={{ border: `1px solid ${line}`, borderRadius: 11, padding: 14 }}>
                <div className="flex items-center gap-2">
                  <input className="ak-input" placeholder={`Topic ${tIdx + 1} title`} value={topic.title} onChange={(e) => updateTopic(mIdx, tIdx, { title: e.target.value })} style={{ ...fieldStyle, flex: 1, fontSize: 13 }} />
                  <button onClick={() => updateModule(mIdx, { topics: move(module.topics, tIdx, -1) })} title="Move up" style={iconBtn} className="transition hover:text-[#0A1733]">↑</button>
                  <button onClick={() => updateModule(mIdx, { topics: move(module.topics, tIdx, 1) })} title="Move down" style={iconBtn} className="transition hover:text-[#0A1733]">↓</button>
                  <button onClick={() => updateModule(mIdx, { topics: module.topics.filter((_, i) => i !== tIdx) })} title="Remove topic" style={iconBtn} className="transition hover:text-[#C0392B]">×</button>
                </div>
                <textarea
                  className="ak-input"
                  rows={Math.max(2, topic.objectivesText.split('\n').length)}
                  placeholder={'Learning objectives — one per line\ne.g. Identify proper and improper fractions'}
                  value={topic.objectivesText}
                  onChange={(e) => updateTopic(mIdx, tIdx, { objectivesText: e.target.value })}
                  style={{ ...fieldStyle, marginTop: 8, fontSize: 13, resize: 'vertical' }}
                />
              </div>
            ))}
            <button onClick={() => updateModule(mIdx, { topics: [...module.topics, emptyTopic()] })} className="transition hover:brightness-105" style={{ ...btnAdd, alignSelf: 'flex-start', padding: '8px 14px', fontSize: 12 }}>
              <span style={{ color: gold }}>+</span> Add topic
            </button>
          </div>
        </div>
      ))}

      <div className="mt-4 flex items-center justify-between pb-8">
        <button onClick={() => setModules([...tree.modules, emptyModule()])} className="transition hover:brightness-105" style={btnAdd}>
          <span style={{ color: gold }}>+</span> Add module
        </button>
        <button onClick={save} disabled={saving} className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={btnPrimary}>
          {saving ? 'Saving…' : 'Save syllabus'}
          <GoldArrow />
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

  if (isLoading) return <p style={{ color: faint }}>Loading syllabus…</p>

  const onSaved = () => {
    setDraft(null)
    queryClient.invalidateQueries({ queryKey: ['fs-syllabus', classId] })
    setEditorKey((k) => k + 1)
  }

  const initial = draft
    ? toDraftState(draft.tree, draft.ai ? 'ai_generated' : 'manual')
    : saved
      ? toDraftState(saved, saved.source)
      : null

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4" style={{ maxWidth: 768 }}>
        <div>
          <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
            Syllabus
          </h1>
          <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
            Modules and topics drive performance mapping, quizzes, and scaffold recommendations.
          </p>
        </div>
        <GenerateBtn onClick={() => setShowGenerate(true)} />
      </div>

      {clazz?.syllabus_file && (
        <a
          href={clazz.syllabus_file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 transition hover:brightness-105"
          style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 11, padding: '10px 16px', fontSize: 13, fontWeight: 600, color: navy, textDecoration: 'none' }}
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
          onSaved={onSaved}
        />
      ) : (
        <div className="mt-6 text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 48, maxWidth: 768 }}>
          <p style={{ color: muted, margin: 0 }}>No syllabus yet for this class.</p>
          <div className="mt-4 flex justify-center gap-3">
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
              className="transition hover:brightness-105"
              style={btnAdd}
            >
              Build manually
            </button>
            <GenerateBtn onClick={() => setShowGenerate(true)} />
          </div>
        </div>
      )}

      {showGenerate && (
        <GenerateModal
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
