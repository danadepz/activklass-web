import { useState } from 'react'
import { LINK_HINT, isSafeLink, uploadAttachment, uploadsPossible } from '@/lib/attachments'
import { ink, muted, faint, green, red, line, mono } from '@/theme'

/** Extensions we can name a type for, so a link can be checked against `accept`. */
const EXT_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic',
  '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

const rulesOf = (accept) =>
  (accept ?? '').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean)

/** Does a name/type pair satisfy one `accept` rule? Mirrors the browser's own matching. */
function matchesRule(rule, name, type) {
  if (rule.startsWith('.')) return name.endsWith(rule)
  if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
  return type === rule
}

/**
 * Does a picked file satisfy `accept`?
 *
 * Falls back to the extension table when the browser reports no MIME type,
 * which it does for some phone camera formats. Without the fallback a HEIC
 * photo fails an `image/*` field -- rejecting a student's own photo for a
 * detail of how their OS registered the format.
 */
function fileAccepted(file, accept) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  const ext = name.match(/\.[a-z0-9]{1,8}$/)?.[0] ?? ''
  const type = (file.type || EXT_TYPES[ext] || '').toLowerCase()
  return rulesOf(accept).some((r) => matchesRule(r, name, type))
}

/**
 * Reject a link only when its URL *proves* the wrong type.
 *
 * Checked against the extension in the path, and a link with no extension is
 * allowed. That is deliberately lenient: `drive.google.com/file/d/abc/view` and
 * a Photos share link name no file at all, and those are the links this field
 * exists to accept. Being strict here would reject the common case to catch the
 * rare one. Returns the offending extension, or null when the link is fine.
 */
function linkRejectedExt(url, accept) {
  if (!accept) return null
  let ext
  try {
    ext = new URL(url).pathname.toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0]
  } catch {
    return null
  }
  if (!ext) return null
  const type = EXT_TYPES[ext] ?? ''
  return rulesOf(accept).some((r) => matchesRule(r, ext, type)) ? null : ext
}

/** `.pdf,.doc,image/*` -> "PDF, DOC or images", for an error a student can act on. */
function describeAccept(accept) {
  const words = rulesOf(accept).map((r) =>
    r.endsWith('/*') ? `${r.slice(0, -2)}s` : r.replace(/^\./, '').toUpperCase())
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`
}

/**
 * Attach a file, or paste a link to one. Calls `onAttached(url)` either way.
 *
 * Shared by the syllabus material editor and the two contest forms, so the
 * wording and the safety check stay identical everywhere a student or teacher
 * attaches evidence.
 *
 * Both routes are offered whenever uploads are possible, rather than treating
 * the link as a fallback. On a phone, pasting a Photos link is often easier than
 * finding a file, and when Cloud Storage is not provisioned the link is the only
 * route that works -- so it is presented as a normal choice, not an apology.
 *
 * `accept` takes the same syntax as the input attribute (`image/*`,
 * `.pdf,.doc,.docx`). It is enforced on both routes, but not equally: a picked
 * file is checked properly, while a link is only rejected when its URL names a
 * disallowed extension. Omit it to accept anything, which is what the syllabus
 * material editor wants.
 */
export default function AttachmentField({
  storagePath,
  onAttached,
  label = 'Attachment',
  accept,
  compact = false,
}) {
  const canUpload = uploadsPossible()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const field = {
    width: '100%', padding: compact ? '8px 10px' : '10px 12px',
    fontSize: compact ? 13 : 14, color: ink, background: '#FFFFFF',
    border: `1.5px solid rgba(14,42,92,0.14)`, borderRadius: 9,
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setDone('')
    // `accept` on the input is only a dialog filter -- the picker lets you
    // switch to "All files" -- so the same rule is applied to what came back.
    if (!fileAccepted(file, accept)) {
      setError(`That file type is not accepted here. Choose ${describeAccept(accept)}.`)
      e.target.value = ''
      return
    }
    setBusy(true)
    try {
      const url = await uploadAttachment(`${storagePath}/${Date.now()}-${file.name}`, file)
      onAttached(url, { name: file.name, kind: 'file' })
      setDone(`Attached ${file.name}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      e.target.value = ''  // let the same file be retried after a fix
    }
  }

  function onUseLink() {
    setError(''); setDone('')
    if (!isSafeLink(link)) {
      setError('That does not look like a web link. It should start with http:// or https://')
      return
    }
    const badExt = linkRejectedExt(link.trim(), accept)
    if (badExt) {
      setError(`That link points to a ${badExt} file, which is not accepted here. Link to ${describeAccept(accept)}.`)
      return
    }
    onAttached(link.trim(), { name: link.trim(), kind: 'link' })
    setDone('Link attached')
    setLink('')
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{label}</div>

      {canUpload && (
        <label style={{ fontSize: 12.5, color: muted }}>
          <input type="file" accept={accept} onChange={onFile} disabled={busy}
                 style={{ display: 'block', fontSize: 12.5, marginTop: 4 }} />
        </label>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://drive.google.com/…"
          style={{ ...field, flex: 1, minWidth: 180 }}
        />
        <button type="button" onClick={onUseLink} disabled={busy || !link.trim()}
                style={{
                  padding: compact ? '8px 12px' : '10px 14px', fontSize: 13, fontWeight: 600,
                  color: ink, background: '#FFFFFF',
                  border: `1.5px solid ${line}`, borderRadius: 9,
                  cursor: link.trim() ? 'pointer' : 'not-allowed',
                  opacity: link.trim() ? 1 : 0.5,
                }}>
          Use link
        </button>
      </div>

      <p style={{ ...mono, fontSize: 11, color: faint, margin: 0, lineHeight: 1.5 }}>
        {canUpload ? LINK_HINT : `Uploads are off for this project. ${LINK_HINT}`}
        {accept && ` ${describeAccept(accept)} only.`}
      </p>

      {busy && <p style={{ fontSize: 12.5, color: muted, margin: 0 }}>Uploading…</p>}
      {error && (
        <p role="alert" style={{
          fontSize: 12.5, color: red, background: 'rgba(192,57,43,0.07)',
          border: '1px solid rgba(192,57,43,0.3)', borderRadius: 9, padding: '8px 10px', margin: 0,
        }}>
          {error}
        </p>
      )}
      {done && !error && (
        <p style={{ fontSize: 12.5, color: green, margin: 0 }}>{done}</p>
      )}
    </div>
  )
}
