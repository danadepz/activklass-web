/**
 * The download half of this file is what tester ticket T-03 reported as
 * "Export CSV not functioning": the anchor was clicked while detached from
 * the document, which Chrome tolerates and Firefox ignores. There is no DOM
 * library in this repo, so the document is a stub that records the order of
 * what happened -- that order is the whole bug.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { csvCell, toCsv, saveBlob } from './csv'

/** A document just real enough to answer "was the anchor attached at click?" */
function stubDom() {
  const log = []
  const body = {
    children: [],
    appendChild(el) { this.children.push(el); log.push('append') },
  }
  const anchor = {
    href: '', download: '',
    click() { log.push(body.children.includes(anchor) ? 'click:attached' : 'click:detached') },
    remove() { body.children = body.children.filter((c) => c !== anchor); log.push('remove') },
  }
  vi.stubGlobal('document', { createElement: () => anchor, body })
  vi.stubGlobal('URL', {
    createObjectURL: () => { log.push('create'); return 'blob:test' },
    revokeObjectURL: () => log.push('revoke'),
  })
  return { log, anchor }
}

afterEach(() => vi.unstubAllGlobals())

describe('csvCell', () => {
  it('neutralises a leading formula character', () => {
    // A name typed as "=cmd" executes on open in Excel; the quote defuses it.
    expect(csvCell('=cmd|calc')).toBe("'=cmd|calc")
    expect(csvCell('-5')).toBe("'-5")
  })

  it('quotes and escapes only what needs it', () => {
    expect(csvCell('Dela Cruz, Ana')).toBe('"Dela Cruz, Ana"')
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""')
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell(null)).toBe('')
  })
})

describe('toCsv', () => {
  it('joins rows with the header first', () => {
    expect(toCsv([['Last', 'First'], ['Bautista', 'Ana']])).toBe('Last,First\nBautista,Ana')
  })
})

describe('saveBlob', () => {
  it('clicks the anchor while it is in the document, then removes it', () => {
    const { log, anchor } = stubDom()
    saveBlob('users.csv', new Blob(['a,b']))
    expect(anchor.download).toBe('users.csv')
    // The assertion the bug would have failed: attached, not detached.
    expect(log).toEqual(['create', 'append', 'click:attached', 'remove'])
  })

  it('does not revoke the object URL before the click has been handled', async () => {
    // Firefox resolves blob: after click() returns -- revoking inline cancels
    // the download it just started.
    const { log } = stubDom()
    saveBlob('users.csv', new Blob(['a,b']))
    expect(log).not.toContain('revoke')
    await new Promise((r) => setTimeout(r, 0))
    expect(log).toContain('revoke')
  })
})
