import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSubscriptionQuote } from '@/lib/subscription'
import OptionBDemoQuote from '@/components/OptionBDemoQuote'

const php = (value) => Number.isFinite(value) ? `₱${value.toLocaleString('en-PH')}` : 'Unavailable'

const actionStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 42,
  padding: '10px 18px',
  border: 0,
  borderRadius: 8,
  background: '#0E2A5C',
  color: '#FFFFFF',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 32,
  padding: '6px 12px',
  border: '1px solid #C4CBD8',
  borderRadius: 6,
  background: '#F8FAFC',
  color: '#0E2A5C',
  font: 'inherit',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
}

/**
 * Displays an authoritative backend-calculated quote, resource allowances,
 * itemized financial breakdown, and distinct Terms / Quote acknowledgments.
 *
 * All amounts come strictly from the server quote; the frontend performs no price math.
 */
export default function SubscriptionQuoteReview({ ownerId, disabled = false, onContinue }) {
  const [quoteReviewed, setQuoteReviewed] = useState(false)
  const [termsAcknowledged, setTermsAcknowledged] = useState(false)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['subscription-quote', ownerId],
    queryFn: () => fetchSubscriptionQuote(ownerId),
    enabled: Boolean(ownerId),
    retry: false,
  })

  const quote = data?.quote
  const isInstitution = quote?.subscription_type === 'institution'
  const termsConfig = quote?.terms || { required: false, available: false, version: null, url: null, status: 'not_required' }
  const isTermsRequired = Boolean(termsConfig.required)
  const isTermsAvailable = Boolean(termsConfig.available && termsConfig.version && termsConfig.url)
  const isCommercialBlocked = isTermsRequired && !isTermsAvailable


  const isReadyToPay =
    quoteReviewed &&
    termsAcknowledged &&
    !isCommercialBlocked &&
    !disabled &&
    !isLoading &&
    !isError &&
    Boolean(quote)

  return (
    <section
      aria-label="Subscription price breakdown"
      style={{
        border: '1px solid #D8DEE9',
        borderRadius: 12,
        padding: 20,
        marginTop: 16,
        background: '#FFFFFF',
        color: '#0A1733',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0E2A5C' }}>
          Review subscription details
        </h3>
        {quote && (
          <span style={{ fontSize: 11.5, background: '#EFF3F9', color: '#3A4A6B', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>
            Quote v: {quote.pricing_version}
          </span>
        )}
      </div>

      {isLoading && (
        <p style={{ fontSize: 13.5, color: '#5A6A85', margin: '12px 0' }}>
          Loading the server-calculated quote…
        </p>
      )}

      {isError && (
        <div role="alert" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: 12, margin: '12px 0' }}>
          <p style={{ color: '#B91C1C', fontSize: 13, margin: 0, fontWeight: 600 }}>
            {error?.message || 'We could not load the current quote. Refresh before continuing.'}
          </p>
          <button type="button" onClick={() => refetch()} style={{ ...secondaryBtnStyle, marginTop: 8 }}>
            {isFetching ? 'Reloading…' : 'Reload Quote'}
          </button>
        </div>
      )}

      {quote && (
        <>
          <OptionBDemoQuote
            subscriptionType={quote.subscription_type}
            teacherSeats={quote.teacher_seats}
            studentCapacity={quote.student_capacity}
          />
          <div role="note" style={{ fontSize: 11.5, color: '#64748B', margin: '10px 0' }}>
            The demo package above is read-only. The payment breakdown and button below use only the active backend checkout quote.
          </div>
          {/* 1. Subscription Details */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: '#0E2A5C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Subscription Details
            </h4>
            <div style={{ fontSize: 13, color: '#1E293B', lineHeight: 1.55 }}>
              <p style={{ margin: '2px 0' }}>
                <strong>Plan type:</strong> {isInstitution ? 'Institution subscription' : 'Solo teacher subscription'}
              </p>
              <p style={{ margin: '2px 0' }}>
                <strong>Authorized capacity:</strong> {quote.teacher_seats} teacher seat{quote.teacher_seats > 1 ? 's' : ''} · {Number(quote.student_capacity).toLocaleString()} unique student seats
              </p>
              <p style={{ margin: '2px 0' }}>
                <strong>Student blocks:</strong> {quote.student_blocks ? `${quote.student_blocks.included} included / ${quote.student_blocks.additional} additional blocks` : 'Standard seat schedule (40-student block packages unconfigured in live quotes)'}
              </p>
              <p style={{ margin: '2px 0' }}>
                <strong>Duration & activation:</strong> {quote.term_days} days. Activation follows verified PayMongo payment.
              </p>
              <p style={{ margin: '2px 0', fontSize: 12, color: '#475569' }}>
                <strong>Term schedule:</strong> Starts upon confirmed payment timestamp; valid for {quote.term_days} days. Early renewal preserves remaining term days (<code>paid_through = max(existing_paid_through, payment_time) + 300 days</code>); mid-year seat increases prorate to the existing renewal date without extending it.
              </p>
            </div>
          </div>

          {/* 2. Resource Allowances */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: '#0E2A5C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Resource Allowances
            </h4>
            <ul style={{ fontSize: 12.5, lineHeight: 1.6, paddingLeft: 18, margin: 0, color: '#334155' }}>
              <li>
                <strong>AI credits: unavailable / not configured</strong> {quote.entitlements?.ai_credits?.granted ? `(${Number(quote.entitlements.ai_credits.granted).toLocaleString()} credits)` : '(governed by standard daily user quotas; proposal packages unactivated)'}
              </li>
              <li>
                <strong>Teacher and student daily AI limits: unavailable / not configured</strong> (standard daily user policies apply)
              </li>
              <li>
                <strong>Teacher daily AI generations:</strong> {quote.entitlements?.teacher_daily_generations?.limit ? `${quote.entitlements.teacher_daily_generations.limit} per day` : 'standard daily policy (unconfigured in quote)'}
              </li>
              <li>
                <strong>Student daily AI explanations:</strong> {quote.entitlements?.student_daily_explanations?.limit ? `${quote.entitlements.student_daily_explanations.limit} per day` : 'standard daily policy (unconfigured in quote)'}
              </li>
              {isInstitution && (
                <li>
                  <strong>Shared institutional credit allowance:</strong> unavailable / not configured (teachers and students operate under individual daily allocations)
                </li>
              )}
              <li>
                <strong>File storage allowance:</strong> {quote.entitlements?.storage?.gb == null ? 'not available in this quote' : `${quote.entitlements.storage.gb} GB`} (per-file upload limits enforced by security rules; tenant-wide metering unprovisioned)
              </li>
              <li style={{ color: '#475569', marginTop: 4 }}>
                <strong>Explanation of credit consumption:</strong> When configured, AI credits meter generative operations (quiz generation, essay grading, student explanations). Non-AI features (gradebooks, rosters, attendance, syllabus) consume zero credits and remain accessible even if AI limits are reached.
              </li>
            </ul>
          </div>

          {/* 3. Financial Breakdown */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0E2A5C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active checkout · current legacy policy
            </h4>
            <div role="note" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 7, padding: 9, marginBottom: 10, fontSize: 12, color: '#1E3A8A' }}>
              Payment notice: this breakdown is the backend quote ({quote.pricing_version}). If the backend amount or policy changes before checkout, checkout is rejected until you review a fresh quote. Option B demo previews cannot start PayMongo checkout.
            </div>
            {quote.line_items.map((item) => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, margin: '6px 0', fontSize: 13 }}>
                <span style={{ color: '#334155' }}>
                  {item.quantity.toLocaleString()} × {php(item.unit_price_php)} {item.key === 'teacher_seats' ? 'per teacher seat' : 'per student seat'}
                </span>
                <strong style={{ color: '#0F172A' }}>{php(item.subtotal_php)}</strong>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0', fontSize: 12.5, color: '#64748B' }}>
              <span>Additional capacity charges</span>
              <span>None</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0', fontSize: 12.5, color: '#64748B' }}>
              <span>Taxes / fees</span>
              <span>{quote.tax_php != null ? php(quote.tax_php) : 'Unverified / not assessed in quote'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0', fontSize: 12.5, color: '#64748B' }}>
              <span>Contract total (300 days)</span>
              <span>{php(quote.total_contract_php ?? quote.payment_due_php)}</span>
            </div>
            <hr style={{ border: 0, borderTop: '1px solid #CBD5E1', margin: '10px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
              <strong style={{ color: '#0E2A5C' }}>Total due today</strong>
              <strong style={{ color: '#0E2A5C', fontSize: 17 }}>{php(quote.payment_due_php)}</strong>
            </div>
            <p style={{ fontSize: 12, color: '#64748B', margin: '8px 0 0', lineHeight: 1.45 }}>
              <strong>Payment terms:</strong> {quote.payment_terms || 'Full payment; subscription activation follows verified payment. No automatic recurring debit.'}
            </p>
          </div>

          {/* 4. Terms and Conditions & Legal Status */}
          {isCommercialBlocked ? (
            <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Commercial Checkout Blocked
              </h4>
              <p style={{ fontSize: 12, lineHeight: 1.5, color: '#991B1B', margin: '0 0 6px' }}>
                Approved subscription Terms and Conditions are required for commercial activation but are not yet configured or published. Payment cannot proceed until approved Terms are configured.
              </p>
              <p style={{ fontSize: 11.5, color: '#7F1D1D', margin: 0 }}>
                Status: <code>terms_unavailable</code>. Backend checkout fails closed until an approved Terms version and HTTPS URL are provisioned.
              </p>
            </div>
          ) : isTermsRequired && isTermsAvailable ? (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Subscription Terms &amp; Conditions
              </h4>
              <p style={{ fontSize: 12, lineHeight: 1.5, color: '#166534', margin: '0 0 6px' }}>
                Please review the official <a href={termsConfig.url} target="_blank" rel="noopener noreferrer" style={{ color: '#15803D', fontWeight: 600, textDecoration: 'underline' }}>ActivKlass Subscription Terms (Version: {termsConfig.version})</a> before completing payment.
              </p>
            </div>
          ) : (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Terms &amp; Conditions Status
              </h4>
              <p role="note" style={{ fontSize: 12, lineHeight: 1.5, color: '#92400E', margin: '0 0 8px' }}>
                This purchase summary is not Terms and Conditions. Approved subscription Terms are not available in the application, so this checkbox only confirms that you reviewed the displayed quote.
              </p>
              <p style={{ fontSize: 11.5, lineHeight: 1.45, color: '#78350F', margin: 0 }}>
                <strong>Commercial release note:</strong> Official subscription Terms and Conditions are pending legal review (Version: unreleased-draft). Live commercial transactions require approved Terms.
              </p>
            </div>
          )}

          {/* 5. Distinct Acknowledgments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
              <input
                type="checkbox"
                checked={quoteReviewed}
                onChange={(event) => setQuoteReviewed(event.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>I reviewed the seats, 300-day term, activation condition, and total shown above.</span>
            </label>

            {isTermsRequired && isTermsAvailable ? (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
                <input
                  type="checkbox"
                  checked={termsAcknowledged}
                  onChange={(event) => setTermsAcknowledged(event.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>I have read and agree to the ActivKlass Subscription Terms and Conditions (Version: {termsConfig.version}).</span>
              </label>
            ) : (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
                <input
                  type="checkbox"
                  checked={termsAcknowledged}
                  disabled={isCommercialBlocked}
                  onChange={(event) => setTermsAcknowledged(event.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>I acknowledge that official commercial Terms are pending and agree to proceed under test-mode policies.</span>
              </label>
            )}
          </div>
        </>
      )}

      {/* Button and Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={!isReadyToPay}
          onClick={() => isReadyToPay && onContinue(quote)}
          style={{
            ...actionStyle,
            opacity: !isReadyToPay ? 0.5 : 1,
            cursor: !isReadyToPay ? 'not-allowed' : 'pointer',
          }}
        >
          Pay for this school year
        </button>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          style={secondaryBtnStyle}
        >
          {isFetching ? 'Refreshing…' : 'Refresh Quote'}
        </button>
      </div>

      {!isReadyToPay && (
        <p style={{ fontSize: 11.5, color: '#64748B', margin: '8px 0 0' }}>
          {!quote
            ? 'Awaiting quote calculation…'
            : isCommercialBlocked
              ? 'Commercial checkout is blocked pending approved and published Terms.'
              : !quoteReviewed || !termsAcknowledged
                ? 'Check both acknowledgments above to enable payment.'
                : disabled
                  ? 'Payment processing in progress…'
                  : ''}
        </p>
      )}
    </section>
  )
}
