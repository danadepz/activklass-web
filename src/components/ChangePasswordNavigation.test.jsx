import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  location: { hash: '', key: 'profile' },
  effects: [],
  form: { scrollIntoView: vi.fn(), querySelector: vi.fn() },
}))
vi.mock('react', async (load) => ({
  ...(await load()),
  useEffect: (effect) => { state.effects.push(effect) },
  useRef: () => ({ current: state.form }),
}))
vi.mock('react-router-dom', () => ({ useLocation: () => state.location }))
vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ markPasswordChanged: vi.fn() }) }))

import ChangePassword from './ChangePassword'

beforeEach(() => {
  vi.clearAllMocks()
  state.effects = []
  state.location = { hash: '#change-password', key: 'password' }
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('window', { matchMedia: vi.fn(() => ({ matches: false })) })
})
afterEach(() => vi.unstubAllGlobals())

it('scrolls beneath the fixed header and focuses the current-password field after navigation', () => {
  const focus = vi.fn()
  state.form.querySelector.mockReturnValue({ focus })
  const html = renderToStaticMarkup(<ChangePassword />)
  expect(html).toContain('id="change-password"')
  expect(html).toContain('scroll-margin-top:128px')
  const cleanup = state.effects[0]()
  expect(state.form.scrollIntoView).not.toHaveBeenCalled()
  requestAnimationFrame.mock.calls[0][0]()
  expect(state.form.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  cleanup()
  expect(cancelAnimationFrame).toHaveBeenCalledWith(42)
})

it('uses immediate scrolling when reduced motion is requested', () => {
  window.matchMedia.mockReturnValue({ matches: true })
  renderToStaticMarkup(<ChangePassword />)
  state.effects[0]()
  requestAnimationFrame.mock.calls[0][0]()
  expect(state.form.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
})

it('opens Profile normally without moving focus to the password form', () => {
  state.location.hash = ''
  renderToStaticMarkup(<ChangePassword />)
  state.effects[0]()
  expect(requestAnimationFrame).not.toHaveBeenCalled()
  expect(state.form.querySelector).not.toHaveBeenCalled()
})
