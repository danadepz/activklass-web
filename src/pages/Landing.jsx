import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles, Check } from '../components/icons'

/* ------------------------------------------------------------------ *
 * Landing — marketing page for Activklass.
 *
 * This page deliberately uses its own navy + gold + cream brand
 * identity (DM Serif Display / Plus Jakarta Sans / JetBrains Mono),
 * distinct from the indigo product UI. The palette lives here as inline
 * styles because the values are bespoke to this page; structural layout
 * stays in Tailwind so the page is responsive. The ak-float / ak-pulse
 * keyframes are defined in index.css.
 * ------------------------------------------------------------------ */

const ink = '#0A1733'
const navy = '#0E2A5C'
const navyDeep = '#061840'
const gold = '#F5C518'
const goldDeep = '#B58F00'
const blue = '#3FA9F5'
const slate = '#3A4A6B'
const muted = '#6A7A95'
const line = 'rgba(14,42,92,0.08)'

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }

// --- content -------------------------------------------------------------

const TRUST = [
  { stat: '12', suffix: '+', label: 'Pilot campuses' },
  { stat: '3.4k', suffix: '', label: 'Students enrolled' },
  { stat: 'RA 10173', suffix: '', label: 'Privacy-compliant' },
]

const HEAT_PALETTE = [
  'rgba(255,255,255,0.06)',
  'rgba(63,169,245,0.25)',
  'rgba(63,169,245,0.5)',
  'rgba(245,197,24,0.55)',
  'rgba(245,197,24,0.85)',
  '#F5C518',
]
const HEAT_SEED = [
  0, 1, 2, 1, 3, 4, 5, 4, 1, 0, 2, 3, 4, 5, 5, 3, 2, 1, 3, 4, 5, 4, 3, 2, 0, 2,
  3, 5, 5, 4, 3, 1,
]

const ROSTER = [
  { initials: 'AR', name: 'Aquino, R.', avatarColor: navy, ww: 89, pt: 92, qe: 86, fg: 90, fgColor: navy },
  { initials: 'BL', name: 'Bautista, L.', avatarColor: blue, ww: 76, pt: 81, qe: 73, fg: 78, fgColor: navy },
  { initials: 'CM', name: 'Cruz, M.', avatarColor: gold, ww: 68, pt: 70, qe: 65, fg: 69, fgColor: goldDeep },
  { initials: 'DJ', name: 'Dela Peña, J.', avatarColor: navy, ww: 94, pt: 96, qe: 92, fg: 94, fgColor: navy },
  { initials: 'EF', name: 'Estrada, F.', avatarColor: blue, ww: 82, pt: 79, qe: 84, fg: 82, fgColor: navy },
]

const RISKS = [
  { name: 'Cruz, M.', score: '69 · linear eq', pct: '38%' },
  { name: 'Garcia, P.', score: '72 · fractions', pct: '52%' },
  { name: 'Hidalgo, T.', score: '74 · word probs', pct: '61%' },
]

const DESIGNED_FOR = [
  'Class advisers',
  'Subject teachers',
  'Department heads',
  'Registrars',
  'CHED faculty',
]

const STEPS = [
  {
    n: '1',
    title: 'Set up your class record',
    body: 'Create classes, import your roster by CSV, and configure DepEd or CHED grading weights in minutes.',
    lines: [
      'Import roster.csv (32 students)',
      'Set WW · PT · QE weights',
      'Locked for SY 2026–27 Q2',
    ],
  },
  {
    n: '2',
    title: 'Teach, assess, and grade',
    body: 'Record scores in a computed, lockable gradebook. Build or AI-generate quizzes — you approve every draft.',
    lines: [
      'Draft quiz · Linear Equations',
      'Teacher review · 12 items',
      'Published to 9-Sampaguita',
    ],
  },
  {
    n: '3',
    title: 'See who needs help, early',
    body: 'AI flags at-risk students and least-mastered skills, then suggests targeted remediation you stay in control of.',
    lines: [
      '3 at-risk · advisory class',
      'Skill · linear equations',
      'Remediation pack queued',
    ],
  },
]

const BADGES = [
  'DepEd Order No. 8 s. 2015',
  'CHED tertiary mode',
  'RA 10173 compliant',
  'NPC-registered DPO',
  'WCAG 2.1 AA',
]

const AUDIT = [
  { time: '09:42:18', action: 'Grade lock applied · Q2', actor: 'Class adviser · Grade 9', status: 'LOCKED', statusColor: navy, statusBg: 'rgba(14,42,92,0.08)' },
  { time: '09:38:02', action: 'AI remediation reviewed', actor: 'Subject teacher · Math', status: 'APPROVED', statusColor: navy, statusBg: 'rgba(63,169,245,0.15)' },
  { time: '09:31:55', action: 'Parental consent verified', actor: 'System · guardian portal', status: '✓', statusColor: navy, statusBg: 'rgba(63,169,245,0.15)' },
  { time: '09:27:11', action: 'Roster imported · CSV', actor: 'Department head · JHS', status: 'DONE', statusColor: goldDeep, statusBg: 'rgba(245,197,24,0.18)' },
]

const RESULTS = [
  { stat: '−68', unit: '%', body: 'time spent on quarterly grade computation' },
  { stat: '+22', unit: '%', body: 'at-risk students caught before Q2 cutoff' },
  { stat: '3', unit: '×', body: 'faster remediation turnaround per skill' },
  { stat: '100', unit: '%', body: 'parental-consent coverage in pilot cohorts' },
]

const PERKS = [
  'Unlimited classes & students through SY 2026–27',
  'Onboarding session with our pilot success team',
  'Direct line to our DPO for compliance questions',
  'Early access to the AI remediation studio',
]

// --- small building blocks ----------------------------------------------

function Logo({ size = 32 }) {
  const ring = Math.round(size * 0.44)
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: size * 0.25,
        background: navy,
        display: 'grid',
        placeItems: 'center',
        boxShadow: `0 2px 0 ${navyDeep}`,
      }}
    >
      <div
        style={{
          width: ring,
          height: ring,
          borderRadius: '50%',
          border: `2.5px solid ${gold}`,
          borderRightColor: 'transparent',
          transform: 'rotate(35deg)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -3,
          right: -3,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: gold,
        }}
      />
    </div>
  )
}

function Eyebrow({ children, color = muted }) {
  return (
    <div
      style={{
        fontSize: 12,
        color,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: 14,
      }}
    >
      <span style={{ color: gold, marginRight: 8 }}>✦</span>
      {children}
    </div>
  )
}

const primaryBtn =
  'inline-flex items-center gap-2.5 rounded-xl px-6 py-4 text-[15px] font-bold transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3FA9F5] focus-visible:ring-offset-2'

// --- page ----------------------------------------------------------------

export default function Landing() {
  return (
    <div style={{ background: '#FAFAF6', color: ink, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:text-white"
        style={{ background: navy }}
      >
        Skip to content
      </a>

      {/* NAV */}
      <nav
        className="sticky top-0 z-40"
        style={{
          background: 'rgba(250,250,246,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(14,42,92,0.08)',
        }}
      >
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4 md:px-8">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span style={{ ...serif, fontSize: 22, color: navy, letterSpacing: '-0.01em' }}>
              Activklass
            </span>
          </div>
          <div className="flex items-center gap-5 md:gap-7">
            <a href="#features" className="hidden text-sm font-medium transition hover:opacity-70 md:inline" style={{ color: '#4A5A7A' }}>
              Features
            </a>
            <a href="#how" className="hidden text-sm font-medium transition hover:opacity-70 md:inline" style={{ color: '#4A5A7A' }}>
              How it works
            </a>
            <a href="#compliance" className="hidden text-sm font-medium transition hover:opacity-70 md:inline" style={{ color: '#4A5A7A' }}>
              Compliance
            </a>
            <Link to="/login" className="text-sm font-semibold transition hover:opacity-70" style={{ color: navy }}>
              Sign in
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2.5 text-sm font-semibold transition hover:brightness-110"
              style={{ background: navy, color: '#FAFAF6', boxShadow: `0 2px 0 ${navyDeep}` }}
            >
              Go to Portal <span style={{ color: gold }}>→</span>
            </Link>
          </div>
        </div>
      </nav>

      <main id="main">
        {/* HERO */}
        <section className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 pb-24 pt-16 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div>
            <div
              className="mb-7 inline-flex items-center gap-2"
              style={{
                padding: '7px 14px 7px 10px',
                background: 'rgba(14,42,92,0.06)',
                border: '1px solid rgba(14,42,92,0.12)',
                borderRadius: 999,
              }}
            >
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: gold, display: 'grid', placeItems: 'center', color: navy }}>
                <Check className="h-3 w-3" />
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: navy }}>
                Built for DepEd K–12 &amp; CHED classrooms
              </span>
            </div>

            <h1
              className="text-[clamp(44px,8vw,74px)]"
              style={{ ...serif, lineHeight: 0.98, letterSpacing: '-0.025em', margin: '0 0 24px', color: ink, textWrap: 'balance' }}
            >
              Class records that don't just{' '}
              <em style={{ fontStyle: 'italic', color: navy, position: 'relative' }}>
                record
                <span style={{ position: 'absolute', left: '2%', right: '-2%', bottom: 6, height: 12, background: gold, zIndex: -1, borderRadius: 2 }} />
              </em>
              .
            </h1>

            <p style={{ fontSize: 19, lineHeight: 1.55, color: slate, margin: '0 0 36px', maxWidth: 540 }}>
              Automated grade computation, predictive remediation, and a
              privacy-first design — so you spend less time on spreadsheets and
              more time with your students.
            </p>

            <div className="mb-7 flex flex-wrap items-center gap-3.5">
              <Link
                to="/login"
                className={primaryBtn}
                style={{ background: navy, color: '#FAFAF6', boxShadow: `0 3px 0 ${navyDeep}, 0 10px 30px -10px rgba(14,42,92,0.4)` }}
              >
                Go to Portal
                <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', background: gold, color: navy }}>
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-4 text-[15px] font-semibold transition hover:bg-[rgba(14,42,92,0.04)]"
                style={{ color: navy, border: '1.5px solid rgba(14,42,92,0.18)' }}
              >
                See how it works →
              </a>
            </div>

            {/* trust row */}
            <div className="flex items-center gap-6" style={{ paddingTop: 24, borderTop: `1px solid ${line}` }}>
              {TRUST.map((t, i) => (
                <div key={t.label} className="flex items-center gap-6">
                  {i > 0 && <div style={{ width: 1, height: 36, background: 'rgba(14,42,92,0.1)' }} />}
                  <div>
                    <div style={{ ...serif, fontSize: 28, color: navy, lineHeight: 1 }}>
                      {t.stat}
                      {t.suffix && <span style={{ color: gold }}>{t.suffix}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: muted, fontWeight: 500, marginTop: 4 }}>
                      {t.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero visual: stylized gradebook card stack */}
          <div className="relative mx-auto w-full max-w-[560px] lg:justify-self-end" style={{ aspectRatio: '1 / 1' }}>
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: '8% 4% 4% 8%',
                background:
                  'radial-gradient(circle at 30% 30%, rgba(245,197,24,0.25), transparent 60%), radial-gradient(circle at 70% 70%, rgba(63,169,245,0.2), transparent 55%)',
                filter: 'blur(20px)',
              }}
            />

            {/* Back card: skill mastery heatmap */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '78%',
                background: navy,
                borderRadius: 20,
                padding: 22,
                color: '#FAFAF6',
                boxShadow: '0 30px 60px -20px rgba(14,42,92,0.4)',
                transform: 'rotate(3deg)',
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: gold, textTransform: 'uppercase' }}>
                  Skill mastery
                </div>
                <div className="flex gap-1">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: gold }} />
                </div>
              </div>
              <div style={{ ...serif, fontSize: 22, lineHeight: 1.15, marginBottom: 18 }}>
                Grade 9 · Algebra
              </div>
              <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                {HEAT_SEED.map((c, i) => (
                  <div key={i} style={{ aspectRatio: '1', borderRadius: 4, background: HEAT_PALETTE[c] }} />
                ))}
              </div>
              <div className="flex items-center justify-between" style={{ ...mono, marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                <span>low</span>
                <span>mastered →</span>
              </div>
            </div>

            {/* Front card: gradebook row */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '82%',
                background: '#FAFAF6',
                borderRadius: 20,
                padding: 22,
                boxShadow: '0 30px 60px -15px rgba(14,42,92,0.25), 0 0 0 1px rgba(14,42,92,0.08)',
                transform: 'rotate(-2deg)',
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: muted, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Class record
                  </div>
                  <div style={{ ...serif, fontSize: 18, color: ink, lineHeight: 1.1, marginTop: 2 }}>
                    9-Sampaguita · Q2
                  </div>
                </div>
                <div style={{ ...mono, fontSize: 10, background: 'rgba(14,42,92,0.06)', color: navy, padding: '4px 8px', borderRadius: 6, fontWeight: 600 }}>
                  🔒 LOCKED
                </div>
              </div>

              <div style={{ border: '1px solid rgba(14,42,92,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                <div
                  className="grid"
                  style={{ gridTemplateColumns: '1.6fr 0.7fr 0.7fr 0.7fr 0.7fr', background: 'rgba(14,42,92,0.04)', padding: '8px 10px', fontSize: 10, color: muted, fontWeight: 700, letterSpacing: '0.04em' }}
                >
                  <div>STUDENT</div>
                  <div className="text-center">WW</div>
                  <div className="text-center">PT</div>
                  <div className="text-center">QE</div>
                  <div className="text-center">FG</div>
                </div>
                {ROSTER.map((r) => (
                  <div
                    key={r.initials}
                    className="grid items-center"
                    style={{ gridTemplateColumns: '1.6fr 0.7fr 0.7fr 0.7fr 0.7fr', padding: '9px 10px', fontSize: 12, borderTop: '1px solid rgba(14,42,92,0.05)' }}
                  >
                    <div className="flex items-center gap-2" style={{ fontWeight: 500, color: ink }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: r.avatarColor, color: 'white', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700 }}>
                        {r.initials}
                      </span>
                      {r.name}
                    </div>
                    <div className="text-center" style={{ ...mono, color: slate }}>{r.ww}</div>
                    <div className="text-center" style={{ ...mono, color: slate }}>{r.pt}</div>
                    <div className="text-center" style={{ ...mono, color: slate }}>{r.qe}</div>
                    <div className="text-center" style={{ ...mono, fontWeight: 700, color: r.fgColor }}>{r.fg}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI nudge chip */}
            <div
              className="flex items-center gap-2.5"
              style={{
                position: 'absolute',
                bottom: '14%',
                right: '-4%',
                background: '#FAFAF6',
                borderRadius: 14,
                padding: '12px 14px',
                boxShadow: '0 16px 40px -10px rgba(14,42,92,0.25), 0 0 0 1px rgba(14,42,92,0.08)',
                maxWidth: 220,
                animation: 'ak-float 5s ease-in-out infinite 1s',
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: gold, display: 'grid', placeItems: 'center', flexShrink: 0, color: navy }}>
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: muted, fontWeight: 600 }}>AI suggests</div>
                <div style={{ fontSize: 12, color: ink, fontWeight: 600, lineHeight: 1.25 }}>
                  Remediation for 3 students on{' '}
                  <span style={{ color: navy }}>linear equations</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* LOGO STRIP */}
        <section style={{ borderTop: `1px solid ${line}`, borderBottom: `1px solid ${line}`, background: 'rgba(14,42,92,0.02)' }}>
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-12 gap-y-3 px-6 py-6 md:px-8">
            <div style={{ fontSize: 12, color: muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Designed for
            </div>
            <div className="flex flex-wrap items-center gap-x-12 gap-y-2" style={{ ...serif, color: navy, fontSize: 18, opacity: 0.85 }}>
              {DESIGNED_FOR.map((d, i) => (
                <span key={d} className="flex items-center gap-12">
                  {i > 0 && <span style={{ color: 'rgba(14,42,92,0.2)' }}>·</span>}
                  {d}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="mx-auto max-w-[1240px] px-6 pb-20 pt-28 md:px-8">
          <div className="mb-14 grid items-end gap-10 md:grid-cols-[1fr_1.4fr] md:gap-20">
            <div>
              <Eyebrow>What's inside</Eyebrow>
              <h2 className="text-[clamp(36px,5vw,56px)]" style={{ ...serif, lineHeight: 1.02, letterSpacing: '-0.02em', margin: 0, color: ink, textWrap: 'balance' }}>
                Everything a class record <em style={{ color: navy }}>should</em> be.
              </h2>
            </div>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: slate, margin: 0, maxWidth: 480 }}>
              Built around how Filipino teachers actually grade — with an AI
              layer that supports learning instead of replacing judgment. Every
              recommendation gets a teacher's sign-off.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {/* Feature 1 — Grading */}
            <article className="flex flex-col" style={{ background: '#FAFAF6', border: `1px solid ${line}`, borderRadius: 20, padding: 28, minHeight: 360 }}>
              <div style={{ ...mono, fontSize: 11, color: muted, fontWeight: 500, marginBottom: 20 }}>01 / Grading</div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ background: navy, borderRadius: 12, padding: 14, color: '#FAFAF6' }}>
                  <div className="flex justify-between" style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                    <span>WW · PT · QE</span>
                    <span>weighted</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5" style={{ marginBottom: 12 }}>
                    {[['WW', '87.4'], ['PT', '92.1'], ['QE', '81.0']].map(([k, v]) => (
                      <div key={k} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '8px 6px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{k}</div>
                        <div style={{ ...mono, fontSize: 14, color: '#FAFAF6', fontWeight: 600 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-baseline justify-between" style={{ borderTop: '1px dashed rgba(255,255,255,0.15)', paddingTop: 10 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Final · transmuted</span>
                    <span style={{ ...serif, fontSize: 24, color: gold }}>90</span>
                  </div>
                </div>
              </div>
              <h3 style={{ ...serif, fontSize: 24, margin: '0 0 10px', color: ink, lineHeight: 1.15 }}>
                Automated grade computation
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: slate, margin: 0 }}>
                Real-time weighted totals, DepEd Order No. 8 s. 2015
                transmutation, and a CHED tertiary mode — locked once you're done.
              </p>
            </article>

            {/* Feature 2 — Intelligence */}
            <article className="relative flex flex-col overflow-hidden" style={{ background: navy, borderRadius: 20, padding: 28, color: '#FAFAF6', minHeight: 360 }}>
              <div aria-hidden="true" style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, background: 'radial-gradient(circle, rgba(245,197,24,0.25), transparent 65%)' }} />
              <div style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 500, marginBottom: 20, position: 'relative' }}>02 / Intelligence</div>
              <div style={{ marginBottom: 24, position: 'relative' }}>
                <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 14 }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: gold, display: 'grid', placeItems: 'center', color: navy }}>
                      <Sparkles className="h-3 w-3" />
                    </span>
                    <span style={{ fontSize: 12, color: gold, fontWeight: 700 }}>3 students at risk</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {RISKS.map((r) => (
                      <div key={r.name}>
                        <div className="flex justify-between" style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>
                          <span>{r.name}</span>
                          <span style={{ ...mono, color: gold }}>{r.score}</span>
                        </div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: r.pct, background: `linear-gradient(90deg, ${gold}, ${blue})`, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <h3 style={{ ...serif, fontSize: 24, margin: '0 0 10px', color: '#FAFAF6', lineHeight: 1.15, position: 'relative' }}>
                AI-driven remediation
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(250,250,246,0.75)', margin: 0, position: 'relative' }}>
                Risk prediction and least-mastered-skill mapping recommend
                targeted quizzes — always reviewed by you before assignment.
              </p>
            </article>

            {/* Feature 3 — Privacy */}
            <article className="flex flex-col" style={{ background: '#FAFAF6', border: `1px solid ${line}`, borderRadius: 20, padding: 28, minHeight: 360 }}>
              <div style={{ ...mono, fontSize: 11, color: muted, fontWeight: 500, marginBottom: 20 }}>03 / Privacy</div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ border: '1px solid rgba(14,42,92,0.12)', borderRadius: 12, padding: 14, background: 'white' }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: muted, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Consent gate</span>
                    <span style={{ ...mono, fontSize: 10, color: navy, background: 'rgba(14,42,92,0.06)', padding: '3px 6px', borderRadius: 4 }}>RA 10173</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {[
                      { name: 'Parent · Reyes, J.', state: 'Verified', ok: true },
                      { name: 'Parent · Cruz, M.', state: 'Pending', ok: false },
                      { name: 'Parent · Tan, R.', state: 'Verified', ok: true },
                    ].map((p) => (
                      <div
                        key={p.name}
                        className="flex items-center justify-between"
                        style={{ padding: '8px 10px', background: p.ok ? 'rgba(63,169,245,0.08)' : 'rgba(245,197,24,0.12)', borderRadius: 8 }}
                      >
                        <span style={{ fontSize: 12, color: ink, fontWeight: 500 }}>{p.name}</span>
                        <span style={{ fontSize: 11, color: p.ok ? navy : '#8B6A00', fontWeight: 700 }}>
                          {p.ok ? '✓ Verified' : '⏳ Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <h3 style={{ ...serif, fontSize: 24, margin: '0 0 10px', color: ink, lineHeight: 1.15 }}>
                Privacy-first by design
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: slate, margin: 0 }}>
                Parental-consent records gate access to student grades, in line
                with the Philippine Data Privacy Act of 2012.
              </p>
            </article>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="relative overflow-hidden" style={{ background: navy, color: '#FAFAF6' }}>
          <div aria-hidden="true" style={{ position: 'absolute', top: -120, right: -80, width: 480, height: 480, border: '1px solid rgba(245,197,24,0.18)', borderRadius: '50%' }} />
          <div aria-hidden="true" style={{ position: 'absolute', top: -60, right: -20, width: 360, height: 360, border: '1px solid rgba(245,197,24,0.12)', borderRadius: '50%' }} />
          <div aria-hidden="true" style={{ position: 'absolute', bottom: -100, left: -100, width: 380, height: 380, border: '1px solid rgba(63,169,245,0.15)', borderRadius: '50%' }} />

          <div className="relative mx-auto max-w-[1240px] px-6 py-28 md:px-8">
            <div className="mx-auto mb-16 max-w-[720px] text-center">
              <div style={{ fontSize: 12, color: gold, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
                <span style={{ marginRight: 8 }}>✦</span>The flow
              </div>
              <h2 className="text-[clamp(38px,6vw,60px)]" style={{ ...serif, lineHeight: 1.02, letterSpacing: '-0.02em', margin: 0, textWrap: 'balance' }}>
                From roster to remediation in{' '}
                <em style={{ color: gold, fontStyle: 'italic' }}>three steps</em>.
              </h2>
            </div>

            <div className="grid gap-px overflow-hidden md:grid-cols-3" style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)' }}>
              {STEPS.map((step) => (
                <div key={step.n} style={{ background: navy, padding: '36px 32px' }}>
                  <div className="flex items-center gap-3" style={{ marginBottom: 28 }}>
                    <div style={{ ...serif, width: 44, height: 44, borderRadius: 12, background: gold, color: navy, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700 }}>
                      {step.n}
                    </div>
                    <div style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' }}>
                      STEP {step.n} / 03
                    </div>
                  </div>
                  <h3 style={{ ...serif, fontSize: 26, lineHeight: 1.15, margin: '0 0 12px', color: '#FAFAF6' }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(250,250,246,0.7)', margin: '0 0 24px' }}>
                    {step.body}
                  </p>
                  <div style={{ ...mono, background: 'rgba(0,0,0,0.18)', borderRadius: 10, padding: 14, fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
                    {step.lines.map((l) => (
                      <div key={l} className="flex gap-2">
                        <span style={{ color: gold, flexShrink: 0 }}>✓</span>
                        <span>{l}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMPLIANCE */}
        <section id="compliance" className="mx-auto max-w-[1240px] px-6 py-28 md:px-8">
          <div className="grid items-center gap-16 md:grid-cols-2">
            <div>
              <Eyebrow>Trust &amp; compliance</Eyebrow>
              <h2 className="text-[clamp(34px,4.5vw,52px)]" style={{ ...serif, lineHeight: 1.02, letterSpacing: '-0.02em', margin: '0 0 24px', color: ink, textWrap: 'balance' }}>
                Aligned with how Philippine schools actually run.
              </h2>
              <p style={{ fontSize: 17, lineHeight: 1.55, color: slate, margin: '0 0 32px' }}>
                Built on the standards your division supervisors already check
                for — so nothing about adoption is a surprise.
              </p>
              <div className="flex flex-wrap gap-2.5">
                {BADGES.map((b) => (
                  <div key={b} className="inline-flex items-center gap-2" style={{ padding: '10px 14px', background: 'rgba(14,42,92,0.04)', border: '1px solid rgba(14,42,92,0.1)', borderRadius: 999 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: gold }} />
                    <span style={{ fontSize: 13, color: navy, fontWeight: 600 }}>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit log card */}
            <div style={{ background: '#FAFAF6', border: '1px solid rgba(14,42,92,0.1)', borderRadius: 20, padding: 32, boxShadow: '0 20px 60px -20px rgba(14,42,92,0.15)' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${line}` }}>
                <div>
                  <div style={{ ...serif, fontSize: 22, color: ink }}>Audit log · live</div>
                  <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Updated 4 seconds ago</div>
                </div>
                <div className="flex items-center gap-1.5" style={{ padding: '6px 10px', background: 'rgba(63,169,245,0.12)', borderRadius: 999 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: blue, animation: 'ak-pulse 2s ease-in-out infinite' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: navy, letterSpacing: '0.04em' }}>LIVE</span>
                </div>
              </div>
              <div className="flex flex-col gap-3.5">
                {AUDIT.map((log) => (
                  <div key={log.time} className="grid items-center gap-3.5" style={{ gridTemplateColumns: '60px 1fr auto' }}>
                    <div style={{ ...mono, fontSize: 11, color: muted }}>{log.time}</div>
                    <div>
                      <div style={{ fontSize: 13, color: ink, fontWeight: 600 }}>{log.action}</div>
                      <div style={{ fontSize: 11, color: muted, marginTop: 1 }}>{log.actor}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: log.statusColor, background: log.statusBg, padding: '4px 8px', borderRadius: 6 }}>
                      {log.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* RESULTS */}
        <section style={{ background: 'rgba(245,197,24,0.08)', borderTop: '1px solid rgba(14,42,92,0.06)', borderBottom: '1px solid rgba(14,42,92,0.06)' }}>
          <div className="mx-auto max-w-[1100px] px-6 py-20 md:px-8">
            <div className="mb-14 text-center">
              <div style={{ fontSize: 12, color: muted, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>
                <span style={{ color: gold, marginRight: 8 }}>✦</span>Pilot results, first quarter
              </div>
              <h2 className="text-[clamp(32px,4vw,44px)]" style={{ ...serif, lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0, color: ink, textWrap: 'balance' }}>
                Less time on the spreadsheet. <em style={{ color: navy }}>More time</em> with students.
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {RESULTS.map((r) => (
                <div key={r.body} className="text-center" style={{ background: '#FAFAF6', border: `1px solid ${line}`, borderRadius: 16, padding: 24 }}>
                  <div style={{ ...serif, fontSize: 52, lineHeight: 1, color: navy }}>
                    {r.stat}
                    <span style={{ color: gold }}>{r.unit}</span>
                  </div>
                  <div style={{ fontSize: 13, color: slate, marginTop: 10, fontWeight: 500, lineHeight: 1.4 }}>
                    {r.body}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1240px] px-6 py-28 md:px-8">
          <div className="relative overflow-hidden" style={{ background: navy, borderRadius: 28, padding: 'clamp(40px, 6vw, 72px) clamp(28px, 5vw, 64px)', color: '#FAFAF6' }}>
            <div aria-hidden="true" style={{ position: 'absolute', top: -80, right: -40, width: 240, height: 240, borderRadius: '50%', background: `radial-gradient(circle, ${gold}, transparent 70%)`, opacity: 0.7 }} />
            <div aria-hidden="true" style={{ position: 'absolute', bottom: -100, left: '20%', width: 180, height: 180, borderRadius: '50%', background: `radial-gradient(circle, ${blue}, transparent 70%)`, opacity: 0.5 }} />

            <div className="relative grid items-center gap-14 md:grid-cols-[1.4fr_1fr]">
              <div>
                <div style={{ fontSize: 12, color: gold, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
                  <span style={{ marginRight: 8 }}>✦</span>Join the pilot
                </div>
                <h2 className="text-[clamp(36px,5vw,56px)]" style={{ ...serif, lineHeight: 1.02, letterSpacing: '-0.02em', margin: '0 0 18px', textWrap: 'balance' }}>
                  Ready to bring <em style={{ color: gold, fontStyle: 'italic' }}>clarity</em> to your classroom?
                </h2>
                <p style={{ fontSize: 17, lineHeight: 1.55, color: 'rgba(250,250,246,0.75)', margin: '0 0 32px', maxWidth: 480 }}>
                  Set up your first class record today. Free for pilot campuses
                  through SY 2026–27.
                </p>
                <div className="flex flex-wrap items-center gap-3.5">
                  <Link
                    to="/register"
                    className={primaryBtn}
                    style={{ background: gold, color: navy, boxShadow: `0 3px 0 ${goldDeep}` }}
                  >
                    Create an account
                    <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', background: navy, color: gold }}>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                  <Link to="/login" className="text-sm font-semibold transition hover:opacity-80" style={{ color: '#FAFAF6', padding: '14px 4px' }}>
                    I already have one →
                  </Link>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24 }}>
                <div style={{ ...mono, fontSize: 11, color: gold, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 16 }}>
                  WHAT YOU GET
                </div>
                <div className="flex flex-col gap-3.5">
                  {PERKS.map((p) => (
                    <div key={p} className="flex items-start gap-3">
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: gold, color: navy, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>
                        <Check className="h-3 w-3" />
                      </span>
                      <span style={{ fontSize: 14, color: 'rgba(250,250,246,0.9)', lineHeight: 1.45 }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${line}`, background: '#FAFAF6' }}>
        <div className="mx-auto grid max-w-[1240px] gap-12 px-6 py-12 md:px-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="mb-3.5 flex items-center gap-2.5">
              <Logo size={28} />
              <span style={{ ...serif, fontSize: 20, color: navy }}>Activklass</span>
            </div>
            <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, margin: '0 0 16px', maxWidth: 280 }}>
              Class records that teach back. Built for DepEd K–12 and CHED
              tertiary classrooms across the Philippines.
            </p>
            <div style={{ fontSize: 12, color: muted }}>Now onboarding pilot cohorts</div>
          </div>
          {[
            { head: 'Product', links: ['Features', 'Compliance', 'Pricing', 'Roadmap'] },
            { head: 'Resources', links: ['Teacher guides', 'DepEd Order No. 8', 'Webinars', 'Support'] },
            { head: 'Legal', links: ['Privacy (RA 10173)', 'Terms of use', 'DPO contact'] },
          ].map((col) => (
            <div key={col.head}>
              <div style={{ fontSize: 12, fontWeight: 700, color: navy, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
                {col.head}
              </div>
              <div className="flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <a key={l} href="#" className="transition hover:opacity-70" style={{ fontSize: 13, color: slate, textDecoration: 'none' }}>
                    {l}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${line}` }}>
          <div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-2 px-6 py-5 md:px-8 md:flex-row" style={{ fontSize: 12, color: muted }}>
            <div>© {new Date().getFullYear()} Activklass. All rights reserved.</div>
            <div>Made in Cebu · for Philippine classrooms</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
