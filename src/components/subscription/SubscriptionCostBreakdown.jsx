import { ink, muted, navy, line, heading } from '@/theme'
import { formatCentavos, formatDate, OPTION_LABEL, PLAN_LABEL } from '@/lib/subscriptionPayment'

// Strong rows highlight payment amounts, or the total when no schedule exists.
// compact = the confirm popup,
// where the checkboxes below must stay close to the figures.
function Row({ label, value, strong, sub, compact }) {
  const pad = strong ? '10px 12px' : (compact ? '7px 0' : '9px 0')
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px 16px', padding: pad, ...(strong ? { margin: compact ? '4px 0' : '6px 0', borderBottomWidth: 0, background: 'rgba(14,42,92,0.05)', borderRadius: compact ? 10 : 12 } : null) }}>
      <dt style={{ margin: 0, minWidth: 0, flex: '1 1 140px', color: strong ? ink : muted, fontWeight: strong ? 700 : 500, fontSize: strong ? 14 : 13 }}>
        {label}
        {sub ? <span style={{ display: 'block', marginTop: 2, fontSize: 12, fontWeight: 400, color: muted, lineHeight: 1.45 }}>{sub}</span> : null}
      </dt>
      <dd style={{ margin: '0 0 0 auto', maxWidth: '100%', color: strong ? navy : ink, fontWeight: strong ? 800 : 600, fontSize: strong ? (compact ? 17 : 19) : 14, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </dd>
    </div>
  )
}

const sectionHeading = { ...heading, fontSize: 13, color: ink, margin: '0 0 6px' }
// Hairline between ordinary rows; a strong row's own band replaces it.
const list = { margin: 0 }
const listClass = 'divide-y divide-[rgba(14,42,92,0.08)]'

/**
 * The itemised subscription cost, and — when a payment schedule is given —
 * what is due now and what remains. Renders backend figures only.
 *
 * `dueDate` is `{ seconds, estimate }`; before the first payment is
 * confirmed the date can only be an estimate, and it says so.
 */
export default function SubscriptionCostBreakdown({ costing, schedule, dueDate, title = 'Cost Breakdown', compact = false }) {
  if (!costing) return null
  const blocks = costing.student_blocks
  const students = Number(costing.student_capacity).toLocaleString('en-PH')
  const allow = costing.allowances
  return (
    <section aria-label={title}>
      {schedule ? (
        <section aria-label="Payment Summary" style={{
          padding: compact ? '12px 14px' : '14px 16px', marginBottom: 20,
          border: `1px solid ${line}`, borderRadius: 12, background: 'rgba(14,42,92,0.02)',
        }}>
          <h4 style={sectionHeading}>Payment Summary</h4>
          <dl className={listClass} style={list}>
            <Row compact={compact} label="Total Subscription Cost" value={formatCentavos(costing.total_centavos)} />
            <Row compact={compact} label="Payment Option" value={OPTION_LABEL[schedule.option] ?? schedule.option} />
            <Row compact={compact} label="Amount Due Now" value={formatCentavos(schedule.due_now_centavos)} strong />
            {schedule.remaining_centavos > 0 ? (
              <Row compact={compact}
                label="Remaining Balance"
                strong
                sub={
                  <>
                    <strong style={{ color: ink, fontWeight: 700 }}>
                      {dueDate?.seconds
                        ? `Due ${formatDate(dueDate.seconds)}${dueDate.estimate ? ' (estimated)' : ''}`
                        : 'Due 30 days after your first payment is confirmed'}
                    </strong>
                    {dueDate?.seconds && dueDate.estimate ? (
                      <span style={{ display: 'block', marginTop: 4 }}>
                        The final due date is 30 days after your first payment is confirmed.
                      </span>
                    ) : null}
                  </>
                }
                value={formatCentavos(schedule.remaining_centavos)}
              />
            ) : null}
          </dl>
        </section>
      ) : null}

      <h4 style={sectionHeading}>{title}</h4>
      <dl className={listClass} style={list}>
        <Row compact={compact} label="Plan" value={PLAN_LABEL[costing.plan] ?? costing.plan} />
        {costing.teacher_seat_included ? (
          <Row compact={compact} label="Teacher Seats" sub="1 teacher" value="Included" />
        ) : (
          <Row compact={compact}
            label="Teacher Seats"
            sub={`${costing.teacher_seats} × ${formatCentavos(costing.teacher_unit_centavos)}`}
            value={formatCentavos(costing.teacher_subtotal_centavos)}
          />
        )}
        <Row compact={compact}
          label="Student Capacity"
          sub={blocks != null
            ? `${students} unique students · ${blocks} block${blocks === 1 ? '' : 's'} of ${costing.block_size ?? 40} × ${formatCentavos(costing.block_unit_centavos)}`
            : `${students} unique students × ${formatCentavos(costing.block_unit_centavos)}`}
          value={formatCentavos(costing.student_subtotal_centavos)}
        />
        <Row compact={compact} label="Subscription Period" value={`${costing.term_days} days`} />
        {!schedule && <Row compact={compact} label="Total Subscription Cost" value={formatCentavos(costing.total_centavos)} strong />}
      </dl>

      {allow ? (
        <>
          <h4 style={{ ...sectionHeading, marginTop: 20 }}>Included Features</h4>
          <dl className={listClass} style={list}>
            <Row compact={compact} label="AI Credits" value={allow.ai_credits.toLocaleString('en-PH')} />
            <Row compact={compact} label="Teacher AI Generations" sub="Per teacher" value={`${allow.teacher_generations_per_seat_per_day}/day`} />
            <Row compact={compact} label="Student AI Explanations" sub="Per student" value={`${allow.student_explanations_per_student_per_day}/day`} />
            <Row compact={compact} label="Storage" value={`${allow.storage_gb.toLocaleString('en-PH')} GB`} />
          </dl>
        </>
      ) : null}
    </section>
  )
}
