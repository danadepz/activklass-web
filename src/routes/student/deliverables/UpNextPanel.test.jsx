/**
 * The student's "Up next" panel: buckets in order, empty ones hidden,
 * finished work folded away, the empty line, a class that failed to load
 * named rather than silently dropped, and the calendar's dots and day list.
 * Static markup, the house pattern -- the hook is mocked, every date is
 * pinned to one `now`, and every sentence is checked against
 * describeWindow() so the panel can never drift from lib/deliverables.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { describeWindow, fromQuiz, fromTask } from '@/lib/deliverables'

const state = vi.hoisted(() => ({ data: null, isLoading: false, isError: false }))

vi.mock('@/hooks/useStudentDeliverables', () => ({
  useStudentDeliverables: () => ({ data: state.data, isLoading: state.isLoading, isError: state.isError }),
}))

import UpNextPanel, { EMPTY_TEXT as EMPTY_RAW } from './UpNextPanel'
import MonthCalendar from './MonthCalendar'

// As the static renderer escapes it.
const EMPTY_TEXT = EMPTY_RAW.replace(/'/g, '&#x27;')

// A Sunday morning; "this week" runs to the following Sunday's midnight.
const NOW = new Date(2026, 8, 13, 10, 0)
const at = (days, h = 23, m = 59) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + days)
  d.setHours(h, m, 0, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const cls = { classId: 'demo-sci9-newton', className: 'SCI9 · Science 9', now: NOW }
const items = [
  fromTask({ id: 'late', class_id: 'demo-sci9-newton', topic_id: 't2', kind: 'activity', title: 'Lab report', due_at: at(-2), status: 'published' }, cls),
  fromQuiz({ id: 'q-today', title: 'Quiz today', status: 'published', closes_at: at(0) }, cls),
  fromTask({ id: 'week', class_id: 'demo-sci9-newton', topic_id: 't4', kind: 'exam', title: 'Quarter exam', due_at: at(4, 8, 0), status: 'published' }, cls),
  fromTask({ id: 'far', class_id: 'demo-sci9-newton', topic_id: null, kind: 'assignment', title: 'Portfolio', due_at: at(20), status: 'published' }, cls),
  fromQuiz({ id: 'q-soon', title: 'Quiz opening later', status: 'published', opens_at: at(2, 8, 0), closes_at: at(9) }, cls),
  fromQuiz({ id: 'q-done', title: 'Quiz finished', status: 'published', closes_at: at(3) }, { ...cls, attempts: [{ status: 'submitted', total_score: 5 }] }),
]

const render = () => renderToStaticMarkup(<MemoryRouter><UpNextPanel now={NOW} /></MemoryRouter>)

describe('Up next -- list', () => {
  it('shows the sections in order, hides empty ones, and folds finished work under Finished', () => {
    state.data = { items, failed: [] }
    state.isLoading = false
    state.isError = false
    const html = render()
    const order = ['Overdue', 'Due today', 'This week', 'Later', 'Not open yet', 'Finished'].map((t) => html.indexOf(`data-section="${t}"`))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain('<details data-section="Finished">')
    expect(html).not.toContain(EMPTY_TEXT)
  })

  it('puts each item where bucket() puts it, with the chip sentence describeWindow gives', () => {
    state.data = { items, failed: [] }
    const html = render()
    const section = (id) => {
      const i = html.indexOf(`data-deliverable="${id}"`)
      const before = html.slice(0, i)
      return before.slice(before.lastIndexOf('data-section="') + 14).split('"')[0]
    }
    expect(section('task:late')).toBe('Overdue')
    expect(section('quiz:q-today')).toBe('Due today')
    expect(section('task:week')).toBe('This week')
    expect(section('task:far')).toBe('Later')
    expect(section('quiz:q-soon')).toBe('Not open yet')
    expect(section('quiz:q-done')).toBe('Finished')
    for (const item of items) expect(html).toContain(describeWindow(item, NOW))
  })

  it('links a quiz to its player and a task to its sub-module on the Modules tab', () => {
    state.data = { items, failed: [] }
    const html = render()
    expect(html).toContain('href="/student/classes/demo-sci9-newton/quizzes/q-today"')
    expect(html).toContain('href="/student/classes/demo-sci9-newton?tab=topics&amp;topic=t2"')
    // An unlinked task still opens the Modules tab, just with nothing to scroll to.
    expect(html).toContain('href="/student/classes/demo-sci9-newton?tab=topics"')
    expect(html).toContain('Activity · SCI9 · Science 9')
    expect(html).toContain('Exam · SCI9 · Science 9')
  })

  it('says nothing is due when there is nothing, and still when the only work is finished', () => {
    state.data = { items: [], failed: [] }
    expect(render()).toContain(EMPTY_TEXT)
    state.data = { items: items.filter((i) => i.id === 'q-done'), failed: [] }
    const html = render()
    expect(html).toContain(EMPTY_TEXT)
    expect(html).toContain('data-section="Finished"')
  })

  it('names a class whose read failed instead of quietly showing less, and keeps the rest', () => {
    state.data = { items: items.slice(0, 2), failed: [{ classId: 'x', label: 'MATH10 · Mathematics 10' }] }
    const html = render()
    expect(html).toContain('Some of your classes could not be loaded (MATH10 · Mathematics 10)')
    expect(html).toContain('data-deliverable="task:late"')
  })

  it('never shows a vendor name or raw error text while loading or on failure', () => {
    state.data = null
    state.isLoading = true
    expect(render()).toContain('animate-pulse')
    state.isLoading = false
    state.isError = true
    const html = render()
    expect(html).toContain('Your deadlines could not be loaded right now')
    expect(html).not.toMatch(/firebase|firestore|permission|denied|failed to fetch/i)
    state.isError = false
  })
})

describe('Up next -- calendar', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><MonthCalendar items={items} now={NOW} initialSelected="2026-09-17" /></MemoryRouter>,
  )

  it('opens on the month of now, outlines today, and puts one dot per item on its due day', () => {
    expect(html).toContain('data-calendar-month="2026-09"')
    expect(html).toContain('September 2026')
    expect(html).toMatch(/data-day="2026-09-13"[^>]*style="[^"]*border:2px solid #0E2A5C/)
    const dotsOn = (day) => (html.split(`data-day="${day}"`)[1]?.split('</button>')[0].match(/data-dot="/g) ?? []).length
    expect(dotsOn('2026-09-11')).toBe(1) // the overdue lab report
    expect(dotsOn('2026-09-13')).toBe(1) // the quiz due today
    expect(dotsOn('2026-09-17')).toBe(1) // the exam
    expect(dotsOn('2026-09-16')).toBe(1) // the finished quiz
    expect(dotsOn('2026-09-22')).toBe(1) // the scheduled quiz closes here
    expect(dotsOn('2026-09-14')).toBe(0)
    expect(html).toContain('data-dot="overdue"')
    expect(html).toContain('data-dot="due_today"')
    expect(html).toContain('data-dot="done"')
    expect(html).toContain('data-dot="scheduled"')
  })

  it('lists the selected day under the grid, with the same rows the list uses', () => {
    expect(html).toContain('data-day-list="2026-09-17"')
    expect(html).toContain('Thu 17 Sep · 1 due')
    expect(html).toContain('data-deliverable="task:week"')
    expect(html).toContain(describeWindow(items[2], NOW))
    expect(html).not.toContain('data-deliverable="task:late"')
  })

  it('has the month buttons and no dependency', () => {
    expect(html).toContain('aria-label="Previous month"')
    expect(html).toContain('aria-label="Next month"')
  })
})
