import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ setOpen: vi.fn() }))
vi.mock('react', async (load) => ({
  ...(await load()),
  useState: () => [true, state.setOpen],
  useRef: () => ({ current: null }),
  useId: () => 'account-menu',
  useEffect: vi.fn(),
}))

import AccountMenu from './AccountMenu'

function openMenu() {
  const tree = AccountMenu({ profile: {}, profileTo: '/student/profile' })
  const [trigger, menu] = tree.props.children
  const items = [{ focus: vi.fn() }, { focus: vi.fn() }, { focus: vi.fn() }]
  const focusTrigger = vi.fn()
  trigger.props.ref.current = { focus: focusTrigger }
  menu.props.ref.current = { querySelectorAll: () => items }
  vi.stubGlobal('document', { activeElement: items[0] })
  return { trigger, menu, items, focusTrigger }
}

const keyEvent = key => ({ key, preventDefault: vi.fn(), target: { closest: () => null } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('account menu keyboard navigation', () => {
  it('opens from the avatar with either arrow key', () => {
    const { trigger } = openMenu()
    for (const key of ['ArrowDown', 'ArrowUp']) {
      const event = keyEvent(key)
      trigger.props.onKeyDown(event)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(state.setOpen).toHaveBeenCalledWith(true)
    }
  })

  it('moves through the three account actions and wraps at either end', () => {
    const { menu, items } = openMenu()
    menu.props.onKeyDown(keyEvent('ArrowDown'))
    expect(items[1].focus).toHaveBeenCalledTimes(1)
    menu.props.onKeyDown(keyEvent('ArrowUp'))
    expect(items[2].focus).toHaveBeenCalled()
    document.activeElement = items[2]
    menu.props.onKeyDown(keyEvent('ArrowDown'))
    expect(items[0].focus).toHaveBeenCalled()
  })

  it('supports Home and End and closes on Tab', () => {
    const { menu, items, focusTrigger } = openMenu()
    menu.props.onKeyDown(keyEvent('End'))
    expect(items[2].focus).toHaveBeenCalled()
    menu.props.onKeyDown(keyEvent('Home'))
    expect(items[0].focus).toHaveBeenCalled()
    const event = keyEvent('Tab')
    menu.props.onKeyDown(event)
    expect(state.setOpen).toHaveBeenCalledWith(false)
    expect(focusTrigger).toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('keeps the sign-out confirmation mounted when Tab is pressed inside it', () => {
    const { menu, focusTrigger } = openMenu()
    menu.props.onKeyDown({ ...keyEvent('Tab'), target: { closest: () => ({ role: 'dialog' }) } })
    expect(state.setOpen).not.toHaveBeenCalled()
    expect(focusTrigger).not.toHaveBeenCalled()
  })
})
