import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import { useTeacherStudents } from '@/hooks/useTeacherStudents'
import { navy, navyDeep, ink, goldDeep, muted, faint, green, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { SkeletonStats, SkeletonTable } from '@/components/ui/Skeleton'
import { useMySubscription } from '@/hooks/useMySubscription'
import StudentAccounts from './StudentAccounts'

const classLabel = (c) =>
  c.subject_code ? `${c.subject_code} · ${c.section ?? ''}`.trim() : c.section || c.subject || c.name || 'Class'

function fmt(v) {
  return v == null ? '—' : v.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function gradeColor(v, mode) {
  if (v == null) return muted
  if (mode === 'ched_point') return v <= 3.0 ? green : red
  if (v >= 90) return green
  if (v >= 85) return blueText
  if (v >= 75) return ink
  if (v >= 70) return goldDeep
  return red
}

/* A missing risk score (no student_performance snapshot yet) sorts last
   either direction -- "unknown" is not the same claim as "safe". */
function byRisk(dir) {
  return (a, b) => {
    if (a.riskProbability == null && b.riskProbability == null) return 0
    if (a.riskProbability == null) return 1
    if (b.riskProbability == null) return -1
    return dir === 'high' ? b.riskProbability - a.riskProbability : a.riskProbability - b.riskProbability
  }
}

const SORTS = {
  name: { label: 'Name (A–Z)', fn: (a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`) },
  worst: { label: 'Lowest grades', fn: (a, b) => (a.grade ?? Infinity) - (b.grade ?? Infinity) },
  best: { label: 'Highest grades', fn: (a, b) => (b.grade ?? -Infinity) - (a.grade ?? -Infinity) },
  riskHigh: { label: 'Highest risk', fn: byRisk('high') },
  riskLow: { label: 'Lowest risk', fn: byRisk('low') },
}

const fieldLabel = { fontSize: 11, fontWeight: 700, color: muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }

function Field({ label, children }) {
  return (
    <div className="flex flex-col" style={{ gap: 0 }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </div>
  )
}

const th = { padding: '11px 16px', fontSize: 11, fontWeight: 700, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }
const td = { padding: '14px 16px', fontSize: 14, color: ink, verticalAlign: 'middle' }

/* The backend's own model only outputs two states -- high_risk at
   probability >= 0.5, else on_track (activklass-backend risk_model.py). There
   is no medium tier server-side. This buckets the same continuous
   probability into three bands for readability, anchored on that 0.5 line so
   "High" here always agrees with the backend's own flag; "Medium" is our own
   early-warning band for a student climbing toward it but not there yet. */
function riskLevel(probability) {
  if (probability == null) return null
  if (probability >= 0.5) return 'high'
  if (probability >= 0.35) return 'medium'
  return 'low'
}

const RISK_LEVEL_STYLE = {
  high: { label: 'High risk', color: red, bg: 'rgba(192,57,43,0.1)', border: 'rgba(192,57,43,0.28)' },
  medium: { label: 'Medium risk', color: goldDeep, bg: 'rgba(245,197,24,0.12)', border: 'rgba(245,197,24,0.35)' },
  low: { label: 'Low risk', color: green, bg: 'rgba(31,138,91,0.08)', border: 'rgba(31,138,91,0.25)' },
}

function RiskBadge({ probability }) {
  const level = riskLevel(probability)
  if (level == null) {
    return <span style={{ fontSize: 12.5, color: faint }}>—</span>
  }
  const { label, color, bg, border } = RISK_LEVEL_STYLE[level]
  return (
    <span className="inline-flex items-center gap-1.5" style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 999, background: bg, color, border: `1px solid ${border}` }}>
      {label}
      <span style={{ ...mono, fontWeight: 700, opacity: 0.75 }}>{Math.round(probability * 100)}%</span>
    </span>
  )
}

export default function StudentsPage() {
  const { data: classes } = useTeacherClasses()
  const { data: rows, isLoading, isError } = useTeacherStudents()
  // A solo subscriber manages their own students' accounts here; a
  // school-issued teacher's admin does it in the admin console instead.
  const { isSolo } = useMySubscription()
  const [tab, setTab] = useState('directory') // 'directory' | 'accounts' -- accounts is solo-only
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  const [sortKey, setSortKey] = useState('name')

  const list = rows ?? []

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return list
      .filter((r) => classFilter === 'all' || r.classId === classFilter)
      .filter((r) => riskFilter === 'all' || riskLevel(r.riskProbability) === riskFilter)
      .filter((r) => {
        if (!needle) return true
        const hay = `${r.firstName} ${r.lastName} ${r.lrn ?? ''}`.toLowerCase()
        return hay.includes(needle)
      })
      .sort(SORTS[sortKey].fn)
  }, [list, search, classFilter, riskFilter, sortKey])

  const header = (
    <div className="mb-[26px] flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[clamp(30px,4vw,40px)]" style={{ ...serif, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 8px', color: ink }}>
          Students
        </h1>
        <p style={{ fontSize: 15, color: muted, margin: 0 }}>
          {tab === 'accounts'
            ? 'Issue your students’ logins, reset a password, or deactivate anyone who leaves.'
            : 'Every student across your classes, in one place — search by name, or sort to see who needs attention.'}
        </p>
      </div>
    </div>
  )

  /* A solo subscriber has no school admin, so the account work lives here as a
     second tab. A school-issued teacher sees the directory alone. */
  const tabs = isSolo && (
    <div className="flex border-b border-slate-200" style={{ marginBottom: 18 }}>
      {[['directory', '📋 Directory'], ['accounts', '🪪 Student accounts']].map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setTab(id)}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
            tab === id ? 'border-[#0E2A5C] text-[#0E2A5C]' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  if (isLoading) {
    return (
      <div>
        {header}
        <div className="mb-4"><SkeletonStats count={1} label="Loading students" /></div>
        <SkeletonTable rows={6} cols={4} label="Loading students" />
      </div>
    )
  }
  if (isError) return <div>{header}<p style={{ color: red }}>Could not load students.</p></div>

  if ((classes ?? []).length === 0) {
    return (
      <div>
        {header}
        {tabs}
        {tab === 'accounts' ? <StudentAccounts classes={[]} rows={[]} /> : (
        <div className="text-center" style={{ background: '#FFFFFF', border: '1px dashed rgba(14,42,92,0.18)', borderRadius: 16, padding: '56px 28px', maxWidth: 920 }}>
          <h3 style={{ ...serif, fontSize: 22, margin: '0 0 6px', color: ink }}>No classes yet</h3>
          <p style={{ fontSize: 14, color: muted, margin: '0 0 20px' }}>Create a class and add a roster to see students here.</p>
          <Link to="/teacher/classes" className="inline-flex transition hover:brightness-110" style={{ padding: '11px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, borderRadius: 10, textDecoration: 'none', boxShadow: `0 3px 0 ${navyDeep}` }}>
            Go to My Classes
          </Link>
        </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {header}
      {tabs}

      {tab === 'accounts' ? <StudentAccounts classes={classes ?? []} rows={list} /> : (
      <>
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3" style={{ marginBottom: 18 }}>
        <Field label="Search">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or LRN…"
            className="ak-input"
            style={{ width: '100%', minWidth: 220, maxWidth: 320, padding: '11px 14px', fontSize: 14, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11 }}
          />
        </Field>
        <Field label="Class">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="ak-input"
            style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11, cursor: 'pointer' }}
          >
            <option value="all">All classes</option>
            {(classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>{classLabel(c)}</option>
            ))}
          </select>
        </Field>
        <Field label="Sort by">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="ak-input"
            style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11, cursor: 'pointer' }}
          >
            {Object.entries(SORTS).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Filter by:">
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="ak-input"
            style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11, cursor: 'pointer' }}
          >
            <option value="all">Any risk level</option>
            <option value="high">High risk</option>
            <option value="medium">Medium risk</option>
            <option value="low">Low risk</option>
          </select>
        </Field>
      </div>

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }}>
        <div className="flex items-center justify-between" style={{ padding: '18px 22px', borderBottom: `1px solid ${line}` }}>
          <h3 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>Roster</h3>
          <span style={{ ...mono, fontSize: 12, color: faint }}>{filtered.length} row{filtered.length === 1 ? '' : 's'}</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13.5, color: muted }}>
            {riskFilter !== 'all' && !list.some((r) => r.riskProbability != null) ? (
              <>
                No risk scores have been computed yet, so nothing can match a risk level.{' '}
                <Link to="/teacher/classes" style={{ color: navy, fontWeight: 600 }}>Open a class's Performance tab</Link>
                {' '}first — that's what runs the model and saves each student's score.
              </>
            ) : (
              'No students match your search or filter.'
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${line}`, background: 'rgba(14,42,92,0.02)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Student</th>
                  <th style={{ ...th, textAlign: 'left' }}>Class</th>
                  <th style={{ ...th, textAlign: 'right' }}>Grade</th>
                  <th style={{ ...th, textAlign: 'left' }}>Risk</th>
                  <th style={{ ...th, textAlign: 'right' }} aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.classId}-${r.studentId}`} style={{ borderBottom: `1px solid ${line}` }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: ink }}>{r.lastName}, {r.firstName}</div>
                      {r.lrn && <div style={{ ...mono, fontSize: 11, color: faint, marginTop: 2 }}>{r.lrn}</div>}
                    </td>
                    <td style={td}>
                      <div style={{ color: ink }}>{r.classLabel}</div>
                      {r.subject && <div style={{ fontSize: 12, color: faint, marginTop: 2 }}>{r.subject}</div>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {r.configured ? (
                        <span style={{ ...serif, fontSize: 20, lineHeight: 1, color: gradeColor(r.grade, r.mode) }}>{fmt(r.grade)}</span>
                      ) : (
                        <Link to={`/teacher/classes/${r.classId}/grading`} style={{ fontSize: 12, fontWeight: 600, color: blueText, textDecoration: 'none' }}>
                          Set up grading →
                        </Link>
                      )}
                    </td>
                    <td style={td}>
                      <RiskBadge probability={r.riskProbability} />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <Link
                        to={`/teacher/classes/${r.classId}/record`}
                        className="inline-flex transition hover:brightness-110"
                        title="Open class record"
                        style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: sans, color: navy, background: 'rgba(14,42,92,0.06)', borderRadius: 8, textDecoration: 'none' }}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: 12.5, color: faint, margin: '16px 2px 0', maxWidth: 720 }}>
        A student in more than one of your classes appears once per class, since grades and risk are
        each computed within a class, not blended across them. Risk is the model's own likelihood
        score — attendance, quiz trend and missing work alongside the grade — not just a grade cutoff,
        so it reads "—" until you've opened that class's Performance tab at least once. High / Medium /
        Low are our own bands on that score (50%+ / 35–49% / under 35%) — the model itself only flags
        high risk at 50%, so "High" here always agrees with it; "Medium" is an earlier heads-up.
      </p>
      </>
      )}
    </div>
  )
}
