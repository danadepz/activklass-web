import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

export default function ClassDetailPage() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [actionError, setActionError] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['class', classId],
    queryFn: () => api(`/api/classes/${classId}`),
  })

  const { data: searchData, isFetching: searching } = useQuery({
    queryKey: ['student-search', search],
    queryFn: () => api(`/api/students/search?q=${encodeURIComponent(search)}`),
    enabled: search.trim().length >= 2,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['class', classId] })
    queryClient.invalidateQueries({ queryKey: ['classes'] })
  }

  const enroll = useMutation({
    mutationFn: (studentId) =>
      api(`/api/classes/${classId}/students`, { method: 'POST', body: { student_id: studentId } }),
    onSuccess: () => {
      refresh()
      setActionError(null)
    },
    onError: (err) => setActionError(err.message),
  })

  const drop = useMutation({
    mutationFn: (studentId) =>
      api(`/api/classes/${classId}/students/${studentId}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (err) => setActionError(err.message),
  })

  const archive = useMutation({
    mutationFn: () => api(`/api/classes/${classId}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      navigate('/teacher/classes')
    },
    onError: (err) => setActionError(err.message),
  })

  if (isLoading) return <p className="text-slate-400">Loading class…</p>
  if (isError || !data) return <p className="text-red-600">Class not found.</p>

  const { class: clazz, students } = data
  const enrolledIds = new Set(students.map((s) => s.student_id))
  const results = (searchData?.students ?? []).filter((s) => !enrolledIds.has(s.id))

  return (
    <div>
      <Link to="/teacher/classes" className="text-sm text-indigo-600 hover:underline">
        ← Back to My Classes
      </Link>

      <div className="flex items-start justify-between mt-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{clazz.name}</h2>
          <p className="text-slate-500 mt-1">
            {[clazz.subject, clazz.grade_level, clazz.section, clazz.school_year]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-center">
            <p className="text-xs text-slate-500">Join code</p>
            <p className="font-mono font-bold text-indigo-700 tracking-widest">{clazz.join_code}</p>
          </div>
          <Link
            to={`/teacher/classes/${classId}/grading`}
            className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50"
          >
            Grading Setup
          </Link>
          <Link
            to={`/teacher/classes/${classId}/attendance`}
            className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50"
          >
            Attendance
          </Link>
          <Link
            to={`/teacher/classes/${classId}/record`}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
          >
            Class Record
          </Link>
          <button
            onClick={() => {
              if (window.confirm('Archive this class? It will be hidden from your list.')) {
                archive.mutate()
              }
            }}
            className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm hover:bg-red-50"
          >
            Archive
          </button>
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">
          {actionError}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Roster</h3>
            <span className="text-sm text-slate-500">{students.length} student{students.length === 1 ? '' : 's'}</span>
          </div>
          {students.length === 0 ? (
            <p className="p-8 text-center text-slate-400">
              No students yet. Add them from the panel on the right, or share the join code.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-5 py-2.5 font-medium">Student #</th>
                  <th className="px-5 py-2.5 font-medium">Email</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.student_id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-700">
                      {s.last_name}, {s.first_name}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{s.student_number ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{s.email}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => drop.mutate(s.student_id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 h-fit">
          <h3 className="font-semibold text-slate-800">Add students</h3>
          <input
            placeholder="Search name, email, or student #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="mt-3 space-y-2">
            {search.trim().length < 2 ? (
              <p className="text-xs text-slate-400">Type at least 2 characters to search.</p>
            ) : searching ? (
              <p className="text-xs text-slate-400">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-xs text-slate-400">No matching students to add.</p>
            ) : (
              results.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {s.last_name}, {s.first_name}
                    </p>
                    <p className="text-xs text-slate-400">{s.student_number ?? s.email}</p>
                  </div>
                  <button
                    onClick={() => enroll.mutate(s.id)}
                    disabled={enroll.isPending}
                    className="rounded-lg bg-indigo-600 text-white px-3 py-1 text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
