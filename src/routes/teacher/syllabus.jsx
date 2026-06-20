import ClassPicker from '@/components/ClassPicker'

export default function SyllabusIndexPage() {
  return (
    <ClassPicker
      title="Syllabus"
      hint="Pick a class to build or generate its syllabus."
      buildPath={(c) => `/teacher/classes/${c.id}/syllabus`}
      linkLabel="Open syllabus"
    />
  )
}
