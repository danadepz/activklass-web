import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import ChangePassword from '@/components/ChangePassword'
import SignOutButton from '@/components/SignOutButton'
import Button from '@/components/ui/Button'
import { changePlan, confirmCheckout, describeSubscription, fetchPlans, fetchSubscription, formatBytes, startCheckout, toMillis } from '@/lib/subscription'
import { acceptInvite, declineInvite, fetchMyInvites, isAbsorbed } from '@/lib/institution'
import { ink, gold, navy, muted, faint, green, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { confirmDialog } from '@/components/ui/dialogs'
import SchoolColleaguesCard from '@/routes/teacher/SchoolColleagues'
import { ID_TYPES } from '@/routes/pending-verification'

const GB = 1024 ** 3
// The same list the registration form and the superadmin queue read, so the
// label the teacher sees here is the one they picked there.
const ID_LABEL = Object.fromEntries(ID_TYPES.map((t) => [t.value, t.label]))

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

/**
 * Name, sign-in, and -- for a teacher who registered on their own -- the ID
 * number they registered with (T-49). The number was checked by a person at
 * approval and is display only: it sits beside the email, greyed, and never
 * enters the form state or the save.
 */
export function ProfileCard() {
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
        {profile.verification_id_number
          ? ' Your ID number is the one we checked when your account was approved.'
          : ''}
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
        {profile.verification_id_number && (
          <label style={{ fontSize: 13, fontWeight: 600, color: muted }}>
            {ID_LABEL[profile.verification_id_type] ?? 'ID'} no.
            <input style={{ ...field, marginTop: 6, background: 'rgba(14,42,92,0.03)' }}
                   value={profile.verification_id_number} disabled />
          </label>
        )}
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

/* ── Subscription ───────────────────────────────────────────────── */

/**
 * Which kind of subscription this account is under, said the same way on
 * every branch of the card below.
 *
 * A tester read the old card as evasive, and she was right: it hedged ("if
 * your school subscribed…") on the one branch where the plan lookup failed,
 * directly above a card naming her school. Nothing about the type needed that
 * lookup -- when it fails, the profile still says whether a school covers this
 * teacher -- so the card states it first, on every branch.
 */
function PlanType({ label, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', margin: '0 0 10px' }}>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
        color: navy, background: 'rgba(14,42,92,0.07)', borderRadius: 20, padding: '3px 10px',
      }}>
        {label}
      </span>
      {detail && <span style={{ fontSize: 12.5, color: muted }}>{detail}</span>}
    </div>
  )
}

/**
 * "Pay for this school year" -- sends the browser to PayMongo's own hosted
 * Checkout page (T-68, test mode: test card numbers, nothing real is ever
 * charged) and back. Only rendered for a subscription this teacher owns and
 * pays for themselves, on a trial or expired -- never a school's plan, which
 * their admin pays for, and never one already active.
 */
function PayButton({ ownerId }) {
  const [err, setErr] = useState('')
  const mut = useMutation({
    mutationFn: () => startCheckout(ownerId),
    onSuccess: (res) => { window.location.href = res.checkout_url },
    onError: (e) => setErr(e.message),
  })
  return (
    <div style={{ marginTop: 12 }}>
      <Button disabled={mut.isPending} onClick={() => { setErr(''); mut.mutate() }}>
        {mut.isPending ? 'Starting payment…' : 'Pay for this school year'}
      </Button>
      <Notice>{err}</Notice>
    </div>
  )
}

// Exported so a test can lock CLAUDE.md's rule against this map without
// having to drive five real polls through useCheckoutReturn's effect.
export const CHECKOUT_BANNER = {
  checking: { bg: 'rgba(14,42,92,0.05)', border: line, color: muted, text: 'Checking your payment…' },
  paid: { bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.3)', color: green, text: 'Payment received — you are subscribed for the school year.' },
  unconfirmed: {
    bg: 'rgba(245,197,24,0.14)', border: 'rgba(245,197,24,0.4)', color: '#8A6D00',
    text: 'We could not confirm the payment yet. If you completed it, refresh in a moment — otherwise nothing was charged.',
  },
  cancelled: { bg: 'rgba(14,42,92,0.05)', border: line, color: muted, text: 'Payment was cancelled — nothing was charged.' },
}

function CheckoutBanner({ state, receipt, dismiss }) {
  if (!state) return null
  const s = CHECKOUT_BANNER[state]
  // T-69: once paid, say what happened to the receipt too -- never left as
  // a silent "did that actually send" guess.
  const receiptLine = state === 'paid' && receipt
    ? (receipt.receiptSentTo
        ? `A receipt was sent to ${receipt.receiptSentTo}.`
        : 'We could not send the receipt — it is on your Account page.')
    : null
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '12px 16px',
      marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 13.5, color: s.color, fontWeight: 600 }}>
        {s.text}
        {receiptLine && <span style={{ display: 'block', fontWeight: 400, marginTop: 3 }}>{receiptLine}</span>}
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
 * The trip back from PayMongo's hosted page. `checkout_ref` in the URL is
 * this account's OWN reference (T-68), minted before the gateway is called
 * -- not PayMongo's session id, which does not exist yet at that point.
 * Polls a few times because a test payment can take a moment to settle,
 * then stops rather than polling forever.
 */
function useCheckoutReturn(ownerId) {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const reference = params.get('checkout_ref')
  const cancelled = params.get('checkout_cancelled')
  const [state, setState] = useState(reference ? 'checking' : cancelled ? 'cancelled' : null)
  const [receipt, setReceipt] = useState(null)

  useEffect(() => {
    if (!reference || !ownerId) return undefined
    let stopped = false
    let attempt = 0
    async function poll() {
      attempt += 1
      try {
        const res = await confirmCheckout(ownerId, reference)
        if (stopped) return
        if (res.status === 'paid') {
          setState('paid')
          // T-69: sent to <email>, or explicitly not sent -- never guessed
          // from silence.
          setReceipt({ receiptSentTo: res.receipt_sent_to ?? null, receiptFailed: !!res.receipt_failed })
          qc.invalidateQueries({ queryKey: ['subscription'] })
          return
        }
      } catch {
        if (stopped) return
      }
      if (attempt < 5) setTimeout(poll, 2000)
      else if (!stopped) setState('unconfirmed')
    }
    poll()
    return () => { stopped = true }
    // reference/ownerId only -- qc is stable, and re-running on every
    // render would restart the poll from attempt 1 forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, ownerId])

  function dismiss() {
    setState(null)
    params.delete('checkout_ref')
    params.delete('checkout_cancelled')
    setParams(params, { replace: true })
  }

  return { state, receipt, dismiss }
}

function SubscriptionCard() {
  const { profile, school } = useAuth()
  const qc = useQueryClient()
  const [err, setErr] = useState('')
  const checkout = useCheckoutReturn(profile.id)

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

  // The same helper the badge and the dashboard box read, so the three cannot
  // drift. It answers from the profile, which means it is still right on the
  // branches below where the plan lookup itself failed.
  const view = describeSubscription({ profile, subscription: data?.subscription ?? null })
  const isSchool = view.kind === 'school'
  const typeLabel = (onSchoolPlan) => (onSchoolPlan ? 'Institution subscription' : 'Individual teacher')
  // school.name is the school's own document; view.detail is the affiliation
  // name carried on the profile, which is all a teacher without one has.
  const schoolName = school?.name || view.detail

  if (isLoading) return <div style={card}><CheckoutBanner {...checkout} /><p style={{ color: faint, margin: 0 }}>Loading subscription…</p></div>

  // A teacher on an institution plan has no subscription of their own -- their
  // school holds it. Which of the two this is comes from the profile, not from
  // the failed lookup, so the card names it instead of covering both.
  if (isError) {
    return (
      <div style={card}>
        <CheckoutBanner {...checkout} />
        <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 8px' }}>Subscription</h2>
        {error?.status !== 404 ? (
          <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
            {error?.message ?? 'Could not load your subscription.'}
          </p>
        ) : isSchool ? (
          <>
            <PlanType label={typeLabel(true)} detail={schoolName} />
            <p style={{ fontSize: 13.5, color: muted, margin: 0, lineHeight: 1.6 }}>
              Your school's administrator manages the plan and the seats for everyone, so there is
              nothing to pay or choose here.
            </p>
          </>
        ) : (
          <>
            <PlanType label={typeLabel(false)} />
            <p style={{ fontSize: 13.5, color: muted, margin: 0, lineHeight: 1.6 }}>
              {view.kind === 'none'
                ? 'There is no subscription on this account, and no institution subscription covering it.'
                : `${view.label} — ${view.detail}. This plan is on your own account, not a school's.`}
            </p>
            {/* No subscriptions doc exists yet -- the self-registered solo
                path, until the first payment creates one (T-68). */}
            {(view.kind === 'trial' || view.kind === 'expired') && <PayButton ownerId={profile.id} />}
          </>
        )}
      </div>
    )
  }

  const { subscription: sub, usage } = data
  const catalogue = plansRes?.plans?.[sub.type] ?? {}
  const trialEndsMs = toMillis(sub.trial_ends_at)
  const trialEndsLabel = trialEndsMs
    ? new Date(trialEndsMs).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  // Absorbed: the school took over the bill, so there is no plan of their own
  // left to show or change. Without this the card would render a cancelled
  // subscription complete with a plan picker, which reads as "your account
  // lapsed" rather than "your school covers this now". `superseded_at` is
  // stamped the same way whether a teacher accepted an invite themselves
  // (api/institution.py) or a superadmin moved them in one batch (T-71) --
  // one field, read here regardless of which path set it.
  if (isAbsorbed(sub)) {
    const since = toMillis(sub.superseded_at)
    const sinceLabel = since
      ? new Date(since).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : null
    return (
      <div style={card}>
        <CheckoutBanner {...checkout} />
        <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 8px' }}>Subscription</h2>
        <PlanType
          label="Institution subscription"
          detail={sinceLabel ? `Under ${schoolName}'s subscription since ${sinceLabel}` : schoolName}
        />
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
      <CheckoutBanner {...checkout} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 8px' }}>Your subscription</h2>
          {/* A record loaded, so its own type is the fact -- not the profile's
              school_id. A school-issued teacher may still hold a plan of their
              own, and calling that "institution" would contradict the plan
              picker sitting right under it. */}
          <PlanType label={typeLabel(sub.type === 'institution')}
                    detail={sub.type === 'institution' ? schoolName : null} />
          {sub.status === 'trial' && trialEndsLabel && (
            <p style={{ fontSize: 13, color: muted, margin: 0 }}>
              Trial ends {trialEndsLabel}
            </p>
          )}
          {/* A subscriptions doc exists but is still trial/expired -- an
              admin-provisioned trial, or a first Pay attempt that was never
              completed (T-68). Never for an institution: the school's admin
              pays for it, not this teacher's own screen. */}
          {sub.type !== 'institution' && (sub.status === 'trial' || sub.status === 'expired') && (
            <PayButton ownerId={profile.id} />
          )}
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


function SignOutCard() {
  return (
    <div style={{ ...card, padding: '14px 18px', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>Sign out</h2>
        <p style={{ fontSize: 13, color: muted, margin: '2px 0 0' }}>
          End your session on this device. You will be asked to confirm first.
        </p>
      </div>
      <SignOutButton
        style={{
          padding: '9px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: sans,
          color: '#FAFAF6', background: red, border: 'none', borderRadius: 10, cursor: 'pointer',
          flexShrink: 0,
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
    <div style={{ display: 'grid', gap: 22, maxWidth: 860, margin: '0 auto', width: '100%' }}>
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
      <SchoolColleaguesCard />
      <SignOutCard />
    </div>
  )
}
