import { useState } from 'react'
import { NavLink, Link, Outlet, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { classToForm } from '@/lib/classForm'
import ClassFormModal from '@/features/classes/ClassFormModal'

const navy = '#0E2A5C'
const ink = '#0A1733'
const gold = '#F5C518'
const goldDeep = '#8B6A00'
const muted = '#6A7A95'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }
const sans = "'Plus Jakarta Sans', sans-serif"

// Sub-navbar shown at the top of every page inside a specific class.
// Paths are relative to /teacher/classes/:classId. The Overview tab is the
// index (analytics + roster); the rest map to the per-class tools.
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

function tabStyle({ isActive }) {
  return {
    padding: '12px 14px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: sans,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    borderBottom: '2.5px solid transparent',
    marginBottom: -1.5,
    color: isActive ? navy : muted,
    borderBottomColor: isActive ? gold : 'transparent',
  }
}

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
      <Link
        to="/teacher/classes"
        className="inline-flex items-center gap-1.5 transition hover:opacity-70"
        style={{ fontSize: 13, fontWeight: 600, color: navy, textDecoration: 'none', marginBottom: 14 }}
      >
        ← My Classes
      </Link>

      <div className="flex items-start justify-between gap-4" style={{ marginTop: 8, marginBottom: 22 }}>
        <div>
          <h1 className="text-[clamp(28px,4vw,38px)]" style={{ ...serif, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 7px', color: ink }}>
            {clazz
              ? `${clazz.subject_code ? `${clazz.subject_code} · ` : ''}${clazz.section}`
              : 'Class'}
          </h1>
          {subtitle && <p style={{ ...mono, fontSize: 14, color: muted, margin: 0 }}>{subtitle}</p>}
        </div>
        {clazz && (
          <button
            onClick={() => setShowEdit(true)}
            className="shrink-0 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11, cursor: 'pointer' }}
          >
            ✎ Edit class
          </button>
        )}
      </div>

      {warning && (
        <div
          className="flex items-start justify-between gap-3"
          style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 11, padding: '12px 16px', marginBottom: 16, fontSize: 13.5, color: goldDeep }}
        >
          <span>{warning}</span>
          <button onClick={() => setWarning(null)} style={{ color: goldDeep, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
            ✕
          </button>
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto" style={{ borderBottom: '1.5px solid rgba(14,42,92,0.1)', marginBottom: 26 }}>
        {TABS.map((tab) => (
          <NavLink key={tab.to || 'overview'} to={tab.to ? `${base}/${tab.to}` : base} end={tab.end} style={tabStyle}>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />

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
