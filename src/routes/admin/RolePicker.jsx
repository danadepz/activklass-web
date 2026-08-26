import { navy, navyDeep, muted, sansFamily } from '@/theme'
import { CREATABLE_ROLES } from './ui'

const SLIDE = '260ms cubic-bezier(0.4, 0, 0.2, 1)'

/**
 * The question the admin console asks first — Add a user and Bulk upload both
 * open on it — as a segmented control. The pill slides across to the role you
 * picked instead of blinking out and reappearing under it: everything below it
 * swaps wholesale on a change, and with nothing connecting the two the card
 * read as having rearranged itself. `options` drives both the columns and the slide distance rather than
 * a hardcoded 3, because the bulk card offers two roles where Add a user
 * offers three.
 *
 * Fills the width it is given: the pill travels in percentages, so the caller
 * sizes and places it.
 */
export default function RolePicker({ value, onChange, options = CREATABLE_ROLES }) {
  const index = options.indexOf(value)
  return (
    <div
      role="radiogroup"
      aria-label="Role"
      style={{
        position: 'relative', display: 'grid', padding: 4,
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        background: 'rgba(14,42,92,0.05)', border: '1.5px solid rgba(14,42,92,0.14)',
        borderRadius: 12,
      }}
    >
      {/* No gap between the columns, so one column is exactly (100% - padding)/n
          and the pill can travel in whole multiples of its own width. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', top: 4, bottom: 4, left: 4, pointerEvents: 'none',
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(${Math.max(index, 0) * 100}%)`,
          opacity: index < 0 ? 0 : 1,
          background: navy, borderRadius: 9, boxShadow: `0 2px 0 ${navyDeep}`,
          transition: `transform ${SLIDE}, opacity 160ms linear`,
        }}
      />
      {options.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={r === value}
          onClick={() => onChange(r)}
          style={{
            position: 'relative', padding: '9px 8px', border: 'none', background: 'none',
            fontFamily: sansFamily, fontSize: 14, fontWeight: 700, textTransform: 'capitalize',
            color: r === value ? '#FAFAF6' : muted, cursor: 'pointer', borderRadius: 9,
            transition: `color ${SLIDE}`,
          }}
        >
          {r}
        </button>
      ))}
    </div>
  )
}
