import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Exercise the component's effect, handlers and rendered output under Node.
// The repository has no DOM test environment; only React's hook storage is mocked.
const hooks = vi.hoisted(() => ({ value: null, effect: null, ref: null, changes: [] }))
vi.mock('react', async (original) => ({
  ...await original(),
  useState: () => [hooks.value, (value) => { hooks.value = value; hooks.changes.push(value) }],
  useRef: (value) => (hooks.ref ??= { current: value }),
  useCallback: (fn) => fn,
  useEffect: (effect) => { hooks.effect = effect },
}))
import ServerStatus from './ServerStatus.jsx'

let cleanup
const healthy = () => Promise.resolve({ ok: true, json: async () => ({ status: 'ok' }) })
const failed = () => Promise.reject(new Error('network'))
const flush = () => vi.advanceTimersByTimeAsync(0)
const warning = () => ServerStatus() !== null
function mount() {
  ServerStatus()
  cleanup = hooks.effect()
}
beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(hooks, { value: null, effect: null, ref: null, changes: [] })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('fetch', vi.fn(healthy))
})
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('first success is healthy and polls after 30 seconds', async () => {
  mount()
  await flush()
  expect(hooks.value).toBe(true)
  expect(warning()).toBe(false)
  expect(fetch.mock.calls[0][0]).toMatch(/\/api\/health$/)
  expect(fetch.mock.calls[0][1].cache).toBe('no-store')
  await vi.advanceTimersByTimeAsync(30000)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('waits two seconds after one failure; successful retry never displays warning', async () => {
  fetch.mockImplementationOnce(failed)
  mount()
  await flush()
  expect(warning()).toBe(false)
  await vi.advanceTimersByTimeAsync(1999)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(warning()).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(hooks.value).toBe(true)
  expect(hooks.changes).not.toContain(false)
})

it('warns only after both failures and clears on later polling success', async () => {
  fetch.mockImplementationOnce(failed).mockImplementationOnce(failed)
  mount()
  await flush()
  expect(warning()).toBe(false)
  await vi.advanceTimersByTimeAsync(2000)
  expect(warning()).toBe(true)
  await vi.advanceTimersByTimeAsync(29999)
  expect(fetch).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(warning()).toBe(false)
  expect(hooks.value).toBe(true)
})

it.each([
  { ok: false, json: async () => ({ status: 'ok' }) },
  { ok: true, json: async () => ({ status: 'unhealthy' }) },
  { ok: true, json: async () => { throw new Error('HTML, not JSON') } },
])('retries HTTP and invalid health responses before warning: %j', async (response) => {
  fetch.mockResolvedValue(response)
  mount()
  await flush()
  expect(warning()).toBe(false)
  await vi.advanceTimersByTimeAsync(2000)
  expect(warning()).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('aborts each request at four seconds, with just one delayed retry', async () => {
  fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  }))
  mount()
  const firstSignal = fetch.mock.calls[0][1].signal
  await vi.advanceTimersByTimeAsync(3999)
  expect(firstSignal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(firstSignal.aborted).toBe(true)
  expect(warning()).toBe(false)
  await vi.advanceTimersByTimeAsync(2000)
  expect(fetch).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(3999)
  expect(warning()).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(warning()).toBe(true)
})

it('also times out while reading the response body', async () => {
  fetch.mockImplementation((_url, { signal }) => Promise.resolve({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }),
  }))
  mount()
  await vi.advanceTimersByTimeAsync(10000)
  expect(warning()).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('focus and manual checks cannot overlap an active request or its retry delay', async () => {
  fetch.mockImplementationOnce(failed).mockImplementationOnce(failed)
  mount()
  await vi.advanceTimersByTimeAsync(2000)
  const button = ServerStatus().props.children[1]
  fetch.mockImplementationOnce(failed)
  button.props.onClick()
  await flush()
  window.dispatchEvent(new Event('focus'))
  button.props.onClick()
  expect(fetch).toHaveBeenCalledTimes(3)
  await vi.advanceTimersByTimeAsync(2000)
  expect(fetch).toHaveBeenCalledTimes(4)
  expect(warning()).toBe(false)
})

it('unmount aborts in-flight work, removes focus listener and prevents state updates', async () => {
  let resolveRequest
  fetch.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve }))
  mount()
  const signal = fetch.mock.calls[0][1].signal
  cleanup()
  expect(signal.aborted).toBe(true)
  resolveRequest(await healthy())
  await flush()
  window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(60000)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(hooks.changes).toEqual([])
  expect(vi.getTimerCount()).toBe(0)
})

it('unmount during retry delay cancels retry and all timers', async () => {
  fetch.mockImplementationOnce(failed)
  mount()
  await flush()
  cleanup()
  await vi.advanceTimersByTimeAsync(60000)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(hooks.changes).toEqual([])
  expect(vi.getTimerCount()).toBe(0)
})
