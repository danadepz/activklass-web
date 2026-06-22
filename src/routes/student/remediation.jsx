import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where, documentId } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import Markdown from '@/components/Markdown'
import { TrendingUp, BookOpen, AlertCircle, ArrowRight } from '@/components/icons'

const navy = '#0E2A5C'
const ink = '#0A1733'
const goldDeep = '#8B6A00'
const muted = '#6A7A95'
const faint = '#9AA6BD'
const green = '#1F8A5B'
const blueText = '#1E6FB0'
const line = 'rgba(14,42,92,0.08)'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }

async function loadRemediations(studentId) {
  const snap = await getDocs(query(collection(db, 'remediations'), where('student_id', '==', studentId)))
  const remediations = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))

  // Resolve class labels in one batched read (enrolled classes are readable).
  const classIds = [...new Set(remediations.map((r) => r.class_id).filter(Boolean))]
  const labels = {}
  for (let i = 0; i < classIds.length; i += 30) {
    const chunk = classIds.slice(i, i + 30)
    const cSnap = await getDocs(query(collection(db, 'classes'), where(documentId(), 'in', chunk)))
    cSnap.forEach((d) => {
      const c = d.data()
      labels[d.id] = c.subject_code || c.subject || c.section || 'Class'
    })
  }
  return remediations.map((r) => ({ ...r, class_label: labels[r.class_id] ?? null }))
}

function PracticeItem({ item, index }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ border: `1px solid ${line}`, borderRadius: 12, padding: '13px 16px' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: navy, flexShrink: 0 }}>Q{index + 1}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: ink, lineHeight: 1.5 }}>{item.prompt}</div>
          {(item.options ?? []).length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {item.options.map((o, oi) => (
                <li key={oi} style={{ fontSize: 13, color: muted }}>{o}</li>
              ))}
            </ul>
          )}
          {show ? (
            <div style={{ marginTop: 8, fontSize: 13, color: green, fontWeight: 600 }}>
              Answer: <span style={{ ...mono }}>{item.answer}</span>
            </div>
          ) : (
            <button
              onClick={() => setShow(true)}
              style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: blueText, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Show answer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function MaterialCard({ m }) {
  return (
    <a
      href={m.url}
      target="_blank"
      rel="noopener noreferrer"
      className="ak-card-hov"
      style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 12, padding: '13px 15px', textDecoration: 'none' }}
    >
      <span style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(63,169,245,0.12)', color: blueText, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <BookOpen className="h-[18px] w-[18px]" />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: ink }}>{m.title}</span>
        {m.description && <span style={{ display: 'block', fontSize: 12.5, color: muted, marginTop: 1 }}>{m.description}</span>}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0" style={{ color: '#C3CCDB' }} />
    </a>
  )
}

function RemediationCard({ r }) {
  return (
    <article style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 'clamp(18px, 3vw, 26px)' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: goldDeep, background: 'rgba(245,197,24,0.18)', border: '1px solid rgba(245,197,24,0.5)', borderRadius: 999, padding: '4px 11px' }}>
          <TrendingUp className="h-3.5 w-3.5" /> Remediation
        </span>
        {r.class_label && (
          <span style={{ ...mono, fontSize: 11.5, color: muted, background: 'rgba(14,42,92,0.05)', borderRadius: 999, padding: '4px 10px' }}>{r.class_label}</span>
        )}
      </div>

      <h2 style={{ ...serif, fontSize: 24, color: ink, margin: '0 0 8px', lineHeight: 1.15 }}>
        {r.topic || r.topic_id || 'Review Guide'}
      </h2>

      {r.weakness_description && (
        <div style={{ display: 'flex', gap: 10, background: 'rgba(192,57,43,0.05)', border: '1px solid rgba(192,57,43,0.18)', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
          <AlertCircle className="h-4 w-4" style={{ color: '#C0392B', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.55, margin: 0 }}>
            <strong style={{ color: ink }}>Identified gap:</strong> {r.weakness_description}
          </p>
        </div>
      )}

      {/* Study guide */}
      {r.study_guide_markdown && (
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>Study guide</SectionLabel>
          <div style={{ background: 'rgba(14,42,92,0.02)', border: `1px solid ${line}`, borderRadius: 14, padding: '16px 18px' }}>
            <Markdown text={r.study_guide_markdown} />
          </div>
        </section>
      )}

      {/* Practice items */}
      {(r.practice_items ?? []).length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>Targeted practice</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {r.practice_items.map((item, idx) => (
              <PracticeItem key={idx} item={item} index={idx} />
            ))}
          </div>
        </section>
      )}

      {/* Resource playlist */}
      {(r.recommended_materials ?? []).length > 0 && (
        <section>
          <SectionLabel>Recommended resources</SectionLabel>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {r.recommended_materials.map((m, idx) => (
              <MaterialCard key={idx} m={m} />
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: faint, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </div>
  )
}

export default function StudentRemediation() {
  const { profile } = useAuth()
  const { data: remediations, isLoading } = useQuery({
    queryKey: ['student-remediations', profile.id],
    queryFn: () => loadRemediations(profile.id),
  })

  const list = remediations ?? []

  return (
    <div style={{ maxWidth: 1040 }}>
      <h1 className="text-[clamp(28px,4vw,38px)]" style={{ ...serif, lineHeight: 1.1, margin: '0 0 4px', color: ink }}>
        Remediation
      </h1>
      <p style={{ fontSize: 14, color: muted, margin: '0 0 24px' }}>
        Personalized review guides generated when learning gaps are detected in your assessments.
      </p>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{ height: 220, borderRadius: 18, background: '#FFFFFF', border: `1px solid ${line}` }} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 48, textAlign: 'center' }}>
          <div style={{ display: 'inline-grid', placeItems: 'center', width: 52, height: 52, borderRadius: 13, background: 'rgba(31,138,91,0.12)', color: green }}>
            <TrendingUp className="h-6 w-6" />
          </div>
          <h3 style={{ ...serif, fontSize: 22, margin: '16px 0 6px', color: ink }}>You're all caught up!</h3>
          <p style={{ fontSize: 14, color: muted, margin: 0, maxWidth: 420, marginInline: 'auto' }}>
            No learning gaps have been flagged. When a quiz shows you're struggling with a topic, a
            custom review guide will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {list.map((r) => (
            <RemediationCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  )
}
