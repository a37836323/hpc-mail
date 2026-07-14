import { api } from '@/api'
import type { AdminMail, AdminRole, AdminUser, InviteKey, PermissionNode, RoleSummary, SystemSetting } from './adminTypes'

export interface UserListParams { num: number; size: number; username?: string; timeSort?: number; status?: number; isDel?: number }
export interface AllMailParams { emailId?: number; size: number; name?: string; subject?: string; accountEmail?: string; username?: string; type?: string; timeSort?: number }
export interface RoleInput { roleId?: number; name: string; description: string; permIds: number[]; banEmail: string[]; banEmailType: number; availDomain: string[]; sendCount?: number; sendType?: string; accountCount?: number }

export const managementApi = {
  users: (params: UserListParams, signal?: AbortSignal) => api.get<{ list: AdminUser[]; total: number }>('/user/list', { query: params, signal }),
  addUser: (input: { username: string; displayName: string; password: string; type: number }) => api.post<AdminUser, typeof input>('/user/add', input),
  setUserStatus: (userId: number, status: number) => api.put<void, { userId: number; status: number }>('/user/setStatus', { userId, status }),
  setUserRole: (userId: number, type: number) => api.put<void, { userId: number; type: number }>('/user/setType', { userId, type }),
  resetUserPassword: (userId: number, password: string) => api.put<void, { userId: number; password: string }>('/user/setPwd', { userId, password }),
  deleteUsers: (userIds: number[]) => api.delete<void>('/user/delete', { query: { userIds: userIds.join(',') } }),
  restoreUser: (userId: number) => api.put<void, { userId: number }>('/user/restore', { userId }),

  roles: (signal?: AbortSignal) => api.get<AdminRole[]>('/role/list', { signal }),
  selectableRoles: (signal?: AbortSignal) => api.get<RoleSummary[]>('/role/selectUse', { signal }),
  permissionTree: (signal?: AbortSignal) => api.get<PermissionNode[]>('/role/tree', { signal }),
  addRole: (input: RoleInput) => api.post<void, RoleInput>('/role/add', input),
  updateRole: (input: RoleInput) => api.put<void, RoleInput>('/role/set', input),
  setDefaultRole: (roleId: number) => api.put<void, { roleId: number }>('/role/setDefault', { roleId }),
  deleteRole: (roleId: number) => api.delete<void>('/role/delete', { query: { roleId } }),

  allMail: (params: AllMailParams, signal?: AbortSignal) => api.get<{ list: AdminMail[]; total: number; latestEmail: Pick<AdminMail, 'emailId'> }>('/allEmail/list', { query: params, signal }),
  deleteMail: (emailIds: number[]) => api.delete<void>('/allEmail/delete', { query: { emailIds: emailIds.join(',') } }),
  batchDeleteMail: (type: string) => api.delete<void>('/allEmail/batchDelete', { query: { type } }),

  inviteKeys: (code: string, signal?: AbortSignal) => api.get<InviteKey[]>('/regKey/list', { query: { code }, signal }),
  addInviteKey: (input: { code: string; roleId: number; count: number; expireTime: string }) => api.post<void, typeof input>('/regKey/add', input),
  deleteInviteKeys: (regKeyIds: number[]) => api.delete<void>('/regKey/delete', { query: { regKeyIds: regKeyIds.join(',') } }),
  clearInviteKeys: () => api.delete<void>('/regKey/clearNotUse'),

  settings: (signal?: AbortSignal) => api.get<SystemSetting>('/setting/query', { signal }),
  updateSettings: (input: Partial<SystemSetting>) => api.put<void, Partial<SystemSetting>>('/setting/set', input),
  updateBlacklist: (input: Pick<SystemSetting, 'blackSubject' | 'blackContent' | 'blackFrom'>) => api.put<void, typeof input>('/setting/setBlacklist', input),
  testFeishu: () => api.post<{ success: boolean }>('/setting/testFeishu'),
}
