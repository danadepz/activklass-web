import { useState } from 'react'
import { NavLink, Link, Outlet, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { classToForm, academicTerm } from '@/lib/classForm'
import { formatSchedule } from '@/lib/schedule'
import ClassFormModal from '@/features/classes/ClassFormModal'
import { navy, ink, gold, goldDeep, muted, serif, mono, sansFamily as sans } from '@/theme'

// Sub-navbar shown at the top of every page inside a specific class.
// Paths are relative to /teacher/classes/:classId. The Overview tab is the
// index (analytics + roster); the rest map to the per-class tools.
const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'modules', label: 'Modules' },
  { to: 'record', label: 'Class Record' },
  { to: 'performance', label: 'Performance' },
  { to: 'attendance', label: 'Attendance' },
  { to: 'scaffolds', label: 'Scaffold Topics' },
  { to: 'history', label: 'Logs' },
]

// Compact class badge, e.g. "MATH10" -> "M10" (same rule as the dashboard).
function classBadge(c) {
  const base = (c.subject_code || c.subject || c.section || '').toUpperCase()
  const letters = base.match(/[A-Z]+/)?.[0] ?? ''
  const digits = base.match(/\d+/)?.[0] ?? ''
  if (letters && digits) return (letters[0] + digits).slice(0, 4)
  return base.replace(/[^A-Z0-9]/g, '').slice(0, 3) || '—'
}

/** Small meta chip under the class title — one fact per chip. */
function MetaChip({ icon, children, monoFace }) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        ...(monoFace ? mono : null),
        fontSize: 12.5,
        fontWeight: 600,
        color: '#3A4A6B',
        background: 'rgba(14,42,92,0.06)',
        border: '1px solid rgba(14,42,92,0.08)',
        borderRadius: 8,
        padding: '5px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  )
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

  const scheduleChips = clazz ? formatSchedule(clazz.schedule).split(' · ').filter(Boolean) : []

  return (
    <div>
      <Link
        to="/teacher/classes"
        className="inline-flex items-center gap-1.5 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]/40"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#0E2A5C',
          background: 'rgba(14,42,92,0.07)',
          border: '1px solid rgba(14,42,92,0.14)',
          borderRadius: 8,
          padding: '6px 12px',
          textDecoration: 'none',
        }}
      >
        ← My Classes
      </Link>

      {/* Header card — badge + title + one chip per fact, tabs attached below */}
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(14,42,92,0.08)', borderRadius: 16, marginTop: 10, marginBottom: 16, overflow: 'hidden' }}>
        <div className="flex flex-wrap items-start justify-between gap-4" style={{ padding: '26px 22px 22px' }}>
          <div className="flex items-start gap-3.5" style={{ minWidth: 0 }}>
            {clazz && (
              <span
                aria-hidden="true"
                style={{ ...mono, width: 52, height: 52, borderRadius: 13, background: navy, color: gold, display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 600, fontSize: 15 }}
              >
                {classBadge(clazz)}
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <h1 className="text-[clamp(24px,3vw,32px)]" style={{ ...serif, lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0, color: ink }}>
                {clazz
                  ? `${clazz.subject_code ? `${clazz.subject_code} · ` : ''}${clazz.section}`
                  : 'Class'}
              </h1>
              {clazz && (
                <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 9 }}>
                  {clazz.subject && <MetaChip icon="📘">{clazz.subject}</MetaChip>}
                  {academicTerm(clazz) && <MetaChip icon="🗓" monoFace>{academicTerm(clazz)}</MetaChip>}
                  {scheduleChips.map((s) => (
                    <MetaChip key={s} icon="🕑" monoFace>{s}</MetaChip>
                  ))}
                </div>
              )}
            </div>
          </div>
          {clazz && (
            <button
              onClick={() => setShowEdit(true)}
              className="shrink-0 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer' }}
            >
              ✏️ Edit Class
            </button>
          )}
        </div>

        {/* pill tab strip, divided from the header by a hairline */}
        <nav
          className="flex gap-1.5 flex-wrap justify-center"
          style={{ borderTop: '1px solid rgba(14,42,92,0.08)', background: 'rgba(14,42,92,0.03)', padding: '13px 14px' }}
        >
          {TABS.map((tab) => (
            <NavLink
              key={tab.to || 'overview'}
              to={tab.to ? `${base}/${tab.to}` : base}
              end={tab.end}
              className="whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]/40"
              style={({ isActive }) => ({
                padding: '8px 15px',
                fontSize: 13.5,
                fontWeight: 600,
                fontFamily: sans,
                borderRadius: 9,
                textDecoration: 'none',
                color: isActive ? '#FAFAF6' : muted,
                background: isActive ? navy : 'transparent',
                boxShadow: isActive ? '0 2px 6px -2px rgba(14,42,92,0.5)' : 'none',
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {warning && (
        <div
          className="flex items-start justify-between gap-3"
          style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 11, padding: '12px 16px', marginBottom: 16, fontSize: 13.5, color: goldDeep }}
        >
          <span>{warning}</span>
          <button onClick={() => setWarning(null)} title="Dismiss" aria-label="Dismiss this warning" style={{ color: goldDeep, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
            ✕
          </button>
        </div>
      )}

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
