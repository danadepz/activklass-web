/**
 * "Now", fixed for the life of the component.
 *
 * A window is judged against one moment per render tree, not a fresh
 * Date.now() in every chip -- so a page that straddles midnight cannot show
 * one row "Due today" and the next "Overdue" for the same minute, and tests
 * pin the moment through the prop. Same pattern as the teacher's Modules
 * tab (teacher/classes/$classId/modules.jsx).
 */
import { useState } from 'react'

export function useNow(now) {
  const [fallback] = useState(() => Date.now())
  return now ?? fallback
}
