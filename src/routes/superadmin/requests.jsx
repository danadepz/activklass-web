import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { CALENDARS, MONTHS_PER_SCHOOL_YEAR, TRIAL_DAYS, estimateAnnual, pesos } from '@/lib/pricing'
import { approveRequest } from '@/lib/superadmin'
import { toast } from '@/components/ui/toast'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { Dialog, Field, inputCls } from './index'

/**
 * School access requests -- the "Institution" path on /register.
 *
 * A school cannot create itself: the requester leaves their details and the
 * seats they want in subscription_requests, and one of us turns that into a
 * school here. Until this page existed the only way to see a request was the
 * Firebase console.
 *
 * Firestore-direct for the list and for Decline, like the verifications queue
 * next door: firestore.rules lets the super admin claim -- and nobody else --
 * read or update this collection, and declining is one status field plus a
 * note. Approving is the opposite case and goes through Flask: it creates the
 * school and the subscription and promotes the requester's account, three
 * writes the client is deliberately not allowed to make.
 */

const CALENDAR_LABEL = Object.fromEntries(CALENDARS.map((c) => [c.value, c.label]))

async function fetchPending() {
  const snap = await getDocs(
    query(collection(db, 'subscription_requests'), where('status', '==', 'pending')),
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.created_at?.seconds ?? 0) - (b.created_at?.seconds ?? 0))
}

function when(ts) {
  const d = ts?.toDate?.()
  return d ? d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function n(v) {
  return Number(v ?? 0).toLocaleString('en-PH')
}

export default function SuperAdminRequestsPage() {
  const queryClient = useQueryClient()
  const { data: rows, isLoading, error } = useQuery({ queryKey: ['sa-requests'], queryFn: fetchPending })
  const [declining, setDeclining] = useState(null) // request id whose note box is open
  const [note, setNote] = useState('')
  const [approving, setApproving] = useState(null) // the request open in the approve dialog

  const decline = useMutation({
    mutationFn: async ({ id, note }) => {
      await updateDoc(doc(db, 'subscription_requests', id), {
        status: 'declined',
        decision_note: note.trim(),
        decided_at: serverTimestamp(),
      })
    },
    onSuccess: (_, { school }) => {
      toast.success(`${school} declined. Their teacher account is untouched.`)
      setDeclining(null)
      setNote('')
      queryClient.invalidateQueries({ queryKey: ['sa-requests'] })
    },
    onError: () => toast.error('That did not save. Check the rules deploy and try again.'),
  })

  if (isLoading) return <SkeletonTable rows={4} cols={4} tone="dark" label="Loading school requests" />
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300">
        Could not load the requests. {error.message}
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">School requests</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Schools asking for access from the sign-up page. Approving creates the school and makes the
            requester its admin.
          </p>
        </div>
        <span className="font-mono text-xs text-zinc-500">{rows.length} pending</span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-10 text-center text-sm text-zinc-500">
          Nothing waiting. New school requests from /register land here.
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map((r) => {
            const contact = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || r.email
            const school = r.school_name || 'Unnamed school'
            const busy = decline.isPending && decline.variables?.id === r.id
            const teacherSeats = Number(r.teacher_seats ?? 0)
            const studentSeats = Number(r.student_seats ?? 0)
            return (
              <li key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-zinc-100">
                      {school}{r.campus ? <span className="text-zinc-400">, {r.campus}</span> : null}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {r.school_type ? `${r.school_type} · ` : ''}
                      {CALENDAR_LABEL[r.academic_calendar] ?? r.academic_calendar ?? '—'}
                    </div>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                      <dt className="text-zinc-500">Contact</dt>
                      <dd className="text-zinc-300">
                        {contact}{r.position ? ` · ${String(r.position).replace(/_/g, ' ')}` : ''}
                        <span className="font-mono text-zinc-400"> · {r.email}{r.phone ? ` · ${r.phone}` : ''}</span>
                      </dd>
                      <dt className="text-zinc-500">Seats</dt>
                      <dd className="text-zinc-300">
                        {n(teacherSeats)} teachers × {n(r.students_per_teacher)} students each ={' '}
                        <span className="font-mono">{n(studentSeats)}</span> student seats
                      </dd>
                      <dt className="text-zinc-500">Estimate</dt>
                      <dd className="text-zinc-300">
                        {/* The same figure, the same way, as the seats step on
                            /register showed it to them -- so what they saw and
                            what we approve on is one number, not two. */}
                        <span className="font-mono">{pesos(estimateAnnual(teacherSeats, studentSeats))}</span> per school year
                        <span className="text-zinc-500"> · {pesos(estimateAnnual(teacherSeats, studentSeats) / MONTHS_PER_SCHOOL_YEAR)} / month · first {TRIAL_DAYS} days free · shown to them as an estimate; prices not yet confirmed</span>
                      </dd>
                      <dt className="text-zinc-500">Requested</dt>
                      <dd className="text-zinc-300">{when(r.created_at)}</dd>
                    </dl>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setApproving(r)}
                      className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50"
                    >
                      Approve…
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { setDeclining(declining === r.id ? null : r.id); setNote('') }}
                      className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Decline…
                    </button>
                  </div>
                </div>

                {declining === r.id && (
                  <div className="mt-4 flex flex-col gap-2 border-t border-zinc-800 pt-4">
                    <label htmlFor={`note-${r.id}`} className="text-xs font-semibold text-zinc-400">
                      Why? Kept on the request for our own record; the school is told by hand.
                    </label>
                    <textarea
                      id={`note-${r.id}`}
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Could not confirm the school exists under this name."
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                    />
                    <div>
                      <button
                        type="button"
                        disabled={busy || !note.trim()}
                        onClick={() => decline.mutate({ id: r.id, note, school })}
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-400 disabled:opacity-50"
                      >
                        Decline request
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {approving && (
        <ApproveDialog
          request={approving}
          onClose={() => setApproving(null)}
          onDone={(res) => {
            setApproving(null)
            toast.success(
              `${res.school.name} is set up. ${res.admin.first_name ?? 'The requester'} is now its admin and signs in with the password they already have.`,
            )
            queryClient.invalidateQueries({ queryKey: ['sa-requests'] })
            queryClient.invalidateQueries({ queryKey: ['sa-subscribers'] })
          }}
        />
      )}
    </div>
  )
}

/**
 * Review-and-confirm before the school is created.
 *
 * Everything starts as what the school asked for; the superadmin can correct
 * a name or negotiate the seats here, and what they confirm is what the
 * server writes. There is no password field on purpose: the requester's own
 * account becomes the admin, and they keep the password they chose.
 */
function ApproveDialog({ request, onClose, onDone }) {
  const [form, setForm] = useState({
    name: request.school_name ?? '',
    campus: request.campus ?? '',
    school_year_current: '',
    teacher_seats: String(request.teacher_seats ?? ''),
    student_seats: String(request.student_seats ?? ''),
  })
  const [error, setError] = useState(null)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const requester = `${request.first_name ?? ''} ${request.last_name ?? ''}`.trim() || request.email

  const approve = useMutation({
    mutationFn: () =>
      approveRequest(request.id, {
        name: form.name.trim(),
        campus: form.campus.trim(),
        school_year_current: form.school_year_current.trim() || null,
        teacher_seats: Number(form.teacher_seats),
        student_seats: Number(form.student_seats),
      }),
    onSuccess: onDone,
    onError: (err) => setError(err.message),
  })

  const submit = (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('The school needs a name.')
    const t = Number(form.teacher_seats)
    const s = Number(form.student_seats)
    if (!Number.isInteger(t) || t < 1 || !Number.isInteger(s) || s < 1) {
      return setError('Seats must be whole numbers above zero.')
    }
    approve.mutate()
  }

  const annual = estimateAnnual(Number(form.teacher_seats) || 0, Number(form.student_seats) || 0)

  return (
    <Dialog
      title={`Approve ${request.school_name || 'this school'}`}
      subtitle="Creates the school and its subscription on a 30-day trial, and makes the requester its admin. Check the details; what you confirm is what gets written."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <Field label="School name">
          <input value={form.name} onChange={set('name')} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Campus" hint="Optional.">
            <input value={form.campus} onChange={set('campus')} className={inputCls} />
          </Field>
          <Field label="Current school year" hint="Optional.">
            <input value={form.school_year_current} onChange={set('school_year_current')} className={inputCls} placeholder="2026-2027" />
          </Field>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Seats</p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Field label="Teacher seats">
              <input type="number" min="1" step="1" value={form.teacher_seats} onChange={set('teacher_seats')} className={inputCls} />
            </Field>
            <Field label="Student seats">
              <input type="number" min="1" step="1" value={form.student_seats} onChange={set('student_seats')} className={inputCls} />
            </Field>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            They asked for {Number(request.teacher_seats ?? 0).toLocaleString('en-PH')} teachers × {Number(request.students_per_teacher ?? 0).toLocaleString('en-PH')} students each.
            Estimate at these seats: <span className="font-mono text-zinc-300">{pesos(annual)}</span> per school year — an estimate until the prices are confirmed.
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-400">
          <span className="font-semibold text-zinc-200">{requester}</span> ({request.email}) becomes the school's admin.
          Their account is promoted in place — same email, same password, no temporary credential to send.
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={approve.isPending}
            className="flex-1 rounded-lg bg-emerald-400 py-2.5 text-sm font-bold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50"
          >
            {approve.isPending ? 'Creating the school…' : 'Approve and create the school'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-800 py-2.5 text-sm font-semibold text-zinc-400"
          >
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  )
}
