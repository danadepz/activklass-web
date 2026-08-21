import { RISK_CAVEAT, useClassRisk } from '@/hooks/useClassRisk'
import { riskReasons } from '@/lib/ai'
import { ink, muted, faint, green, red, goldDeep, line, serif, mono } from '@/theme'

/**
 * Identify At-Risk Students — the model's view, kept deliberately apart from
 * the grade-threshold list on the same page.
 *
 * The two disagree by design, and the disagreement is the point: the list above
 * reports work already marked, this one projects where a student is heading
 * from the direction their attendance, submissions and quiz scores are moving.
 * A student who appears in neither list today but appears here first is exactly
 * who this panel exists for. Presenting them as one number would invite a
 * teacher to read a projection as a result.
 *
 * Each flagged student is shown WITH the indicators that put them there. A
 * percentage on its own tells a teacher to worry; "attendance down ~26 pts,
 * 35% of work not submitted" tells them what to open the conversation about.
 *
 * Coverage is shown, not hidden, and unlike the levels it now varies per
 * student: a trend needs enough recorded days or attempts to difference, so
 * early in a term the model is working from less than it looks. A teacher
 * needs to know that before acting on a green flag.
 */
export default function PredictedRisk({ classId, rows }) {
  const { data, isLoading, isError, error } = useClassRisk(classId, rows)

  const shell = {
    background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px',
  }

  if (!rows?.length) return null

  if (isLoading) {
    return (
      <div style={shell}>
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 6px' }}>Predicted at risk</h3>
        <p style={{ fontSize: 13, color: faint, margin: 0 }}>Running the model…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div style={shell}>
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 6px' }}>Predicted at risk</h3>
        <p style={{ fontSize: 13, color: muted, margin: 0 }}>
          {/* Naming the API is more useful than "something went wrong": this
              endpoint needs Flask running, which Firestore-only pages do not. */}
          Could not reach the prediction service. It runs on the Flask API — check that the backend
          is running. {error?.message ? <span style={{ color: faint }}>({error.message})</span> : null}
        </p>
      </div>
    )
  }

  const scored = rows
    .map((r) => ({ row: r, risk: data?.[r.student_id] }))
    .filter((x) => x.risk)
  const flagged = scored
    .filter((x) => x.risk.atRisk)
    .sort((a, b) => (b.risk.probability ?? 0) - (a.risk.probability ?? 0))

  // Coverage varies per student now that half the indicators are trends: two
  // students in the same class differ if one has fewer graded attempts to
  // difference. The median is what the banner reports, and the weakest student
  // is named alongside it so a single badly-covered row cannot hide behind a
  // healthy class average.
  const coverages = scored.map((x) => x.risk.coverage ?? 0).sort((a, b) => a - b)
  const coverage = coverages.length
    ? coverages[Math.floor(coverages.length / 2)]
    : 0
  const worstCoverage = coverages[0] ?? 0
  const missing = scored[0]?.risk.missing ?? []
  const training = scored[0]?.risk.training ?? null

  return (
    <div style={shell}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>Predicted at risk</h3>
        <span style={{ ...mono, fontSize: 11.5, color: faint }}>
          {Math.round(coverage * 100)}% of the model’s inputs available (median)
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: muted, margin: '6px 0 10px', maxWidth: '70ch' }}>
        {training?.summary ?? RISK_CAVEAT}
      </p>

      {/* Only shown while the model is fitted on generated data. The backend
          flips training.real_data when real exports replace it, and this
          disappears on its own. */}
      {training && training.real_data === false && (
        <p style={{
          ...mono, fontSize: 11, color: goldDeep, background: 'rgba(245,197,24,0.12)',
          border: '1px solid rgba(245,197,24,0.3)', borderRadius: 8,
          padding: '6px 9px', margin: '0 0 14px', display: 'inline-block',
        }}>
          not trained on real class data
        </p>
      )}

      {coverage < 0.7 && (
        <p style={{
          fontSize: 12.5, color: goldDeep, background: 'rgba(245,197,24,0.12)',
          border: '1px solid rgba(245,197,24,0.35)', borderRadius: 10, padding: '9px 11px',
          margin: '0 0 14px',
        }}>
          Only {Math.round(coverage * 100)}% of what the model weighs is known for this class
          {worstCoverage < coverage ? `, and as little as ${Math.round(worstCoverage * 100)}% for one student` : ''}
          {missing.length ? ` (no ${missing.join(', ')})` : ''}. Missing inputs are filled with steady,
          class-average assumptions, so a student can look safe simply because little is recorded
          about them. Trends need a few weeks of attendance and several graded attempts before they
          say anything.
        </p>
      )}

      {flagged.length === 0 ? (
        <p style={{
          fontSize: 13, color: green, background: 'rgba(31,138,91,0.07)',
          border: '1px solid rgba(31,138,91,0.25)', borderRadius: 11, padding: '12px 14px', margin: 0,
        }}>
          No student is flagged at this coverage level. Worth re-checking once more attendance and
          quiz results are recorded — the trends that make this an early warning need a few weeks of
          history before they carry any weight.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {flagged.map(({ row, risk }) => (
            <div key={row.student_id} className="flex items-center gap-3"
                 style={{ padding: '12px 14px', background: 'rgba(192,57,43,0.05)',
                          border: '1px solid rgba(192,57,43,0.22)', borderRadius: 11 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>
                  {row.last_name}, {row.first_name}
                </div>
                <div style={{ fontSize: 12, color: muted, marginTop: 3 }}>
                  Current grade {row.grade == null ? '—' : Math.round(row.grade)}
                </div>
                {/* The actionable half. Without this a teacher gets a ranked
                    list of names and no idea what to raise with any of them. */}
                {riskReasons(risk.signals, 'teacher').length > 0 && (
                  <div style={{ ...mono, fontSize: 11, color: red, marginTop: 5, lineHeight: 1.5 }}>
                    {riskReasons(risk.signals, 'teacher').join(' · ')}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...serif, fontSize: 22, lineHeight: 1, color: red }}>
                  {risk.probability == null ? '—' : `${Math.round(risk.probability * 100)}%`}
                </div>
                <div style={{ ...mono, fontSize: 10.5, color: faint }}>likelihood</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {scored.length > 0 && flagged.length > 0 && (
        <p style={{ fontSize: 12, color: faint, margin: '12px 0 0' }}>
          {flagged.length} of {scored.length} students flagged. This list will not match the
          grade-threshold list above, and is not meant to.
        </p>
      )}
    </div>
  )
}
