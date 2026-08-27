/**
 * The public school directory behind the registration page's "Select School".
 *
 * Deliberately distinct from the two school concepts that already exist:
 * `schools/{id}` doubles as a subscription id (provisioned by the developer
 * tier — see api/superadmin.py), and `users.school_id` decides who PAYS for a
 * teacher (seat counting in services/subscription_usage.py, absorption in
 * lib/institution.js). A self-registering teacher may touch neither. What
 * they declare at sign-up is only an affiliation — "where I teach" — and it
 * lands here, in `school_directory`.
 *
 * The doc id IS the lowercased abbreviation ("ucb" for University of
 * Cebu-Banilad), the same doc-id-as-uniqueness trick as teacher_group_codes:
 * once one teacher adds UCB, the next teacher from that school finds it in
 * the dropdown instead of creating a near-duplicate. Names are deduplicated
 * too, through schoolNameKey — two teachers typing the same school with
 * different spacing or punctuation land on one entry, not two. Reads are
 * public in firestore.rules because the registration form renders before any
 * account exists; creates require the just-created Firebase session.
 */
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

/** The doc id a given abbreviation lives under. */
export function schoolAbbrKey(abbreviation) {
  return String(abbreviation ?? '').trim().toLowerCase()
}

/**
 * The comparison key for a school NAME: accents folded, lowercased, every run
 * of punctuation or whitespace collapsed to a single space. "University of
 * Cebu-Banilad", "University of Cebu - Banilad" and "UNIVERSITY OF CEBU –
 * BANILAD" all produce the same key, so teachers who type the same school
 * differently still land on the same directory entry. Matching only — the
 * displayed and stored name keeps the spelling the first teacher entered.
 */
export function schoolNameKey(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Every directory entry, A→Z by name: [{id, name, abbreviation}]. */
export async function fetchSchoolDirectory() {
  const snap = await getDocs(collection(db, 'school_directory'))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

/** The entry holding this abbreviation, or null. Works signed out. */
export async function findSchoolByAbbr(abbreviation) {
  const key = schoolAbbrKey(abbreviation)
  if (!key) return null
  const snap = await getDoc(doc(db, 'school_directory', key))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/** The entry whose name matches after normalization, or null. Works signed out. */
export async function findSchoolByName(name) {
  const key = schoolNameKey(name)
  if (!key) return null
  const all = await fetchSchoolDirectory()
  return all.find((s) => schoolNameKey(s.name) === key) ?? null
}

/**
 * The error message when an abbreviation already belongs to a DIFFERENT
 * school, or '' when it is free or names the same school (which callers may
 * simply reuse). Split out from addSchoolToDirectory so the registration form
 * can run it BEFORE creating the Firebase account — the predictable "UCB is
 * taken" case should not strand people in a half-registered state.
 */
export async function abbrConflictError(abbreviation, name) {
  const existing = await findSchoolByAbbr(abbreviation)
  if (!existing) return ''
  if (schoolNameKey(existing.name) === schoolNameKey(name)) return ''
  return (
    `“${String(abbreviation).trim().toUpperCase()}” is already used by ${existing.name}. ` +
    'If that is your school, pick it from the list; otherwise choose a different abbreviation.'
  )
}

/**
 * Add a school so later registrants find it in the dropdown. Signed-in only.
 * Returns {id, name, abbreviation} — the existing entry when the name already
 * matches one (per schoolNameKey), else the newly created one. Throws the
 * abbrConflictError message when the abbreviation belongs to another school.
 */
export async function addSchoolToDirectory({ name, abbreviation }) {
  const cleanName = String(name ?? '').trim().replace(/\s+/g, ' ')
  const abbr = String(abbreviation ?? '').trim().toUpperCase()
  // The same school typed differently — "Cebu - Banilad" for an existing
  // "Cebu-Banilad" — reuses the existing entry (its abbreviation included)
  // instead of listing the school twice under two abbreviations.
  const sameSchool = await findSchoolByName(cleanName)
  if (sameSchool) return sameSchool
  const existing = await findSchoolByAbbr(abbr)
  if (existing) throw new Error(await abbrConflictError(abbr, cleanName))
  await setDoc(doc(db, 'school_directory', schoolAbbrKey(abbr)), {
    name: cleanName,
    abbreviation: abbr,
    created_by: auth.currentUser.uid,
    created_at: serverTimestamp(),
  })
  return { id: schoolAbbrKey(abbr), name: cleanName, abbreviation: abbr }
}
