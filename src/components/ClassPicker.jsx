import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/** Grid of the teacher's classes linking into a per-class page. */
export default function ClassPicker({ title, hint, buildPath, linkLabel }) {
  const { data, isLoading } = useQuery({
    queryKey: ['classes'],
    queryFn: () => api('/api/classes'),
  })

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      <p className="text-slate-500 mt-1">{hint}</p>

      {isLoading ? (
        <p className="text-slate-400 mt-8">Loading classes…</p>
      ) : data?.classes?.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 mt-6 text-center">
          <p className="text-slate-400">No classes yet.</p>
          <Link
            to="/teacher/classes"
            className="inline-block mt-3 rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700"
          >
            Create a class
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {data?.classes?.map((c) => (
            <Link
              key={c.id}
              to={buildPath(c)}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-sm transition"
            >
              <h3 className="font-semibold text-slate-800">{c.name}</h3>
              <p className="text-sm text-slate-500">
                {c.subject} · {c.student_count} student{c.student_count === 1 ? '' : 's'}
              </p>
              <p className="text-sm text-indigo-600 font-medium mt-3">{linkLabel} →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
