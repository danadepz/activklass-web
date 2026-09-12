import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import { useTeacherStudents } from '@/hooks/useTeacherStudents'
import { isPassingGrade } from '@/lib/grading'
import { navy, navyDeep, ink, goldDeep, muted, faint, green, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { SkeletonStats, SkeletonTable } from '@/components/ui/Skeleton'
import { useMySubscription } from '@/hooks/useMySubscription'
import StudentAccounts from './StudentAccounts'

const classLabel = (c) =>
  c.subject_code ? `${c.subject_code} · ${c.section ?? ''}`.trim() : c.section || c.subject || c.name || 'Class'

function fmt(v) {
  return v == null ? '—' : v.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

// The gradebook's own pass mark and point-scale direction decide what is
// passing (lib/grading.js), the same test the class record uses.
function gradeColor(v, mode, policy) {
  if (v == null) return muted
  const passing = isPassingGrade(v, mode, policy) === true
  if (mode === 'ched_point') return passing ? green : red
  if (v >= 90) return green
  if (v >= 85) return blueText
  if (passing) return ink
  if (v >= 70) return goldDeep
  return red
}

/* One comparator per column. A missing grade or risk score sorts last in
   either direction -- "unknown" is not the same claim as "safe" or "failing". */
const missingLast = (get) => (a, b, dir) => {
  const av = get(a), bv = get(b)
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  return dir === 'asc' ? av - bv : bv - av
}
const COLUMNS = {
  name: {
    label: 'Student',
    fn: (a, b, dir) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`) * (dir === 'asc' ? 1 : -1),
  },
  class: {
    label: 'Class',
    fn: (a, b, dir) => a.classLabel.localeCompare(b.classLabel) * (dir === 'asc' ? 1 : -1),
  },
  grade: { label: 'Grade', fn: missingLast((r) => r.grade) },
  risk: { label: 'Risk', fn: missingLast((r) => r.riskProbability) },
}
// First click on a column gives the order a teacher most likely wants.
const FIRST_DIR = { name: 'asc', class: 'asc', grade: 'asc', risk: 'desc' }

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

function RiskBadge({ probability, training }) {
  const level = riskLevel(probability)
  if (level == null) {
    return <span style={{ fontSize: 12.5, color: faint }}>—</span>
  }
  const { label, color, bg, border } = RISK_LEVEL_STYLE[level]
  // The dagger marks a score the model produced from generated data, and the
  // footnote below the table says what that means. A title attribute would
  // not do: a disclosure nobody can see is not a disclosure.
  const synthetic = training?.real_data === false
  return (
    <span className="inline-flex items-center gap-1.5" style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 999, background: bg, color, border: `1px solid ${border}` }}>
      {label}
      <span style={{ ...mono, fontWeight: 700, opacity: 0.75 }}>{Math.round(probability * 100)}%</span>
      {synthetic && <span style={{ fontWeight: 700, opacity: 0.75 }}>†</span>}
    </span>
  )
}

export default function StudentsPage() {
  const { data: classes } = useTeacherClasses()
  const { data, isLoading, isError } = useTeacherStudents()
  // A solo subscriber manages their own students' accounts here; a
  // school-issued teacher's admin does it in the admin console instead.
  const { isSolo } = useMySubscription()
  const [tab, setTab] = useState('directory') // 'directory' | 'accounts' -- accounts is solo-only
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  // Highest risk first by default: the page exists to show who needs attention.
  const [sort, setSort] = useState({ key: 'risk', dir: 'desc' })

  const list = data?.rows ?? []
  // Classes whose reads failed while the others loaded (useTeacherStudents).
  const failed = data?.failed ?? []

  // Everything but the risk chip: the chips count over this, so a teacher
  // sees what a click will show before clicking it.
  const scoped = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return list
      .filter((r) => classFilter === 'all' || r.classId === classFilter)
      .filter((r) => {
        if (!needle) return true
        const hay = `${r.firstName} ${r.lastName} ${r.lrn ?? ''}`.toLowerCase()
        return hay.includes(needle)
      })
  }, [list, search, classFilter])

  const riskCounts = useMemo(() => {
    const n = { all: scoped.length, high: 0, medium: 0, low: 0, none: 0 }
    for (const r of scoped) n[riskLevel(r.riskProbability) ?? 'none'] += 1
    return n
  }, [scoped])

  // Classes in view with no risk score at all, so the chips can say why a
  // count is short instead of leaving an empty table to explain itself.
  const unscored = useMemo(() => {
    const seen = new Map()
    for (const r of scoped) {
      const cur = seen.get(r.classId) ?? { label: r.classLabel, scored: false }
      if (r.riskProbability != null) cur.scored = true
      seen.set(r.classId, cur)
    }
    return [...seen.values()].filter((c) => !c.scored).map((c) => c.label)
  }, [scoped])

  const filtered = useMemo(() => {
    const { key, dir } = sort
    return scoped
      .filter((r) => riskFilter === 'all' || riskLevel(r.riskProbability) === riskFilter)
      .sort((a, b) => COLUMNS[key].fn(a, b, dir))
  }, [scoped, riskFilter, sort])

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: FIRST_DIR[key] }))

  const header = (
    <div className="mb-[26px] flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[clamp(30px,4vw,40px)]" style={{ ...serif, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 8px', color: ink }}>
          Students
        </h1>
        <p style={{ fontSize: 15, color: muted, margin: 0 }}>
          {tab === 'accounts'
            ? 'Issue your students’ logins, reset a password, or deactivate anyone who leaves.'
            : 'Every student across your classes, in one place. Highest risk is listed first; click a column heading to sort another way.'}
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
  // The cause is in the console (the hook logs it); the teacher gets what to
  // try, and which class to name if it keeps happening.
  const retryHint = 'Refresh the page. If it keeps happening, tell us which class.'
  if (isError) return <div>{header}<p style={{ color: red }}>Could not load students. {retryHint}</p></div>

  const partial = failed.length > 0 && (
    <p role="alert" style={{ color: red, fontSize: 13.5, margin: '0 0 14px' }}>
      {failed.map((f) => f.label).join(', ')} did not load, so {failed.length === 1 ? 'its' : 'their'} students are missing below. {retryHint}
    </p>
  )

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
      {partial}

      {tab === 'accounts' ? <StudentAccounts classes={classes ?? []} rows={list} /> : (
      <>
      {/* Controls: what to look at (search, class), then which risk band */}
      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 14 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or LRN"
          aria-label="Search students"
          className="ak-input"
          style={{ width: '100%', minWidth: 220, maxWidth: 320, padding: '11px 14px', fontSize: 14, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11 }}
        />
        {(classes ?? []).length > 1 && (
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            aria-label="Class"
            className="ak-input"
            style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11, cursor: 'pointer' }}
          >
            <option value="all">All classes</option>
            {(classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>{classLabel(c)}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 18 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: muted, marginRight: 4 }}>Risk</span>
        {[['all', 'All'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(([id, label]) => {
          const on = riskFilter === id
          const tone = RISK_LEVEL_STYLE[id]
          return (
            <button
              key={id}
              type="button"
              onClick={() => setRiskFilter(id)}
              aria-pressed={on}
              className="inline-flex items-center gap-1.5 transition"
              style={{
                padding: '6px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: sans, borderRadius: 999, cursor: 'pointer',
                color: on ? '#FAFAF6' : (tone?.color ?? ink),
                background: on ? (tone?.color ?? navy) : (tone?.bg ?? '#FFFFFF'),
                border: `1.5px solid ${on ? (tone?.color ?? navy) : (tone?.border ?? 'rgba(14,42,92,0.14)')}`,
              }}
            >
              {label}
              <span style={{ ...mono, fontWeight: 700, opacity: 0.8 }}>{riskCounts[id]}</span>
            </button>
          )
        })}
        {riskCounts.none > 0 && (
          <span style={{ fontSize: 12.5, color: faint, marginLeft: 6 }}>
            {riskCounts.none} without a score
            {unscored.length > 0 && (
              <>
                {' '}·{' '}
                <Link to="/teacher/classes" style={{ color: navy, fontWeight: 600 }}>open the Performance tab</Link>
                {' '}of {unscored.slice(0, 2).join(unscored.length > 2 ? ', ' : ' and ')}
                {unscored.length > 2 && ` and ${unscored.length - 2} more ${unscored.length === 3 ? 'class' : 'classes'}`}
                {' '}to compute {riskCounts.none === 1 ? 'it' : 'them'}
              </>
            )}
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }}>
        <div className="flex items-center justify-between" style={{ padding: '18px 22px', borderBottom: `1px solid ${line}` }}>
          <h3 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>Roster</h3>
          <span style={{ ...mono, fontSize: 12, color: faint }}>{filtered.length} row{filtered.length === 1 ? '' : 's'}</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13.5, color: muted }}>
            {riskFilter !== 'all' && riskCounts.none === riskCounts.all
              ? 'No risk scores yet for these students, so no risk level can match.'
              : 'No students match your search or filter.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${line}`, background: 'rgba(14,42,92,0.02)' }}>
                  {[['name', 'left'], ['class', 'left'], ['grade', 'right'], ['risk', 'left']].map(([key, align]) => {
                    const active = sort.key === key
                    return (
                      <th
                        key={key}
                        scope="col"
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        style={{ ...th, textAlign: align, padding: 0 }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(key)}
                          title={`Sort by ${COLUMNS[key].label.toLowerCase()}`}
                          className="transition hover:brightness-75"
                          style={{ ...th, display: 'inline-flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', background: 'none', border: 0, cursor: 'pointer', fontFamily: sans, color: active ? navy : muted }}
                        >
                          {COLUMNS[key].label}
                          <span aria-hidden="true" style={{ fontSize: 9, opacity: active ? 1 : 0.35 }}>
                            {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▲▼'}
                          </span>
                        </button>
                      </th>
                    )
                  })}
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
                        <span style={{ ...serif, fontSize: 20, lineHeight: 1, color: gradeColor(r.grade, r.mode, r.policy) }}>{fmt(r.grade)}</span>
                      ) : (
                        <Link to={`/teacher/classes/${r.classId}/grading`} style={{ fontSize: 12, fontWeight: 600, color: blueText, textDecoration: 'none' }}>
                          Set up grading →
                        </Link>
                      )}
                    </td>
                    <td style={td}>
                      <RiskBadge probability={r.riskProbability} training={r.riskTraining} />
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
        score — attendance, quiz trend and missing work alongside the grade — banded as High (50%+),
        Medium (35–49%) and Low (under 35%); the model itself flags high risk at 50%, so "High" here
        always agrees with it.
      </p>

      {list.some((r) => r.riskTraining?.real_data === false) && (
        <p style={{ fontSize: 12.5, color: faint, margin: '10px 2px 0', maxWidth: 720 }}>
          <strong style={{ color: goldDeep }}>† Not trained on real class data.</strong>{' '}
          {list.find((r) => r.riskTraining?.real_data === false)?.riskTraining?.summary
            ?? 'These scores come from a model trained on generated student trajectories, not on '
             + 'real ActivKlass history — no term has finished yet. Treat a score as a prompt to '
             + 'look at the student now, not as evidence about how they will finish.'}
        </p>
      )}
      </>
      )}
    </div>
  )
}
