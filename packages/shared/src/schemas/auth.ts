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
  /** 头像访问 URL（带版本号防缓存）；无头像时为 null，前端回退到用户名首字母 */
  avatarUrl: string | null;
}

/** 头像上传：base64 图片 + MIME 类型 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const uploadAvatarRequestSchema = z.object({
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  /** base64 编码的图片内容（不含 data: 前缀） */
  image: z
    .string()
    .min(1)
    .max(Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 4, '头像图片不能超过 2MB')
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, '头像需为合法 base64'),
});
export type UploadAvatarRequest = z.infer<typeof uploadAvatarRequestSchema>;

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
  /** 头像访问 URL（带版本号防缓存）；无头像时为 null */
  avatarUrl: string | null;
}
