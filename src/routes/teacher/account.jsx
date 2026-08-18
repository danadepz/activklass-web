import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import ChangePassword from '@/components/ChangePassword'
import Button from '@/components/ui/Button'
import { changePlan, fetchPlans, fetchSubscription, formatBytes } from '@/lib/subscription'
import {
  ink, gold, muted, faint, green, red, line, serif, mono, sansFamily as sans,
} from '@/theme'

const GB = 1024 ** 3

const card = { background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }
const field = {
  width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: sans, color: ink,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10,
}

function Notice({ tone = 'error', children }) {
  if (!children) return null
  const isError = tone === 'error'
  return (
    <div role="alert" style={{
      fontSize: 13, borderRadius: 10, padding: '10px 12px', marginTop: 12,
      color: isError ? red : green,
      background: isError ? 'rgba(192,57,43,0.07)' : 'rgba(31,138,91,0.08)',
      border: `1px solid ${isError ? 'rgba(192,57,43,0.3)' : 'rgba(31,138,91,0.3)'}`,
    }}>
      {children}
    </div>
  )
}

function Meter({ label, used, total, over }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : null
  const bar = over ? red : pct != null && pct >= 80 ? gold : green
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{label}</span>
        <span style={{ ...mono, fontSize: 12.5, color: over ? red : muted }}>
          {used} / {total == null ? 'unlimited' : total}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: 'rgba(14,42,92,0.08)', overflow: 'hidden' }}>
        {pct != null && <div style={{ width: `${pct}%`, height: '100%', background: bar }} />}
      </div>
      {over && (
        <div style={{ fontSize: 12, color: red, marginTop: 5 }}>
          Over your plan. Nothing is blocked — upgrade when you need to.
        </div>
      )}
    </div>
  )
}

/* ── Update Profile ─────────────────────────────────────────────── */

function ProfileCard() {
  const { profile, refreshProfile } = useAuth()
  const [form, setForm] = useState({
    first_name: profile.first_name ?? '',
    last_name: profile.last_name ?? '',
  })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const mut = useMutation({
    mutationFn: (fields) => updateDoc(doc(db, 'users', profile.id), {
      ...fields, updated_at: serverTimestamp(),
    }),
    onSuccess: async () => {
      setErr(''); setMsg('Profile updated.')
      // The signed-in profile is cached in context; without this the header
      // keeps showing the old name until a reload.
      if (typeof refreshProfile === 'function') await refreshProfile()
    },
    onError: (e) => { setMsg(''); setErr(e.message) },
  })

  function submit(e) {
    e.preventDefault()
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setMsg(''); setErr('First and last name are required.'); return
    }
    mut.mutate({ first_name: form.first_name.trim(), last_name: form.last_name.trim() })
  }

  return (
    <form onSubmit={submit} style={card}>
      <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 4px' }}>Your profile</h2>
      <p style={{ fontSize: 13, color: muted, margin: '0 0 16px' }}>
        Your name as students and parents see it. Your email is your sign-in and cannot be changed here.
      </p>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          First name
          <input style={{ ...field, marginTop: 6 }} value={form.first_name}
                 onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Last name
          <input style={{ ...field, marginTop: 6 }} value={form.last_name}
                 onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: muted }}>
          Email
          <input style={{ ...field, marginTop: 6, background: 'rgba(14,42,92,0.03)' }}
                 value={profile.email ?? ''} disabled />
        </label>
      </div>
      <div style={{ marginTop: 16 }}>
        <Button type="submit" disabled={mut.isPending}>
          {mut.isPending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
      <Notice>{err}</Notice>
      <Notice tone="ok">{msg}</Notice>
    </form>
  )
}

/* ── Subscription (solo teacher) ────────────────────────────────── */

function SubscriptionCard() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [err, setErr] = useState('')

  const { data: plansRes } = useQuery({ queryKey: ['subscription-plans'], queryFn: fetchPlans })
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['subscription', profile.id],
    queryFn: () => fetchSubscription(profile.id),
    retry: false,
  })

  const mut = useMutation({
    mutationFn: (plan) => changePlan(profile.id, plan),
    onSuccess: () => { setErr(''); qc.invalidateQueries({ queryKey: ['subscription'] }) },
    onError: (e) => setErr(e.message),
  })

  if (isLoading) return <div style={card}><p style={{ color: faint, margin: 0 }}>Loading subscription…</p></div>

  // A teacher on an institution plan has no subscription of their own -- their
  // school holds it. Saying so is more useful than an error.
  if (isError) {
    return (
      <div style={card}>
        <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 4px' }}>Subscription</h2>
        <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
          {error?.status === 404
            ? 'No individual subscription on this account. If your school subscribed, your administrator manages the plan and seats for everyone.'
            : error?.message ?? 'Could not load your subscription.'}
        </p>
      </div>
    )
  }

  const { subscription: sub, usage } = data
  const catalogue = plansRes?.plans?.[sub.type] ?? {}

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 2px' }}>Your subscription</h2>
          <p style={{ fontSize: 13, color: muted, margin: 0 }}>
            {sub.period_label} · {sub.period_start} → {sub.period_end}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            color: sub.status === 'active' ? green : red,
            background: sub.status === 'active' ? 'rgba(31,138,91,0.10)' : 'rgba(192,57,43,0.08)',
            borderRadius: 20, padding: '3px 10px',
          }}>
            {sub.status}
          </span>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: ink, display: 'block', marginBottom: 5 }}>
              Plan
            </label>
            <select
              value={sub.plan}
              disabled={mut.isPending}
              onChange={(e) => {
                const next = e.target.value
                if (next === sub.plan) return
                const now = catalogue[sub.plan]
                const to = catalogue[next]
                if (to && now && to.student_seats < now.student_seats && !window.confirm(
                  `Downgrade to ${next}? Student seats drop from ${now.student_seats} to ${to.student_seats}. ` +
                  'No student accounts are removed — you would simply be over the limit.',
                )) { e.target.value = sub.plan; return }
                mut.mutate(next)
              }}
              style={{ ...field, width: 'auto', padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}
            >
              {Object.entries(catalogue).map(([name, l]) => (
                <option key={name} value={name}>{name} — {l.student_seats} students</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
                    marginTop: 20 }}>
        <Meter label="Student seats" used={usage.students.used} total={usage.students.seats}
               over={usage.students.over} />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: ink, marginBottom: 6 }}>Storage</div>
          <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
            Your plan includes {formatBytes((sub.limits?.storage_gb ?? 0) * GB)}. Usage is reported by
            your administrator once file storage is enabled.
          </div>
        </div>
      </div>

      <Notice>{err}</Notice>
    </div>
  )
}

/** Teacher account page: Update Profile, Update Password, and the solo
 *  teacher's Subscription Management modules. */
export default function TeacherAccountPage() {
  return (
    <div style={{ display: 'grid', gap: 22, maxWidth: 860 }}>
      <div>
        <h1 style={{ ...serif, fontSize: 'clamp(24px,3.2vw,30px)', color: ink, margin: '0 0 4px' }}>
          Account
        </h1>
        <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
          Your details, your password, and your plan.
        </p>
      </div>
      <ProfileCard />
      <ChangePassword />
      <SubscriptionCard />
    </div>
  )
}
