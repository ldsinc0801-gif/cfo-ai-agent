/**
 * 認証・権限管理の型定義
 */

/** テナントメンバーのロール */
export type TenantRole = 'financial_admin' | 'admin' | 'employee';

/** 招待のステータス */
export type InvitationStatus = 'pending' | 'accepted' | 'expired';

/** テナント */
export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** ユーザー（DB上の全カラム） */
export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  passwordHash: string;
  mustChangePassword: boolean;
  isSuperAdmin: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  googleRefreshToken: string | null;
  googleAccessToken: string | null;
  googleTokenExpiry: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  updatedAt: string;
}

/** テナントメンバー */
export interface TenantMember {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 招待 */
export interface Invitation {
  id: string;
  tenantId: string;
  email: string;
  role: TenantRole;
  invitedBy: string;
  token: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

/** セッションに保持するユーザー情報 */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

/** テナント内でのユーザーの権限情報 */
export interface UserPermission {
  userId: string;
  tenantId: string;
  role: TenantRole;
  isSuperAdmin: boolean;
}

/** Branded type: tenant_id の渡し忘れをコンパイルエラーにする */
declare const __tenantIdBrand: unique symbol;
export type TenantId = string & { readonly [__tenantIdBrand]: never };

/** 文字列を TenantId にキャストする（バリデーション済みの値のみ使用） */
export function asTenantId(id: string): TenantId {
  return id as TenantId;
}
