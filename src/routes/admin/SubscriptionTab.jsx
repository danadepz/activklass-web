import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  changePlan, confirmSeatIncrease, fetchMyOwnerId, fetchPlans, fetchStorageUsage, fetchSubscription,
  formatBytes, startSeatIncreaseCheckout, toMillis, useCheckoutReturn,
} from '@/lib/subscription'
import {
  fetchSchoolInvites, inviteTeacher, releaseMember, revokeInvite,
} from '@/lib/institution'
import { ink, muted, faint, green, red, gold, navy, line, serif, mono, blueText, goldDeep } from '@/theme'
import { School, GraduationCap, Layers } from '@/components/icons'
import { card, field, th } from './ui'
import Notice from './Notice'
import CardHead from './CardHead'
import Button from '@/components/ui/Button'
import { confirmDialog } from '@/components/ui/dialogs'
import ChangePassword from '@/components/ChangePassword'

const GB = 1024 ** 3

/**
 * The address already named on the "Verifying your account" hold screen
 * (`routes/pending-verification.jsx`) -- the one real, monitored inbox this
 * product points teachers to. Plan changes get refused with the same
 * "handled by ActivKlass support" sentence and deserve the same route.
 */
export const SUPPORT_EMAIL = 'activklassteam.2026@gmail.com'

/** T-172: the backend's plan-change refusal names support, not a way to reach it. */
export const isSupportOnlyError = (message) => /handled by ActivKlass support/i.test(message || '')

export function PlanChangeNotice({ error }) {
  if (!error) return null
  return (
    <Notice>
      {error}
      {isSupportOnlyError(error) && (
        <>
          {' '}Reach us at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: navy, fontWeight: 600 }}>{SUPPORT_EMAIL}</a>.
        </>
      )}
    </Notice>
  )
}

function Meter({ label, used, total, unit, over }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : null
  const bar = over ? red : pct != null && pct >= 80 ? gold : green
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{label}</span>
        <span style={{ ...mono, fontSize: 12.5, color: over ? red : muted }}>
          {used}{unit ? ` ${unit}` : ''} / {total == null ? 'unlimited' : `${total}${unit ? ` ${unit}` : ''}`}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: 'rgba(14,42,92,0.08)', overflow: 'hidden' }}>
        {pct != null && (
          <div style={{ width: `${pct}%`, height: '100%', background: bar, transition: 'width .25s' }} />
        )}
      </div>
      {over && (
        <div style={{ fontSize: 12, color: red, marginTop: 5 }}>
          Over the plan limit. Nothing is blocked — upgrade when convenient.
        </div>
      )}
    </div>
  )
}

function PlanCard({ ownerId, sub, usage, plans, onChanged }) {
  const [error, setError] = useState('')
  const catalogue = plans?.[sub.type] ?? {}
  const names = Object.keys(catalogue)

  const mut = useMutation({
    mutationFn: (plan) => changePlan(ownerId, plan),
    onSuccess: () => { setError(''); onChanged() },
    onError: (e) => setError(e.message),
  })

  async function pick(e) {
    // Captured before the await: the dialog is asynchronous now, and the
    // revert below has to reach the same <select> afterwards.
    const select = e.target
    const plan = select.value
    if (plan === sub.plan) return
    const now = catalogue[sub.plan]
    const next = catalogue[plan]
    const downgrade = next && now && next.student_seats < now.student_seats
    if (downgrade && !(await confirmDialog({
      title: `Downgrade to ${plan}?`,
      message:
        `Student seats drop from ${now.student_seats} to ${next.student_seats}. ` +
        'Existing accounts are not removed — you would simply be over the limit.',
      confirmLabel: 'Downgrade',
      tone: 'danger',
    }))) { select.value = sub.plan; return }
    mut.mutate(plan)
  }

  const storageBytes = (sub.limits?.storage_gb ?? 0) * GB
  const trialEndsMs = toMillis(sub.trial_ends_at)
  const trialEndsLabel = trialEndsMs
    ? new Date(trialEndsMs).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <section style={{ ...card, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(14,42,92,0.07)', border: `1px solid ${line}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}
          >
            <School className="w-5 h-5" style={{ color: navy }} />
          </span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                          textTransform: 'uppercase', color: muted }}>
              {sub.type === 'institution' ? 'Institution subscription' : 'Solo teacher subscription'}
            </div>
            <h2 style={{ ...serif, fontSize: 24, color: ink, margin: '4px 0 2px' }}>
              {sub.name || sub.school_name || ownerId}
            </h2>
            {sub.status === 'trial' && trialEndsLabel && (
              <div style={{ fontSize: 13, color: muted }}>
                Trial ends {trialEndsLabel}
              </div>
            )}
          </div>
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
            <select value={sub.plan} onChange={pick} disabled={mut.isPending}
                    style={{ ...field, width: 'auto', padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n.charAt(0).toUpperCase() + n.slice(1)} — {catalogue[n].student_seats} Students
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
                    marginTop: 22 }}>
        <Meter label="Teacher Seats" used={usage.teachers.used} total={usage.teachers.seats}
               over={usage.teachers.over} />
        <Meter label="Student Seats" used={usage.students.used} total={usage.students.seats}
               over={usage.students.over} />
        <StorageMeter limitBytes={storageBytes} />
      </div>

      {error && <div style={{ marginTop: 14 }}><PlanChangeNotice error={error} /></div>}
    </section>
  )
}

// Exported alongside the component below for the same reason
// teacher/account.jsx exports its own: a test locking "no banner names the
// vendor" without driving a real poll through the effect.
export const SEAT_CHECKOUT_BANNER = {
  checking: { bg: 'rgba(14,42,92,0.05)', border: line, color: muted, text: 'Checking your payment…' },
  paid: { bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.3)', color: green, text: 'Payment received — your new seats are now available.' },
  unconfirmed: {
    bg: 'rgba(245,197,24,0.14)', border: 'rgba(245,197,24,0.4)', color: '#8A6D00',
    text: 'We could not confirm the payment yet. If you completed it, refresh in a moment — otherwise nothing was charged.',
  },
  cancelled: { bg: 'rgba(14,42,92,0.05)', border: line, color: muted, text: 'Payment was cancelled — nothing was charged.' },
}

function SeatCheckoutBanner({ state, receipt, dismiss }) {
  if (!state) return null
  const s = SEAT_CHECKOUT_BANNER[state]
  const seatsLine = state === 'paid' && receipt?.newLimits
    ? `Your school now has ${receipt.newLimits.teacher_seats} teacher seats and `
      + `${receipt.newLimits.student_seats} student seats.`
    : null
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '12px 16px',
      marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 13.5, color: s.color, fontWeight: 600 }}>
        {s.text}
        {seatsLine && <span style={{ display: 'block', fontWeight: 400, marginTop: 3 }}>{seatsLine}</span>}
      </span>
      {state !== 'checking' && (
        <button
          type="button"
          onClick={dismiss}
          style={{ background: 'none', border: 'none', color: s.color, fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0 }}
        >
          Dismiss
        </button>
      )}
    </div>
  )
}

/**
 * Add teacher and/or student seats to an already-active institution plan,
 * mid-year. Increase-only: the inputs are floored at what the school already
 * has, and the backend refuses a decrease with the same "handled by
 * ActivKlass support" wording `change_plan` already uses for a full plan
 * change -- so `PlanChangeNotice` above picks it up and renders the mailto
 * link without any new detection logic here.
 */
function SeatIncreaseCard({ ownerId, sub }) {
  const curTeacher = sub.limits?.teacher_seats ?? 0
  const curStudent = sub.limits?.student_seats ?? 0
  const [teacherSeats, setTeacherSeats] = useState(String(curTeacher))
  const [studentSeats, setStudentSeats] = useState(String(curStudent))
  const [error, setError] = useState('')

  const mut = useMutation({
    mutationFn: ({ teacherSeats: t, studentSeats: s }) => startSeatIncreaseCheckout(ownerId, { teacherSeats: t, studentSeats: s }),
    onSuccess: (res) => { window.location.href = res.checkout_url },
    onError: (e) => setError(e.message),
  })

  async function submit() {
    setError('')
    const t = Number.parseInt(teacherSeats, 10)
    const s = Number.parseInt(studentSeats, 10)
    const next = await confirmSeatIncrease({
      current: { teacherSeats: curTeacher, studentSeats: curStudent },
      next: { teacherSeats: t, studentSeats: s },
      paidThroughMs: toMillis(sub.paid_through),
      ownerPhrase: 'what your school already has',
      onError: setError,
    })
    if (next) mut.mutate(next)
  }

  return (
    <section style={{ ...card, padding: 22 }}>
      <CardHead
        icon={<Layers className="w-5 h-5" style={{ color: goldDeep }} />}
        tint="rgba(245,197,24,0.15)"
        title="Add Seats"
        sub="Seats can only be increased here — to reduce seats, contact ActivKlass support. New seats are billed only for the months left until your plan renews, and renew on that same date. They're available as soon as payment is confirmed."
        style={{ marginBottom: 16 }}
      />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: ink, display: 'block', marginBottom: 5 }}>
            Teacher seats
          </label>
          <input
            type="number" min={curTeacher} step={1} value={teacherSeats}
            onChange={(e) => setTeacherSeats(e.target.value)}
            aria-label="New teacher seat total"
            style={{ ...field, width: 110 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: ink, display: 'block', marginBottom: 5 }}>
            Student seats
          </label>
          <input
            type="number" min={curStudent} step={1} value={studentSeats}
            onChange={(e) => setStudentSeats(e.target.value)}
            aria-label="New student seat total"
            style={{ ...field, width: 110 }}
          />
        </div>
        <Button disabled={mut.isPending} onClick={submit}>
          {mut.isPending ? 'Starting payment…' : 'Add seats'}
        </Button>
      </div>
      {error && <div style={{ marginTop: 14 }}><PlanChangeNotice error={error} /></div>}
    </section>
  )
}

function StorageMeter({ limitBytes }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-storage'],
    queryFn: fetchStorageUsage,
    retry: false,
  })

  if (isLoading) return <div style={{ fontSize: 12.5, color: faint }}>Measuring storage…</div>
  if (isError) return <div style={{ fontSize: 12.5, color: faint }}>Storage usage unavailable.</div>

  if (data?.available === false) {
    return (
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: ink, marginBottom: 6 }}>Storage</div>
        <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
          Not enabled for this project. The plan allows {formatBytes(limitBytes)}; usage can be measured
          once Firebase Storage is turned on.
        </div>
      </div>
    )
  }

  return (
    <div>
      <Meter label="Storage" used={formatBytes(data.total_bytes)} total={formatBytes(limitBytes)} />
      <div style={{ fontSize: 12, color: faint, marginTop: 5 }}>
        {data.file_count} file{data.file_count === 1 ? '' : 's'}
      </div>
    </div>
  )
}

/**
 * Offer a seat on this school's plan to a teacher who pays for their own.
 *
 * Invite, never assign. The teacher accepts on their own Account page and only
 * then does their school_id move -- see api/institution.py for why the
 * handshake matters (RA 10173, and teachers who work at two schools).
 *
 * Accepting moves BILLING only. Their classes, students and records stay
 * theirs, and this panel says so, because "add to school" reads like it would
 * hand the school their records and it does not.
 */
function TeacherSeatsCard({ onChanged }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['institution-invites'],
    queryFn: fetchSchoolInvites,
    retry: false,
  })

  const done = (message) => {
    setError('')
    setNote(message ?? '')
    qc.invalidateQueries({ queryKey: ['institution-invites'] })
    onChanged?.()
  }
  const fail = (e) => { setNote(''); setError(e.message) }

  const invite = useMutation({
    mutationFn: () => inviteTeacher(email.trim()),
    onSuccess: () => { setEmail(''); done('Invitation sent. It appears on their Account page.') },
    onError: fail,
  })
  const revoke = useMutation({ mutationFn: revokeInvite, onSuccess: () => done(), onError: fail })
  const release = useMutation({ mutationFn: releaseMember, onSuccess: () => done(), onError: fail })
  const busy = invite.isPending || revoke.isPending || release.isPending

  // Accepted invites are the school's current teachers; the rest are outstanding
  // offers. Splitting them is what makes "who can I release" answerable.
  const invites = data?.invites ?? []
  const accepted = invites.filter((i) => i.status === 'accepted')
  const pending = invites.filter((i) => i.status === 'pending')

  return (
    <section style={{ ...card, padding: 22 }}>
      <CardHead
        icon={<GraduationCap className="w-5 h-5" style={{ color: blueText }} />}
        tint="rgba(63,169,245,0.13)"
        title="Teachers Included in Your Plan"
        sub="Invite a teacher who currently pays for their own ActivKlass plan. When they accept, their subscription stops and they take one of your teacher seats. Their classes, students and records are not transferred — this moves billing only."
        style={{ marginBottom: 16 }}
      />

      <form
        onSubmit={(e) => { e.preventDefault(); invite.mutate() }}
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teacher@example.com"
          aria-label="Teacher email"
          style={{ ...field, flex: '1 1 240px', minWidth: 0 }}
        />
        <Button type="submit" disabled={busy || !email.trim()}>
          {invite.isPending ? 'Sending…' : 'Send Invitation'}
        </Button>
      </form>

      {isLoading && <p style={{ fontSize: 12.5, color: faint, marginTop: 14 }}>Loading invitations…</p>}
      {isError && <p style={{ fontSize: 12.5, color: faint, marginTop: 14 }}>Invitations unavailable.</p>}

      {pending.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: ink, marginBottom: 8 }}>
            Waiting for the teacher to accept
          </div>
          {pending.map((i) => (
            <div key={i.id} style={rowStyle}>
              <div>
                <div style={{ fontSize: 13.5, color: ink }}>{i.first_name} {i.last_name}</div>
                <div style={{ fontSize: 12.5, color: faint }}>{i.email}</div>
              </div>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (await confirmDialog({
                    title: 'Withdraw this invitation?',
                    message: `${i.email} will no longer be able to accept it. You can invite them again later.`,
                    confirmLabel: 'Withdraw',
                  })) revoke.mutate(i.id)
                }}
              >
                Withdraw
              </Button>
            </div>
          ))}
        </div>
      )}

      {accepted.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: ink, marginBottom: 8 }}>
            On your plan
          </div>
          {accepted.map((i) => (
            <div key={i.id} style={rowStyle}>
              <div>
                <div style={{ fontSize: 13.5, color: ink }}>{i.first_name} {i.last_name}</div>
                <div style={{ fontSize: 12.5, color: faint }}>{i.email}</div>
              </div>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (await confirmDialog({
                    title: `Release ${i.first_name || i.email}?`,
                    message:
                      'They give up their seat on your plan and their own subscription is reactivated '
                      + 'exactly as it was. Their classes and records are unaffected.',
                    confirmLabel: 'Release',
                    tone: 'danger',
                  })) release.mutate(i.teacher_id)
                }}
              >
                Release
              </Button>
            </div>
          ))}
        </div>
      )}

      {note && <div style={{ marginTop: 14 }}><Notice tone="success">{note}</Notice></div>}
      {error && <div style={{ marginTop: 14 }}><Notice>{error}</Notice></div>}
    </section>
  )
}

const rowStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  flexWrap: 'wrap', padding: '10px 0', borderTop: `1px solid ${line}`,
}

/** Subscription Management: View Status, View Storage Usage, Upgrade/Downgrade. */
export default function SubscriptionTab() {
  const qc = useQueryClient()
  const { data: plansRes } = useQuery({ queryKey: ['subscription-plans'], queryFn: fetchPlans })
  const { data: mine, isLoading: resolving, isError: resolveFailed, error: resolveError } = useQuery({
    queryKey: ['subscription-owner'],
    queryFn: fetchMyOwnerId,
    retry: false,
  })
  const ownerId = mine?.owner_id
  const checkout = useCheckoutReturn(ownerId)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['subscription', ownerId],
    queryFn: () => fetchSubscription(ownerId),
    enabled: !!ownerId,
    retry: false,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['subscription'] })
    qc.invalidateQueries({ queryKey: ['admin-storage'] })
  }

  if (resolving) return <p style={{ color: faint }}>Loading subscription…</p>
  if (resolveFailed) {
    return (
      <Notice>
        {resolveError?.message
          ?? 'Could not work out which subscription applies to your account.'}
      </Notice>
    )
  }
  if (isLoading) return <p style={{ color: faint }}>Loading subscription…</p>
  if (isError) {
    return (
      <Notice>
        {error?.status === 404
          ? `No subscription record for ${ownerId} yet. Run seed_subscriptions.py in the backend to create one.`
          : error?.message ?? 'Could not load the subscription.'}
      </Notice>
    )
  }

  const { subscription, usage } = data
  const plans = plansRes?.plans

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <SeatCheckoutBanner {...checkout} />

      <PlanCard ownerId={ownerId} sub={subscription} usage={usage} plans={plans}
                onChanged={refresh} />

      {subscription.type === 'institution' && subscription.status === 'active' && (
        <SeatIncreaseCard ownerId={ownerId} sub={subscription} />
      )}

      <TeacherSeatsCard onChanged={refresh} />

      <ChangePassword />

      {plans && (
        <section style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${line}` }}>
            <CardHead
              icon={<Layers className="w-5 h-5" style={{ color: goldDeep }} />}
              tint="rgba(245,197,24,0.15)"
              title="Available Plans"
              sub="Seat counts are limits, not reservations — usage is measured live from the user list. Nothing is blocked when a limit is passed."
            />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ background: 'rgba(14,42,92,0.03)' }}>
                  {['Type', 'Plan', 'Teacher Seats', 'Student Seats', 'Storage'].map((h, i) => (
                    <th key={h} style={{ ...th, color: muted, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(plans).flatMap(([type, catalogue]) =>
                  Object.entries(catalogue).map(([name, l]) => {
                    const current = type === subscription.type && name === subscription.plan
                    return (
                      <tr key={`${type}-${name}`} style={{
                        borderTop: `1px solid ${line}`,
                        background: current ? 'rgba(245,197,24,0.10)' : undefined,
                      }}>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: muted, textTransform: 'capitalize' }}>{type}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13.5, fontWeight: 700, color: ink, textTransform: 'capitalize' }}>
                          {name}
                          {current && (
                            <span style={{ ...mono, fontSize: 11, color: navy, marginLeft: 8, textTransform: 'none' }}>Current</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13.5 }}>{l.teacher_seats}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13.5 }}>{l.student_seats}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13.5 }}>{l.storage_gb} GB</td>
                      </tr>
                    )
                  }),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
