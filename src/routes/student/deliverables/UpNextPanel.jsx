/**
 * "Up next" -- everything the student has to finish, across every class,
 * soonest first; as a list of sections or as a month calendar.
 *
 * Owned by the Student lane (see OWNERSHIP.md). The data is
 * useStudentDeliverables (quizzes with a window + published class tasks,
 * one class's failed read never blanking the rest) and the sections are
 * bucket() in lib/deliverables -- nothing about a date is decided here.
 * The dashboard is the reminder: no scheduled nudges exist (plan D9), so
 * this panel sits above "Your classes" and is the first thing after the
 * hero.
 *
 * The list/calendar choice is remembered per browser in localStorage, read
 * and written inside try/catch -- a private window or blocked storage just
 * falls back to the list every time.
 */
import { useState } from 'react'
import { faint, ink, line, muted, navy, serif } from '@/theme'
import { bucket } from '@/lib/deliverables'
import { useStudentDeliverables } from '@/hooks/useStudentDeliverables'
import { DeliverableRow } from './DeliverableRow'
import MonthCalendar from './MonthCalendar'
import { useNow } from './useNow'

const VIEW_KEY = 'ak.student.upNext.view'

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'list'
  } catch {
    return 'list'
  }
}

function writeView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    /* remembered for this visit only */
  }
}

/** The list's sections, in the order they are shown; empty ones are hidden. */
export const SECTIONS = [
  ['overdue', 'Overdue'],
  ['today', 'Due today'],
  ['thisWeek', 'This week'],
  ['later', 'Later'],
  ['notYetOpen', 'Not open yet'],
]

export const EMPTY_TEXT = "Nothing due. Check your classes' Modules tabs for what to read."

function Section({ title, items, now }) {
  if (!items.length) return null
  return (
    <section data-section={title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
        {title} <span style={{ color: faint, fontWeight: 600 }}>· {items.length}</span>
      </h3>
      {items.map((item) => <DeliverableRow key={`${item.source}:${item.id}`} item={item} now={now} />)}
    </section>
  )
}

/**
 * @param {object} props
 * @param {number|Date} [props.now]  the moment to bucket against; tests pin it
 */
export default function UpNextPanel({ now: nowProp }) {
  const now = useNow(nowProp)
  const [view, setView] = useState(readView)
  const { data, isLoading, isError } = useStudentDeliverables()
  const items = data?.items ?? []
  const failed = data?.failed ?? []
  const buckets = bucket(items, now)

  const choose = (next) => {
    setView(next)
    writeView(next)
  }

  const toggleBtn = (key, label) => {
    const active = view === key
    return (
      <button
        type="button"
        key={key}
        onClick={() => choose(key)}
        aria-pressed={active}
        style={{
          padding: '6px 12px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer',
          color: active ? '#FAFAF6' : muted, background: active ? navy : 'transparent',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div data-up-next style={{ marginTop: 32 }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 style={{ ...serif, fontSize: 24, margin: 0, color: ink }}>Up next</h2>
        <div role="group" aria-label="View" style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: '#FFFFFF', border: `1px solid ${line}` }}>
          {toggleBtn('list', 'List')}
          {toggleBtn('calendar', 'Calendar')}
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 'clamp(14px, 2.5vw, 20px)' }}>
        {isLoading ? (
          <div className="animate-pulse flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: 56, borderRadius: 12, background: 'rgba(14,42,92,0.05)' }} />)}
          </div>
        ) : isError ? (
          <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
            Your deadlines could not be loaded right now. Refresh the page to try again.
          </p>
        ) : (
          <>
            {failed.length > 0 && (
              <p style={{ fontSize: 12.5, color: muted, margin: '0 0 12px', padding: '8px 12px', borderRadius: 10, background: 'rgba(245,197,24,0.12)' }}>
                Some of your classes could not be loaded ({failed.map((f) => f.label).join(', ')}), so their deadlines are not listed here.
              </p>
            )}

            {view === 'calendar' ? (
              <MonthCalendar items={items} now={now} />
            ) : items.length === 0 ? (
              <p style={{ fontSize: 14, color: muted, margin: 0, textAlign: 'center', padding: '18px 0' }}>{EMPTY_TEXT}</p>
            ) : (
              <div data-scroll-region="up-next-list" tabIndex={0} style={{ maxHeight: 480, overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {SECTIONS.map(([key, title]) => <Section key={key} title={title} items={buckets[key]} now={now} />)}
                  {SECTIONS.every(([key]) => buckets[key].length === 0) && (
                    <p style={{ fontSize: 14, color: muted, margin: 0, textAlign: 'center', padding: '10px 0' }}>{EMPTY_TEXT}</p>
                  )}
                  {buckets.done.length > 0 && (
                    <details data-section="Finished">
                      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Finished <span style={{ color: faint, fontWeight: 600 }}>· {buckets.done.length}</span>
                      </summary>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                        {buckets.done.map((item) => <DeliverableRow key={`${item.source}:${item.id}`} item={item} now={now} />)}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
