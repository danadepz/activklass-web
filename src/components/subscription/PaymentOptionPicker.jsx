import { useId } from 'react'
import { ink, muted, navy } from '@/theme'
import { formatCentavos } from '@/lib/subscriptionPayment'

const OPTIONS = [
  { value: 'full', label: 'Full Payment', hint: 'Pay the full amount now.' },
  { value: 'half', label: '50% Down Payment', hint: 'Pay 50% now. Pay the balance within 30 days of your confirmed first payment.' },
]

/** Full vs 50% down payment. Available on both plans. */
export default function PaymentOptionPicker({ value, onChange, disabled = false, paymentOptions }) {
  const name = useId()
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }} disabled={disabled}>
      <legend style={{ fontSize: 13.5, fontWeight: 700, color: ink, marginBottom: 8 }}>Payment Option</legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10 }}>
        {OPTIONS.map((option) => {
          const selected = value === option.value
          return (
            <label
              key={option.value}
              className="transition hover:brightness-[0.98] focus-within:ring-2 focus-within:ring-[#0E2A5C]/25"
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', cursor: disabled ? 'default' : 'pointer',
                padding: '14px', borderRadius: 10,
                border: `1.5px solid ${selected ? navy : 'rgba(14,42,92,0.14)'}`,
                background: selected ? 'rgba(14,42,92,0.04)' : '#FFFFFF',
              }}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                style={{ marginTop: 3, accentColor: navy }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, color: ink, fontSize: 13 }}>{option.label}</span>
                {paymentOptions?.[option.value] && (
                  <span style={{ display: 'block', fontWeight: 800, color: navy, fontSize: 21, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCentavos(paymentOptions[option.value].due_now_centavos)}
                    <span style={{ fontSize: 12, fontWeight: 500, color: muted }}> now</span>
                  </span>
                )}
                <span style={{ display: 'block', color: muted, fontSize: 12, lineHeight: 1.6, marginTop: 5 }}>{option.hint}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
