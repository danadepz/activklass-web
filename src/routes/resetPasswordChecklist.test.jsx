import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...p }) => <a href={to} {...p}>{children}</a>,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
}))
vi.mock('firebase/auth', () => ({
  confirmPasswordReset: vi.fn(),
  verifyPasswordResetCode: vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({ auth: {} }))

import { PASSWORD_REQUIREMENTS as LOGIN_REQUIREMENTS, PasswordChecklist as LoginChecklist } from '@/routes/login'
import ResetPassword from './reset-password.jsx'

async function loadChecklistModule() {
  try {
    return await import('@/components/PasswordChecklist')
  } catch {
    return {}
  }
}

/* T-234 (maykel_64440-321, maykel_64440-322):
 * 321: the Set a New Password page should show the requirements as a live checklist,
 * say whether the two fields match, and disable the button until valid.
 * 322: the success page should confirm clearly, redirect after a delay,
 * keep the Sign In button prominent, and reword "Taking you back to sign in...".
 */

describe('T-234 — PasswordChecklist shared component', () => {
  it('defines the 5 standard password rules in order', async () => {
    const { PASSWORD_REQUIREMENTS } = await loadChecklistModule()
    expect(PASSWORD_REQUIREMENTS).toBeDefined()
    expect(PASSWORD_REQUIREMENTS).toHaveLength(5)
    expect(PASSWORD_REQUIREMENTS[0].label).toMatch(/at least 8 characters/i)
    expect(PASSWORD_REQUIREMENTS[1].label).toMatch(/uppercase/i)
    expect(PASSWORD_REQUIREMENTS[2].label).toMatch(/lowercase/i)
    expect(PASSWORD_REQUIREMENTS[3].label).toMatch(/number/i)
    expect(PASSWORD_REQUIREMENTS[4].label).toMatch(/special character/i)
  })

  it('is re-exported from routes/login for backwards compatibility', async () => {
    const { PasswordChecklist, PASSWORD_REQUIREMENTS } = await loadChecklistModule()
    expect(LoginChecklist).toBe(PasswordChecklist)
    expect(LOGIN_REQUIREMENTS).toBe(PASSWORD_REQUIREMENTS)
  })

  it('renders all 5 requirement labels and reflects met status', async () => {
    const { default: PasswordChecklist, PASSWORD_REQUIREMENTS } = await loadChecklistModule()
    expect(PasswordChecklist).toBeDefined()
    expect(PASSWORD_REQUIREMENTS).toBeDefined()

    const emptyHtml = renderToStaticMarkup(<PasswordChecklist value="" />)
    for (const req of PASSWORD_REQUIREMENTS) {
      expect(emptyHtml).toContain(req.label)
    }
    // No green color when empty
    expect(emptyHtml).not.toContain('#1F8A5B')

    // Partial match shows some green
    const partialHtml = renderToStaticMarkup(<PasswordChecklist value="abcdefgh" />)
    expect(partialHtml).toContain('#1F8A5B')

    // Full match
    const fullHtml = renderToStaticMarkup(<PasswordChecklist value="Abcdefg1!" />)
    const matches = fullHtml.match(/#1F8A5B/g) ?? []
    expect(matches.length).toBe(10) // 2 occurrences per met item (color + bg)
  })
})

describe('T-234 — Set a New Password page improvements (maykel_64440-321)', () => {
  const source = readFileSync(fileURLToPath(new URL('./reset-password.jsx', import.meta.url)), 'utf8')

  it('imports PasswordChecklist from components/ and does not use static PASSWORD_RULE', () => {
    expect(source).toMatch(/import PasswordChecklist from '@\/components\/PasswordChecklist'/)
    expect(source).toContain('<PasswordChecklist value={password} />')
    expect(source).not.toContain('{PASSWORD_RULE}')
    expect(source).not.toMatch(/import\s*\{[^}]*PASSWORD_RULE[^}]*\}\s*from/)
  })

  it('uses Title Case for headings, labels, and buttons per UI-COPY.md', () => {
    expect(source).toContain('Set a New Password')
    expect(source).not.toContain('Set a new password')

    expect(source).toContain('>New Password</label>')
    expect(source).not.toContain('>New password</label>')

    expect(source).toContain('>Confirm New Password</label>')
    expect(source).not.toContain('>Confirm new password</label>')

    expect(source).toContain("'Update Password'")
    expect(source).not.toContain("'Update password'")
  })

  it('includes a live password match indicator under Confirm New Password', () => {
    expect(source).toContain('data-testid="password-match-indicator"')
    expect(source).toContain('Passwords match')
    expect(source).toContain('Passwords do not match')
  })

  it('disables the Update Password button until requirements are met and passwords match', () => {
    expect(source).toMatch(/const hasMinRequirements = !passwordError\(password\)/)
    expect(source).toMatch(/const passwordsMatch = Boolean\(password && confirm && password === confirm\)/)
    expect(source).toMatch(/const canSubmit = hasMinRequirements && passwordsMatch/)
    expect(source).toMatch(/disabled=\{submitting \|\| !canSubmit\}/)
  })
})

describe('T-234 — Password reset success page improvements (maykel_64440-322)', () => {
  const source = readFileSync(fileURLToPath(new URL('./reset-password.jsx', import.meta.url)), 'utf8')

  it('displays Title Case heading "Password Updated"', () => {
    expect(source).toContain('Password Updated')
    expect(source).not.toContain('Password updated')
  })

  it('replaces "Taking you back to sign in…" with clearer redirect feedback', () => {
    expect(source).toContain('You will be redirected to the sign-in page shortly.')
    expect(source).not.toContain('Taking you back to sign in…')
  })

  it('renders a prominent "Sign In Now" button link', () => {
    expect(source).toContain('Sign In Now')
    expect(source).not.toContain('Sign in now')
    expect(source).toMatch(/className="[^"]*ak-btn-primary[^"]*"/)
  })
})

describe('T-234 — ResetPassword component smoke test', () => {
  it('renders invalid state when no oobCode is present', () => {
    const html = renderToStaticMarkup(<ResetPassword />)
    expect(html).toContain('This Link No Longer Works')
    expect(html).toContain('Request a new link')
  })
})
