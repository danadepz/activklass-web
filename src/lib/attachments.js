/**
 * File attachments that work whether or not Cloud Storage is provisioned.
 *
 * Owned by the Data/logic lane (see OWNERSHIP.md -- this file was in no lane
 * at all until T-99 added it there; the comment used to claim the logic lane
 * and the table never backed it up, the same gap `lib/csv.js` had). Firebase
 * Storage requires the Blaze plan, and until 2026-09-12 this project was on
 * Spark, so `uploadBytes` threw a 404 on the bucket. Three features were
 * written against it -- syllabus materials, attendance-contest evidence and
 * score-contest evidence -- and all three crashed rather than explaining
 * themselves. The project is on Blaze now and the bucket exists, so uploads
 * go through; the 404 branch below stays for a fresh project that has not
 * been provisioned.
 *
 * The point of this module is that a link is a first-class attachment, not a
 * downgrade. A teacher pasting a Google Drive URL and a teacher uploading a PDF
 * both end up with `{ url }`; nothing downstream can tell them apart, so no
 * reader needs changing and none of these features depends on billing.
 */
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'

/**
 * Whether uploads can be attempted at all.
 *
 * Deliberately a cheap synchronous check on the client handle rather than a
 * probe request. `storage` is null when the Firebase config is missing, and a
 * real bucket check costs a round trip on every render of every form. When the
 * handle exists but the bucket does not, the upload itself reports it -- see
 * uploadAttachment.
 */
export function uploadsPossible() {
  return storage != null
}

const NOT_PROVISIONED =
  'File uploads are not switched on for this project yet. Paste a link instead ' +
  '— a Google Drive or Photos share link works.'

/**
 * A safe, readable filename for a save dialog, built from what the person
 * named their own file.
 *
 * Nothing sets a filename on the download URL itself, so a browser saving it
 * falls back to guessing one from the storage object's full path -- the
 * `{id}-{name}` this module writes it under, inside a URL-encoded folder
 * structure -- which is the "random" name tester ticket T-99 reported (a
 * module PDF proposing an unstructured name, unlike a report's own download,
 * which sets its name directly). Slugified to plain ASCII so spaces, quote
 * characters or non-Latin letters can go straight into a Content-Disposition
 * header with no escaping.
 */
export function composeDownloadName(originalName) {
  const name = (originalName ?? '').trim()
  const dot = name.lastIndexOf('.')
  const hasExt = dot > 0 && dot < name.length - 1
  const base = hasExt ? name.slice(0, dot) : name
  const ext = hasExt ? name.slice(dot).toLowerCase() : ''
  const slug = base
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'file'}${ext}`
}

/**
 * `inline`, not `attachment` -- a file a browser can preview (a PDF, an
 * image) still opens in the tab exactly as it does today; only the name a
 * save dialog proposes changes. The slug above is ASCII-only, so it needs no
 * quoting here.
 */
function contentDispositionFor(filename) {
  return `inline; filename="${filename}"`
}

/**
 * Upload one file and return its download URL.
 *
 * Throws with teacher-readable text. The raw Firebase error for an
 * unprovisioned bucket is a 404 on a googleapis URL, which tells a teacher
 * nothing and reads like the app is broken.
 */
export async function uploadAttachment(path, file) {
  if (!uploadsPossible()) throw new Error(NOT_PROVISIONED)
  try {
    const fileRef = storageRef(storage, path)
    await uploadBytes(fileRef, file, {
      contentType: file.type,
      contentDisposition: contentDispositionFor(composeDownloadName(file.name)),
    })
    return await getDownloadURL(fileRef)
  } catch (err) {
    const code = err?.code ?? ''
    // Storage never provisioned: the bucket itself 404s.
    if (code === 'storage/unknown' || /404/.test(err?.message ?? '')) {
      throw new Error(NOT_PROVISIONED)
    }
    if (code === 'storage/unauthorized') {
      throw new Error('You do not have permission to attach a file here.')
    }
    if (code === 'storage/quota-exceeded') {
      throw new Error('The project has run out of file storage. Paste a link instead.')
    }
    if (code === 'storage/retry-limit-exceeded') {
      throw new Error('The upload kept timing out. Check your connection, or paste a link instead.')
    }
    throw new Error(`Could not upload that file: ${err?.message ?? 'unknown error'}`)
  }
}

/**
 * Is this a link we are willing to store?
 *
 * http(s) only. A `javascript:` or `data:` URL pasted into a field that is later
 * rendered as an anchor is a script-injection route, and these links are typed
 * by students into a form a teacher then clicks.
 */
export function isSafeLink(value) {
  const text = (value ?? '').trim()
  if (!text) return false
  try {
    const parsed = new URL(text)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const LINK_HINT =
  'Upload it to Google Drive, Photos or Classroom, then paste the share link here.'
