/**
 * T-140 (triplecookiemonster-191): Kristine's screenshot showed two lines
 * under Class Record and asked to remove both -- the grade weights, and
 * "Quiz scores post here on their own when this page opens." The weights
 * line really was a duplicate (the table's own component headers already
 * show `{name} ({weight}%)`), so it is gone. The second line is NOT a
 * static sentence -- `statusLine` below also reports which quizzes were
 * skipped, how many posted just now, and how many were kept as typed. A
 * teacher who lost that line would have no way to learn an auto-post
 * happened, or silently skipped a named quiz. It must survive.
 *
 * Source-text test, the pattern recordManualStamp.test.js and
 * historyWiring.test.js use for record.jsx: the component's own dependency
 * list (Firestore, react-query, several hooks) makes a full render heavy for
 * what this needs to prove, and the claim here is about what the JSX still
 * contains, not about live data.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./record.jsx', import.meta.url)), 'utf8')

describe('T-140 — Class Record loses the duplicated weights line and keeps the auto-post status', () => {
  it('no longer builds a weights-join subline', () => {
    // The old line this replaces: bundle.components.map(c => `${c.name} ${fmt(c.weight_percent)}%`).join(' · ')
    expect(src).not.toMatch(/components\.map\(\(c\) => `\$\{c\.name\} \$\{fmt\(c\.weight_percent\)\}%`\)\.join/)
  })

  it('still renders the live auto-post status line, unconditionally when configured', () => {
    // The exact status paragraph a teacher sees -- role="status" so it's the
    // one place this screen tells them an auto-post happened or was skipped.
    expect(src).toMatch(/role="status"[\s\S]{0,400}statusLine/)
    expect(src).toContain('Quiz scores post here on their own when this page opens')
    expect(src).toContain('Not posted: ${autoPost.skipped.join')
    expect(src).toContain('posted just now')
    expect(src).toContain('kept as typed')
  })

  it('keeps the DepEd Order transmutation note, now inside the tooltip instead of the subline', () => {
    expect(src).toContain('transmuted per DepEd Order No. 8, s. 2015')
    expect(src).toMatch(/InfoTooltip[\s\S]{0,40}transmutationNote/)
  })
})
