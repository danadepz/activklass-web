import { forwardRef, useState } from 'react'
import { navy, navyDeep, cream, ink, inkMuted, red, redDeep, gold, goldDeep, sansFamily } from '@/theme'

/* ------------------------------------------------------------------ *
 * Button — the shared button surface.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md). Extracted for BACKLOG #10:
 * with 235 hand-written <button> elements, "change how this button works"
 * and "change its colour" were the same file, so the UI lane could only own
 * theme tokens and never behaviour.
 *
 * THE VARIANTS BELOW WERE READ OUT OF THE CODEBASE, NOT DESIGNED.
 * Eight files had already grown their own local `btnPrimary` / `btnGhost` /
 * `btnDanger` constants — 24 of them, with the same names carrying different
 * values (`btnModalPrimary` was `12px 20px` in quizzes.jsx and `12px 22px` in
 * the class page; `btnPrimary` carried a 3px shadow in one file and 2px in
 * another). Each variant here is the majority spelling of one of those
 * clusters, so migrating a page is a no-op on screen in the common case.
 *
 * The hard shadow is the house rule and the reason `navyDeep`/`redDeep`/
 * `goldDeep` exist: a solid button sits on a 2–3px slab of its own colour
 * darkened, so it reads as a physical key. Flat variants have no slab.
 *
 * Interaction was previously absent. Only ONE button in the app (AuthLayout's
 * SubmitButton, via the .ak-primary class) had a hover or press state; the
 * other 234 were inert. That behaviour is reproduced here for every variant —
 * .ak-primary's exact lift/press geometry — but in the component rather than
 * in index.css, because a CSS class cannot vary the slab colour per variant
 * (.ak-primary hardcodes #061840, which would turn the danger button's shadow
 * navy on hover).
 *
 * Reduced motion is handled by the existing global block in index.css, which
 * kills transition-duration with !important.
 * ------------------------------------------------------------------ */

/** Fill + slab pairs. `slab: null` means a flat variant with no hard shadow. */
const VARIANTS = {
  /* Navy key. The default action on every page and modal footer. */
  primary: {
    fill: navy, text: cream, slab: navyDeep, weight: 700, border: 'none',
  },
  /* White with a hairline. Page-level secondary actions — navy text, bold. */
  ghost: {
    fill: '#FFFFFF', text: navy, slab: null, weight: 700,
    border: '1.5px solid rgba(14,42,92,0.14)', hoverFill: 'rgba(14,42,92,0.04)',
  },
  /* The same shell, muted. Modal Cancel and other step-back actions, where a
     bold navy Cancel competes with the primary key beside it. This is the one
     place inkMuted earns its keep — see the note in theme.js. */
  quiet: {
    fill: '#FFFFFF', text: inkMuted, slab: null, weight: 600,
    border: '1.5px solid rgba(14,42,92,0.14)', hoverFill: 'rgba(14,42,92,0.04)',
  },
  /* Outlined destructive. Inline "Delete this quiz" — reads as dangerous
     without shouting, which matters when it sits in a row of ghosts. */
  danger: {
    fill: '#FFFFFF', text: red, slab: null, weight: 600,
    border: '1.5px solid rgba(192,57,43,0.3)', hoverFill: 'rgba(192,57,43,0.06)',
  },
  /* Filled destructive. Reserved for a confirmation step that has already been
     asked for — the Sign out key inside the confirm dialog, not the trigger. */
  dangerSolid: {
    fill: red, text: cream, slab: redDeep, weight: 700, border: 'none',
  },
  /* Gold key. The landing page's call to action; gold-on-navy is the brand
     pairing, so this one takes navy text rather than cream. */
  gold: {
    fill: gold, text: navy, slab: goldDeep, weight: 700, border: 'none',
  },
}

/** Padding / type scale. `md` is the modal-footer and toolbar default. */
const SIZES = {
  sm: { padding: '10px 16px', fontSize: 13, gap: 7, lift: 2 },
  md: { padding: '12px 20px', fontSize: 14, gap: 9, lift: 3 },
}

const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', radius = 10, block = false, className = '', style, disabled, children, ...rest },
  ref,
) {
  const [hover, setHover] = useState(false)
  const [press, setPress] = useState(false)

  const v = VARIANTS[variant] ?? VARIANTS.primary
  const s = SIZES[size] ?? SIZES.md

  /* The slab thickness is what moves. At rest it is `lift`; hover adds a pixel
     and raises the face by one, press drops the face onto the slab. The two
     always sum to the same total height, so surrounding layout never shifts. */
  let shadow, translate
  if (v.slab && !disabled) {
    if (press) {
      shadow = `0 1px 0 ${v.slab}`
      translate = s.lift - 1
    } else if (hover) {
      shadow = `0 ${s.lift + 1}px 0 ${v.slab}`
      translate = -1
    } else {
      shadow = `0 ${s.lift}px 0 ${v.slab}`
      translate = 0
    }
  } else {
    shadow = v.slab ? `0 ${s.lift}px 0 ${v.slab}` : 'none'
    translate = 0
  }

  return (
    <button
      ref={ref}
      disabled={disabled}
      className={`ak-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3FA9F5] focus-visible:ring-offset-2 disabled:cursor-not-allowed ${className}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false) }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: block ? 'flex' : 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        width: block ? '100%' : undefined,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: v.weight,
        fontFamily: sansFamily,
        color: v.text,
        background: hover && !disabled && v.hoverFill ? v.hoverFill : v.fill,
        border: v.border,
        borderRadius: radius,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: shadow,
        transform: translate ? `translateY(${translate}px)` : undefined,
        transition: 'transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
})

export default Button

/**
 * The gold disc that trails a primary action ("Generate Quiz →").
 *
 * Four files had drawn this by hand as an inline <span>, each with its own
 * diameter. It only ever appears inside a Button, so it lives here.
 */
export function GoldArrowDot({ size = 20, children }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: gold,
        color: navy,
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  )
}

/**
 * Bare icon button — no fill, no border, no slab. The `iconBtn` constant that
 * grading.jsx and quizzes.$quizId.jsx had each declared separately.
 */
export function IconButton({ label, className = '', style, children, ...rest }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`ak-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3FA9F5] focus-visible:ring-offset-2 ${className}`}
      style={{
        display: 'grid',
        placeItems: 'center',
        background: hover ? 'rgba(14,42,92,0.06)' : 'transparent',
        border: 'none',
        borderRadius: 8,
        color: hover ? ink : undefined,
        cursor: 'pointer',
        padding: '4px 7px',
        lineHeight: 1,
        transition: 'background 0.12s ease, color 0.12s ease',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
