/**
 * The one chip a deliverable's window is shown in, on every student screen:
 * "Opens Mon 15 Sep, 8:00 AM" · "Due today, 11:59 PM" · "Overdue since …".
 *
 * Owned by the Student lane (see OWNERSHIP.md). The sentence comes from
 * describeWindow() in lib/deliverables.js and is never formatted here; the
 * colour comes from the state the same module derives, so the dashboard,
 * the class page's Modules and Quizzes tabs and the calendar's dots all
 * agree about what a date means. Every colour is a theme.js token or a
 * tint of one -- the same way ATT_META tints the attendance pills.
 */
import { blue, blueText, faint, gold, goldDeep, green, inkMuted, muted, red } from '@/theme'
import { describeWindow, stateOf } from '@/lib/deliverables'
import { useNow } from './useNow'

/** Per state: chip colours, the calendar dot, and the word a card badge uses. */
export const STATE_TONE = Object.freeze({
  scheduled: { fg: inkMuted, bg: 'rgba(14,42,92,0.06)', border: 'rgba(14,42,92,0.16)', dot: faint, badge: 'Not open yet' },
  open: { fg: blueText, bg: 'rgba(63,169,245,0.12)', border: 'rgba(63,169,245,0.45)', dot: blue, badge: null },
  due_today: { fg: goldDeep, bg: 'rgba(245,197,24,0.18)', border: 'rgba(245,197,24,0.55)', dot: gold, badge: 'Due today' },
  overdue: { fg: red, bg: 'rgba(192,57,43,0.08)', border: 'rgba(192,57,43,0.38)', dot: red, badge: 'Overdue' },
  closed: { fg: muted, bg: 'rgba(14,42,92,0.05)', border: 'rgba(14,42,92,0.12)', dot: muted, badge: 'Closed' },
  done: { fg: green, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.4)', dot: green, badge: 'Done' },
})

export function toneOf(state) {
  return STATE_TONE[state] ?? STATE_TONE.open
}

/**
 * @param {object} props
 * @param {object} props.item  a deliverable from fromQuiz() / fromTask()
 * @param {number|Date} [props.now]
 * @param {object} [props.style]
 */
export function WindowChip({ item, now: nowProp, style }) {
  const now = useNow(nowProp)
  const state = stateOf(item, now)
  const tone = toneOf(state)
  return (
    <span
      data-state={state}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap',
        fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 10px',
        color: tone.fg, background: tone.bg, border: `1px solid ${tone.border}`,
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: tone.dot }} />
      {describeWindow(item, now)}
    </span>
  )
}
