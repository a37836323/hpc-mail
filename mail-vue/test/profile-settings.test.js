import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const http = vi.hoisted(() => ({ put: vi.fn() }))
vi.mock('../src/axios/index.js', () => ({ default: http }))

import { setDisplayName } from '../src/request/my.js'

describe('platform profile settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates the platform display name without a mailbox account ID', () => {
    setDisplayName('New display name')

    expect(http.put).toHaveBeenCalledWith('/my/setDisplayName', {
      displayName: 'New display name',
    })
  })

  it('does not present a default mailbox as the platform identity', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/views/setting/index.vue', import.meta.url)),
      'utf8',
    )

    expect(source).not.toContain('defaultAccount')
    expect(source).not.toContain('emailAccount')
    expect(source).not.toContain('accountSetName')
    expect(source).toContain('setDisplayName(name)')
  })
})
