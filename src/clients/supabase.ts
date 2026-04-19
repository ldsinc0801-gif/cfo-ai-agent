import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let supabase: SupabaseClient | null = null;
let supabaseAdmin: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    // service_role key を優先使用（RLSバイパス、サーバーサイド専用）
    // anon key はフォールバック（RLS有効時は制限あり）
    const key = config.supabase.serviceRoleKey || config.supabase.anonKey;
    if (!config.supabase.url || !key) {
      throw new Error('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY（または SUPABASE_ANON_KEY）を .env に設定してください');
    }
    supabase = createClient(config.supabase.url, key);
    logger.info(`Supabaseクライアントを初期化しました (${config.supabase.serviceRoleKey ? 'service_role' : 'anon'})`);
  }
  return supabase;
}

/** Storage操作用のservice_roleクライアント（RLSバイパス） */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseAdmin && config.supabase.url && config.supabase.serviceRoleKey) {
    supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey);
  }
  return supabaseAdmin;
}

export function isSupabaseAvailable(): boolean {
  return !!(config.supabase.url && (config.supabase.serviceRoleKey || config.supabase.anonKey));
}

export function isStorageAvailable(): boolean {
  return !!(config.supabase.url && config.supabase.serviceRoleKey);
}
