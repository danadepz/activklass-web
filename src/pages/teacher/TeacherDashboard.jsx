import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../context/useAuth'
import { api } from '../../lib/api'

export default function TeacherDashboard() {
  const { profile } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['classes'],
    queryFn: () => api('/api/classes'),
  })

  const classes = data?.classes ?? []
  const totalStudents = classes.reduce((sum, c) => sum + c.student_count, 0)
  const show = (value) => (isLoading ? '…' : value)

  const stats = [
    { label: 'Classes', value: show(classes.length) },
    { label: 'Students', value: show(totalStudents) },
    { label: 'Pending Quizzes', value: '—' },
    { label: 'At-Risk Topics', value: '—' },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800">
        Welcome back, {profile.first_name}!
      </h2>
      <p className="text-slate-500 mt-1">Here's what's happening across your classes.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {!isLoading && classes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 mt-6 text-center">
          <p className="text-slate-500">You have no classes yet.</p>
          <Link
            to="/teacher/classes"
            className="inline-block mt-3 rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700"
          >
            Create your first class
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">Your classes</h3>
            <Link to="/teacher/classes" className="text-sm text-indigo-600 hover:underline">
              Manage classes →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {classes.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                to={`/teacher/classes/${c.id}`}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-400 transition"
              >
                <p className="font-medium text-slate-800">{c.name}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {c.subject} · {c.student_count} student{c.student_count === 1 ? '' : 's'}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
