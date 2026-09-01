import { useRef } from 'react'
import { toast } from '@/components/ui/toast'
import { Dialog } from './index'

/**
 * The notice to send, with a Copy button.
 *
 * Plain text so it pastes into any mail client. The subject is copied with
 * it, on its own line, because the person sending has to type it otherwise
 * and the subject is what the recipient searches for later.
 *
 * Lifted out of requests.jsx when the verifications queue grew a notice of
 * its own: both approvals are announced by hand, and two copies of a copy
 * button is how one of them quietly loses the clipboard fallback below.
 * Everything specific to the audience — the heading and what the copy says —
 * comes in as props; nothing here knows whether it is talking to a school or
 * to a teacher.
 */
export default function MessageDialog({ title, subtitle, message, onClose, copiedHint }) {
  const box = useRef(null)
  const full = `Subject: ${message.subject}\n\n${message.body}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(full)
      toast.success(copiedHint ?? 'Copied. Paste it into an email.')
    } catch {
      // Clipboard access can be refused on a forwarded port; fall back to
      // selecting the text so one keystroke does the same job.
      box.current?.select()
      toast.error('Copy was blocked by the browser — the text is selected, press Ctrl+C.')
    }
  }

  return (
    <Dialog title={title} subtitle={subtitle} onClose={onClose}>
      <textarea
        ref={box}
        readOnly
        rows={18}
        value={full}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200"
      />
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={copy}
          className="flex-1 rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-zinc-950 hover:bg-amber-300"
        >
          Copy message
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-zinc-800 py-2.5 text-sm font-semibold text-zinc-400"
        >
          Done
        </button>
      </div>
    </Dialog>
  )
}
