import ClassPicker from '@/components/ClassPicker'

export default function RecordIndexPage() {
  return (
    <ClassPicker
      title="Class Record"
      hint="Pick a class to open its record."
      buildPath={(c) => `/teacher/classes/${c.id}/record`}
      linkLabel="Open record"
    />
  )
}
