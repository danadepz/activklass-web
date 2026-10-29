import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const indexSource = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

describe('Subscribers List — Tabs and Search Bar', () => {
  it('renders distinct clickable tabs for Institutions and Solo Teachers', () => {
    expect(indexSource).toMatch(/role="tablist" aria-label="Subscriber Types"/)
    expect(indexSource).toMatch(/onClick=\{\(\) => setSegment\('institution'\)\}/)
    expect(indexSource).toMatch(/onClick=\{\(\) => setSegment\('teacher'\)\}/)
    expect(indexSource).toMatch(/onClick=\{\(\) => setSegment\('all'\)\}/)
  })

  it('renders count badges for both institutions and solo teachers', () => {
    expect(indexSource).toMatch(/\{institutionCount\}/)
    expect(indexSource).toMatch(/\{teacherCount\}/)
  })

  it('renders an instant search input with a clear button', () => {
    expect(indexSource).toMatch(/placeholder="Search subscribers…"/)
    expect(indexSource).toMatch(/value=\{searchQuery\}/)
    expect(indexSource).toMatch(/onClick=\{\(\) => setSearchQuery\(''\)\}/)
  })

  it('filters rows based on searchQuery across name, email, plan, or id', () => {
    expect(indexSource).toMatch(/name\.includes\(q\) \|\| email\.includes\(q\) \|\| plan\.includes\(q\) \|\| id\.includes\(q\)/)
    expect(indexSource).toMatch(/displayRows\.map\(/)
  })

  it('handles empty search results with a clear search prompt', () => {
    expect(indexSource).toMatch(/No subscribers match &ldquo;\{searchQuery\}&rdquo;/)
    expect(indexSource).toMatch(/Clear search/)
  })
})
