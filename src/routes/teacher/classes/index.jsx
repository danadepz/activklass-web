import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { emptyClassForm } from '@/lib/classForm'
import ClassFormModal from '@/features/classes/ClassFormModal'

const navy = '#0E2A5C'
const navyDeep = '#061840'
const ink = '#0A1733'
const gold = '#F5C518'
const goldDeep = '#8B6A00'
const muted = '#6A7A95'
const faint = '#9AA6BD'
const line = 'rgba(14,42,92,0.08)'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }
const sans = "'Plus Jakarta Sans', sans-serif"

// Compact class badge, e.g. "MATH10" -> "M10", "ENG" -> "ENG".
function classBadge(c) {
  const base = (c.subject_code || c.subject || c.section || '').toUpperCase()
  const letters = base.match(/[A-Z]+/)?.[0] ?? ''
  const digits = base.match(/\d+/)?.[0] ?? ''
  if (letters && digits) return (letters[0] + digits).slice(0, 4)
  return base.replace(/[^A-Z0-9]/g, '').slice(0, 3) || '—'
}

function ClassCard({ c }) {
  const count = c.student_ids?.length ?? 0
  return (
    <Link
      to={`/teacher/classes/${c.id}`}
      className="ak-card-hov block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
      style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22, textDecoration: 'none' }}
    >
      <div className="flex items-start gap-3" style={{ marginBottom: 18 }}>
        <span style={{ ...mono, width: 40, height: 40, borderRadius: 10, background: navy, color: gold, display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 600, fontSize: 12 }}>
          {classBadge(c)}
        </span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: ink, lineHeight: 1.2 }}>
            {c.subject_code ? `${c.subject_code} · ` : ''}
            {c.section}
          </div>
          {c.subject && <div style={{ fontSize: 13, color: muted, marginTop: 3 }}>{c.subject}</div>}
          {c.schedule && <div style={{ ...mono, fontSize: 12, color: faint, marginTop: 2 }}>{c.schedule}</div>}
        </div>
      </div>
      <div className="flex items-center justify-between" style={{ paddingTop: 16, borderTop: '1px solid rgba(14,42,92,0.07)' }}>
        <span style={{ ...mono, fontSize: 13, color: muted }}>{c.academic_year}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: navy, background: 'rgba(14,42,92,0.06)', padding: '5px 11px', borderRadius: 999 }}>
          {count}
          {c.max_students ? ` / ${c.max_students}` : ''} student{count === 1 && !c.max_students ? '' : 's'}
        </span>
      </div>
    </Link>
  )
}

export default function ClassesPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [warning, setWarning] = useState(null)

  const { data: classes, isLoading } = useQuery({
    queryKey: ['fs-classes', profile.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'classes'), where('teacher_id', '==', profile.id)),
      )
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
  })

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(30px,4vw,40px)]" style={{ ...serif, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 8px', color: ink }}>
            My Classes
          </h1>
          <p style={{ fontSize: 15, color: muted, margin: 0 }}>Create class sections and manage student rosters.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3FA9F5] focus-visible:ring-offset-2"
          style={{ padding: '13px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 11, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}, 0 10px 24px -12px rgba(14,42,92,0.5)` }}
        >
          <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy, fontSize: 14, lineHeight: 1 }}>+</span>
          New Class
        </button>
      </div>

      {warning && (
        <div
          className="mt-4 flex items-start justify-between gap-3"
          style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 11, padding: '12px 16px', fontSize: 13.5, color: goldDeep }}
        >
          <span>{warning}</span>
          <button onClick={() => setWarning(null)} style={{ color: goldDeep, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
            ✕
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="mt-8" style={{ color: faint }}>Loading classes…</p>
      ) : classes?.length === 0 ? (
        <div className="mt-6 text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 48, color: faint, fontSize: 14 }}>
          No classes yet. Create your first class section to start building its roster.
        </div>
      ) : (
        <div className="mt-6 grid gap-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {classes?.map((c) => (
            <ClassCard key={c.id} c={c} />
          ))}
        </div>
      )}

      {showCreate && (
        <ClassFormModal
          mode="create"
          initial={emptyClassForm()}
          onClose={() => setShowCreate(false)}
          onSaved={({ warning: w }) => {
            queryClient.invalidateQueries({ queryKey: ['fs-classes'] })
            setShowCreate(false)
            setWarning(w ?? null)
          }}
        />
      )}
    </div>
  )
}
