import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

const EMPTY_FORM = { name: '', subject: '', grade_level: '', section: '', school_year: '2026-2027' }

export default function ClassesPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['classes'],
    queryFn: () => api('/api/classes'),
  })

  const createClass = useMutation({
    mutationFn: (body) => api('/api/classes', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] })
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
          <p className="text-slate-500 mt-1">Create classes and manage student rosters.</p>
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
      ) : data?.classes?.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 mt-6 text-center text-slate-400">
          No classes yet. Create your first class to start building its roster and class record.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {data?.classes?.map((c) => (
            <Link
              key={c.id}
              to={`/teacher/classes/${c.id}`}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-sm transition"
            >
              <h3 className="font-semibold text-slate-800">{c.name}</h3>
              <p className="text-sm text-slate-500">{c.subject}</p>
              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-slate-500">
                  {[c.grade_level, c.section].filter(Boolean).join(' · ') || c.school_year}
                </span>
                <span className="rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-0.5 font-medium">
                  {c.student_count} student{c.student_count === 1 ? '' : 's'}
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
              createClass.mutate(form)
            }}
            className="bg-white rounded-xl p-6 w-full max-w-md space-y-4"
          >
            <h3 className="text-lg font-semibold text-slate-800">New Class</h3>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Class name</span>
              <input
                required
                placeholder="e.g. Math 7 — Rizal"
                value={form.name}
                onChange={set('name')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Subject</span>
              <input
                required
                placeholder="e.g. Mathematics"
                value={form.subject}
                onChange={set('subject')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Grade level</span>
                <input
                  placeholder="Grade 7"
                  value={form.grade_level}
                  onChange={set('grade_level')}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Section</span>
                <input
                  placeholder="Rizal"
                  value={form.section}
                  onChange={set('section')}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">School year</span>
                <input
                  value={form.school_year}
                  onChange={set('school_year')}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </div>
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
