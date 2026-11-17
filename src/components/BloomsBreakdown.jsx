import { ink, muted, faint, line, navy, red, goldDeep, green, blueText, serif } from '@/theme'

/* ------------------------------------------------------------------ *
 * BloomsBreakdown — performance by Bloom's Taxonomy level, the gaps it
 * shows, and the remediation path that follows from them.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md). PRESENTATION ONLY: this
 * component computes nothing. It draws what it is handed and says so
 * plainly when it is handed nothing.
 *
 * DATA DEPENDENCY, NOT YET MET (Feature 4) -- the backend handoff:
 *   1. each quiz question stores the Bloom's level it assesses
 *      (one of BLOOMS_LEVELS[].key);
 *   2. per-question scores are aggregated by level, per class (and later
 *      per student), as a percent 0-100;
 *   3. recommendations arrive tagged with a level (e.g. from the backend's
 *      /api/remediate, which nothing calls yet).
 * Until then every caller passes `levels={null}` and this renders a
 * compact not-connected card: no bars, no numbers. Never pass sample
 * numbers -- a teacher reads this as their class.
 *
 *   levels           { remember: 72, understand: 55, ... } -- percent 0-100;
 *                    a missing/null key means "no data for that level";
 *                    the whole prop null means "not connected".
 *   recommendations  [{ id, level: 'apply', title, detail? }] or null.
 * ------------------------------------------------------------------ */

/** The six levels, lowest first. `key` is the lowercase word the quiz
 *  generator's Bloom's hint has always sent (routes/teacher/quizzes.jsx). */
export const BLOOMS_LEVELS = [
  { key: 'remember', level: 1, label: 'Remember', does: 'Recall facts and basic concepts' },
  { key: 'understand', level: 2, label: 'Understand', does: 'Explain ideas in their own words' },
  { key: 'apply', level: 3, label: 'Apply', does: 'Use what they know in a new situation' },
  { key: 'analyze', level: 4, label: 'Analyze', does: 'Break ideas apart and see how they connect' },
  { key: 'evaluate', level: 5, label: 'Evaluate', does: 'Judge and justify a position' },
  { key: 'create', level: 6, label: 'Create', does: 'Produce something new from what they learned' },
]

const byKey = Object.fromEntries(BLOOMS_LEVELS.map((b) => [b.key, b]))
export const levelName = (b) => `Level ${b.level} – ${b.label}`

/** The level each one builds on -- the taxonomy's own order, not a result. */
export function prerequisiteOf(key) {
  const b = byKey[key]
  return b && b.level > 1 ? BLOOMS_LEVELS[b.level - 2] : null
}

/* Same bands, colours and wording as the Scaffold Topics page's topic
   buckets (bucketOf in routes/teacher/classes/$classId/scaffolds.jsx), so
   a level and a topic at the same mastery read the same. */
export const BANDS = {
  needs: { label: 'Needs improvement', color: red, tint: 'rgba(192,57,43,0.08)', border: 'rgba(192,57,43,0.28)' },
  developing: { label: 'Developing', color: goldDeep, tint: 'rgba(245,197,24,0.14)', border: 'rgba(245,197,24,0.4)' },
  mastered: { label: 'Mastered', color: green, tint: 'rgba(31,138,91,0.1)', border: 'rgba(31,138,91,0.28)' },
}
export function bandOf(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return null
  if (pct < 60) return 'needs'
  if (pct < 80) return 'developing'
  return 'mastered'
}

const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v))))
const tabular = { fontVariantNumeric: 'tabular-nums' }

function Subhead({ title, note }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1" style={{ marginBottom: 10 }}>
      <h3 style={{ ...serif, fontSize: 16, color: ink, margin: 0 }}>{title}</h3>
      {note && <span style={{ fontSize: 12.5, color: muted }}>{note}</span>}
    </div>
  )
}

function Empty({ children }) {
  return (
    <p style={{ margin: 0, padding: '12px 14px', fontSize: 13, lineHeight: 1.5, color: muted, border: '1px dashed rgba(14,42,92,0.16)', borderRadius: 10 }}>
      {children}
    </p>
  )
}

function BandChip({ band }) {
  const b = BANDS[band]
  if (!b) return <span style={{ fontSize: 12, color: faint, whiteSpace: 'nowrap' }}>—</span>
  return (
    <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 600, color: b.color, background: b.tint, border: `1px solid ${b.border}`, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
      {b.label}
    </span>
  )
}

/** The taxonomy's order -- true of every class, so it is shown as reference. */
function LevelOrder() {
  return (
    <ol data-reference="blooms-order" className="flex flex-wrap items-center gap-1.5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {BLOOMS_LEVELS.map((b, i) => (
        <li key={b.key} className="inline-flex items-center gap-1.5">
          <span title={b.does} style={{ fontSize: 12.5, fontWeight: 600, color: ink, background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 8, padding: '4px 10px', whiteSpace: 'nowrap' }}>
            <span style={{ color: muted, fontWeight: 500, ...tabular }}>{b.level}</span> {b.label}
          </span>
          {i < BLOOMS_LEVELS.length - 1 && <span aria-hidden="true" style={{ color: faint, fontSize: 12 }}>→</span>}
        </li>
      ))}
    </ol>
  )
}

function LevelRow({ b, pct }) {
  const band = bandOf(pct)
  const has = band != null
  const color = has ? BANDS[band].color : faint
  return (
    <li
      data-level={b.key}
      data-band={band ?? 'none'}
      className="grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[200px_1fr_auto]"
      style={{ padding: '10px 0', borderTop: `1px solid ${line}` }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: ink }}>{levelName(b)}</div>
        <div style={{ fontSize: 12, color: muted, marginTop: 1 }}>{b.does}</div>
      </div>
      <div
        role="img"
        aria-label={has ? `${levelName(b)}: ${clamp(pct)} percent, ${BANDS[band].label}` : `${levelName(b)}: no data`}
        style={{ height: 8, background: has ? BANDS[band].tint : 'rgba(14,42,92,0.06)', borderRadius: 999, overflow: 'hidden' }}
      >
        {has && <div style={{ width: `${clamp(pct)}%`, height: '100%', background: color, borderRadius: 999 }} />}
      </div>
      <div className="flex items-center gap-2.5 sm:justify-end">
        <span style={{ fontSize: 13.5, fontWeight: 700, color, minWidth: 40, textAlign: 'right', ...tabular }}>{has ? `${clamp(pct)}%` : '—'}</span>
        <BandChip band={band} />
      </div>
    </li>
  )
}

const card = { background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }

export default function BloomsBreakdown({ levels = null, recommendations = null, title = "Bloom's Taxonomy Breakdown", sub }) {
  /* Not connected: one compact card. No bars, no "No data" rows -- an empty
     block keeps its frame and says one sentence, and stays small so the
     page's real data comes first. */
  if (levels == null) {
    return (
      <section aria-label={title} data-state="not-connected" className="mb-[22px]" style={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5" style={{ marginBottom: 6 }}>
          <h2 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>{title}</h2>
          <span role="status" style={{ flex: 'none', fontSize: 12, fontWeight: 600, color: blueText, background: 'rgba(63,169,245,0.1)', border: '1px solid rgba(63,169,245,0.3)', borderRadius: 999, padding: '2px 10px' }}>
            Not connected yet
          </span>
        </div>
        <p style={{ fontSize: 13.5, color: ink, lineHeight: 1.55, margin: '0 0 14px', maxWidth: 760 }}>
          Quiz questions are not tagged with a Bloom&rsquo;s level yet, so results by level, learning gaps and
          recommendations cannot be shown. Once each question records its level, the class&rsquo;s mastery at
          every level appears here, weakest foundations first.
        </p>
        <LevelOrder />
        <p style={{ fontSize: 12, color: muted, margin: '8px 0 0' }}>
          The six levels, in the order they build on each other. Reference only, not student results.
        </p>
      </section>
    )
  }

  const gaps = BLOOMS_LEVELS.filter((b) => bandOf(levels[b.key]) === 'needs')
  // Logical learning sequence: lowest level first, so foundations come before
  // what is built on them. A sort of what was handed in, not a recommendation.
  const recs = (recommendations ?? [])
    .filter((r) => byKey[r?.level])
    .sort((a, b) => byKey[a.level].level - byKey[b.level].level)

  return (
    <section aria-label={title} data-state="connected" className="mb-[22px]" style={card}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 13, color: muted, margin: '3px 0 0', lineHeight: 1.5 }}>
          {sub ?? 'How the class performs at each thinking level, where the gaps are, and what to review first.'}
        </p>
      </div>

      <div style={{ marginBottom: 22 }}>
        <Subhead title="Performance by Level" note="class average per level" />
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderBottom: `1px solid ${line}` }}>
          {BLOOMS_LEVELS.map((b) => (
            <LevelRow key={b.key} b={b} pct={levels[b.key]} />
          ))}
        </ul>
        <p style={{ fontSize: 12, color: muted, margin: '8px 0 0' }}>
          Below 60% needs improvement, 60–80% developing, 80% and up mastered — the same bands as the topic groups.
        </p>
      </div>

      <div style={{ marginBottom: 22 }}>
        <Subhead title="Learning Gaps" note={gaps.length ? `${gaps.length} level${gaps.length === 1 ? '' : 's'} need improvement` : undefined} />
        {gaps.length === 0 ? (
          <Empty>No level is below 60%. Nothing needs improvement right now.</Empty>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {gaps.map((b) => {
              const pre = prerequisiteOf(b.key)
              const preWeak = pre && bandOf(levels[pre.key]) === 'needs'
              return (
                <li key={b.key} data-gap={b.key} style={{ padding: '12px 14px', background: BANDS.needs.tint, border: `1px solid ${BANDS.needs.border}`, borderRadius: 12 }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: ink }}>{levelName(b)}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: red, ...tabular }}>{clamp(levels[b.key])}%</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: red, marginTop: 3 }}>Needs Improvement</div>
                  {pre && (
                    <div style={{ fontSize: 12.5, color: muted, marginTop: 4 }}>
                      Builds on {levelName(pre)}{preWeak ? ' — also below 60%, so review it first.' : '.'}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div>
        <Subhead title="Remediation Recommendations" note={recs.length ? 'foundations first' : undefined} />
        {recs.length === 0 ? (
          <Empty>No recommendations yet. Until they arrive, plan remediation per topic above.</Empty>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {recs.map((r, i) => {
              const b = byKey[r.level]
              const pre = prerequisiteOf(r.level)
              return (
                <li key={r.id ?? `${r.level}-${i}`} data-rec={r.level} style={{ padding: '12px 14px', border: `1px solid ${line}`, borderRadius: 12 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: ink }}>{r.title}</div>
                  <div style={{ fontSize: 12.5, color: blueText, fontWeight: 600, marginTop: 2 }}>{levelName(b)}</div>
                  {pre && <div style={{ fontSize: 12.5, color: muted, marginTop: 2 }}>Prerequisite: {levelName(pre)}</div>}
                  {r.detail && <p style={{ fontSize: 13, color: muted, margin: '4px 0 0', lineHeight: 1.5 }}>{r.detail}</p>}
                </li>
              )
            })}
          </ol>
        )}
        <div style={{ marginTop: 14 }}>
          <LevelOrder />
          <p style={{ fontSize: 12, color: muted, margin: '8px 0 0' }}>
            Review the lower level first: a student who cannot yet recall and explain an idea is not ready to apply or analyze it.
          </p>
        </div>
      </div>
    </section>
  )
}
