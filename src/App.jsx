import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute, { RoleHomeRedirect } from '@/components/ProtectedRoute'

// ─── Public routes ───────────────────────────────────────────────────────────
import Landing  from '@/routes/index'
import Login    from '@/routes/login'
import Register from '@/routes/register'

// ─── Shared components ───────────────────────────────────────────────────────
import RolePlaceholder from '@/components/RolePlaceholder'

// ─── Student portal ──────────────────────────────────────────────────────────
import StudentLayout      from '@/routes/student/_layout'
import StudentDashboard   from '@/routes/student/index'
import StudentClassesIndex from '@/routes/student/classes/index'
import StudentClassDetail from '@/routes/student/classes/$classId/index'
import StudentProfile     from '@/routes/student/profile'
import StudentRemediation from '@/routes/student/remediation'
import QuizPlayer         from '@/routes/student/quiz-player'
import QuizFeedback       from '@/routes/student/quiz-feedback'

// ─── Teacher: layout + dashboard ─────────────────────────────────────────────
import TeacherLayout    from '@/routes/teacher/_layout'
import TeacherDashboard from '@/routes/teacher/index'

// ─── Teacher: navbar-level routes ────────────────────────────────────────────
import ClassesPage        from '@/routes/teacher/classes/index'
import RecordIndexPage    from '@/routes/teacher/record'
import AttendanceIndexPage from '@/routes/teacher/attendance'
import SyllabusIndexPage  from '@/routes/teacher/syllabus'
import QuizzesIndexPage   from '@/routes/teacher/quizzes'
import QuizBuilderPage    from '@/routes/teacher/quizzes.$quizId'
import AdminUsersPage    from '@/routes/admin/index'
import GradingSetupPage   from '@/routes/teacher/grading'
import AnnouncementsPage  from '@/routes/teacher/announcements'
import ReportsPage        from '@/routes/teacher/reports'

// ─── Teacher: class-level layout + tabs ──────────────────────────────────────
import ClassLayout      from '@/routes/teacher/classes/$classId/_layout'
import ClassDetailPage  from '@/routes/teacher/classes/$classId/index'
import ClassRecordPage  from '@/routes/teacher/classes/$classId/record'
import AttendancePage   from '@/routes/teacher/classes/$classId/attendance'
import PerformancePage  from '@/routes/teacher/classes/$classId/performance'
import ScaffoldTopicsPage from '@/routes/teacher/classes/$classId/scaffolds'
import HistoryPage      from '@/routes/teacher/classes/$classId/history'

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/"         element={<Landing />} />
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/portal"   element={<RoleHomeRedirect />} />

      {/* Teacher */}
      <Route element={<ProtectedRoute roles={['teacher']} />}>
        <Route path="/teacher" element={<TeacherLayout />}>
          <Route index element={<TeacherDashboard />} />
          <Route path="analytics" element={<Navigate to="/teacher/classes" replace />} />

          {/* Navbar: Classes */}
          <Route path="classes" element={<ClassesPage />} />

          {/* Class tabs — ClassLayout renders the sub-navbar */}
          <Route path="classes/:classId" element={<ClassLayout />}>
            <Route index                   element={<ClassDetailPage />} />
            <Route path="record"           element={<ClassRecordPage />} />
            <Route path="attendance"       element={<AttendancePage />} />
            <Route path="performance"      element={<PerformancePage />} />
            <Route path="scaffolds"        element={<ScaffoldTopicsPage />} />
            <Route path="history"          element={<HistoryPage />} />
          </Route>

          {/* Navbar: cross-class index pages */}
          <Route path="record"        element={<RecordIndexPage />} />
          <Route path="attendance"    element={<AttendanceIndexPage />} />
          <Route path="syllabus"      element={<SyllabusIndexPage />} />
          <Route path="quizzes"       element={<QuizzesIndexPage />} />
          <Route path="quizzes/:quizId" element={<QuizBuilderPage />} />
          <Route path="grading"       element={<GradingSetupPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="reports"       element={<ReportsPage />} />
        </Route>
      </Route>

      {/* Other roles (placeholders until their portals are built) */}
      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route path="/admin" element={<AdminUsersPage />} />
      </Route>
      <Route element={<ProtectedRoute roles={['student']} />}>
        <Route path="/student" element={<StudentLayout />}>
          <Route index element={<StudentDashboard />} />
          <Route path="classes" element={<StudentClassesIndex />} />
          <Route path="classes/:classId" element={<StudentClassDetail />} />
          <Route path="classes/:classId/quizzes/:quizId" element={<QuizPlayer />} />
          <Route path="quizzes/:attemptId/result" element={<QuizFeedback />} />
          <Route path="remediation" element={<StudentRemediation />} />
          <Route path="profile" element={<StudentProfile />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute roles={['parent']} />}>
        <Route path="/parent" element={<RolePlaceholder title="Parent" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
