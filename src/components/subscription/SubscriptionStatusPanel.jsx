import Button from '@/components/ui/Button'
import { ink, muted, navy, line, heading, green, greenDeep, red, redDeep, orangeDeep } from '@/theme'
import { formatCentavos, formatDate, PLAN_LABEL } from '@/lib/subscriptionPayment'

const PAYMENT_STATUS = {
  pending: { label: 'Pending', color: muted, bg: 'rgba(14,42,92,0.06)' },
  partially_paid: { label: 'Partially Paid', color: navy, bg: 'rgba(14,42,92,0.08)' },
  fully_paid: { label: 'Fully Paid', color: greenDeep, bg: 'rgba(31,138,91,0.12)' },
  overdue: { label: 'Overdue Balance', color: redDeep, bg: 'rgba(192,57,43,0.10)' },
  failed: { label: 'Payment Failed', color: redDeep, bg: 'rgba(192,57,43,0.10)' },
  cancelled: { label: 'Cancelled', color: orangeDeep, bg: 'rgba(230,126,34,0.12)' },
}

const SUB_STATUS = { active: 'Active', not_active: 'Not Active', expired: 'Expired' }

function Item({ label, children, prominent = false }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt style={{ fontSize: 12, fontWeight: prominent ? 700 : 500, color: muted, margin: 0 }}>{label}</dt>
      <dd style={{
        margin: '4px 0 0', fontSize: prominent ? 20 : 14, lineHeight: 1.5,
        fontWeight: 700, color: prominent ? navy : ink, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere',
      }}>{children}</dd>
    </div>
  )
}

/**
 * Subscription and payment status from the server's own view of the
 * obligation. An overdue balance is a warning only — access is unchanged.
 */
export default function SubscriptionStatusPanel({ view, onPayBalance, busy = false }) {
  if (!view) return null
  const { costing, subscription, payment } = view
  const badge = PAYMENT_STATUS[payment.status] ?? PAYMENT_STATUS.pending
  const active = subscription.status === 'active'

  return (
    <section aria-label="Subscription status" style={{ border: `1px solid ${line}`, borderRadius: 16, padding: 20, background: '#FFFFFF' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <h2 style={{ ...heading, fontSize: 18, color: ink, margin: 0 }}>Payment Status</h2>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: badge.color, background: badge.bg, padding: '4px 10px', borderRadius: 999 }}>
          {badge.label}
        </span>
      </div>

      {payment.overdue_warning ? (
        <div role="alert" style={{ border: '1px solid rgba(192,57,43,0.35)', background: 'rgba(192,57,43,0.06)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <strong style={{ display: 'block', color: redDeep, fontSize: 14 }}>Overdue Balance</strong>
          <p style={{ margin: '4px 0 0', color: ink, fontSize: 13.5 }}>{payment.overdue_warning}</p>
          <p style={{ margin: '6px 0 0', color: ink, fontSize: 13.5 }}>
            Remaining: <strong>{formatCentavos(payment.remaining_centavos)}</strong> · Was due {formatDate(payment.balance_due_at)}
          </p>
        </div>
      ) : null}

      <div style={{
        background: 'rgba(14,42,92,0.035)', borderRadius: 12, padding: '14px 16px', marginBottom: 18,
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '10px 20px', margin: 0, flex: '1 1 300px' }}>
            <Item label="Remaining Balance" prominent>{formatCentavos(payment.remaining_centavos)}</Item>
            <Item label="Payment Due Date" prominent>
              {payment.remaining_centavos > 0 && payment.balance_due_at ? formatDate(payment.balance_due_at) : '—'}
            </Item>
          </dl>
          {payment.balance_checkout_available && onPayBalance ? (
            <Button size="sm" onClick={onPayBalance} disabled={busy}>
              {busy ? 'Opening checkout…' : `Pay Remaining ${formatCentavos(payment.remaining_centavos)}`}
            </Button>
          ) : null}
        </div>
        {payment.balance_checkout_available && onPayBalance ? (
          <p style={{ fontSize: 12, color: muted, lineHeight: 1.5, margin: '10px 0 0' }}>
            Completes payment for your current subscription period.
          </p>
        ) : null}
      </div>

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '12px 20px', margin: 0 }}>
        <Item label="Plan">{PLAN_LABEL[costing.plan] ?? costing.plan}</Item>
        <Item label="Status">
          <span style={{ color: active ? green : muted }}>{SUB_STATUS[subscription.status] ?? subscription.status}</span>
        </Item>
        <Item label="Subscription Expires">{subscription.paid_through ? formatDate(subscription.paid_through) : '—'}</Item>
        <Item label="Seats">
          {costing.teacher_seats} teacher{costing.teacher_seats === 1 ? '' : 's'} · {Number(costing.student_capacity).toLocaleString('en-PH')} students
        </Item>
        <Item label="Total Subscription Cost">{formatCentavos(costing.total_centavos)}</Item>
        <Item label="Amount Paid">{formatCentavos(payment.amount_paid_centavos)}</Item>
      </dl>

      {payment.status === 'fully_paid' ? (
        <p style={{ margin: '14px 0 0', fontSize: 13, color: greenDeep }}>Paid in full. Nothing more is due this term.</p>
      ) : null}
      {(payment.status === 'failed' || payment.status === 'cancelled') ? (
        <p style={{ margin: '14px 0 0', fontSize: 13, color: red }}>
          {payment.status === 'failed' ? 'The payment did not go through.' : 'The payment was cancelled.'} Nothing was charged and the subscription is not active.
        </p>
      ) : null}
    </section>
  )
}
