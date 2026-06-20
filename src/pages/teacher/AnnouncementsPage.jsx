import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../context/useAuth'
import { Plus, Megaphone, Trash, Send, X, Clock } from '../../components/icons'

const navy = '#0E2A5C'
const navyDeep = '#061840'
const ink = '#0A1733'
const gold = '#F5C518'
const muted = '#6A7A95'
const faint = '#9AA6BD'
const blueText = '#1E6FB0'
const red = '#C0392B'
const line = 'rgba(14,42,92,0.08)'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }
const sans = "'Plus Jakarta Sans', sans-serif"

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: ink, marginBottom: 7 }
const fieldStyle = {
  width: '100%', padding: '12px 14px', fontSize: 14, fontFamily: sans, color: ink,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10,
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDate(ts) {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000)
  return null
}

function fmtDate(ts) {
  const d = toDate(ts)
  if (!d) return 'Just now'
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${h}:${mm} ${ampm}`
}

const classLabel = (c) => `${c.subject_code ? `${c.subject_code} · ` : ''}${c.section}`

function PostModal({ classes, profile, onClose, onPosted }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('All Classes')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const valid = title.trim() && body.trim()

  async function post() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const cls = classes.find((c) => classLabel(c) === audience)
      await addDoc(collection(db, 'announcements'), {
        teacher_id: profile.id,
        title: title.trim(),
        body: body.trim(),
        audience,
        class_id: cls?.id ?? null,
        created_at: serverTimestamp(),
      })
      onPosted()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 540, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: navy, color: gold, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Megaphone className="h-[18px] w-[18px]" />
          </span>
          <h2 style={{ ...serif, fontSize: 24, margin: 0, color: ink, flex: 1 }}>Post Announcement</h2>
          <button onClick={onClose} className="transition hover:text-[#0A1733]" style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, background: 'transparent', border: 'none', color: faint, cursor: 'pointer' }}>
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div style={{ padding: '22px 28px', overflowY: 'auto' }} className="flex flex-col gap-4">
          {error && (
            <div role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>{error}</div>
          )}
          <div>
            <label style={labelStyle}>Title</label>
            <input className="ak-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Midterm Exam Schedule Released" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Message</label>
            <textarea className="ak-input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your announcement…" rows={4} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.55 }} />
          </div>
          <div>
            <label style={labelStyle}>Send to</label>
            <select className="ak-input" value={audience} onChange={(e) => setAudience(e.target.value)} style={{ ...fieldStyle, fontWeight: 600, cursor: 'pointer' }}>
              <option>All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={classLabel(c)}>{classLabel(c)}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '12px 22px', fontSize: 14, fontWeight: 600, fontFamily: sans, color: '#3A4A6B', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={post}
            disabled={!valid || busy}
            className={valid && !busy ? 'transition hover:brightness-110' : ''}
            style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '12px 22px',
              fontSize: 14, fontWeight: 700, fontFamily: sans, border: 'none', borderRadius: 10,
              ...(valid && !busy
                ? { color: '#FAFAF6', background: navy, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}` }
                : { color: 'rgba(250,250,246,0.85)', background: '#9DB0CE', cursor: 'not-allowed', boxShadow: 'none' }),
            }}
          >
            <Send className="h-4 w-4" />
            {busy ? 'Posting…' : 'Post Announcement'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AnnouncementsPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [showPost, setShowPost] = useState(false)
  const [error, setError] = useState(null)

  const { data: rows, isLoading } = useQuery({
    queryKey: ['fs-announcements', profile.id],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'announcements'), where('teacher_id', '==', profile.id)))
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.created_at?.seconds ?? Infinity) - (a.created_at?.seconds ?? Infinity))
    },
  })

  const { data: classes } = useQuery({
    queryKey: ['fs-classes', profile.id],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'classes'), where('teacher_id', '==', profile.id)))
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
  })

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['fs-announcements', profile.id] })

  async function remove(id) {
    if (!window.confirm('Delete this announcement?')) return
    try {
      await deleteDoc(doc(db, 'announcements', id))
      refetch()
    } catch (err) {
      setError(err.message)
    }
  }

  const list = rows ?? []

  return (
    <div>
      <div className="mb-[30px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(30px,4vw,40px)]" style={{ ...serif, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 8px', color: ink }}>
            Announcements
          </h1>
          <p style={{ fontSize: 15, color: muted, margin: 0 }}>Post updates to your classes and keep students in the loop.</p>
        </div>
        <button
          onClick={() => setShowPost(true)}
          className="inline-flex items-center gap-2.5 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3FA9F5] focus-visible:ring-offset-2"
          style={{ padding: '12px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 11, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}` }}
        >
          <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy }}>
            <Plus className="h-3 w-3" />
          </span>
          New Announcement
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px', maxWidth: 920 }}>{error}</p>
      )}

      {!isLoading && list.length > 0 && (
        <div className="mb-[22px] flex items-center gap-[18px]">
          <div className="inline-flex items-center gap-2.5" style={{ fontSize: 13, fontWeight: 600, color: muted }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, background: 'rgba(14,42,92,0.07)', color: navy }}>
              <Megaphone className="h-[15px] w-[15px]" />
            </span>
            <span><strong style={{ color: ink }}>{list.length}</strong> posted</span>
          </div>
          <div style={{ width: 1, height: 18, background: 'rgba(14,42,92,0.12)' }} />
          <div style={{ fontSize: 13, color: faint }}>Last update {fmtDate(list[0].created_at)}</div>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: faint }}>Loading announcements…</p>
      ) : list.length === 0 ? (
        <div className="text-center" style={{ background: '#FFFFFF', border: '1px dashed rgba(14,42,92,0.18)', borderRadius: 16, padding: '56px 28px', maxWidth: 920 }}>
          <div style={{ display: 'inline-grid', placeItems: 'center', width: 56, height: 56, borderRadius: 14, background: 'rgba(14,42,92,0.06)', color: navy, marginBottom: 16 }}>
            <Megaphone className="h-[26px] w-[26px]" />
          </div>
          <h3 style={{ ...serif, fontSize: 22, margin: '0 0 6px', color: ink }}>No announcements yet</h3>
          <p style={{ fontSize: 14, color: muted, margin: '0 0 20px' }}>Post your first update so students know what's coming up.</p>
          <button onClick={() => setShowPost(true)} className="inline-flex transition hover:brightness-110" style={{ padding: '11px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}` }}>
            New Announcement
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4" style={{ maxWidth: 920 }}>
          {list.map((a) => {
            const isAll = !a.class_id
            return (
              <div key={a.id} className="ak-ann-card" style={{ position: 'relative', background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '24px 26px' }}>
                <div className="mb-3 flex items-start justify-between gap-4">
                  <h3 style={{ fontSize: 19, fontWeight: 700, color: ink, margin: 0, lineHeight: 1.25, letterSpacing: '-0.01em' }}>{a.title}</h3>
                  <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                    <span style={{ display: 'inline-block', padding: '5px 12px', fontSize: 12, fontWeight: 700, borderRadius: 999, whiteSpace: 'nowrap', background: isAll ? 'rgba(14,42,92,0.08)' : 'rgba(63,169,245,0.14)', color: isAll ? navy : blueText }}>
                      {a.audience || 'All Classes'}
                    </span>
                    <button onClick={() => remove(a.id)} className="ak-ann-del" title="Delete" style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, background: 'transparent', border: 'none', color: '#B6C0D2', cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s, color 0.15s, background 0.15s' }}>
                      <Trash className="h-[15px] w-[15px]" />
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 14.5, lineHeight: 1.65, color: '#3A4A6B', margin: '0 0 16px', maxWidth: 680, whiteSpace: 'pre-wrap' }}>{a.body}</p>
                <div className="flex items-center gap-2" style={{ ...mono, fontSize: 12.5, color: faint }}>
                  <Clock className="h-3.5 w-3.5" />
                  {fmtDate(a.created_at)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showPost && (
        <PostModal
          classes={classes ?? []}
          profile={profile}
          onClose={() => setShowPost(false)}
          onPosted={() => {
            setShowPost(false)
            refetch()
          }}
        />
      )}
    </div>
  )
}
