/** Render a class schedule as a string, whatever shape it was stored in.
 *
 * Two shapes exist in Firestore and both are valid:
 *
 *   "MWF 8:00 AM – 9:30 AM"                          <- typed into ClassFormModal
 *   { monday: [{ start, end, room }], friday: [...] } <- written by seed_demo.py
 *
 * Rendering the second one directly crashes React with "Objects are not valid
 * as a React child", which took down the teacher dashboard for every account
 * owning a seeded class. Formatting here rather than guarding at each call site
 * keeps the structured form displayable instead of silently blank -- the
 * student class page used to drop it entirely with a `typeof === 'string'`
 * check, so seeded classes showed no meeting times at all.
 */

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABEL = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

/** "08:00"–"09:00" plus an optional room, as one readable slot label. */
function slotLabel(slot) {
  if (!slot || typeof slot !== 'object') return ''
  const start = slot.start ?? ''
  const end = slot.end ?? ''
  const time = start && end ? `${start}–${end}` : start || end
  return slot.room ? `${time} (${slot.room})` : time
}

export function formatSchedule(schedule) {
  if (!schedule) return ''
  if (typeof schedule === 'string') return schedule.trim()
  if (typeof schedule !== 'object') return ''

  // Collect one entry per meeting, in weekday order rather than key order --
  // Firestore hands back {friday, wednesday, monday} and reading a schedule
  // out of sequence is worse than not showing it.
  const meetings = []
  for (const day of DAY_ORDER) {
    const slots = schedule[day]
    if (!slots) continue
    for (const slot of Array.isArray(slots) ? slots : [slots]) {
      const label = slotLabel(slot)
      if (label) meetings.push({ day, label })
    }
  }
  if (!meetings.length) return ''

  // Days sharing a time collapse into one group ("MonWed 08:00-09:00"), which
  // is how a schedule is written by hand and keeps the line short enough for
  // the 12px caption it renders into.
  const groups = []
  for (const { day, label } of meetings) {
    const existing = groups.find(g => g.label === label)
    if (existing) existing.days.push(day)
    else groups.push({ label, days: [day] })
  }

  return groups
    .map(g => `${g.days.map(d => DAY_LABEL[d]).join('/')} ${g.label}`)
    .join(' · ')
}
