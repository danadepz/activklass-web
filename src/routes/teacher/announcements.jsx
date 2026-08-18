import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { navy, cream, sansUiFamily as sans } from '@/theme'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'

/* ─── Design tokens (matching TeacherLayout) ─── */

/* ─── Category config ─── */
const CATEGORIES = [
  { value: 'general',  label: 'General',  color: '#3B82F6', bg: '#EFF6FF', dot: '#3B82F6' },
  { value: 'reminder', label: 'Reminder', color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B' },
  { value: 'urgent',   label: 'Urgent',   color: '#DC2626', bg: '#FEF2F2', dot: '#EF4444' },
]
const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

/* ─── Helpers ─── */
/** Accepts an ISO string or a Firestore Timestamp ({ seconds }). */
function timeAgo(value) {
  if (!value) return ''
  const ms = value.seconds != null ? value.seconds * 1000 : new Date(value).getTime()
  if (!Number.isFinite(ms)) return ''
  const diff = Date.now() - ms
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function ExpiryBadge({ iso }) {
  if (!iso) return null
  const d = new Date(iso)
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <span style={{ fontSize: 11, background: '#F1F5F9', color: '#475569', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
      Expires {label}
    </span>
  )
}

/* ─── Empty state ─── */
function EmptyState({ filtered }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 32px', color: '#94A3B8' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📢</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: '#64748B', marginBottom: 8 }}>
        {filtered ? 'No announcements for this class' : 'No announcements yet'}
      </div>
      <div style={{ fontSize: 13 }}>
        {filtered
          ? 'Switch to "All Classes" or create a new one.'
          : 'Use the form above to post your first announcement.'}
      </div>
    </div>
  )
}

/* ─── Announcement Card ─── */
function AnnouncementCard({ item, onDelete, deleting }) {
  const [expanded, setExpanded] = useState(false)
  const cat = catMap[item.category] ?? catMap.general
  // Documents written before this page moved to Firestore -- and the seeded
  // ones -- carry `body` with no `content`, so read through both.
  const text = item.content ?? item.body ?? ''
  const isLong = text.length > 160

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.07)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* category stripe */}
      <div style={{ height: 4, background: cat.color }} />

      <div style={{ padding: '18px 20px' }}>
        {/* header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          {/* category pill */}
          <span style={{
            flexShrink: 0,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: cat.bg,
            color: cat.color,
            borderRadius: 20,
            padding: '3px 10px',
            marginTop: 2,
          }}>
            {cat.label}
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', lineHeight: 1.3 }}>
              {item.title}
            </div>
            {item.class_id == null && (
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
                📣 All classes
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>
              {timeAgo(item.created_at)}
            </span>
            <button
              onClick={() => onDelete(item.id)}
              disabled={deleting}
              title="Delete announcement"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: deleting ? 'not-allowed' : 'pointer',
                color: '#94A3B8',
                padding: 4,
                borderRadius: 6,
                lineHeight: 1,
                fontSize: 16,
                transition: 'color .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
              onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
            >
              ✕
            </button>
          </div>
        </div>

        {/* content */}
        <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.65, marginBottom: 10 }}>
          {isLong && !expanded ? text.slice(0, 160) + '…' : text}
        </div>
        {isLong && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: 'none', border: 'none', color: '#3B82F6', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 10 }}
          >
            {expanded ? 'Show less ▲' : 'Read more ▼'}
          </button>
        )}

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ExpiryBadge iso={item.expires_at} />
          {item.linked_resource_type && (
            <span style={{ fontSize: 11, background: '#F0FDF4', color: '#16A34A', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
              🔗 {item.linked_resource_type}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ─── */
export default function AnnouncementsPage() {
  const qc = useQueryClient()

  /* filter state */
  const [filterCat, setFilterCat] = useState('all')

  /* form state */
  const [form, setForm] = useState({
    title: '',
    content: '',
    category: 'general',
    class_id: '',      // '' = global
    expires_at: '',
    linked_resource_type: '',
    linked_resource_id: '',
  })
  const [formErr, setFormErr] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  /* ── fetch classes from Firestore (same source as ClassesPage) ── */
  const { data: classes = [] } = useTeacherClasses()

  const { profile } = useAuth()

  /* ── fetch announcements ──
     Firestore, not /api/announcements. The Flask copy is written by nobody
     else and read by nobody: students (web and mobile) load announcements
     straight from this collection, so anything posted to the API was
     invisible to every student it was addressed to. */
  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['fs-announcements', profile?.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'announcements'), where('teacher_id', '==', profile.id)),
      )
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))
    },
    enabled: !!profile?.id,
  })

  /* ── create ── */
  const createMut = useMutation({
    mutationFn: (fields) =>
      addDoc(collection(db, 'announcements'), {
        ...fields,
        teacher_id: profile.id,
        created_at: serverTimestamp(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fs-announcements'] })
      setForm({ title: '', content: '', category: 'general', class_id: '', expires_at: '', linked_resource_type: '', linked_resource_id: '' })
      setFormErr('')
    },
    onError: (e) => setFormErr(e.message ?? 'Failed to post announcement'),
  })

  /* ── delete ── */
  const deleteMut = useMutation({
    mutationFn: (id) => deleteDoc(doc(db, 'announcements', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fs-announcements'] }),
    onError: () => setDeletingId(null),
    onSettled: () => setDeletingId(null),
  })

  function handleDelete(id) {
    if (!window.confirm('Delete this announcement?')) return
    setDeletingId(id)
    deleteMut.mutate(id)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.content.trim()) {
      setFormErr('Title and content are required.')
      return
    }
    const body = {
      title: form.title.trim(),
      // Students and the mobile app render `body`; `content` was the shape the
      // Flask endpoint used. Both are written so neither side goes blank.
      body: form.content.trim(),
      content: form.content.trim(),
      category: form.category,
      class_id: form.class_id || null,
      expires_at: form.expires_at || null,
      linked_resource_type: form.linked_resource_type || null,
      linked_resource_id: form.linked_resource_id || null,
    }
    createMut.mutate(body)
  }

  /* ── filtered list ── */
  const filtered = announcements.filter(a =>
    filterCat === 'all' || a.category === filterCat
  )

  /* ── styles ── */
  const labelStyle = { fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }
  const inputStyle = { width: '100%', borderRadius: 10, border: '1px solid #E2E8F0', padding: '10px 14px', fontSize: 14, fontFamily: sans, color: '#0F172A', outline: 'none', boxSizing: 'border-box', background: '#FAFAFA' }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }

  return (
    <div style={{ fontFamily: sans, maxWidth: 900, margin: '0 auto' }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: navy, margin: 0 }}>Announcements</h1>
        <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>
          Post updates, reminders, or urgent notices to all your classes or a specific section.
        </p>
      </div>

      {/* ── Compose form ── */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: '24px 28px', marginBottom: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: navy, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>✍️</span> New Announcement
        </div>

        <form onSubmit={handleSubmit}>
          {/* Row 1: title + category */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input
                id="ann-title"
                style={inputStyle}
                placeholder="e.g. Quiz on Friday — Chapter 5"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select
                id="ann-category"
                style={{ ...selectStyle, width: 160 }}
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: content */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Message</label>
            <textarea
              id="ann-content"
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              placeholder="Write your announcement here…"
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            />
          </div>

          {/* Row 3: target class + expiry */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Target Class</label>
              <select
                id="ann-class"
                style={selectStyle}
                value={form.class_id}
                onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
              >
                <option value="">📣 All my classes (Global)</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.subject_code ? `${c.subject_code} — ` : ''}{c.section || c.subject || c.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Expires On (optional)</label>
              <input
                id="ann-expires"
                type="date"
                style={inputStyle}
                value={form.expires_at}
                onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
              />
            </div>
          </div>

          {/* Row 4: linked resource (collapsible-ish) */}
          <details style={{ marginBottom: 18 }}>
            <summary style={{ fontSize: 13, color: '#64748B', cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}>
              + Link a resource (optional)
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
              <div>
                <label style={labelStyle}>Resource Type</label>
                <select
                  id="ann-res-type"
                  style={selectStyle}
                  value={form.linked_resource_type}
                  onChange={e => setForm(f => ({ ...f, linked_resource_type: e.target.value }))}
                >
                  <option value="">— None —</option>
                  <option value="quiz">Quiz</option>
                  <option value="syllabus">Syllabus</option>
                  <option value="attendance">Attendance</option>
                  <option value="record">Class Record</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Resource ID / URL</label>
                <input
                  id="ann-res-id"
                  style={inputStyle}
                  placeholder="e.g. quiz ID or link"
                  value={form.linked_resource_id}
                  onChange={e => setForm(f => ({ ...f, linked_resource_id: e.target.value }))}
                />
              </div>
            </div>
          </details>

          {formErr && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
              {formErr}
            </div>
          )}

          <button
            id="ann-submit"
            type="submit"
            disabled={createMut.isPending}
            style={{
              background: navy,
              color: cream,
              border: 'none',
              borderRadius: 10,
              padding: '11px 28px',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: sans,
              cursor: createMut.isPending ? 'not-allowed' : 'pointer',
              opacity: createMut.isPending ? 0.7 : 1,
              transition: 'opacity .15s, transform .1s',
            }}
            onMouseEnter={e => { if (!createMut.isPending) e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          >
            {createMut.isPending ? 'Posting…' : '📢 Post Announcement'}
          </button>
        </form>
      </div>

      {/* ── Feed header + filters ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: navy }}>
          Posted Announcements
          {announcements.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 600, color: '#64748B' }}>
              ({filtered.length})
            </span>
          )}
        </div>

        {/* Category filter chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['all', ...CATEGORIES.map(c => c.value)].map(v => {
            const cat = catMap[v]
            const active = filterCat === v
            return (
              <button
                key={v}
                onClick={() => setFilterCat(v)}
                style={{
                  border: `1.5px solid ${active ? (cat?.color ?? navy) : '#E2E8F0'}`,
                  background: active ? (cat?.bg ?? '#EEF1F6') : '#fff',
                  color: active ? (cat?.color ?? navy) : '#64748B',
                  borderRadius: 20,
                  padding: '5px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: sans,
                  cursor: 'pointer',
                  transition: 'all .15s',
                  textTransform: 'capitalize',
                }}
              >
                {v === 'all' ? 'All' : (cat?.label ?? v)}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Announcement list ── */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#94A3B8', fontSize: 14 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState filtered={filterCat !== 'all'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(item => (
            <AnnouncementCard
              key={item.id}
              item={item}
              onDelete={handleDelete}
              deleting={deletingId === item.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
