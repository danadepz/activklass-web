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

/* ---------------------------------------------------------------------------
 * Reading a schedule back, and finding where two of them collide (T-26).
 * ------------------------------------------------------------------------- */

const DAY_CODE = { M: 'monday', T: 'tuesday', W: 'wednesday', Th: 'thursday', F: 'friday', Sa: 'saturday', Su: 'sunday' }

/** Minutes from midnight for a 12-hour label ("1", "00", "PM"). */
function minutesFromLabel(hour, minute, period) {
  const h = Number(hour) % 12
  return (String(period).toUpperCase() === 'PM' ? h + 12 : h) * 60 + Number(minute)
}

/** "13:00", "1:00 PM" or "1:00PM" -> minutes from midnight; null if unreadable. */
function minutesFromClock(value) {
  const m = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!m) return null
  if (m[3]) return minutesFromLabel(m[1], m[2], m[3])
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * The day chips and time pickers behind a typed schedule string.
 *
 * "TTh 1:00 PM – 2:30 PM" -> { days: ['T', 'Th'], startHour: '1', startMinute:
 * '00', startPeriod: 'PM', endHour: '2', endMinute: '30', endPeriod: 'PM' }.
 * Blank or unreadable input returns the pickers' defaults.
 *
 * Days are read from the text BEFORE the first digit, as tokens. The previous
 * version (in ClassFormModal) ran `includes('M')` over the whole string, so
 * the "M" in "PM" put Monday on every schedule, and "TTh" matched only "Th"
 * and dropped Tuesday. Both showed up as wrong chips on Edit Class and would
 * have made an overlap check compare the wrong days.
 */
export function parseSchedule(str = '') {
  const defaults = {
    days: [],
    startHour: '8',
    startMinute: '00',
    startPeriod: 'AM',
    endHour: '9',
    endMinute: '30',
    endPeriod: 'AM',
  }
  const text = String(str ?? '')
  if (!text.trim()) return defaults

  const dayText = text.split(/\d/)[0]
  const codes = dayText.match(/Th|Sa|Su|M|T|W|F/g) ?? []
  const days = Object.keys(DAY_CODE).filter((d) => codes.includes(d))

  const matches = [...text.matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)/ig)]
  if (matches.length >= 2) {
    return {
      days,
      startHour: matches[0][1],
      startMinute: matches[0][2],
      startPeriod: matches[0][3].toUpperCase(),
      endHour: matches[1][1],
      endMinute: matches[1][2],
      endPeriod: matches[1][3].toUpperCase(),
    }
  }
  return { ...defaults, days }
}

/**
 * Every meeting in a schedule as { day, start, end } with minutes from
 * midnight, whichever shape it was stored in. Unreadable input (free text
 * from before the pickers, a slot with no times) contributes nothing rather
 * than throwing -- an overlap check must never stop a class being saved.
 */
export function scheduleMeetings(schedule) {
  if (!schedule) return []
  if (typeof schedule === 'string') {
    const p = parseSchedule(schedule)
    if (!p.days.length || !/\d{1,2}:\d{2}\s*(AM|PM)/i.test(schedule)) return []
    const start = minutesFromLabel(p.startHour, p.startMinute, p.startPeriod)
    const end = minutesFromLabel(p.endHour, p.endMinute, p.endPeriod)
    return p.days.map((code) => ({ day: DAY_CODE[code], start, end }))
  }
  if (typeof schedule !== 'object') return []
  const out = []
  for (const day of DAY_ORDER) {
    const slots = schedule[day]
    if (!slots) continue
    for (const slot of Array.isArray(slots) ? slots : [slots]) {
      const start = minutesFromClock(slot?.start)
      const end = minutesFromClock(slot?.end)
      if (start == null || end == null) continue
      out.push({ day, start, end })
    }
  }
  return out
}

/** 780 -> "1:00 PM" */
function clockLabel(mins) {
  const h24 = Math.floor(mins / 60)
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(mins % 60).padStart(2, '0')} ${period}`
}

/** 780, 870 -> "1:00–2:30 PM"; 690, 810 -> "11:30 AM–1:30 PM" */
function rangeLabel(start, end) {
  const a = clockLabel(start)
  const b = clockLabel(end)
  const [aTime, aPeriod] = a.split(' ')
  return aPeriod === b.split(' ')[1] ? `${aTime}–${b}` : `${a}–${b}`
}

/**
 * Where two schedules meet at the same time, or null when they never do.
 *
 * Returns { days, meetings, label }: the weekdays that clash, the shared
 * window on each ("meetings" as { day, start, end }), and one line ready for
 * a dialog -- "Tue/Thu 1:00–2:30 PM". Touching ends do not count:
 * 1:00–2:30 against 2:30–4:00 is back-to-back, not a clash. Either argument
 * may be the typed string or the seeded object.
 */
export function scheduleOverlap(a, b) {
  const meetings = []
  for (const x of scheduleMeetings(a)) {
    for (const y of scheduleMeetings(b)) {
      if (x.day !== y.day) continue
      const start = Math.max(x.start, y.start)
      const end = Math.min(x.end, y.end)
      if (start < end) meetings.push({ day: x.day, start, end })
    }
  }
  if (!meetings.length) return null

  const days = DAY_ORDER.filter((d) => meetings.some((m) => m.day === d))
  const groups = []
  for (const day of days) {
    for (const m of meetings.filter((x) => x.day === day)) {
      const label = rangeLabel(m.start, m.end)
      const existing = groups.find((g) => g.label === label)
      if (existing) {
        if (!existing.days.includes(day)) existing.days.push(day)
      } else groups.push({ label, days: [day] })
    }
  }
  const label = groups
    .map((g) => `${g.days.map((d) => DAY_LABEL[d]).join('/')} ${g.label}`)
    .join(' · ')
  return { days, meetings, label }
}
