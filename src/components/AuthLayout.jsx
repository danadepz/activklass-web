import { Link } from 'react-router-dom'
import { Check, Eye, EyeOff, AlertCircle, ArrowRight } from './icons'

/* ------------------------------------------------------------------ *
 * AuthLayout — two-panel shell for Login / Register.
 *
 * Carries the navy + gold marketing identity (matching Landing), not the
 * indigo product UI. The left panel is the brand/value pitch (desktop
 * only); the right panel holds the page heading + form, which animate in
 * on mount (each route swap remounts this, replaying ak-swap). Switching
 * between sign-in and sign-up is via the prompt each page renders below
 * its form.
 *
 * The form primitives (inputs, submit button, error, eye toggle) are
 * exported so Login and Register share one styling source. Brand fonts and
 * the .ak-input / .ak-primary helpers live in index.html / index.css.
 * ------------------------------------------------------------------ */

const ink = '#0A1733'
const navy = '#0E2A5C'
const gold = '#F5C518'
const muted = '#6A7A95'
const cream = '#FAFAF6'

const serif = { fontFamily: "'Lexend', 'Inter', sans-serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }
const sans = "'Plus Jakarta Sans', sans-serif"

const PERKS = [
  'Computed, lockable DepEd & CHED gradebooks',
  'AI risk prediction and remediation you control',
  'RA 10173 parental-consent privacy, built in',
]

// --- shared form primitives (imported by Login / Register) ---------------
// Plain field styles (authInputStyle / authLabelStyle) live in ./authStyles.

export function SubmitButton({ children, ...props }) {
  return (
    <button
      {...props}
      className="ak-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3FA9F5] focus-visible:ring-offset-2 disabled:cursor-not-allowed"
      style={{
        marginTop: 4,
        width: '100%',
        padding: 15,
        fontSize: 15,
        fontWeight: 700,
        fontFamily: sans,
        color: cream,
        background: navy,
        border: 'none',
        borderRadius: 11,
        cursor: 'pointer',
        boxShadow: '0 3px 0 #061840, 0 10px 24px -12px rgba(14,42,92,0.5)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        opacity: props.disabled ? 0.7 : 1,
      }}
    >
      {children}
      <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', background: gold, color: navy }}>
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}

export function EyeToggle({ shown, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      className="transition hover:text-[#0E2A5C] focus-visible:outline-none focus-visible:text-[#0E2A5C]"
      style={{
        position: 'absolute',
        right: 6,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 34,
        height: 34,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: muted,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 8,
      }}
    >
      {shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  )
}

export function AuthError({ children }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2"
      style={{
        border: '1px solid rgba(159,18,57,0.2)',
        background: 'rgba(244,63,94,0.07)',
        color: '#9F1239',
        padding: '11px 13px',
        borderRadius: 11,
        fontSize: 14,
        margin: 0,
      }}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function AuthNotice({ children }) {
  return (
    <div
      style={{
        background: 'rgba(14,42,92,0.05)',
        border: '1px solid rgba(14,42,92,0.12)',
        borderRadius: 11,
        padding: '12px 14px',
        fontSize: 13,
        color: ink,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  )
}

// --- internal bits -------------------------------------------------------

export function BrandMark({ size = 32, onNavy = false }) {
  const bg = onNavy ? '#f4f1de' : '#0b1b33'
  const capBodyColor = onNavy ? '#0b1b33' : '#f4f1de'
  const goldColor = '#F5C518'
  const lightBlueColor = '#3FA9F5'
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      {/* Container Box */}
      <rect x="64" y="64" width="384" height="384" rx="92" fill={bg}/>
      
      {/* SVGrepo Graduation Cap centered & scaled */}
      <g transform="translate(106, 106) scale(0.764)">
        {/* White Underlay */}
        <path fill="#ffffff" d="M192.232,211.019L85.371,168.675v119.79c8.275-1.681,16.743-2.521,25.471-2.521 c33.487,0,63.677,12.735,81.519,33.552c17.842-20.816,47.968-33.552,81.519-33.552c8.727,0,17.325,0.84,25.471,2.521V171.649 l-99.232,39.434h-7.887V211.019z"/>
        {/* Cap Main Body */}
        <path fill={capBodyColor} d="M385.654,117.152L200.248,43.585c-2.521-1.034-5.495-1.034-8.016,0L6.697,117.152 c-9.438,4.461-8.404,17.067,0,20.299l56.889,22.562v142.739c0.517,7.176,6.4,13.059,14.481,10.279 c10.279-3.556,21.333-5.301,32.84-5.301c32,0,60.897,14.545,71.887,36.073c4.202,7.499,14.869,8.404,19.459-0.065 c10.925-21.527,39.693-36.008,71.693-36.008c11.507,0,22.626,1.745,32.84,5.301c7.046,2.392,14.287-2.909,14.481-10.279V162.987 l49.455-19.653v109.64c0,6.012,4.848,10.925,10.925,10.925c6.012,0,10.925-4.848,10.925-10.925V127.366 C392.571,122.712,389.856,119.544,385.654,117.152z M299.48,288.465c-8.275-1.681-16.743-2.521-25.471-2.521 c-33.487,0-63.677,12.735-81.519,33.552c-17.907-20.816-48.162-33.552-81.519-33.552c-8.727,0-17.325,0.84-25.471,2.521v-119.79 l106.861,42.343h8.016l99.232-39.434v116.816h-0.129V288.465z M196.24,189.168L40.313,127.366L196.24,65.564l155.798,61.802 L196.24,189.168z"/>
        {/* Gold Highlights */}
        <path fill={goldColor} d="M107.092,200.869h29.543c6.012,0,10.925,4.848,10.925,10.925c0,6.012-4.848,10.925-10.925,10.925 h-29.543v18.747h14.222c6.012,0,10.925,4.848,10.925,10.925c0,6.012-4.848,10.925-10.925,10.925h-14.222v0.84 c1.228,0,52.299-0.453,85.204,25.729c21.657-16.291,50.489-25.794,81.519-25.794c1.228,0,2.457,0,3.685,0.065v-76.154h-19.459 l-57.794,22.949h-8.016l-57.859-22.949h-27.281L107.092,200.869L107.092,200.869z"/>
        <polygon fill={goldColor} points="196.24,189.168 198.955,188.069 193.525,188.069"/>
        {/* Light Blue Top Diamond */}
        <polygon fill={lightBlueColor} points="40.313,127.366 196.24,189.168 352.038,127.366 196.24,65.435"/>
      </g>
    </svg>
  )
}

// --- shell ---------------------------------------------------------------

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div
      className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]"
      style={{ background: cream, color: ink, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      {/* LEFT — navy brand panel (desktop only); pinned so it stays in view
          while a tall form (register) scrolls the right column. */}
      <aside
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:self-start lg:h-screen"
        style={{ background: navy, color: cream, padding: 56 }}
      >
        <div aria-hidden="true" style={{ position: 'absolute', top: -140, right: -100, width: 460, height: 460, border: '1px solid rgba(245,197,24,0.16)', borderRadius: '50%' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: -80, right: -40, width: 340, height: 340, border: '1px solid rgba(245,197,24,0.1)', borderRadius: '50%' }} />
        <div aria-hidden="true" style={{ position: 'absolute', bottom: -120, left: -120, width: 380, height: 380, border: '1px solid rgba(63,169,245,0.14)', borderRadius: '50%' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: '30%', right: '8%', width: 220, height: 220, background: 'radial-gradient(circle, rgba(245,197,24,0.18), transparent 65%)', filter: 'blur(10px)' }} />

        {/* brand */}
        <Link to="/" className="relative flex w-fit items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E2A5C]" style={{ textDecoration: 'none', color: cream }}>
          <BrandMark onNavy />
          <span style={{ ...serif, fontSize: 26, letterSpacing: '-0.01em' }}>ActivKlass</span>
        </Link>

        {/* value prop — vertically centered in the panel */}
        <div className="relative" style={{ maxWidth: 460, marginTop: 'auto', marginBottom: 'auto', padding: '40px 0' }}>
          <div className="inline-flex items-center gap-2.5" style={{ padding: '8px 16px 8px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, marginBottom: 34 }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: gold, display: 'grid', placeItems: 'center', color: navy }}>
              <Check className="h-3 w-3" />
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(250,250,246,0.9)' }}>
              For DepEd K–12 &amp; CHED classrooms
            </span>
          </div>

          <h2 style={{ ...serif, fontSize: 'clamp(44px, 5vw, 62px)', lineHeight: 1.0, letterSpacing: '-0.025em', margin: '0 0 40px', textWrap: 'balance' }}>
            Class records that don't just <em style={{ fontStyle: 'italic', color: gold }}>record</em>.
          </h2>

          <div className="flex flex-col gap-5">
            {PERKS.map((perk) => (
              <div key={perk} className="flex items-start gap-4">
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: gold, color: navy, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span style={{ fontSize: 18, color: 'rgba(250,250,246,0.88)', lineHeight: 1.45 }}>{perk}</span>
              </div>
            ))}
          </div>
        </div>

        {/* footer note */}
        <div className="relative flex items-center gap-2.5" style={{ fontSize: 13, color: 'rgba(250,250,246,0.55)' }}>
          <span style={{ ...mono, fontSize: 13, background: 'rgba(255,255,255,0.08)', padding: '5px 10px', borderRadius: 6, color: 'rgba(250,250,246,0.7)' }}>
            🔒 RA 10173
          </span>
          <span>Privacy-first by design</span>
        </div>
      </aside>

      {/* RIGHT — form panel */}
      <main className="flex items-center justify-center px-6 py-12 md:px-10">
        <div className="w-full" style={{ maxWidth: 420 }}>
          {/* mobile brand (the panel is hidden on small screens) */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Link to="/" className="flex items-center gap-2.5" style={{ textDecoration: 'none' }}>
              <BrandMark />
              <span style={{ ...serif, fontSize: 22, color: navy }}>ActivKlass</span>
            </Link>
          </div>

          {/* heading + form animate in together on each route swap */}
          <div style={{ animation: 'ak-swap 0.4s cubic-bezier(0.22,1,0.36,1) both' }}>
            <h1 style={{ ...serif, fontSize: 'clamp(30px, 6vw, 40px)', lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 8px', color: ink }}>
              {title}
            </h1>
            {subtitle && <p style={{ fontSize: 15, color: muted, margin: '0 0 32px', lineHeight: 1.5 }}>{subtitle}</p>}

            {children}
          </div>

          <div style={{ textAlign: 'center', marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(14,42,92,0.08)', fontSize: 12, color: '#9AA6BD', lineHeight: 1.5 }}>
            Protected under the Philippine Data Privacy Act of 2012.
            <br />
            Your data is never shared without consent.
          </div>
        </div>
      </main>
    </div>
  )
}
