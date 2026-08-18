import { useQuery } from '@tanstack/react-query'
import { predictRisk } from '@/lib/ai'
import { ink, muted, faint, green, goldDeep, line, serif, mono } from '@/theme'

/**
 * Predict Class Standing — the student's own view of the risk model.
 *
 * Worded deliberately differently from the teacher's version. A teacher needs a
 * shortlist of who to look at; a student is being told something about
 * themselves, and a flat "you are at risk" is both discouraging and overclaims
 * what a model trained on synthetic data can know.
 *
 * So: it names the inputs it used, says what would change the projection, and
 * never renders a bare probability as a verdict. The same underlying call, a
 * different responsibility.
 */
export default function ClassStandingForecast({ studentId, grade, attendanceRate, quizAverage, age }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['standing', studentId, grade, attendanceRate, quizAverage],
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () => predictRisk({
      attendanceRate: attendanceRate ?? undefined,
      priorAverageGrade: grade ?? undefined,
      quizAverage: quizAverage ?? undefined,
      age: age ?? undefined,
    }),
  })

  const shell = {
    background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px',
  }

  if (isLoading) {
    return (
      <div style={shell}>
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>Projected standing</h3>
        <p style={{ fontSize: 13, color: faint, margin: '6px 0 0' }}>Working it out…</p>
      </div>
    )
  }

  // Silence beats a broken panel here. A student does not need to know the
  // prediction service is down, and a red error box about their own standing
  // would read as bad news rather than a technical fault.
  if (isError || !data) return null

  const supplied = data.supplied ?? []
  const lowCoverage = (data.coverage ?? 0) < 0.7
  const label = data.atRisk ? 'Needs attention' : 'On track'
  const tone = data.atRisk ? goldDeep : green
  const tint = data.atRisk ? 'rgba(245,197,24,0.12)' : 'rgba(31,138,91,0.08)'
  const edge = data.atRisk ? 'rgba(245,197,24,0.35)' : 'rgba(31,138,91,0.25)'

  const READABLE = {
    attendance_rate: 'your attendance',
    prior_average_grade: 'your current grade',
    quiz_average: 'your quiz scores',
    age: 'your age',
  }

  return (
    <div style={shell}>
      <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 4px' }}>Projected standing</h3>
      <p style={{ fontSize: 12.5, color: muted, margin: '0 0 14px', maxWidth: '68ch' }}>
        A projection, not a grade. It cannot see effort you have not been marked on yet, and it
        changes as new work is recorded.
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        background: tint, border: `1px solid ${edge}`, borderRadius: 12, padding: '14px 16px',
      }}>
        <span style={{ ...serif, fontSize: 22, lineHeight: 1, color: tone }}>{label}</span>
        <span style={{ fontSize: 13, color: muted }}>
          {data.atRisk
            ? 'Worth talking to your teacher about which topics to revisit.'
            : 'Keep going — attendance and quiz scores are what move this most.'}
        </span>
      </div>

      {supplied.length > 0 && (
        <p style={{ fontSize: 12.5, color: muted, margin: '14px 0 0' }}>
          Based on {supplied.map((f) => READABLE[f] ?? f).join(', ')}.
        </p>
      )}

      {lowCoverage && (
        <p style={{ ...mono, fontSize: 11.5, color: faint, margin: '8px 0 0' }}>
          Only part of your record is available, so treat this loosely.
        </p>
      )}
    </div>
  )
}
