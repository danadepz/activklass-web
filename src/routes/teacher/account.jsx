import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import ChangePassword from '@/components/ChangePassword'
import SignOutButton from '@/components/SignOutButton'
import Button from '@/components/ui/Button'
import { changePlan, fetchPlans, fetchSubscription, formatBytes } from '@/lib/subscription'
import { acceptInvite, declineInvite, fetchMyInvites, isAbsorbed } from '@/lib/institution'
import {
  GROUP_CODE_PATTERN, JOIN_MODES, approveRequest, createGroup, denyRequest, fetchMyGroup,
  joinGroup, leaveGroup, rotateGroupCode,
} from '@/lib/teacherGroups'
import { ink, gold, navy, muted, faint, green, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { confirmDialog } from '@/components/ui/dialogs'
import { useMySubscription } from '@/hooks/useMySubscription'
import { PaidPlanHint } from '@/components/SubscriptionBadge'

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
          {profile.login_id ? 'Login ID' : 'Email'}
          <input style={{ ...field, marginTop: 6, background: 'rgba(14,42,92,0.03)' }}
                 value={profile.login_id ?? profile.email ?? ''} disabled />
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

  // Absorbed: the school took over the bill, so there is no plan of their own
  // left to show or change. Without this the card would render a cancelled
  // subscription complete with a plan picker, which reads as "your account
  // lapsed" rather than "your school covers this now".
  if (isAbsorbed(sub)) {
    return (
      <div style={card}>
        <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 4px' }}>Subscription</h2>
        <p style={{ fontSize: 13.5, color: muted, margin: 0, lineHeight: 1.6 }}>
          Your school covers your ActivKlass plan. Your administrator manages the plan and the seats
          for everyone, so there is nothing to pay or choose here.
        </p>
        <p style={{ fontSize: 12.5, color: faint, margin: '10px 0 0', lineHeight: 1.6 }}>
          Your own classes, students and records stayed yours — joining a school moved the billing
          and nothing else. If you leave the school, your individual plan comes back as it was.
        </p>
      </div>
    )
  }

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
              onChange={async (e) => {
                // Captured before the await — the confirmation is a real
                // dialog now, and the revert has to reach the same <select>.
                const select = e.target
                const next = select.value
                if (next === sub.plan) return
                const now = catalogue[sub.plan]
                const to = catalogue[next]
                if (to && now && to.student_seats < now.student_seats && !(await confirmDialog({
                  title: `Downgrade to ${next}?`,
                  message:
                    `Student seats drop from ${now.student_seats} to ${to.student_seats}. ` +
                    'No student accounts are removed — you would simply be over the limit.',
                  confirmLabel: 'Downgrade',
                  tone: 'danger',
                }))) { select.value = sub.plan; return }
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

/* ── School invitation ──────────────────────────────────── */

/**
 * A school offering to take over this teacher's bill.
 *
 * Rendered above the subscription so the offer is read before the plan it
 * would replace. Accepting is the teacher's decision alone -- an admin cannot
 * do it for them (api/institution.py), which is the whole point of the
 * handshake, so the consequences are spelled out rather than implied.
 */
function SchoolInviteCard() {
  const qc = useQueryClient()
  const [err, setErr] = useState('')

  const { data } = useQuery({
    queryKey: ['institution-invites-mine'],
    queryFn: fetchMyInvites,
    retry: false,
  })

  const refresh = () => {
    setErr('')
    qc.invalidateQueries({ queryKey: ['institution-invites-mine'] })
    qc.invalidateQueries({ queryKey: ['subscription'] })
    qc.invalidateQueries({ queryKey: ['teacher-group'] })
  }
  const accept = useMutation({ mutationFn: acceptInvite, onSuccess: refresh, onError: (e) => setErr(e.message) })
  const decline = useMutation({ mutationFn: declineInvite, onSuccess: refresh, onError: (e) => setErr(e.message) })
  const busy = accept.isPending || decline.isPending

  const invites = data?.invites ?? []
  if (!invites.length) return null

  return (
    <div style={{ ...card, borderColor: 'rgba(245,197,24,0.55)', background: 'rgba(245,197,24,0.06)' }}>
      <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 4px' }}>
        {invites.length > 1 ? 'School invitations' : 'School invitation'}
      </h2>
      <p style={{ fontSize: 13.5, color: muted, margin: '0 0 14px', lineHeight: 1.6 }}>
        Accepting moves your billing to the school: they cover your plan and you stop paying for your
        own. Your classes, students and records stay yours either way, and you can be released back to
        your own plan later.
      </p>

      {invites.map((inv) => (
        <div
          key={inv.id}
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '12px 0', borderTop: `1px solid ${line}`,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>
            {inv.school_name || 'A school'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                if (await confirmDialog({
                  title: `Decline ${inv.school_name || 'this school'}?`,
                  message: 'Nothing changes — you keep your own plan. The school can invite you again later.',
                  confirmLabel: 'Decline',
                })) decline.mutate(inv.id)
              }}
            >
              Decline
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (await confirmDialog({
                  title: `Join ${inv.school_name || 'this school'}?`,
                  message:
                    'Your own subscription stops and the school covers your plan from now on. '
                    + 'Your classes and student records are not transferred.',
                  confirmLabel: 'Join the school',
                })) accept.mutate(inv.id)
              }}
            >
              Join the school
            </Button>
          </div>
        </div>
      ))}

      <Notice>{err}</Notice>
    </div>
  )
}

/* ── Teacher group ────────────────────────────────────── */

function CodeChip({ code }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{
        ...mono, fontSize: 20, letterSpacing: '0.18em', fontWeight: 700, color: gold,
        background: navy, borderRadius: 10, padding: '9px 16px',
      }}>
        {code}
      </span>
      <Button
        variant="ghost"
        onClick={async () => {
          // Clipboard access can be refused (insecure origin, denied permission).
          // The code is on screen either way, so a failure is not worth an error.
          try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          } catch { /* the teacher can still read it off the chip */ }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

/** Create a group, or redeem someone else's code. Shown when in neither. */
function GroupOnboarding({ pendingRequest, flash, onChanged }) {
  const [mode, setMode] = useState('join')
  const [name, setName] = useState('')
  const [joinMode, setJoinMode] = useState('approval')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  const create = useMutation({
    mutationFn: () => createGroup({ name, joinMode }),
    /* The confirmation is handed upward rather than shown here. A successful
       create refetches the group, which swaps this whole card out for
       GroupDetail -- anything set in local state would unmount with it, which
       is why creating a group looked like it did nothing at all. */
    onSuccess: (res) => {
      setErr('')
      const created = res?.group?.name ?? name.trim()
      onChanged(`"${created}" is ready. Share the group code below to invite teachers.`)
    },
    onError: (e) => setErr(e.message),
  })
  const join = useMutation({
    mutationFn: () => joinGroup(code),
    onSuccess: (res) => {
      setErr('')
      // An open group lets them straight in; an approval group does not, and
      // reporting "joined" there would be a lie they only discover on refresh.
      if (!res?.joined) {
        setNote(`Request sent to ${res?.group_name ?? 'the group'}. You will join once the owner approves.`)
      }
      onChanged()
    },
    onError: (e) => setErr(e.message),
  })

  if (pendingRequest) {
    return (
      <div style={card}>
        <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 4px' }}>Teacher group</h2>
        <p style={{ fontSize: 13.5, color: muted, margin: 0, lineHeight: 1.6 }}>
          Your request to join <strong style={{ color: ink }}>{pendingRequest.group_name}</strong> is
          waiting for the group owner to approve it.
        </p>
      </div>
    )
  }

  const tab = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => { setMode(key); setErr('') }}
      style={{
        fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
        background: mode === key ? navy : 'transparent',
        color: mode === key ? gold : muted,
        border: `1px solid ${mode === key ? navy : line}`,
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={card}>
      <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 4px' }}>Teacher group</h2>
      <p style={{ fontSize: 13.5, color: muted, margin: '0 0 14px', lineHeight: 1.6 }}>
        Teachers at the same school can group up by sharing a code. A group is for working together —
        it does not change who pays for anything.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {tab('join', 'Enter a code')}
        {tab('create', 'Start a group')}
      </div>

      {mode === 'join' ? (
        <form
          onSubmit={(e) => { e.preventDefault(); join.mutate() }}
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC234"
            maxLength={6}
            aria-label="Group code"
            style={{ ...field, ...mono, width: 160, letterSpacing: '0.16em', textTransform: 'uppercase' }}
          />
          <Button type="submit" disabled={join.isPending || !GROUP_CODE_PATTERN.test(code)}>
            {join.isPending ? 'Joining…' : 'Join group'}
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: ink, display: 'block', marginBottom: 5 }}>
              Group name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mathematics Department"
              style={field}
            />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: ink, display: 'block', marginBottom: 5 }}>
              Who can join
            </label>
            <div style={{ display: 'grid', gap: 6 }}>
              {JOIN_MODES.map((m) => (
                <label key={m.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="join-mode"
                    checked={joinMode === m.key}
                    onChange={() => setJoinMode(m.key)}
                    style={{ accentColor: navy, marginTop: 3 }}
                  />
                  <span>
                    <span style={{ fontSize: 13.5, color: ink, fontWeight: 600 }}>{m.label}</span>
                    <span style={{ fontSize: 12.5, color: faint, display: 'block' }}>{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? 'Creating…' : 'Create group'}
            </Button>
          </div>
        </form>
      )}

      <Notice tone="success">{note || flash}</Notice>
      <Notice>{err}</Notice>
    </div>
  )
}

/** The group the teacher is already in: members, requests, code, leaving. */
function GroupDetail({ group, flash, onChanged }) {
  const [err, setErr] = useState('')
  const done = () => { setErr(''); onChanged() }
  const fail = (e) => setErr(e.message)

  const approve = useMutation({ mutationFn: approveRequest, onSuccess: done, onError: fail })
  const deny = useMutation({ mutationFn: denyRequest, onSuccess: done, onError: fail })
  const rotate = useMutation({ mutationFn: rotateGroupCode, onSuccess: done, onError: fail })
  const leave = useMutation({ mutationFn: leaveGroup, onSuccess: done, onError: fail })
  const busy = approve.isPending || deny.isPending || rotate.isPending || leave.isPending

  const requests = group.requests ?? []

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 2px' }}>{group.name}</h2>
          <p style={{ fontSize: 13, color: muted, margin: 0 }}>
            {group.members.length} {group.members.length === 1 ? 'teacher' : 'teachers'}
            {group.is_owner ? ' · you own this group' : ''}
          </p>
        </div>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            if (await confirmDialog({
              title: `Leave ${group.name}?`,
              message: 'You keep your classes and your plan. You would need the code again to rejoin.',
              confirmLabel: 'Leave group',
              tone: 'danger',
            })) leave.mutate()
          }}
        >
          Leave
        </Button>
      </div>

      <Notice tone="success">{flash}</Notice>

      {group.school_id && (
        <p style={{ fontSize: 12.5, color: faint, margin: '12px 0 0', lineHeight: 1.6 }}>
          This group is affiliated with a school. Affiliation follows each member&rsquo;s own billing —
          the group itself neither grants nor costs a seat.
        </p>
      )}

      {group.is_owner && group.code && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: ink, marginBottom: 8 }}>Group code</div>
          <CodeChip code={group.code} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: faint }}>
              Share this with teachers you want in the group.
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await confirmDialog({
                  title: 'Generate a new code?',
                  message: 'The current code stops working immediately. Anyone still holding it cannot join.',
                  confirmLabel: 'Generate new code',
                })) rotate.mutate()
              }}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, color: navy, textDecoration: 'underline',
              }}
            >
              Generate a new one
            </button>
          </div>
        </div>
      )}

      {group.is_owner && requests.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: ink, marginBottom: 8 }}>
            Waiting for approval
          </div>
          {requests.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                flexWrap: 'wrap', padding: '10px 0', borderTop: `1px solid ${line}`,
              }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: ink }}>
                  {r.first_name} {r.last_name}
                </div>
                <div style={{ fontSize: 12.5, color: faint }}>{r.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" disabled={busy} onClick={() => deny.mutate(r.id)}>Deny</Button>
                <Button disabled={busy} onClick={() => approve.mutate(r.id)}>Approve</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: ink, marginBottom: 8 }}>Members</div>
        {group.members.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              padding: '9px 0', borderTop: `1px solid ${line}`,
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, color: ink }}>
                {m.first_name} {m.last_name}
                {m.id === group.owner_id && (
                  <span style={{ ...mono, fontSize: 11, color: navy, marginLeft: 8 }}>owner</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: faint }}>{m.email}</div>
            </div>
            {m.school_id && (
              <span style={{ fontSize: 11.5, color: green, fontWeight: 600 }}>on a school plan</span>
            )}
          </div>
        ))}
      </div>

      <Notice>{err}</Notice>
    </div>
  )
}

function TeacherGroupCard() {
  const qc = useQueryClient()
  const { locks } = useMySubscription()
  const { data, isLoading } = useQuery({
    queryKey: ['teacher-group'],
    queryFn: fetchMyGroup,
    retry: false,
  })
  /* Held here, above both cards, because the action that earns a confirmation
     is usually the one whose refetch unmounts the card that fired it. Callers
     pass the message they want kept; the ones that pass nothing clear it, so a
     stale confirmation cannot outlive the next action. */
  const [flash, setFlash] = useState('')
  const onChanged = (message = '') => {
    setFlash(message)
    qc.invalidateQueries({ queryKey: ['teacher-group'] })
  }

  if (isLoading) {
    return <div style={card}><p style={{ color: faint, margin: 0 }}>Loading your group…</p></div>
  }
  if (data?.group) return <GroupDetail group={data.group} flash={flash} onChanged={onChanged} />
  // A trial may see what a group is, not start or join one. The card stays
  // on screen, greyed, so the teacher learns what a paid plan adds; a member
  // whose trial began after they joined keeps the group they are already in.
  if (locks.teacherGroups) {
    return (
      <div style={{ ...card, position: 'relative' }} aria-disabled="true">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <h2 style={{ ...serif, fontSize: 20, color: ink, margin: 0 }}>Teacher group</h2>
          <PaidPlanHint />
        </div>
        <div style={{ opacity: 0.45, pointerEvents: 'none', userSelect: 'none' }}>
          <GroupOnboarding pendingRequest={data?.pending_request} flash={flash} onChanged={onChanged} />
        </div>
      </div>
    )
  }
  return <GroupOnboarding pendingRequest={data?.pending_request} flash={flash} onChanged={onChanged} />
}

/* ── Sign out ───────────────────────────────────────────────────── */

function SignOutCard() {
  return (
    <div style={card}>
      <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 4px' }}>Sign out</h2>
      <p style={{ fontSize: 13.5, color: muted, margin: '0 0 14px' }}>
        End your session on this device. You will be asked to confirm first.
      </p>
      <SignOutButton
        style={{
          padding: '10px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans,
          color: '#FAFAF6', background: red, border: 'none', borderRadius: 10, cursor: 'pointer',
        }}
      />
    </div>
  )
}

/** Teacher account page: Update Profile, Update Password, any school invitation,
 *  the solo teacher's Subscription Management module, their teacher group, and
 *  signing out (moved here from the portal header). */
export default function TeacherAccountPage() {
  return (
    <div style={{ display: 'grid', gap: 22, maxWidth: 860 }}>
      <div>
        <h1 style={{ ...serif, fontSize: 'clamp(24px,3.2vw,30px)', color: ink, margin: '0 0 4px' }}>
          Account
        </h1>
        <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
          Your details, your password, your plan, and your teacher group.
        </p>
      </div>
      <ProfileCard />
      <ChangePassword />
      <SchoolInviteCard />
      <SubscriptionCard />
      <TeacherGroupCard />
      <SignOutCard />
    </div>
  )
}
