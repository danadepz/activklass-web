import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'

const NAV_ITEMS = [
  { to: '/teacher', label: 'Dashboard', end: true },
  { to: '/teacher/analytics', label: 'Overall Analytics' },
  { to: '/teacher/classes', label: 'My Classes' },
  { to: '/teacher/record', label: 'Class Record' },
  { to: '/teacher/attendance', label: 'Attendance' },
  { to: '/teacher/syllabus', label: 'Syllabus' },
  { to: '/teacher/quizzes', label: 'Quizzes' },
  { to: '/teacher/scaffolds', label: 'Scaffold Topics' },
  { to: '/teacher/announcements', label: 'Announcements' },
  { to: '/teacher/reports', label: 'Reports' },
]

export default function TeacherLayout() {
  const { profile, logout } = useAuth()

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="w-60 shrink-0 bg-indigo-900 text-indigo-100 flex flex-col">
        <div className="px-5 py-5 border-b border-indigo-800">
          <h1 className="text-xl font-bold text-white">Activklass</h1>
          <p className="text-xs text-indigo-300 mt-0.5">Teacher Portal</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-indigo-700 text-white' : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-indigo-800">
          <p className="text-sm text-white font-medium truncate">
            {profile.first_name} {profile.last_name}
          </p>
          <p className="text-xs text-indigo-300 truncate">{profile.email}</p>
          <button
            onClick={logout}
            className="mt-3 w-full rounded-lg border border-indigo-700 px-3 py-1.5 text-sm text-indigo-200 hover:bg-indigo-800"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  )
}
