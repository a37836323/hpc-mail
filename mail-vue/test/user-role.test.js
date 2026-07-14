import { describe, expect, it } from 'vitest'
import { canManageUser, isAdminRoleKey, isUserSelectable, resolveUserRoleName } from '../src/utils/user-role.js'

describe('user role semantics', () => {
  it('recognizes administrators only by the stable role key', () => {
    expect(isAdminRoleKey('admin')).toBe(true)
    expect(isAdminRoleKey('member')).toBe(false)
    expect(isAdminRoleKey(0)).toBe(false)
  })

  it('protects administrator rows without treating role IDs as sentinels', () => {
    expect(canManageUser('admin', 'admin')).toBe(true)
    expect(canManageUser('member', 'admin')).toBe(false)
    expect(canManageUser('member', 'member')).toBe(true)
    expect(isUserSelectable('admin')).toBe(false)
    expect(isUserSelectable('member')).toBe(true)
  })

  it('resolves display names from the real role ID', () => {
    const roles = [
      { roleId: 0, name: 'Role zero' },
      { roleId: 12, name: 'Administrator' },
    ]
    expect(resolveUserRoleName({ type: 12, roleKey: 'admin' }, roles)).toBe('Administrator')
    expect(resolveUserRoleName({ type: 0, roleKey: 'member' }, roles)).toBe('Role zero')
    expect(resolveUserRoleName({ type: 99, roleName: 'External role' }, roles)).toBe('External role')
  })
})
