/** Sign-out now belongs to the header account menu. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const profileSrc = readFileSync(fileURLToPath(new URL('./profile.jsx', import.meta.url)), 'utf8')

const layoutSrc = readFileSync(fileURLToPath(new URL('./_layout.jsx', import.meta.url)), 'utf8')
const menuSrc = readFileSync(fileURLToPath(new URL('../../components/AccountMenu.jsx', import.meta.url)), 'utf8')

describe('student sign-out placement', () => {
  it('removes the duplicate profile card', () => {
    expect(profileSrc).not.toContain('SignOutCard')
    expect(profileSrc).not.toContain('SignOutButton')
  })

  it('keeps the shared confirmation control available from the header', () => {
    expect(layoutSrc).toContain('<AccountMenu')
    expect(menuSrc).toMatch(/<SignOutButton\b/)
  })
})
