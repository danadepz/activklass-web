import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api } from '../../lib/api'
import { useAuth } from '../../context/useAuth'

// Quiz mastery thresholds: an attempt below 60% counts as a failure for the
// least-mastered alerts; 75%+ counts toward the mastery rate (DepEd passing).
const FAIL_BELOW = 0.6
const MASTERY_AT = 0.75
const ALERT_FAIL_RATE = 0.4 // PREPARE.md §1.4: warn when module fail rate > 40%

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function RiskBarChart({ highRisk, onTrack }) {
  const max = Math.max(highRisk, onTrack, 1)
  const bars = [
    { label: 'High Risk of Remediation', count: highRisk, color: 'bg-red-500' },
    { label: 'On-Track', count: onTrack, color: 'bg-green-500' },
  ]
  return (
    <div className="space-y-3">
      {bars.map((bar) => (
        <div key={bar.label}>
          <div className="flex justify-between text-sm text-slate-600 mb-1">
            <span>{bar.label}</span>
            <span className="font-semibold">{bar.count}</span>
          </div>
          <div className="h-6 bg-slate-100 rounded">
            <div
              className={`h-6 rounded ${bar.color}`}
              style={{ width: `${(bar.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const { profile } = useAuth()
  const [classId, setClassId] = useState(null)

  // Teacher's classes live in the Firestore 'classes' collection.
  const { data: classes, isLoading: classesLoading } = useQuery({
    queryKey: ['fs-classes', profile.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'classes'), where('teacher_id', '==', profile.id)),
      )
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
  })

  // Default to the first class without an effect (react-hooks/set-state-in-effect).
  const effectiveClassId = classId ?? classes?.[0]?.id ?? null
  const selectedClass = classes?.find((c) => c.id === effectiveClassId)

  const { data: attempts } = useQuery({
    queryKey: ['fs-quiz-attempts', effectiveClassId],
    enabled: !!effectiveClassId,
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'quiz_attempts'), where('class_id', '==', effectiveClassId)),
      )
      return snap.docs.map((d) => d.data())
    },
  })

  const { data: gradeEntries } = useQuery({
    queryKey: ['fs-grade-entries', effectiveClassId],
    enabled: !!effectiveClassId,
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'gradebooks', effectiveClassId, 'entries'))
      return snap.docs.map((d) => d.data())
    },
  })

  const { data: syllabus } = useQuery({
    queryKey: ['syllabus'],
    queryFn: () => api('/api/syllabus', { requireAuth: false }),
  })

  // Per-student quiz averages feed the Random Forest as indicators.
  const studentAverages = useMemo(() => {
    const byStudent = {}
    for (const a of attempts ?? []) {
      ;(byStudent[a.student_id] ??= []).push(a.score_ratio)
    }
    return Object.fromEntries(
      Object.entries(byStudent).map(([sid, ratios]) => [
        sid,
        (ratios.reduce((s, r) => s + r, 0) / ratios.length) * 100,
      ]),
    )
  }, [attempts])

  const { data: prediction } = useQuery({
    queryKey: ['predict', effectiveClassId, Object.keys(studentAverages).length],
    enabled: !!selectedClass?.student_ids?.length,
    queryFn: () =>
      api('/api/predict', {
        method: 'POST',
        body: {
          students: selectedClass.student_ids.map((sid) => ({
            student_id: sid,
            indicators:
              studentAverages[sid] != null ? { quiz_average: studentAverages[sid] } : {},
          })),
        },
      }),
  })

  const stats = useMemo(() => {
    const grades = (gradeEntries ?? [])
      .map((e) => e.final_grade)
      .filter((g) => g != null)
    const classAverage = grades.length
      ? (grades.reduce((s, g) => s + g, 0) / grades.length).toFixed(1)
      : '—'

    const allAttempts = attempts ?? []
    const masteryRate = allAttempts.length
      ? Math.round(
          (allAttempts.filter((a) => a.score_ratio >= MASTERY_AT).length /
            allAttempts.length) * 100,
        )
      : null

    // Fail rate per syllabus module (attempts carry module_id when the quiz
    // was generated from / mapped to a module).
    const byModule = {}
    for (const a of allAttempts) {
      if (!a.module_id) continue
      const m = (byModule[a.module_id] ??= { total: 0, failed: 0 })
      m.total += 1
      if (a.score_ratio < FAIL_BELOW) m.failed += 1
    }
    const moduleTitle = (id) =>
      syllabus?.modules?.find((m) => m.id === id)?.title ?? id
    const alerts = Object.entries(byModule)
      .map(([id, { total, failed }]) => ({
        moduleId: id,
        title: moduleTitle(id),
        failRate: failed / total,
        total,
      }))
      .filter((m) => m.failRate > ALERT_FAIL_RATE)
      .sort((a, b) => b.failRate - a.failRate)

    const leastMastered = alerts[0] ?? null
    const results = prediction?.results ?? []
    const highRisk = results.filter((r) => r.risk_flag === 'high_risk').length

    return { classAverage, masteryRate, alerts, leastMastered, highRisk, results }
  }, [gradeEntries, attempts, syllabus, prediction])

  if (classesLoading) return <p className="text-slate-400">Loading analytics…</p>

  if (!classes?.length) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Overall Analytics</h2>
        <p className="text-slate-500 mt-4 bg-white rounded-xl border border-slate-200 p-6">
          No classes found in Firestore yet. Run <code>python backend/seed_pilot.py</code> to
          create the pilot class, or create a class once class management is migrated.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Overall Analytics</h2>
        <select
          value={effectiveClassId ?? ''}
          onChange={(e) => setClassId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.section} — {c.subject}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <SummaryCard label="Class Average Grade" value={stats.classAverage} />
        <SummaryCard
          label="Mastery Rate %"
          value={stats.masteryRate != null ? `${stats.masteryRate}%` : '—'}
          sub={`attempts scoring ≥ ${MASTERY_AT * 100}%`}
        />
        <SummaryCard
          label="Least-Mastered Skill"
          value={stats.leastMastered ? stats.leastMastered.title : 'None'}
          sub={
            stats.leastMastered
              ? `${Math.round(stats.leastMastered.failRate * 100)}% fail rate`
              : 'no module above the alert threshold'
          }
        />
        <SummaryCard label="At-Risk Count" value={stats.results.length ? stats.highRisk : '—'} />
      </div>

      {stats.alerts.map((alert) => (
        <div
          key={alert.moduleId}
          className={`mt-4 rounded-xl border p-4 text-sm font-medium ${
            alert.failRate >= 0.6
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}
        >
          ⚠ Warning: {alert.title} has a fail rate of {Math.round(alert.failRate * 100)}%
          ({alert.total} attempts). Consider assigning a remediation quiz.
        </div>
      ))}

      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
        <h3 className="font-semibold text-slate-800">Predictive Remediation Risk</h3>
        <p className="text-xs text-slate-400 mt-0.5 mb-4">
          Random Forest classification from quiz performance and demographic indicators
          (via <code>/api/predict</code>).
        </p>
        {stats.results.length ? (
          <RiskBarChart
            highRisk={stats.highRisk}
            onTrack={stats.results.length - stats.highRisk}
          />
        ) : (
          <p className="text-sm text-slate-400">
            No students enrolled in this class yet, or the AI service is offline.
          </p>
        )}
      </div>
    </div>
  )
}
