import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { CALENDARS, estimateAnnual, pesos } from '@/lib/pricing'
import { toast } from '@/components/ui/toast'
import { SkeletonTable } from '@/components/ui/Skeleton'

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
                        <span className="font-mono">{pesos(estimateAnnual(teacherSeats, studentSeats))}</span> per school year
                        <span className="text-zinc-500"> · shown to them as an estimate; prices not yet confirmed</span>
                      </dd>
                      <dt className="text-zinc-500">Requested</dt>
                      <dd className="text-zinc-300">{when(r.created_at)}</dd>
                    </dl>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {/* Wired in the next commit: approval creates the school
                        through Flask and needs the endpoint first. */}
                    <button
                      type="button"
                      disabled
                      title="Approval arrives with the next update"
                      className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-zinc-950 disabled:opacity-40"
                    >
                      Approve
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
    </div>
  )
}
