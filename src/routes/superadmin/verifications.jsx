import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Timestamp, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { trialEndsFrom } from '@/lib/pricing'
import { teacherApprovalMessage } from '@/lib/approvalMessage'
import { notifyTeacherApproval } from '@/lib/superadmin'
import { db } from '@/lib/firebase'
import { toast } from '@/components/ui/toast'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { ID_TYPES } from '@/routes/pending-verification'
import MessageDialog from './MessageDialog'
import {
  APPROVED_TEACHERS_KEY,
  PENDING_TEACHERS_KEY,
  fetchApprovedTeachers,
  fetchPendingTeachers,
} from './queues'

/**
 * Identity checks for self-registered teachers.
 *
 * The "Individual" path on /register creates a teacher nobody vouched for, so
 * the account opens only after one of us has looked at the ID they linked
 * (components/ProtectedRoute holds the gate). This is that queue.
 *
 * Firestore-direct, unlike the subscriber console next door: the review is
 * one field on the teacher's own profile, and firestore.rules lets the super
 * admin claim — and nobody else — set verification_status to approved or
 * rejected. There is no plan catalogue or seat arithmetic for Flask to own.
 * Approving still calls Flask once, after the fact, to send the welcome
 * email — that needs the mail credentials only the server holds (T-69's
 * sender, reused). A failed send never undoes the approval; it just means
 * the notice below has to go out by hand instead.
 *
 * Links open in a new tab; we never fetch the image ourselves. The file is
 * whatever the teacher shared from their own Drive — the ID check was built
 * before Storage was provisioned (2026-09-12), so a link is still the
 * attachment path here.
 */

const LABEL = Object.fromEntries(ID_TYPES.map((t) => [t.value, t.label]))

const signInUrl = () => `${window.location.origin}/login`

function when(ts) {
  const d = ts?.toDate?.()
  return d ? d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

export default function SuperAdminVerificationsPage() {
  const queryClient = useQueryClient()
  const { data: rows, isLoading, error } = useQuery({
    queryKey: PENDING_TEACHERS_KEY,
    queryFn: fetchPendingTeachers,
  })
  const { data: approved } = useQuery({
    queryKey: APPROVED_TEACHERS_KEY,
    queryFn: fetchApprovedTeachers,
  })
  const [rejecting, setRejecting] = useState(null) // uid whose note box is open
  const [note, setNote] = useState('')
  const [message, setMessage] = useState(null) // { name, subject, body } to copy

  const review = useMutation({
    mutationFn: async ({ uid, status, note }) => {
      /* Computed once and both written and returned, so the date in the
         letter is the date in the database. Building it again in onSuccess
         would be a second clock reading, and a teacher told the wrong last
         day of their free month has been told the wrong thing. */
      const trialEndsAt = status === 'approved' ? trialEndsFrom() : null
      await updateDoc(doc(db, 'users', uid), {
        verification_status: status,
        verification_note: status === 'rejected' ? note.trim() : '',
        verification_reviewed_at: serverTimestamp(),
        // The free month starts when the account opens, not when they
        // registered — the days spent waiting on us are not theirs to lose.
        ...(status === 'approved' && {
          subscription_status: 'trial',
          trial_ends_at: Timestamp.fromDate(trialEndsAt),
        }),
      })
      // The Firestore write above is what actually opens the account; this
      // is best-effort on top of it. The server holds the mail credentials
      // the browser never can, so it is the one part of the job that has to
      // happen there — but a mail outage must not read as the approval
      // having failed, so a rejected notify call is swallowed here.
      const notice = status === 'approved' ? await notifyTeacherApproval(uid).catch(() => null) : null
      return { trialEndsAt, notice }
    },
    onSuccess: ({ trialEndsAt, notice }, { status, name, teacher }) => {
      const emailed = notice?.sent
      toast.success(
        status === 'approved'
          ? `${name} approved — their account is open and the free month has started.` +
              (emailed ? ` The welcome email went out to ${notice.to}.` : ' The welcome email did not go out automatically — send it by hand below.')
          : `${name} sent back with your note.`,
      )
      if (status === 'approved') {
        setMessage({
          name,
          sent: emailed,
          sentTo: notice?.to,
          ...teacherApprovalMessage({
            firstName: teacher?.first_name,
            email: teacher?.email,
            trialEndsAt,
            signInUrl: signInUrl(),
          }),
        })
      }
      setRejecting(null)
      setNote('')
      queryClient.invalidateQueries({ queryKey: PENDING_TEACHERS_KEY })
      queryClient.invalidateQueries({ queryKey: APPROVED_TEACHERS_KEY })
    },
    onError: () => toast.error('That did not save. Check the rules deploy and try again.'),
  })

  if (isLoading) return <SkeletonTable rows={4} cols={4} tone="dark" label="Loading verifications" />
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300">
        Could not load the queue. {error.message}
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teacher verifications</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Self-registered teachers waiting on an ID check. Their account opens the moment you approve.
          </p>
        </div>
        <span className="font-mono text-xs text-zinc-500">{rows.length} pending</span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-10 text-center text-sm text-zinc-500">
          Nothing waiting. New individual sign-ups land here.
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map((t) => {
            const name = `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || t.email
            const busy = review.isPending && review.variables?.uid === t.id
            return (
              <li key={t.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-zinc-100">{name}</div>
                    <div className="mt-0.5 font-mono text-xs text-zinc-500">{t.email}{t.phone ? ` · ${t.phone}` : ''}</div>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                      <dt className="text-zinc-500">School</dt>
                      <dd className="text-zinc-300">
                        {t.teaching_school_name ?? '—'}{t.campus ? `, ${t.campus}` : ''}
                        {t.school_type ? ` · ${t.school_type}` : ''}{t.position ? ` · ${t.position.replace('_', ' ')}` : ''}
                      </dd>
                      <dt className="text-zinc-500">ID</dt>
                      <dd className="text-zinc-300">
                        {LABEL[t.verification_id_type] ?? t.verification_id_type ?? '—'}
                        {t.verification_id_number ? <span className="font-mono"> · {t.verification_id_number}</span> : null}
                      </dd>
                      <dt className="text-zinc-500">Submitted</dt>
                      <dd className="text-zinc-300">{when(t.verification_submitted_at)}</dd>
                    </dl>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <a
                      href={t.verification_id_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500"
                    >
                      Open ID ↗
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => review.mutate({ uid: t.id, status: 'approved', name, teacher: t })}
                      className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { setRejecting(rejecting === t.id ? null : t.id); setNote('') }}
                      className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Reject…
                    </button>
                  </div>
                </div>

                {rejecting === t.id && (
                  <div className="mt-4 flex flex-col gap-2 border-t border-zinc-800 pt-4">
                    <label htmlFor={`note-${t.id}`} className="text-xs font-semibold text-zinc-400">
                      What should they fix? They see this on their screen.
                    </label>
                    <textarea
                      id={`note-${t.id}`}
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="The link asks for access — share it with “anyone with the link”."
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                    />
                    <div>
                      <button
                        type="button"
                        disabled={busy || !note.trim()}
                        onClick={() => review.mutate({ uid: t.id, status: 'rejected', note, name })}
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-400 disabled:opacity-50"
                      >
                        Send back
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {message && (
        <MessageDialog
          title={`Welcome notice — ${message.name}`}
          subtitle={
            message.sent
              ? `Emailed to ${message.sentTo} automatically. Copy it below only if you need to send it again.`
              : 'The automatic email did not go out — copy this into an email to the teacher yourself.'
          }
          message={message}
          copiedHint="Copied. Paste it into an email to the teacher."
          onClose={() => setMessage(null)}
        />
      )}

      {approved?.length > 0 && (
        <div className="mt-10">
          <h2 className="text-base font-bold text-zinc-200">Recently approved</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            The welcome email goes out on approval. Open it again here to resend it by hand.
          </p>
          <ul className="mt-3 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40">
            {approved.map((t) => {
              const name = `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || t.email
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 text-sm">
                    <span className="font-semibold text-zinc-200">{name}</span>
                    <span className="text-zinc-500"> · {t.email} · {when(t.verification_reviewed_at)}</span>
                    {t.verification_notice_sent_at ? (
                      <span className="ml-2 text-xs text-emerald-400">emailed</span>
                    ) : (
                      <span className="ml-2 text-xs text-amber-400">not sent — copy it</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setMessage({
                        name,
                        sent: Boolean(t.verification_notice_sent_at),
                        sentTo: t.verification_notice_to,
                        ...teacherApprovalMessage({
                          firstName: t.first_name,
                          email: t.email,
                          trialEndsAt: t.trial_ends_at,
                          signInUrl: signInUrl(),
                        }),
                      })
                    }
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500"
                  >
                    Welcome notice
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
