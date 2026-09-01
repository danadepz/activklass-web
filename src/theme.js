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

/**
 * Chart-fill gold. Brand `gold` sits too light to carry a data mark on a white
 * card, so charts use this deepened step; UI chrome keeps the brighter gold.
 * Validated (with blueText/blue/goldDeep) for colorblind-safe adjacency.
 */
export const goldChart = '#D9A400'

/**
 * Accent pair for stat-card variety — decorative tints only, so a row of six
 * MetricCards isn't limited to the four brand hues. Not status colors: keep
 * green/red/gold for their meanings and use these where a tile just needs to
 * look different from its neighbours. The *Deep steps are the icon/text
 * colors that hold contrast on a white chip.
 */
export const violet = '#7C5CE0'
export const violetDeep = '#5B3DB8'
export const orange = '#E67E22'
export const orangeDeep = '#A85410'

// ---------------------------------------------------------------------------
// Typography
//
// Same story as the palette: `const serif = {...}` was redeclared in 25 files,
// mono in 21, sans in 18. Ready-made style objects (heading/mono) spread
// straight into style={{ ...heading }}; the *Family strings are for when a
// fontFamily value is needed on its own.
//
// ONE FACE, 2026-09-01. Until now the app rendered three: DM Serif Display on
// headings, Plus Jakarta Sans on body, and Lexend on the landing page. That
// was deliberate and it was applied from here, so it never drifted -- but a
// tester read the serif/sans pairing as inconsistency and asked for a single
// sans-serif throughout, and the owner took the suggestion. Every family below
// is now the same Plus Jakarta Sans stack, which is why 44 importing files
// needed no edit.
//
// WHAT REPLACED THE SERIF IS WEIGHT, and that is not optional. Tailwind's
// preflight resets h1-h6 to `font-weight: inherit`, so nothing in this app is
// bold by default -- a heading read as a heading purely because of its face,
// and 134 of the 135 sites that spread the token never set a weight. Drop the
// serif without adding weight and every heading collapses into body copy. So
// `heading` carries fontWeight 700, and index.css gives the same to the bare
// h1-h4 rule for the headings that inherit rather than spread. A call site
// that wants something else still wins: the token is spread first.
// ---------------------------------------------------------------------------

/** The one face. Every family token below is this stack, byte for byte the
 *  same as `--font-sans` / `--font-display` in index.css. */
export const sansFamily =
  "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"

/** Headings and display text. Same family as body -- size and weight are what
 *  separate them now, so prefer the `heading` object over this string. */
export const headingFamily = sansFamily

export const monoFamily = "'JetBrains Mono', ui-monospace, monospace"

/**
 * Historical names, kept because 44 files import them and renaming would mean
 * editing every lane at once. None of them is serif any more and none differs
 * from the others; new code should use `heading` / `headingFamily` /
 * `sansFamily`.
 */
export const serifFamily = headingFamily
export const serifAltFamily = headingFamily
export const sansUiFamily = sansFamily

/** Spread into style={{ ...heading }}. The weight is what makes it a heading. */
export const heading = { fontFamily: headingFamily, fontWeight: 700 }
export const mono = { fontFamily: monoFamily }

/** @deprecated aliases of `heading` -- see the note above. */
export const serif = heading
export const serifAlt = heading

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
