import { line } from '@/theme'

/* ------------------------------------------------------------------ *
 * Skeleton — placeholder shapes for content that is still loading.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md).
 *
 * 26 route files tracked `isLoading` and every one of them rendered a line of
 * grey text: "Loading roster…", "Loading class record…". The reader gets no
 * sense of what is coming, and when the data lands a full table snaps into a
 * space that held one short sentence — the page jumps, and a jump reads as a
 * bug even when nothing is wrong.
 *
 * These are deliberately dumb: a shape, a size, a shimmer. The point is that
 * the placeholder occupies roughly the room the real thing will, so the
 * arrival is a fade rather than a jolt.
 *
 * The shimmer is a CSS animation (`ak-skeleton` in index.css), so the global
 * prefers-reduced-motion block collapses it to a flat grey for readers who
 * asked for that — which is the correct behaviour, not a degraded one.
 * ------------------------------------------------------------------ */

const BASE = {
  background: 'rgba(14,42,92,0.07)',
  borderRadius: 6,
  animation: 'ak-skeleton 1.4s ease-in-out infinite',
}

/** One line of text. `w` accepts any CSS width; default fills the container. */
export function SkeletonLine({ w = '100%', h = 12, style }) {
  return <div aria-hidden="true" style={{ ...BASE, width: w, height: h, ...style }} />
}

/** A solid block — an avatar, a chart area, a thumbnail. */
export function SkeletonBlock({ w = '100%', h = 80, radius = 10, style }) {
  return <div aria-hidden="true" style={{ ...BASE, width: w, height: h, borderRadius: radius, ...style }} />
}

/* Widths vary per row so the placeholder does not read as a grid of identical
   bars — real names and titles are ragged, and matching that is most of what
   makes a skeleton look like content rather than a loading graphic. */
const RAGGED = ['92%', '68%', '84%', '74%', '88%', '62%', '80%', '70%']

/* The superadmin console is the one dark surface in the app (zinc-950 cards on
   near-black). A white placeholder there flashes a bright card into a dark
   page and then swaps it for a dark one, which is worse than no skeleton. */
const SURFACES = {
  light: {
    card: '#FFFFFF',
    border: line,
    head: 'rgba(14,42,92,0.03)',
    rowLine: 'rgba(14,42,92,0.05)',
    bar: 'rgba(14,42,92,0.07)',
  },
  dark: {
    card: '#09090B',
    border: 'rgba(255,255,255,0.08)',
    head: 'rgba(255,255,255,0.03)',
    rowLine: 'rgba(255,255,255,0.05)',
    bar: 'rgba(255,255,255,0.09)',
  },
}

/**
 * A card-shaped table placeholder: header strip, then `rows` rows of `cols`
 * cells, inside the same card the real tables sit in.
 */
export function SkeletonTable({ rows = 6, cols = 4, label = 'Loading', tone = 'light' }) {
  const s = SURFACES[tone] ?? SURFACES.light
  const bar = { background: s.bar }
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 16, overflow: 'hidden' }}
    >
      <span className="sr-only">{label}</span>
      <div style={{ display: 'flex', gap: 16, padding: '14px 20px', background: s.head }}>
        {Array.from({ length: cols }, (_, i) => (
          <SkeletonLine key={i} w={i === 0 ? '30%' : '14%'} h={10} style={bar} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '16px 20px',
            borderTop: `1px solid ${s.rowLine}`,
          }}
        >
          {Array.from({ length: cols }, (_, c) => (
            <SkeletonLine
              key={c}
              w={c === 0 ? RAGGED[r % RAGGED.length] : '14%'}
              h={12}
              style={c === 0 ? { ...bar, maxWidth: '30%' } : bar}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * A grid of card placeholders — the class list, the quiz list, anything that
 * renders as tiles rather than rows.
 */
export function SkeletonCards({ count = 6, height = 132, label = 'Loading' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20, height }}
        >
          <SkeletonLine w="55%" h={14} />
          <SkeletonLine w="35%" h={10} style={{ marginTop: 10 }} />
          <SkeletonLine w="100%" h={8} style={{ marginTop: 22, borderRadius: 999 }} />
          <SkeletonLine w="42%" h={10} style={{ marginTop: 14 }} />
        </div>
      ))}
    </div>
  )
}

/**
 * A stack of list rows without the table chrome — announcements, activity
 * feeds, anything that is a column of cards.
 */
export function SkeletonList({ count = 4, height = 84, label = 'Loading' }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 14, padding: '18px 20px', height }}
        >
          <SkeletonLine w={RAGGED[i % RAGGED.length]} h={13} style={{ maxWidth: 320 }} />
          <SkeletonLine w="100%" h={10} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  )
}

/** A row of KPI tiles, matching the shared MetricCard (ui/Card.jsx) above most tables. */
export function SkeletonStats({ count = 4, label = 'Loading' }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{ background: 'rgba(14,42,92,0.04)', border: `1px solid ${line}`, borderRadius: 14, padding: '18px 20px' }}
        >
          <SkeletonLine w="60%" h={12} />
          <SkeletonLine w="42%" h={30} style={{ marginTop: 14 }} />
        </div>
      ))}
    </div>
  )
}
