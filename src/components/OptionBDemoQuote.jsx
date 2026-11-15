import { useQuery } from '@tanstack/react-query'
import { fetchOptionBDemoQuote } from '@/lib/subscription'

const peso = (value) => Number.isFinite(value) ? `₱${value.toLocaleString('en-PH')}` : 'Unavailable'

/**
 * Backend-calculated, public package preview for the capstone demonstration.
 * This component has no checkout callback by design and never derives prices.
 */
export default function OptionBDemoQuote({ subscriptionType, teacherSeats, studentCapacity, studentsPerTeacher }) {
  const input = { subscription_type: subscriptionType, teacher_seats: teacherSeats }
  if (studentCapacity != null) input.student_capacity = studentCapacity
  if (studentsPerTeacher != null) input.students_per_teacher = studentsPerTeacher
  const enabled = (subscriptionType === 'teacher' || subscriptionType === 'institution') &&
    Number.isInteger(Number(teacherSeats)) && Number(teacherSeats) > 0 &&
    (Number.isInteger(Number(studentCapacity)) && Number(studentCapacity) > 0 ||
      Number.isInteger(Number(studentsPerTeacher)) && Number(studentsPerTeacher) > 0)
  const query = useQuery({
    queryKey: ['option-b-demo-quote', subscriptionType, teacherSeats, studentCapacity, studentsPerTeacher],
    queryFn: () => fetchOptionBDemoQuote(input),
    enabled,
    retry: false,
  })
  const quote = query.data?.quote
  const referenceInput = subscriptionType === 'institution'
    ? { subscription_type: 'institution', teacher_seats: 10, student_capacity: 400 }
    : { subscription_type: 'teacher', teacher_seats: 1, student_capacity: 40 }
  const referenceMatchesCurrent = subscriptionType === 'institution'
    ? Number(teacherSeats) === 10 && Number(studentCapacity ?? (Number(teacherSeats) * Number(studentsPerTeacher))) === 400
    : Number(studentCapacity) === 40
  const referenceQuery = useQuery({
    queryKey: ['option-b-demo-reference', subscriptionType],
    queryFn: () => fetchOptionBDemoQuote(referenceInput),
    enabled: subscriptionType === 'teacher' || subscriptionType === 'institution',
    retry: false,
  })
  const reference = referenceQuery.data?.quote

  return (
    <section aria-label="Capstone demo pricing, Option B" style={{ background: '#FFF8E7', border: '1px solid #F2C96D', borderRadius: 10, padding: 14, marginTop: 12, textAlign: 'left', color: '#172033' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <strong style={{ color: '#714C00', fontSize: 14 }}>Capstone demo pricing · Option B</strong>
        <span style={{ borderRadius: 20, background: '#FDE8A8', color: '#714C00', padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>DEMO ONLY · NOT PAYABLE</span>
      </div>
      <p style={{ margin: '6px 0 10px', fontSize: 12, lineHeight: 1.45, color: '#5D4B24' }}>
        Demonstration package quote from the ActivKlass server. It does not start checkout, change an account, or replace the active payment policy.
      </p>
      {query.isLoading || query.isFetching ? <p role="status" style={{ margin: 0, fontSize: 13 }}>Loading demo package from server…</p> : null}
      {query.isError ? (
        <div role="alert" style={{ color: '#A12424', fontSize: 13 }}>
          Demo package quote unavailable. No local price is shown.
          <button type="button" onClick={() => query.refetch()} disabled={query.isFetching} style={{ display: 'block', marginTop: 6 }}>
            {query.isFetching ? 'Retrying…' : 'Retry demo quote'}
          </button>
        </div>
      ) : null}
      {!query.isLoading && !query.isError && query.data && quote &&
        (query.data.demo_only !== true || query.data.checkout_eligible !== false || query.data.policy_version !== quote.policy_version) ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: '#A12424' }}>The server returned an invalid or mismatched demo quote. No price is shown.</p>
      ) : null}
      {!enabled ? <p role="status" style={{ margin: 0, fontSize: 13 }}>Enter a valid capacity to load the demo quote.</p> : null}
      {quote && query.data?.demo_only === true && query.data?.checkout_eligible === false && query.data?.policy_version === quote.policy_version ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
            <span>{quote.teacher_seats} teacher seat{quote.teacher_seats === 1 ? '' : 's'} · {Number(quote.student_capacity).toLocaleString('en-PH')} unique student seats · {quote.student_blocks} block{quote.student_blocks === 1 ? '' : 's'}</span>
            <strong style={{ whiteSpace: 'nowrap', fontSize: 17, color: '#0E2A5C' }}>{peso(quote.total_contract_php)}</strong>
          </div>
          <div aria-label="Option B demo price breakdown" style={{ marginTop: 7, paddingTop: 6, borderTop: '1px solid #EBD49A', fontSize: 12, lineHeight: 1.5 }}>
            {quote.line_items?.map((item) => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span>{item.quantity.toLocaleString('en-PH')} × {peso(item.unit_price_php)} · {item.key === 'teacher_seats' ? 'teacher seats' : '40-student blocks'}</span>
                <strong>{peso(item.subtotal_php)}</strong>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '4px 16px', marginTop: 8, fontSize: 12.5, lineHeight: 1.5 }}>
            <span><strong>Term:</strong> {quote.term_days} days</span>
            <span><strong>AI credits proposed:</strong> {quote.ai_credits?.granted?.toLocaleString('en-PH') ?? 'Unavailable'}</span>
            <span><strong>Teacher pool:</strong> {quote.ai_credits?.teacher_reserved?.toLocaleString('en-PH') ?? 'Unavailable'} proposed credits</span>
            {quote.subscription_type === 'institution' ? <span><strong>Student-protected pool:</strong> {quote.ai_credits?.student_reserved?.toLocaleString('en-PH') ?? 'Unavailable'} proposed credits</span> : null}
            <span><strong>Teacher AI generations:</strong> {quote.daily_limits?.teacher_generations_per_seat ?? 'Unavailable'} per seat/day{quote.subscription_type === 'institution' ? ` · school safeguard ${quote.daily_limits?.teacher_school_cap ?? 'Unavailable'}/day` : ''}</span>
            <span><strong>Student AI explanations:</strong> {quote.daily_limits?.student_explanations_per_student ?? 'Unavailable'} per student/day</span>
            <span><strong>Storage allowance:</strong> {quote.storage?.gb ?? 'Unavailable'} GB proposed</span>
          </div>
          <div style={{ borderTop: '1px solid #EBD49A', marginTop: 9, paddingTop: 7, fontSize: 11.5, color: '#5D4B24' }}>
            Policy {query.data.policy_version}. AI credits and storage shown here are proposed package allowances; actual usage metering/enforcement is not represented by this quote.
          </div>
        </>
      ) : null}
      {!referenceMatchesCurrent && reference && referenceQuery.data?.demo_only === true &&
        referenceQuery.data?.checkout_eligible === false && referenceQuery.data?.policy_version === reference.policy_version ? (
        <div aria-label="Option B reference example" style={{ borderTop: '1px solid #EBD49A', marginTop: 9, paddingTop: 8, fontSize: 12.5, lineHeight: 1.5 }}>
          <strong>{subscriptionType === 'institution' ? 'Institution reference example · 10 teachers / 400 students' : 'Solo reference example · 1 teacher / 40 students'}:</strong>{' '}
          {peso(reference.total_contract_php)} for {reference.term_days} days · {reference.ai_credits?.granted?.toLocaleString('en-PH') ?? 'AI allowance unavailable'} proposed credits · {reference.storage?.gb ?? 'Storage unavailable'} GB proposed storage
          {subscriptionType === 'institution' ? ` · ${reference.ai_credits?.student_reserved?.toLocaleString('en-PH') ?? 'Unavailable'} student-protected credits` : ''}.
        </div>
      ) : null}
    </section>
  )
}
