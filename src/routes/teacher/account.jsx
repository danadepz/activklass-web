import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import ChangePassword from '@/components/ChangePassword'
import SignOutButton from '@/components/SignOutButton'
import Button from '@/components/ui/Button'
import {
  changePlan, confirmSeatIncrease, describeSubscription, fetchPlans, fetchSubscription,
  formatDecimalBytes, recordTermsAcceptance, startCheckout, startSeatIncreaseCheckout, toMillis, useCheckoutReturn,
} from '@/lib/subscription'
import SubscriptionQuoteReview from '@/components/SubscriptionQuoteReview'
import InstallmentStatus from '@/components/subscription/InstallmentStatus'
import SubscriptionExpiry from '@/components/SubscriptionExpiry'
import { acceptInvite, declineInvite, fetchMyInvites, isAbsorbed } from '@/lib/institution'
import { linkError, nameError, verificationIdError } from '@/lib/validation'
import { ink, gold, navy, muted, faint, green, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { confirmDialog } from '@/components/ui/dialogs'
import SchoolColleaguesCard from '@/routes/teacher/SchoolColleagues'
import { ID_TYPES } from '@/routes/pending-verification'

const GB = 1_000_000_000
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

function Meter({ label, used, total, over, resourceType = 'seats' }) {
  const numericUsed = typeof used === 'number' ? used : null
  const numericTotal = typeof total === 'number' ? total : null
  const isOver = Boolean(over || (numericTotal != null && numericUsed != null && numericUsed > numericTotal))
  const overCount = isOver && numericUsed != null && numericTotal != null ? numericUsed - numericTotal : 0
  const available = numericTotal != null && numericUsed != null ? Math.max(0, numericTotal - numericUsed) : null
  const pct = numericTotal && numericUsed != null ? Math.round((numericUsed / numericTotal) * 100) : null
  const barPct = pct != null ? Math.min(100, pct) : null

  const isExhausted = isOver || (numericTotal != null && numericUsed != null && numericUsed === numericTotal)
  const isCritical = !isExhausted && pct != null && pct >= 90
  const isWarning = !isExhausted && !isCritical && pct != null && pct >= 80

  const barColor = isOver ? '#D97706' : isExhausted ? '#EA580C' : isCritical ? '#EA580C' : isWarning ? '#D97706' : green
  const amberTone = '#B45309'

  const secondaryLabel = isOver
    ? `${overCount} over plan`
    : available != null
      ? `${available} available`
      : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{label}</span>
        <span style={{ fontSize: 12.5, color: isOver || isExhausted ? amberTone : isCritical ? '#EA580C' : muted, fontVariantNumeric: 'tabular-nums' }}>
          <strong>{used}</strong> of {total == null ? 'unlimited' : total} used
          {secondaryLabel && (
            <span style={{ fontSize: 11.5, marginLeft: 6, color: isOver ? amberTone : muted, fontWeight: isOver ? 600 : 400 }}>
              ({secondaryLabel})
            </span>
          )}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={numericUsed ?? 0}
        aria-valuemin={0}
        aria-valuemax={numericTotal ?? 100}
        aria-valuetext={secondaryLabel ? `${used} of ${total ?? 'unlimited'}, ${secondaryLabel}` : `${used} of ${total ?? 'unlimited'}`}
        style={{ height: 8, borderRadius: 99, background: 'rgba(14,42,92,0.08)', overflow: 'hidden' }}
      >
        {barPct != null && (
          <div style={{ width: `${barPct}%`, height: '100%', background: barColor, transition: 'width .25s' }} />
        )}
      </div>

      {isWarning && (
        <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 5, lineHeight: 1.4 }}>
          <strong>80% capacity reached:</strong> Approaching student limit. Existing learners and classes remain fully active.
        </div>
      )}

      {isCritical && (
        <div style={{ fontSize: 11.5, color: '#EA580C', marginTop: 5, lineHeight: 1.4, fontWeight: 600 }}>
          <strong>90% capacity reached:</strong> High student seat utilization. Consider adding student seats soon.
        </div>
      )}

      {isOver && (
        <div style={{
          fontSize: 11.5,
          color: amberTone,
          background: 'rgba(217, 119, 6, 0.08)',
          border: '1px solid rgba(217, 119, 6, 0.25)',
          borderRadius: 8,
          padding: '8px 12px',
          marginTop: 6,
          lineHeight: 1.4,
        }}>
          <strong>Over plan limit ({pct}% used):</strong> {overCount} seats over your plan. Existing students and classes retain full access — no one will be locked out or deleted. Capacity is informational and new enrollments are not blocked while subscription-wide enforcement is disabled (plan upgrade recommended).
          <div style={{ fontSize: 11, marginTop: 3 }}>
            No automatic charges or data deletions will ever occur.
          </div>
        </div>
      )}

      {!isOver && isExhausted && (
        <div style={{
          fontSize: 11.5,
          color: amberTone,
          background: 'rgba(217, 119, 6, 0.08)',
          border: '1px solid rgba(217, 119, 6, 0.25)',
          borderRadius: 8,
          padding: '8px 12px',
          marginTop: 6,
          lineHeight: 1.4,
        }}>
          <strong>Seat limit reached (100%):</strong> Existing students and classes retain full access. Capacity is informational and new enrollments are not blocked while subscription-wide enforcement is disabled (plan upgrade recommended).
          <div style={{ fontSize: 11, marginTop: 3 }}>
            No automatic charges or data deletions will ever occur.
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Update Profile ─────────────────────────────────────────────── */

/**
 * What Save profile writes, or the error to show instead -- pulled out of
 * the submit handler so it can be tested without rendering (T-112): the
 * trap in a form-save test is asserting the input renders rather than that
 * the typed value reaches the write, so this pure function IS the write.
 * middle_name is optional and nulled (not omitted) when blank, so clearing
 * an existing middle name on save actually clears it rather than leaving
 * the old value in place.
 */
export function profileUpdatePayload(form) {
  if (!form.first_name.trim() || !form.last_name.trim()) {
    return { error: 'First and last name are required.' }
  }
  const middleNameMsg = nameError(form.middle_name, { label: 'Middle name', required: false })
  if (middleNameMsg) return { error: middleNameMsg }
  return {
    fields: {
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim() || null,
      last_name: form.last_name.trim(),
    },
  }
}

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
    middle_name: profile.middle_name ?? '',
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
    const result = profileUpdatePayload(form)
    if (result.error) {
      setMsg(''); setErr(result.error); return
    }
    mut.mutate(result.fields)
  }

  return (
    <form onSubmit={submit} style={card}>
      <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 4px' }}>Your Profile</h2>
      <p style={{ fontSize: 13, color: muted, margin: '0 0 16px' }}>
        Your name as students and parents see it. Your email is your sign-in and cannot be changed here.
        {profile.verification_id_number
          ? ' Your ID number is the one we checked when your account was approved.'
          : ''}
      </p>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          First Name
          <input style={{ ...field, marginTop: 6 }} value={form.first_name}
                 onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Middle Name <span style={{ color: muted, fontWeight: 400 }}>(Optional)</span>
          <input style={{ ...field, marginTop: 6 }} value={form.middle_name}
                 onChange={(e) => setForm((f) => ({ ...f, middle_name: e.target.value }))} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Last Name
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
          {mut.isPending ? 'Saving…' : 'Save Profile'}
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
  const { isSuperAdmin } = useAuth()
  const mut = useMutation({
    mutationFn: async ({ pricingVersion, totalPhp, termsVersion, paymentOption }) => {
      let termsAcceptanceId
      if (termsVersion) {
        const acceptance = await recordTermsAcceptance(ownerId, { termsVersion })
        termsAcceptanceId = acceptance.acceptance_id
      }
      return startCheckout(ownerId, {
        quoteReviewed: true, pricingVersion, quoteTotalPhp: totalPhp,
        termsVersion, termsAcceptanceId, paymentOption,
      })
    },
    // A refusal is shown inside the confirm popup (SubscriptionQuoteReview).
    onSuccess: (res) => { window.location.href = res.checkout_url },
  })
  return (
    <div style={{ marginTop: 12 }}>
      <SubscriptionQuoteReview ownerId={ownerId} disabled={mut.isPending} isSuperAdmin={isSuperAdmin} showOptionBComparison onContinue={(quote, paymentOption) => mut.mutateAsync({ pricingVersion: quote.pricing_version, totalPhp: quote.total_contract_php, termsVersion: quote.terms?.available ? quote.terms.version : undefined, paymentOption })} />
    </div>
  )
}

/**
 * "Add student seats" -- a mid-year top-up on an already-active solo plan,
 * the one state `PayButton` above never covers. The one teacher seat on a
 * solo plan is fixed and never offered here (the backend refuses a change to
 * it too); only student seats grow, and only upward -- a decrease routes to
 * ActivKlass support, the same rule `change_plan` already enforces for a
 * full plan change.
 */
function AddStudentSeatsControl({ ownerId, currentSeats, paidThroughMs }) {
  const floor = currentSeats ?? 0
  const [value, setValue] = useState(String(floor))
  const [err, setErr] = useState('')
  const mut = useMutation({
    mutationFn: ({ studentSeats, amount, pricingVersion }) => startSeatIncreaseCheckout(ownerId, { studentSeats, quoteTotalPhp: amount, pricingVersion }),
    onSuccess: (res) => { window.location.href = res.checkout_url },
    onError: (e) => setErr(e.message),
  })

  async function submit() {
    setErr('')
    const nextValue = Number.parseInt(value, 10)
    const next = await confirmSeatIncrease({
      ownerId,
      current: { studentSeats: floor },
      next: { studentSeats: nextValue },
      onError: setErr,
    })
    if (next) mut.mutate(next)
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${line}` }}>
      <label style={{ fontSize: 12.5, fontWeight: 600, color: ink, display: 'block', marginBottom: 5 }}>
        Add Student Seats
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="number" min={floor + 1} step={1} value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="New student seat total"
          style={{ ...field, width: 110 }}
        />
        <Button disabled={mut.isPending} onClick={submit}>
          {mut.isPending ? 'Starting payment…' : 'Add seats'}
        </Button>
      </div>
      <p style={{ fontSize: 12, color: faint, margin: '8px 0 0', lineHeight: 1.5 }}>
        Billed only for the months left until your plan renews, and the new seats renew on that
        same date. They're available as soon as payment is confirmed. To reduce seats, contact
        ActivKlass support.
      </p>
      <Notice>{err}</Notice>
    </div>
  )
}

// Exported so a test can lock CLAUDE.md's rule against this map without
// having to drive five real polls through useCheckoutReturn's effect.
export const CHECKOUT_BANNER = {
  checking: { bg: 'rgba(14,42,92,0.05)', border: line, color: muted, text: 'Checking your payment…' },
  paid: { bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.3)', color: green, text: 'Payment received — you are subscribed for the school year.' },
  // T-?: a seat top-up is not a renewal, so it gets its own text rather than
  // claiming a subscription event that did not happen.
  seatsAdded: { bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.3)', color: green, text: 'Payment received — your new seats are now available.' },
  balancePaid: { bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.3)', color: green, text: 'Payment received — your remaining balance is paid. Nothing more is due this term.' },
  unconfirmed: {
    bg: 'rgba(245,197,24,0.14)', border: 'rgba(245,197,24,0.4)', color: '#8A6D00',
    text: 'Payment is still unconfirmed by the server. If you completed it, refresh in a moment; do not assume it succeeded.',
  },
  attempt_failed: { bg: 'rgba(245,197,24,0.14)', border: 'rgba(245,197,24,0.4)', color: '#8A6D00', text: 'The provider reported a failed attempt. The checkout may still be retryable; payment has not been confirmed.' },
  expired: { bg: 'rgba(14,42,92,0.05)', border: line, color: muted, text: 'The payment provider reports that this checkout session expired. Start a new checkout if you still want to subscribe.' },
  unverified_return: { bg: 'rgba(245,197,24,0.14)', border: 'rgba(245,197,24,0.4)', color: '#8A6D00', text: 'This page was returned from checkout, but no payment reference was provided. Payment status is unverified.' },
}

function CheckoutBanner({ state, receipt, dismiss }) {
  if (!state) return null
  const seatIncrease = state === 'paid' && receipt?.kind === 'seat_increase'
  const balancePaid = state === 'paid' && receipt?.kind === 'installment_balance'
  const s = CHECKOUT_BANNER[seatIncrease ? 'seatsAdded' : balancePaid ? 'balancePaid' : state]
  // T-69: once paid, say what happened to the receipt too -- never left as
  // a silent "did that actually send" guess. The balance payment has its own receipt.
  const receiptLine = state === 'paid' && receipt
    ? (receipt.receiptSentTo
        ? `A receipt was sent to ${receipt.receiptSentTo}.`
        : 'We could not send the receipt — it is on your Account page.')
    : null
  const seatsLine = seatIncrease && receipt.newLimits
    ? `You now have ${receipt.newLimits.student_seats} student seat${receipt.newLimits.student_seats === 1 ? '' : 's'}.`
    : null
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '12px 16px',
      marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 13.5, color: s.color, fontWeight: 600 }}>
        {s.text}
        {seatsLine && <span style={{ display: 'block', fontWeight: 400, marginTop: 3 }}>{seatsLine}</span>}
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

/* The backend opens a solo checkout only to a verified teacher
   (subscriptions._payment_refusal); this mirrors it so the button never
   leads to a refusal. Wording matches the server's.

   An account made before ID checks existed, or provisioned by a Super Admin,
   has no verification_status, and the /pending-verification gate never sees
   it. It verifies here instead, with the same fields that page uses, tagged
   verification_context: 'payment' so ProtectedRoute keeps its classes open
   while the review is pending and the Super Admin's approval does not restart
   a trial. Only the superadmin claim can write 'approved' (firestore.rules). */
export const PAYMENT_VERIFICATION = 'payment'
const paymentNote = { fontSize: 13, color: muted, margin: '12px 0 0', lineHeight: 1.6 }

function PaymentLocked({ profile }) {
  const { refreshProfile } = useAuth()
  const status = profile.verification_status
  const [idType, setIdType] = useState(profile.verification_id_type ?? ID_TYPES[0].value)
  const [idNumber, setIdNumber] = useState(profile.verification_id_number ?? '')
  const [idLink, setIdLink] = useState(profile.verification_id_link ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (profile.school_request_pending) {
    return <p style={paymentNote}>Your school&apos;s request is still being reviewed. Your school can subscribe once ActivKlass approves it.</p>
  }
  if (status && profile.verification_context !== PAYMENT_VERIFICATION) {
    return <p style={paymentNote}>Payment opens once ActivKlass has verified your teacher account.</p>
  }
  if (status === 'pending') {
    return (
      <p style={paymentNote}>
        Your ID is with the ActivKlass team. Payment opens once it is approved — your classes and
        records stay open in the meantime.
      </p>
    )
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    const problem = verificationIdError(idNumber, idType) || linkError(idLink)
    if (problem) { setError(problem); return }
    setBusy(true)
    try {
      // Moving one's own status to 'pending' is allowed; only the review approves.
      await updateDoc(doc(db, 'users', profile.id), {
        verification_status: 'pending',
        verification_context: PAYMENT_VERIFICATION,
        verification_id_type: idType,
        verification_id_number: idNumber.trim(),
        verification_id_link: idLink.trim(),
        verification_submitted_at: serverTimestamp(),
      })
      await refreshProfile()
    } catch {
      setError('Could not send that. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} aria-label="Verify your identity to subscribe" style={{ marginTop: 14, display: 'grid', gap: 12 }}>
      <p style={{ ...paymentNote, margin: 0 }}>
        {status === 'rejected'
          ? 'We could not verify the ID you sent. Fix it and send it again — your classes and records stay open.'
          : 'Before you can pay, ActivKlass verifies every individual teacher’s identity. Send a teacher ID for review — your classes and records stay open while we check.'}
      </p>
      {status === 'rejected' && profile.verification_note ? (
        <Notice tone="error"><strong>From the reviewer:</strong> {profile.verification_note}</Notice>
      ) : null}
      <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
        ID type
        <select style={{ ...field, marginTop: 6, cursor: 'pointer' }} value={idType} onChange={(e) => setIdType(e.target.value)}>
          {ID_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
        ID number
        <input style={{ ...field, marginTop: 6 }} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
      </label>
      <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
        Link to a photo of the ID
        <input style={{ ...field, marginTop: 6 }} type="url" placeholder="https://drive.google.com/…" value={idLink} onChange={(e) => setIdLink(e.target.value)} />
        <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: faint, marginTop: 6 }}>
          Share the photo from Google Drive or OneDrive with “anyone with the link”.
        </span>
      </label>
      <Notice>{error}</Notice>
      <div><Button type="submit" disabled={busy}>{busy ? 'Sending…' : status === 'rejected' ? 'Send again' : 'Send for review'}</Button></div>
    </form>
  )
}

function SubscriptionCard() {
  const { profile, school, isSuperAdmin } = useAuth()
  const verified = profile.verification_status === 'approved'
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
            {(view.kind === 'trial' || view.kind === 'expired') &&
              (verified ? <PayButton ownerId={profile.id} /> : <PaymentLocked profile={profile} />)}
          </>
        )}
      </div>
    )
  }

  const { subscription: sub, usage, resource_usage: resourceUsage } = data
  const catalogue = plansRes?.plans?.[sub.type] ?? {}
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
      {sub.type !== 'institution' && data.installment ? (
        <div style={{ marginBottom: 18 }}>
          <InstallmentStatus ownerId={profile.id} subscription={sub} installment={data.installment} />
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 8px' }}>Your Subscription</h2>
          {/* A record loaded, so its own type is the fact -- not the profile's
              school_id. A school-issued teacher may still hold a plan of their
              own, and calling that "institution" would contradict the plan
              picker sitting right under it. */}
          <PlanType label={typeLabel(sub.type === 'institution')}
                    detail={sub.type === 'institution' ? schoolName : null} />
          {sub.status === 'trial' && (
            <SubscriptionExpiry label="Trial ends" expiresAt={sub.trial_ends_at} />
          )}
          {sub.status === 'active' && (
            <SubscriptionExpiry
              label="Paid through"
              expiresAt={sub.paid_through}
              style={{ marginTop: 4 }}
            />
          )}
          {sub.status === 'active' && sub.paid_through && (
            <p style={{ fontSize: 12, color: faint, margin: '3px 0 0' }}>
              Early renewal preserves remaining days.
            </p>
          )}
          {/* A subscriptions doc exists but is still trial/expired -- an
              admin-provisioned trial, or a first Pay attempt that was never
              completed (T-68). Never for an institution: the school's admin
              pays for it, not this teacher's own screen. */}
          {sub.type !== 'institution' && (sub.status === 'trial' || sub.status === 'expired') && (
            verified ? <PayButton ownerId={profile.id} /> : <PaymentLocked profile={profile} />
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
          {/* change_plan is superadmin-only on the server; for anyone else this
              could only ever answer "handled by support". */}
          {isSuperAdmin && <div style={{ marginTop: 10 }}>
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
          </div>}
        </div>
      </div>

      {sub.type !== 'institution' && sub.status === 'active' && !verified && <PaymentLocked profile={profile} />}
      {sub.type !== 'institution' && sub.status === 'active' && verified && (
        <AddStudentSeatsControl
          ownerId={profile.id}
          currentSeats={sub.limits?.student_seats}
          paidThroughMs={toMillis(sub.paid_through)}
        />
      )}

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
                    marginTop: 20 }}>
        <Meter label="Student seats" used={usage.students.used} total={usage.students.seats}
               over={usage.students.over} resourceType="seats" />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: ink, marginBottom: 4 }}>Storage</div>
          <div style={{ fontSize: 13, color: ink, fontWeight: 600, marginBottom: 2 }}>
            {sub.limits?.storage_gb ? `${sub.limits.storage_gb} GB capacity` : 'Standard storage'}
          </div>
          <div style={{ fontSize: 12, color: muted, lineHeight: 1.45 }}>
            Upload limit: 5–25 MB per file · Usage not tracked individually
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 18,
        padding: 14,
        background: 'rgba(14,42,92,0.03)',
        border: `1px solid ${line}`,
        borderRadius: 10,
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: navy, marginBottom: 10 }}>
          Resource allowances &amp; policy
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, fontSize: 12, color: ink }}>
          <div>
            <div style={{ color: muted, fontSize: 11, marginBottom: 2 }}>AI Credits</div>
            <span>
              {resourceUsage?.ai_credits?.status === 'available_estimated' && (resourceUsage?.ai_credits?.remaining ?? 0) <= 0
                ? '0 credits remaining (Exhausted)'
                : resourceUsage?.ai_credits?.granted
                  ? `${Number(resourceUsage.ai_credits.remaining ?? resourceUsage.ai_credits.granted).toLocaleString()} credits available`
                  : 'Not included in your plan. Standard daily AI limits apply.'}
            </span>
          </div>
          <div>
            <div style={{ color: muted, fontSize: 11, marginBottom: 2 }}>Teacher Daily Generations</div>
            <span>200 AI generations per day</span>
          </div>
          <div>
            <div style={{ color: muted, fontSize: 11, marginBottom: 2 }}>Student Daily Explanations</div>
            <span>Standard Daily Limit per Student</span>
          </div>
        </div>

        <details
          open={Boolean(usage.students.over)}
          style={{ marginTop: 12, borderTop: `1px solid ${line}`, paddingTop: 8 }}
        >
          <summary style={{ fontSize: 12, fontWeight: 600, color: navy, cursor: 'pointer', userSelect: 'none' }}>
            How Limits Work
          </summary>
          <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.5, marginTop: 6 }}>
            <p style={{ margin: '0 0 4px' }}>
              <strong>Going over your limit won&apos;t lock anyone out or delete data.</strong>
            </p>
            <p style={{ margin: '0 0 4px' }}>
              At seat limit, existing students retain full class access and capacity is informational while subscription-wide enforcement is disabled.
            </p>
            <p style={{ margin: '0 0 4px' }}>
              At AI limits, non-AI academic features (gradebooks, rosters, attendance) remain fully operational.
            </p>
            <p style={{ margin: 0 }}>
              No automatic charges or data deletions will ever occur.
            </p>
          </div>
        </details>
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
                  confirmLabel: 'Join the School',
                })) accept.mutate(inv.id)
              }}
            >
              Join the School
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
        <h2 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>Sign Out</h2>
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
