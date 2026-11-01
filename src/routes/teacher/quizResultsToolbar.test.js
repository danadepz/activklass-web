import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const source = readFileSync(new URL('./quizzes.$quizId.jsx', import.meta.url), 'utf8')
describe('T-230: results controls have space to wrap', () => {
  const start = source.indexOf('View Results For Class:')
  const toolbar = source.slice(source.lastIndexOf('<div className=', start), source.indexOf('<ResultsView', start))
  const post = source.slice(source.indexOf('function PostScoresButton'), source.indexOf('function PostScoresButton') + 2400)
  it('contains the selector in a card and permits wrapping without shrinking its label', () => {
    expect(toolbar).toContain('flex-wrap')
    expect(toolbar).toContain("background: '#FFFFFF'")
    expect(toolbar).toContain("whiteSpace: 'nowrap'")
    expect(toolbar).toContain("maxWidth: '100%'")
    expect(toolbar).toContain('minWidth: 0')
  })
  it('puts posting guidance on its own row and keeps its action on one line', () => {
    expect(post).toContain("flex: '1 0 100%'")
    expect(post).toContain("whiteSpace: 'nowrap'")
    expect(post).not.toContain("maxWidth: 420")
  })
})
