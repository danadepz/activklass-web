import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { predictRisk, riskReasons } from '@/lib/ai'
import {
  attendanceTrendFromLog,
  missedQuizCounts,
  missingRate,
  missingWorkCountsFromEntry,
  quizTrendFromAttempts,
} from '@/lib/riskSignals'
import { ink, muted, faint, green, goldDeep, line, serif, mono } from '@/theme'

/**
 * Predict Class Standing — the student's own view of the early-warning model.
 *
 * Worded deliberately differently from the teacher's version. A teacher needs a
 * shortlist of who to look at; a student is being told something about
 * themselves, and a flat "you are at risk" is both discouraging and overclaims
 * what a model trained on synthetic data can know.
 *
 * The point of showing it to the student at all is that a grade arrives too
 * late to act on. So this names the specific thing that is slipping and by how
 * much — "your attendance has dropped about 26 points recently" — because that
 * is something a student can still do something about in week eight. A label
 * they cannot act on would be worse than showing nothing.
 *
 * It computes its own trends from the attendance log and attempts the class
 * page already loaded, through the same helpers the teacher's panel uses, so
 * the two cannot tell a student and their teacher different stories.
 */
export default function ClassStandingForecast({
  studentId,
  grade,
  attendanceRate,
  quizAverage,
  attendanceLog,
  attempts,
  assessments,
  quizzes,
  attemptedQuizIds,
}) {
  const indicators = useMemo(
    () => ({
      attendanceRate: attendanceRate ?? undefined,
      priorAverageGrade: grade ?? undefined,
      quizAverage: quizAverage ?? undefined,
      attendanceTrend: attendanceTrendFromLog(attendanceLog),
      quizTrend: quizTrendFromAttempts(attempts),
      // Assessments the teacher marked missing, pooled with quizzes that closed
      // without an attempt. The second half is the one a student is least
      // likely to have noticed themselves -- a quiz never opened leaves nothing
      // on screen to remind them it existed.
      missingWorkRate: missingRate(
        missingWorkCountsFromEntry(assessments),
        missedQuizCounts(quizzes, attemptedQuizIds, studentId),
      ),
    }),
    [
      attendanceRate, grade, quizAverage, attendanceLog, attempts, assessments,
      quizzes, attemptedQuizIds, studentId,
    ],
  )

  const { data, isLoading, isError } = useQuery({
    queryKey: ['standing', studentId, indicators],
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () => predictRisk(indicators),
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
  const reasons = riskReasons(data.signals, 'student')
  const label = data.atRisk ? 'Needs attention' : 'On track'
  const tone = data.atRisk ? goldDeep : green
  const tint = data.atRisk ? 'rgba(245,197,24,0.12)' : 'rgba(31,138,91,0.08)'
  const edge = data.atRisk ? 'rgba(245,197,24,0.35)' : 'rgba(31,138,91,0.25)'

  const READABLE = {
    attendance_rate: 'your attendance',
    prior_average_grade: 'your current grade',
    quiz_average: 'your quiz scores',
    attendance_trend: 'how your attendance has changed',
    quiz_trend: 'how your quiz scores have changed',
    missing_work_rate: 'unsubmitted work',
  }

  return (
    <div style={shell}>
      <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 4px' }}>Projected standing</h3>
      <p style={{ fontSize: 12.5, color: muted, margin: '0 0 14px', maxWidth: '68ch' }}>
        A projection, not a grade. It looks at where your attendance and scores are heading, so it
        can change well before your grade does.
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        background: tint, border: `1px solid ${edge}`, borderRadius: 12, padding: '14px 16px',
      }}>
        <span style={{ ...serif, fontSize: 22, lineHeight: 1, color: tone }}>{label}</span>
        <span style={{ fontSize: 13, color: muted }}>
          {data.atRisk
            ? 'There is still time to change this.'
            : 'Keep going — attendance and quiz scores are what move this most.'}
        </span>
      </div>

      {/* The whole reason a student sees this at all. "Needs attention" is not
          actionable in week eight; "your attendance dropped 26 points" is. */}
      {reasons.length > 0 && (
        <div style={{ margin: '14px 0 0' }}>
          <p style={{ fontSize: 12.5, color: ink, margin: '0 0 6px', fontWeight: 600 }}>
            What’s driving this
          </p>
          <ul style={{ margin: 0, padding: '0 0 0 18px', color: muted, fontSize: 13, lineHeight: 1.7 }}>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p style={{ fontSize: 12.5, color: muted, margin: '10px 0 0' }}>
            Talking to your teacher about any one of these is a good next step.
          </p>
        </div>
      )}

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

      {data.training?.real_data === false && (
        <p style={{ fontSize: 11.5, color: faint, margin: '8px 0 0', lineHeight: 1.5 }}>
          This projection comes from a model that has not learned from real
          ActivKlass results yet, so it can be wrong about you. Your teacher sees
          the same note.
        </p>
      )}
    </div>
  )
}
