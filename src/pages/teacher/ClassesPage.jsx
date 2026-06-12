import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../context/useAuth'

const EMPTY_FORM = { section: '', subject: '', academic_year: '2025-2026' }

export default function ClassesPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)

  const { data: classes, isLoading } = useQuery({
    queryKey: ['fs-classes', profile.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'classes'), where('teacher_id', '==', profile.id)),
      )
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
  })

  const createClass = useMutation({
    mutationFn: async () => {
      if (!form.section.trim() || !form.subject.trim()) {
        throw new Error('Section and subject are required')
      }
      await addDoc(collection(db, 'classes'), {
        section: form.section.trim(),
        subject: form.subject.trim(),
        academic_year: form.academic_year.trim() || '2025-2026',
        teacher_id: profile.id,
        student_ids: [],
        created_at: serverTimestamp(),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fs-classes'] })
      setShowCreate(false)
      setForm(EMPTY_FORM)
      setError(null)
    },
    onError: (err) => setError(err.message),
  })

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">My Classes</h2>
          <p className="text-slate-500 mt-1">Create class sections and manage student rosters.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700"
        >
          + New Class
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-400 mt-8">Loading classes…</p>
      ) : classes?.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 mt-6 text-center text-slate-400">
          No classes yet. Create your first class section to start building its roster.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {classes?.map((c) => (
            <Link
              key={c.id}
              to={`/teacher/classes/${c.id}`}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-sm transition"
            >
              <h3 className="font-semibold text-slate-800">{c.section}</h3>
              <p className="text-sm text-slate-500">{c.subject}</p>
              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-slate-500">{c.academic_year}</span>
                <span className="rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-0.5 font-medium">
                  {c.student_ids?.length ?? 0} student{(c.student_ids?.length ?? 0) === 1 ? '' : 's'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center px-4 z-10">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createClass.mutate()
            }}
            className="bg-white rounded-xl p-6 w-full max-w-md space-y-4"
          >
            <h3 className="text-lg font-semibold text-slate-800">New Class</h3>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Section</span>
              <input
                required
                placeholder="e.g. Grade 10 - Rizal"
                value={form.section}
                onChange={set('section')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Subject</span>
              <input
                required
                placeholder="e.g. Mathematics 10"
                value={form.subject}
                onChange={set('subject')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Academic year</span>
              <input
                value={form.academic_year}
                onChange={set('academic_year')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false)
                  setError(null)
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createClass.isPending}
                className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {createClass.isPending ? 'Creating…' : 'Create class'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
