import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { fetchUsersByIds } from '@/lib/roster'
import Button from '@/components/ui/Button'
import { navy, ink, goldDeep, muted, faint, blueText, green, red, line, serif, mono, sansFamily as sans } from '@/theme'

const KIND = {
  attendance: { tag: 'Attendance', fg: blueText, bg: 'rgba(63,169,245,0.12)', border: 'rgba(63,169,245,0.4)' },
  quiz: { tag: 'Quizzes', fg: navy, bg: 'rgba(14,42,92,0.08)', border: 'rgba(14,42,92,0.18)' },
  submission: { tag: 'Submission', fg: green, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.4)' },
  ai: { tag: 'AI', fg: goldDeep, bg: 'rgba(245,197,24,0.20)', border: 'rgba(245,197,24,0.55)' },
  config: { tag: 'Settings', fg: muted, bg: 'rgba(14,42,92,0.06)', border: 'rgba(14,42,92,0.15)' },
}


function toDate(ts) {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000)
  if (typeof ts === 'string') {
    const d = new Date(ts)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function dayInfo(d) {
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000)
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const label = diff === 0 ? `Today · ${md}` : diff === 1 ? `Yesterday · ${md}` : `${d.toLocaleDateString('en-US', { weekday: 'long' })} · ${md}`
  return { key: startOf(d).getTime(), label }
}

const timeLabel = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// Synthesise an activity feed from real document timestamps (no audit_logs
// collection exists — this reconstructs history from what's actually stored).
async function loadHistory(classId) {
  const events = []

  const classSnap = await getDoc(doc(db, 'classes', classId))
  const ids = classSnap.exists() ? classSnap.data().student_ids ?? [] : []
  const users = ids.length ? await fetchUsersByIds(ids) : []
  const nameById = {}
  users.forEach((u) => { nameById[u.id] = `${u.last_name}, ${u.first_name}` })

  // class_ids (array) is the canonical link; scalar class_id is the legacy
  // shape. Both are queried because array-contains cannot match a scalar.
  const [qNew, qOld] = await Promise.all([
    getDocs(query(collection(db, 'quizzes'), where('class_ids', 'array-contains', classId))),
    getDocs(query(collection(db, 'quizzes'), where('class_id', '==', classId))),
  ])
  const qSnap = { docs: [...qNew.docs, ...qOld.docs.filter((d) => !qNew.docs.some((n) => n.id === d.id))] }
  const quizzes = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const quizTitle = {}
  quizzes.forEach((q) => { quizTitle[q.id] = q.title })

  for (const q of quizzes) {
    const isAi = q.generated_by === 'ai_generated'
    const items = q.questions?.length ?? 0
    const created = toDate(q.created_at)
    if (created) {
      events.push({
        ts: created,
        kind: isAi ? 'ai' : 'quiz',
        actor: isAi ? 'AI Assistant' : 'You',
        summary: `${isAi ? 'Generated' : 'Created'} quiz · ${q.title}`,
        detail: `${items} item${items === 1 ? '' : 's'}${isAi ? ' · AI-generated draft' : ''}`,
      })
    }
    const published = toDate(q.published_at)
    if (published) {
      events.push({ ts: published, kind: 'quiz', actor: 'You', summary: `Published quiz · ${q.title}`, detail: 'Opened to students' })
    }
  }

  await Promise.all(
    quizzes.map(async (q) => {
      const aSnap = await getDocs(query(collection(db, 'quiz_attempts'), where('quiz_id', '==', q.id)))
      aSnap.forEach((d) => {
        const a = d.data()
        const ts = toDate(a.submitted_at ?? a.graded_at ?? a.updated_at ?? a.created_at)
        if (!ts) return
        events.push({
          ts,
          kind: 'submission',
          actor: nameById[a.student_id] ?? 'Student',
          summary: `Submitted ${quizTitle[q.id] ?? 'a quiz'}`,
          detail: a.total_score != null ? `Scored ${a.total_score} pts` : 'Submitted for grading',
        })
      })
    }),
  )

  const attSnap = await getDocs(collection(db, 'classes', classId, 'attendance'))
  attSnap.forEach((d) => {
    const a = d.data()
    const ts = toDate(a.updated_at) ?? toDate(a.date)
    if (!ts) return
    const cnt = a.records ? Object.keys(a.records).length : a.students ? Object.keys(a.students).length : 0
    events.push({ ts, kind: 'attendance', actor: 'You', summary: `Recorded attendance${a.date ? ` · ${a.date}` : ''}`, detail: `${cnt} student${cnt === 1 ? '' : 's'} marked` })
  })

  const sylSnap = await getDoc(doc(db, 'classes', classId, 'syllabus', 'current'))
  if (sylSnap.exists()) {
    const s = sylSnap.data()
    const ts = toDate(s.updated_at)
    if (ts) {
      const mods = s.modules?.length ?? 0
      const isAi = s.source === 'ai_generated'
      events.push({ ts, kind: isAi ? 'ai' : 'config', actor: 'You', summary: 'Updated syllabus', detail: `${mods} module${mods === 1 ? '' : 's'}${isAi ? ' · AI draft' : ''}` })
    }
  }

  const gbSnap = await getDoc(doc(db, 'gradebooks', classId))
  if (gbSnap.exists()) {
    const g = gbSnap.data()
    const ts = toDate(g.updated_at)
    if (ts) {
      events.push({ ts, kind: 'config', actor: 'You', summary: 'Updated grading setup', detail: `${g.components?.length ?? 0} components · ${g.periods?.length ?? 0} periods` })
    }
  }

  events.sort((a, b) => b.ts - a.ts)
  return events
}

export default function HistoryPage() {
  const { classId } = useParams()
  const [filter, setFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  const { data: events, isLoading, isError } = useQuery({
    queryKey: ['fs-history', classId],
    queryFn: () => loadHistory(classId),
  })

  function exportLog() {
    const rows = (events ?? []).map((e) => ({ time: e.ts.toISOString(), kind: e.kind, actor: e.actor, summary: e.summary, detail: e.detail }))
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-log-${classId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const header = (
    <div className="mb-[22px] flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
          History &amp; Activity
        </h1>
        <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
          Quizzes, submissions, attendance, and setup changes — reconstructed from this class's records.
        </p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button variant="ghost" size="sm" radius={11} onClick={() => setShowFilters((s) => !s)} style={showFilters ? { borderColor: navy } : undefined}>
          Filter
        </Button>
        <Button variant="ghost" size="sm" radius={11} onClick={exportLog} disabled={!events?.length}>
          Export log
        </Button>
      </div>
    </div>
  )

  if (isLoading) return <p style={{ color: faint }}>Loading activity…</p>
  if (isError) return <p style={{ color: red }}>Could not load activity.</p>

  const present = ['all', ...Object.keys(KIND).filter((k) => events.some((e) => e.kind === k))]
  const shown = filter === 'all' ? events : events.filter((e) => e.kind === filter)

  // group by day
  const groups = []
  let current = null
  for (const e of shown) {
    const { key, label } = dayInfo(e.ts)
    if (!current || current.key !== key) {
      current = { key, label, items: [] }
      groups.push(current)
    }
    current.items.push(e)
  }

  return (
    <div>
      {header}

      {showFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {present.map((k) => {
            const active = filter === k
            const label = k === 'all' ? 'All' : KIND[k].tag
            const count = k === 'all' ? events.length : events.filter((e) => e.kind === k).length
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className="transition hover:brightness-105"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', fontSize: 13, fontWeight: 700,
                  fontFamily: sans, borderRadius: 999, cursor: 'pointer',
                  ...(active ? { color: '#FAFAF6', background: navy, border: `1.5px solid ${navy}` } : { color: muted, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)' }),
                }}
              >
                {label}
                <span style={{ display: 'inline-block', padding: '1px 7px', fontSize: 11, fontWeight: 800, borderRadius: 999, background: active ? 'rgba(245,197,24,0.8)' : 'rgba(14,42,92,0.08)', color: active ? navy : muted }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {events.length === 0 ? (
        <div className="text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 40, color: faint, fontSize: 14 }}>
          No activity recorded yet. Quizzes, attendance, and setup changes will appear here as they happen.
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '26px 28px' }}>
          {groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 24 }}>
              <div className="mb-3.5 flex items-center gap-3">
                <div style={{ ...serif, fontSize: 16, color: ink }}>{g.label}</div>
                <div style={{ flex: 1, height: 1, background: 'rgba(14,42,92,0.08)' }} />
              </div>
              <div style={{ position: 'relative', paddingLeft: 28 }}>
                <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'rgba(14,42,92,0.08)', borderRadius: 1 }} />
                {g.items.map((it, i) => {
                  const k = KIND[it.kind] ?? KIND.config
                  return (
                    <div key={i} style={{ position: 'relative', paddingBottom: 18 }}>
                      <span style={{ position: 'absolute', left: -28, top: 3, width: 11, height: 11, borderRadius: '50%', background: k.fg, boxShadow: `0 0 0 4px ${k.bg}` }} />
                      <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                        <span style={{ ...mono, fontSize: 12, color: muted, fontWeight: 600 }}>{timeLabel(it.ts)}</span>
                        <span style={{ display: 'inline-block', padding: '2px 9px', fontSize: 10, fontWeight: 800, color: k.fg, background: k.bg, border: `1px solid ${k.border}`, borderRadius: 999, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{k.tag}</span>
                        <span style={{ fontSize: 12, color: faint }}>·</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{it.actor}</span>
                      </div>
                      <div style={{ fontSize: 14, color: ink, lineHeight: 1.4 }}>{it.summary}</div>
                      {it.detail && <div style={{ fontSize: 12.5, color: muted, marginTop: 3 }}>{it.detail}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {shown.length === 0 && (
            <div style={{ textAlign: 'center', color: faint, fontSize: 13, padding: '12px 0' }}>No {KIND[filter]?.tag.toLowerCase()} activity.</div>
          )}
        </div>
      )}
    </div>
  )
}
