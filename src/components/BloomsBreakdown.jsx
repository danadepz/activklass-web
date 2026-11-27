import { ink, muted, faint, line, navy, blueText, serif } from '@/theme'

export const BLOOMS_LEVELS = [
  { key: 'remember', level: 1, label: 'Remembering' },
  { key: 'understand', level: 2, label: 'Understanding' },
  { key: 'apply', level: 3, label: 'Applying' },
  { key: 'analyze', level: 4, label: 'Analyzing' },
  { key: 'evaluate', level: 5, label: 'Evaluating' },
  { key: 'create', level: 6, label: 'Creating' },
]

const card = { background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }
const tabular = { fontVariantNumeric: 'tabular-nums' }
const percent = (value) => value == null ? 'N/A' : `${Math.round(value * 10) / 10}%`
const points = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })

function PerformanceRow({ item, label }) {
  const hasResults = item.maximumPoints > 0
  const barWidth = hasResults ? Math.max(0, Math.min(100, item.percentage)) : 0
  return (
    <li data-level={item.key ?? 'unknown'} data-percentage={item.percentage ?? 'na'} className="grid items-center gap-x-4 gap-y-2 sm:grid-cols-[190px_minmax(100px,1fr)_minmax(190px,auto)]" style={{ padding: '12px 0', borderTop: `1px solid ${line}` }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: ink }}>{label}</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{item.questionCount} scored question result{item.questionCount === 1 ? '' : 's'}</div>
      </div>
      <div role="img" aria-label={`${label}: ${percent(item.percentage)}`} style={{ height: 8, background: 'rgba(14,42,92,0.07)', borderRadius: 999, overflow: 'hidden' }}>
        {hasResults && <div style={{ width: `${barWidth}%`, height: '100%', background: navy, borderRadius: 999 }} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:justify-end" style={{ ...tabular }}>
        <span style={{ fontSize: 12.5, color: muted }}>{points(item.earnedPoints)} / {points(item.maximumPoints)} pts</span>
        <strong style={{ minWidth: 48, textAlign: 'right', fontSize: 14, color: hasResults ? blueText : faint }}>{percent(item.percentage)}</strong>
        {item.pendingCount > 0 && <span style={{ width: '100%', textAlign: 'right', fontSize: 11.5, color: muted }}>{item.pendingCount} pending · {points(item.pendingPoints)} pts</span>}
      </div>
    </li>
  )
}

export default function BloomsBreakdown({ performance, title = "Assessment performance by Bloom's level" }) {
  const unknown = performance?.unknown
  const levels = performance?.levels ?? {}
  const scoredLevels = BLOOMS_LEVELS.filter((level) => levels[level.key]?.maximumPoints > 0)
  const reviewLevels = scoredLevels.filter((level) => {
    const item = levels[level.key]
    return item?.percentage != null && item.percentage < 75
  })

  return (
    <section aria-label={title} data-state={performance ? 'connected' : 'loading'} style={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5" style={{ marginBottom: 5 }}>
        <h2 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 12, color: muted }}>{performance?.selectedAttemptCount ?? 0} best finished attempts</span>
      </div>
      <p style={{ fontSize: 12.5, color: muted, lineHeight: 1.5, margin: '0 0 13px' }}>
        Percentages use earned points divided by maximum available points. They are descriptive results, not a definitive measure of cognitive mastery.
      </p>

      {!performance ? (
        <p role="status" style={{ margin: 0, padding: '12px 0', fontSize: 13, color: muted }}>Assessment results are loading.</p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {BLOOMS_LEVELS.map((level) => (
              <PerformanceRow key={level.key} item={{ ...levels[level.key], key: level.key }} label={`Level ${level.level} · ${level.label}`} />
            ))}
            <PerformanceRow item={{ ...unknown, key: 'unknown' }} label="Unknown · untagged" />
          </ul>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${line}`, fontSize: 12.5, color: muted, lineHeight: 1.55 }}>
            <p style={{ margin: 0 }}>
              <strong style={{ color: ink }}>Unknown metadata:</strong> {unknown?.attemptsWithoutMetadata ?? 0} selected attempt{unknown?.attemptsWithoutMetadata === 1 ? '' : 's'} without a metadata snapshot.
              {(unknown?.unitemizedAttempts ?? 0) > 0 && <> Item-level results are unavailable for {unknown.unitemizedAttempts} attempt{unknown.unitemizedAttempts === 1 ? '' : 's'} ({unknown.unitemizedQuestions} questions).</>}
            </p>
            <p style={{ margin: '5px 0 0' }}>
              <strong style={{ color: ink }}>Pending grading:</strong> {performance.pending?.questionCount ?? 0} question{performance.pending?.questionCount === 1 ? '' : 's'} · {points(performance.pending?.maximumPoints)} pts. Pending items are excluded from percentages.
            </p>
          </div>

          <div aria-label="Possible areas for review" style={{ marginTop: 14, padding: '11px 13px', background: 'rgba(245,197,24,0.10)', borderRadius: 10, fontSize: 12.5, color: ink, lineHeight: 1.5 }}>
            <strong>Possible areas for review</strong>
            <p style={{ margin: '3px 0 0', color: muted }}>
              {scoredLevels.length === 0
                ? 'There are no tagged, scored question results to identify review areas yet.'
                : reviewLevels.length
                ? `${reviewLevels.map((level) => level.label).join(', ')} ${reviewLevels.length === 1 ? 'is' : 'are'} below 75% in the selected results; consider reviewing the question evidence.`
                : 'No scored level is below 75% in the selected results.'}
              {' '}This is a review cue only; it does not assign remediation.
            </p>
          </div>
          <p style={{ fontSize: 11.5, color: muted, margin: '10px 0 0' }}>
            Each student contributes their best finished attempt per quiz. Missing historical Bloom tags remain Unknown; current quiz edits do not relabel past results.
          </p>
        </>
      )}
    </section>
  )
}
