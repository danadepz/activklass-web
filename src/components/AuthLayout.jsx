import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Eye, EyeOff, AlertCircle, ArrowRight } from './icons'
import { ink, navy, gold, goldDeep, inkMuted, muted, cream, serifAlt as serif, sansFamily as sans } from '@/theme'
import Modal from '@/components/ui/Modal'

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

// T-141 (triplecookiemonster-188, decided 2026-10-08): reworded to Kristine's
// exact wording. The third bullet ("RA 10173 parental-consent privacy, built
// in") is dropped outright, per the owner -- she supplied wording for two of
// the three and didn't say what became of the third, so the card asked rather
// than guessed; privacy is still represented on this panel by the Privacy
// Policy link below (PrivacyPolicyModal), not by a perk bullet.
const PERKS = [
  'Configurable DepEd & CHED gradebooks',
  'AI-powered insights for student support',
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
        ...props.style,
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

// T-141 (triplecookiemonster-189 attachment 1): replaces the "🔒 RA 10173 /
// Privacy-first by design" chip on both panel variants. The card's own
// blocker was that a real Privacy Policy page does not exist yet, and a link
// to a 404 is worse than the chip it would replace -- a popup sidesteps that
// without waiting on a page or a route: the policy exists the moment this
// ships, not whenever a page gets built around it.
function PrivacyPolicyLink({ onOpen, dark = false }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: 'pointer',
        fontFamily: sans,
        fontSize: 13,
        fontWeight: 700,
        textDecoration: 'underline',
        color: dark ? 'rgba(250,250,246,0.85)' : navy,
      }}
    >
      Privacy Policy
    </button>
  )
}

// The policy itself. Written for this project directly -- nothing like it
// existed anywhere in either repo to adapt (checked before writing this).
// Plain language over legal boilerplate, same voice as the rest of the app;
// still covers what RA 10173 asks a policy to say: what is collected, why,
// the consent basis (including for a minor student, where a guardian's own
// consent is what the law is asking for), how it is protected, what rights
// a person has over their own data, and what is NOT built yet rather than
// a claim that it is -- `docs/OPEN-QUESTIONS.md` §8 is explicit that a
// self-service erasure path does not exist, so this does not promise one.
function PrivacyPolicyModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Privacy Policy"
      subtitle="How ActivKlass collects, uses and protects your information under RA 10173."
      size="lg"
    >
      <div className="flex flex-col" style={{ gap: 18 }}>
        <section>
          <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: ink }}>About this policy</h4>
          <p style={{ margin: 0 }}>
            ActivKlass is a capstone project built for DepEd and CHED classrooms, currently in
            its pilot phase — the people using it today are real teachers, students and school
            staff trying a system that is still being built. This policy applies to that pilot
            the same way it would to a finished product.
          </p>
        </section>
        <section>
          <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: ink }}>What we collect</h4>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Account details: your name, email address or login ID, phone number, and the school you're affiliated with.</li>
            <li>Class records: grades, attendance, quiz and assignment scores, and the syllabus content a teacher creates.</li>
            <li>AI-assisted features: when a teacher generates a quiz, a syllabus, or a risk prediction, the content involved (a topic, a student's grade history) is sent to the AI service behind that feature, and the result is saved into your class records.</li>
            <li>Guardian records: for a student account, whether a parent or guardian has given consent, and the link between a guardian account and the student they're responsible for.</li>
          </ul>
        </section>
        <section>
          <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: ink }}>Why we collect it</h4>
          <p style={{ margin: 0 }}>
            To run the class record and gradebook system you're using: computing grades,
            tracking attendance, generating and grading quizzes, predicting which students may
            need extra support, and connecting guardians to the students they're responsible for.
          </p>
        </section>
        <section>
          <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: ink }}>Consent, including for a minor</h4>
          <p style={{ margin: 0 }}>
            Many students using ActivKlass are minors. Where RA 10173 asks for a parent or
            guardian's consent before a minor's data is processed, that consent is recorded
            before a guardian account is linked to a student. A school or teacher that creates a
            student account is responsible for having the authorization their own enrollment
            process requires.
          </p>
        </section>
        <section>
          <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: ink }}>How it's protected</h4>
          <p style={{ margin: 0 }}>
            Your data is stored with the cloud infrastructure ActivKlass's hosting depends on,
            behind sign-in and access rules that limit who can read or change it — a teacher can
            only see the students in their own classes, for example, never every student on the
            platform.
          </p>
        </section>
        <section>
          <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: ink }}>Your rights</h4>
          <p style={{ margin: 0 }}>
            Under RA 10173 you have the right to be informed about what's collected, to access
            your own data, to have it corrected if it's wrong, and to object to or withdraw
            consent for certain uses. A fully self-service way to delete an account does not
            exist yet — until it does, a deletion request is handled by hand. Reach the
            ActivKlass team through the support channel you already use for this pilot to
            exercise any of these.
          </p>
        </section>
        <section>
          <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: ink }}>Changes to this policy</h4>
          <p style={{ margin: 0 }}>
            This is a pilot system under active development, so this policy will change as the
            product does.
          </p>
        </section>
      </div>
    </Modal>
  )
}

// --- internal bits -------------------------------------------------------

export function BrandMark({ size = 32, onNavy = false }) {
  /* The mark is a flat gold cap on transparency. On the navy shells it sits
     straight on the navy, which is where gold reads strongest. On light
     surfaces gold-on-cream washes out, so it keeps a navy plate behind it --
     the same job the old rounded container did, which is why that survives
     the swap rather than being dropped. */
  const cap = (px) => (
    <img
      src="/brand-cap.png"
      alt=""
      width={px}
      height={px}
      style={{ display: 'block', flexShrink: 0 }}
    />
  )

  if (onNavy) return cap(size)

  return (
    <span
      style={{
        display: 'grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: '#0b1b33',
        flexShrink: 0,
      }}
    >
      {cap(Math.round(size * 0.74))}
    </span>
  )
}

// --- shell ---------------------------------------------------------------

export default function AuthLayout({ title, subtitle, titleSize, variant, children }) {
  // T-141: one popup, shared by whichever variant renders below -- the
  // trigger differs (the chip each variant used to show its own copy of),
  // the modal does not.
  const [policyOpen, setPolicyOpen] = useState(false)
  const policyModal = <PrivacyPolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} />

  // variant="card": the whole screen is the brand navy, and ONE white
  // rounded container sits in the middle, split in two — the brand / value
  // pitch on its left half, the heading + form on its right half. The
  // default two-panel shell below is untouched (Login uses it).
  if (variant === 'card') {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 md:px-8"
        style={{ background: navy, color: ink, fontFamily: sans }}
      >
        {/* the wandering rings from the brand panel, five of them, behind the container */}
        <div aria-hidden="true" style={{ position: 'absolute', top: -160, left: -120, width: 480, height: 480, border: '1px solid rgba(245,197,24,0.18)', borderRadius: '50%', animation: 'ak-wander-a 46s linear infinite' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: -60, right: -140, width: 400, height: 400, border: '1px solid rgba(245,197,24,0.12)', borderRadius: '50%', animation: 'ak-wander-b 38s linear infinite', animationDelay: '-12s' }} />
        <div aria-hidden="true" style={{ position: 'absolute', bottom: -140, left: '18%', width: 360, height: 360, border: '1px solid rgba(63,169,245,0.16)', borderRadius: '50%', animation: 'ak-wander-c 52s linear infinite', animationDelay: '-20s' }} />
        <div aria-hidden="true" style={{ position: 'absolute', bottom: -180, right: -80, width: 520, height: 520, border: '1px solid rgba(63,169,245,0.12)', borderRadius: '50%', animation: 'ak-wander-a 58s linear infinite', animationDelay: '-30s' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: '35%', left: '42%', width: 240, height: 240, border: '1px solid rgba(245,197,24,0.14)', borderRadius: '50%', animation: 'ak-wander-b 44s linear infinite', animationDelay: '-6s' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: '15%', right: '12%', width: 260, height: 260, background: 'radial-gradient(circle, rgba(245,197,24,0.18), transparent 65%)', filter: 'blur(10px)', animation: 'ak-wander-c 60s linear infinite', animationDelay: '-35s' }} />

        <div
          className="relative grid w-full overflow-hidden lg:grid-cols-2"
          // T-129 (andecobs-174): the register form's right column recenters
          // every time a step's content gets taller or shorter than the
          // last one, which reads as the whole card jumping up and down.
          // 1140px holds that height steady instead of chasing each step's
          // own content -- measured live, not guessed: the Institution
          // seats step (two number inputs, the subscription summary, the
          // "schools are onboarded by..." notice) renders at 1089px at a
          // standard desktop width, the tallest of every reachable step on
          // either path, with ~50px of headroom on top for a validation
          // message. A first pass here picked 860px by eye and undershot
          // the real number by over 200px -- still shorter than this step,
          // so the jump it was meant to fix was still there, just smaller.
          style={{ maxWidth: 1480, minHeight: 'min(1140px, calc(100vh - 64px))', background: '#FFFFFF', borderRadius: 28, boxShadow: '0 40px 80px -30px rgba(0,0,0,0.55)', animation: 'ak-swap 0.4s cubic-bezier(0.22,1,0.36,1) both' }}
        >
          {/* LEFT half — brand + value prop, on cream. Desktop only. */}
          <section
            className="hidden lg:flex lg:flex-col lg:items-center lg:justify-center"
            style={{ background: cream, padding: 64, borderRight: '1px solid rgba(14,42,92,0.08)' }}
          >
            <div className="flex w-full flex-col" style={{ maxWidth: 440 }}>
              <Link to="/" className="flex w-fit items-center gap-3" style={{ textDecoration: 'none', color: navy, marginBottom: 40 }}>
                <BrandMark />
                <span style={{ ...serif, fontSize: 26, letterSpacing: '-0.01em' }}>ActivKlass</span>
              </Link>

              <div className="inline-flex w-fit items-center gap-2.5" style={{ padding: '8px 16px 8px 10px', background: 'rgba(14,42,92,0.06)', border: '1px solid rgba(14,42,92,0.1)', borderRadius: 999, marginBottom: 28 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: gold, display: 'grid', placeItems: 'center', color: navy }}>
                  <Check className="h-3 w-3" />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: navy }}>For DepEd K–12 &amp; CHED classrooms</span>
              </div>

              <h2 style={{ ...serif, fontSize: 'clamp(36px, 3.6vw, 48px)', lineHeight: 1.02, letterSpacing: '-0.025em', margin: '0 0 32px', color: ink, textWrap: 'balance' }}>
                Class records that don't just <em style={{ fontStyle: 'italic', color: goldDeep }}>record.</em>
              </h2>

              <div className="flex flex-col gap-4">
                {PERKS.map((perk) => (
                  <div key={perk} className="flex items-start gap-3.5">
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: gold, color: navy, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span style={{ fontSize: 15, color: inkMuted, lineHeight: 1.45 }}>{perk}</span>
                  </div>
                ))}
              </div>

              {/* T-141 (triplecookiemonster-189): replaces the "🔒 RA 10173 /
                  Privacy-first by design" chip. */}
              <div style={{ marginTop: 40 }}>
                <PrivacyPolicyLink onOpen={() => setPolicyOpen(true)} />
              </div>
            </div>
          </section>

          {/* RIGHT half — heading + form, centred. */}
          <main className="flex items-center justify-center px-6 py-12 md:px-12">
            {/* Wide enough for a two-column form, and the same on every
                step, so the container never resizes as the form advances. */}
            <div className="w-full" style={{ maxWidth: 680 }}>
              <div className="mb-8 flex justify-center lg:hidden">
                <Link to="/" className="flex items-center gap-2.5" style={{ textDecoration: 'none' }}>
                  <BrandMark />
                  <span style={{ ...serif, fontSize: 22, color: navy }}>ActivKlass</span>
                </Link>
              </div>

              <h1 style={{ ...serif, fontSize: titleSize ?? 'clamp(32px, 6.5vw, 44px)', lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 8px', color: ink, textAlign: 'center', textWrap: 'balance' }}>
                {title}
              </h1>
              {subtitle && <p style={{ fontSize: 15, color: muted, margin: '0 0 28px', lineHeight: 1.5, textAlign: 'center' }}>{subtitle}</p>}

              {children}
            </div>
          </main>
          {policyModal}
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]"
      style={{ background: cream, color: ink, fontFamily: sans }}
    >
      {/* LEFT — navy brand panel (desktop only); pinned so it stays in view
          while a tall form (register) scrolls the right column. */}
      <aside
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:items-center lg:sticky lg:top-0 lg:self-start lg:h-screen"
        style={{ background: navy, color: cream, padding: 56 }}
      >
        <div aria-hidden="true" style={{ position: 'absolute', top: -140, right: -100, width: 460, height: 460, border: '1px solid rgba(245,197,24,0.16)', borderRadius: '50%', animation: 'ak-wander-a 46s linear infinite' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: -80, right: -40, width: 340, height: 340, border: '1px solid rgba(245,197,24,0.1)', borderRadius: '50%', animation: 'ak-wander-b 38s linear infinite', animationDelay: '-12s' }} />
        <div aria-hidden="true" style={{ position: 'absolute', bottom: -120, left: -120, width: 380, height: 380, border: '1px solid rgba(63,169,245,0.14)', borderRadius: '50%', animation: 'ak-wander-c 52s linear infinite', animationDelay: '-20s' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: '30%', right: '8%', width: 220, height: 220, background: 'radial-gradient(circle, rgba(245,197,24,0.18), transparent 65%)', filter: 'blur(10px)', animation: 'ak-wander-b 60s linear infinite', animationDelay: '-35s' }} />

        {/* brand */}
        <Link to="/" className="relative flex w-fit items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E2A5C]" style={{ textDecoration: 'none', color: cream }}>
          <BrandMark onNavy />
          <span style={{ ...serif, fontSize: 26, letterSpacing: '-0.01em' }}>ActivKlass</span>
        </Link>

        {/* value prop — vertically centered in the panel */}
        <div className="relative w-full" style={{ maxWidth: 460, marginTop: 'auto', marginBottom: 'auto', padding: '40px 0' }}>
          <div className="inline-flex items-center gap-2.5" style={{ padding: '8px 16px 8px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, marginBottom: 34 }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: gold, display: 'grid', placeItems: 'center', color: navy }}>
              <Check className="h-3 w-3" />
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(250,250,246,0.9)' }}>
              For DepEd K–12 &amp; CHED classrooms
            </span>
          </div>

          <h2 style={{ ...serif, fontSize: 'clamp(44px, 5vw, 62px)', lineHeight: 1.0, letterSpacing: '-0.025em', margin: '0 0 40px', textWrap: 'balance' }}>
            Class records that don't just <em style={{ fontStyle: 'italic', color: gold }}>record.</em>
          </h2>

          <div className="flex flex-col gap-5">
            {PERKS.map((perk) => (
              <div key={perk} className="flex items-start gap-4">
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: gold, color: navy, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span style={{ fontSize: 16, color: 'rgba(250,250,246,0.88)', lineHeight: 1.45 }}>{perk}</span>
              </div>
            ))}
          </div>
        </div>

        {/* T-141: same replacement as the "card" variant above -- the chip
            becomes a popup trigger instead of the Privacy Policy page this
            card's own blocker says does not exist yet. */}
        <div className="relative">
          <PrivacyPolicyLink onOpen={() => setPolicyOpen(true)} dark />
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
            {/* T-129 / andecobs-172 ("Welcome!" undersized against the
                inputs below): bumped from clamp(30px, 6vw, 40px). This is
                login.jsx's own title -- the "card" variant above has its
                own copy of this same h1 and got the same bump. */}
            <h1 style={{ ...serif, fontSize: titleSize ?? 'clamp(32px, 6.5vw, 44px)', lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 8px', color: ink }}>
              {title}
            </h1>
            {subtitle && <p style={{ fontSize: 15, color: muted, margin: '0 0 32px', lineHeight: 1.5 }}>{subtitle}</p>}

            {children}
          </div>
        </div>
      </main>
      {policyModal}
    </div>
  )
}
