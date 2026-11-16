import { ink, muted, navy, line, heading } from '@/theme'
import { formatCentavos, formatDate, OPTION_LABEL, PLAN_LABEL } from '@/lib/subscriptionPayment'

// strong rows (total, amount due now) sit on a tinted band so the two
// numbers that matter are found at a glance. compact = the confirm popup,
// where the checkboxes below must stay close to the figures.
function Row({ label, value, strong, sub, compact }) {
  const pad = strong ? (compact ? '10px 14px' : '14px 16px') : (compact ? '7px 0' : '12px 0')
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: pad, ...(strong ? { margin: compact ? '4px 0' : '6px 0', borderBottomWidth: 0, background: 'rgba(14,42,92,0.05)', borderRadius: compact ? 10 : 12 } : null) }}>
      <dt style={{ margin: 0, color: strong ? ink : muted, fontWeight: strong ? 700 : 500, fontSize: strong ? 15 : 13.5 }}>
        {label}
        {sub ? <span style={{ display: 'block', marginTop: 2, fontSize: 12, fontWeight: 400, color: muted, lineHeight: 1.45 }}>{sub}</span> : null}
      </dt>
      <dd style={{ margin: 0, color: strong ? navy : ink, fontWeight: strong ? 800 : 600, fontSize: strong ? (compact ? 17 : 19) : 14, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </dd>
    </div>
  )
}

const rule = { border: 0, borderTop: `1px solid ${line}`, margin: '20px 0 8px' }
const compactRule = { ...rule, margin: '10px 0 4px' }
const sectionHeading = { ...heading, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted, margin: '0 0 6px' }
const laterHeading = { ...sectionHeading, margin: '28px 0 6px' }
const compactHeading = { ...sectionHeading, margin: '16px 0 2px' }
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
export default function SubscriptionCostBreakdown({ costing, schedule, dueDate, title = 'Cost breakdown', compact = false }) {
  if (!costing) return null
  const later = compact ? compactHeading : laterHeading
  const blocks = costing.student_blocks
  const students = Number(costing.student_capacity).toLocaleString('en-PH')
  const allow = costing.allowances
  return (
    <section aria-label={title}>
      <h3 style={sectionHeading}>{title}</h3>
      <dl className={listClass} style={list}>
        <Row compact={compact} label="Plan" value={PLAN_LABEL[costing.plan] ?? costing.plan} />
        {costing.teacher_seat_included ? (
          <Row compact={compact} label="Teacher seats" sub="1 teacher" value="Included" />
        ) : (
          <Row compact={compact}
            label="Teacher seats"
            sub={`${costing.teacher_seats} × ${formatCentavos(costing.teacher_unit_centavos)}`}
            value={formatCentavos(costing.teacher_subtotal_centavos)}
          />
        )}
        <Row compact={compact}
          label="Unique student capacity"
          sub={blocks != null
            ? `${students} students · ${blocks} block${blocks === 1 ? '' : 's'} of ${costing.block_size ?? 40} × ${formatCentavos(costing.block_unit_centavos)}`
            : `${students} students × ${formatCentavos(costing.block_unit_centavos)}`}
          value={formatCentavos(costing.student_subtotal_centavos)}
        />
      </dl>

      {allow ? (
        <>
          <h3 style={later}>Included</h3>
          <dl className={listClass} style={list}>
            <Row compact={compact} label="AI credits" value={allow.ai_credits.toLocaleString('en-PH')} />
            <Row compact={compact} label="Teacher AI generations" value={`${allow.teacher_generations_per_seat_per_day} per teacher / day`} />
            <Row compact={compact} label="Student AI explanations" value={`${allow.student_explanations_per_student_per_day} per student / day`} />
            <Row compact={compact} label="Storage" value={`${allow.storage_gb.toLocaleString('en-PH')} GB`} />
          </dl>
        </>
      ) : null}

      <hr style={compact ? compactRule : rule} />
      <dl className={listClass} style={list}>
        <Row compact={compact} label="Validity" value={`${costing.term_days} days`} />
        <Row compact={compact} label="Total subscription cost" value={formatCentavos(costing.total_centavos)} strong />
      </dl>

      {schedule ? (
        <>
          <h3 style={later}>Payment</h3>
          <dl className={listClass} style={list}>
            <Row compact={compact} label="Payment option" value={OPTION_LABEL[schedule.option] ?? schedule.option} />
            <Row compact={compact} label="Amount due now" value={formatCentavos(schedule.due_now_centavos)} strong />
            {schedule.remaining_centavos > 0 ? (
              <Row compact={compact}
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
