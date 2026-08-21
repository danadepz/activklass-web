import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { deleteDoc, doc, writeBatch, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { generateSyllabus } from '@/lib/ai'
import { useAuth } from '@/context/useAuth'
import { Plus, Trash, Edit, Sparkles } from '@/components/icons'
import { ink } from '@/theme'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import { useSyllabi } from '@/hooks/useSyllabi'
import GenerateModuleModal from './GenerateModuleModal'
import { uploadAttachment } from '@/lib/attachments'
import AttachmentField from '@/components/AttachmentField'
import { confirmDialog } from '@/components/ui/dialogs'
import { toast } from '@/components/ui/toast'
import { SkeletonList } from '@/components/ui/Skeleton'
import { useAsyncAction } from '@/components/ui/useAsyncAction'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'

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
      published: m.published !== false,
      topics: (m.topics ?? []).map((t) => ({
        _key: newKey(),
        id: t.id ?? null,
        title: t.title ?? '',
        objectivesText: (t.learning_objectives ?? t.objectives ?? []).join('\n'),
        resources: (t.resources ?? []).map((r) => ({
          _key: newKey(),
          id: r.id ?? null,
          title: r.title ?? '',
          resource_type: r.resource_type ?? 'file',
          url: r.url ?? '',
          content_markdown: r.content_markdown ?? '',
        })),
      })),
    })),
  }
}

function emptyTopic() {
  return { _key: newKey(), id: null, title: '', objectivesText: '', resources: [] }
}

function emptyModule() {
  return { _key: newKey(), id: null, title: '', description: '', published: true, topics: [emptyTopic()] }
}

function TopicResourceEditor({ syllabusId, topic, onChange }) {
  const [addingType, setAddingType] = useState(null) // null, 'file', 'link', 'rich_text'
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [contentMarkdown, setContentMarkdown] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const resources = topic.resources ?? []

  const handleAdd = () => {
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (addingType === 'link' && !url.trim()) {
      setError('URL is required')
      return
    }
    if (addingType === 'rich_text' && !contentMarkdown.trim()) {
      setError('Content markdown is required')
      return
    }

    const newRes = {
      _key: newKey(),
      id: null,
      title: title.trim(),
      resource_type: addingType,
      url: addingType === 'rich_text' ? '' : url.trim(),
      content_markdown: addingType === 'rich_text' ? contentMarkdown : '',
    }

    onChange([...resources, newRes])
    resetForm()
  }

  const resetForm = () => {
    setAddingType(null)
    setTitle('')
    setUrl('')
    setContentMarkdown('')
    setError(null)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const downloadUrl = await uploadAttachment(
        `learning_materials/${syllabusId}/${newId()}-${file.name}`,
        file,
      )

      const newRes = {
        _key: newKey(),
        id: null,
        title: title.trim() || file.name,
        resource_type: 'file',
        url: downloadUrl,
        content_markdown: '',
      }

      onChange([...resources, newRes])
      resetForm()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = (resKey) => {
    onChange(resources.filter(r => r._key !== resKey))
  }

  return (
    <div className="mt-4 border-t border-slate-200/80 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Learning Materials</span>
        {!addingType && (
          <div className="flex gap-2">
            <button
              onClick={() => { setAddingType('file'); setTitle(''); }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded"
            >
              📄 Upload File
            </button>
            <button
              onClick={() => { setAddingType('link'); setTitle(''); setUrl(''); }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded"
            >
              🔗 Add Link
            </button>
            <button
              onClick={() => { setAddingType('rich_text'); setTitle(''); setContentMarkdown(''); }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded"
            >
              ✍️ Write Note
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>
      )}

      {/* Add Resource Forms */}
      {addingType === 'file' && (
        <div className="bg-white border border-indigo-100 rounded-lg p-3 space-y-3 shadow-sm">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-700">📄 Upload File</span>
            <button onClick={resetForm} title="Cancel" aria-label="Cancel adding this resource" className="text-slate-400 hover:text-slate-600 font-bold text-sm">×</button>
          </div>
          <input
            type="text"
            placeholder="Display title (optional, defaults to filename)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex items-center gap-2">
            <input
              type="file"
              disabled={uploading}
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
            />
            {uploading && <span className="text-xs text-indigo-600 animate-pulse">Uploading...</span>}
          </div>
          <div className="border-t border-slate-200/70 pt-2">
            <p className="text-[11px] text-slate-500 mb-1.5">
              No file uploads on this project yet — attach it by link instead.
            </p>
            <AttachmentField
              compact
              label=""
              storagePath={`learning_materials/${syllabusId}`}
              onAttached={(url, meta) => {
                onChange([...resources, {
                  _key: newKey(),
                  id: null,
                  title: title.trim() || meta?.name || 'Attachment',
                  // A pasted link is stored as a link resource, not a file: the
                  // reader renders them the same but only 'file' implies we hold
                  // the bytes, and we do not.
                  resource_type: meta?.kind === 'file' ? 'file' : 'link',
                  url,
                  content_markdown: '',
                }])
                resetForm()
              }}
            />
          </div>
        </div>
      )}

      {addingType === 'link' && (
        <div className="bg-white border border-indigo-100 rounded-lg p-3 space-y-2 shadow-sm">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-700">🔗 Add Link</span>
            <button onClick={resetForm} title="Cancel" aria-label="Cancel adding this resource" className="text-slate-400 hover:text-slate-600 font-bold text-sm">×</button>
          </div>
          <input
            type="text"
            placeholder="Link title (e.g. Lecture Slides)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="url"
            placeholder="Link URL (e.g. https://slides.com/...)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={resetForm} className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
            <button onClick={handleAdd} className="px-2 py-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded font-semibold">Save Link</button>
          </div>
        </div>
      )}

      {addingType === 'rich_text' && (
        <div className="bg-white border border-indigo-100 rounded-lg p-3 space-y-2 shadow-sm">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-700">✍️ Write Note (Markdown)</span>
            <button onClick={resetForm} title="Cancel" aria-label="Cancel adding this resource" className="text-slate-400 hover:text-slate-600 font-bold text-sm">×</button>
          </div>
          <input
            type="text"
            placeholder="Note title (e.g. Week 1 Instructions)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <textarea
            rows={3}
            placeholder="Write markdown here..."
            value={contentMarkdown}
            onChange={(e) => setContentMarkdown(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={resetForm} className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
            <button onClick={handleAdd} className="px-2 py-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded font-semibold">Save Note</button>
          </div>
        </div>
      )}

      {/* Resources List */}
      {resources.length > 0 && (
        <div className="space-y-1.5">
          {resources.map((res) => {
            let icon = '📄'
            if (res.resource_type === 'link') icon = '🔗'
            if (res.resource_type === 'rich_text') icon = '✍️'

            return (
              <div key={res._key} className="flex items-center justify-between bg-white border border-slate-150 rounded px-2.5 py-1.5 text-xs shadow-sm">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm">{icon}</span>
                  <span className="font-semibold text-slate-700 truncate">{res.title}</span>
                  {res.resource_type === 'link' && (
                    <span className="text-[10px] text-slate-400 truncate max-w-[120px]">({res.url})</span>
                  )}
                  {res.resource_type === 'rich_text' && (
                    <span className="text-[10px] text-slate-400 font-mono">({res.content_markdown?.slice(0, 15)}...)</span>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(res._key)}
                  className="text-slate-400 hover:text-red-500 font-bold ml-2 text-sm"
                  title="Remove resource"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function move(list, index, delta) {
  const next = [...list]
  const target = index + delta
  if (target < 0 || target >= next.length) return list
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function GenerateModal({ onClose, onDraft }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Generate a syllabus with AI', closeOnBackdrop: false })
  const [subjectCode, setSubjectCode] = useState('')
  const [subjectDesc, setSubjectDesc] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [durationWeeks, setDurationWeeks] = useState(10)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)

  const inputCls =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white w-full'

  /**
   * Report a failure where the teacher is looking, not only where the markup
   * puts it.
   *
   * This panel is `max-h-[90vh] overflow-y-auto` and the banner renders above
   * five fields and a notes textarea, with "✨ Generate" below all of them. The
   * banner alone is therefore only reliable while the panel fits the viewport
   * -- and the fields are `grid-cols-1 sm:grid-cols-2`, so below 640px they
   * stack into four rows and the panel is at its tallest exactly when the
   * viewport is at its shortest. On a narrow or short screen the teacher
   * scrolls down to press Generate, the button drops back to its idle label,
   * and the reason is off-screen above: the failure reads as nothing having
   * happened. Same shape as the quiz-builder publish bug (BACKLOG 25).
   *
   * The toast is what makes it viewport-independent; the banner stays for the
   * detail and for anyone who never scrolled.
   */
  function fail(message) {
    setError(message)
    toast.error(message)
  }

  async function generate() {
    if (!subjectCode.trim() && !subjectDesc.trim()) {
      fail('Please provide a subject code or description')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const draft = await generateSyllabus({
        subjectCode,
        subjectDescription: subjectDesc,
        gradeLevel,
        durationWeeks,
        notes,
      })
      onDraft(draft)
    } catch (err) {
      fail(err.message)
      setGenerating(false)
    }
  }

  return (
    <div {...overlayProps} className="fixed inset-0 bg-slate-900/50 flex items-center justify-center px-4 z-50">
      <div {...panelProps} className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
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
            className="rounded-lg px-4 py-2 font-medium transition hover:brightness-110 disabled:opacity-50"
            style={{ background: '#0E2A5C', color: '#FAFAF6', border: 'none', cursor: 'pointer' }}
          >
            {generating ? 'Generating draft...' : '✨ Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SyllabusEditor({ syllabusId, initial, isAiDraft, isNewDraft, classes, onSaved, onCancel }) {
  const [tree, setTree] = useState(initial)
  const [genModule, setGenModule] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [assignedClassIds, setAssignedClassIds] = useState(initial.class_ids ?? [])

  const setModules = (modules) => setTree((t) => ({ ...t, modules }))
  const updateModule = (mIdx, patch) =>
    setModules(tree.modules.map((m, i) => (i === mIdx ? { ...m, ...patch } : m)))
  const updateTopic = (mIdx, tIdx, patch) =>
    updateModule(mIdx, {
      topics: tree.modules[mIdx].topics.map((t, i) => (i === tIdx ? { ...t, ...patch } : t)),
    })

  const toggleClass = (classId) => {
    if (assignedClassIds.includes(classId)) {
      setAssignedClassIds(assignedClassIds.filter((id) => id !== classId))
    } else {
      setAssignedClassIds([...assignedClassIds, classId])
    }
  }

  async function save() {
    if (!tree.title.trim()) {
      setError('Syllabus title is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const modules = tree.modules.map((m) => ({
        id: m.id || newId(),
        title: m.title,
        description: m.description,
        // Per-module release. Defaults to published so existing syllabi do not
        // silently vanish from students the first time one is re-saved.
        published: m.published !== false,
        topics: m.topics.map((t) => ({
          id: t.id || newId(),
          title: t.title,
          learning_objectives: t.objectivesText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          resources: (t.resources ?? []).map((r) => ({
            id: r.id || newId(),
            title: r.title,
            resource_type: r.resource_type,
            url: r.url ?? '',
            content_markdown: r.content_markdown ?? '',
          })),
        })),
      }))

      const payload = {
        title: tree.title,
        description: tree.description,
        source: isAiDraft ? 'ai_generated' : tree.source || 'manual',
        modules,
        class_ids: assignedClassIds,
      }

      await setDoc(doc(db, 'syllabi', syllabusId), {
        ...payload,
        id: syllabusId,
        teacher_id: initial.teacher_id,
        updated_at: serverTimestamp(),
      })

      // Update Firestore class documents to set or clear syllabus_id
      const batch = writeBatch(db)
      for (const clazz of classes) {
        const classRef = doc(db, 'classes', clazz.id)
        if (assignedClassIds.includes(clazz.id)) {
          batch.update(classRef, { syllabus_id: syllabusId })
        } else if (clazz.syllabus_id === syllabusId) {
          batch.update(classRef, { syllabus_id: null })
        }
      }
      await batch.commit()

      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Reuses toDraftState so a generated module arrives in exactly the shape the
  // editor already manipulates -- _key for React, ids null until first save,
  // objectives as newline text rather than an array.
  function appendGeneratedModule(draft) {
    const asTree = toDraftState({ title: tree.title, modules: [draft] }, tree.source)
    setModules([...tree.modules, ...asTree.modules])
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto pb-12">
      {genModule && (
        <GenerateModuleModal
          tree={tree}
          subject={{ description: tree.title, code: '' }}
          onAppend={appendGeneratedModule}
          onClose={() => setGenModule(false)}
        />
      )}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-lg font-bold text-slate-800">Syllabus Details</h3>
          {isAiDraft && (
            <p className="text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
              ✨ AI-generated draft — review and edit below, then save.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Syllabus Title</span>
            <input
              value={tree.title}
              onChange={(e) => setTree((t) => ({ ...t, title: e.target.value }))}
              placeholder="e.g. Grade 10 Mathematics Syllabus"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Description</span>
            <textarea
              rows={2}
              value={tree.description}
              onChange={(e) => setTree((t) => ({ ...t, description: e.target.value }))}
              placeholder="e.g. Course objectives, policies, and overview."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
        </div>

        {tree.modules.map((module, mIdx) => (
          <div key={module._key} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
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
                <button
                  onClick={() => updateModule(mIdx, { published: module.published === false })}
                  title={module.published === false ? 'Publish this module to students' : 'Unpublish — hides it from students'}
                  className="px-1 text-xs font-semibold"
                  style={{ color: module.published === false ? '#9AA6BD' : '#1F8A5B' }}
                >
                  {module.published === false ? 'Draft' : 'Live'}
                </button>
                <button onClick={() => setModules(move(tree.modules, mIdx, -1))} title="Move up" className="text-slate-400 hover:text-slate-600 px-1">↑</button>
                <button onClick={() => setModules(move(tree.modules, mIdx, 1))} title="Move down" className="text-slate-400 hover:text-slate-600 px-1">↓</button>
                <button
                  onClick={async () => {
                    if (await confirmDialog({
                      title: `Remove module "${module.title || mIdx + 1}"?`,
                      message: 'Its sub-modules go with it. Nothing is written until you save the syllabus, so leaving without saving still undoes this.',
                      confirmLabel: 'Remove module',
                      tone: 'danger',
                    })) {
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
                <div key={topic._key} className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <input
                      placeholder={`Sub-module ${tIdx + 1} title`}
                      value={topic.title}
                      onChange={(e) => updateTopic(mIdx, tIdx, { title: e.target.value })}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button onClick={() => updateModule(mIdx, { topics: move(module.topics, tIdx, -1) })} title="Move up" className="text-slate-400 hover:text-slate-600">↑</button>
                    <button onClick={() => updateModule(mIdx, { topics: move(module.topics, tIdx, 1) })} title="Move down" className="text-slate-400 hover:text-slate-600">↓</button>
                    <button
                      onClick={() => updateModule(mIdx, { topics: module.topics.filter((_, i) => i !== tIdx) })}
                      title="Remove sub-module"
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
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <TopicResourceEditor
                    syllabusId={syllabusId}
                    topic={topic}
                    onChange={(resources) => updateTopic(mIdx, tIdx, { resources })}
                  />
                </div>
              ))}
              <button
                onClick={() => updateModule(mIdx, { topics: [...module.topics, emptyTopic()] })}
                className="text-sm text-indigo-600 font-medium hover:underline flex items-center gap-1"
              >
                + Add sub-module
              </button>
            </div>
          </div>
        ))}

        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => setModules([...tree.modules, emptyModule()])}
              className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50"
            >
              + Add Module
            </button>
            <button
              onClick={() => setGenModule(true)}
              className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50 inline-flex items-center gap-1.5"
            >
              <Sparkles className="h-4 w-4" /> Generate Module
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg px-5 py-2 font-medium hover:opacity-90 transition"
              style={{ background: '#0E2A5C', color: '#FAFAF6', border: 'none', cursor: 'pointer' }}
            >
              {saving ? 'Saving...' : 'Save Syllabus'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-lg font-bold text-slate-800 mb-1">Apply to Classes</h3>
          <p className="text-xs text-slate-500 mb-4">Select which class sections will share this syllabus.</p>
          {classes.length === 0 ? (
            <p className="text-sm text-slate-400">No classes found.</p>
          ) : (
            <div className="space-y-2">
              {classes.map((clazz) => {
                const checked = assignedClassIds.includes(clazz.id)
                return (
                  <label
                    key={clazz.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleClass(clazz.id)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{clazz.section}</div>
                      <div className="text-xs text-slate-500">{clazz.subject}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SyllabusIndexPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const [editingSyllabus, setEditingSyllabus] = useState(null)
  const [draft, setDraft] = useState(null)
  const [showGenerate, setShowGenerate] = useState(false)

  // Fetch SQLite class data
  const { data: classes } = useTeacherClasses()

  // Fetch SQLite syllabi
  const { data: sqliteSyllabiData = [], isLoading: syllabiLoading, refetch } = useSyllabi()

  const [runDelete, deleting] = useAsyncAction(handleDelete)

  async function handleDelete(syllabusId) {
    if (!(await confirmDialog({
      title: 'Delete this syllabus?',
      message: 'Every class currently linked to it loses that link, and students stop seeing it. This cannot be undone.',
      confirmLabel: 'Delete syllabus',
      tone: 'danger',
    }))) return
    try {
      await deleteDoc(doc(db, 'syllabi', syllabusId))

      // Clear syllabus_id on any classes pointing to this syllabus in Firestore
      const batch = writeBatch(db)
      for (const clazz of (classes ?? [])) {
        if (clazz.syllabus_id === syllabusId) {
          batch.update(doc(db, 'classes', clazz.id), { syllabus_id: null })
        }
      }
      await batch.commit()

      refetch()
      queryClient.invalidateQueries({ queryKey: ['fs-classes'] })
    } catch (err) {
      toast.error(`Could not delete the syllabus: ${err.message}`)
    }
  }

  if (syllabiLoading) {
    return <SkeletonList count={4} height={96} label="Loading syllabi" />
  }

  if (editingSyllabus) {
    const initial = draft
      ? toDraftState(draft.tree, draft.ai ? 'ai_generated' : 'manual')
      : toDraftState(editingSyllabus, editingSyllabus.source)

    if (draft) {
      initial.class_ids = editingSyllabus.class_ids ?? []
    }

    return (
      <div>
        <div className="max-w-6xl mx-auto flex items-center justify-between mb-6">
          <button
            onClick={() => {
              setEditingSyllabus(null)
              setDraft(null)
            }}
            className="text-indigo-600 font-bold hover:underline flex items-center gap-1"
          >
            ← Back to Syllabus List
          </button>
        </div>
        <SyllabusEditor
          syllabusId={editingSyllabus.id}
          initial={{ ...initial, teacher_id: profile.id }}
          isAiDraft={!!draft?.ai}
          isNewDraft={!!draft}
          classes={classes ?? []}
          onSaved={() => {
            setEditingSyllabus(null)
            setDraft(null)
            refetch()
            queryClient.invalidateQueries({ queryKey: ['fs-classes'] })
          }}
          onCancel={() => {
            setEditingSyllabus(null)
            setDraft(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[clamp(28px,4vw,36px)]" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: ink }}>Syllabus & LMS Manager</h2>
          <p className="text-slate-500 mt-1">
            Create modules globally, attach learning materials, and share them across your classes.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const newSyllId = newId()
              setEditingSyllabus({
                id: newSyllId,
                title: '',
                description: '',
                source: 'manual',
                modules: [{ title: '', description: '', topics: [{ title: '', objectives: [] }] }],
                class_ids: [],
              })
              setDraft(null)
            }}
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
      </div>

      {sqliteSyllabiData.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500">You haven't created any shared syllabi yet.</p>
          <p className="text-xs text-slate-400 mt-1">Click one of the buttons above to build one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sqliteSyllabiData.map((syllabus) => {
            const moduleCount = syllabus.modules?.length ?? 0
            const topicCount = (syllabus.modules ?? []).reduce((sum, m) => sum + (m.topics?.length ?? 0), 0)
            const assignedClasses = (classes ?? []).filter((c) => c.syllabus_id === syllabus.id)

            return (
              <div key={syllabus.id} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between hover:shadow-md transition">
                <div>
                  <h3 className="font-bold text-lg text-slate-800 leading-snug">{syllabus.title}</h3>
                  {syllabus.description && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{syllabus.description}</p>
                  )}

                  <div className="flex gap-4 mt-4 text-xs text-slate-400">
                    <div>
                      <span className="font-semibold text-slate-600">{moduleCount}</span> Modules
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">{topicCount}</span> Sub-modules
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {assignedClasses.length === 0 ? (
                      <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Not assigned</span>
                    ) : (
                      assignedClasses.map((c) => (
                        <span key={c.id} className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {c.section}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    onClick={() => runDelete(syllabus.id)}
                    disabled={deleting}
                    title="Delete syllabus"
                    aria-label="Delete syllabus"
                    className="p-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditingSyllabus(syllabus)}
                    className="flex items-center gap-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm"
                  >
                    <Edit className="h-4 w-4" /> Edit
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showGenerate && (
        <GenerateModal
          onClose={() => setShowGenerate(false)}
          onDraft={(d) => {
            setShowGenerate(false)
            const newSyllId = newId()
            setEditingSyllabus({
              id: newSyllId,
              title: d.title ?? '',
              description: d.description ?? '',
              source: 'ai_generated',
              modules: d.modules ?? [],
              class_ids: [],
            })
            setDraft({ ai: true, tree: d })
          }}
        />
      )}
    </div>
  )
}
