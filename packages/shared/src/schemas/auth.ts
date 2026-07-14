import { z } from 'zod';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  ROLES,
  USERNAME_REGEX,
  USER_STATUSES,
  type Role,
  type UserStatus,
} from '../constants.js';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_REGEX, '用户名需为 3-32 位小写字母/数字，可含 - 或 _，且以字母或数字开头');

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `密码至少 ${PASSWORD_MIN_LENGTH} 位`)
  .max(PASSWORD_MAX_LENGTH, `密码最多 ${PASSWORD_MAX_LENGTH} 位`);

export const loginRequestSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const registerRequestSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  inviteCode: z.string().trim().min(1).max(64).optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const changePasswordRequestSchema = z.object({
  oldPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: SessionUser;
}

// ---- 管理端用户管理 ----

export const createUserRequestSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(ROLES).default('user'),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const updateUserRequestSchema = z
  .object({
    status: z.enum(USER_STATUSES).optional(),
    role: z.enum(ROLES).optional(),
    password: passwordSchema.optional(),
  })
  .refine((v) => v.status !== undefined || v.role !== undefined || v.password !== undefined, {
    message: '至少提供一个待更新字段',
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export interface AdminUser {
  id: number;
  username: string;
  role: Role;
  status: UserStatus;
  mailboxCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}
