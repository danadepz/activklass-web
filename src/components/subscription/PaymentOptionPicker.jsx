import { ink, muted, navy } from '@/theme'

const OPTIONS = [
  { value: 'full', label: 'Full payment', hint: 'Pay 100% now.' },
  { value: 'half', label: '50% down payment', hint: 'Pay half now, the rest within 30 days.' },
]

/** Full vs 50% down payment. Available on both plans. */
export default function PaymentOptionPicker({ value, onChange, disabled = false }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }} disabled={disabled}>
      <legend style={{ fontSize: 13.5, fontWeight: 700, color: ink, marginBottom: 8 }}>Payment option</legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        {OPTIONS.map((option) => {
          const selected = value === option.value
          return (
            <label
              key={option.value}
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', cursor: disabled ? 'default' : 'pointer',
                padding: '12px 14px', borderRadius: 12,
                border: `1.5px solid ${selected ? navy : 'rgba(14,42,92,0.14)'}`,
                background: selected ? 'rgba(14,42,92,0.04)' : '#FFFFFF',
              }}
            >
              <input
                type="radio"
                name="payment-option"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                style={{ marginTop: 3, accentColor: navy }}
              />
              <span>
                <span style={{ display: 'block', fontWeight: 700, color: ink, fontSize: 14 }}>{option.label}</span>
                <span style={{ display: 'block', color: muted, fontSize: 12.5 }}>{option.hint}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
