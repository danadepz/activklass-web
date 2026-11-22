import { RISK_CAVEAT, useClassRisk } from '@/hooks/useClassRisk'
import { formatRiskScore } from '@/lib/riskScoreDisplay'
import { riskReasons } from '@/lib/ai'
import { evidenceText, sessionCoverageText } from '@/lib/riskSignals'
import { ink, muted, faint, green, red, goldDeep, line, serif, mono } from '@/theme'

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

  const results = rows
    .map((r) => ({ row: r, risk: data?.[r.student_id] }))
    .filter((x) => x.risk)
  const scored = results.filter((x) => x.risk.status === 'scored')
  const insufficientRows = results.filter((x) => x.risk.status === 'insufficient_data')
  const insufficient = insufficientRows.length
  const flagged = scored
    .filter((x) => x.risk.atRisk)
    .sort((a, b) => (b.risk.score ?? 0) - (a.risk.score ?? 0))

  // Coverage varies per student now that half the indicators are trends: two
  // students in the same class differ if one has fewer graded attempts to
  // difference. The median is what the banner reports, and the weakest student
  // is named alongside it so a single badly-covered row cannot hide behind a
  // healthy class average.
  // Over every returned row, not just scored ones: an all-insufficient class
  // would otherwise report 0% known even when grades are recorded.
  const coverages = results.map((x) => x.risk.coverage ?? 0).sort((a, b) => a - b)
  const coverage = coverages.length
    ? coverages[Math.floor(coverages.length / 2)]
    : 0
  const worstCoverage = coverages[0] ?? 0
  const missing = results[0]?.risk.missing ?? []
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
        {RISK_CAVEAT} Having all six inputs means the model can run; it does not mean the
        result has been validated for this class.
      </p>
      {sessionCoverageText(results[0]?.risk.evidence?.sessions) && (
        <p style={{ ...mono, fontSize: 11.5, color: muted, margin: '0 0 12px' }}>
          Attendance: {sessionCoverageText(results[0].risk.evidence.sessions)}
        </p>
      )}

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
          {missing.length ? ` (no ${missing.join(', ')})` : ''}. Incomplete rows do not receive a score.
        </p>
      )}

      {flagged.length === 0 ? (
        <p style={{
          fontSize: 13, color: green, background: 'rgba(31,138,91,0.07)',
          border: '1px solid rgba(31,138,91,0.25)', borderRadius: 11, padding: '12px 14px', margin: 0,
        }}>
          {insufficient > 0
            ? `No scored students are flagged. ${insufficient} student${insufficient === 1 ? ' has' : 's have'} insufficient recorded evidence for this model.`
            : 'No student is flagged by the current model score. This is a synthetic-data development model, not a validated prediction.'}
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
                {evidenceText(risk.evidence) && (
                  <div style={{ ...mono, fontSize: 11, color: faint, marginTop: 4, lineHeight: 1.5 }}>
                    Based on {evidenceText(risk.evidence)}
                  </div>
                )}
                {riskReasons(risk.signals, 'teacher').length > 0 && (
                  <div style={{ ...mono, fontSize: 11, color: red, marginTop: 5, lineHeight: 1.5 }}>
                    {riskReasons(risk.signals, 'teacher').join(' · ')}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...serif, fontSize: 22, lineHeight: 1, color: red }}>
                  {formatRiskScore(risk.score) ?? '—'}
                </div>
                <div style={{ ...mono, fontSize: 10.5, color: faint }}>uncalibrated score</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* A7 (2026-11-22): a student missing any required input gets no score.
          What is shown instead is their record, described -- not predicted. */}
      {insufficientRows.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ fontSize: 13.5, fontWeight: 700, color: ink, margin: '0 0 4px' }}>
            Insufficient Data — not scored ({insufficientRows.length})
          </h4>
          <p style={{ fontSize: 12, color: muted, margin: '0 0 8px', maxWidth: '70ch' }}>
            These students are missing at least one of the six required inputs, so the model gives
            them no score. The lines below describe their record; they are not a prediction.
          </p>
          <div className="flex flex-col gap-1.5">
            {insufficientRows.map(({ row, risk }) => (
              <div key={row.student_id} style={{ padding: '8px 12px', border: `1px solid ${line}`, borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: ink }}>{row.last_name}, {row.first_name}</div>
                {risk.missing?.length > 0 && (
                  <div style={{ ...mono, fontSize: 11, color: goldDeep, marginTop: 2 }}>
                    Not yet available: {risk.missing.map((f) => f.replace(/_/g, ' ')).join(', ')}
                  </div>
                )}
                {evidenceText(risk.evidence) && (
                  <div style={{ ...mono, fontSize: 11, color: faint, marginTop: 2, lineHeight: 1.5 }}>
                    Record: {evidenceText(risk.evidence)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {scored.length > 0 && flagged.length > 0 && (
        <p style={{ fontSize: 12, color: faint, margin: '12px 0 0' }}>
          {flagged.length} of {scored.length} students with sufficient evidence flagged; {insufficient} insufficient-data.
        </p>
      )}
    </div>
  )
}
