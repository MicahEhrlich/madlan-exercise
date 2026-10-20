// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ThemeToggle from './ThemeToggle'

let preference: MediaQueryList
let listeners: Set<() => void>

beforeEach(() => {
  listeners = new Set()
  preference = {
    matches: false,
    addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
  } as unknown as MediaQueryList
  vi.stubGlobal('matchMedia', vi.fn(() => preference))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = ''
})

function systemChangesTo(dark: boolean) {
  Object.defineProperty(preference, 'matches', { value: dark, configurable: true })
  act(() => listeners.forEach((listener) => listener()))
}

it('defaults to system and follows live system changes in either direction', () => {
  render(<ThemeToggle />)
  expect(screen.getByRole('button', { name: 'מערכת' }).getAttribute('aria-pressed')).toBe('true')
  expect(document.documentElement.classList.contains('dark')).toBe(false)
  systemChangesTo(true)
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  expect(document.documentElement.style.colorScheme).toBe('dark')
  systemChangesTo(false)
  expect(document.documentElement.classList.contains('dark')).toBe(false)
})

it('uses the dark system preference on initial render', () => {
  systemChangesTo(true)
  render(<ThemeToggle />)
  expect(document.documentElement.classList.contains('dark')).toBe(true)
})

it('allows explicit overrides and returning to system, and cleans up listeners', () => {
  const { unmount } = render(<ThemeToggle />)
  fireEvent.click(screen.getByRole('button', { name: 'כהה' }))
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  systemChangesTo(false)
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'בהיר' }))
  systemChangesTo(true)
  expect(document.documentElement.classList.contains('dark')).toBe(false)
  expect(document.documentElement.style.colorScheme).toBe('light')
  fireEvent.click(screen.getByRole('button', { name: 'מערכת' }))
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  expect(listeners.size).toBe(1)
  unmount()
  expect(listeners.size).toBe(0)
})
