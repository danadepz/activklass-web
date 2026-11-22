import { useTransientMessage } from '@/hooks/useTransientMessage'
import { useMutation } from '@tanstack/react-query'
import SubscriptionStatusPanel from '@/components/subscription/SubscriptionStatusPanel'
import { startBalanceCheckout } from '@/lib/subscription'
import { installmentToView } from '@/lib/subscriptionPayment'
import { red } from '@/theme'

/**
 * The current term's payment state and, while a 50% balance is owed, the
 * button that pays it. Renders nothing for a term with no installment plan.
 */
export default function InstallmentStatus({ ownerId, subscription, installment, canPay = true }) {
  const [err, setErr] = useTransientMessage('')
  const pay = useMutation({
    mutationFn: () => startBalanceCheckout(ownerId),
    onSuccess: (res) => { window.location.href = res.checkout_url },
    onError: (e) => setErr(e.message),
  })
  const view = installmentToView(subscription, installment)
  if (!view) return null
  return (
    <div>
      <SubscriptionStatusPanel
        view={view}
        busy={pay.isPending}
        onPayBalance={canPay ? () => { setErr(''); pay.mutate() } : undefined}
      />
      {err ? <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: red }}>{err}</p> : null}
    </div>
  )
}
