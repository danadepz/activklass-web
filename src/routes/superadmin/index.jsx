import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  SEAT_KEYS,
  SUBSCRIBER_STATUSES,
  createSubscriber,
  fetchPlans,
  fetchSubscribers,
  updateSubscriber,
} from '@/lib/superadmin'
import { absorbMessage } from '@/lib/approvalMessage'
import { SEGMENTS, STATUSES, analyticsFor, filterRows } from '@/lib/superadminAnalytics'
import AnalyticsBand from './AnalyticsBand'
import AbsorbDialog from './AbsorbDialog'
import MessageDialog from './MessageDialog'
import { toast } from '@/components/ui/toast'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'

const signInUrl = () => `${window.location.origin}/login`

/**
 * Subscriber console.
 *
 * Two kinds of paying party, matching the backend: an institution keyed by its
 * school id and managed by an admin we provision, and a solo teacher keyed by
 * their own uid.
 *
 * Seat usage is read-only here and computed server-side per subscriber. It used
 * to be counted across every user in the database, which flattered nobody once
 * a second customer existed.
 */

const STATUS_STYLE = {
  active: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30',
  trial: 'bg-sky-400/10 text-sky-300 border-sky-400/30',
  suspended: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
  cancelled: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
}

function StatusPill({ status }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        STATUS_STYLE[status] ?? STATUS_STYLE.cancelled
      }`}
    >
      {status ?? 'unknown'}
    </span>
  )
}

/** used / seats with a bar. An absent cap is unlimited, not zero. */
function SeatMeter({ label, slot }) {
  const unlimited = slot?.seats == null
  const pct = unlimited ? 0 : Math.min(100, slot.pct ?? 0)
  return (
    <div className="min-w-[7.5rem]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
        <span className={`font-mono text-xs ${slot?.over ? 'text-red-400' : 'text-zinc-300'}`}>
          {slot?.used ?? 0}
          <span className="text-zinc-600">/{unlimited ? '∞' : slot.seats}</span>
        </span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full ${slot?.over ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}`}
          style={{ width: unlimited ? '100%' : `${pct}%`, opacity: unlimited ? 0.25 : 1 }}
        />
      </div>
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/50 focus:outline-none'

/**
 * One filter row scoping the whole console — the analytics band and the table
 * both render against the same slice. Per-card filters were the alternative and
 * they let two panels disagree about what you are looking at.
 */
function FilterTabs({ options, value, onChange, label }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </span>
      {options.map((option) => {
        const selected = value === option.key
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            aria-pressed={selected}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              selected
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
            }`}
          >
            {option.label}
            {option.count != null && (
              <span className={`ml-1.5 font-mono tabular-nums ${selected ? 'text-amber-400/70' : 'text-zinc-600'}`}>
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default function SuperAdminSubscribersPage() {
  const queryClient = useQueryClient()
  const [showProvision, setShowProvision] = useState(false)
  const [editing, setEditing] = useState(null)
  const [absorbing, setAbsorbing] = useState(null) // the institution row being absorbed into
  const [absorbNotice, setAbsorbNotice] = useState(null) // the copy-ready notice after a successful absorb
  const [banner, setBanner] = useState(null)
  const [segment, setSegment] = useState('all')
  const [status, setStatus] = useState('all')

  /* staleTime, because both of these are slow enough to notice and neither
     changes on its own. The plan catalogue is a constant the server compiles
     in; the subscriber list only moves when someone on this page moves it, and
     every mutation here already calls `refresh()` to invalidate it. Without a
     staleTime the query client's default of 0 refetched both on every mount —
     so switching to Verifications and back, or arriving from a browser Back,
     paid the full ~1s of /subscribers again for a list that could not have
     changed. */
  const { data: plansData } = useQuery({
    queryKey: ['sa-plans'],
    queryFn: fetchPlans,
    staleTime: Infinity,
  })
  const {
    data,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['sa-subscribers'],
    queryFn: fetchSubscribers,
    staleTime: 5 * 60 * 1000,
  })

  const plans = plansData?.plans ?? {}
  // Memoised so the `?? []` fallback is not a fresh array on every render,
  // which would defeat the derived memos below.
  const rows = useMemo(() => data?.subscribers ?? [], [data])

  // The slice everything on the page is scoped to.
  const visible = useMemo(() => filterRows(rows, { segment, status }), [rows, segment, status])
  const analytics = useMemo(() => analyticsFor(visible), [visible])

  // Tab counts come from the UNFILTERED rows for the axis being chosen, so a
  // tab always says how many it would show — a count that changed as you
  // filtered would make the tabs unusable for navigating.
  const segmentOptions = useMemo(
    () =>
      SEGMENTS.map((s) => ({
        ...s,
        count: filterRows(rows, { segment: s.key, status }).length,
      })),
    [rows, status],
  )
  const statusOptions = useMemo(
    () =>
      [{ key: 'all', label: 'Any' }, ...STATUSES.map((s) => ({ key: s, label: s }))].map((s) => ({
        ...s,
        count: filterRows(rows, { segment, status: s.key }).length,
      })),
    [rows, segment],
  )
  const filtered = segment !== 'all' || status !== 'all'

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sa-subscribers'] })

  const patch = useMutation({
    mutationFn: ({ ownerId, ...changes }) => updateSubscriber(ownerId, changes),
    onSuccess: () => {
      setBanner(null)
      setEditing(null)
      refresh()
    },
    onError: (err) => setBanner(err.message),
  })

  if (isLoading) return <SkeletonTable rows={7} cols={6} tone="dark" label="Loading subscribers" />
  if (error) {
    /* Branch on the status. The old version showed the "missing claim" hint for
       every failure, which sent you looking at permissions when the real cause
       was Flask not running — by far the more common one locally. */
    const status = error.status ?? 0
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
        <p className="text-sm text-red-300">{error.message}</p>

        {status === 403 && (
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            This account is missing the super admin claim, or its token predates the grant. Run{' '}
            <code className="font-mono text-zinc-400">flask grant-superadmin --email …</code>, then
            sign out and back in — claims ride in the ID token, so an open session keeps the old one.
          </p>
        )}

        {(status === 0 || status >= 500) && (
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            The API did not respond. Start the backend:{' '}
            <code className="font-mono text-zinc-400">
              venv\Scripts\python -m flask --app wsgi run --port 5000
            </code>{' '}
            in activklass-backend. Vite proxies <code className="font-mono text-zinc-400">/api</code>{' '}
            there, so this page cannot load anything until it is up.
          </p>
        )}

        <button
          onClick={refresh}
          className="mt-4 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-zinc-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live from the subscriber roster — no separate analytics store.
          </p>
        </div>
        <button
          onClick={() => setShowProvision(true)}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-300"
        >
          + New subscriber
        </button>
      </div>

      {/* One filter row above everything it scopes: band and table alike. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
        <FilterTabs label="Segment" options={segmentOptions} value={segment} onChange={setSegment} />
        <FilterTabs label="Status" options={statusOptions} value={status} onChange={setStatus} />
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setSegment('all')
              setStatus('all')
            }}
            className="ml-auto text-[11px] font-semibold text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-4">
        <AnalyticsBand analytics={analytics} total={visible.length} stale={isFetching} />
      </div>

      {banner && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-300">
          {banner}
        </div>
      )}

      {/* The table renders even with no rows. An empty console should still
          show what it will hold, and headers make it obvious the page loaded
          rather than failed. */}
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">
          Subscribers
        </h2>
        <span className="font-mono text-[11px] text-zinc-600 tabular-nums">
          {visible.length}
          {filtered && ` of ${rows.length}`} shown
        </span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[54rem] text-left">
          <thead className="bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Subscriber</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Usage</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {visible.length === 0 ? (
              <tr>
                {/* An empty filter result is not an empty console — saying "no
                    subscribers yet" to someone who just clicked Suspended reads
                    as data loss. */}
                <td colSpan={5} className="px-4 py-14 text-center">
                  <p className="text-sm font-semibold text-zinc-300">
                    {filtered ? 'No subscribers match this filter' : 'No subscribers yet'}
                  </p>
                  {filtered ? (
                    <>
                      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
                        {rows.length} subscriber{rows.length === 1 ? '' : 's'} exist, none in this
                        slice.
                      </p>
                      <button
                        onClick={() => {
                          setSegment('all')
                          setStatus('all')
                        }}
                        className="mt-5 rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-300 hover:border-zinc-600"
                      >
                        Clear filters
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
                        Provisioning an institution creates its school, its first admin account and
                        its subscription together, so the customer has something to sign into. A
                        solo teacher gets an account and a subscription keyed to it.
                      </p>
                      <button
                        onClick={() => setShowProvision(true)}
                        className="mt-5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-400/20"
                      >
                        + New subscriber
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              visible.map(({ subscription: sub, owner, usage }) => (
                <tr key={sub.id} className="align-middle hover:bg-zinc-900/30">
                  <td className="px-4 py-4">
                    <div className="text-sm font-semibold text-zinc-100">{owner?.name}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {sub.type === 'institution' ? 'Institution' : 'Solo teacher'}
                      {owner?.contact_email ? ` · ${owner.contact_email}` : ''}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-600">{sub.id}</div>
                  </td>

                  <td className="px-4 py-4">
                    <div className="text-sm capitalize text-zinc-200">{sub.plan ?? '—'}</div>
                    {sub.limits_overridden && (
                      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                        Custom seats
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex gap-5">
                      <SeatMeter label="Teachers" slot={usage?.teachers} />
                      <SeatMeter label="Students" slot={usage?.students} />
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <StatusPill status={sub.status} />
                  </td>

                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditing(sub)}
                        className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-zinc-700"
                      >
                        Manage
                      </button>
                      {sub.type === 'institution' && (
                        <button
                          onClick={() => setAbsorbing({ schoolId: sub.id, schoolName: owner?.name || sub.name })}
                          className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-zinc-700"
                        >
                          Absorb a teacher…
                        </button>
                      )}
                      {sub.status === 'suspended' ? (
                        <button
                          onClick={() => patch.mutate({ ownerId: sub.id, status: 'active' })}
                          disabled={patch.isPending}
                          className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-50"
                        >
                          Reactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => patch.mutate({ ownerId: sub.id, status: 'suspended' })}
                          disabled={patch.isPending}
                          className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 disabled:opacity-50"
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showProvision && (
        <ProvisionDialog
          plans={plans}
          onClose={() => setShowProvision(false)}
          onDone={(message) => {
            setShowProvision(false)
            setBanner(null)
            refresh()
            toast.success(message)
          }}
        />
      )}

      {editing && (
        <ManageDialog
          subscription={editing}
          plans={plans}
          busy={patch.isPending}
          onClose={() => setEditing(null)}
          onSave={(changes) => patch.mutate({ ownerId: editing.id, ...changes })}
        />
      )}

      {absorbing && (
        <AbsorbDialog
          schoolId={absorbing.schoolId}
          schoolName={absorbing.schoolName}
          onClose={() => setAbsorbing(null)}
          onDone={({ teacher, loginId, studentsMoved, classesArchived }) => {
            setAbsorbing(null)
            refresh()
            toast.success(
              `${teacher.firstName || teacher.email} now signs in as ${loginId}. ` +
                `${studentsMoved} student${studentsMoved === 1 ? '' : 's'} moved, ` +
                `${classesArchived} class${classesArchived === 1 ? '' : 'es'} archived.`,
            )
            setAbsorbNotice({
              schoolName: absorbing.schoolName,
              ...absorbMessage({
                schoolName: absorbing.schoolName,
                firstName: teacher.firstName,
                loginId,
                oldEmail: teacher.email,
                signInUrl: signInUrl(),
              }),
            })
          }}
        />
      )}

      {absorbNotice && (
        <MessageDialog
          title={`Absorption notice — ${absorbNotice.schoolName}`}
          subtitle="Not sent automatically. Copy this to the teacher yourself — it tells them their old sign-in stops working and what to use instead."
          message={absorbNotice}
          copiedHint="Copied. Paste it into an email to the teacher."
          onClose={() => setAbsorbNotice(null)}
        />
      )}
    </div>
  )
}

export function Dialog({ title, subtitle, children, onClose }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: title, closeOnBackdrop: false })
  return (
    <div {...overlayProps} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-6">
      <div {...panelProps} className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
            {subtitle && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-sm font-semibold text-zinc-500 hover:text-zinc-300">
            Close
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}

function ProvisionDialog({ plans, onClose, onDone }) {
  const [form, setForm] = useState({
    type: 'institution',
    plan: '',
    status: 'trial',
    name: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    schoolYear: '',
  })
  const [error, setError] = useState(null)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const available = Object.keys(plans[form.type] ?? {})
  // Reset the plan when the type changes: institution and teacher catalogues
  // share the name "standard" but not its seat counts.
  const onType = (e) => setForm((f) => ({ ...f, type: e.target.value, plan: '' }))

  const create = useMutation({
    mutationFn: () => createSubscriber(form),
    onSuccess: (res) =>
      onDone(
        `Created ${res.account.email}. They sign in with the password you set${
          form.type === 'institution' ? ' and can then add their teachers.' : '.'
        }`
      ),
    onError: (err) => setError(err.message),
  })

  const submit = (e) => {
    e.preventDefault()
    setError(null)
    if (!form.plan) return setError('Pick a plan.')
    create.mutate()
  }

  return (
    <Dialog
      title="New subscriber"
      subtitle="Creates the account holder's login as well as the subscription. For an institution that means a school record and its first admin."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <select value={form.type} onChange={onType} className={inputCls}>
              <option value="institution">Institution</option>
              <option value="teacher">Solo teacher</option>
            </select>
          </Field>
          <Field label="Plan">
            <select value={form.plan} onChange={set('plan')} className={inputCls}>
              <option value="">Select…</option>
              {available.map((p) => (
                <option key={p} value={p}>
                  {p} — {plans[form.type][p].teacher_seats} teacher /{' '}
                  {plans[form.type][p].student_seats} student seats
                </option>
              ))}
            </select>
          </Field>
        </div>

        {form.type === 'institution' && (
          <>
            <Field label="Institution name">
              <input value={form.name} onChange={set('name')} className={inputCls} placeholder="Alpha High School" />
            </Field>
            <Field label="Current school year" hint="Optional.">
              <input value={form.schoolYear} onChange={set('schoolYear')} className={inputCls} placeholder="2026-2027" />
            </Field>
          </>
        )}

        <div className="border-t border-zinc-800 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            {form.type === 'institution' ? 'First admin account' : 'Teacher account'}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Field label="First name">
              <input value={form.firstName} onChange={set('firstName')} className={inputCls} />
            </Field>
            <Field label="Last name">
              <input value={form.lastName} onChange={set('lastName')} className={inputCls} />
            </Field>
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Email">
              <input type="email" value={form.email} onChange={set('email')} className={inputCls} autoComplete="off" />
            </Field>
            <Field label="Temporary password" hint="At least 8 characters. Send it to them over a channel you trust.">
              <input value={form.password} onChange={set('password')} className={inputCls} autoComplete="new-password" />
            </Field>
          </div>
        </div>

        <Field label="Starting status">
          <select value={form.status} onChange={set('status')} className={inputCls}>
            {SUBSCRIBER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={create.isPending}
            className="flex-1 rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create subscriber'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-800 py-2.5 text-sm font-semibold text-zinc-400"
          >
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function ManageDialog({ subscription, plans, busy, onClose, onSave }) {
  const catalogue = plans[subscription.type] ?? {}
  const [plan, setPlan] = useState(subscription.plan ?? '')
  const [status, setStatus] = useState(subscription.status ?? 'active')
  const [limits, setLimits] = useState(() =>
    Object.fromEntries(
      SEAT_KEYS.map(({ key }) => [key, subscription.limits?.[key] ?? '']),
    ),
  )

  const planChanged = plan !== subscription.plan

  const save = (e) => {
    e.preventDefault()
    const changes = {}
    if (planChanged) changes.plan = plan
    if (status !== subscription.status) changes.status = status

    // Send limits only where the operator actually typed something different,
    // so a plan change is not silently overridden by the old seat numbers still
    // sitting in these inputs.
    const nextLimits = {}
    for (const { key } of SEAT_KEYS) {
      const raw = String(limits[key] ?? '').trim()
      const current = subscription.limits?.[key]
      if (raw === '') {
        if (current != null && !planChanged) nextLimits[key] = null // cleared -> unlimited
        continue
      }
      const value = Number(raw)
      if (!Number.isInteger(value) || value < 0) continue
      if (value !== current || planChanged) nextLimits[key] = value
    }
    if (Object.keys(nextLimits).length) changes.limits = nextLimits

    if (!Object.keys(changes).length) return onClose()
    onSave(changes)
  }

  return (
    <Dialog
      title={subscription.name || subscription.id}
      subtitle={`${subscription.type === 'institution' ? 'Institution' : 'Solo teacher'} · ${subscription.id}`}
      onClose={onClose}
    >
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Plan">
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputCls}>
              {Object.keys(catalogue).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              {SUBSCRIBER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {planChanged && (
          <div className="rounded-lg border border-sky-400/30 bg-sky-400/5 px-3 py-2 text-[11px] text-sky-300">
            Changing the plan resets seat limits to the {plan} defaults
            {catalogue[plan]
              ? ` (${catalogue[plan].teacher_seats} teacher / ${catalogue[plan].student_seats} student).`
              : '.'}{' '}
            Any override below is applied on top.
          </div>
        )}

        <div className="border-t border-zinc-800 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Negotiated seat limits
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Leave a field empty for unlimited. Use this to honour a deal without inventing a plan for
            one customer.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {SEAT_KEYS.map(({ key, label }) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  min="0"
                  value={limits[key]}
                  onChange={(e) => setLimits((l) => ({ ...l, [key]: e.target.value }))}
                  className={inputCls}
                  placeholder="∞"
                />
              </Field>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-800 py-2.5 text-sm font-semibold text-zinc-400"
          >
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  )
}
