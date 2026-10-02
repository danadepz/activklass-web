/**
 * The signed-in teacher's subscription, as their own screens describe it.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Resolves through Flask the same
 * way the Account page does -- /subscription/mine picks the school's record
 * for an institution or absorbed teacher and the teacher's own otherwise --
 * then hands the result to describeSubscription() with the profile, so the
 * badge still says "Free trial · 12 days left" from the profile's own
 * trial_ends_at when Flask is not running. A failed lookup is a plain null
 * subscription here, not an error state: nothing a teacher does depends on
 * the badge, so it must never take a page down with it.
 */
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/context/useAuth'
import { describeSubscription, fetchMyOwnerId, fetchSubscription } from '@/lib/subscription'

export const mySubscriptionKey = (uid) => ['subscription', 'mine-view', uid]

async function loadMine() {
  const mine = await fetchMyOwnerId()
  const ownerId = mine?.owner_id
  if (!ownerId) return null
  const res = await fetchSubscription(ownerId)
  return res?.subscription ?? null
}

export function useMySubscription() {
  const { profile } = useAuth()
  const isTeacher = profile?.role === 'teacher'
  const { data, isLoading } = useQuery({
    queryKey: mySubscriptionKey(profile?.id),
    queryFn: async () => {
      try { return await loadMine() } catch { return null }
    },
    enabled: isTeacher && !!profile?.id,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const view = describeSubscription({ profile: profile ?? {}, subscription: data ?? null })
  // A solo subscriber (paid or on trial) manages their own students; a
  // school-issued teacher's admin does that for them. T-124 folded `lapsed`
  // into `expired` and removed the `none` fallback (2026-10-02) -- every
  // kind describeSubscription can still return is listed here.
  const isSolo = isTeacher && !profile?.school_id && ['active', 'trial', 'expired'].includes(view.kind)
  return { ...view, isSolo, isLoading: isTeacher && isLoading, subscription: data ?? null }
}
