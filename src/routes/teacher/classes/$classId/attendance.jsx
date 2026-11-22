import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { fetchUsersByIds } from '@/lib/roster'
import { notifyStudents } from '@/lib/notifications'
import { syncAttendanceSummaries } from '@/lib/attendanceMirror'
import { scheduleMeetings } from '@/lib/schedule'
import { downloadCsv, stampedName } from '@/lib/csv'
import { useAuth } from '@/context/useAuth'
import { navy, navyDeep, ink, gold, goldDeep, muted, faint, green, greenDeep, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { confirmDialog, promptDialog } from '@/components/ui/dialogs'
import { cancelBlocker, isIsoDate, rescheduleBlocker, sessionStatus } from '@/lib/attendanceSessions'
import { describeAuditEvent, fetchAttendanceAudit, writeAttendanceDays } from '@/lib/attendanceAudit'

/* A refusal the teacher should read as-is (a guard that failed against the
   day as stored right now), as opposed to a failed save. */
const refusal = (message) => Object.assign(new Error(message), { userMessage: message })
const SAVE_FAILED = 'Attendance could not be saved. Reload the page and try again.'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { MetricCard } from '@/components/ui/Card'

const STATUS_META = {
  present: { short: 'P', label: 'Present', fg: greenDeep, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.4)', fillBg: greenDeep, fillFg: '#FFFFFF' },
  late: { short: 'L', label: 'Late', fg: goldDeep, bg: 'rgba(245,197,24,0.18)', border: 'rgba(245,197,24,0.55)', fillBg: gold, fillFg: navy },
  absent: { short: 'A', label: 'Absent', fg: red, bg: 'rgba(192,57,43,0.08)', border: 'rgba(192,57,43,0.38)', fillBg: red, fillFg: '#FFFFFF' },
  excused: { short: 'E', label: 'Excused', fg: blueText, bg: 'rgba(63,169,245,0.12)', border: 'rgba(63,169,245,0.45)', fillBg: blueText, fillFg: '#FFFFFF' },
}
const STATUS_KEYS = ['present', 'late', 'absent', 'excused']

const fieldStyle = {
  padding: '9px 12px',
  fontSize: 13,
  fontFamily: sans,
  color: ink,
  background: '#FFFFFF',
  border: '1.5px solid rgba(14,42,92,0.14)',
  borderRadius: 9,
  transition: 'border-color 0.15s, box-shadow 0.15s',
}
const thHead = {
  padding: '13px 18px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: muted,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

function remarksStyle(disabled) {
  return {
    ...fieldStyle,
    width: '100%',
    ...(disabled ? { background: 'rgba(14,42,92,0.03)', color: faint } : {}),
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }

/* '2026-09-06' -> 'Sep 6'. Split rather than parsed: a Date built from the
   string and read back through toISOString shifts the day either side of UTC. */
function shortDate(iso) {
  const [, m, d] = iso.split('-')
  return `${MONTH_SHORT[Number(m) - 1] ?? ''} ${Number(d)}`
}

/* Local calendar date of a Date, for the same reason. */
function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * The columns of the term grid: every day already recorded, plus the class's
 * scheduled meeting days between the first recorded day and today -- so a day
 * the teacher forgot to take shows as a gap instead of vanishing.
 *
 * A class whose `schedule` is free text from before the pickers yields no
 * weekdays (`scheduleMeetings` returns nothing rather than throwing), and the
 * grid degrades to the recorded days alone. The first recorded day is the only
 * term start we have; no start is invented, and nothing past today is shown.
 */
// From the class's start date (A1) when it has one, else the first recorded day.
function termColumns(recordedDates, schedule, today, startDate) {
  const dates = new Set(recordedDates)
  const weekdays = new Set(scheduleMeetings(schedule).map((m) => WEEKDAY_INDEX[m.day]))
  const first = (isIsoDate(startDate) && startDate) || [...dates].sort()[0]
  if (weekdays.size && first) {
    // An unparseable `first` gives an Invalid Date, whose comparison is false,
    // so the loop simply does not run.
    const cursor = new Date(`${first}T00:00:00`)
    const end = new Date(`${today}T00:00:00`)
    while (cursor <= end) {
      if (weekdays.has(cursor.getDay())) dates.add(isoOf(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  return [...dates].sort()
}

function emptyEntry() {
  return { status: 'none', remarks: '' }
}

/* Reusable Present/Late/Absent/Excused button group. */
function StatusButtons({ status, onToggle }) {
  return (
    <div className="flex gap-1">
      {STATUS_KEYS.map((key) => {
        const m = STATUS_META[key]
        const active = status === key
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            title={m.label}
            className="transition hover:brightness-105"
            style={{
              width: 36,
              height: 32,
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: sans,
              cursor: 'pointer',
              ...(active
                ? { background: m.fillBg, color: m.fillFg, border: `1.5px solid ${m.fillBg}` }
                : { background: '#FFFFFF', color: faint, border: '1.5px solid rgba(14,42,92,0.14)' }),
            }}
          >
            {m.short}
          </button>
        )
      })}
    </div>
  )
}

function AttendanceSheet({ classId, day, sheet, refetch }) {
  const { profile } = useAuth()
  // dirty: {studentId: {status, remarks}} — status 'none' clears the record
  const [dirty, setDirty] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const current = (sid) => {
    if (dirty[sid]) return dirty[sid]
    const record = sheet.records[sid]
    return record ? { status: record.status, remarks: record.remarks ?? '' } : emptyEntry()
  }

  const setEntry = (sid, entry) => setDirty((d) => ({ ...d, [sid]: entry }))

  const toggle = (sid, status) => {
    const entry = current(sid)
    setEntry(sid, { ...entry, status: entry.status === status ? 'none' : status })
  }

  // Set every student to `status` ('none' clears), preserving remarks.
  const markAll = (status) => {
    const next = {}
    for (const s of sheet.students) {
      next[s.student_id] = { ...current(s.student_id), status }
    }
    setDirty((d) => ({ ...d, ...next }))
  }

  const dirtyCount = Object.keys(dirty).length
  const hasChanges = dirtyCount > 0

  // Live tallies for the stat cards (reflect unsaved edits).
  const statuses = sheet.students.map((s) => current(s.student_id).status)
  const total = sheet.students.length
  const presentCount = statuses.filter((x) => x === 'present').length
  const absentCount = statuses.filter((x) => x === 'absent').length
  const lateCount = statuses.filter((x) => x === 'late').length
  const rate = total ? `${Math.round((presentCount / total) * 100)}%` : '—'

  async function save() {
    // Changing or clearing a mark that was already saved is a correction (A6):
    // it is kept in this day's history either way; the reason is optional
    // context for whoever reads that history later.
    const corrects = Object.keys(dirty).some((sid) => sheet.records[sid]?.status)
    let reason = ''
    if (corrects) {
      const answer = await promptDialog({
        title: 'Correct Saved Attendance',
        message: 'You are changing marks that were already saved. The earlier marks stay in this day\'s history.',
        label: 'Reason (optional)',
        placeholder: 'e.g. Student arrived after roll call.',
        confirmLabel: 'Save Correction',
      })
      if (answer == null) return
      reason = answer
    }
    setSaving(true)
    setError(null)
    try {
      // Only the students edited here change, applied onto the day as stored
      // at this moment (read inside the transaction). A mark saved meanwhile
      // by another tab, or for a student no longer listed, is never dropped.
      await writeAttendanceDays(db, classId, profile.id, [{
        date: day,
        reason,
        next: (stored) => {
          if (sessionStatus(stored) !== 'held') throw refusal('This meeting was cancelled or moved. Reload the page.')
          const records = { ...(stored?.records ?? {}) }
          for (const [sid, entry] of Object.entries(dirty)) {
            if (!entry.status || entry.status === 'none') delete records[sid]
            else records[sid] = { status: entry.status, remarks: entry.remarks || '' }
          }
          return { ...(stored ?? {}), records, recorded_by: profile.id, updated_at: serverTimestamp() }
        },
      }])
      /* Rebuild the per-student projection guardians read. Best-effort: the
         class sheet above is the source of truth and has already committed, so
         a failure here must not make the teacher think their save was lost. It
         self-corrects on the next save. */
      try {
        await syncAttendanceSummaries(classId, sheet.students.map((s) => s.student_id))
      } catch (mirrorErr) {
        console.error('attendance summary sync failed:', mirrorErr)
      }

      setDirty({})
      refetch()
    } catch (err) {
      console.error('attendance save failed:', err)
      setError(err.userMessage ?? SAVE_FAILED)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Live session tallies */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {/* icon-less MetricCards: five across, so the chips would crowd */}
        <MetricCard label="Total" value={total} tint="rgba(14,42,92,0.07)" />
        <MetricCard label="Present" value={presentCount} valueColor={green} tint="rgba(31,138,91,0.1)" />
        <MetricCard label="Absent" value={absentCount} valueColor={red} tint="rgba(192,57,43,0.07)" />
        <MetricCard label="Late" value={lateCount} valueColor={goldDeep} tint="rgba(245,197,24,0.15)" />
        <MetricCard label="Rate" value={rate} valueColor={blueText} tint="rgba(63,169,245,0.13)" />
      </div>

      {/* Action bar */}
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3"
        style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '14px 18px' }}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span style={{ fontSize: 13, color: muted, fontWeight: 500, marginRight: 4 }}>Mark all as</span>
          {STATUS_KEYS.map((key) => {
            const m = STATUS_META[key]
            return (
              <button
                key={key}
                onClick={() => markAll(key)}
                className="transition hover:brightness-105"
                style={{ padding: '7px 15px', fontSize: 13, fontWeight: 700, fontFamily: sans, borderRadius: 999, cursor: 'pointer', color: m.fg, background: m.bg, border: `1.5px solid ${m.border}` }}
              >
                {m.label}
              </button>
            )
          })}
          <span style={{ width: 1, height: 22, background: 'rgba(14,42,92,0.1)', margin: '0 2px' }} />
          <button
            onClick={() => markAll('none')}
            className="transition hover:brightness-105"
            style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, fontFamily: sans, borderRadius: 999, cursor: 'pointer', color: muted, background: 'transparent', border: '1.5px solid rgba(14,42,92,0.14)' }}
          >
            Reset
          </button>
        </div>
        <button
          onClick={save}
          disabled={!hasChanges || saving}
          className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 11, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}` }}
        >
          {saving ? 'Saving…' : hasChanges ? `Save Attendance${dirtyCount ? ` · ${dirtyCount}` : ''}` : 'All Saved'}
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-3" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16 }}>
        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(14,42,92,0.03)', borderBottom: '1px solid rgba(14,42,92,0.07)' }}>
              <th style={thHead}>Student</th>
              <th style={thHead}>Status</th>
              <th style={thHead}>Remarks</th>
              <th style={{ ...thHead, textAlign: 'center' }} title="Totals: Present / Late / Absent / Excused">
                P / L / A / E
              </th>
            </tr>
          </thead>
          <tbody>
            {sheet.students.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 32, textAlign: 'center', color: faint }}>
                  No students enrolled yet —{' '}
                  <Link to={`/teacher/classes/${classId}`} style={{ color: navy, fontWeight: 600 }}>
                    add students to the roster
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              sheet.students.map((student) => {
                const sid = student.student_id
                const entry = current(sid)
                const totals = sheet.summary[sid] ?? {}
                const isDirty = dirty[sid] !== undefined
                return (
                  <tr key={sid} style={{ borderBottom: '1px solid rgba(14,42,92,0.05)', background: isDirty ? 'rgba(245,197,24,0.06)' : 'transparent' }}>
                    <td style={{ padding: '12px 18px', fontWeight: 700, color: ink, whiteSpace: 'nowrap' }}>
                      {student.last_name}, {student.first_name}
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <StatusButtons status={entry.status} onToggle={(status) => toggle(sid, status)} />
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <input
                        className="ak-input"
                        value={entry.remarks ?? ''}
                        onChange={(e) => setEntry(sid, { ...entry, remarks: e.target.value })}
                        placeholder="—"
                        disabled={entry.status === 'none'}
                        style={remarksStyle(entry.status === 'none')}
                      />
                    </td>
                    <td style={{ ...mono, padding: '12px 18px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {STATUS_KEYS.map((key, i) => (
                        <span key={key}>
                          {i > 0 && <span style={{ color: '#CBD5E1' }}> / </span>}
                          <span style={{ color: STATUS_META[key].fg, fontWeight: 700 }}>{totals[key] ?? 0}</span>
                        </span>
                      ))}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {sheet.students.length > 0 && (
        <div style={{ ...mono, marginTop: 12, fontSize: 12, color: faint }}>
          {sheet.students.length} students · {day}
        </div>
      )}
    </>
  )
}

/**
 * Whether this date's meeting happened. A teacher can cancel a meeting or move
 * it to another date; neither is allowed while marks are recorded (clear them
 * first), so no attendance is ever dropped by a status change. The rules hold
 * the same line -- see the attendance block in firestore.rules.
 */
function SessionControls({ classId, day, sheet, refetch }) {
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const status = sessionStatus(sheet.session)

  async function run(fn) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      refetch()
    } catch (err) {
      console.error('attendance session change failed:', err)
      setError(err.userMessage ?? 'That change could not be saved. Check the date and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    const blocked = cancelBlocker(sheet.session)
    if (blocked) return setError(blocked)
    const reason = await promptDialog({
      title: 'Cancel This Meeting',
      message: `${day} will not count toward anyone's attendance. You can restore it later.`,
      label: 'Reason (optional)',
      placeholder: 'e.g. Class suspended for a typhoon.',
      confirmLabel: 'Cancel Meeting',
    })
    if (reason == null) return
    // The guard runs again on the day as stored right now: a mark saved since
    // this page loaded refuses the cancel instead of being dropped.
    await run(() => writeAttendanceDays(db, classId, profile.id, [{
      date: day,
      kind: 'cancel',
      reason,
      next: (stored) => {
        const blocked = cancelBlocker(stored)
        if (blocked) throw refusal(blocked)
        return {
          ...(stored ?? {}),
          records: stored?.records ?? {},
          session_status: 'cancelled',
          cancel_reason: reason.trim(),
          status_changed_by: profile.id,
          updated_at: serverTimestamp(),
        }
      },
    }]))
  }

  async function restore() {
    const ok = await confirmDialog({
      title: 'Restore This Meeting',
      message: `${day} will count as a class meeting again, with no attendance recorded yet.`,
      confirmLabel: 'Restore',
    })
    if (!ok) return
    await run(() => writeAttendanceDays(db, classId, profile.id, [{
      date: day,
      kind: 'restore',
      next: (stored) => {
        if (sessionStatus(stored) !== 'cancelled') throw refusal('This meeting is no longer cancelled. Reload the page.')
        return { ...stored, session_status: 'held', status_changed_by: profile.id, updated_at: serverTimestamp() }
      },
    }]))
  }

  async function reschedule() {
    const blockedNow = cancelBlocker(sheet.session)
    if (blockedNow) return setError(blockedNow)
    const to = await promptDialog({
      title: 'Move This Meeting',
      message: `The meeting on ${day} moves to the date you pick. ${day} stops counting; the new date counts once you record it.`,
      label: 'New date',
      type: 'date',
      confirmLabel: 'Move Meeting',
      validate: (v) => rescheduleBlocker({ fromDate: day, toDate: v, days: sheet.days, schedule: sheet.schedule }),
    })
    if (to == null || !isIsoDate(to)) return
    // One transaction, both dates, an audit event each: the rules check each
    // side names the other, so a half-move cannot land.
    await run(() => writeAttendanceDays(db, classId, profile.id, [
      {
        date: day,
        kind: 'reschedule_out',
        next: (stored) => {
          const blocked = cancelBlocker(stored)
          if (blocked) throw refusal(blocked)
          return {
            ...(stored ?? {}),
            records: stored?.records ?? {},
            session_status: 'rescheduled',
            rescheduled_to: to,
            status_changed_by: profile.id,
            updated_at: serverTimestamp(),
          }
        },
      },
      {
        date: to,
        kind: 'reschedule_in',
        next: (stored) => {
          if (stored) throw refusal('That date already has an attendance session.')
          return { records: {}, session_status: 'held', rescheduled_from: day, status_changed_by: profile.id, updated_at: serverTimestamp() }
        },
      },
    ]))
  }

  const chip = { ...mono, fontSize: 12, padding: '6px 10px', borderRadius: 999, border: `1px solid ${line}` }
  const btn = { padding: '7px 14px', fontSize: 13, fontWeight: 600, fontFamily: sans, borderRadius: 999, cursor: 'pointer', color: navy, background: 'transparent', border: '1.5px solid rgba(14,42,92,0.18)' }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5" aria-label="Meeting status">
      {status === 'cancelled' && (
        <span style={{ ...chip, color: red }}>
          Cancelled{sheet.session?.cancel_reason ? ` — ${sheet.session.cancel_reason}` : ''}
        </span>
      )}
      {status === 'rescheduled' && (
        <span style={{ ...chip, color: goldDeep }}>Moved to {sheet.session?.rescheduled_to}</span>
      )}
      {status === 'held' && sheet.session?.rescheduled_from && (
        <span style={{ ...chip, color: blueText }}>Make-up for {sheet.session.rescheduled_from}</span>
      )}
      {status === 'held' && !sheet.session?.rescheduled_from && (
        <>
          <button type="button" disabled={busy} onClick={cancel} style={btn}>Cancel meeting</button>
          <button type="button" disabled={busy} onClick={reschedule} style={btn}>Move meeting…</button>
        </>
      )}
      {status === 'cancelled' && (
        <button type="button" disabled={busy} onClick={restore} style={btn}>Restore meeting</button>
      )}
      {error && <span role="alert" style={{ fontSize: 13, color: red }}>{error}</span>}
    </div>
  )
}

/* This day's audited changes (A6 / B4), newest first: who changed which marks
   from what to what, when, and why. Read-only; the rules let no client edit or
   delete an event. Collapsed so the register stays the first thing on screen. */
function DayHistory({ classId, day, sheet }) {
  const { profile } = useAuth()
  const { data, isError } = useQuery({
    queryKey: ['fs-attendance', classId, day, 'audit'],
    queryFn: () => fetchAttendanceAudit(db, classId, day),
  })
  const events = Array.isArray(data) ? data : null
  const names = Object.fromEntries((sheet.students ?? []).map((s) => [s.student_id, `${s.last_name}, ${s.first_name}`]))
  const when = (t) => (t?.toDate ? t.toDate().toLocaleString() : '')
  return (
    <details className="mb-4" style={{ fontSize: 12.5, color: muted }}>
      <summary style={{ cursor: 'pointer' }}>
        Change history for this day{events ? ` (${events.length})` : ''}
      </summary>
      {isError && <p style={{ margin: '6px 0 0', color: red }}>The history could not be loaded. Try again in a moment.</p>}
      {events?.length === 0 && (
        <p style={{ margin: '6px 0 0' }}>No audited changes yet. Marks saved before change history was kept have no entries.</p>
      )}
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {(events ?? []).map((e) => (
          <li key={e.id} style={{ ...mono, fontSize: 11.5, lineHeight: 1.6 }}>
            {when(e.at)} · {describeAuditEvent(e, (id) => names[id] ?? 'a former student')}
            {e.actor_uid ? ` · by ${e.actor_uid === profile?.id ? 'you' : 'another account'}` : ''}
          </li>
        ))}
      </ul>
    </details>
  )
}

/* The whole term on one sheet: students down the side, the days the class met
   across the top -- the spreadsheet a teacher keeps beside the daily register,
   and what they show a student at grading time. Read-only on purpose; marking
   still happens on the day view. It re-uses the day view's query, which already
   reads every recorded day to build the P/L/A/E totals, so nothing new is
   fetched to render this. */
function TermSheet({ sheet, columns, onPickDay }) {
  // Cancelled / moved-away dates are labelled, so they never read as a
  // forgotten roll call.
  const offDays = Object.fromEntries((sheet.days ?? [])
    .filter((d) => sessionStatus(d) !== 'held')
    .map((d) => [d.date, sessionStatus(d) === 'cancelled' ? 'cancelled' : 'moved']))
  const heldCount = columns.filter((date) => !offDays[date]).length
  const cellOf = (sid, date) => sheet.byDate[date]?.[sid] ?? null

  function exportCsv() {
    const header = ['Student', ...columns.map(shortDate), ...STATUS_KEYS.map((k) => STATUS_META[k].label)]
    const rows = sheet.students.map((s) => {
      const totals = sheet.summary[s.student_id] ?? {}
      return [
        `${s.last_name}, ${s.first_name}`,
        ...columns.map((date) => {
          const status = cellOf(s.student_id, date)
          return status ? STATUS_META[status].short : ''
        }),
        ...STATUS_KEYS.map((k) => totals[k] ?? 0),
      ]
    })
    downloadCsv(stampedName('attendance-term'), [header, ...rows])
  }

  // The pinned column needs an opaque background of its own -- the grid slides
  // underneath it, not behind the page.
  const pinned = { position: 'sticky', left: 0, zIndex: 1, background: '#FFFFFF' }
  const pinnedHead = { ...pinned, zIndex: 2, background: '#F5F6F8' }

  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }}>
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: '14px 18px', borderBottom: `1px solid ${line}` }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>Whole Term</div>
          <div style={{ fontSize: 12, color: faint, marginTop: 2 }}>
            {heldCount} class {heldCount === 1 ? 'day' : 'days'}{columns.length > heldCount ? ` (+${columns.length - heldCount} cancelled or moved)` : ''} · pick a date at the top of a column to mark it
          </div>
        </div>
        <button
          onClick={exportCsv}
          disabled={columns.length === 0}
          className="transition hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ padding: '8px 15px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.16)', borderRadius: 9, cursor: 'pointer' }}
        >
          Export CSV
        </button>
      </div>

      {columns.length === 0 || sheet.students.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: faint, fontSize: 13 }}>
          {sheet.students.length === 0
            ? 'No students enrolled yet.'
            : 'No attendance recorded yet — take a day on the By Day tab and it appears here.'}
        </div>
      ) : (
        /* The term is far wider than the page, so it scrolls in here. The page
           itself must never scroll sideways. */
        <div className="overflow-x-auto">
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F5F6F8', borderBottom: '1px solid rgba(14,42,92,0.07)' }}>
                <th style={{ ...thHead, ...pinnedHead, minWidth: 170 }}>Student</th>
                {columns.map((date) => (
                  <th key={date} style={{ ...thHead, padding: '10px 6px', textAlign: 'center' }}>
                    <button
                      onClick={() => onPickDay(date)}
                      title={`Open ${date} on the By Day tab${offDays[date] ? ` (${offDays[date]})` : ''}`}
                      className="transition hover:brightness-110"
                      style={{ ...mono, fontSize: 11, fontWeight: 700, color: navy, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {shortDate(date)}
                      {offDays[date] && <span style={{ display: 'block', fontSize: 9.5, color: muted, fontWeight: 600 }}>{offDays[date]}</span>}
                    </button>
                  </th>
                ))}
                <th style={{ ...thHead, textAlign: 'center', borderLeft: '1px solid rgba(14,42,92,0.07)', whiteSpace: 'nowrap' }} title="Totals: Present / Late / Absent / Excused">
                  P / L / A / E
                </th>
              </tr>
            </thead>
            <tbody>
              {sheet.students.map((student) => {
                const sid = student.student_id
                const totals = sheet.summary[sid] ?? {}
                return (
                  <tr key={sid} style={{ borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                    <td style={{ ...pinned, padding: '11px 18px', fontWeight: 700, color: ink, whiteSpace: 'nowrap' }}>
                      {student.last_name}, {student.first_name}
                    </td>
                    {columns.map((date) => {
                      const status = cellOf(sid, date)
                      const m = status ? STATUS_META[status] : null
                      return (
                        <td key={date} style={{ padding: '11px 6px', textAlign: 'center' }} title={m ? `${date} · ${m.label}` : `${date} · ${offDays[date] ?? 'not recorded'}`}>
                          {m ? (
                            <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: m.fg }}>{m.short}</span>
                          ) : (
                            <span style={{ color: '#CBD5E1' }}>·</span>
                          )}
                        </td>
                      )
                    })}
                    <td style={{ ...mono, padding: '11px 18px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: 12, borderLeft: '1px solid rgba(14,42,92,0.05)' }}>
                      {STATUS_KEYS.map((key, i) => (
                        <span key={key}>
                          {i > 0 && <span style={{ color: '#CBD5E1' }}> / </span>}
                          <span style={{ color: STATUS_META[key].fg, fontWeight: 700 }}>{totals[key] ?? 0}</span>
                        </span>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* Attendance disputes filed by students. The teacher approves — choosing what
   the day actually was, since a dispute is as often a mis-click to undo as an
   absence to excuse — or rejects with a note. The decision is written to
   Firestore the moment the button is clicked; the row then slides out of the
   queue, so the panel only ever holds work still to be done. */
function ContestsPanel({ classId }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState(null)
  // The status Approve will write, per contest id. Absent an explicit pick the
  // row stays on 'excused', so approving an excused absence is still one click.
  const [picked, setPicked] = useState({})
  // Resolved contests animating out. They stay 'pending' in the query cache
  // until the slide finishes, so the row survives long enough to animate.
  const [leavingIds, setLeavingIds] = useState([])
  const [error, setError] = useState(null)

  const { data: contests } = useQuery({
    queryKey: ['fs-contests', classId],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'attendance_contests'), where('class_id', '==', classId)),
      )
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const ids = [...new Set(rows.map((c) => c.student_id))]
      const users = ids.length ? await fetchUsersByIds(ids) : []
      const nameOf = (id) => {
        const u = users.find((x) => x.id === id)
        return u ? `${u.last_name}, ${u.first_name}` : 'Student'
      }
      return rows
        .map((c) => ({ ...c, student_name: c.student_name || nameOf(c.student_id) }))
        .sort((a, b) => {
          if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1
          return (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0)
        })
    },
  })

  // Only undecided disputes appear; resolved ones slide out and stay gone.
  const pending = (contests ?? []).filter((c) => c.status === 'pending')
  if (pending.length === 0) return null
  const pendingCount = pending.filter((c) => !leavingIds.includes(c.id)).length

  /* The decision itself is already committed by the time these run — this only
     refreshes dependent views. The contests query is deliberately NOT
     invalidated here: doing so would drop the row mid-animation. */
  const refetchOthers = () => {
    queryClient.invalidateQueries({ queryKey: ['fs-attendance', classId] })
    queryClient.invalidateQueries({ queryKey: ['fs-pending-contests'] }) // refresh the bell
  }

  const beginLeave = (id) => setLeavingIds((ids) => [...ids, id])

  const finishLeave = (id) => {
    setLeavingIds((ids) => ids.filter((x) => x !== id))
    queryClient.invalidateQueries({ queryKey: ['fs-contests', classId] })
  }

  async function approve(c, status) {
    const label = STATUS_META[status].label
    setBusyId(c.id)
    setError(null)
    try {
      // Accepting the dispute corrects that day to the status the teacher
      // chose -- an audited correction like any other (A6), written before the
      // contest is closed so a failed write never leaves it "approved".
      await writeAttendanceDays(db, classId, profile.id, [{
        date: c.date,
        reason: `Attendance contest approved: ${label}`,
        next: (stored) => {
          if (sessionStatus(stored) !== 'held') throw refusal('That meeting was cancelled or moved, so its attendance cannot change.')
          return {
            ...(stored ?? {}),
            records: {
              ...(stored?.records ?? {}),
              [c.student_id]: { status, remarks: `${label} — contest approved`, excuse_url: c.excuse_url ?? null },
            },
            updated_at: serverTimestamp(),
          }
        },
      }])
      await updateDoc(doc(db, 'attendance_contests', c.id), {
        status: 'approved',
        resolved_at: serverTimestamp(),
        resolved_by: profile.id,
      })
      // Approving a contest rewrites that day, so the projection moves too.
      try {
        await syncAttendanceSummaries(classId, [c.student_id])
      } catch (mirrorErr) {
        console.error('attendance summary sync failed:', mirrorErr)
      }
      await notifyStudents({
        studentIds: [c.student_id],
        classId,
        createdBy: profile.id,
        type: 'attendance_contest',
        message: `Your attendance contest for ${c.date} was approved — it's now marked ${label}.`,
        link: `/student/classes/${classId}`,
      }).catch(() => {})
      refetchOthers()
      beginLeave(c.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function reject(c) {
    // Cancel now aborts. The `?? ''` turned a cancelled prompt into an empty
    // reason and rejected the contest regardless.
    const note = await promptDialog({
      title: 'Reject This Attendance Contest',
      message: 'The student is notified of the outcome and sees this note with it.',
      label: 'Reason (optional)',
      placeholder: 'e.g. The register was taken after the bell.',
      confirmLabel: 'Reject Contest',
      multiline: true,
      tone: 'danger',
    })
    if (note == null) return
    setBusyId(c.id)
    setError(null)
    try {
      await updateDoc(doc(db, 'attendance_contests', c.id), {
        status: 'rejected',
        resolution_note: note.trim() || null,
        resolved_at: serverTimestamp(),
        resolved_by: profile.id,
      })
      await notifyStudents({
        studentIds: [c.student_id],
        classId,
        createdBy: profile.id,
        type: 'attendance_contest',
        message: `Your attendance contest for ${c.date} was declined.`,
        link: `/student/classes/${classId}`,
      }).catch(() => {})
      refetchOthers()
      beginLeave(c.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mb-5" style={{ background: '#FFFFFF', border: `1px solid ${pendingCount ? 'rgba(245,197,24,0.55)' : line}`, borderRadius: 16, overflow: 'hidden' }}>
      <div className="flex items-center justify-between" style={{ padding: '14px 18px', borderBottom: `1px solid ${line}`, background: pendingCount ? 'rgba(245,197,24,0.08)' : 'rgba(14,42,92,0.02)' }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: ink }}>
          Attendance Disputes
          {pendingCount > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: goldDeep, background: 'rgba(245,197,24,0.22)', borderRadius: 999, padding: '2px 9px' }}>
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ margin: '12px 18px 0', fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>{error}</div>
      )}

      <div>
        {pending.map((c) => {
          const isLeaving = leavingIds.includes(c.id)
          const choice = picked[c.id] ?? 'excused'
          return (
            <div
              key={c.id}
              className={`flex flex-wrap items-start justify-between gap-3${isLeaving ? ' ak-resolve-out' : ''}`}
              onAnimationEnd={isLeaving ? (e) => e.target === e.currentTarget && finishLeave(c.id) : undefined}
              style={{ padding: '14px 18px', borderTop: '1px solid rgba(14,42,92,0.05)' }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: ink }}>{c.student_name}</span>
                  <span style={{ ...mono, fontSize: 12, color: muted }}>· {c.date}</span>
                  <span style={{ fontSize: 11, color: faint }}>(marked {c.current_status})</span>
                </div>
                <div style={{ fontSize: 13, color: muted, lineHeight: 1.5 }}>{c.reason}</div>
                {c.excuse_url && (
                  <a href={c.excuse_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: blueText }}>📎 View excuse document</a>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-3 flex-shrink-0">
                {/* What approving should write. A dispute is as often a mis-click
                    to undo as an absence to excuse, so the teacher says which. */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: faint, marginBottom: 5 }}>Approve as</div>
                  <StatusButtons status={choice} onToggle={(status) => setPicked((m) => ({ ...m, [c.id]: status }))} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approve(c, choice)} disabled={busyId === c.id || isLeaving} className="transition hover:brightness-110 disabled:opacity-50" style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#FAFAF6', background: green, border: 'none', borderRadius: 9, cursor: 'pointer' }}>
                    Approve
                  </button>
                  <button onClick={() => reject(c)} disabled={busyId === c.id || isLeaving} className="transition hover:brightness-105 disabled:opacity-50" style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: red, background: '#FFFFFF', border: '1.5px solid rgba(192,57,43,0.35)', borderRadius: 9, cursor: 'pointer' }}>
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AttendancePage() {
  const { classId } = useParams()
  const queryClient = useQueryClient()
  const [day, setDay] = useState(todayIso())
  const [view, setView] = useState('day')

  const { data: sheet, isLoading, isError } = useQuery({
    queryKey: ['fs-attendance', classId, day],
    queryFn: async () => {
      const cls = await getDoc(doc(db, 'classes', classId))
      if (!cls.exists()) throw new Error('Class not found')
      const schedule = cls.data().schedule ?? null
      const startDate = cls.data().start_date ?? null
      const ids = cls.data().student_ids ?? []
      const users = ids.length ? await fetchUsersByIds(ids) : []
      const students = users
        .map((u) => ({ student_id: u.id, first_name: u.first_name, last_name: u.last_name }))
        .sort((a, b) =>
          `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
        )

      // This day's sheet.
      const daySnap = await getDoc(doc(db, 'classes', classId, 'attendance', day))
      const dayData = daySnap.exists() ? daySnap.data() : {}

      /* All-time P/L/A/E tally per student, across every recorded day -- and,
         from the same walk, each day's statuses keyed by date, which is the
         term grid. One read serves both; the term view adds no query. */
      const allSnap = await getDocs(collection(db, 'classes', classId, 'attendance'))
      const summary = {}
      const byDate = {}
      const days = allSnap.docs.map((d) => ({ id: d.id, ...d.data(), date: d.data().date ?? d.id }))
      allSnap.forEach((d) => {
        const recs = d.data().records ?? {}
        for (const [sid, rec] of Object.entries(recs)) {
          if (!rec?.status) continue
          ;(summary[sid] ??= {})[rec.status] = (summary[sid][rec.status] ?? 0) + 1
          ;(byDate[d.id] ??= {})[sid] = rec.status
        }
      })

      return {
        students,
        records: dayData.records ?? {},
        session: daySnap.exists() ? dayData : null,
        days,
        summary,
        byDate,
        schedule,
        startDate,
      }
    },
  })

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['fs-attendance', classId] })

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
            Attendance
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1" style={{ background: 'rgba(14,42,92,0.05)', borderRadius: 999, padding: 3 }}>
            {[['day', 'By Day'], ['term', 'Whole Term']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className="transition"
                style={{
                  padding: '7px 15px',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: sans,
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  ...(view === key
                    ? { background: '#FFFFFF', color: navy, boxShadow: '0 1px 2px rgba(14,42,92,0.12)' }
                    : { background: 'transparent', color: muted }),
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {view === 'day' && (
            <input
              type="date"
              value={day}
              max={todayIso()}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="ak-input"
              style={{ ...fieldStyle, padding: '11px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            />
          )}
        </div>
      </div>

      <ContestsPanel classId={classId} />

      {isLoading ? (
        <SkeletonTable rows={8} cols={5} label="Loading attendance" />
      ) : isError || !sheet ? (
        <p style={{ color: red }}>Class not found.</p>
      ) : view === 'term' ? (
        <TermSheet
          sheet={sheet}
          columns={termColumns(Object.keys(sheet.byDate), sheet.schedule, todayIso(), sheet.startDate)}
          onPickDay={(date) => {
            setDay(date)
            setView('day')
          }}
        />
      ) : (
        <>
          <SessionControls classId={classId} day={day} sheet={sheet} refetch={refetch} />
          <DayHistory classId={classId} day={day} sheet={sheet} />
          {sessionStatus(sheet.session) === 'held' ? (
            <AttendanceSheet
              key={`${classId}-${day}-${JSON.stringify(sheet.records)}`}
              classId={classId}
              day={day}
              sheet={sheet}
              refetch={refetch}
            />
          ) : (
            <p style={{ fontSize: 13, color: muted, margin: 0 }}>
              No attendance is taken for this date. It does not count toward any student's attendance.
            </p>
          )}
        </>
      )}
    </div>
  )
}
