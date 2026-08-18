import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, X } from '@/components/icons'
import { green, ink, red } from '@/theme'

/**
 * Copy-to-clipboard button that confirms in place.
 *
 * Click -> writes `value` to the clipboard, turns into a green check, then
 * returns to its resting state after `resetMs`.
 *
 *   <CopyButton value={consent.parent_id} label="Copy ID" />
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md) so every "copy this identifier"
 * affordance in the app behaves and looks the same.
 */

/**
 * navigator.clipboard only exists in a secure context -- https, or localhost.
 * A plain-http origin (the forwarded VS Code port this project uses for remote
 * viewers) leaves it undefined, so fall back to the legacy selection trick
 * rather than throwing and leaving the student with no way to copy at all.
 */
async function writeClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission denied or a non-secure context -- try the fallback below.
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    // Kept off-screen but still focusable; `display: none` would not be selectable.
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, ta.value.length) // iOS Safari ignores select() alone
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export default function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  failedLabel = "Couldn't copy",
  resetMs = 10000,
  className = '',
  style,
}) {
  const [state, setState] = useState('idle') // 'idle' | 'copied' | 'failed'
  const timer = useRef(null)

  // A click after unmount-and-remount, or a second click before the first
  // reset lands, must not leave a stale timer flipping state underneath us.
  useEffect(() => () => clearTimeout(timer.current), [])

  const onClick = useCallback(async () => {
    const ok = await writeClipboard(String(value ?? ''))
    setState(ok ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), resetMs)
  }, [value, resetMs])

  const copied = state === 'copied'
  const failed = state === 'failed'

  const fg = copied ? green : failed ? red : ink
  const bg = copied ? 'rgba(31,138,91,0.10)' : failed ? 'rgba(192,57,43,0.07)' : '#FFFFFF'
  const border = copied
    ? 'rgba(31,138,91,0.45)'
    : failed
      ? 'rgba(192,57,43,0.38)'
      : 'rgba(14,42,92,0.16)'

  const Icon = copied ? Check : failed ? X : Copy
  const text = copied ? copiedLabel : failed ? failedLabel : label

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={!value}
        aria-label={copied ? `${copiedLabel}: ${value}` : `${label}: ${value}`}
        title={value ? String(value) : undefined}
        className={`flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed ${className}`}
        style={{
          padding: '7px 12px',
          fontSize: 12.5,
          fontWeight: 600,
          color: fg,
          background: bg,
          border: `1.5px solid ${border}`,
          borderRadius: 9,
          cursor: 'pointer',
          transition: 'color 0.18s ease, background 0.18s ease, border-color 0.18s ease',
          ...style,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
        {text}
      </button>

      {/* The colour swap alone is invisible to a screen reader. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `Copied ${value} to clipboard` : failed ? failedLabel : ''}
      </span>
    </>
  )
}
