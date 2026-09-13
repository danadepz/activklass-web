/**
 * A month of the student's deliverables: one dot per item on the day it is
 * due, coloured by the state lib/deliverables derives; pick a day and its
 * items list under the grid.
 *
 * Owned by the Student lane (see OWNERSHIP.md). Written by hand -- no
 * calendar dependency (CLAUDE.md: none without approval) -- and plain
 * enough that the teacher side can lift it to components/ if it wants the
 * same view. Every colour is a theme.js token or a tint of one; the dot
 * colours are STATE_TONE in WindowChip.jsx, the same map the chips use.
 *
 * Undated items have no day to sit on and are not drawn; the list view
 * still shows them under "Later". A quiz's due day is its closes_at
 * (fromQuiz reads it as dueAt).
 */
import { useState } from 'react'
import { faint, ink, line, muted, navy } from '@/theme'
import { formatDay, stateOf } from '@/lib/deliverables'
import { STATE_TONE } from './WindowChip'
import { DeliverableRow } from './DeliverableRow'
import { useNow } from './useNow'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 'YYYY-MM-DD' in local time -- the key a day's items are grouped under. */
export function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The deliverables due on each day, keyed by dayKey, in the list's order. */
export function groupByDay(items) {
  const out = new Map()
  for (const item of items ?? []) {
    if (!item.dueAt) continue
    const key = dayKey(item.dueAt)
    if (!out.has(key)) out.set(key, [])
    out.get(key).push(item)
  }
  return out
}

/**
 * The cells of one month's grid, Sunday-first: leading blanks, then a
 * Date per day. Six rows at most, never padded to a fixed height.
 */
export function monthCells(year, month) {
  const first = new Date(year, month, 1)
  const cells = Array.from({ length: first.getDay() }, () => null)
  const days = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= days; d += 1) cells.push(new Date(year, month, d))
  return cells
}

const MAX_DOTS = 4

/**
 * @param {object} props
 * @param {object[]} props.items  deliverables from useStudentDeliverables
 * @param {number|Date} [props.now]
 * @param {Date} [props.initialMonth]  which month opens; defaults to now's
 * @param {string|null} [props.initialSelected]  a dayKey to open selected
 */
export default function MonthCalendar({ items = [], now: nowProp, initialMonth, initialSelected = null }) {
  const now = useNow(nowProp)
  const today = new Date(now instanceof Date ? now.getTime() : now)
  const start = initialMonth ?? today
  const [view, setView] = useState({ year: start.getFullYear(), month: start.getMonth() })
  const [selected, setSelected] = useState(initialSelected)

  const byDay = groupByDay(items)
  const cells = monthCells(view.year, view.month)
  const todayKey = dayKey(today)
  const selectedItems = selected ? byDay.get(selected) ?? [] : []

  const shift = (delta) => {
    const d = new Date(view.year, view.month + delta, 1)
    setView({ year: d.getFullYear(), month: d.getMonth() })
  }

  const navBtn = { width: 32, height: 32, borderRadius: 9, border: `1px solid ${line}`, background: '#FFFFFF', color: navy, cursor: 'pointer', fontSize: 16, lineHeight: 1, display: 'grid', placeItems: 'center' }

  return (
    <div data-calendar-month={`${view.year}-${String(view.month + 1).padStart(2, '0')}`}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" style={navBtn}>‹</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{MONTHS[view.month]} {view.year}</div>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" style={navBtn}>›</button>
      </div>

      <div role="grid" aria-label={`${MONTHS[view.month]} ${view.year}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} role="columnheader" style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', padding: '2px 0 4px' }}>{w}</div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} aria-hidden="true" />
          const key = dayKey(date)
          const dayItems = byDay.get(key) ?? []
          const isToday = key === todayKey
          const isSelected = key === selected
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              data-day={key}
              aria-selected={isSelected}
              aria-label={`${date.getDate()} ${MONTHS[view.month]}${dayItems.length ? `, ${dayItems.length} due` : ''}`}
              onClick={() => setSelected(isSelected ? null : key)}
              style={{
                minHeight: 44, padding: '4px 2px', borderRadius: 9, cursor: 'pointer',
                border: `${isToday ? 2 : 1}px solid ${isToday ? navy : isSelected ? 'rgba(14,42,92,0.3)' : line}`,
                background: isSelected ? 'rgba(245,197,24,0.16)' : '#FFFFFF',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                fontSize: 12.5, fontWeight: isToday || dayItems.length ? 700 : 500, color: isToday ? navy : dayItems.length ? ink : muted,
              }}
            >
              <span>{date.getDate()}</span>
              {dayItems.length > 0 && (
                <span style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {dayItems.slice(0, MAX_DOTS).map((item) => (
                    <span
                      key={`${item.source}:${item.id}`}
                      data-dot={stateOf(item, now)}
                      style={{ width: 6, height: 6, borderRadius: 999, background: (STATE_TONE[stateOf(item, now)] ?? STATE_TONE.open).dot }}
                    />
                  ))}
                  {dayItems.length > MAX_DOTS && <span style={{ fontSize: 9, color: muted }}>+{dayItems.length - MAX_DOTS}</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ marginTop: 10, fontSize: 11, color: muted }}>
        {[['due_today', 'Due today'], ['open', 'Due later'], ['overdue', 'Overdue'], ['closed', 'Closed'], ['scheduled', 'Not open yet'], ['done', 'Done']].map(([state, label]) => (
          <span key={state} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: STATE_TONE[state].dot }} />
            {label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, border: `2px solid ${navy}` }} />
          Today
        </span>
      </div>

      {selected && (
        <div data-day-list={selected} style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            {selected === todayKey ? 'Today' : formatDay(new Date(`${selected}T00:00`), now)}
            {' · '}{selectedItems.length === 0 ? 'nothing due' : `${selectedItems.length} due`}
          </div>
          {selectedItems.length > 0 && (
            <div className="flex flex-col gap-2">
              {selectedItems.map((item) => <DeliverableRow key={`${item.source}:${item.id}`} item={item} now={now} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
