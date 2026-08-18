import { RISK_CAVEAT, useClassRisk } from '@/hooks/useClassRisk'
import { ink, muted, faint, green, red, goldDeep, line, serif, mono } from '@/theme'

/**
 * Identify At-Risk Students — the model's view, kept deliberately apart from
 * the grade-threshold list on the same page.
 *
 * The two disagree by design: one reports work already marked, the other
 * forecasts from attendance, grades and quiz scores. Presenting them as one
 * number would invite a teacher to read a prediction as a result.
 *
 * Coverage is shown, not hidden. The model has seven inputs and this system
 * collects four, and the backend fills the rest with healthy cohort averages —
 * so a student it knows little about comes back looking fine. A teacher needs
 * to know that before acting on a green flag.
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

  // Coverage is identical for every student here -- the same four indicators are
  // available for all of them -- so report it once rather than per row.
  const coverage = scored[0]?.risk.coverage ?? 0
  const missing = scored[0]?.risk.missing ?? []
  const training = scored[0]?.risk.training ?? null

  return (
    <div style={shell}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>Predicted at risk</h3>
        <span style={{ ...mono, fontSize: 11.5, color: faint }}>
          {Math.round(coverage * 100)}% of the model’s inputs available
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
          {missing.length ? ` (no ${missing.join(', ')})` : ''}. Missing inputs are filled with
          class-average assumptions, so a student can look safe simply because little is recorded
          about them.
        </p>
      )}

      {flagged.length === 0 ? (
        <p style={{
          fontSize: 13, color: green, background: 'rgba(31,138,91,0.07)',
          border: '1px solid rgba(31,138,91,0.25)', borderRadius: 11, padding: '12px 14px', margin: 0,
        }}>
          No student is flagged at this coverage level. Worth re-checking once more attendance and
          quiz results are recorded.
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
