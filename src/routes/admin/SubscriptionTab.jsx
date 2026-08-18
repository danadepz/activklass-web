import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  INSTITUTION_ID, changePlan, fetchPlans, fetchStorageUsage, fetchSubscription, formatBytes,
} from '@/lib/subscription'
import { ink, muted, faint, green, red, gold, navy, line, serif, mono } from '@/theme'
import { card, field, th } from './ui'
import Notice from './Notice'

const GB = 1024 ** 3

function Meter({ label, used, total, unit, over }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : null
  const bar = over ? red : pct != null && pct >= 80 ? gold : green
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{label}</span>
        <span style={{ ...mono, fontSize: 12.5, color: over ? red : muted }}>
          {used}{unit ? ` ${unit}` : ''} / {total == null ? 'unlimited' : `${total}${unit ? ` ${unit}` : ''}`}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: 'rgba(14,42,92,0.08)', overflow: 'hidden' }}>
        {pct != null && (
          <div style={{ width: `${pct}%`, height: '100%', background: bar, transition: 'width .25s' }} />
        )}
      </div>
      {over && (
        <div style={{ fontSize: 12, color: red, marginTop: 5 }}>
          Over the plan limit. Nothing is blocked — upgrade when convenient.
        </div>
      )}
    </div>
  )
}

function PlanCard({ ownerId, sub, usage, plans, onChanged }) {
  const [error, setError] = useState('')
  const catalogue = plans?.[sub.type] ?? {}
  const names = Object.keys(catalogue)

  const mut = useMutation({
    mutationFn: (plan) => changePlan(ownerId, plan),
    onSuccess: () => { setError(''); onChanged() },
    onError: (e) => setError(e.message),
  })

  function pick(e) {
    const plan = e.target.value
    if (plan === sub.plan) return
    const now = catalogue[sub.plan]
    const next = catalogue[plan]
    const downgrade = next && now && next.student_seats < now.student_seats
    if (downgrade && !window.confirm(
      `Downgrade to ${plan}? Student seats drop from ${now.student_seats} to ${next.student_seats}. ` +
      'Existing accounts are not removed — you would simply be over the limit.',
    )) { e.target.value = sub.plan; return }
    mut.mutate(plan)
  }

  const storageBytes = (sub.limits?.storage_gb ?? 0) * GB

  return (
    <section style={{ ...card, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: muted }}>
            {sub.type === 'institution' ? 'Institution subscription' : 'Solo teacher subscription'}
          </div>
          <h2 style={{ ...serif, fontSize: 24, color: ink, margin: '4px 0 2px' }}>
            {sub.school_name ?? ownerId}
          </h2>
          <div style={{ fontSize: 13, color: muted }}>
            {sub.period_label} · {sub.period_start} → {sub.period_end}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            color: sub.status === 'active' ? green : red,
            background: sub.status === 'active' ? 'rgba(31,138,91,0.10)' : 'rgba(192,57,43,0.08)',
            borderRadius: 20, padding: '3px 10px',
          }}>
            {sub.status}
          </span>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: ink, display: 'block', marginBottom: 5 }}>
              Plan
            </label>
            <select value={sub.plan} onChange={pick} disabled={mut.isPending}
                    style={{ ...field, width: 'auto', padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n} — {catalogue[n].student_seats} students
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
                    marginTop: 22 }}>
        <Meter label="Teacher seats" used={usage.teachers.used} total={usage.teachers.seats}
               over={usage.teachers.over} />
        <Meter label="Student seats" used={usage.students.used} total={usage.students.seats}
               over={usage.students.over} />
        <StorageMeter limitBytes={storageBytes} />
      </div>

      {error && <div style={{ marginTop: 14 }}><Notice>{error}</Notice></div>}
    </section>
  )
}

function StorageMeter({ limitBytes }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-storage'],
    queryFn: fetchStorageUsage,
    retry: false,
  })

  if (isLoading) return <div style={{ fontSize: 12.5, color: faint }}>Measuring storage…</div>
  if (isError) return <div style={{ fontSize: 12.5, color: faint }}>Storage usage unavailable.</div>

  if (data?.available === false) {
    return (
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: ink, marginBottom: 6 }}>Storage</div>
        <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
          Not enabled for this project. The plan allows {formatBytes(limitBytes)}; usage can be measured
          once Firebase Storage is turned on.
        </div>
      </div>
    )
  }

  return (
    <div>
      <Meter label="Storage" used={formatBytes(data.total_bytes)} total={formatBytes(limitBytes)} />
      <div style={{ fontSize: 12, color: faint, marginTop: 5 }}>
        {data.file_count} file{data.file_count === 1 ? '' : 's'}
      </div>
    </div>
  )
}

/** Subscription Management: View Status, View Storage Usage, Upgrade/Downgrade. */
export default function SubscriptionTab() {
  const qc = useQueryClient()
  const { data: plansRes } = useQuery({ queryKey: ['subscription-plans'], queryFn: fetchPlans })
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['subscription', INSTITUTION_ID],
    queryFn: () => fetchSubscription(INSTITUTION_ID),
    retry: false,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['subscription'] })
    qc.invalidateQueries({ queryKey: ['admin-storage'] })
  }

  if (isLoading) return <p style={{ color: faint }}>Loading subscription…</p>
  if (isError) {
    return (
      <Notice>
        {error?.status === 404
          ? 'No subscription record yet. Run seed_subscriptions.py in the backend to create one.'
          : error?.message ?? 'Could not load the subscription.'}
      </Notice>
    )
  }

  const { subscription, usage } = data
  const plans = plansRes?.plans

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <PlanCard ownerId={INSTITUTION_ID} sub={subscription} usage={usage} plans={plans}
                onChanged={refresh} />

      {plans && (
        <section style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${line}` }}>
            <h2 style={{ ...serif, fontSize: 20, color: ink, margin: 0 }}>Available plans</h2>
            <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>
              Seat counts are limits, not reservations — usage is measured live from the user list.
              Nothing is blocked when a limit is passed.
            </p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ background: 'rgba(14,42,92,0.03)' }}>
                  {['Type', 'Plan', 'Teacher seats', 'Student seats', 'Storage'].map((h, i) => (
                    <th key={h} style={{ ...th, color: muted, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(plans).flatMap(([type, catalogue]) =>
                  Object.entries(catalogue).map(([name, l]) => {
                    const current = type === subscription.type && name === subscription.plan
                    return (
                      <tr key={`${type}-${name}`} style={{
                        borderTop: `1px solid ${line}`,
                        background: current ? 'rgba(245,197,24,0.10)' : undefined,
                      }}>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: muted }}>{type}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13.5, fontWeight: 700, color: ink }}>
                          {name}
                          {current && (
                            <span style={{ ...mono, fontSize: 11, color: navy, marginLeft: 8 }}>current</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13.5 }}>{l.teacher_seats}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13.5 }}>{l.student_seats}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13.5 }}>{l.storage_gb} GB</td>
                      </tr>
                    )
                  }),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
