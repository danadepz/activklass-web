import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { computeFinalGrade, finalAcrossPeriods } from '@/lib/grading'
import { BarChart, FileText, Users, Notebook, AlertCircle, ArrowRight } from '@/components/icons'
import { navy, navyDeep, ink, gold, goldDeep, muted, faint, green, blueText, red } from '@/theme'

const line = 'rgba(14,42,92,0.08)'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }
const sans = "'Plus Jakarta Sans', sans-serif"

const MODE_LABEL = { deped_k12: 'DepEd K-12', ched_percentage: 'CHED %', ched_point: 'CHED point' }

const classLabel = (c) =>
  c.subject_code ? `${c.subject_code} · ${c.section ?? ''}`.trim() : c.section || c.subject || c.name || 'Class'

const isPassing = (grade, mode) => (grade == null ? false : mode === 'ched_point' ? grade <= 3.0 : grade >= 75)

function fmtAvg(avg, mode) {
  if (avg == null) return '—'
  if (mode === 'ched_point') return avg.toFixed(2)
  return avg.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function gradeColor(avg, mode) {
  if (avg == null) return muted
  if (mode === 'ched_point') return avg <= 3.0 ? green : red
  if (avg >= 90) return green
  if (avg >= 85) return blueText
  if (avg >= 75) return ink
  if (avg >= 70) return goldDeep
  return red
}

// --- data: compute a cross-class report from real gradebooks ---------------

/* Final grade across all periods for one student, mirroring the Class Record /
   Performance computation (per-period grade with overrides, then weighted over
   periods). Returns null when the student has no recorded grade anywhere. */
function studentFinal(sid, periods, components, assessments, overrides, mode) {
  const periodGrades = {}
  for (const p of periods) {
    const periodAssessments = assessments.filter((a) => a.period_id === p.id)
    const studentScores = {}
    for (const a of periodAssessments) {
      const sc = a.scores?.[sid]
      if (sc) studentScores[a.id] = sc
    }
    const componentsWithA = components.map((c) => ({
      ...c,
      assessments: periodAssessments.filter((a) => a.component_id === c.id),
    }))
    const { final } = computeFinalGrade(componentsWithA, studentScores, mode)
    const override = overrides?.[p.id]?.[sid]
    const hasScore = periodAssessments.some((a) => a.scores?.[sid])
    const g = override != null ? override : hasScore ? final : null
    if (g != null) periodGrades[p.id] = g
  }
  return finalAcrossPeriods(periodGrades, periods, mode)
}

async function loadClassReport(c) {
  const gbSnap = await getDoc(doc(db, 'gradebooks', c.id))
  const gb = gbSnap.exists() ? gbSnap.data() : {}
  const configured = Boolean(gb.configured && gb.periods?.length && gb.components?.length)
  const ids = c.student_ids ?? []

  const base = {
    id: c.id,
    label: classLabel(c),
    subject: c.subject ?? c.subject_title ?? '',
    mode: gb.grading_mode ?? 'deped_k12',
    studentCount: ids.length,
    configured,
    assessedCount: 0,
    passingCount: 0,
    avg: null,
  }
  if (!configured || ids.length === 0) return base

  const aSnap = await getDocs(collection(db, 'gradebooks', c.id, 'assessments'))
  const assessments = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  const finals = ids
    .map((sid) => studentFinal(sid, gb.periods, gb.components, assessments, gb.overrides ?? {}, base.mode))
    .filter((g) => g != null)

  base.assessedCount = finals.length
  base.passingCount = finals.filter((g) => isPassing(g, base.mode)).length
  base.avg = finals.length ? finals.reduce((s, g) => s + g, 0) / finals.length : null
  return base
}

async function loadReports(teacherId) {
  const snap = await getDocs(query(collection(db, 'classes'), where('teacher_id', '==', teacherId)))
  const classes = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const reports = await Promise.all(classes.map(loadClassReport))
  return reports.sort((a, b) => a.label.localeCompare(b.label))
}

// --- presentational --------------------------------------------------------

function Kpi({ label, value, sub, color, Icon, highlight }) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 14,
        padding: '18px 20px',
        border: highlight ? '1px solid rgba(245,197,24,0.4)' : `1px solid ${line}`,
        boxShadow: highlight ? '0 0 0 3px rgba(245,197,24,0.08)' : 'none',
      }}
    >
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        {Icon && (
          <span style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, background: 'rgba(14,42,92,0.07)', color: navy }}>
            <Icon className="h-[14px] w-[14px]" />
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, color: highlight ? goldDeep : muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ ...serif, fontSize: 34, lineHeight: 1, color: color ?? ink }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: faint, marginTop: 8 }}>{sub}</div>}
    </div>
  )
}

const th = { padding: '11px 16px', fontSize: 11, fontWeight: 700, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }
const td = { padding: '14px 16px', fontSize: 14, color: ink, verticalAlign: 'middle' }

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function ReportsPage() {
  const { profile } = useAuth()

  const { data: reports, isLoading, isError } = useQuery({
    queryKey: ['fs-reports', profile.id],
    queryFn: () => loadReports(profile.id),
  })

  const list = reports ?? []
  const totalStudents = list.reduce((s, r) => s + r.studentCount, 0)
  const totalAssessed = list.reduce((s, r) => s + r.assessedCount, 0)
  const totalPassing = list.reduce((s, r) => s + r.passingCount, 0)
  const passRate = totalAssessed ? Math.round((totalPassing / totalAssessed) * 100) : null
  const atRisk = totalAssessed - totalPassing

  function exportCsv() {
    const header = ['Class', 'Subject', 'Grading mode', 'Students', 'Assessed', 'Average', 'Passing', 'Passing rate']
    const rows = list.map((r) => [
      r.label,
      r.subject,
      MODE_LABEL[r.mode] ?? r.mode,
      r.studentCount,
      r.configured ? r.assessedCount : 'not set up',
      fmtAvg(r.avg, r.mode),
      r.passingCount,
      r.assessedCount ? `${Math.round((r.passingCount / r.assessedCount) * 100)}%` : '—',
    ])
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activKlass-reports-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const header = (
    <div className="mb-[26px] flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[clamp(30px,4vw,40px)]" style={{ ...serif, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 8px', color: ink }}>
          Reports
        </h1>
        <p style={{ fontSize: 15, color: muted, margin: 0 }}>
          A summary across all your classes, computed from the class records.
        </p>
      </div>
      <button
        onClick={exportCsv}
        disabled={!list.length}
        className="inline-flex items-center gap-2.5 transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ padding: '12px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 11, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}` }}
      >
        <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: 6, background: gold, color: navy }}>
          <FileText className="h-3 w-3" />
        </span>
        Export CSV
      </button>
    </div>
  )

  if (isLoading) return <div>{header}<p style={{ color: faint }}>Loading reports…</p></div>
  if (isError) return <div>{header}<p style={{ color: red }}>Could not load reports.</p></div>

  if (list.length === 0) {
    return (
      <div>
        {header}
        <div className="text-center" style={{ background: '#FFFFFF', border: '1px dashed rgba(14,42,92,0.18)', borderRadius: 16, padding: '56px 28px', maxWidth: 920 }}>
          <div style={{ display: 'inline-grid', placeItems: 'center', width: 56, height: 56, borderRadius: 14, background: 'rgba(14,42,92,0.06)', color: navy, marginBottom: 16 }}>
            <BarChart className="h-[26px] w-[26px]" />
          </div>
          <h3 style={{ ...serif, fontSize: 22, margin: '0 0 6px', color: ink }}>No classes yet</h3>
          <p style={{ fontSize: 14, color: muted, margin: '0 0 20px' }}>Create a class to start collecting data for reports.</p>
          <Link to="/teacher/classes" className="inline-flex transition hover:brightness-110" style={{ padding: '11px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, borderRadius: 10, textDecoration: 'none', boxShadow: `0 3px 0 ${navyDeep}` }}>
            Go to My Classes
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}

      {/* Global KPIs */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi label="Classes" value={list.length} sub={`${list.filter((r) => r.configured).length} with grading set up`} Icon={Notebook} />
        <Kpi label="Students" value={totalStudents} sub={`${totalAssessed} assessed across classes`} Icon={Users} />
        <Kpi label="Passing rate" value={passRate == null ? '—' : `${passRate}%`} sub={`${totalPassing} of ${totalAssessed} passing`} color={green} Icon={BarChart} />
        <Kpi label="At risk" value={atRisk} sub="assessed students not passing" color={goldDeep} Icon={AlertCircle} highlight={atRisk > 0} />
      </div>

      {/* Per-class breakdown */}
      <div className="mt-5" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }}>
        <div className="flex items-center justify-between" style={{ padding: '18px 22px', borderBottom: `1px solid ${line}` }}>
          <h3 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>By class</h3>
          <span style={{ ...mono, fontSize: 12, color: faint }}>{list.length} class{list.length === 1 ? '' : 'es'}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${line}`, background: 'rgba(14,42,92,0.02)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Class</th>
                <th style={{ ...th, textAlign: 'left' }}>Grading</th>
                <th style={{ ...th, textAlign: 'right' }}>Students</th>
                <th style={{ ...th, textAlign: 'right' }}>Assessed</th>
                <th style={{ ...th, textAlign: 'right' }}>Average</th>
                <th style={{ ...th, textAlign: 'left', minWidth: 160 }}>Passing</th>
                <th style={{ ...th, textAlign: 'right' }} aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const rate = r.assessedCount ? Math.round((r.passingCount / r.assessedCount) * 100) : null
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${line}` }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: ink }}>{r.label}</div>
                      {r.subject && <div style={{ fontSize: 12, color: faint, marginTop: 2 }}>{r.subject}</div>}
                    </td>
                    <td style={td}>
                      {r.configured ? (
                        <span style={{ display: 'inline-block', padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 999, background: 'rgba(14,42,92,0.07)', color: navy }}>
                          {MODE_LABEL[r.mode] ?? r.mode}
                        </span>
                      ) : (
                        <Link to={`/teacher/classes/${r.id}/grading`} style={{ fontSize: 12.5, fontWeight: 600, color: blueText, textDecoration: 'none' }}>
                          Set up grading →
                        </Link>
                      )}
                    </td>
                    <td style={{ ...td, ...mono, textAlign: 'right', color: ink }}>{r.studentCount}</td>
                    <td style={{ ...td, ...mono, textAlign: 'right', color: r.configured ? ink : faint }}>{r.configured ? r.assessedCount : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span style={{ ...serif, fontSize: 22, lineHeight: 1, color: gradeColor(r.avg, r.mode) }}>{fmtAvg(r.avg, r.mode)}</span>
                    </td>
                    <td style={td}>
                      {rate == null ? (
                        <span style={{ fontSize: 13, color: faint }}>—</span>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <div style={{ flex: 1, maxWidth: 110, height: 7, background: 'rgba(14,42,92,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ width: `${rate}%`, height: '100%', background: rate >= 75 ? green : rate >= 50 ? gold : red, borderRadius: 999 }} />
                          </div>
                          <span style={{ ...mono, fontSize: 12.5, fontWeight: 700, color: ink, minWidth: 34 }}>{rate}%</span>
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <Link
                        to={`/teacher/classes/${r.id}/performance`}
                        className="inline-flex transition hover:brightness-110"
                        title="Open class performance"
                        style={{ display: 'inline-grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, background: 'rgba(14,42,92,0.06)', color: navy }}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: faint, margin: '16px 2px 0', maxWidth: 720 }}>
        Averages are each class's final grade across all grading periods, in that class's own grading mode. A student
        counts as <em>assessed</em> once they have at least one recorded grade.
      </p>
    </div>
  )
}
