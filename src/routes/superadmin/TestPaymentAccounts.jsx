import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTestPaymentAccounts, fetchTestPaymentEligibility, setTestPaymentAccount } from '@/lib/superadmin'

const KEY = ['sa-test-payment-accounts']

/**
 * Enroll a fresh demonstration account for PayMongo TEST checkout, or disable one.
 * The server decides eligibility (created after the enrollment cutoff, no payment
 * history); this card only asks and shows the answer.
 */
export default function TestPaymentAccounts() {
  const queryClient = useQueryClient()
  const [ownerId, setOwnerId] = useState('')
  const [error, setError] = useState('')
  const { data: elig } = useQuery({ queryKey: [...KEY, 'eligibility'], queryFn: fetchTestPaymentEligibility })
  const { data } = useQuery({ queryKey: KEY, queryFn: fetchTestPaymentAccounts })
  const accounts = data?.accounts ?? []

  const mut = useMutation({
    mutationFn: ({ id, enabled }) => setTestPaymentAccount(id, enabled, 'defense demo'),
    onSuccess: (_, { enabled }) => {
      setError('')
      if (enabled) setOwnerId('')
      queryClient.invalidateQueries({ queryKey: KEY })
    },
    onError: (e) => setError(e.message),
  })

  const submit = (e) => {
    e.preventDefault()
    const id = ownerId.trim()
    if (id) mut.mutate({ id, enabled: true })
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-800 p-5" aria-labelledby="tpa-title">
      <h2 id="tpa-title" className="text-sm font-bold text-zinc-100">TEST payment accounts</h2>
      <p className="mt-1 text-xs text-zinc-400">
        {elig?.open
          ? `Only accounts created after ${new Date(elig.created_after).toLocaleString()} can be enrolled. Existing subscribers, unpaid schools and trials are refused.`
          : 'Enrollment is closed: no enrollment cutoff is set on the server.'}
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="tpa-owner" className="sr-only">Teacher uid or school id</label>
        <input
          id="tpa-owner"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          placeholder="Teacher uid or school id"
          className="min-w-[16rem] flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-200"
        />
        <button
          type="submit"
          disabled={!elig?.open || !ownerId.trim() || mut.isPending}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
        >
          Enroll
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      <ul className="mt-3 divide-y divide-zinc-800">
        {accounts.length === 0 && <li className="py-2 text-xs text-zinc-500">No accounts enrolled.</li>}
        {accounts.map((a) => (
          <li key={a.owner_id} className="flex items-center justify-between gap-3 py-2">
            <span className="font-mono text-xs text-zinc-300">{a.owner_id}</span>
            <span className="flex items-center gap-3">
              <span className={`text-xs ${a.enabled ? 'text-emerald-400' : 'text-zinc-500'}`}>{a.enabled ? 'Enabled' : 'Disabled'}</span>
              {a.enabled && (
                <button
                  type="button"
                  onClick={() => mut.mutate({ id: a.owner_id, enabled: false })}
                  disabled={mut.isPending}
                  className="rounded-lg border border-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300 hover:border-zinc-700"
                >
                  Disable
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
