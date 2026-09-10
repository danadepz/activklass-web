import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { fetchUsersByIds, ageFromBirthdate } from '@/lib/roster'
import { loadStudentEntry, loadStudentAttendance, loadSyllabus } from '@/lib/studentData'
import { TrendingUp, CalendarCheck, BookOpen, AlertCircle, ShieldCheck, ChevronRight } from '@/components/icons'
import { navy, ink, gold, goldDeep, muted, faint, blueText, line, serif, mono } from '@/theme'
import { formatGrade, gradeAsPercent, gradeTone } from './gradeDisplay'


/* Animated circular gauge (SVG). `value` is 0–100; `null` shows a dash. */
function Gauge({ value, size = 132, stroke = 12, color = gold, label, sublabel }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value))
  const offset = circ - (pct / 100) * circ
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ ...serif, fontSize: 30, lineHeight: 1, color: '#FAFAF6' }}>
            {value == null ? '—' : `${Math.round(value)}${label ?? ''}`}
          </div>
          {sublabel && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', marginTop: 4, letterSpacing: '0.04em' }}>{sublabel}</div>}
        </div>
      </div>
    </div>
  )
}

function ClassCard({ c }) {
  const tone = gradeTone(c.current_grade, c.grade_mode, c.grade_policy)
  return (
    <Link
      to={`/student/classes/${c.id}`}
      className="ak-card-hov block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
      style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20, textDecoration: 'none' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: ink, lineHeight: 1.25 }}>
            {c.subject_code ? `${c.subject_code} · ` : ''}{c.subject || c.section}
          </div>
          <div style={{ fontSize: 13, color: muted, marginTop: 3 }}>{c.section}</div>
          <div style={{ fontSize: 12.5, color: faint, marginTop: 4 }}>{c.teacher_name}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...serif, fontSize: 30, lineHeight: 1, color: tone.fg }}>
            {formatGrade(c.current_grade, c.grade_mode)}
          </div>
          <div style={{ fontSize: 10.5, color: faint, marginTop: 3 }}>current grade</div>
        </div>
      </div>

      {/* Module coverage / count bar */}
      <div style={{ marginTop: 16 }}>
        <div className="flex items-center justify-between" style={{ fontSize: 11.5, color: muted, marginBottom: 6 }}>
          <span>{c.module_count > 0 ? `${c.module_count} module${c.module_count === 1 ? '' : 's'}` : 'No modules yet'}</span>
          {c.attendance_rate != null && (
            <span style={{ ...mono, color: blueText }}>{c.attendance_rate}% present</span>
          )}
        </div>
        <div style={{ height: 7, borderRadius: 999, background: 'rgba(14,42,92,0.07)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, gradeAsPercent(c.current_grade, c.grade_mode, c.grade_policy) ?? 0)}%`, background: `linear-gradient(90deg, ${gold}, #3FA9F5)`, transition: 'width 0.8s' }} />
        </div>
      </div>
    </Link>
  )
}

function Banner({ tone, icon, title, children, action }) {
  const tones = {
    gold: { bg: 'rgba(245,197,24,0.14)', border: 'rgba(245,197,24,0.5)', fg: goldDeep },
    blue: { bg: 'rgba(63,169,245,0.12)', border: 'rgba(63,169,245,0.45)', fg: blueText },
  }
  const t = tones[tone] ?? tones.gold
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: '14px 18px' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: '#FFFFFF', color: t.fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{title}</div>
        <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>{children}</div>
      </div>
      {action}
    </div>
  )
}

async function loadDashboard(profile) {
  const snap = await getDocs(query(collection(db, 'classes'), where('student_ids', 'array-contains', profile.id)))
  const rawClasses = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

  // Teacher names in one batched read.
  const teacherIds = [...new Set(rawClasses.map((c) => c.teacher_id).filter(Boolean))]
  // Tolerate a denied teacher-profile read (rules permitting): never let the
  // teacher name blank out the whole dashboard.
  const teachers = teacherIds.length ? await fetchUsersByIds(teacherIds).catch(() => []) : []
  const teacherName = (id) => {
    const t = teachers.find((u) => u.id === id)
    return t ? `${t.first_name} ${t.last_name}` : 'Teacher'
  }

  const classes = await Promise.all(
    rawClasses.map(async (c) => {
      const [entry, attendance, syllabus] = await Promise.all([
        loadStudentEntry(c.id, profile.id),
        loadStudentAttendance(c.id, profile.id),
        loadSyllabus(c.id),
      ])
      return {
        ...c,
        teacher_name: teacherName(c.teacher_id),
        current_grade: entry?.final_grade ?? null,
        grade_mode: entry?.mode ?? null,
        // The entry carries the gradebook's pass mark and point-scale
        // direction beside its mode; gradeDisplay reads them off it directly.
        grade_policy: entry ?? null,
        attendance_rate: attendance.rate,
        module_count: syllabus?.modules?.length ?? 0,
      }
    }),
  )

  // Remediations + consent (parallel, independent of classes).
  const [remSnap, consentSnap] = await Promise.all([
    getDocs(query(collection(db, 'remediations'), where('student_id', '==', profile.id))),
    getDoc(doc(db, 'consent_records', profile.id)),
  ])
  const remediations = remSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const consent = consentSnap.exists() ? consentSnap.data() : null

  return { classes, remediations, consent }
}

export default function StudentDashboard() {
  const { profile } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['student-dashboard', profile.id],
    queryFn: () => loadDashboard(profile),
  })

  const classes = data?.classes ?? []
  // The gauge speaks percent; a 1.0–5.0 point grade goes in through its band.
  const graded = classes.map((c) => gradeAsPercent(c.current_grade, c.grade_mode, c.grade_policy)).filter((v) => v != null)
  const mastery = graded.length ? Math.round(graded.reduce((s, v) => s + v, 0) / graded.length) : null
  const rates = classes.filter((c) => c.attendance_rate != null)
  const attendanceRate = rates.length
    ? Math.round(rates.reduce((s, c) => s + c.attendance_rate, 0) / rates.length)
    : null

  const remediations = data?.remediations ?? []
  const consent = data?.consent
  // Consent banner is for adult data-subjects (>= 18) per docs/06 §2; a minor's
  // guardian access is staff-managed and isn't theirs to approve.
  const age = ageFromBirthdate(profile.birthdate) ?? profile.age ?? null
  const isAdult = age != null ? age >= 18 : consent?.is_minor === false
  const consentPending = isAdult && consent?.status === 'pending'

  return (
    <div>
      {/* Hero */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0E2A5C, #061840)',
          borderRadius: 22,
          padding: 'clamp(22px, 4vw, 34px)',
          color: '#FAFAF6',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 24px 48px -24px rgba(6,24,64,0.6)',
        }}
      >
        <div aria-hidden="true" style={{ position: 'absolute', top: -70, right: -50, width: 220, height: 220, border: '1px solid rgba(245,197,24,0.14)', borderRadius: '50%' }} />
        <div aria-hidden="true" style={{ position: 'absolute', bottom: -90, right: 90, width: 180, height: 180, border: '1px solid rgba(63,169,245,0.12)', borderRadius: '50%' }} />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between" style={{ position: 'relative' }}>
          <div>
            <div style={{ fontSize: 12.5, color: 'rgba(250,250,246,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Student Portal</div>
            <h1 className="text-[clamp(28px,4vw,40px)]" style={{ ...serif, lineHeight: 1.05, margin: '6px 0 10px' }}>
              Hello, {profile.first_name}!
            </h1>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2" style={{ fontSize: 13.5, color: 'rgba(250,250,246,0.82)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <BookOpen className="h-4 w-4" style={{ color: gold }} />
                {isLoading ? '…' : `${classes.length} class${classes.length === 1 ? '' : 'es'} enrolled`}
              </span>
              {(profile.year_level || profile.course) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <TrendingUp className="h-4 w-4" style={{ color: gold }} />
                  {[profile.course, profile.year_level].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-7">
            <div style={{ textAlign: 'center' }}>
              <Gauge value={isLoading ? null : mastery} label="" color={gold} sublabel="MASTERY" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <Gauge value={isLoading ? null : attendanceRate} label="%" color="#3FA9F5" size={112} stroke={11} sublabel="ATTENDANCE" />
            </div>
          </div>
        </div>
      </div>

      {/* Alert banners */}
      {(remediations.length > 0 || consentPending) && (
        <div className="mt-6 flex flex-col gap-3">
          {remediations.length > 0 && (
            <Banner
              tone="gold"
              icon={<AlertCircle className="h-5 w-5" />}
              title="Learning gaps identified"
              action={
                <Link to="/student/remediation" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: navy, background: gold, borderRadius: 9, textDecoration: 'none', flexShrink: 0 }}>
                  Open review <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              You have {remediations.length} custom review guide{remediations.length === 1 ? '' : 's'} waiting for you.
            </Banner>
          )}
          {consentPending && (
            <Banner
              tone="blue"
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Parental consent request"
              action={
                <Link to="/student/profile" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#FAFAF6', background: blueText, borderRadius: 9, textDecoration: 'none', flexShrink: 0 }}>
                  Review request <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              Your parent/guardian is requesting access to view your academic performance.
            </Banner>
          )}
        </div>
      )}

      {/* Classes */}
      <div className="mt-8 mb-4 flex items-center justify-between">
        <h2 style={{ ...serif, fontSize: 24, margin: 0, color: ink }}>Your classes</h2>
        <Link to="/student/classes" style={{ fontSize: 13, fontWeight: 700, color: navy, textDecoration: 'none' }}>
          View all <span style={{ color: gold }}>→</span>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{ height: 168, borderRadius: 16, background: '#FFFFFF', border: `1px solid ${line}` }} />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 44, textAlign: 'center' }}>
          <div style={{ display: 'inline-grid', placeItems: 'center', width: 48, height: 48, borderRadius: 12, background: 'rgba(14,42,92,0.08)', color: navy }}>
            <CalendarCheck className="h-6 w-6" />
          </div>
          <h3 style={{ ...serif, fontSize: 22, margin: '16px 0 6px', color: ink }}>You're not enrolled in any classes yet</h3>
          <p style={{ fontSize: 14, color: muted, margin: 0 }}>
            When your teacher adds you to a class roster, it will appear here automatically — no join code needed.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <ClassCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  )
}
