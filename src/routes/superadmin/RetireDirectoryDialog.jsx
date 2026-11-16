import { useState } from 'react'
import { Dialog } from './index'

export default function RetireDirectoryDialog({
  entry,
  onClose,
  onConfirm,
  isPending = false,
  error = null,
}) {
  const defaultReason = entry?.review_status === 'eligible'
    ? 'Verified obsolete test fixture'
    : ''
  const [reason, setReason] = useState(defaultReason)
  const [confirmed, setConfirmed] = useState(false)

  if (!entry) return null

  const isEligible = Boolean(entry.eligible_for_retirement)
  const canSubmit = reason.trim().length > 0 && (isEligible || confirmed) && !isPending

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    onConfirm(entry, { reason: reason.trim(), confirmed })
  }

  return (
    <Dialog
      title={`Retire School Directory Entry`}
      subtitle="Remove from registration dropdowns while preserving historical records"
      onClose={isPending ? () => {} : onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Entry Identity Box */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-zinc-100 text-sm">
              {entry.name}
            </span>
            <span className="font-mono text-xs rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 font-bold border border-zinc-700">
              {entry.abbreviation || entry.id.toUpperCase()}
            </span>
          </div>
          <div className="text-xs text-zinc-400 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Document ID:</span>
              <span className="font-mono text-zinc-300">{entry.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Registered Institution:</span>
              <span className={entry.linked_school ? 'text-amber-400 font-medium' : 'text-zinc-400'}>
                {entry.linked_school ? `${entry.linked_school.name} (${entry.linked_school.id})` : 'Independent (None)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Profile Affiliations:</span>
              <span className={entry.affiliations_count > 0 ? 'text-amber-400 font-medium' : 'text-zinc-400'}>
                {entry.affiliations_count} teacher profile(s)
              </span>
            </div>
          </div>
        </div>

        {/* Protection / Refusal Alert if in use or linked */}
        {(entry.linked_school || entry.affiliations_count > 0) && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200 space-y-1">
            <div className="font-bold text-red-300 flex items-center gap-1.5">
              <span>⚠️ Action Blocked by Safety Guard</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {entry.reason || 'This school directory entry is linked to an active institution or in use by active teacher profiles. Retirement is refused to protect academic records.'}
            </p>
          </div>
        )}

        {/* Policy Explanation */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-200/90 space-y-1">
          <div className="font-semibold text-amber-300 text-[11px] uppercase tracking-wider">
            Option B Safe Retirement
          </div>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-zinc-300/90 leading-relaxed">
            <li>Excludes this school from Individual and Institution registration dropdowns immediately.</li>
            <li>Preserves existing teacher profiles, gradebooks, attendance, and all historical records.</li>
            <li>Leaves the Firestore document intact with status: <code className="text-amber-300 font-mono">retired</code> tombstone.</li>
          </ul>
        </div>

        {/* Reason Input */}
        <div>
          <label htmlFor="retire-reason" className="block text-xs font-semibold text-zinc-300 mb-1">
            Retirement Reason <span className="text-red-400">*</span>
          </label>
          <input
            id="retire-reason"
            type="text"
            required
            disabled={isPending}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Verified obsolete test fixture"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Confirmation Checkbox for non-automatic eligible entries */}
        <div className="flex items-start gap-2 pt-1">
          <input
            id="confirm-retire-checkbox"
            type="checkbox"
            disabled={isPending}
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-0"
          />
          <label htmlFor="confirm-retire-checkbox" className="text-xs text-zinc-300 select-none cursor-pointer leading-tight">
            I confirm that this school directory entry is obsolete and should be retired from registration.
          </label>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || Boolean(entry.linked_school || entry.affiliations_count > 0)}
            className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-xs font-semibold text-zinc-950 transition flex items-center gap-2"
          >
            {isPending && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />}
            Confirm Retirement
          </button>
        </div>
      </form>
    </Dialog>
  )
}
