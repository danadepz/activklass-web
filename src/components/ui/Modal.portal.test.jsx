import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// The pay-to-activate confirm popup rendered inside AuthLayout's ak-swap
// wrapper, whose transform trapped the fixed overlay in that column and pushed
// Pay Now below the screen. The Modal must portal to <body> whenever a DOM exists.
const portal = vi.hoisted(() => vi.fn())
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal()
  portal.mockImplementation((node, target) => <div data-portal={target?.id}>{node}</div>)
  return { ...actual, createPortal: portal }
})

const { default: Modal } = await import('./Modal')

describe('Modal portal', () => {
  afterEach(() => { delete globalThis.document; portal.mockClear() })

  it('renders into document.body, not inside its parent', () => {
    globalThis.document = { body: { id: 'body' } }
    const html = renderToStaticMarkup(<Modal title="Confirm" onClose={() => {}}>x</Modal>)
    expect(portal).toHaveBeenCalledTimes(1)
    expect(portal.mock.calls[0][1]).toBe(globalThis.document.body)
    expect(html).toContain('data-portal="body"')
  })

  it('renders inline when there is no document (server render)', () => {
    const html = renderToStaticMarkup(<Modal title="Confirm" onClose={() => {}}>x</Modal>)
    expect(portal).not.toHaveBeenCalled()
    expect(html).toContain('role="dialog"')
  })
})
