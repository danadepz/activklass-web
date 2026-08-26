import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { fetchUsersByIds } from '@/lib/roster'
import { notifyStudents } from '@/lib/notifications'
import { syncAttendanceSummaries } from '@/lib/attendanceMirror'
import { useAuth } from '@/context/useAuth'
import { navy, navyDeep, ink, gold, goldDeep, muted, faint, green, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { promptDialog } from '@/components/ui/dialogs'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { MetricCard } from '@/components/ui/Card'

const STATUS_META = {
  present: { short: 'P', label: 'Present', fg: green, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.4)', fillBg: green, fillFg: '#FFFFFF' },
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
  // Teacher's own attendance for this date.
  const [teacher, setTeacher] = useState(sheet.teacher ?? emptyEntry())
  const [teacherDirty, setTeacherDirty] = useState(false)
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

  const toggleTeacher = (status) => {
    setTeacher((t) => ({ ...t, status: t.status === status ? 'none' : status }))
    setTeacherDirty(true)
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
  const hasChanges = dirtyCount > 0 || teacherDirty

  // Live tallies for the stat cards (reflect unsaved edits).
  const statuses = sheet.students.map((s) => current(s.student_id).status)
  const total = sheet.students.length
  const presentCount = statuses.filter((x) => x === 'present').length
  const absentCount = statuses.filter((x) => x === 'absent').length
  const lateCount = statuses.filter((x) => x === 'late').length
  const rate = total ? `${Math.round((presentCount / total) * 100)}%` : '—'

  async function save() {
    setSaving(true)
    setError(null)
    try {
      // One doc per day holds the full sheet; status 'none' is simply omitted
      // from the records map (so re-saving a cleared student removes them).
      const records = {}
      for (const s of sheet.students) {
        const entry = current(s.student_id)
        if (entry.status && entry.status !== 'none') {
          records[s.student_id] = { status: entry.status, remarks: entry.remarks || '' }
        }
      }
      const teacherEntry =
        teacher.status && teacher.status !== 'none'
          ? { status: teacher.status, remarks: teacher.remarks || '' }
          : null

      await setDoc(doc(db, 'classes', classId, 'attendance', day), {
        date: day,
        records,
        teacher: teacherEntry,
        recorded_by: profile.id,
        updated_at: serverTimestamp(),
      })
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
      setTeacherDirty(false)
      refetch()
    } catch (err) {
      setError(err.message)
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
          {saving ? 'Saving…' : hasChanges ? `Save attendance${dirtyCount ? ` · ${dirtyCount}` : ''}` : 'All saved'}
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-3" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>
          {error}
        </div>
      )}

      {/* Teacher's own attendance for the session */}
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 18 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>My attendance (teacher)</div>
          <div style={{ fontSize: 12, color: faint, marginTop: 2 }}>
            {profile.first_name} {profile.last_name} · your status for this session
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusButtons status={teacher.status} onToggle={toggleTeacher} />
          <input
            className="ak-input"
            value={teacher.remarks ?? ''}
            onChange={(e) => {
              setTeacher((t) => ({ ...t, remarks: e.target.value }))
              setTeacherDirty(true)
            }}
            placeholder="Remarks (optional)"
            disabled={teacher.status === 'none'}
            style={{ ...remarksStyle(teacher.status === 'none'), width: 224 }}
          />
        </div>
      </div>

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

/* Attendance disputes filed by students. The teacher approves (which marks that
   date as excused on the attendance sheet) or rejects with a note. The decision
   is written to Firestore the moment the button is clicked; the row then slides
   out of the queue, so the panel only ever holds work still to be done. */
function ContestsPanel({ classId }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState(null)
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

  async function approve(c) {
    setBusyId(c.id)
    setError(null)
    try {
      await updateDoc(doc(db, 'attendance_contests', c.id), {
        status: 'approved',
        resolved_at: serverTimestamp(),
        resolved_by: profile.id,
      })
      // Accepting the dispute marks that day excused for the student.
      await updateDoc(doc(db, 'classes', classId, 'attendance', c.date), {
        [`records.${c.student_id}`]: {
          status: 'excused',
          remarks: 'Excused — contest approved',
          excuse_url: c.excuse_url ?? null,
        },
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
        message: `Your attendance contest for ${c.date} was approved — it's now marked Excused.`,
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
      title: 'Reject this attendance contest',
      message: 'The student is notified of the outcome and sees this note with it.',
      label: 'Reason (optional)',
      placeholder: 'e.g. The register was taken after the bell.',
      confirmLabel: 'Reject contest',
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
          Attendance disputes
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
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => approve(c)} disabled={busyId === c.id || isLeaving} className="transition hover:brightness-110 disabled:opacity-50" style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#FAFAF6', background: green, border: 'none', borderRadius: 9, cursor: 'pointer' }}>
                  Approve
                </button>
                <button onClick={() => reject(c)} disabled={busyId === c.id || isLeaving} className="transition hover:brightness-105 disabled:opacity-50" style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: red, background: '#FFFFFF', border: '1.5px solid rgba(192,57,43,0.35)', borderRadius: 9, cursor: 'pointer' }}>
                  Reject
                </button>
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

  const { data: sheet, isLoading, isError } = useQuery({
    queryKey: ['fs-attendance', classId, day],
    queryFn: async () => {
      const cls = await getDoc(doc(db, 'classes', classId))
      if (!cls.exists()) throw new Error('Class not found')
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

      // All-time P/L/A/E tally per student, across every recorded day.
      const allSnap = await getDocs(collection(db, 'classes', classId, 'attendance'))
      const summary = {}
      allSnap.forEach((d) => {
        const recs = d.data().records ?? {}
        for (const [sid, rec] of Object.entries(recs)) {
          if (!rec?.status) continue
          ;(summary[sid] ??= {})[rec.status] = (summary[sid][rec.status] ?? 0) + 1
        }
      })

      return {
        students,
        records: dayData.records ?? {},
        teacher: dayData.teacher ?? null,
        summary,
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
          <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>Track and record daily student attendance for the selected date.</p>
        </div>
        <input
          type="date"
          value={day}
          max={todayIso()}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="ak-input"
          style={{ ...fieldStyle, padding: '11px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        />
      </div>

      <ContestsPanel classId={classId} />

      {isLoading ? (
        <SkeletonTable rows={8} cols={5} label="Loading attendance" />
      ) : isError || !sheet ? (
        <p style={{ color: red }}>Class not found.</p>
      ) : (
        <AttendanceSheet
          key={`${classId}-${day}-${JSON.stringify(sheet.records)}-${JSON.stringify(sheet.teacher)}`}
          classId={classId}
          day={day}
          sheet={sheet}
          refetch={refetch}
        />
      )}
    </div>
  )
}
