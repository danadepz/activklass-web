import { ink, muted, navy, line, heading } from '@/theme'
import { formatCentavos, formatDate, OPTION_LABEL, PLAN_LABEL } from '@/lib/subscriptionPayment'

function Row({ label, value, strong, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '7px 0' }}>
      <dt style={{ margin: 0, color: strong ? ink : muted, fontWeight: strong ? 700 : 500, fontSize: strong ? 15 : 13.5 }}>
        {label}
        {sub ? <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: muted }}>{sub}</span> : null}
      </dt>
      <dd style={{ margin: 0, color: strong ? navy : ink, fontWeight: strong ? 800 : 600, fontSize: strong ? 17 : 14, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </dd>
    </div>
  )
}

const rule = { border: 0, borderTop: `1px solid ${line}`, margin: '6px 0' }
const sectionHeading = { ...heading, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted, margin: '0 0 4px' }

/**
 * The itemised subscription cost, and — when a payment schedule is given —
 * what is due now and what remains. Renders backend figures only.
 *
 * `dueDate` is `{ seconds, estimate }`; before the first payment is
 * confirmed the date can only be an estimate, and it says so.
 */
export default function SubscriptionCostBreakdown({ costing, schedule, dueDate, title = 'Cost breakdown' }) {
  if (!costing) return null
  const blocks = costing.student_blocks
  const students = Number(costing.student_capacity).toLocaleString('en-PH')
  const allow = costing.allowances
  return (
    <section aria-label={title}>
      <h3 style={sectionHeading}>{title}</h3>
      <dl style={{ margin: 0 }}>
        <Row label="Plan" value={PLAN_LABEL[costing.plan] ?? costing.plan} />
        {costing.teacher_seat_included ? (
          <Row label="Teacher seats" sub="1 teacher" value="Included" />
        ) : (
          <Row
            label="Teacher seats"
            sub={`${costing.teacher_seats} × ${formatCentavos(costing.teacher_unit_centavos)}`}
            value={formatCentavos(costing.teacher_subtotal_centavos)}
          />
        )}
        <Row
          label="Unique student capacity"
          sub={blocks != null
            ? `${students} students · ${blocks} block${blocks === 1 ? '' : 's'} of ${costing.block_size ?? 40} × ${formatCentavos(costing.block_unit_centavos)}`
            : `${students} students × ${formatCentavos(costing.block_unit_centavos)}`}
          value={formatCentavos(costing.student_subtotal_centavos)}
        />
      </dl>

      {allow ? (
        <>
          <h3 style={{ ...sectionHeading, margin: '14px 0 4px' }}>Included</h3>
          <dl style={{ margin: 0 }}>
            <Row label="AI credits" value={allow.ai_credits.toLocaleString('en-PH')} />
            <Row label="Teacher AI generations" value={`${allow.teacher_generations_per_seat_per_day} per teacher / day`} />
            <Row label="Student AI explanations" value={`${allow.student_explanations_per_student_per_day} per student / day`} />
            <Row label="Storage" value={`${allow.storage_gb.toLocaleString('en-PH')} GB`} />
          </dl>
        </>
      ) : null}

      <hr style={rule} />
      <dl style={{ margin: 0 }}>
        <Row label="Validity" value={`${costing.term_days} days`} />
        <Row label="Total subscription cost" value={formatCentavos(costing.total_centavos)} strong />
      </dl>

      {schedule ? (
        <>
          <h3 style={{ ...sectionHeading, margin: '14px 0 4px' }}>Payment</h3>
          <dl style={{ margin: 0 }}>
            <Row label="Payment option" value={OPTION_LABEL[schedule.option] ?? schedule.option} />
            <Row label="Amount due now" value={formatCentavos(schedule.due_now_centavos)} strong />
            {schedule.remaining_centavos > 0 ? (
              <Row
                label="Remaining balance"
                sub={dueDate?.seconds
                  ? `Due ${formatDate(dueDate.seconds)}${dueDate.estimate ? ' (estimated — 30 days after your first payment is confirmed)' : ''}`
                  : 'Due 30 days after your first payment is confirmed'}
                value={formatCentavos(schedule.remaining_centavos)}
              />
            ) : null}
          </dl>
        </>
      ) : null}
    </section>
  )
}
