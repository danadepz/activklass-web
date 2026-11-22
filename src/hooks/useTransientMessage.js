import { useCallback, useEffect, useRef, useState } from 'react'
import { NOTICE_DURATION_MS } from '@/lib/noticeDuration'

/** A new report, including the same text again, gets its own three seconds. */
export function useTransientMessage(empty = null) {
  const [message, setMessage] = useState(empty)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = useCallback((value) => {
    clearTimeout(timer.current)
    setMessage(value)
    if (value) timer.current = setTimeout(() => setMessage(empty), NOTICE_DURATION_MS)
  }, [empty])
  return [message, show]
}
