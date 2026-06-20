import { useAuth } from '../context/useAuth'

/** Temporary home for admin/student/parent while the teacher side is built first. */
export default function RolePlaceholder({ title }) {
  const { profile, logout } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center max-w-md">
        <h1 className="text-2xl font-bold text-indigo-700">Activklass</h1>
        <p className="text-slate-700 mt-4">
          Hi {profile.first_name} ΓÇö the <span className="font-semibold">{title}</span> portal is
          coming soon. The teacher side is being built first.
        </p>
        <button
          onClick={logout}
          className="mt-6 rounded-lg bg-indigo-600 text-white px-5 py-2 font-medium hover:bg-indigo-700"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
