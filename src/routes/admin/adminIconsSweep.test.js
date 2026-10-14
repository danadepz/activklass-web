/**
 * T-179 (andecobs-271): "The ⓘ marker is a text character, and the admin
 * screens still carry the emoji T-149 removed everywhere else."
 *
 * Verifies that the admin screens (ClassesTab.jsx, SubscriptionTab.jsx,
 * UsersTab.jsx) have replaced raw emoji in card headers with shared vector
 * icons from src/components/icons.jsx.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const classesSrc = readFileSync(fileURLToPath(new URL('./ClassesTab.jsx', import.meta.url)), 'utf8')
const subSrc = readFileSync(fileURLToPath(new URL('./SubscriptionTab.jsx', import.meta.url)), 'utf8')
const usersSrc = readFileSync(fileURLToPath(new URL('./UsersTab.jsx', import.meta.url)), 'utf8')

describe('T-179 — Admin screens carry no emoji in CardHead', () => {
  it('ClassesTab.jsx has no 🏫 emoji left and uses School icon', () => {
    expect(classesSrc).not.toMatch(/🏫/)
    expect(classesSrc).toMatch(/import\s*\{[^}]*School[^}]*\}\s*from\s*['"]@\/components\/icons['"]/)
    expect(classesSrc).toMatch(/<CardHead[\s\S]*?icon=\{<School\b/)
  })

  it('SubscriptionTab.jsx has no 🧑‍🏫, 🗂️, or 🏛️ emoji left and uses vector icons', () => {
    expect(subSrc).not.toMatch(/🧑‍🏫|🗂️|🏛️/)
    expect(subSrc).toMatch(/import\s*\{[^}]*GraduationCap[^}]*\}\s*from\s*['"]@\/components\/icons['"]/)
    expect(subSrc).toMatch(/import\s*\{[^}]*Layers[^}]*\}\s*from\s*['"]@\/components\/icons['"]/)
    expect(subSrc).toMatch(/import\s*\{[^}]*School[^}]*\}\s*from\s*['"]@\/components\/icons['"]/)
    expect(subSrc).toMatch(/<CardHead[\s\S]*?icon=\{<GraduationCap\b/)
    expect(subSrc).toMatch(/<CardHead[\s\S]*?icon=\{<Layers\b/)
  })

  it('UsersTab.jsx has no 🏫, 📅, 👤, or 👥 emoji left and uses vector icons', () => {
    expect(usersSrc).not.toMatch(/🏫|📅|👤|👥/)
    expect(usersSrc).toMatch(/import\s*\{[^}]*School[^}]*\}\s*from\s*['"]@\/components\/icons['"]/)
    expect(usersSrc).toMatch(/import\s*\{[^}]*CalendarCheck[^}]*\}\s*from\s*['"]@\/components\/icons['"]/)
    expect(usersSrc).toMatch(/import\s*\{[^}]*UserPlus[^}]*\}\s*from\s*['"]@\/components\/icons['"]/)
    expect(usersSrc).toMatch(/import\s*\{[^}]*Users[^}]*\}\s*from\s*['"]@\/components\/icons['"]/)
    expect(usersSrc).toMatch(/<CardHead[\s\S]*?icon=\{<School\b/)
    expect(usersSrc).toMatch(/<CardHead[\s\S]*?icon=\{<CalendarCheck\b/)
    expect(usersSrc).toMatch(/<CardHead[\s\S]*?icon=\{<UserPlus\b/)
    expect(usersSrc).toMatch(/<CardHead[\s\S]*?icon=\{<Users\b/)
  })
})
