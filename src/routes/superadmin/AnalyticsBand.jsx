/**
 * Analytics band for the operations console.
 *
 * Everything is derived from the subscriber list the page already fetched --
 * see lib/superadminAnalytics.js. No endpoint, no polling, no second cost.
 *
 * Colour roles, deliberately kept apart (a colour means one thing on this page):
 *   data marks  #7c6ce4  violet, one hue for every bar in both charts
 *   status      emerald / sky / amber / zinc, exactly the STATUS_STYLE pills
 *   accent      amber-400, reserved for the primary action
 *
 * The violet is not a taste call. Slot-1 blue sits ΔE 14.5 from the sky used by
 * the `trial` pill -- under the 15 floor, so a bar would have read as a status.
 * #7c6ce4 clears every check against this surface (#121215): inside the dark
 * lightness band, above the chroma floor, >= 3:1 contrast, and far enough from
 * all four status hues that the worst pair on the page is now sky-vs-emerald,
 * which the pills already had.
 *
 * One hue for all bars is also on purpose: plans and months are nominal, so
 * colouring each bar differently would double-encode length as hue and spend
 * the only free channel on information the bar already shows.
 */

const SERIES = '#7c6ce4'

/** Bars carry the value at the tip; text never wears the data colour. */
function Tile({ label, value, hint, tone = 'default', children }) {
  const valueTone =
    tone === 'critical' ? 'text-red-400' : tone === 'good' ? 'text-emerald-400' : 'text-zinc-100'
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </div>
      {/* Proportional figures, not tabular: equal-width digits make a large
          standalone number look loose. */}
      <div className={`mt-1.5 text-3xl font-semibold leading-none tracking-tight ${valueTone}`}>
        {value}
      </div>
      {children}
      {hint && <div className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">{hint}</div>}
    </div>
  )
}

/**
 * Aggregate seat meter. The fill carries severity and the track is a recessive
 * step of the same surface, matching the per-row SeatMeter in the table below
 * so the band and the rows never disagree about what amber means.
 */
function SeatBar({ pct }) {
  if (pct == null) return null
  const width = Math.min(100, Math.max(0, pct))
  const fill = pct > 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          {title}
        </h3>
        {subtitle && <span className="font-mono text-[10px] text-zinc-600">{subtitle}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

/**
 * Signups per month, oldest → newest.
 *
 * Columns are capped at 24px and sit in a flex row whose gap supplies the 2px+
 * surface separation. Only the peak and the current month are direct-labelled;
 * every column carries its value in a tooltip and in the visually-hidden table
 * below, so no value is gated behind hover.
 */
function SignupsChart({ signups }) {
  const { buckets, peak } = signups
  const scaleMax = Math.max(1, peak)
  const latestKey = buckets[buckets.length - 1]?.key

  return (
    <figure className="m-0">
      <div className="flex h-24 items-end gap-2" role="img"
           aria-label={`Signups per month: ${buckets.map((b) => `${b.label} ${b.count}`).join(', ')}`}>
        {buckets.map((bucket) => {
          const isPeak = peak > 0 && bucket.count === peak
          const showLabel = isPeak || bucket.key === latestKey
          // Zero still gets a visible 2px stub so the month reads as "none"
          // rather than as a gap in the axis.
          const height = bucket.count === 0 ? 2 : Math.max(6, (bucket.count / scaleMax) * 76)
          return (
            <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              {showLabel && bucket.count > 0 && (
                <span className="font-mono text-[10px] leading-none text-zinc-400 tabular-nums">
                  {bucket.count}
                </span>
              )}
              <div
                title={`${bucket.label} ${bucket.year}: ${bucket.count} signup${bucket.count === 1 ? '' : 's'}`}
                className="w-full max-w-[24px] cursor-default rounded-t-[4px] transition-opacity hover:opacity-80"
                style={{
                  height: `${height}px`,
                  backgroundColor: bucket.count === 0 ? '#3f3f46' : SERIES,
                }}
              />
            </div>
          )
        })}
      </div>
      {/* Axis band is inside the container, so the card never grows a nested scroll. */}
      <figcaption className="mt-2 flex gap-2 border-t border-zinc-800 pt-1.5">
        {buckets.map((bucket) => (
          <span
            key={bucket.key}
            className="min-w-0 flex-1 text-center font-mono text-[10px] text-zinc-600 tabular-nums"
          >
            {bucket.label}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}

/**
 * Plan mix, biggest first. Horizontal bars because plan labels are long and a
 * column chart would turn them diagonal.
 *
 * A single plan is not a chart -- one bar carries no comparison -- so that case
 * degrades to the number, which is what it always was.
 */
function PlanMixChart({ plans, total }) {
  if (plans.length === 0) {
    return <p className="py-4 text-center text-xs text-zinc-600">No subscribers in this slice.</p>
  }
  if (plans.length === 1) {
    const only = plans[0]
    return (
      <p className="py-3 text-sm text-zinc-300">
        All <span className="font-mono font-semibold text-zinc-100">{only.count}</span> on{' '}
        <span className="text-zinc-100">{only.label}</span>
      </p>
    )
  }

  const scaleMax = Math.max(...plans.map((p) => p.count), 1)
  return (
    <div className="space-y-2" role="img"
         aria-label={`Plan mix: ${plans.map((p) => `${p.label} ${p.count}`).join(', ')}`}>
      {plans.map((plan) => {
        const share = total > 0 ? Math.round((plan.count / total) * 100) : 0
        return (
          <div key={plan.key} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2">
            <span className="truncate text-[11px] text-zinc-400" title={plan.label}>
              {plan.label}
            </span>
            <div className="h-2.5 overflow-hidden rounded-[4px] bg-zinc-800/70">
              <div
                title={`${plan.label}: ${plan.count} (${share}%)`}
                className="h-full rounded-r-[4px]"
                style={{
                  width: `${Math.max(2, (plan.count / scaleMax) * 100)}%`,
                  backgroundColor: SERIES,
                }}
              />
            </div>
            {/* Value at the tip, in a text token — never in the data colour. */}
            <span className="text-right font-mono text-[11px] text-zinc-300 tabular-nums">
              {plan.count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function AnalyticsBand({ analytics, total, stale = false }) {
  const { summary, plans, signups } = analytics
  const students = summary.students

  const seatValue = students.pct == null ? '—' : `${students.pct}%`
  const seatHint =
    students.pct == null
      ? students.unlimited > 0
        ? `${students.unlimited} uncapped · ${students.uncapped} students`
        : 'No capped plans in this slice'
      : `${students.used.toLocaleString()} of ${students.seats.toLocaleString()} student seats` +
        (students.unlimited > 0 ? ` · ${students.unlimited} uncapped` : '')

  return (
    // Held at reduced opacity while refetching rather than swapped for a
    // skeleton, so the numbers never jump on a poll.
    <section
      className={`transition-opacity duration-200 ${stale ? 'opacity-60' : 'opacity-100'}`}
      aria-busy={stale}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Subscribers"
          value={summary.total}
          hint={`${summary.institutions} institution${summary.institutions === 1 ? '' : 's'} · ${summary.teachers} solo`}
        />
        <Tile
          label="Active"
          value={summary.byStatus.active}
          hint={`${summary.byStatus.trial} trial · ${summary.byStatus.suspended} suspended · ${summary.byStatus.cancelled} cancelled`}
        />
        <Tile label="Student seats" value={seatValue} hint={seatHint}>
          <SeatBar pct={students.pct} />
        </Tile>
        <Tile
          label="Over seats"
          value={summary.overSeats}
          tone={summary.overSeats > 0 ? 'critical' : 'good'}
          hint={
            summary.overSeats > 0
              ? 'Past a seat cap — renegotiate or suspend'
              : 'Every subscriber within cap'
          }
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ChartCard
          title="Signups"
          subtitle={
            signups.undated > 0
              ? `last ${signups.buckets.length} months · ${signups.undated} undated`
              : `last ${signups.buckets.length} months`
          }
        >
          <SignupsChart signups={signups} />
        </ChartCard>
        <ChartCard title="Plan mix" subtitle={`${plans.length} plan${plans.length === 1 ? '' : 's'}`}>
          <PlanMixChart plans={plans} total={total} />
        </ChartCard>
      </div>
    </section>
  )
}
