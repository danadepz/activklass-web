import { afterEach, describe, expect, it, vi } from 'vitest'
import { lockBodyScroll } from './useDialogBehavior'

/* The lock goes on <html>, not <body>. index.css gives <html> `overflow-x:
   hidden`, so a body `overflow: hidden` stops propagating to the viewport and
   breaks every `position: sticky` element (the auth screens' left brand panel
   scrolled away behind an open dialog, leaving a blank strip). */
describe('lockBodyScroll', () => {
  afterEach(() => vi.unstubAllGlobals())

  function fakeDocument() {
    const doc = { documentElement: { style: { overflow: '' } }, body: { style: { overflow: '' } } }
    vi.stubGlobal('document', doc)
    return doc
  }

  it('locks and restores <html>, and never touches <body>', () => {
    const doc = fakeDocument()
    const unlock = lockBodyScroll()
    expect(doc.documentElement.style.overflow).toBe('hidden')
    expect(doc.body.style.overflow).toBe('')
    unlock()
    expect(doc.documentElement.style.overflow).toBe('')
  })

  it('stays locked until the last of two stacked dialogs closes', () => {
    const doc = fakeDocument()
    const first = lockBodyScroll()
    const second = lockBodyScroll()
    first()
    expect(doc.documentElement.style.overflow).toBe('hidden')
    second()
    expect(doc.documentElement.style.overflow).toBe('')
  })

  it('gives back whatever overflow the page had before', () => {
    const doc = fakeDocument()
    doc.documentElement.style.overflow = 'scroll'
    const unlock = lockBodyScroll()
    unlock()
    expect(doc.documentElement.style.overflow).toBe('scroll')
  })
})
