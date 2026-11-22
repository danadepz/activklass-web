/**
 * The model's uncalibrated score as a teacher reads it: a percentage with two
 * decimals (owner decision 2026-11-22). Display only -- the band is always
 * decided from the unrounded score (Low < 0.35 <= Moderate < 0.50 <= High), and
 * the backend's own 0.50 flag is untouched.
 *
 * Rounding to two decimals can still carry a score across a cutoff on screen
 * (0.34999 would read 35.00% beside a Low band), so a score below a cutoff is
 * never shown at or above it: it is held at 34.99% / 49.99%.
 *
 * No score (insufficient data, not scored, not a number) gives null -- the
 * caller shows a dash, never an invented 0.00%.
 */
const CUTOFFS = [0.35, 0.5]

export function formatRiskScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  let pct = Math.round(score * 10000) / 100
  for (const cut of CUTOFFS) {
    if (score < cut && pct >= cut * 100) pct = cut * 100 - 0.01
  }
  return `${pct.toFixed(2)}%`
}
