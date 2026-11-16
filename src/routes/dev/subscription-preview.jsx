import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import SubscriptionCostBreakdown from '@/components/subscription/SubscriptionCostBreakdown'
import PaymentOptionPicker from '@/components/subscription/PaymentOptionPicker'
import PaymentConfirmModal from '@/components/subscription/PaymentConfirmModal'
import SubscriptionStatusPanel from '@/components/subscription/SubscriptionStatusPanel'
import {
  fetchDemoQuote, fetchDemoStatus, formatCentavos, markDemoCancelled, startDemoBalanceCheckout, startDemoCheckout,
} from '@/lib/subscriptionPayment'
import { cream, ink, muted, navy, line, heading, red, sansFamily } from '@/theme'

/*
 * /dev/subscription-preview — development builds only (see App.jsx).
 *
 * The real subscription components, on demo data, with no sign-in. Prices
 * come from the local backend's /api/demo-checkout, which only exists when
 * the API runs with DEMO_CHECKOUT_ENABLED and a PayMongo TEST key, and which
 * stores its records in a local file rather than Firestore.
 */

const BLOCK = 40
const card = { background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20 }

function Stepper({ id, label, hint, value, min, max, onChange }) {
  const set = (n) => onChange(Math.max(min, Math.min(max, Number.isFinite(n) ? Math.round(n) : min)))
  const btn = {
    width: 40, height: 40, borderRadius: 10, border: '1.5px solid rgba(14,42,92,0.14)', background: '#FFFFFF',
    color: navy, fontSize: 18, fontWeight: 700, cursor: 'pointer',
  }
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: ink }}>{label}</label>
      {hint ? <span style={{ display: 'block', fontSize: 12.5, color: muted, marginBottom: 6 }}>{hint}</span> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" aria-label={`Decrease ${label}`} style={btn} onClick={() => set(value - 1)} disabled={value <= min}>−</button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          style={{ width: 90, height: 40, textAlign: 'center', borderRadius: 10, border: '1.5px solid rgba(14,42,92,0.14)', fontSize: 15, fontWeight: 600, color: ink, fontFamily: sansFamily }}
        />
        <button type="button" aria-label={`Increase ${label}`} style={btn} onClick={() => set(value + 1)} disabled={value >= max}>+</button>
      </div>
    </div>
  )
}

function friendly(err) {
  if (err?.status === 404) {
    return 'The local demo checkout is not running. Start the API with DEMO_CHECKOUT_ENABLED=true and a PayMongo test key.'
  }
  return err?.message || 'Something went wrong. Try again.'
}

function Configurator() {
  const [plan, setPlan] = useState('institution')
  const [teachers, setTeachers] = useState(10)
  const [blocks, setBlocks] = useState(10)
  const [option, setOption] = useState('half')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const idempotencyKey = useRef(null)
  const [openCount, setOpenCount] = useState(0) // remounts the popup so each opening starts unticked

  const input = {
    plan,
    teacherSeats: plan === 'institution' ? teachers : 1,
    studentCapacity: blocks * BLOCK,
    paymentOption: option,
  }
  const quote = useQuery({
    queryKey: ['demo-checkout-quote', input],
    queryFn: () => fetchDemoQuote(input),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const data = quote.data
  const dueDate = data?.schedule?.balance_due_at_estimate
    ? { seconds: data.schedule.balance_due_at_estimate, estimate: true }
    : null

  function openConfirm() {
    idempotencyKey.current = globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setError(null)
    setOpenCount((n) => n + 1)
    setConfirming(true)
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await startDemoCheckout({ ...input, termsVersion: data.terms.version, idempotencyKey: idempotencyKey.current })
      window.location.assign(res.checkout_url)
    } catch (err) {
      setError(friendly(err))
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20, alignItems: 'start' }}>
      <section aria-label="Choose your plan" style={{ ...card, display: 'grid', gap: 20 }}>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 13.5, fontWeight: 700, color: ink, marginBottom: 8 }}>Plan</legend>
          <div role="radiogroup" style={{ display: 'inline-flex', padding: 4, borderRadius: 12, background: 'rgba(14,42,92,0.06)' }}>
            {[['individual', 'Individual Teacher'], ['institution', 'Institution']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={plan === value}
                onClick={() => setPlan(value)}
                style={{
                  border: 0, borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
                  fontFamily: sansFamily,
                  background: plan === value ? '#FFFFFF' : 'transparent',
                  color: plan === value ? navy : muted,
                  boxShadow: plan === value ? '0 1px 3px rgba(14,42,92,0.15)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {data?.costing.plan === plan ? (
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: muted }}>
              {plan === 'institution'
                ? `${formatCentavos(data.costing.teacher_unit_centavos)} per teacher seat and ${formatCentavos(data.costing.block_unit_centavos)} per 40 students. Minimum 3 teachers.`
                : `One teacher included. ${formatCentavos(data.costing.block_unit_centavos)} per 40 students.`}
            </p>
          ) : null}
        </fieldset>

        {plan === 'institution' ? (
          <Stepper id="teachers" label="Teacher seats" value={teachers} min={3} max={500} onChange={setTeachers} />
        ) : null}
        <Stepper
          id="blocks"
          label="Student blocks"
          hint={`${(blocks * BLOCK).toLocaleString('en-PH')} unique students (40 per block)`}
          value={blocks}
          min={1}
          max={500}
          onChange={setBlocks}
        />
        <PaymentOptionPicker value={option} onChange={setOption} />
      </section>

      <section aria-label="Summary" style={{ ...card, position: 'sticky', top: 20 }}>
        {quote.isError ? (
          <div role="alert" style={{ color: red, fontSize: 13.5 }}>
            {friendly(quote.error)}
            <div style={{ marginTop: 10 }}><Button size="sm" variant="ghost" onClick={() => quote.refetch()}>Try again</Button></div>
          </div>
        ) : !data ? (
          <p role="status" style={{ color: muted, margin: 0 }}>Calculating…</p>
        ) : (
          <>
            <div style={{ opacity: quote.isFetching ? 0.6 : 1, transition: 'opacity 0.15s' }}>
              <SubscriptionCostBreakdown costing={data.costing} schedule={data.schedule} dueDate={dueDate} />
            </div>
            <Button block onClick={openConfirm} disabled={quote.isFetching} style={{ marginTop: 18 }}>
              Proceed to Payment
            </Button>
          </>
        )}
      </section>

      {data ? (
        <PaymentConfirmModal
          key={openCount}
          open={confirming}
          costing={data.costing}
          schedule={data.schedule}
          dueDate={dueDate}
          terms={data.terms}
          busy={busy}
          error={error}
          onBack={() => setConfirming(false)}
          onConfirm={confirm}
        />
      ) : null}
    </div>
  )
}

function DemoStatus({ demoId, result, onReset }) {
  const queryClient = useQueryClient()
  const [simulateDays, setSimulateDays] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const cancelledSent = useRef(false)

  useEffect(() => {
    if (result !== 'cancelled' || cancelledSent.current) return
    cancelledSent.current = true
    markDemoCancelled(demoId)
      .then((view) => queryClient.setQueryData(['demo-checkout-status', demoId, 0], view))
      .catch(() => {})
  }, [demoId, result, queryClient])

  const status = useQuery({
    queryKey: ['demo-checkout-status', demoId, simulateDays],
    queryFn: () => fetchDemoStatus(demoId, simulateDays),
    retry: false,
    // PayMongo can confirm a moment after the redirect: keep asking the
    // server (never trusting the redirect) for a short while.
    refetchInterval: (q) => {
      const view = q.state.data
      const waiting = result === 'success' && view && view.payment.status === 'pending'
      return waiting && q.state.dataUpdateCount < 15 ? 2000 : false
    },
  })
  const view = status.data

  async function payBalance() {
    setBusy(true)
    setError(null)
    try {
      const res = await startDemoBalanceCheckout(demoId)
      window.location.assign(res.checkout_url)
    } catch (err) {
      setError(friendly(err))
      setBusy(false)
    }
  }

  const waiting = result === 'success' && view?.payment.status === 'pending'
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {waiting ? (
        <p role="status" style={{ ...card, margin: 0, color: ink }}>Confirming your payment with PayMongo…</p>
      ) : null}
      {result === 'cancelled' ? (
        <p role="status" style={{ ...card, margin: 0, color: ink }}>You cancelled the payment. Nothing was charged.</p>
      ) : null}
      {status.isError ? <p role="alert" style={{ color: red, margin: 0 }}>{friendly(status.error)}</p> : null}
      {view ? <SubscriptionStatusPanel view={view} onPayBalance={payBalance} busy={busy} /> : null}
      {error ? <p role="alert" style={{ color: red, margin: 0 }}>{error}</p> : null}
      {view ? (
        <section style={{ ...card }}>
          <SubscriptionCostBreakdown
            costing={view.costing}
            schedule={view.schedule}
            dueDate={view.payment.balance_due_at ? { seconds: view.payment.balance_due_at, estimate: false } : null}
          />
        </section>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Button variant="ghost" size="sm" onClick={() => status.refetch()} disabled={status.isFetching}>
          {status.isFetching ? 'Checking…' : 'Check payment status'}
        </Button>
        {view?.payment.remaining_centavos > 0 && view?.subscription.status === 'active' ? (
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, color: muted }}>
            <input type="checkbox" checked={simulateDays > 0} onChange={(e) => setSimulateDays(e.target.checked ? 31 : 0)} />
            Demo: view as 31 days after the first payment
          </label>
        ) : null}
        <Button variant="quiet" size="sm" onClick={onReset}>Start a new demo</Button>
      </div>
    </div>
  )
}

export default function SubscriptionPreview() {
  const [params, setParams] = useSearchParams()
  const demoId = params.get('demo')

  return (
    <div style={{ minHeight: '100vh', background: cream, fontFamily: sansFamily }}>
      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 16px 64px' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ ...heading, fontSize: 28, color: ink, margin: 0 }}>Subscription</h1>
          <p style={{ margin: '6px 0 0', color: muted, fontSize: 14 }}>
            300-day access to ActivKlass. Payments use PayMongo test mode; no real money is charged.
          </p>
        </header>
        {demoId
          ? <DemoStatus demoId={demoId} result={params.get('result')} onReset={() => setParams({})} />
          : <Configurator />}
      </main>
    </div>
  )
}
