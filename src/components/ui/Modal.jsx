import { useId } from 'react'
import { ink, muted, line, sansFamily, serifFamily } from '@/theme'
import { IconButton } from '@/components/ui/Button'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'

/* ------------------------------------------------------------------ *
 * Modal — the shared dialog shell.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md).
 *
 * Ten route files render their own `position: 'fixed'` overlay. Two of them
 * declared role="dialog", one closed on Escape, none trapped focus and none
 * locked body scroll — so tabbing out of a modal landed on the page behind it
 * and the background scrolled under a thumb on mobile. This is the single
 * shell those ten collapse into.
 *
 * The geometry is SignOutButton's, which was the only dialog in the app that
 * already looked deliberate: 20px radius, a long soft shadow, blurred scrim.
 *
 * What it does that a hand-rolled overlay did not:
 *   - role="dialog" + aria-modal + a real aria-labelledby pointing at the title
 *   - Escape closes
 *   - Tab cycles inside the panel instead of escaping to the page behind
 *   - focus moves in on open and returns to the trigger on close
 *   - body scroll locks while open (ref-counted, so stacked modals unlock once)
 * ------------------------------------------------------------------ */

/** Max panel width. `md` is the confirm/prompt default. */
const SIZES = { sm: 400, md: 520, lg: 720, xl: 960 }

export default function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  size = 'md',
  closeOnBackdrop = true,
  showClose = true,
  align = 'left',
  footer,
  children,
  panelStyle,
  initialFocusRef,
}) {
  const titleId = useId()
  const { overlayProps, panelProps } = useDialogBehavior(onClose, {
    open,
    closeOnBackdrop,
    labelledBy: title ? titleId : undefined,
    initialFocusRef,
  })

  if (!open) return null

  return (
    <div
      {...overlayProps}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(14,23,51,0.55)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
        overflowY: 'auto',
      }}
    >
      <div
        {...panelProps}
        style={{
          width: '100%',
          maxWidth: SIZES[size] ?? SIZES.md,
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          background: '#FFFFFF',
          borderRadius: 20,
          boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)',
          outline: 'none',
          ...panelStyle,
        }}
      >
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '26px 28px 0',
              textAlign: align,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                id={titleId}
                style={{ fontFamily: serifFamily, fontSize: 21, color: ink, margin: 0, lineHeight: 1.25 }}
              >
                {title}
              </h3>
              {subtitle && (
                <p style={{ fontFamily: sansFamily, fontSize: 13.5, color: muted, lineHeight: 1.55, margin: '8px 0 0' }}>
                  {subtitle}
                </p>
              )}
            </div>
            {showClose && onClose && (
              <IconButton label="Close" onClick={onClose} style={{ marginTop: -4, color: muted }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </IconButton>
            )}
          </div>
        )}

        <div
          style={{
            padding: `${title ? 18 : 28}px 28px ${footer ? 0 : 28}px`,
            overflowY: 'auto',
            fontFamily: sansFamily,
            fontSize: 14,
            color: ink,
            lineHeight: 1.6,
          }}
        >
          {children}
        </div>

        {footer && (
          <div
            style={{
              display: 'flex',
              justifyContent: align === 'center' ? 'center' : 'flex-end',
              gap: 10,
              padding: '22px 28px 26px',
              marginTop: 22,
              borderTop: `1px solid ${line}`,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
