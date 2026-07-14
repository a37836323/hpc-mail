import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (callback) => globalThis.setTimeout(() => callback(performance.now()), 0) as unknown as number
  globalThis.cancelAnimationFrame = (handle) => globalThis.clearTimeout(handle)
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
