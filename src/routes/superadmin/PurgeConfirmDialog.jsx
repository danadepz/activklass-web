import { Dialog } from './index'

export default function PurgeConfirmDialog({
  title = 'Purge Account',
  name,
  email,
  detail,
  onClose,
  onConfirm,
  isPending,
}) {
  return (
    <Dialog
      title={title}
      subtitle="Permanently delete test data and credentials"
      onClose={isPending ? () => {} : onClose}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs leading-relaxed text-red-200">
          <div className="font-semibold text-red-300 mb-1 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400 animate-pulse" />
            Warning: Irreversible Action
          </div>
          <p>
            This will permanently delete the login from <strong>Firebase Authentication</strong> and wipe
            its database records. The email <strong className="font-mono text-zinc-200">({email || name})</strong>{' '}
            will become available for fresh testing.
          </p>
          <p className="mt-2 text-zinc-400">
            <strong>Guarded:</strong> If this account has any active classes or enrolled students, the operation
            will be blocked automatically to prevent data corruption.
          </p>
        </div>

        {name && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs">
            <span className="text-zinc-500 uppercase tracking-wider text-[10px] block font-semibold">Target</span>
            <div className="font-medium text-zinc-200 mt-0.5">{name}</div>
            {email && <div className="font-mono text-[11px] text-zinc-400 mt-0.5">{email}</div>}
            {detail && <div className="text-[11px] text-zinc-500 mt-1">{detail}</div>}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Purging…' : 'Confirm Purge'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
