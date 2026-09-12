/**
 * Profile photos, taken from the device and stored inline.
 *
 * Owned by the logic lane (see OWNERSHIP.md).
 *
 * Why not Cloud Storage
 * ---------------------
 * When this was written there was no bucket: Firebase Storage needs the Blaze
 * plan and the project was on Spark, so `uploadBytes` 404'd — which is why the
 * photo control used to ask a student to paste a Google Drive or Photos link
 * instead of opening their own files. That is a poor thing to ask of a student
 * and it makes the photo depend on a share link staying public. The project
 * moved to Blaze on 2026-09-12, but the inline approach stays: it needs no
 * Storage rule, no download URL, and no second read.
 *
 * A profile photo is small enough not to need a bucket. Cropped to a square
 * and resized to 256px, a JPEG lands around 15-40 KB, and a Firestore document
 * holds 1 MiB — so the image rides in `users/{uid}.photo_url` as a data URL and
 * every existing reader keeps working, because an <img src> cannot tell a data
 * URL from an https one.
 *
 * This is deliberately NOT the answer for the other three attachment features
 * (syllabus materials, attendance and grade contest evidence). Those carry
 * documents of arbitrary size, and inlining them would blow the document limit
 * and bloat every read of the record that held them. They stay link-based —
 * see lib/attachments.js.
 */

/** Square edge of the stored image, in CSS pixels. */
export const AVATAR_SIZE = 256

/**
 * A hard ceiling well under Firestore's 1 MiB document limit.
 *
 * The photo shares a document with the profile, and that document is read on
 * nearly every screen, so the budget is about read cost rather than the limit.
 */
export const MAX_BYTES = 120 * 1024

export const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/heic'

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    // A file the browser cannot decode: HEIC on desktop Chrome is the usual
    // one, and the raw event gives the user nothing to act on.
    img.onerror = () => reject(new Error('That image format is not supported here. Try a JPG or PNG.'))
    img.src = src
  })
}

/**
 * Centre-crop to a square, scale to AVATAR_SIZE, encode as JPEG.
 *
 * Cropped rather than letterboxed because every place the avatar appears is a
 * circle; padding a portrait to fit would show bars inside the circle.
 *
 * Quality steps down until it fits the budget rather than failing outright — a
 * student photographing themselves against a busy background should not be
 * told their photo is too complicated.
 */
export async function fileToAvatarDataUrl(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.')
  }
  // Guards the FileReader, not the output: a 40 MP phone photo is fine to
  // downscale, but a several-hundred-MB file should not be read into memory.
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('That image is very large. Choose one under 25 MB.')
  }

  const img = await loadImage(await readAsDataUrl(file))

  const edge = Math.min(img.width, img.height)
  const sx = (img.width - edge) / 2
  const sy = (img.height - edge) / 2

  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  // JPEG has no alpha; without this, a transparent PNG composites onto black.
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
  ctx.drawImage(img, sx, sy, edge, edge, 0, 0, AVATAR_SIZE, AVATAR_SIZE)

  for (const quality of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    // A data URL is base64: roughly 4 bytes of text per 3 bytes of image.
    if (url.length * 0.75 <= MAX_BYTES) return url
  }
  throw new Error('Could not compress that image small enough. Try a simpler photo.')
}
