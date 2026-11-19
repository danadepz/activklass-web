/** Format a Firestore activity timestamp for the admin Users table. */
export function relativeActivity(value, now = Date.now()) {
  let date
  try {
    if (value?.toDate) date = value.toDate()
    else if (value instanceof Date) date = value
    else if (typeof value === 'string' || typeof value === 'number') date = new Date(value)
  } catch { return 'No activity yet' }
  if (!date || !Number.isFinite(date.getTime())) return 'No activity yet'

  const seconds = Math.floor((now - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const days = Math.floor(seconds / 86400)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
