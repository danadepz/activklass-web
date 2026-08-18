import { useState } from 'react'
import { LINK_HINT, isSafeLink, uploadAttachment, uploadsPossible } from '@/lib/attachments'
import { ink, muted, faint, green, red, line, mono } from '@/theme'

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
 */
export default function AttachmentField({
  storagePath,
  onAttached,
  label = 'Attachment',
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
    setBusy(true); setError(''); setDone('')
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
    onAttached(link.trim(), { name: link.trim(), kind: 'link' })
    setDone('Link attached')
    setLink('')
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{label}</div>

      {canUpload && (
        <label style={{ fontSize: 12.5, color: muted }}>
          <input type="file" onChange={onFile} disabled={busy}
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
