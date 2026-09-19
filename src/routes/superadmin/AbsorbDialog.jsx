import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { issuedLoginId } from '@/lib/logins'
import { absorbTeacher } from '@/lib/superadmin'
import { Dialog, Field, inputCls } from './index'

/**
 * Absorb a solo teacher into this school's subscription (T-71).
 *
 * MOVES the account, never re-creates it: classes, quizzes, syllabi,
 * gradebooks and grading presets all hang off the teacher's uid, so nothing
 * needs re-keying. Only the login changes, to the same issued shape every
 * other teacher at this school already signs in with. The lookup and the
 * login preview below are read-only and client-side (Firestore + the same
 * builder the server uses, lib/logins.js); the move itself has to be a
 * server call because it renames an Auth email and writes students' and
 * classes' documents a client may not touch directly.
 *
 * Two steps in one dialog rather than a wizard: find the teacher by email,
 * then -- once found -- type the employee number and see the resulting
 * login before doing anything. That preview is the whole point: an
 * institution-issued login can never be undone by retyping it, since the
 * Auth email really did change.
 */
export default function AbsorbDialog({ schoolId, schoolName, onClose, onDone }) {
  const [email, setEmail] = useState('')
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [teacher, setTeacher] = useState(null) // { uid, firstName, lastName, email }
  const [lookupError, setLookupError] = useState(null)
  const [confirmError, setConfirmError] = useState(null)
  const [finding, setFinding] = useState(false)

  const { data: school } = useQuery({
    queryKey: ['sa-school-prefix', schoolId],
    queryFn: async () => (await getDoc(doc(db, 'schools', schoolId))).data() ?? {},
    staleTime: 60 * 1000,
  })
  const prefix = school?.login_prefix ?? null

  const preview = teacher && prefix ? issuedLoginId(prefix, employeeNumber) : ''

  const find = async (e) => {
    e.preventDefault()
    setLookupError(null)
    setTeacher(null)
    const address = email.trim().toLowerCase()
    if (!address) return setLookupError("Enter the teacher's email address.")
    setFinding(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('email', '==', address), limit(1)),
      )
      if (snap.empty) {
        setLookupError('No ActivKlass account uses that email.')
        return
      }
      const found = snap.docs[0]
      const data = found.data()
      if (data.role !== 'teacher') {
        setLookupError('That account is not a teacher.')
        return
      }
      if (data.school_id) {
        setLookupError('That teacher already belongs to a school.')
        return
      }
      setTeacher({
        uid: found.id,
        firstName: data.first_name ?? '',
        lastName: data.last_name ?? '',
        email: data.email ?? address,
      })
    } catch {
      setLookupError('Could not look that up. Try again.')
    } finally {
      setFinding(false)
    }
  }

  const absorb = useMutation({
    mutationFn: () => absorbTeacher(schoolId, { teacherUid: teacher.uid, employeeNumber }),
    onSuccess: (res) =>
      onDone({
        teacher,
        loginId: res.login_id,
        studentsMoved: res.students_moved,
        classesArchived: res.classes_archived,
      }),
    onError: (err) => setConfirmError(err.message),
  })

  const confirm = (e) => {
    e.preventDefault()
    setConfirmError(null)
    // issuedLoginId already applies the real rule (the last 6 digits after
    // stripping anything that isn't one) -- an empty preview means it failed,
    // so trust that instead of re-deriving a stricter, wrong check here (a
    // digits-only regex rejected a normally-formatted "2026-654321").
    if (!preview) {
      return setConfirmError('The employee number needs at least 6 digits.')
    }
    absorb.mutate()
  }

  return (
    <Dialog
      title={`Absorb a teacher into ${schoolName}`}
      subtitle="Moves their existing account under this school's subscription — same classes, quizzes and records, a new login. This cannot be undone by retyping the old one: the sign-in email really changes."
      onClose={onClose}
    >
      <form onSubmit={find} className="space-y-3">
        {lookupError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
            {lookupError}
          </div>
        )}
        <Field label="Teacher's email">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setTeacher(null)
            }}
            className={inputCls}
            autoComplete="off"
            placeholder="roch@personalmail.example"
          />
        </Field>
        {!teacher && (
          <button
            type="submit"
            disabled={finding}
            className="w-full rounded-lg border border-zinc-700 py-2 text-sm font-semibold text-zinc-200 hover:border-zinc-600 disabled:opacity-50"
          >
            {finding ? 'Looking up…' : 'Find teacher'}
          </button>
        )}
      </form>

      {teacher && (
        <form onSubmit={confirm} className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-300">
            <span className="font-semibold text-zinc-100">
              {`${teacher.firstName} ${teacher.lastName}`.trim() || teacher.email}
            </span>{' '}
            · <span className="font-mono">{teacher.email}</span>
          </div>

          {confirmError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
              {confirmError}
            </div>
          )}

          {!prefix && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-300">
              This school has no login prefix configured yet (Users tab → Login prefix). Set one
              first — a login cannot be issued without it.
            </div>
          )}

          <Field label="Employee number" hint="Same number the school would use to issue any other teacher's login.">
            <input
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              className={inputCls}
              placeholder="2026-001234"
            />
          </Field>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs">
            <span className="text-zinc-500">New login: </span>
            <span className="font-mono text-zinc-100">{preview || '—'}</span>
            {preview && (
              <p className="mt-1 text-[11px] text-zinc-500">
                Their old sign-in ({teacher.email}) stops working the moment this runs. Their
                password does not change.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={absorb.isPending || !preview}
              className="flex-1 rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {absorb.isPending ? 'Absorbing…' : 'Confirm absorption'}
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
      )}

      {!teacher && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="text-xs font-semibold text-zinc-500 hover:text-zinc-300">
            Cancel
          </button>
        </div>
      )}
    </Dialog>
  )
}
