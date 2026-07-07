/**
 * 認証サービス
 * - メール+パスワードログイン
 * - アカウントロック（5回失敗→15分）
 * - パスワード変更
 */

import { getSupabase } from '../clients/supabase.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';
import type { User, TenantMember, TenantRole, TenantId } from '../types/auth.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

export class AuthService {

  /** メール+パスワードでログイン。成功時にUserを返す。 */
  async login(email: string, password: string): Promise<{ user: User } | { error: string }> {
    const user = await this.getUserByEmail(email);
    if (!user) {
      return { error: 'メールアドレスまたはパスワードが正しくありません' };
    }

    // アカウントロックチェック
    if (user.lockedUntil) {
      const lockExpiry = new Date(user.lockedUntil);
      if (lockExpiry > new Date()) {
        const remaining = Math.ceil((lockExpiry.getTime() - Date.now()) / 60000);
        return { error: `アカウントがロックされています。${remaining}分後に再試行してください` };
      }
      // ロック期間が過ぎた → リセット
      await this.resetFailedAttempts(user.id);
      user.failedLoginCount = 0;
      user.lockedUntil = null;
    }

    // パスワード照合
    const match = await verifyPassword(password, user.passwordHash);
    if (!match) {
      const newCount = user.failedLoginCount + 1;
      if (newCount >= MAX_FAILED_ATTEMPTS) {
        await this.lockAccount(user.id, newCount);
        return { error: `アカウントを一定時間ロックしました。${LOCK_DURATION_MINUTES}分後に再試行してください` };
      }
      await this.incrementFailedAttempts(user.id, newCount);
      return { error: 'メールアドレスまたはパスワードが正しくありません' };
    }

    // ログイン成功 → 失敗回数リセット、最終ログイン更新
    await this.onLoginSuccess(user.id);
    user.failedLoginCount = 0;
    user.lockedUntil = null;

    logger.info(`ログイン成功: ${email}`);
    return { user };
  }

  /** パスワード変更 */
  async changePassword(userId: string, newPassword: string): Promise<void> {
    const hash = await hashPassword(newPassword);
    const { error } = await getSupabase()
      .from('users')
      .update({
        password_hash: hash,
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw new Error(`パスワード変更に失敗: ${error.message}`);
    logger.info(`パスワード変更完了: ${userId}`);
  }

  /** パスワードリセット（管理者が他ユーザーのパスワードをリセット） */
  async resetPassword(userId: string, newPasswordHash: string): Promise<void> {
    const { error } = await getSupabase()
      .from('users')
      .update({
        password_hash: newPasswordHash,
        must_change_password: true,
        failed_login_count: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw new Error(`パスワードリセットに失敗: ${error.message}`);
    logger.info(`パスワードリセット完了: ${userId}`);
  }

  /** ユーザーをメールアドレスで取得 */
  async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await getSupabase()
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`ユーザー取得に失敗: ${error.message}`);
    }
    return this.mapUser(data);
  }

  /** ユーザーをIDで取得 */
  async getUserById(userId: string): Promise<User | null> {
    const { data, error } = await getSupabase()
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`ユーザー取得に失敗: ${error.message}`);
    }
    return this.mapUser(data);
  }

  /** ユーザーの所属テナント一覧を取得 */
  async getUserTenants(userId: string): Promise<Array<{ tenantId: string; tenantName: string; role: TenantRole }>> {
    const { data, error } = await getSupabase()
      .from('tenant_members')
      .select('tenant_id, role, tenants(id, name)')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw new Error(`テナント一覧取得に失敗: ${error.message}`);

    return (data || []).map((r: any) => ({
      tenantId: r.tenant_id,
      tenantName: r.tenants?.name || '',
      role: r.role as TenantRole,
    }));
  }

  /** ユーザーの特定テナントでのロールを取得 */
  async getUserRoleInTenant(userId: string, tenantId: TenantId): Promise<TenantRole | null> {
    const { data, error } = await getSupabase()
      .from('tenant_members')
      .select('role')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`ロール取得に失敗: ${error.message}`);
    }
    return data.role as TenantRole;
  }

  /** 新規ユーザー作成（招待フローで使用） */
  async createUser(
    email: string,
    name: string,
    passwordHash: string,
    opts: { isFinancialAdmin?: boolean } = {},
  ): Promise<User> {
    const { data, error } = await getSupabase()
      .from('users')
      .insert({
        email,
        name,
        password_hash: passwordHash,
        must_change_password: true,
        is_financial_admin: opts.isFinancialAdmin ?? false,
      })
      .select()
      .single();

    if (error) throw new Error(`ユーザー作成に失敗: ${error.message}`);
    logger.info(`ユーザー作成: ${email}`);
    return this.mapUser(data);
  }

  /** 財務管理者フラグを設定/解除する（テナント紐付けとは独立） */
  async setFinancialAdmin(userId: string, value: boolean): Promise<void> {
    const { error } = await getSupabase()
      .from('users')
      .update({ is_financial_admin: value })
      .eq('id', userId);
    if (error) throw new Error(`財務管理者フラグ更新に失敗: ${error.message}`);
  }

  /**
   * 財務管理者一覧。is_financial_admin=true のユーザーを基準に返す。
   * 担当テナント（financial_admin の有効なメンバー行）は左結合で付与するので、
   * 担当テナントが0のユーザーも tenants:[] として一覧に含まれる。
   */
  async getFinancialAdmins(): Promise<
    Array<{ userId: string; email: string; name: string; tenants: Array<{ id: string; name: string }> }>
  > {
    // 財務管理者の定義 = フラグ(is_financial_admin) が立っている OR
    // financial_admin の有効なメンバー行を持つ。どちらでも拾うことで、
    // フラグ付け漏れ（旧コード/切替の谷間で追加）でも一覧から消えないようにする。
    const [flaggedRes, memRes] = await Promise.all([
      getSupabase().from('users').select('id').eq('is_financial_admin', true),
      getSupabase()
        .from('tenant_members')
        .select('user_id, tenants(id, name)')
        .eq('role', 'financial_admin')
        .eq('is_active', true),
    ]);
    if (flaggedRes.error) throw new Error(`財務管理者一覧取得に失敗: ${flaggedRes.error.message}`);
    if (memRes.error) throw new Error(`担当テナント取得に失敗: ${memRes.error.message}`);

    // 対象ユーザーID = フラグ持ち ∪ financial_admin メンバー
    const ids = new Set<string>();
    for (const u of (flaggedRes.data || []) as any[]) ids.add(u.id);
    for (const m of (memRes.data || []) as any[]) ids.add(m.user_id);
    if (ids.size === 0) return [];

    // 担当テナントをユーザーごとに集約
    const tenantsByUser = new Map<string, Array<{ id: string; name: string }>>();
    for (const m of (memRes.data || []) as any[]) {
      if (!tenantsByUser.has(m.user_id)) tenantsByUser.set(m.user_id, []);
      if (m.tenants?.id) tenantsByUser.get(m.user_id)!.push({ id: m.tenants.id, name: m.tenants.name || '' });
    }

    // メール・名前を取得（メンバー行だけの人も含めるため users を別引き）
    const { data: users, error: usersErr } = await getSupabase()
      .from('users')
      .select('id, email, name')
      .in('id', [...ids]);
    if (usersErr) throw new Error(`財務管理者ユーザー取得に失敗: ${usersErr.message}`);

    return (users || []).map((u: any) => ({
      userId: u.id,
      email: u.email || '',
      name: u.name || '',
      tenants: tenantsByUser.get(u.id) || [],
    }));
  }

  /** テナントメンバーとして追加 */
  async addTenantMember(tenantId: TenantId, userId: string, role: TenantRole): Promise<void> {
    const { error } = await getSupabase()
      .from('tenant_members')
      .upsert({
        tenant_id: tenantId,
        user_id: userId,
        role,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,user_id' });

    if (error) throw new Error(`テナントメンバー追加に失敗: ${error.message}`);
  }

  /** テナント内のメンバー一覧を取得 */
  async getTenantMembers(tenantId: TenantId): Promise<Array<TenantMember & { email: string; name: string | null }>> {
    const { data, error } = await getSupabase()
      .from('tenant_members')
      .select('*, users(email, name)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (error) throw new Error(`メンバー一覧取得に失敗: ${error.message}`);

    return (data || []).map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      role: r.role,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      email: r.users?.email || '',
      name: r.users?.name || null,
    }));
  }

  // === private ===

  private async incrementFailedAttempts(userId: string, count: number): Promise<void> {
    await getSupabase()
      .from('users')
      .update({ failed_login_count: count })
      .eq('id', userId);
  }

  private async lockAccount(userId: string, count: number): Promise<void> {
    const lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString();
    await getSupabase()
      .from('users')
      .update({ failed_login_count: count, locked_until: lockedUntil })
      .eq('id', userId);
    logger.warn(`アカウントロック: ${userId} (${LOCK_DURATION_MINUTES}分)`);
  }

  private async resetFailedAttempts(userId: string): Promise<void> {
    await getSupabase()
      .from('users')
      .update({ failed_login_count: 0, locked_until: null })
      .eq('id', userId);
  }

  private async onLoginSuccess(userId: string): Promise<void> {
    await getSupabase()
      .from('users')
      .update({
        failed_login_count: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
      })
      .eq('id', userId);
  }

  private mapUser(data: any): User {
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
      passwordHash: data.password_hash,
      mustChangePassword: data.must_change_password,
      isSuperAdmin: data.is_super_admin,
      isFinancialAdmin: data.is_financial_admin ?? false,
      failedLoginCount: data.failed_login_count,
      lockedUntil: data.locked_until,
      googleRefreshToken: data.google_refresh_token,
      googleAccessToken: data.google_access_token,
      googleTokenExpiry: data.google_token_expiry,
      createdAt: data.created_at,
      lastLoginAt: data.last_login_at,
      updatedAt: data.updated_at,
    };
  }
}

export const authService = new AuthService();
