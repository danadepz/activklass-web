import { useCallback, useEffect, useRef } from 'react'

/* ------------------------------------------------------------------ *
 * useDialogBehavior — everything a modal has to do that is not visual.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md).
 *
 * Fifteen hand-rolled `position: fixed` overlays exist across the route files.
 * Two declared role="dialog", one closed on Escape, none trapped focus and
 * none locked body scroll — so tabbing out of a dialog landed on the page
 * behind it, the arrow keys scrolled the page under it, and a screen reader
 * read the whole document as though nothing had opened.
 *
 * Modal.jsx exists and is the right destination, but moving those fifteen onto
 * it means rewriting each one's header/body/footer markup, in five different
 * panes' files, with a real chance of moving pixels in dialogs nobody asked to
 * have redesigned. This hook is the other half of that answer: the behaviour,
 * spreadable onto whatever markup is already there.
 *
 *     const { overlayProps, panelProps } = useDialogBehavior(onClose)
 *     <div {...overlayProps} style={{ position: 'fixed', inset: 0, ... }}>
 *       <div {...panelProps} style={{ ...existing panel styles }}>
 *
 * Nothing about the appearance changes. Modal.jsx uses the same hook, so there
 * is one implementation of the focus trap rather than two that drift.
 *
 * Pass `labelledBy` (the id of the dialog's heading) where one exists —
 * aria-modal without an accessible name announces "dialog" and nothing else.
 * ------------------------------------------------------------------ */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/* Ref-counted so a dialog opened from inside another dialog does not hand the
   page's scroll back when only the inner one closes. */
let lockCount = 0
let priorOverflow = ''

export function lockBodyScroll() {
  if (lockCount === 0) {
    priorOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1
  return () => {
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) document.body.style.overflow = priorOverflow
  }
}

export function useDialogBehavior(onClose, options = {}) {
  const {
    open = true,
    closeOnBackdrop = true,
    closeOnEscape = true,
    labelledBy,
    label,
    initialFocusRef,
  } = options

  const panelRef = useRef(null)
  const restoreRef = useRef(null)

  /* onClose is an inline arrow at almost every call site, so it is a new
     function every render. Reading it through a ref keeps it out of the
     effect's dependencies — with it in there the effect tears down and sets up
     again on every keystroke, which unlocks and re-locks scroll and bounces
     focus off whatever field is being typed into. */
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    if (!open) return undefined

    restoreRef.current = document.activeElement
    const unlock = lockBodyScroll()

    /* Focus lands on the caller's choice, else the first focusable control,
       else the panel itself — never nowhere, which is what leaves the arrow
       keys scrolling the page behind an open dialog. */
    const target =
      initialFocusRef?.current ??
      panelRef.current?.querySelector(FOCUSABLE) ??
      panelRef.current
    target?.focus?.()

    const onKey = (e) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return

      const nodes = Array.from(panelRef.current.querySelectorAll(FOCUSABLE))
        .filter((n) => n.offsetParent !== null || n === document.activeElement)
      if (nodes.length === 0) {
        e.preventDefault()
        panelRef.current.focus()
        return
      }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const inside = panelRef.current.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      unlock()
      // Returning focus is what makes Escape a step back rather than a dead
      // end — the trigger is still where the reader left it.
      restoreRef.current?.focus?.()
    }
  }, [open, closeOnEscape, initialFocusRef])

  /* mousedown, not click: a click that starts inside the panel and ends on the
     backdrop (dragging to select text, then releasing outside) fires click on
     the overlay and used to close the dialog mid-edit. */
  const onMouseDown = useCallback((e) => {
    if (closeOnBackdrop && e.target === e.currentTarget) closeRef.current?.()
  }, [closeOnBackdrop])

  return {
    panelRef,
    overlayProps: { onMouseDown },
    panelProps: {
      ref: panelRef,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': labelledBy,
      'aria-label': labelledBy ? undefined : label,
      tabIndex: -1,
    },
  }
}

export default useDialogBehavior
