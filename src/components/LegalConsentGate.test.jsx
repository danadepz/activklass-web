import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LegalConsentChecks, { PRIVACY_NOTICE, TERMS } from './LegalConsentGate.jsx'

const render = (agreed) => renderToStaticMarkup(<LegalConsentChecks agreed={agreed} onChange={vi.fn()} />)

describe('Legal consent checkboxes (registration form)', () => {
  it('lists the Privacy Notice first, then the Terms and Conditions, both unticked', () => {
    const html = render({ privacy: false, terms: false })
    expect(html.indexOf('Privacy Notice')).toBeLessThan(html.indexOf('Terms and Conditions'))
    expect(html.match(/type="checkbox"/g)).toHaveLength(2)
    expect(html).not.toMatch(/checked/)
  })

  it('reflects what the parent says is agreed', () => {
    expect(render({ privacy: true, terms: false }).match(/checked/g)).toHaveLength(1)
    expect(render({ privacy: true, terms: true }).match(/checked/g)).toHaveLength(2)
  })

  it('opens no popup until a link is clicked', () => {
    expect(render({ privacy: false, terms: false })).not.toContain('role="dialog"')
  })

  it('carries the full text of both documents, in order', () => {
    expect(PRIVACY_NOTICE.sections.map((s) => s.h).slice(0, 2)).toEqual(['Who We Are', 'What We Collect'])
    expect(PRIVACY_NOTICE.sections).toHaveLength(9)
    expect(TERMS.sections).toHaveLength(15)
  })
})
