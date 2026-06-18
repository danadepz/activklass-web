import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute, { RoleHomeRedirect } from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import RolePlaceholder from './pages/RolePlaceholder'
import TeacherLayout from './pages/teacher/TeacherLayout'
import ClassLayout from './pages/teacher/ClassLayout'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import AnalyticsPage from './pages/teacher/AnalyticsPage'
import ClassesPage from './pages/teacher/ClassesPage'
import ClassDetailPage from './pages/teacher/ClassDetailPage'
import GradingSetupPage from './pages/teacher/GradingSetupPage'
import ClassRecordPage from './pages/teacher/ClassRecordPage'
import RecordIndexPage from './pages/teacher/RecordIndexPage'
import AttendancePage from './pages/teacher/AttendancePage'
import AttendanceIndexPage from './pages/teacher/AttendanceIndexPage'
import SyllabusPage from './pages/teacher/SyllabusPage'
import SyllabusIndexPage from './pages/teacher/SyllabusIndexPage'
import QuizzesPage from './pages/teacher/QuizzesPage'
import QuizBuilderPage from './pages/teacher/QuizBuilderPage'
import QuizzesIndexPage from './pages/teacher/QuizzesIndexPage'
import ComingSoon from './pages/teacher/ComingSoon'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/portal" element={<RoleHomeRedirect />} />

      <Route element={<ProtectedRoute roles={['teacher']} />}>
        <Route path="/teacher" element={<TeacherLayout />}>
          <Route index element={<TeacherDashboard />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="classes" element={<ClassesPage />} />

          {/* A specific class: ClassLayout renders the sub-navbar; the tabs
              below are its children. Overview (index) shows analytics + roster. */}
          <Route path="classes/:classId" element={<ClassLayout />}>
            <Route index element={<ClassDetailPage />} />
            <Route path="record" element={<ClassRecordPage />} />
            <Route path="performance" element={<ComingSoon />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="syllabus" element={<SyllabusPage />} />
            <Route path="quizzes" element={<QuizzesPage />} />
            <Route path="quizzes/:quizId" element={<QuizBuilderPage />} />
            <Route path="scaffolds" element={<ComingSoon />} />
            <Route path="grading" element={<GradingSetupPage />} />
            <Route path="history" element={<ComingSoon />} />
          </Route>

          <Route path="record" element={<RecordIndexPage />} />
          <Route path="attendance" element={<AttendanceIndexPage />} />
          <Route path="syllabus" element={<SyllabusIndexPage />} />
          <Route path="quizzes" element={<QuizzesIndexPage />} />
          <Route path="announcements" element={<ComingSoon />} />
          <Route path="reports" element={<ComingSoon />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route path="/admin" element={<RolePlaceholder title="Admin" />} />
      </Route>
      <Route element={<ProtectedRoute roles={['student']} />}>
        <Route path="/student" element={<RolePlaceholder title="Student" />} />
      </Route>
      <Route element={<ProtectedRoute roles={['parent']} />}>
        <Route path="/parent" element={<RolePlaceholder title="Parent" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
