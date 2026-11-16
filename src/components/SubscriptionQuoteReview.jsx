import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import SubscriptionCostBreakdown from '@/components/subscription/SubscriptionCostBreakdown'
import PaymentConfirmModal from '@/components/subscription/PaymentConfirmModal'
import { fetchSubscriptionQuote } from '@/lib/subscription'
import { legacyQuoteToCosting } from '@/lib/subscriptionPayment'
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

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['subscription-quote', ownerId],
    queryFn: () => fetchSubscriptionQuote(ownerId),
    enabled: Boolean(ownerId),
    retry: false,
  })

  const quote = data?.quote
  const terms = quote?.terms || { required: false, available: false }
  const termsReady = Boolean(terms.available && terms.version && terms.url)
  const paymentClosed = Boolean(terms.required) && !termsReady
  const costing = quote ? legacyQuoteToCosting(quote) : null
  const schedule = quote
    ? { option: 'full', due_now_centavos: quote.payment_due_php * 100, remaining_centavos: 0 }
    : null

  return (
    <section aria-label="Subscription price breakdown" style={{ border: `1px solid ${line}`, borderRadius: 16, padding: 20, marginTop: 16, background: '#FFFFFF', color: ink }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: ink }}>Review your subscription</h3>

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
          <SubscriptionCostBreakdown costing={costing} schedule={schedule} />

          {paymentClosed ? (
            <p role="note" style={{ margin: '16px 0 0', fontSize: 13.5, color: muted, lineHeight: 1.5 }}>
              Online payment is not available for this account yet. Contact ActivKlass support to activate your subscription.
            </p>
          ) : null}

          <PaymentConfirmModal
            key={openCount}
            open={confirming}
            costing={costing}
            schedule={schedule}
            terms={termsReady ? { url: terms.url } : null}
            onBack={() => setConfirming(false)}
            onConfirm={() => { setConfirming(false); onContinue(quote) }}
          />
        </>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
        <Button
          onClick={() => { setOpenCount((n) => n + 1); setConfirming(true) }}
          disabled={!quote || paymentClosed || disabled || isFetching}
        >
          {disabled ? 'Opening PayMongo…' : 'Proceed to Payment'}
        </Button>
      </div>
    </section>
  )
}
