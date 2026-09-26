import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/context/useAuth'
import { schoolApprovedUnpaid } from '@/lib/schoolStatus'
import { estimateAnnual, pesos } from '@/lib/pricing'
import { fetchSubscription, startCheckout } from '@/lib/subscription'
import AuthLayout, { SubmitButton, AuthNotice, AuthError } from '@/components/AuthLayout'
import SignOutButton from '@/components/SignOutButton'
import { ink, muted, line } from '@/theme'

/**
 * Where an admin whose school was approved but has not paid for the year
 * lands, in place of the real dashboard (T-82, Option C, 2026-09-26: a
 * superadmin confirms identity first, at no charge -- exactly the same
 * review every other request has always gotten -- and asks for money only
 * after that, from here).
 *
 * PayMongo's checkout return is hardcoded server-side
 * (activklass-backend's create_checkout has exactly two shapes:
 * /teacher/account for an ordinary caller, /register for an Institution
 * sign-up mid-registration) and neither is this admin, so this screen never
 * receives a checkout_ref back. It does not need to: every
 * GET /api/subscription/<id> reconciles that owner's still-pending payments
 * against PayMongo before answering (T-68's self-healing reconciliation, the
 * same mechanism that already covers a payer who closes the tab), so the
 * moment this screen reads the subscription again -- on mount, or after
 * Pay bounces the browser back here through /teacher/account and /portal,
 * neither of which an admin role can actually stay on -- a payment PayMongo
 * already confirmed lands here on its own.
 */
export default function PayToActivate() {
  const { profile, school, isSuperAdmin, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [err, setErr] = useState('')

  // Nothing to wait for here: not in a school, or the school has since been
  // activated (or suspended, which owns its own screen).
  const gated = schoolApprovedUnpaid(school, isSuperAdmin)
  const isAdmin = profile?.role === 'admin'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['subscription', school?.id],
    queryFn: () => fetchSubscription(school.id),
    enabled: gated && !!school?.id,
    retry: false,
  })

  const mut = useMutation({
    mutationFn: () => startCheckout(school.id),
    onSuccess: (res) => { window.location.href = res.checkout_url },
    onError: (e) => setErr(e.message),
  })

  // Once paid, subscriptions.py's _mark_paid flips schools/{id}'s own
  // subscription_status mirror to 'active' server-side. refreshProfile()
  // re-reads it so ProtectedRoute's gate (and RoleHomeRedirect) see the same
  // thing the very next time either runs, rather than waiting for the next
  // sign-in to notice the school AuthContext already has in memory is stale.
  useEffect(() => {
    if (gated && data?.subscription && data.subscription.status !== 'approved_unpaid') {
      refreshProfile().then(() => navigate('/portal', { replace: true }))
    }
  }, [gated, data, refreshProfile, navigate])

  if (!gated) return <Navigate to="/portal" replace />

  const sub = data?.subscription
  const limits = sub?.limits ?? {}
  const estimate = limits.teacher_seats
    ? estimateAnnual(limits.teacher_seats, limits.student_seats ?? 0)
    : null

  return (
    <AuthLayout
      title="One step left — pay for the school year"
      subtitle={`${school?.name ?? 'Your school'} is approved. Paying for the year opens the dashboard for everyone.`}
    >
      <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
        <AuthNotice>
          <strong>You’re approved.</strong> The ActivKlass team has reviewed your request. Paying
          for the school year is the last step — once it clears, you and every teacher and student
          you add can sign in and use the dashboard.
        </AuthNotice>

        {isLoading ? (
          <p style={{ fontSize: 13.5, color: muted, margin: '16px 0 0' }}>Checking your subscription…</p>
        ) : isError ? (
          <p style={{ fontSize: 13.5, color: muted, margin: '16px 0 0' }}>
            Could not load your subscription. Refresh this page to try again.
          </p>
        ) : isAdmin ? (
          <>
            {estimate != null && (
              <p style={{ fontSize: 14, color: ink, margin: '16px 0 0' }}>
                {Number(limits.teacher_seats).toLocaleString()} teacher{limits.teacher_seats === 1 ? '' : 's'} ×{' '}
                {Number(limits.student_seats ?? 0).toLocaleString()} students — {pesos(estimate)} for one school year.
              </p>
            )}
            <div style={{ marginTop: 14 }}>
              <SubmitButton
                type="button"
                disabled={mut.isPending}
                onClick={() => { setErr(''); mut.mutate() }}
                style={{ marginTop: 0, width: 'auto', padding: '13px 22px' }}
              >
                {mut.isPending ? 'Starting payment…' : 'Pay for this school year'}
              </SubmitButton>
            </div>
            {err && <div style={{ marginTop: 12 }}><AuthError>{err}</AuthError></div>}
          </>
        ) : (
          <p style={{ fontSize: 13.5, color: muted, margin: '16px 0 0', lineHeight: 1.5 }}>
            Your school’s administrator pays for the year — nothing to do here. Ask them to sign in
            and finish this step.
          </p>
        )}

        <p style={{ fontSize: 12.5, color: muted, margin: '18px 0 0', lineHeight: 1.5 }}>
          Signed in as <strong style={{ color: ink }}>{profile?.login_id ?? profile?.email}</strong>.
        </p>
        <div style={{ marginTop: 10 }}>
          <SignOutButton />
        </div>
      </div>
    </AuthLayout>
  )
}
