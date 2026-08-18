/**
 * ActivKlass brand palette -- the single source of truth for colour.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md). Every hex value in the app lives
 * here, so restyling the product means editing this file rather than hunting
 * through 25 route files.
 *
 * Before this existed each page redeclared its own `const navy = '#0E2A5C'`,
 * which had already drifted in two places. One was a genuine mistake and is
 * gone; the other turned out to be load-bearing -- see inkMuted below.
 */

// Core brand
export const navy = '#0E2A5C'
export const navyDeep = '#061840'
export const gold = '#F5C518'
export const goldDeep = '#8B6A00'
export const cream = '#FAFAF6'

// Text
export const ink = '#0A1733'
/**
 * The third text tone, between `ink` and `muted`.
 *
 * Kept, and no longer flagged as a drift. It was listed as one on the
 * suspicion that Markdown.jsx had merely misspelled `muted`, but the value is
 * written out as a raw `#3A4A6B` literal 22 times across 14 other files that
 * never import it -- body copy in the class pages, and the text colour of
 * every muted "Cancel" in a modal footer. It is load-bearing, and collapsing
 * it into `muted` (#6A7A95) would lighten text in 16 files.
 *
 * The real defect is the reverse: those 22 literals should import this token.
 * Left alone here rather than swept, since most of those files are held by
 * other panes -- see BACKLOG #10.
 */
export const inkMuted = '#3A4A6B'
export const muted = '#6A7A95'
export const faint = '#9AA6BD'

// Status
export const green = '#1F8A5B'
export const red = '#C0392B'
/** Slab under a filled danger button, as navyDeep is to navy. */
export const redDeep = '#922B21'
export const blue = '#3FA9F5'
export const blueText = '#1E6FB0'

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
  cream,
  ink,
  inkMuted,
  muted,
  faint,
  green,
  red,
  redDeep,
  blue,
  blueText,
}
