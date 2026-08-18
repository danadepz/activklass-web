import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { fetchUsersByIds } from '@/lib/roster'
import { computeFinalGrade } from '@/lib/grading'
import { navy, navyDeep, ink, gold, goldDeep, muted, faint, green, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'
import PredictedRisk from '@/components/PredictedRisk'

function fmt(v) {
  return v === null || v === undefined ? '—' : v.toFixed(2).replace(/\.00$/, '')
}

function gradeColor(v) {
  if (v == null) return muted
  if (v >= 90) return green
  if (v >= 85) return blueText
  if (v >= 75) return ink
  if (v >= 70) return goldDeep
  return red
}

// --- data loading (mirrors ClassRecordPage's grade computation) -----------

async function loadPerf(classId) {
  const gbSnap = await getDoc(doc(db, 'gradebooks', classId))
  const gb = gbSnap.exists() ? gbSnap.data() : {}
  const configured = Boolean(gb.configured && gb.periods?.length && gb.components?.length)

  const classSnap = await getDoc(doc(db, 'classes', classId))
  if (!classSnap.exists()) throw new Error('Class not found')
  const ids = classSnap.data().student_ids ?? []
  const users = ids.length ? await fetchUsersByIds(ids) : []
  const students = users
    .map((u) => ({
      student_id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      lrn: u.lrn ?? u.student_number ?? null,
      // Only used as a risk-model indicator; it carries ~1% of the model's
      // weight, so its absence barely moves coverage.
      age: u.age ?? null,
    }))
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`))

  let assessments = []
  if (configured) {
    const aSnap = await getDocs(collection(db, 'gradebooks', classId, 'assessments'))
    assessments = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }

  return {
    configured,
    periods: gb.periods ?? [],
    components: gb.components ?? [],
    mode: gb.grading_mode ?? 'deped_k12',
    overrides: gb.overrides ?? {},
    students,
    assessments,
  }
}

function gradeForPeriod(bundle, periodAssessments, studentId, periodId) {
  const studentScores = {}
  for (const a of periodAssessments) {
    const sc = a.scores?.[studentId]
    if (sc) studentScores[a.id] = sc
  }
  const componentsWithA = bundle.components.map((c) => ({
    ...c,
    assessments: periodAssessments.filter((a) => a.component_id === c.id),
  }))
  const { final, breakdown } = computeFinalGrade(componentsWithA, studentScores, bundle.mode)
  const override = bundle.overrides?.[periodId]?.[studentId]
  return { components: breakdown, grade: override != null ? override : final }
}

/* Per-student rows for one period — a student counts as "assessed" only when
   they have at least one recorded score (or a manual override), so unassessed
   students don't drag the stats to zero. */
function buildRows(bundle, period) {
  const periodAssessments = bundle.assessments.filter((a) => a.period_id === period.id)
  return bundle.students.map((s) => {
    const g = gradeForPeriod(bundle, periodAssessments, s.student_id, period.id)
    const hasScore = periodAssessments.some((a) => a.scores?.[s.student_id])
    const override = bundle.overrides?.[period.id]?.[s.student_id]
    const present = hasScore || override != null
    return { ...s, grade: present ? g.grade : null, components: g.components }
  })
}

// --- presentational bits --------------------------------------------------

function Kpi({ label, value, sub, color, highlight }) {
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
      <div style={{ fontSize: 11, fontWeight: 700, color: highlight ? goldDeep : muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ ...serif, fontSize: 36, lineHeight: 1, color: color ?? ink, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: faint, marginTop: 8 }}>{sub}</div>}
    </div>
  )
}

function Card({ title, sub, children, right }) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }}>
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: 16 }}>
        <div>
          <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>{title}</h3>
          {sub && <p style={{ fontSize: 12, color: faint, margin: 0 }}>{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

const BINS = [
  { label: '< 75', min: 0, max: 74.999, bar: 'rgba(192,57,43,0.85)' },
  { label: '75–79', min: 75, max: 79.999, bar: 'rgba(245,197,24,0.95)' },
  { label: '80–84', min: 80, max: 84.999, bar: 'rgba(14,42,92,0.85)' },
  { label: '85–89', min: 85, max: 89.999, bar: 'rgba(63,169,245,0.85)' },
  { label: '90+', min: 90, max: 1000, bar: 'rgba(31,138,91,0.85)' },
]

function EmptyBox({ children }) {
  return (
    <div style={{ background: 'rgba(14,42,92,0.03)', border: '1px dashed rgba(14,42,92,0.16)', borderRadius: 12, padding: 28, textAlign: 'center', fontSize: 13.5, color: muted, lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

// --- page -----------------------------------------------------------------

export default function PerformancePage() {
  const { classId } = useParams()
  const [periodId, setPeriodId] = useState(null)

  const { data: bundle, isLoading, isError } = useQuery({
    queryKey: ['fs-record', classId],
    queryFn: () => loadPerf(classId),
  })

  if (isLoading) return <p style={{ color: faint }}>Loading performance…</p>
  if (isError || !bundle) return <p style={{ color: red }}>Class not found.</p>

  const header = (
    <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
      Performance
    </h1>
  )

  if (!bundle.configured) {
    return (
      <div>
        {header}
        <div className="mt-6 text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 40 }}>
          <p style={{ color: muted, margin: 0 }}>Set up grading periods and components first — analytics are computed from the class record.</p>
          <Link to={`/teacher/classes/${classId}/grading`} className="mt-4 inline-flex transition hover:brightness-110" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, borderRadius: 11, textDecoration: 'none', boxShadow: `0 3px 0 ${navyDeep}` }}>
            Open Grading Setup
          </Link>
        </div>
      </div>
    )
  }

  const period = bundle.periods.find((p) => p.id === periodId) ?? bundle.periods[0]
  const rows = buildRows(bundle, period)
  const graded = rows.filter((r) => r.grade != null)
  const vals = graded.map((r) => r.grade)

  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  const passed = vals.filter((v) => v >= 75).length
  const passingRate = vals.length ? `${Math.round((passed / vals.length) * 100)}%` : '—'
  const atRiskCount = vals.filter((v) => v < 85).length
  const hi = vals.length ? Math.max(...vals) : null

  // distribution
  const dist = BINS.map((b) => ({ ...b, count: graded.filter((r) => r.grade >= b.min && r.grade <= b.max).length }))
  const distMax = Math.max(1, ...dist.map((d) => d.count))

  // component averages (class mean of each component's percentage)
  const componentAvgs = bundle.components.map((c) => {
    const cs = graded.map((r) => r.components?.[c.id]).filter((v) => v != null)
    const value = cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : null
    return { id: c.id, name: c.name, value }
  })

  const top = [...graded].sort((a, b) => b.grade - a.grade).slice(0, 3)
  const atRisk = [...graded].filter((r) => r.grade < 85).sort((a, b) => a.grade - b.grade)

  const weakestComponent = (r) => {
    let lowest = null
    for (const c of bundle.components) {
      const v = r.components?.[c.id]
      if (v == null) continue
      if (lowest === null || v < lowest.v) lowest = { name: c.name, v }
    }
    return lowest ? `Weakest in ${lowest.name} (${fmt(lowest.v)}%)` : 'Below the Very Satisfactory threshold'
  }

  const periodSelect = (
    <select
      value={period.id}
      onChange={(e) => setPeriodId(e.target.value)}
      className="ak-input"
      style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11, cursor: 'pointer' }}
    >
      {bundle.periods.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )

  if (bundle.students.length === 0) {
    return (
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4" style={{ marginBottom: 24 }}>
          <div>
            {header}
            <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>Class-level analytics, computed from the class record.</p>
          </div>
          {periodSelect}
        </div>
        <EmptyBox>
          No students enrolled yet —{' '}
          <Link to={`/teacher/classes/${classId}`} style={{ color: navy, fontWeight: 600 }}>add students to the roster</Link>.
        </EmptyBox>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4" style={{ marginBottom: 22 }}>
        <div>
          {header}
          <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
            Class-level analytics for <strong style={{ color: ink }}>{period.name}</strong>, computed from the class record.
          </p>
        </div>
        {periodSelect}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi label="Class average" value={fmt(avg)} sub={`${graded.length} of ${bundle.students.length} assessed`} />
        <Kpi label="Passing rate" value={passingRate} sub={`${passed} of ${vals.length} ≥ 75`} color={green} />
        <Kpi label="At risk · below VS" value={atRiskCount} sub="grade below 85" color={goldDeep} highlight={atRiskCount > 0} />
        <Kpi label="Highest" value={hi == null ? '—' : fmt(hi)} sub={top[0] ? `${top[0].last_name}, ${top[0].first_name}` : ''} color={green} />
      </div>

      {graded.length === 0 ? (
        <div className="mt-4">
          <EmptyBox>No grades recorded for {period.name} yet. Enter scores in the Class Record to see analytics here.</EmptyBox>
        </div>
      ) : (
        <>
          {/* Distribution + component averages */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Card title="Grade distribution" sub={`${graded.length} graded students`}>
              <div className="grid items-end" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, height: 180, padding: '0 8px', borderBottom: '1px solid rgba(14,42,92,0.08)' }}>
                {dist.map((d) => (
                  <div key={d.label} className="flex flex-col items-center justify-end" style={{ height: '100%', gap: 6 }}>
                    <div style={{ ...serif, fontSize: 18, lineHeight: 1, color: gradeColor(d.min) }}>{d.count}</div>
                    <div style={{ width: '100%', maxWidth: 56, height: Math.max(8, (d.count / distMax) * 140), background: d.bar, borderRadius: '6px 6px 0 0' }} />
                  </div>
                ))}
              </div>
              <div className="grid text-center" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, padding: '10px 8px 0' }}>
                {dist.map((d) => (
                  <div key={d.label} style={{ ...mono, fontSize: 11, fontWeight: 700, color: muted }}>{d.label}</div>
                ))}
              </div>
            </Card>

            <Card title="Component averages" sub="Class mean per grade component">
              <div className="flex flex-col gap-4">
                {componentAvgs.map((c) => (
                  <div key={c.id}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 7 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{c.name}</span>
                      <span style={{ ...serif, fontSize: 20, lineHeight: 1, color: gradeColor(c.value) }}>{fmt(c.value)}</span>
                    </div>
                    <div style={{ height: 8, background: 'rgba(14,42,92,0.07)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, c.value ?? 0))}%`, height: '100%', background: gradeColor(c.value), borderRadius: 999, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Top + at-risk */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
            <Card title="Top performers" right={<span style={{ ...mono, fontSize: 11, color: faint }}>Top {Math.min(3, top.length)}</span>}>
              <div className="flex flex-col gap-2.5">
                {top.map((r, i) => (
                  <div key={r.student_id} className="flex items-center gap-3" style={{ padding: '12px 14px', background: 'rgba(14,42,92,0.03)', borderRadius: 11 }}>
                    <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: gold, minWidth: 26 }}>{String(i + 1).padStart(2, '0')}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{r.last_name}, {r.first_name}</div>
                      {r.lrn && <div style={{ ...mono, fontSize: 11, color: faint, marginTop: 1 }}>{r.lrn}</div>}
                    </div>
                    <span style={{ ...serif, fontSize: 24, lineHeight: 1, color: gradeColor(r.grade) }}>{fmt(r.grade)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <div style={{ background: '#FFFFFF', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 16, padding: '20px 22px', boxShadow: '0 0 0 3px rgba(245,197,24,0.06)' }}>
              <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 4px' }}>Below Very Satisfactory</h3>
              <p style={{ fontSize: 12.5, color: muted, margin: '0 0 14px' }}>
                Grade under 85 — a record of work already marked, not a forecast.
              </p>
              {atRisk.length === 0 ? (
                <EmptyBox>No students below the Very Satisfactory threshold — nice work.</EmptyBox>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {atRisk.map((r) => (
                    <div key={r.student_id} className="flex items-center gap-3" style={{ padding: '12px 14px', background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 11 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 14, fontWeight: 700, color: ink }}>{r.last_name}, {r.first_name}</span>
                          {r.lrn && <span style={{ ...mono, fontSize: 11, color: faint }}>{r.lrn}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: muted, marginTop: 3 }}>{weakestComponent(r)}</div>
                      </div>
                      <span style={{ ...serif, fontSize: 22, lineHeight: 1, color: goldDeep }}>{fmt(r.grade)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Deliberately separate from the grade threshold above: one is a
              record of marked work, the other a forecast. Merging them would
              let a teacher read a prediction as a result. */}
          <div className="mt-4">
            <PredictedRisk classId={classId} rows={graded} />
          </div>
        </>
      )}

      {/* Bloom's mastery — honest "not available" until quiz items are tagged */}
      <div className="mt-4">
        <Card
          title="Bloom's taxonomy mastery"
          sub="Class-average performance per cognitive level"
          right={<span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 10px', fontSize: 11, fontWeight: 700, color: blueText, background: 'rgba(63,169,245,0.12)', border: '1px solid rgba(63,169,245,0.4)', borderRadius: 999 }}>Needs tagging</span>}
        >
          <EmptyBox>
            Quiz items aren't tagged by cognitive level yet, so per-Bloom mastery can't be computed. Once questions
            carry a Bloom's level, this breaks down mastery across Remember → Create.
          </EmptyBox>
        </Card>
      </div>
    </div>
  )
}
