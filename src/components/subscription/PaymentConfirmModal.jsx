import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import SubscriptionCostBreakdown from '@/components/subscription/SubscriptionCostBreakdown'
import { ACK_COSTS, canConfirm } from '@/lib/subscriptionPayment'
import { ink, muted, navy, red, line, heading } from '@/theme'

const checkRow = { display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', color: ink, fontSize: 13.5, lineHeight: 1.5 }
const checkBox = { marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: navy, cursor: 'pointer' }
const link = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
  fontWeight: 700, color: navy, textDecoration: 'underline', textUnderlineOffset: 2,
}

/** One section's blocks; consecutive list items become one list. */
function TermsBlocks({ blocks }) {
  const out = []
  blocks.forEach(([kind, text], i) => {
    if (kind === 'li') {
      const last = out[out.length - 1]
      if (last?.kind === 'ul') last.items.push(text)
      else out.push({ kind: 'ul', items: [text], key: i })
    } else out.push({ kind, text, key: i })
  })
  return out.map((b) => {
    if (b.kind === 'ul') {
      return (
        <ul key={b.key} style={{ margin: '0 0 8px', paddingLeft: 20, listStyle: 'disc', display: 'grid', gap: 4 }}>
          {b.items.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )
    }
    if (b.kind === 'h') return <p key={b.key} style={{ margin: '10px 0 4px', fontWeight: 700, color: ink }}>{b.text}</p>
    if (b.kind === 'quote') {
      return (
        <blockquote key={b.key} style={{ margin: '0 0 8px', padding: '8px 12px', borderLeft: `3px solid ${navy}`, background: 'rgba(14,42,92,0.04)', borderRadius: 6, fontStyle: 'italic' }}>
          “{b.text}”
        </blockquote>
      )
    }
    if (b.kind === 'email') {
      return <p key={b.key} style={{ margin: 0 }}><a href={`mailto:${b.text}`} style={{ ...link, display: 'inline' }}>{b.text}</a></p>
    }
    return <p key={b.key} style={{ margin: '0 0 8px' }}>{b.text}</p>
  })
}

/** The applicable Terms: the versioned text from the server, or an approved agreement's link. */
function TermsBody({ terms }) {
  if (terms?.sections) {
    return (
      <div style={{ color: ink, fontSize: 14, lineHeight: 1.65 }}>
        {terms.sections.map((section, i) => (
          <section key={section.heading} style={{ paddingTop: i ? 14 : 0, marginTop: i ? 14 : 0, borderTop: i ? `1px solid ${line}` : 'none' }}>
            <h4 style={{ ...heading, margin: '0 0 6px', fontSize: 15, color: ink }}>{i + 1}. {section.heading}</h4>
            <TermsBlocks blocks={section.blocks} />
          </section>
        ))}
      </div>
    )
  }
  if (terms?.url) {
    return (
      <p style={{ margin: 0 }}>
        The full agreement opens on its own page.{' '}
        <a href={terms.url} target="_blank" rel="noopener noreferrer" style={{ ...link, display: 'inline' }}>
          Open the Terms and Conditions
        </a>
      </p>
    )
  }
  return <p style={{ margin: 0, color: muted }}>The Terms and Conditions are not available right now.</p>
}

/**
 * The last step before PayMongo. Both acknowledgments are required; the
 * backend checks them again, so this gate is a courtesy, not the control.
 *
 * The Terms open in their own dialog that takes the place of this one while
 * it is up — the shared Modal's key handling is window-wide, so two stacked
 * dialogs would both answer Escape. The ticks live here, so reading the
 * Terms neither sets nor clears them.
 */
export default function PaymentConfirmModal({ open, costing, schedule, dueDate, terms, busy = false, error, onBack, onConfirm }) {
  const [costsReviewed, setCostsReviewed] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const ready = canConfirm(costsReviewed, termsAccepted, busy)

  return (
    <>
      <Modal
        open={open && !showTerms}
        onClose={busy ? undefined : onBack}
        title="Confirm your subscription"
        subtitle="Check the details below. You will finish payment on our secure payment page."
        size="md"
        closeOnBackdrop={!busy}
        // The agreements live in the pinned footer, beside Pay Now, so they stay
        // in view however far the cost details have to scroll.
        footer={(
          <div style={{ width: '100%', display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={checkRow}>
                <input type="checkbox" checked={costsReviewed} onChange={(e) => setCostsReviewed(e.target.checked)} style={checkBox} />
                <span>{ACK_COSTS}</span>
              </label>
              <label style={checkRow}>
                <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} style={checkBox} />
                <span>
                  I have read and agree to the{' '}
                  <button
                    type="button"
                    style={link}
                    // A control inside a label must not tick the box it sits beside.
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowTerms(true) }}
                  >
                    Terms and Conditions
                  </button>
                  .
                </span>
              </label>

              {!ready && !busy ? (
                <p style={{ margin: 0, fontSize: 12.5, color: muted }}>Tick both boxes to continue.</p>
              ) : null}
              {error ? <p role="alert" style={{ margin: 0, fontSize: 13, color: red, fontWeight: 600 }}>{error}</p> : null}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="quiet" onClick={onBack} disabled={busy}>Go Back</Button>
              <Button onClick={() => ready && onConfirm()} disabled={!ready}>
                {busy ? 'Opening checkout…' : 'Pay Now'}
              </Button>
            </div>
          </div>
        )}
      >
        <SubscriptionCostBreakdown costing={costing} schedule={schedule} dueDate={dueDate} title="Subscription" compact />
      </Modal>

      <Modal
        open={open && showTerms}
        onClose={() => setShowTerms(false)}
        title="Terms and Conditions"
        subtitle={terms?.version_label}
        size="lg"
        footer={<Button onClick={() => setShowTerms(false)}>Back to payment</Button>}
      >
        <TermsBody terms={terms} />
      </Modal>
    </>
  )
}
