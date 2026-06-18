import { useState } from 'react'
import { NavLink, Link, Outlet, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { classToForm } from '../../lib/classForm'
import ClassFormModal from './ClassFormModal'

// Sub-navbar shown at the top of every page inside a specific class.
// Paths are relative to /teacher/classes/:classId. The Overview tab is the
// index (analytics + class list); the rest map to the per-class tools.
const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'record', label: 'Class Record' },
  { to: 'performance', label: 'Performance' },
  { to: 'attendance', label: 'Attendance' },
  { to: 'syllabus', label: 'Syllabus' },
  { to: 'quizzes', label: 'Quizzes' },
  { to: 'scaffolds', label: 'Scaffold Topics' },
  { to: 'grading', label: 'Configuration' },
  { to: 'history', label: 'History' },
]

export default function ClassLayout() {
  const { classId } = useParams()
  const queryClient = useQueryClient()
  const base = `/teacher/classes/${classId}`
  const [showEdit, setShowEdit] = useState(false)
  const [warning, setWarning] = useState(null)

  const { data: clazz } = useQuery({
    queryKey: ['fs-class-meta', classId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'classes', classId))
      return snap.exists() ? { id: snap.id, ...snap.data() } : null
    },
  })

  const subtitle = clazz
    ? [clazz.subject, clazz.academic_year, clazz.schedule].filter(Boolean).join(' · ')
    : ''

  return (
    <div>
      <Link to="/teacher/classes" className="text-sm text-indigo-600 hover:underline">
        ← My Classes
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {clazz
              ? `${clazz.subject_code ? `${clazz.subject_code} · ` : ''}${clazz.section}`
              : 'Class'}
          </h2>
          {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {clazz && (
          <button
            onClick={() => setShowEdit(true)}
            className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            ✎ Edit class
          </button>
        )}
      </div>

      {warning && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 flex items-start justify-between gap-3">
          <span>{warning}</span>
          <button onClick={() => setWarning(null)} className="text-amber-600 hover:text-amber-800 shrink-0">
            ✕
          </button>
        </p>
      )}

      <nav className="mt-4 border-b border-slate-200 flex gap-1 overflow-x-auto">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to || 'overview'}
            to={tab.to ? `${base}/${tab.to}` : base}
            end={tab.end}
            className={({ isActive }) =>
              `whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                isActive
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6">
        <Outlet />
      </div>

      {showEdit && clazz && (
        <ClassFormModal
          mode="edit"
          classId={classId}
          initial={classToForm(clazz)}
          currentSyllabusFile={clazz.syllabus_file}
          onClose={() => setShowEdit(false)}
          onSaved={({ warning: w }) => {
            queryClient.invalidateQueries({ queryKey: ['fs-class-meta', classId] })
            queryClient.invalidateQueries({ queryKey: ['fs-class', classId] })
            queryClient.invalidateQueries({ queryKey: ['fs-classes'] })
            setShowEdit(false)
            setWarning(w ?? null)
          }}
        />
      )}
    </div>
  )
}
