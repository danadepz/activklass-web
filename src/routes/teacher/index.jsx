import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/useAuth'
import { Layers, Users, TrendingUp, AlertCircle, Check, Plus, CalendarCheck, FileText, BarChart, ChevronRight, ArrowRight, Clock } from '@/components/icons'
import { navy, ink, gold, goldDeep, goldChart, muted, faint, blueText, blue, green, line, serifAlt as serif, mono } from '@/theme'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import { formatSchedule } from '@/lib/schedule'
import { academicTerm } from '@/lib/classForm'
import { MetricCard, Panel } from '@/components/ui/Card'

const QUICK_ACTIONS = [
  { to: '/teacher/classes', label: 'New class', hint: 'Add a section', Icon: Plus, bg: 'rgba(14,42,92,0.08)', color: navy },
  { to: '/teacher/attendance', label: 'Take attendance', hint: "Mark today's sheet", Icon: CalendarCheck, bg: 'rgba(63,169,245,0.14)', color: blueText },
  { to: '/teacher/quizzes', label: 'Create a quiz', hint: 'Build or AI-generate', Icon: FileText, bg: 'rgba(245,197,24,0.2)', color: goldDeep },
  { to: '/teacher/classes', label: 'Class Analytics', hint: 'Select a class section', Icon: BarChart, bg: 'rgba(14,42,92,0.08)', color: navy },
]

/* Fixed categorical order for the enrollment donut (validated for CVD-safe
   adjacency against a white surface — see goldChart in theme.js). Slot 4 is
   always the "Other classes" bucket. */
const DONUT_COLORS = [blueText, goldChart, blue, goldDeep]

// Compact class badge, e.g. "MATH10" -> "M10", "ENG" -> "ENG".
function classBadge(c) {
  const base = (c.subject_code || c.subject || c.section || '').toUpperCase()
  const letters = base.match(/[A-Z]+/)?.[0] ?? ''
  const digits = base.match(/\d+/)?.[0] ?? ''
  if (letters && digits) return (letters[0] + digits).slice(0, 4)
  return base.replace(/[^A-Z0-9]/g, '').slice(0, 3) || '—'
}

function classTitle(c) {
  return `${c.subject_code ? `${c.subject_code} · ` : ''}${c.section}`
}

/* --- Class-size bar chart ------------------------------------------------- */

function ClassSizeChart({ list }) {
  const bars = list.slice(0, 8)
  const max = Math.max(...bars.map((c) => c.student_ids?.length ?? 0), 1)
  const ticks = [max, Math.round(max / 2)]
  // Short x-label that survives sibling sections sharing a badge (two "S9"s).
  const barLabel = (c) => c.subject_code || c.section || classBadge(c)

  return (
    <div>
      <div style={{ position: 'relative', height: 210 }}>
        {/* recessive gridlines + axis values */}
        {ticks.map((t) => (
          <div key={t} style={{ position: 'absolute', left: 0, right: 0, bottom: `${(t / max) * 100}%`, borderTop: '1px dashed rgba(14,42,92,0.09)' }}>
            <span style={{ ...mono, position: 'absolute', right: '100%', paddingRight: 6, top: -6, fontSize: 10, color: faint }}>{t}</span>
          </div>
        ))}
        <div style={{ position: 'absolute', inset: 0, marginLeft: 22, display: 'flex', alignItems: 'flex-end', gap: 16, justifyContent: 'space-evenly' }}>
          {bars.map((c) => {
            const count = c.student_ids?.length ?? 0
            return (
              <div key={c.id} className="group" style={{ position: 'relative', flex: '0 1 84px', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                {/* resting value label, replaced by the tooltip on hover */}
                <span
                  className="transition-opacity group-hover:opacity-0"
                  style={{ ...mono, position: 'absolute', bottom: `calc(${(count / max) * 100}% + 6px)`, left: '50%', transform: 'translateX(-50%)', fontSize: 12, fontWeight: 600, color: '#3A4A6B' }}
                >
                  {count}
                </span>
                {/* hover tooltip */}
                <span
                  className="pointer-events-none opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ position: 'absolute', bottom: `calc(${(count / max) * 100}% + 8px)`, left: '50%', transform: 'translateX(-50%)', background: navy, color: '#FAFAF6', fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', zIndex: 1 }}
                >
                  {classTitle(c)} · {count} student{count === 1 ? '' : 's'}
                </span>
                <div
                  className="transition-colors group-hover:bg-[#1E6FB0]"
                  style={{ width: 38, height: `max(${(count / max) * 100}%, 3px)`, background: navy, borderRadius: '5px 5px 0 0' }}
                />
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ marginLeft: 22, display: 'flex', gap: 16, justifyContent: 'space-evenly', borderTop: `1px solid ${line}`, paddingTop: 8 }}>
        {bars.map((c) => (
          <span key={c.id} title={classTitle(c)} style={{ ...mono, flex: '0 1 84px', textAlign: 'center', fontSize: 11.5, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {barLabel(c)}
          </span>
        ))}
      </div>
      {list.length > 8 && (
        <p style={{ fontSize: 11.5, color: faint, margin: '8px 0 0' }}>Showing the 8 largest of {list.length} sections.</p>
      )}
    </div>
  )
}

/* --- Enrollment donut ----------------------------------------------------- */

function EnrollmentDonut({ list, totalStudents }) {
  const sorted = [...list].sort((a, b) => (b.student_ids?.length ?? 0) - (a.student_ids?.length ?? 0))
  const top = sorted.slice(0, 3).filter((c) => (c.student_ids?.length ?? 0) > 0)
  const otherCount = totalStudents - top.reduce((s, c) => s + (c.student_ids?.length ?? 0), 0)
  const segments = [
    ...top.map((c, i) => ({ label: classTitle(c), value: c.student_ids?.length ?? 0, color: DONUT_COLORS[i] })),
    ...(otherCount > 0 ? [{ label: `Other classes (${sorted.length - top.length})`, value: otherCount, color: DONUT_COLORS[3] }] : []),
  ]

  if (totalStudents === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '28px 12px' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: ink, margin: '0 0 4px' }}>No students enrolled yet</p>
        <p style={{ fontSize: 12, color: muted, margin: 0 }}>The enrollment mix will appear once rosters are filled.</p>
      </div>
    )
  }

  const R = 40
  const C = 2 * Math.PI * R
  const GAP = segments.length > 1 ? 2.5 : 0
  let offset = 0

  // Footer indicators — capacity when any section declares one, else a count.
  const capped = list.filter((c) => c.max_students)
  const openSeats = capped.reduce((s, c) => s + Math.max(0, c.max_students - (c.student_ids?.length ?? 0)), 0)
  const largest = sorted[0]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-6">
        <svg width="168" height="168" viewBox="0 0 100 100" role="img" aria-label="Enrollment share by class">
          {segments.map((s) => {
            const len = Math.max((s.value / totalStudents) * C - GAP, 0.5)
            const el = (
              <circle
                key={s.label}
                cx="50" cy="50" r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="13"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
              />
            )
            offset += (s.value / totalStudents) * C
            return el
          })}
          <text x="50" y="48" textAnchor="middle" style={{ ...serif, fontSize: 20, fill: ink }}>{totalStudents}</text>
          <text x="50" y="61" textAnchor="middle" style={{ fontSize: 7.5, fill: muted, fontWeight: 600 }}>students</text>
        </svg>
        <div className="flex min-w-[170px] flex-1 flex-col gap-3" style={{ maxWidth: 300 }}>
          {segments.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5">
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, color: '#3A4A6B', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              <span style={{ ...mono, fontSize: 12.5, color: muted }}>{s.value}</span>
              <span style={{ ...mono, fontSize: 13, fontWeight: 600, color: ink, minWidth: 38, textAlign: 'right' }}>
                {Math.round((s.value / totalStudents) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* summary strip */}
      <div className="flex flex-wrap gap-4" style={{ borderTop: `1px solid ${line}`, marginTop: 18, paddingTop: 14 }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: muted, marginBottom: 3 }}>Largest section</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {classTitle(largest)} <span style={{ ...mono, fontWeight: 400, color: muted }}>· {largest.student_ids?.length ?? 0}</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: muted, marginBottom: 3 }}>
            {capped.length > 0 ? 'Open seats' : 'Sections'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>
            {capped.length > 0 ? openSeats : list.length}
            {capped.length > 0 && capped.length < list.length && (
              <span style={{ fontWeight: 400, fontSize: 12, color: muted }}> (capped sections)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Someone who registered FOR a school (the Institution path on /register) is
 * an ordinary teacher until the ActivKlass team approves their request and
 * makes them the school's admin (POST /api/superadmin/requests/{id}/approve,
 * which clears school_request_pending and sets school_id in the same batch).
 * Nothing else inside read that flag, so a requester who signed in early saw
 * a plain teacher dashboard and took the correct state for a wrong role.
 * Read-only: there is nothing for them to do but wait.
 */
export function PendingSchoolRequestNotice({ profile }) {
  if (profile?.school_request_pending !== true || profile.school_id) return null
  const school = profile.teaching_school_name || 'your school'
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3"
      style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(245,197,24,0.16)', border: '1px solid rgba(245,197,24,0.45)' }}
    >
      <span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: 'rgba(245,197,24,0.28)', color: goldDeep, flexShrink: 0 }}>
        <Clock className="h-4 w-4" />
      </span>
      <div style={{ lineHeight: 1.45 }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: ink, margin: 0 }}>
          Your request to set up {school} is with the ActivKlass team.
        </p>
        <p style={{ fontSize: 13, color: muted, margin: '2px 0 0' }}>
          You'll be made its admin once it's approved; until then this is your teacher workspace.
        </p>
      </div>
    </div>
  )
}

function StatusChip({ empty }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11.5,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 999,
        color: empty ? goldDeep : green,
        background: empty ? 'rgba(245,197,24,0.16)' : 'rgba(31,138,91,0.1)',
      }}
    >
      {empty ? <AlertCircle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
      {empty ? 'Empty roster' : 'Active'}
    </span>
  )
}

export default function TeacherDashboard() {
  const { profile } = useAuth()
  const { data: classes, isLoading } = useTeacherClasses()
  const navigate = useNavigate()

  const list = classes ?? []
  const totalStudents = list.reduce((sum, c) => sum + (c.student_ids?.length ?? 0), 0)
  const avgClassSize = list.length ? Math.round(totalStudents / list.length) : 0
  const emptyRosters = list.filter((c) => (c.student_ids?.length ?? 0) === 0)
  const hasClasses = list.length > 0
  const needsAttention = !isLoading && emptyRosters.length > 0

  const thStyle = { padding: '11px 16px', fontSize: 12, fontWeight: 600, color: muted, textAlign: 'left', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '14px 16px', fontSize: 14, color: '#3A4A6B', whiteSpace: 'nowrap' }

  return (
    <div>
      <PendingSchoolRequestNotice profile={profile} />

      {/* Header — welcome + primary action */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: muted, margin: '0 0 2px' }}>Welcome back!</p>
          <h1 className="text-[clamp(24px,3vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.02em', margin: 0, color: ink }}>
            {profile.first_name} {profile.last_name}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <Link
            to="/teacher/classes"
            className="inline-flex items-center gap-2 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
            style={{ padding: '9px 16px', fontSize: 13.5, fontWeight: 700, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, textDecoration: 'none', boxShadow: '0 2px 0 rgba(14,42,92,0.05)' }}
          >
            Go to Classes
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 19, height: 19, borderRadius: '50%', background: gold, color: navy }}>
              <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
      </div>

      {/* Metrics — tinted cards, reference-style */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Classes" value={list.length} Icon={Layers} tint="rgba(14,42,92,0.07)" iconColor={navy} loading={isLoading} />
        <MetricCard label="Students" value={totalStudents} Icon={Users} tint="rgba(63,169,245,0.13)" iconColor={blueText} loading={isLoading} />
        <MetricCard
          label="Avg. class size"
          value={hasClasses ? avgClassSize : '—'}
          sub={hasClasses ? 'per section' : undefined}
          Icon={TrendingUp}
          tint="rgba(245,197,24,0.15)"
          iconColor={goldDeep}
          loading={isLoading}
        />
        <MetricCard
          label="Rosters to fill"
          value={emptyRosters.length}
          sub={emptyRosters.length === 0 ? 'all filled' : 'no students yet'}
          Icon={emptyRosters.length > 0 ? AlertCircle : Check}
          tint={emptyRosters.length > 0 ? 'rgba(245,197,24,0.15)' : 'rgba(31,138,91,0.1)'}
          iconColor={emptyRosters.length > 0 ? goldDeep : green}
          highlight={needsAttention}
          loading={isLoading}
        />
      </div>

      {!isLoading && !hasClasses ? (
        /* Empty state */
        <div className="mt-5 text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 40 }}>
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
        <>
          {/* Charts row — class sizes + enrollment mix */}
          <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-[1.35fr_1fr]">
            <Panel title="Class sizes">
              {isLoading ? (
                <div className="animate-pulse rounded-xl bg-slate-100" style={{ height: 200 }} />
              ) : (
                <ClassSizeChart list={list} />
              )}
            </Panel>
            <Panel title="Enrollment mix">
              {isLoading ? (
                <div className="animate-pulse rounded-xl bg-slate-100" style={{ height: 200 }} />
              ) : (
                <EnrollmentDonut list={list} totalStudents={totalStudents} />
              )}
            </Panel>
          </div>

          {/* Quick actions — compact strip */}
          <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_ACTIONS.map(({ to, label, hint, Icon, bg, color }) => (
              <Link
                key={label}
                to={to}
                className="ak-action flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
                style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 13, padding: '14px 16px', textDecoration: 'none' }}
              >
                <span style={{ width: 42, height: 42, borderRadius: 11, background: bg, color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon className="h-5 w-5" />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: ink }}>{label}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#CBD5E1' }} />
              </Link>
            ))}
          </div>

          {/* Class summary — every class the teacher handles.
              The panel's side padding is 4px so the six-column table can use
              the full card width; the cells then add their own 16px, so the
              heading is rendered here with that same inset instead of through
              Panel's `title`, which would sit 16px left of the "Class" header. */}
          <Panel style={{ marginTop: 14, padding: '18px 4px 6px' }}>
            <div className="mb-4 flex items-center justify-between gap-3" style={{ paddingLeft: 16 }}>
              <h2 style={{ ...serif, fontSize: 21, margin: 0, color: ink }}>Your classes</h2>
              <Link
                to="/teacher/classes"
                className="inline-flex items-center gap-1.5 transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C] rounded"
                style={{ fontSize: 13, fontWeight: 700, color: navy, textDecoration: 'none', marginRight: 14 }}
              >
                Manage classes <span style={{ color: gold }}>→</span>
              </Link>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${line}` }}>
                    <th style={thStyle}>Class</th>
                    <th style={thStyle}>Subject</th>
                    <th style={thStyle}>Schedule</th>
                    <th style={thStyle}>Year</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Students</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i}>
                          <td colSpan={6} style={{ padding: '8px 14px' }}>
                            <div className="animate-pulse rounded-lg bg-slate-100" style={{ height: 34 }} />
                          </td>
                        </tr>
                      ))
                    : list.map((c) => {
                        const count = c.student_ids?.length ?? 0
                        return (
                          <tr
                            key={c.id}
                            onClick={() => navigate(`/teacher/classes/${c.id}`)}
                            className="cursor-pointer transition-colors hover:bg-slate-50"
                            style={{ borderBottom: `1px solid ${line}` }}
                          >
                            <td style={tdStyle}>
                              <span className="flex items-center gap-3">
                                <span style={{ ...mono, width: 38, height: 38, borderRadius: 10, background: navy, color: gold, display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 600, fontSize: 12 }}>
                                  {classBadge(c)}
                                </span>
                                <Link
                                  to={`/teacher/classes/${c.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C] rounded"
                                  style={{ fontWeight: 700, color: ink, textDecoration: 'none' }}
                                >
                                  {classTitle(c)}
                                </Link>
                              </span>
                            </td>
                            <td style={tdStyle}>{c.subject || '—'}</td>
                            <td style={{ ...tdStyle, ...mono, fontSize: 12 }}>{formatSchedule(c.schedule) || '—'}</td>
                            <td style={{ ...tdStyle, ...mono, fontSize: 12 }}>{academicTerm(c)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: ink }}>
                              {count}
                              {c.max_students ? ` / ${c.max_students}` : ''}
                              {c.max_students > 0 && (
                                <span style={{ display: 'block', marginTop: 5, marginLeft: 'auto', width: 72, height: 4, borderRadius: 2, background: 'rgba(14,42,92,0.1)' }}>
                                  <span style={{ display: 'block', width: `${Math.min((count / c.max_students) * 100, 100)}%`, height: '100%', borderRadius: 2, background: blueText }} />
                                </span>
                              )}
                            </td>
                            <td style={tdStyle}>
                              <StatusChip empty={count === 0} />
                            </td>
                          </tr>
                        )
                      })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
