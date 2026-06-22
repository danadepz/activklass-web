import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { fetchUsersByIds } from '@/lib/roster'
import { loadStudentEntry } from '@/lib/studentData'
import { BookOpen, ChevronRight } from '@/components/icons'

const navy = '#0E2A5C'
const ink = '#0A1733'
const gold = '#F5C518'
const muted = '#6A7A95'
const faint = '#9AA6BD'
const green = '#1F8A5B'
const blueText = '#1E6FB0'
const red = '#C0392B'
const line = 'rgba(14,42,92,0.08)'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }

function gradeColor(g) {
  if (g == null) return faint
  if (g >= 90) return green
  if (g >= 85) return blueText
  if (g >= 75) return '#8B6A00'
  return red
}

function classBadge(c) {
  const base = (c.subject_code || c.subject || c.section || '').toUpperCase()
  const letters = base.match(/[A-Z]+/)?.[0] ?? ''
  const digits = base.match(/\d+/)?.[0] ?? ''
  if (letters && digits) return (letters[0] + digits).slice(0, 4)
  return base.replace(/[^A-Z0-9]/g, '').slice(0, 3) || '—'
}

async function loadClasses(profile) {
  const snap = await getDocs(query(collection(db, 'classes'), where('student_ids', 'array-contains', profile.id)))
  const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const teacherIds = [...new Set(raw.map((c) => c.teacher_id).filter(Boolean))]
  const teachers = teacherIds.length ? await fetchUsersByIds(teacherIds).catch(() => []) : []
  const teacherName = (id) => {
    const t = teachers.find((u) => u.id === id)
    return t ? `${t.first_name} ${t.last_name}` : 'Teacher'
  }
  return Promise.all(
    raw.map(async (c) => {
      const entry = await loadStudentEntry(c.id, profile.id)
      return { ...c, teacher_name: teacherName(c.teacher_id), current_grade: entry?.final_grade ?? null }
    }),
  )
}

export default function StudentClassesIndex() {
  const { profile } = useAuth()
  const { data: classes, isLoading } = useQuery({
    queryKey: ['student-classes', profile.id],
    queryFn: () => loadClasses(profile),
  })

  const list = classes ?? []

  return (
    <div>
      <h1 className="text-[clamp(26px,3.5vw,34px)]" style={{ ...serif, lineHeight: 1.1, margin: '0 0 4px', color: ink }}>
        My Classes
      </h1>
      <p style={{ fontSize: 14, color: muted, margin: '0 0 24px' }}>
        Classes you've been enrolled in. Open one to see topics, grades, attendance, and announcements.
      </p>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{ height: 132, borderRadius: 16, background: '#FFFFFF', border: `1px solid ${line}` }} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 44, textAlign: 'center' }}>
          <div style={{ display: 'inline-grid', placeItems: 'center', width: 48, height: 48, borderRadius: 12, background: 'rgba(14,42,92,0.08)', color: navy }}>
            <BookOpen className="h-6 w-6" />
          </div>
          <h3 style={{ ...serif, fontSize: 22, margin: '16px 0 6px', color: ink }}>No classes yet</h3>
          <p style={{ fontSize: 14, color: muted, margin: 0 }}>
            Your enrolled classes will show up here automatically once a teacher adds you to a roster.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Link
              key={c.id}
              to={`/student/classes/${c.id}`}
              className="ak-card-hov block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
              style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20, textDecoration: 'none' }}
            >
              <div className="flex items-start gap-3">
                <span style={{ ...mono, width: 40, height: 40, borderRadius: 10, background: navy, color: gold, display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 600, fontSize: 12 }}>
                  {classBadge(c)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ink, lineHeight: 1.2 }}>
                    {c.subject_code ? `${c.subject_code} · ` : ''}{c.section}
                  </div>
                  {c.subject && <div style={{ fontSize: 13, color: muted, marginTop: 3 }}>{c.subject}</div>}
                  <div style={{ fontSize: 12.5, color: faint, marginTop: 3 }}>{c.teacher_name}</div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#C3CCDB' }} />
              </div>
              <div className="flex items-center justify-between" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(14,42,92,0.07)' }}>
                <span style={{ ...mono, fontSize: 12.5, color: muted }}>{c.academic_year ?? c.school_year ?? ''}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: gradeColor(c.current_grade) }}>
                  {c.current_grade == null ? 'No grade yet' : `Grade ${Math.round(c.current_grade)}`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
