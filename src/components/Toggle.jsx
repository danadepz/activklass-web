import { green, ink, muted } from '@/theme'

/**
 * Labelled on/off switch.
 *
 *   <Toggle
 *     checked={perms.grades}
 *     onChange={(next) => save({ ...perms, grades: next })}
 *     label="Grades"
 *     hint="Component scores and computed final grades"
 *   />
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md).
 *
 * A real <button role="switch"> rather than a styled div: it is focusable and
 * space/enter-activatable for free, and aria-checked tells a screen reader the
 * state that the colour alone conveys. `disabled` is honoured so a caller can
 * lock the control while a save is in flight.
 */
export default function Toggle({
  checked = false,
  onChange,
  label,
  hint,
  disabled = false,
  id,
}) {
  const labelId = id ? `${id}-label` : undefined

  return (
    <div
      className="flex items-start justify-between gap-4"
      style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(14,42,92,0.02)' }}
    >
      <div style={{ minWidth: 0 }}>
        <div id={labelId} style={{ fontSize: 14, fontWeight: 600, color: ink }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontSize: 12.5, color: muted, marginTop: 2, lineHeight: 1.45 }}>{hint}</div>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className="disabled:opacity-45 disabled:cursor-not-allowed"
        style={{
          flexShrink: 0,
          position: 'relative',
          width: 44,
          height: 25,
          padding: 0,
          borderRadius: 999,
          border: `1.5px solid ${checked ? 'rgba(31,138,91,0.5)' : 'rgba(14,42,92,0.18)'}`,
          background: checked ? green : 'rgba(14,42,92,0.10)',
          cursor: 'pointer',
          transition: 'background 0.18s ease, border-color 0.18s ease',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 21 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#FFFFFF',
            boxShadow: '0 1px 3px rgba(14,42,92,0.35)',
            transition: 'left 0.18s ease',
          }}
        />
      </button>
    </div>
  )
}
