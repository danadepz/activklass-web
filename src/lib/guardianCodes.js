/**
 * Guardian codes and links, against Firestore.
 *
 * Owned by the logic lane (see OWNERSHIP.md). This is the web half of what
 * `activklass-mobile/src/lib/guardianCodes.ts` does; the two read and write the
 * SAME two collections, so a student mints a code on either and their guardian
 * redeems it in the mobile app. Before this existed the panel on this page
 * rendered a hardcoded `const linkCode = 'K7M2Q9'` -- the same six characters
 * for every student, connected to nothing.
 *
 * Keep the two files in step. They are duplicated rather than shared because a
 * shared package across three repos costs more than it saves at this scale, so
 * a change to the document shape has to be made twice, deliberately.
 *
 * The document id IS the code
 * ---------------------------
 * `guardian_codes/{CODE}`, for two reasons:
 *   1. Security rules can get() a known path but cannot run a query, so a rule
 *      can resolve a code this way and no other.
 *   2. Uniqueness is free -- Firestore `create` only applies when the document
 *      is absent, so two students can never hold the same code.
 *
 * What enforces the rest is firestore.rules in activklass-backend, not this
 * file: a guardian writes their own link document, and the rules re-derive its
 * status and scopes from the code's `is_minor` rather than trusting what
 * arrives. Nothing here is a security boundary.
 */
import {
  Timestamp,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/** Omits O/0/I/1 -- these codes get read aloud and copied by hand. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/

const AGE_OF_MAJORITY = 18

/**
 * The panel names its four toggles `grades`, `quiz_scores`, ... while the link
 * document stores `can_view_*` -- the names the backend and the security rules
 * already use. Mapped here so neither side has to learn the other's spelling.
 */
export const SCOPE_BY_PERMISSION = {
  grades: 'can_view_grades',
  quiz_scores: 'can_view_quiz_scores',
  attendance: 'can_view_attendance',
  analytics: 'can_view_analytics',
}

export const ALL_SCOPES_ON = {
  can_view_grades: true,
  can_view_quiz_scores: true,
  can_view_attendance: true,
  can_view_analytics: true,
}

export const ALL_SCOPES_OFF = {
  can_view_grades: false,
  can_view_quiz_scores: false,
  can_view_attendance: false,
  can_view_analytics: false,
}

/** guardian_links scopes -> the panel's permission shape. */
export function scopesToPermissions(scopes = {}) {
  const out = {}
  for (const [permission, scope] of Object.entries(SCOPE_BY_PERMISSION)) {
    out[permission] = scopes[scope] === true
  }
  return out
}

/** The panel's permission shape -> guardian_links scopes. */
export function permissionsToScopes(permissions = {}) {
  const out = { ...ALL_SCOPES_OFF }
  for (const [permission, scope] of Object.entries(SCOPE_BY_PERMISSION)) {
    out[scope] = permissions[permission] === true
  }
  return out
}

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

/** Whole years, or null when the birthdate is missing or unparseable. */
export function ageFromBirthdate(value, today = new Date()) {
  if (value == null || value === '') return null

  let born = null
  if (value instanceof Timestamp) born = value.toDate()
  else if (value instanceof Date) born = value
  else {
    const text = String(value).trim()
    // Parsed by hand: new Date('2005-03-04') is UTC midnight, which is the
    // previous day in UTC+8 and shifts every birthday by one.
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
    if (iso) born = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    else {
      const parsed = new Date(text)
      born = Number.isNaN(parsed.getTime()) ? null : parsed
    }
  }
  if (born == null || Number.isNaN(born.getTime())) return null

  let age = today.getFullYear() - born.getFullYear()
  const beforeBirthday =
    today.getMonth() < born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())
  if (beforeBirthday) age -= 1
  return age >= 0 ? age : null
}

/**
 * True / False, or null when we cannot tell.
 *
 * null matters: an unknown birthdate must NOT be treated as under-18, because
 * that would unlock a guardian with nobody consenting. Callers resolve null to
 * the adult path, which gates on the student approving instead.
 */
export function isMinor(birthdate, today = new Date()) {
  const age = ageFromBirthdate(birthdate, today)
  return age == null ? null : age < AGE_OF_MAJORITY
}

/** Adults yes; minors no; unknown birthdate yes -- unknown takes the path that
 *  requires the student's own consent. */
export function canManageOwnLinks(birthdate) {
  return isMinor(birthdate) !== true
}

// ---------------------------------------------------------------------------
// The student's code
// ---------------------------------------------------------------------------

/**
 * A code is the credential that attaches a guardian to a child's records, so
 * it is drawn from crypto rather than Math.random -- V8's Math.random is
 * xorshift128+, seeded per context and predictable from enough outputs.
 *
 * The practical attack here was always thin: each student mints one code in
 * their own browser, so there is no sequence for anyone to observe. This costs
 * one line and removes the question rather than arguing it.
 *
 * CODE_ALPHABET is exactly 32 characters and 256 divides evenly by 32, so
 * `byte % 32` is unbiased. An alphabet of any other size would need rejection
 * sampling -- do not shorten it without changing this.
 */
function randomCode() {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return out
}

function displayName(profile) {
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
  // login_id before email: the email may be the internal issued-login address,
  // which is never shown to people.
  return name || profile.login_id || profile.email || 'Student'
}

/**
 * Write a fresh code, retrying past the rare id collision.
 *
 * `create` is enforced by the rules, not requested here: a write onto an
 * existing document is an update, and the update rule denies it outright. So a
 * collision surfaces as permission-denied, which is what we retry on -- any
 * other permission-denied would fail identically on every attempt and falls
 * out of the loop.
 */
async function mintCode(uid, profile, carriedRevocations = []) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomCode()
    try {
      await setDoc(doc(db, 'guardian_codes', candidate), {
        code: candidate,
        student_uid: uid,
        student_name: displayName(profile),
        student_number: profile.student_number ?? null,
        grade_level: profile.grade_level ?? profile.year_level ?? null,
        is_minor: isMinor(profile.birthdate),
        // Starting permissions for a guardian this student later approves. Kept
        // on the code document because it is the only thing a student owns
        // before any guardian exists -- their users/{uid} profile is
        // write-locked to photo_url. Open by default: redeeming a code the
        // student handed over is itself the grant, and they narrow from there.
        default_scopes: { ...ALL_SCOPES_ON },
        // Guardians removed under the PREVIOUS code stay removed -- see
        // rotateMyGuardianCode for why this is carried rather than reset.
        revoked_guardian_uids: [...carriedRevocations],
        created_at: serverTimestamp(),
      })
      return candidate
    } catch (err) {
      if (err?.code !== 'permission-denied' || attempt === 7) throw err
    }
  }
  throw new Error('Could not allocate a code. Please try again.')
}

/**
 * The code this student already holds, if any.
 *
 * Found by query rather than a pointer field on users/{uid}: students may write
 * only `photo_url` on their own profile, so there is nowhere on it to keep one.
 * The rules allow this list only for the caller's own code.
 */
async function findMyCode(uid) {
  const snap = await getDocs(query(collection(db, 'guardian_codes'), where('student_uid', '==', uid)))
  const ids = snap.docs
    .map((d) => d.id)
    .filter((id) => CODE_PATTERN.test(id))
    /* Sorted explicitly rather than trusting the order Firestore returns: this
       and the MOBILE copy must pick the SAME survivor, or a student would read
       one code off their laptop and a different one off their phone. */
    .sort()
  if (!ids.length) return null

  /* A student must have exactly ONE live code, so the losers are deleted here
     rather than left redeemable. Duplicates arise if a rotation fails between
     minting and deleting, or if two devices mint at the same instant. Failures
     are ignored -- handing back a working code matters more than the tidy-up,
     and the next read tries again. */
  ids.slice(1).forEach((stale) => {
    deleteDoc(doc(db, 'guardian_codes', stale)).catch(() => {})
  })
  return ids[0]
}

/** This student's code, creating one on first call. */
export async function ensureMyGuardianCode(uid) {
  const existing = await findMyCode(uid)
  if (existing) return existing
  const snap = await getDoc(doc(db, 'users', uid))
  return mintCode(uid, snap.data() ?? {})
}

/**
 * Mint a new code and retire the old one.
 *
 * Guardians already connected stay connected -- their link document is what
 * grants access and it does not reference the code. Rotating only stops anyone
 * still holding the old six characters from redeeming them.
 */
export async function rotateMyGuardianCode(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  const previous = await findMyCode(uid)

  /* Revocations survive rotation. A fresh code document starts with an empty
     list, so rotating for an unrelated reason -- a code the student thinks has
     leaked -- would otherwise quietly readmit every guardian anyone had
     removed, including ones a teacher removed for a minor.

     Best effort by necessity: the rules cannot enforce the carry-forward,
     because the create rule cannot see the document being replaced. It fixes
     the honest path, not a determined student with a console. */
  const carried = previous
    ? ((await getDoc(doc(db, 'guardian_codes', previous))).data()?.revoked_guardian_uids ?? [])
    : []
  const code = await mintCode(uid, snap.data() ?? {}, carried)

  // Retire last: the new code is already live, so a failure here leaves the
  // student with two working codes rather than none -- the safer half to fail.
  if (previous && previous !== code) {
    try {
      await deleteDoc(doc(db, 'guardian_codes', previous))
    } catch {
      /* a stale document is not worth failing the rotation over */
    }
  }
  return code
}

// ---------------------------------------------------------------------------
// The student's guardians
// ---------------------------------------------------------------------------

function toLink(id, data) {
  return {
    link_id: id,
    student_uid: data.student_uid,
    guardian_uid: data.guardian_uid,
    guardian_name: data.guardian_name ?? null,
    guardian_email: data.guardian_email ?? null,
    relationship_type: data.relationship_type ?? null,
    status: data.status ?? 'pending',
    scopes: { ...ALL_SCOPES_OFF, ...(data.scopes ?? {}) },
    is_minor: data.is_minor === true,
  }
}

export async function listMyGuardians(uid) {
  const snap = await getDocs(query(collection(db, 'guardian_links'), where('student_uid', '==', uid)))
  return snap.docs.map((d) => toLink(d.id, d.data()))
}

/**
 * Approve a pending guardian, granting the student's chosen defaults.
 *
 * The rules allow any scopes map on this write, so the defaults are applied
 * here rather than server-side -- they are the student's own preference about
 * their own records, not a privilege boundary.
 */
export async function approveGuardianLink(linkId, scopes = ALL_SCOPES_ON) {
  await updateDoc(doc(db, 'guardian_links', linkId), {
    status: 'approved',
    scopes: { ...scopes },
    approved_at: serverTimestamp(),
  })
}

/** The student's starting permissions for the next guardian they approve. */
export async function getDefaultScopes(code) {
  const snap = await getDoc(doc(db, 'guardian_codes', code))
  return { ...ALL_SCOPES_ON, ...(snap.data()?.default_scopes ?? {}) }
}

/** Only field on the code document a student may edit -- see firestore.rules. */
export async function setDefaultScopes(code, scopes) {
  await updateDoc(doc(db, 'guardian_codes', code), { default_scopes: { ...scopes } })
}

export async function setGuardianLinkScopes(linkId, scopes) {
  await updateDoc(doc(db, 'guardian_links', linkId), { scopes })
}

/** Revoking is a delete: the guardian loses the document the rules read, so
 *  access stops at once rather than depending on a status field.
 *
 *  The guardian is also recorded on the CODE, because the code outlives the
 *  link -- there is no consumed flag and revoking does not rotate one. Without
 *  that record a removed guardian could retype the same six characters, and
 *  for a minor the create rule auto-approves, handing back every scope with
 *  nobody approving it.
 *
 *  Marked BEFORE the delete. If the mark fails, the revoke aborts with the
 *  guardian still attached -- visible, and the caller can retry. Deleting
 *  first and then failing to mark would look like a successful revoke while
 *  quietly leaving the way back in, which is the worse half to get wrong. */
export async function revokeGuardianLink(linkId) {
  const linkRef = doc(db, 'guardian_links', linkId)
  const link = (await getDoc(linkRef)).data()

  if (link?.code && link?.guardian_uid) {
    const codeRef = doc(db, 'guardian_codes', link.code)
    // A code that has already been rotated away is dead to everyone, so there
    // is nothing to block and nothing to write to.
    if ((await getDoc(codeRef)).exists()) {
      await updateDoc(codeRef, { revoked_guardian_uids: arrayUnion(link.guardian_uid) })
    }
  }

  await deleteDoc(linkRef)
}
