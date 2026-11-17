import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* What a school admin reads on the payment screens never names the payment
   vendor -- say what is happening instead ("Opening checkout…"). */
const files = [
  './PaymentConfirmModal.jsx',
  './SubscriptionStatusPanel.jsx',
  '../SubscriptionQuoteReview.jsx',
]

describe('payment screens do not name the payment vendor in visible text', () => {
  for (const file of files) {
    it(file, () => {
      const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
      expect(src).not.toMatch(/['"`][^'"`\n]*PayMongo[^'"`\n]*['"`]/)
    })
  }

  it('the confirm popup points to "our secure payment page"', () => {
    const src = readFileSync(fileURLToPath(new URL('./PaymentConfirmModal.jsx', import.meta.url)), 'utf8')
    expect(src).toContain('You will finish payment on our secure payment page.')
  })
})
