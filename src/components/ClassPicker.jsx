import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/useAuth'
import { classLabel, loadTeacherClasses, studentCount } from '../lib/classes'

/**
 * Grid of the teacher's classes, linking into a per-class page.
 *
 * Reads Firestore directly. This used to call GET /api/classes, which read
 * SQLAlchemy -- so the picker answered from a different database than every
 * other class screen in the app, and a class created in the app never appeared
 * here at all.
 */
export default function ClassPicker({ title, hint, buildPath, linkLabel }) {
  const { profile } = useAuth()
  const { data: classes, isLoading } = useQuery({
    // Keyed by teacher: two accounts in one browser session must not share a
    // cache entry, which the bare ['classes'] key allowed.
    queryKey: ['fs-classes', profile?.id],
    queryFn: () => loadTeacherClasses(profile.id),
    enabled: Boolean(profile?.id),
  })

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      <p className="text-slate-500 mt-1">{hint}</p>

      {isLoading ? (
        <p className="text-slate-400 mt-8">Loading classes…</p>
      ) : (classes ?? []).length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 mt-6 text-center">
          <p className="text-slate-400">No classes yet.</p>
          <Link
            to="/teacher/classes"
            className="inline-block mt-3 rounded-lg bg-[#0E2A5C] text-white px-4 py-2 font-medium hover:brightness-110"
          >
            Create a class
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {(classes ?? []).map((c) => {
            const count = studentCount(c)
            return (
              <Link
                key={c.id}
                to={buildPath(c)}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:border-[#0E2A5C]/40 hover:shadow-sm transition"
              >
                <h3 className="font-semibold text-slate-800">{classLabel(c)}</h3>
                <p className="text-sm text-slate-500">
                  {c.subject} · {count} student{count === 1 ? '' : 's'}
                </p>
                <p className="text-sm font-medium mt-3 text-[#1E6FB0]">{linkLabel} →</p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
