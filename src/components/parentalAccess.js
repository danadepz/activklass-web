/**
 * The four things a guardian can be granted, in the order the panel shows them.
 *
 * Split out of ParentalAccessPanel.jsx so that file exports components only --
 * a second export there breaks Fast Refresh (react-refresh/only-export-components).
 * Kept beside the panel rather than in src/lib so the UI lane still owns it;
 * the `key` values are the contract the consent record is expected to store.
 */
export const PERMISSIONS = [
  { key: 'grades', label: 'Grades', hint: 'Component scores and computed final grades' },
  { key: 'quiz_scores', label: 'Quiz & activity scores', hint: 'Individual quiz, activity and performance-task results' },
  { key: 'attendance', label: 'Attendance record', hint: 'Daily attendance, absences and excuse letters' },
  { key: 'analytics', label: 'Subject analytics', hint: 'Topic mastery, weak areas and recommendations' },
]
