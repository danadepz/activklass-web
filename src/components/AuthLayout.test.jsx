/**
 * T-141 (triplecookiemonster-188, -189, Kristine 2026-10-05). Two tickets,
 * together removing every privacy statement from the signed-out screens
 * unless sequenced: 188 reworded two of the three brand-panel bullets and
 * said nothing about the third; 189 asked to replace the "🔒 RA 10173 /
 * Privacy-first by design" chip with a Privacy Policy link and remove the
 * Data Privacy Act footer outright. Her own note on 189 said the policy page
 * "is to be researched and made" -- it does not exist. The owner's call
 * (2026-10-08): drop the third bullet, and resolve the blocked link with an
 * in-app popup instead of a route, so the policy exists the moment this
 * ships rather than once a page gets built around it.
 *
 * AuthLayout.jsx renders everything here TWICE, once per panel variant
 * ("card" for Register, the default shell for Login/forgot-password) --
 * the exact trap T-108 hit on this file before. Every assertion below is
 * checked against both.
 *
 * Static markup, the house pattern (register.test.jsx is the model).
 * useDialogBehavior's document/window access all lives inside useEffect,
 * which React's server renderer never runs, so mounting Modal closed
 * (policyOpen defaults to false) is safe here with no DOM. Its OPEN content
 * is not reachable by a static render, though -- nothing in this file fires
 * the click that flips policyOpen -- so the modal's own text is read off
 * the source the same way register.test.jsx reads content behind a Next
 * click it cannot simulate.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...p }) => <a {...p}>{children}</a>,
}))

import AuthLayout from './AuthLayout.jsx'

const source = readFileSync(fileURLToPath(new URL('./AuthLayout.jsx', import.meta.url)), 'utf8')

const card = (title = 'Create your ActivKlass account') =>
  renderToStaticMarkup(<AuthLayout variant="card" title={title}><div /></AuthLayout>)
const sidebar = (title = 'Welcome!') =>
  renderToStaticMarkup(<AuthLayout title={title}><div /></AuthLayout>)

describe('T-141 — the brand-panel bullets: two reworded, the third dropped', () => {
  it('card variant (Register) reads Kristine’s exact wording', () => {
    const html = card()
    expect(html).toContain('Configurable DepEd &amp; CHED gradebooks')
    expect(html).toContain('AI-powered insights for student support')
  })

  it('default variant (Login / forgot-password) reads the same two bullets', () => {
    const html = sidebar()
    expect(html).toContain('Configurable DepEd &amp; CHED gradebooks')
    expect(html).toContain('AI-powered insights for student support')
  })

  it('the old wording is gone from both, and the privacy bullet is not silently kept', () => {
    for (const html of [card(), sidebar()]) {
      expect(html).not.toContain('Computed, lockable DepEd')
      expect(html).not.toContain('AI risk prediction and remediation you control')
      expect(html).not.toContain('RA 10173 parental-consent privacy')
    }
  })

  it('the decision not to keep a third bullet is recorded, not just acted on', () => {
    const at = source.indexOf('const PERKS = [')
    const end = source.indexOf(']', at)
    const declaration = source.slice(Math.max(0, source.lastIndexOf('// T-141', at)), end)
    expect(declaration).toMatch(/dropped outright/)
    expect(declaration).toMatch(/owner/)
  })
})

describe('T-141 — the chip and footer are gone together, replaced by one popup trigger', () => {
  it('neither variant renders the old RA 10173 chip or "Privacy-first by design"', () => {
    for (const html of [card(), sidebar()]) {
      expect(html).not.toContain('🔒 RA 10173')
      expect(html).not.toContain('Privacy-first by design')
    }
  })

  it('neither variant renders the old Data Privacy Act footer', () => {
    for (const html of [card(), sidebar()]) {
      expect(html).not.toContain('Protected under the Philippine Data Privacy Act of 2012')
      expect(html).not.toContain('Your data is never shared without consent.')
    }
  })

  it('both variants render a "Privacy Policy" trigger -- a button, not a link to a page that does not exist', () => {
    for (const html of [card(), sidebar()]) {
      expect(html).toMatch(/<button[^>]*type="button"[^>]*>\s*Privacy Policy\s*<\/button>/)
    }
    // Never an <a href> for this -- there is no route to point it at, and a
    // link to a 404 is worse than the chip it replaces (the card's own words).
    expect(source).not.toMatch(/href=["'][^"']*privacy[^"']*["']/i)
  })

  it('the chip removal and the footer removal both happened in the SAME change as the other panel variant -- the T-108 trap this card names explicitly', () => {
    // PrivacyPolicyLink is called from both branches (card's <section>, the
    // default variant's <aside>) -- fixing one and not the other is exactly
    // what T-108 found on this file before.
    expect(source.match(/<PrivacyPolicyLink\b/g)).toHaveLength(2)
  })
})

describe('T-141 — the popup opens from either trigger, closes, and is the ONE modal both variants share', () => {
  it('one policyOpen state, read by one PrivacyPolicyModal, set by both triggers', () => {
    expect(source).toMatch(/const \[policyOpen, setPolicyOpen\] = useState\(false\)/)
    expect(source.match(/setPolicyOpen\(true\)/g)).toHaveLength(2)
    expect(source.match(/<PrivacyPolicyModal\b/g)).toHaveLength(1)
    expect(source).toMatch(/<PrivacyPolicyModal open=\{policyOpen\} onClose=\{\(\) => setPolicyOpen\(false\)\} \/>/)
  })

  it('the modal is rendered once but reachable from each branch’s own return (policyModal, not a duplicate JSX block)', () => {
    expect(source.match(/\{policyModal\}/g)).toHaveLength(2)
  })
})

describe('T-141 — the policy popup’s own content, read off the source (closed by default, no click fired here)', () => {
  const at = source.indexOf('function PrivacyPolicyModal(')
  const end = source.indexOf('\n// --- internal bits', at)
  const body = source.slice(at, end)

  it('is built on the shared Modal shell, not a hand-rolled overlay', () => {
    expect(body).toMatch(/<Modal\b/)
    expect(source).toMatch(/import Modal from '@\/components\/ui\/Modal'/)
  })

  it('covers what RA 10173 asks a policy to say: what is collected, why, and the consent basis', () => {
    expect(body).toMatch(/What we collect/)
    expect(body).toMatch(/Why we collect it/)
    expect(body).toMatch(/Consent, including for a minor/)
    expect(body).toMatch(/guardian/i)
  })

  it('states a right to access, correct and object/withdraw consent -- the rights RA 10173 actually grants', () => {
    // \s+ rather than a literal space -- this prose wraps across lines in
    // the source, and a reflow should not be what turns this test red.
    expect(body).toMatch(/right to be informed/)
    expect(body).toMatch(/access\s+your own data/)
    expect(body).toMatch(/object to or withdraw/)
  })

  it('does NOT promise a self-service deletion path that does not exist (docs/OPEN-QUESTIONS.md §8)', () => {
    expect(body).toMatch(/does not\s+exist yet/)
    expect(body).not.toMatch(/delete your account (at )?any ?time/i)
    expect(body).not.toMatch(/click (here|delete) to (permanently )?delete/i)
  })

  it('never names a specific vendor by brand, consistent with how this app writes every other user-facing message', () => {
    expect(body).not.toMatch(/firebase|firestore|google cloud|flask/i)
  })
})
