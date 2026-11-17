import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import SubscriptionCostBreakdown from '@/components/subscription/SubscriptionCostBreakdown'
import PaymentConfirmModal from '@/components/subscription/PaymentConfirmModal'
import PaymentOptionPicker from '@/components/subscription/PaymentOptionPicker'
import { fetchSubscriptionQuote } from '@/lib/subscription'
import { confirmPayment, legacyQuoteToCosting } from '@/lib/subscriptionPayment'
import { ink, muted, line, red } from '@/theme'

/**
 * The live checkout review: the server's quote, then "Proceed to Payment",
 * then the shared confirmation popup. All amounts come from the backend
 * quote; checkout re-prices from stored seats regardless of what is shown.
 *
 * When the server requires approved Terms that are not configured yet,
 * checkout stays closed (the backend refuses it too) and the page says so
 * in plain words.
 */
export default function SubscriptionQuoteReview({ ownerId, disabled = false, onContinue }) {
  const [confirming, setConfirming] = useState(false)
  const [openCount, setOpenCount] = useState(0)
  const [option, setOption] = useState('full')
  // Pay Now keeps the popup open until the browser leaves for checkout: a
  // refusal is shown beside the button, not rendered off-screen behind a
  // popup that already closed (which read as "Pay Now does nothing").
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  // Read once: the real deadline is set from the verified payment time.
  const [openedAt] = useState(() => Date.now() / 1000)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['subscription-quote', ownerId],
    queryFn: () => fetchSubscriptionQuote(ownerId),
    enabled: Boolean(ownerId),
    retry: false,
  })

  const quote = data?.quote
  // Option B: the server sends its own costing, both payment schedules and
  // the versioned Terms text. Legacy: the per-seat quote, full payment only.
  const optionB = quote?.policy === 'option_b'
  const terms = quote?.terms || { required: false, available: false }
  const termsReady = Boolean(terms.available && terms.version && (terms.url || terms.document))
  const balanceOwed = optionB && quote.outstanding_balance > 0
  const paymentClosed = (Boolean(terms.required) && !termsReady) || balanceOwed
  const costing = !quote ? null : optionB ? quote.costing : legacyQuoteToCosting(quote)
  const schedule = !quote ? null : optionB
    ? quote.payment_options[option]
    : { option: 'full', due_now_centavos: quote.payment_due_php * 100, remaining_centavos: 0 }
  const dueDate = schedule?.remaining_centavos
    ? { seconds: openedAt + 30 * 86400, estimate: true }
    : null
  // A boxed note, so "payment not available" reads as its own message rather
  // than a line squeezed between the breakdown and the button.
  const noteBox = { margin: '24px 0 0', padding: '14px 16px', fontSize: 13.5, color: muted, lineHeight: 1.6, background: 'rgba(14,42,92,0.04)', border: `1px solid ${line}`, borderRadius: 12 }

  return (
    <section aria-label="Subscription price breakdown" style={{ border: `1px solid ${line}`, borderRadius: 16, padding: 'clamp(18px, 3.5vw, 32px)', marginTop: 24, background: '#FFFFFF', color: ink }}>
      <h3 style={{ margin: '0 0 24px', fontSize: 19, fontWeight: 700, color: ink }}>Review your subscription</h3>

      {isLoading ? <p role="status" style={{ fontSize: 13.5, color: muted, margin: 0 }}>Loading your price…</p> : null}

      {isError ? (
        <div role="alert" style={{ fontSize: 13.5, color: red }}>
          {error?.message || 'We could not load your price. Try again.'}
          <div style={{ marginTop: 8 }}>
            <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? 'Loading…' : 'Try again'}
            </Button>
          </div>
        </div>
      ) : null}

      {quote ? (
        <>
          {optionB ? (
            <div style={{ margin: '0 0 28px' }}>
              <PaymentOptionPicker value={option} onChange={setOption} disabled={disabled || balanceOwed} />
            </div>
          ) : null}

          <SubscriptionCostBreakdown costing={costing} schedule={schedule} dueDate={dueDate} />

          {quote.test_mode ? (
            <p style={{ margin: '16px 0 0', fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
              Test mode: payment runs on PayMongo's test environment. No real money is charged.
            </p>
          ) : null}

          {balanceOwed ? (
            <p role="note" style={noteBox}>
              Pay the remaining balance on your current subscription before starting a new term.
            </p>
          ) : paymentClosed ? (
            <p role="note" style={noteBox}>
              Online payment is not available for this account yet. Contact ActivKlass support to activate your subscription.
            </p>
          ) : null}

          <PaymentConfirmModal
            key={openCount}
            open={confirming}
            costing={costing}
            schedule={schedule}
            dueDate={dueDate}
            terms={!termsReady ? null : terms.document || { url: terms.url }}
            busy={paying}
            error={payError}
            onBack={() => setConfirming(false)}
            onConfirm={() => confirmPayment(() => onContinue(quote, optionB ? option : undefined), { setPaying, setPayError })}
          />
        </>
      ) : null}

      <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${line}` }}>
        <Button
          block
          style={{ padding: '16px 24px', fontSize: 16 }}
          onClick={() => { setOpenCount((n) => n + 1); setPayError(''); setConfirming(true) }}
          disabled={!quote || paymentClosed || disabled || isFetching}
        >
          {disabled ? 'Opening checkout…' : 'Proceed to Payment'}
        </Button>
      </div>
    </section>
  )
}
