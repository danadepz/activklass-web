import ClassPicker from '../../components/ClassPicker'

export default function QuizzesIndexPage() {
  return (
    <ClassPicker
      title="Quizzes"
      hint="Pick a class to manage its quizzes."
      buildPath={(c) => `/teacher/classes/${c.id}/quizzes`}
      linkLabel="Open quizzes"
    />
  )
}
