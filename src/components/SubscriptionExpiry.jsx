import { useEffect, useState } from 'react'
import { formatExpirationCountdown, toMillis } from '@/lib/subscription'
import { muted } from '@/theme'

const DATE_OPTIONS = { month: 'long', day: 'numeric', year: 'numeric' }

export function subscribeExpiryClock(refresh) {
  const timer = setInterval(refresh, 60_000)
  const onFocus = () => refresh()
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onFocus)
  return () => {
    clearInterval(timer)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onFocus)
  }
}

export default function SubscriptionExpiry({ label, expiresAt, style = {} }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    return subscribeExpiryClock(() => setNow(Date.now()))
  }, [])

  const expiresMs = toMillis(expiresAt)
  if (expiresMs == null || !Number.isFinite(expiresMs)) return null

  const date = new Date(expiresMs).toLocaleDateString(undefined, DATE_OPTIONS)
  const countdown = formatExpirationCountdown(expiresMs, now)
  return (
    <p role="status" aria-live="off" style={{ fontSize: 13, color: muted, margin: 0, ...style }}>
      {label} {date} · {countdown}
    </p>
  )
}
