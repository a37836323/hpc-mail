export const ADMIN_ROLE_KEY = 'admin'

export function isAdminRoleKey(roleKey) {
  return roleKey === ADMIN_ROLE_KEY
}

export function canManageUser(currentRoleKey, targetRoleKey) {
  return !isAdminRoleKey(targetRoleKey) || isAdminRoleKey(currentRoleKey)
}

export function isUserSelectable(roleKey) {
  return !isAdminRoleKey(roleKey)
}

export function resolveUserRoleName(user, roles = []) {
  const match = roles.find(role => role.roleId === user?.type)
  return match?.name || user?.roleName || ''
}
