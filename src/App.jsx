import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute, { RoleHomeRedirect } from '@/components/ProtectedRoute'
import { lazyRoute } from '@/components/lazyRoute'

// ─── Shared components ───────────────────────────────────────────────────────
import ParentOnMobile from '@/components/ParentOnMobile'

// Every screen below is fetched on first visit. lazyRoute() returns a ready
// route element wrapped in its own Suspense boundary — see the note in
// components/lazyRoute.jsx for why the boundary is per route rather than one
// around <Routes>. `full: true` marks routes that paint the whole viewport;
// the rest render into a layout's Outlet and get the inset fallback.

// ─── Public routes ───────────────────────────────────────────────────────────
const Landing  = lazyRoute(() => import('@/routes/index'), { full: true })
const Login    = lazyRoute(() => import('@/routes/login'), { full: true })
const Register = lazyRoute(() => import('@/routes/register'), { full: true })

// ─── Student portal ──────────────────────────────────────────────────────────
const StudentLayout       = lazyRoute(() => import('@/routes/student/_layout'), { full: true })
const StudentDashboard    = lazyRoute(() => import('@/routes/student/index'))
const StudentClassesIndex = lazyRoute(() => import('@/routes/student/classes/index'))
const StudentClassDetail  = lazyRoute(() => import('@/routes/student/classes/$classId/index'))
const StudentProfile      = lazyRoute(() => import('@/routes/student/profile'))
const StudentRemediation  = lazyRoute(() => import('@/routes/student/remediation'))
const QuizPlayer          = lazyRoute(() => import('@/routes/student/quiz-player'))
const QuizFeedback        = lazyRoute(() => import('@/routes/student/quiz-feedback'))

// ─── Teacher: layout + dashboard ─────────────────────────────────────────────
const TeacherLayout    = lazyRoute(() => import('@/routes/teacher/_layout'), { full: true })
const TeacherDashboard = lazyRoute(() => import('@/routes/teacher/index'))

// ─── Teacher: navbar-level routes ────────────────────────────────────────────
const ClassesPage         = lazyRoute(() => import('@/routes/teacher/classes/index'))
const RecordIndexPage     = lazyRoute(() => import('@/routes/teacher/record'))
const AttendanceIndexPage = lazyRoute(() => import('@/routes/teacher/attendance'))
const SyllabusIndexPage   = lazyRoute(() => import('@/routes/teacher/syllabus'))
const QuizzesIndexPage    = lazyRoute(() => import('@/routes/teacher/quizzes'))
const QuizBuilderPage     = lazyRoute(() => import('@/routes/teacher/quizzes.$quizId'))
const AdminUsersPage      = lazyRoute(() => import('@/routes/admin/index'), { full: true })
const SuperAdminLayout    = lazyRoute(() => import('@/routes/superadmin/_layout'), { full: true })
const SuperAdminSubscribersPage = lazyRoute(() => import('@/routes/superadmin/index'))
const GradingSetupPage    = lazyRoute(() => import('@/routes/teacher/grading'))
const TeacherAccountPage  = lazyRoute(() => import('@/routes/teacher/account'))
const AnnouncementsPage   = lazyRoute(() => import('@/routes/teacher/announcements'))
const ReportsPage         = lazyRoute(() => import('@/routes/teacher/reports'))

// ─── Teacher: class-level layout + tabs ──────────────────────────────────────
const ClassLayout        = lazyRoute(() => import('@/routes/teacher/classes/$classId/_layout'))
const ClassDetailPage    = lazyRoute(() => import('@/routes/teacher/classes/$classId/index'))
const ClassRecordPage    = lazyRoute(() => import('@/routes/teacher/classes/$classId/record'))
const AttendancePage     = lazyRoute(() => import('@/routes/teacher/classes/$classId/attendance'))
const PerformancePage    = lazyRoute(() => import('@/routes/teacher/classes/$classId/performance'))
const ScaffoldTopicsPage = lazyRoute(() => import('@/routes/teacher/classes/$classId/scaffolds'))
const HistoryPage        = lazyRoute(() => import('@/routes/teacher/classes/$classId/history'))

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/"         element={Landing} />
      <Route path="/login"    element={Login} />
      <Route path="/register" element={Register} />
      <Route path="/portal"   element={<RoleHomeRedirect />} />

      {/* Teacher */}
      <Route element={<ProtectedRoute roles={['teacher']} />}>
        <Route path="/teacher" element={TeacherLayout}>
          <Route index element={TeacherDashboard} />
          <Route path="analytics" element={<Navigate to="/teacher/classes" replace />} />

          {/* Navbar: Classes */}
          <Route path="classes" element={ClassesPage} />

          {/* Class tabs — ClassLayout renders the sub-navbar */}
          <Route path="classes/:classId" element={ClassLayout}>
            <Route index                   element={ClassDetailPage} />
            <Route path="record"           element={ClassRecordPage} />
            <Route path="attendance"       element={AttendancePage} />
            <Route path="performance"      element={PerformancePage} />
            <Route path="scaffolds"        element={ScaffoldTopicsPage} />
            <Route path="history"          element={HistoryPage} />
          </Route>

          {/* Navbar: cross-class index pages */}
          <Route path="record"        element={RecordIndexPage} />
          <Route path="attendance"    element={AttendanceIndexPage} />
          <Route path="syllabus"      element={SyllabusIndexPage} />
          <Route path="quizzes"       element={QuizzesIndexPage} />
          <Route path="quizzes/:quizId" element={QuizBuilderPage} />
          <Route path="grading"       element={GradingSetupPage} />
          <Route path="announcements" element={AnnouncementsPage} />
          <Route path="reports"       element={ReportsPage} />
          <Route path="account"       element={TeacherAccountPage} />
        </Route>
      </Route>

      {/* Developer console. Gated on the Firebase super admin claim rather
          than a role -- an admin can write any users/{uid} document, so a role
          string would be self-grantable. Every /api/superadmin route checks the
          claim again server-side. */}
      <Route element={<ProtectedRoute superAdmin />}>
        <Route path="/superadmin" element={SuperAdminLayout}>
          <Route index element={SuperAdminSubscribersPage} />
        </Route>
      </Route>

      {/* Guardians are mobile-only by design -- /parent points them at the app
         rather than pretending a web portal is on its way. */}
      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route path="/admin" element={AdminUsersPage} />
      </Route>
      <Route element={<ProtectedRoute roles={['student']} />}>
        <Route path="/student" element={StudentLayout}>
          <Route index element={StudentDashboard} />
          <Route path="classes" element={StudentClassesIndex} />
          <Route path="classes/:classId" element={StudentClassDetail} />
          <Route path="classes/:classId/quizzes/:quizId" element={QuizPlayer} />
          <Route path="quizzes/:attemptId/result" element={QuizFeedback} />
          <Route path="remediation" element={StudentRemediation} />
          <Route path="profile" element={StudentProfile} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute roles={['parent']} />}>
        <Route path="/parent" element={<ParentOnMobile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
