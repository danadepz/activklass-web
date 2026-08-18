/**
 * ActivKlass brand palette -- the single source of truth for colour.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md). Every hex value in the app lives
 * here, so restyling the product means editing this file rather than hunting
 * through 25 route files.
 *
 * Before this existed each page redeclared its own `const navy = '#0E2A5C'`,
 * which had already drifted in two places -- see goldAmber and inkMuted below.
 */

// Core brand
export const navy = '#0E2A5C'
export const navyDeep = '#061840'
export const gold = '#F5C518'
export const goldDeep = '#8B6A00'
export const cream = '#FAFAF6'

// Text
export const ink = '#0A1733'
export const muted = '#6A7A95'
export const faint = '#9AA6BD'

// Status
export const green = '#1F8A5B'
export const red = '#C0392B'
export const blue = '#3FA9F5'
export const blueText = '#1E6FB0'

/**
 * Drifted variants, kept so the extraction changed no pixels.
 *
 * goldAmber: routes/index.jsx called this `goldDeep`, but lighter than the
 * value the other 17 files use.
 * inkMuted: Markdown.jsx called this `muted` and one file called it `slate`,
 * both darker than the `muted` everywhere else.
 *
 * If the UI lane decides these were mistakes, collapse them into goldDeep and
 * muted and delete these two exports.
 */
export const goldAmber = '#B58F00'
export const inkMuted = '#3A4A6B'

// ---------------------------------------------------------------------------
// Typography
//
// Same story as the palette: `const serif = {...}` was redeclared in 25 files,
// mono in 21, sans in 18. Ready-made style objects (serif/mono) spread
// straight into style={{ ...serif }}; the *Family strings are for when a
// fontFamily value is needed on its own.
// ---------------------------------------------------------------------------

export const serifFamily = "'DM Serif Display', Georgia, serif"
export const monoFamily = "'JetBrains Mono', ui-monospace, monospace"
export const sansFamily = "'Plus Jakarta Sans', sans-serif"

/** Used by routes/index.jsx only; a different display face from the rest. */
export const serifAltFamily = "'Lexend', 'Inter', sans-serif"
/** Same stack as sansFamily plus a system-ui fallback. */
export const sansUiFamily = "'Plus Jakarta Sans', system-ui, sans-serif"

export const serif = { fontFamily: serifFamily }
export const mono = { fontFamily: monoFamily }
export const serifAlt = { fontFamily: serifAltFamily }

/** Hairline border colour used for card and table edges throughout. */
export const line = 'rgba(14,42,92,0.08)'

/** Everything at once, for spreading into a style object. */
export const palette = {
  navy,
  navyDeep,
  gold,
  goldDeep,
  goldAmber,
  cream,
  ink,
  inkMuted,
  muted,
  faint,
  green,
  red,
  blue,
  blueText,
}
