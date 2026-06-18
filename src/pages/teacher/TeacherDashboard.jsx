import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../context/useAuth'
import {
  Layers,
  Users,
  TrendingUp,
  AlertCircle,
  Check,
  Plus,
  CalendarCheck,
  FileText,
  BarChart,
  ChevronRight,
  ArrowRight,
} from '../../components/icons'

const navy = '#0E2A5C'
const ink = '#0A1733'
const gold = '#F5C518'
const goldDeep = '#8B6A00'
const muted = '#6A7A95'
const faint = '#9AA6BD'
const blueText = '#1E6FB0'
const line = 'rgba(14,42,92,0.08)'

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }

const QUICK_ACTIONS = [
  { to: '/teacher/classes', label: 'New class', hint: 'Add a section', Icon: Plus, bg: 'rgba(14,42,92,0.08)', color: navy },
  { to: '/teacher/attendance', label: 'Take attendance', hint: "Mark today's sheet", Icon: CalendarCheck, bg: 'rgba(63,169,245,0.14)', color: blueText },
  { to: '/teacher/quizzes', label: 'Create a quiz', hint: 'Build or AI-generate', Icon: FileText, bg: 'rgba(245,197,24,0.2)', color: goldDeep },
  { to: '/teacher/analytics', label: 'View analytics', hint: 'Risk & mastery', Icon: BarChart, bg: 'rgba(14,42,92,0.08)', color: navy },
]

// Compact class badge, e.g. "MATH10" -> "M10", "ENG" -> "ENG".
function classBadge(c) {
  const base = (c.subject_code || c.subject || c.section || '').toUpperCase()
  const letters = base.match(/[A-Z]+/)?.[0] ?? ''
  const digits = base.match(/\d+/)?.[0] ?? ''
  if (letters && digits) return (letters[0] + digits).slice(0, 4)
  return base.replace(/[^A-Z0-9]/g, '').slice(0, 3) || '—'
}

function MetricCard({ label, value, sub, Icon, iconBg, iconColor, highlight, loading }) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 16,
        padding: 22,
        border: highlight ? '1px solid rgba(245,197,24,0.4)' : `1px solid ${line}`,
        boxShadow: highlight ? '0 0 0 3px rgba(245,197,24,0.08)' : 'none',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: muted }}>{label}</span>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: iconBg, color: iconColor, display: 'grid', placeItems: 'center' }}>
          <Icon className="h-[17px] w-[17px]" />
        </span>
      </div>
      {loading ? (
        <div className="animate-pulse rounded-lg bg-slate-200" style={{ height: 40, width: 56 }} />
      ) : (
        <div style={{ ...serif, fontSize: 44, lineHeight: 1, color: ink }}>{value}</div>
      )}
      {sub && !loading && <div style={{ fontSize: 12, color: faint, marginTop: 8 }}>{sub}</div>}
    </div>
  )
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

export default function TeacherDashboard() {
  const { profile } = useAuth()
  const { data: classes, isLoading } = useQuery({
    queryKey: ['fs-classes', profile.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'classes'), where('teacher_id', '==', profile.id)),
      )
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
  })

  const list = classes ?? []
  const totalStudents = list.reduce((sum, c) => sum + (c.student_ids?.length ?? 0), 0)
  const avgClassSize = list.length ? Math.round(totalStudents / list.length) : 0
  const emptyRosters = list.filter((c) => (c.student_ids?.length ?? 0) === 0)
  const hasClasses = list.length > 0
  const needsAttention = !isLoading && emptyRosters.length > 0

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[clamp(30px,4vw,40px)]" style={{ ...serif, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 8px', color: ink }}>
            Welcome back, {profile.first_name}!
          </h1>
          <p style={{ fontSize: 15, color: muted, margin: 0 }}>
            {today} · Here's what's happening across your classes.
          </p>
        </div>
        <Link
          to="/teacher/analytics"
          className="inline-flex shrink-0 items-center gap-2 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
          style={{ padding: '11px 18px', fontSize: 14, fontWeight: 700, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11, textDecoration: 'none', boxShadow: '0 2px 0 rgba(14,42,92,0.05)' }}
        >
          Overall analytics
          <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy }}>
            <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Classes" value={list.length} Icon={Layers} iconBg="rgba(14,42,92,0.08)" iconColor={navy} loading={isLoading} />
        <MetricCard label="Students" value={totalStudents} Icon={Users} iconBg="rgba(63,169,245,0.14)" iconColor={blueText} loading={isLoading} />
        <MetricCard
          label="Avg. class size"
          value={hasClasses ? avgClassSize : '—'}
          sub={hasClasses ? 'students per section' : undefined}
          Icon={TrendingUp}
          iconBg="rgba(63,169,245,0.14)"
          iconColor={blueText}
          loading={isLoading}
        />
        <MetricCard
          label="Rosters to fill"
          value={emptyRosters.length}
          sub={emptyRosters.length === 0 ? 'all sections have students' : 'sections with no students'}
          Icon={emptyRosters.length > 0 ? AlertCircle : Check}
          iconBg={emptyRosters.length > 0 ? 'rgba(245,197,24,0.2)' : 'rgba(31,138,91,0.14)'}
          iconColor={emptyRosters.length > 0 ? goldDeep : '#1F8A5B'}
          highlight={needsAttention}
          loading={isLoading}
        />
      </div>

      {/* Needs attention */}
      {needsAttention && (
        <div className="mt-6" style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 16, padding: '20px 22px' }}>
          <div className="flex items-center gap-2.5" style={{ marginBottom: 14 }}>
            <AlertCircle className="h-[17px] w-[17px]" style={{ color: goldDeep }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: goldDeep }}>Needs your attention</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {emptyRosters.slice(0, 4).map((c) => (
              <Link
                key={c.id}
                to={`/teacher/classes/${c.id}`}
                className="flex items-center justify-between gap-3 transition hover:brightness-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
                style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 11, padding: '14px 18px', textDecoration: 'none' }}
              >
                <span style={{ fontSize: 14, color: '#3A4A6B' }}>
                  <strong style={{ color: ink }}>{c.section}</strong> has no students yet — add a roster.
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: navy }} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state vs. classes + quick actions */}
      {!isLoading && !hasClasses ? (
        <div className="mt-9 text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 40 }}>
          <span style={{ display: 'inline-grid', placeItems: 'center', width: 48, height: 48, borderRadius: 12, background: 'rgba(14,42,92,0.08)', color: navy }}>
            <Layers className="h-6 w-6" />
          </span>
          <h2 style={{ ...serif, fontSize: 24, margin: '16px 0 6px', color: ink }}>You have no classes yet</h2>
          <p style={{ fontSize: 14, color: muted, margin: 0 }}>
            Create your first class section to start building its roster.
          </p>
          <Link
            to="/teacher/classes"
            className="mt-5 inline-flex items-center gap-2 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3FA9F5] focus-visible:ring-offset-2"
            style={{ padding: '13px 20px', fontSize: 14, fontWeight: 700, color: '#FAFAF6', background: navy, borderRadius: 11, textDecoration: 'none', boxShadow: '0 3px 0 #061840, 0 10px 24px -12px rgba(14,42,92,0.5)' }}
          >
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy }}>
              <Plus className="h-3.5 w-3.5" />
            </span>
            Create your first class
          </Link>
        </div>
      ) : (
        <div className="mt-9 grid grid-cols-1 gap-10 lg:grid-cols-[1.3fr_1fr]">
          {/* Classes */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 style={{ ...serif, fontSize: 24, margin: 0, color: ink }}>Your classes</h2>
              <Link
                to="/teacher/classes"
                className="inline-flex items-center gap-1.5 transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C] rounded"
                style={{ fontSize: 13, fontWeight: 700, color: navy, textDecoration: 'none' }}
              >
                Manage classes <span style={{ color: gold }}>→</span>
              </Link>
            </div>
            <div className="flex flex-col gap-[18px]">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="animate-pulse" style={{ height: 132, borderRadius: 16, background: '#FFFFFF', border: `1px solid ${line}` }} />
                  ))
                : list.slice(0, 6).map((c) => <ClassCard key={c.id} c={c} />)}
            </div>
          </section>

          {/* Quick actions */}
          <aside>
            <h2 className="mb-4" style={{ ...serif, fontSize: 24, margin: '0 0 16px', color: ink }}>Quick actions</h2>
            <div className="flex flex-col gap-2.5">
              {QUICK_ACTIONS.map(({ to, label, hint, Icon, bg, color }) => (
                <Link
                  key={to}
                  to={to}
                  className="ak-action flex items-center gap-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
                  style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 13, padding: '15px 18px', textDecoration: 'none' }}
                >
                  <span style={{ width: 38, height: 38, borderRadius: 10, background: bg, color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: ink }}>{label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: muted, marginTop: 1 }}>{hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#C3CCDB' }} />
                </Link>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
