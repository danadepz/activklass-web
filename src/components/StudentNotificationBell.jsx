import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { Bell } from '@/components/icons'
import { navy, ink, muted, faint, sansFamily as sans } from '@/theme'

const ICON_FOR = {
  attendance_contest: '🗓️',
  grade_contest: '🧮',
  score: '📊',
}

function timeAgo(seconds) {
  if (!seconds) return ''
  const diff = Date.now() / 1000 - seconds
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function StudentNotificationBell({ dark = false, align = 'right' }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const { data } = useQuery({
    queryKey: ['student-notifications', profile.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'notifications'), where('user_id', '==', profile.id)),
      )
      // Sort client-side so no composite index is required.
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))
        .slice(0, 50)
    },
    enabled: !!profile?.id,
    refetchInterval: 30000,
  })

  const notifs = data ?? []
  const unread = notifs.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['student-notifications', profile.id] })

  async function openNotif(n) {
    setOpen(false)
    // Mark read but keep it in the list (persists).
    if (!n.read) {
      try {
        await updateDoc(doc(db, 'notifications', n.id), { read: true })
        refetch()
      } catch { /* ignore */ }
    }
    if (n.link) navigate(n.link)
  }

  async function markAllRead() {
    const un = notifs.filter((n) => !n.read)
    if (!un.length) return
    try {
      const batch = writeBatch(db)
      un.forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true }))
      await batch.commit()
      refetch()
    } catch { /* ignore */ }
  }

  const btnColor = dark ? 'rgba(250,250,246,0.85)' : navy
  const btnBorder = dark ? 'rgba(255,255,255,0.18)' : 'rgba(14,42,92,0.16)'
  const btnBg = dark ? 'rgba(255,255,255,0.06)' : '#FFFFFF'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3FA9F5]/40"
        style={{ position: 'relative', width: 38, height: 38, borderRadius: 10, border: `1px solid ${btnBorder}`, background: btnBg, color: btnColor, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: '#C0392B', color: '#FAFAF6', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid #fff' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{ position: 'absolute', top: 'calc(100% + 10px)', ...(align === 'left' ? { left: 0 } : { right: 0 }), width: 340, maxWidth: '92vw', background: '#FFFFFF', borderRadius: 12, boxShadow: '0 8px 32px rgba(14,42,92,0.18), 0 2px 8px rgba(14,42,92,0.08)', border: '1px solid rgba(14,42,92,0.1)', zIndex: 200, overflow: 'hidden' }}
        >
          <div className="flex items-center justify-between" style={{ padding: '13px 16px 11px', borderBottom: '1px solid rgba(14,42,92,0.08)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: ink, fontFamily: sans }}>
              Notifications{unread > 0 ? ` (${unread})` : ''}
            </span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 12, fontWeight: 700, color: navy, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                Mark all read
              </button>
            )}
          </div>

          {notifs.length === 0 ? (
            <div style={{ padding: '36px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🔔</div>
              <p style={{ fontSize: 13, fontWeight: 600, color: ink, margin: '0 0 4px' }}>No notifications yet</p>
              <p style={{ fontSize: 12, color: muted, lineHeight: 1.5, margin: 0 }}>
                You'll be alerted when a contest is resolved or a new score is posted.
              </p>
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {notifs.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNotif(n)}
                  className="hover:bg-slate-50"
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid rgba(14,42,92,0.06)', background: n.read ? 'transparent' : 'rgba(63,169,245,0.06)', border: 'none', borderLeft: n.read ? '3px solid transparent' : '3px solid #3FA9F5', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 16, marginTop: 1 }}>{ICON_FOR[n.type] ?? '🔔'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, color: n.read ? muted : ink, fontWeight: n.read ? 400 : 600 }}>{n.message}</span>
                    <span style={{ display: 'block', fontSize: 11, color: faint, marginTop: 3 }}>{timeAgo(n.created_at?.seconds)}</span>
                  </span>
                  {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3FA9F5', marginTop: 5, flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
