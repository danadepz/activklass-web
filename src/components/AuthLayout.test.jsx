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
    expect(body).toMatch(/What We Collect/)
    expect(body).toMatch(/Why We Collect It/)
    expect(body).toMatch(/Consent, Including for a Minor/)
    expect(body).toMatch(/guardian/i)
  })

  /* T-183 (andecobs-291, Derickk 2026-10-15): the four "What We Collect"
     items read as indented paragraphs, no bullet markers. The markup was
     already a correct <ul>/<li> -- Derick's own guess that it needed
     restructuring was wrong. The actual cause: Tailwind's preflight resets
     `ul { list-style: none }`, and the inline paddingLeft:20 restored the
     indent but not the marker. House pattern (Markdown.jsx:94) sets
     listStyle: 'disc' explicitly; this <ul> didn't. One property. */
  it('the "What We Collect" list sets listStyle: disc, matching every other bulleted list in the app', () => {
    const ulAt = body.indexOf('<ul')
    const ulTag = body.slice(ulAt, body.indexOf('>', ulAt) + 1)
    expect(ulTag).toMatch(/listStyle:\s*'disc'/)
  })

  /* T-182 (andecobs-291, Derickk 2026-10-15): "all seven policy headings"
     read sentence case -- docs/UI-COPY.md Rule 1 covers page/section
     headings, and these seven h4s are exactly that. Three already had
     coverage above (the RA 10173 content test); the other four did not. */
  it('all seven section headings are Title Case, not the old sentence case', () => {
    expect(body).toMatch(/About This Policy/)
    expect(body).toMatch(/How It's Protected/)
    expect(body).toMatch(/Your Rights/)
    expect(body).toMatch(/Changes to This Policy/)
    expect(body).not.toMatch(/>About this policy</)
    expect(body).not.toMatch(/>How it's protected</)
    expect(body).not.toMatch(/>Your rights</)
    expect(body).not.toMatch(/>Changes to this policy</)
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

/**
 * T-184 (andecobs-289, 2026-10-24): the card variant's navy backdrop is
 * edge-to-edge, but its own overflow-hidden -- needed to clip the wandering
 * rings -- also clips anything bleeding past its own right edge, which is
 * exactly what would be needed to paint over the scrollbar-gutter strip
 * index.css reserves on <html>. Without that bleed, the gutter shows
 * html's own background (near-white) beside the navy backdrop -- a pale
 * line down the registration screen's far right edge.
 *
 * The fix is a position:fixed filler, navy, rendered as a SIBLING before
 * the overflow-hidden backdrop rather than a child inside it -- a fixed
 * element's containing block is the viewport regardless of an ancestor's
 * overflow, but only if it is not itself a descendant of that clipping
 * box. Placing it inside would reintroduce exactly the clipping this
 * fix exists to escape, with no visible error -- the only way to catch
 * that regression here is checking it renders BEFORE the clipped div in
 * the static markup, not merely that it renders somewhere.
 */
describe('T-184 — the scrollbar gutter beside the navy card backdrop is filled, not left pale', () => {
  it('renders a fixed, navy filler sized to the gutter', () => {
    const html = card()
    expect(html).toMatch(/<div aria-hidden="true" style="position:fixed;inset:0 0 0 auto;width:24px;background:#0E2A5C;pointer-events:none">/)
  })

  it('the filler is a SIBLING before the overflow-hidden backdrop, not a child inside it -- a child would be clipped right back to the original bug', () => {
    const html = card()
    const fillerAt = html.indexOf('position:fixed;inset:0 0 0 auto')
    const backdropAt = html.indexOf('overflow-hidden')
    expect(fillerAt).toBeGreaterThan(-1)
    expect(backdropAt).toBeGreaterThan(-1)
    expect(fillerAt).toBeLessThan(backdropAt)
  })

  it('the default variant (Login / forgot-password) needs no filler -- its right edge is cream, not navy, close enough to html\'s own slate-50 background that T-168 already covers it', () => {
    const html = sidebar()
    expect(html).not.toMatch(/position:fixed;inset:0 0 0 auto/)
  })
})

/**
 * T-187 (andecobs-290, Derickk 2026-10-15; owner decision (b), 2026-10-24):
 * "Reset your password" breaks after "Reset your", leaving a ragged second
 * line that reads as unbalanced against the form below it. Derick's own
 * suggested fix (centre the heading) was declined -- the form beneath it
 * (Email label, input, "Back to Sign In" link) is left-aligned, and
 * centring only the heading would put it out of step with everything else
 * on the same card, landing on every default-variant screen at once since
 * they share this one heading component.
 *
 * The owner's fix: stop the ragged wrap without moving anything.
 * `textWrap: 'balance'` evens the two lines instead of leaving one long
 * and one short -- exactly what the card variant's own heading
 * (register.jsx) already had. The default variant (login.jsx,
 * forgot-password.jsx) never got it. No textAlign change -- that is the
 * one outcome the owner explicitly ruled out (centring the heading while
 * the form stays left-aligned).
 */
describe('T-187 — the default heading balances a wrap instead of centring', () => {
  it('"Reset Your Password" renders with textWrap: balance, matching the card variant', () => {
    const html = sidebar('Reset Your Password')
    const at = html.indexOf('>Reset Your Password<')
    const openTagAt = html.lastIndexOf('<h1', at)
    const h1Tag = html.slice(openTagAt, at)
    expect(h1Tag).toMatch(/text-wrap:balance/)
  })

  it('does NOT centre the heading -- the declined option -- so it stays in step with the left-aligned form beneath it', () => {
    const html = sidebar('Reset Your Password')
    const at = html.indexOf('>Reset Your Password<')
    const openTagAt = html.lastIndexOf('<h1', at)
    const h1Tag = html.slice(openTagAt, at)
    expect(h1Tag).not.toMatch(/text-align/)
  })

  it('the card variant (Register) is untouched -- it already had the balanced wrap before this card', () => {
    const html = card('Create Your ActivKlass Account')
    const at = html.indexOf('>Create Your ActivKlass Account<')
    const openTagAt = html.lastIndexOf('<h1', at)
    const h1Tag = html.slice(openTagAt, at)
    expect(h1Tag).toMatch(/text-align:center/)
    expect(h1Tag).toMatch(/text-wrap:balance/)
  })
})
