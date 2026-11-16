import { muted } from '@/theme'

/** Shown in place of a payment control when the server says this account
 *  cannot take online payment (`payments_enabled: false`). */
export default function PaymentUnavailableNote({ style }) {
  return (
    <p role="note" style={{ margin: '14px 0 0', fontSize: 13.5, color: muted, lineHeight: 1.5, ...style }}>
      Online payment is not available for this account yet. Contact ActivKlass support to change your subscription.
    </p>
  )
}
