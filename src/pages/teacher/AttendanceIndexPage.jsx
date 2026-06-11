import ClassPicker from '../../components/ClassPicker'

export default function AttendanceIndexPage() {
  return (
    <ClassPicker
      title="Attendance"
      hint="Pick a class to take or review attendance."
      buildPath={(c) => `/teacher/classes/${c.id}/attendance`}
      linkLabel="Open attendance"
    />
  )
}
