/**
 * OAuthトークン管理サービス（テナント分離）
 * freee / Google のトークンをSupabase tenant_oauth_tokens テーブルに保存
 */

import { getSupabase } from '../clients/supabase.js';
import { isSupabaseAvailable } from '../clients/supabase.js';
import { logger } from '../utils/logger.js';
import type { TenantId } from '../types/auth.js';

export type OAuthProvider = 'freee' | 'google';

export interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  tokenExpiry?: string;
  extra?: Record<string, any>; // freee: { company_id, company_name }
}

/** テナントのOAuthトークンを取得 */
export async function getOAuthToken(tenantId: TenantId, provider: OAuthProvider): Promise<OAuthToken | null> {
  if (!isSupabaseAvailable()) return null;
  try {
    const { data, error } = await getSupabase()
      .from('tenant_oauth_tokens')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', provider)
      .single();
    if (error || !data) return null;
    return {
      accessToken: data.access_token || '',
      refreshToken: data.refresh_token || '',
      tokenExpiry: data.token_expiry || undefined,
      extra: data.extra || {},
    };
  } catch {
    return null;
  }
}

/** テナントのOAuthトークンを保存（UPSERT） */
export async function saveOAuthToken(tenantId: TenantId, provider: OAuthProvider, token: OAuthToken): Promise<void> {
  if (!isSupabaseAvailable()) return;
  try {
    const { error } = await getSupabase()
      .from('tenant_oauth_tokens')
      .upsert({
        tenant_id: tenantId,
        provider,
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        token_expiry: token.tokenExpiry || null,
        extra: token.extra || {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,provider' });
    if (error) logger.warn(`OAuthトークン保存失敗 (${provider}):`, error.message);
  } catch (e) {
    logger.warn(`OAuthトークン保存失敗 (${provider}):`, e);
  }
}

/**
 * access/refresh トークンだけを更新する（extra=company_id等は保持）。
 * freee 等のリフレッシュトークン・ローテーション時に使う。
 */
export async function updateOAuthTokens(
  tenantId: TenantId,
  provider: OAuthProvider,
  tokens: { accessToken: string; refreshToken: string },
): Promise<void> {
  if (!isSupabaseAvailable()) return;
  try {
    const { error } = await getSupabase()
      .from('tenant_oauth_tokens')
      .update({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('provider', provider);
    if (error) logger.warn(`OAuthトークン更新失敗 (${provider}):`, error.message);
  } catch (e) {
    logger.warn(`OAuthトークン更新失敗 (${provider}):`, e);
  }
}

/** テナントのOAuthトークンを削除（連携解除） */
export async function deleteOAuthToken(tenantId: TenantId, provider: OAuthProvider): Promise<void> {
  if (!isSupabaseAvailable()) return;
  try {
    await getSupabase()
      .from('tenant_oauth_tokens')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('provider', provider);
  } catch (e) {
    logger.warn(`OAuthトークン削除失敗 (${provider}):`, e);
  }
}

/** テナントのOAuthトークンのextraフィールドを更新（company_id等） */
export async function updateOAuthExtra(tenantId: TenantId, provider: OAuthProvider, extra: Record<string, any>): Promise<void> {
  if (!isSupabaseAvailable()) return;
  try {
    const existing = await getOAuthToken(tenantId, provider);
    if (!existing) return;
    await getSupabase()
      .from('tenant_oauth_tokens')
      .update({ extra, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('provider', provider);
  } catch (e) {
    logger.warn(`OAuth extra更新失敗 (${provider}):`, e);
  }
}
