import { getSupabase } from '../clients/supabase.js';
import { logger } from '../utils/logger.js';
import type { MonthlySnapshot, MonthlyTarget } from '../types/trend.js';
import type { ChatMessage, CompanyMemory } from '../services/chat-service.js';
import type { TenantId } from '../types/auth.js';

/**
 * Supabaseリポジトリ
 *
 * 全クエリに TenantId を必須パラメータとして要求する。
 * TenantId は Branded Type であり、素の string を渡すとコンパイルエラーになる。
 */

// ========== 月次実績 ==========

export async function upsertMonthlyActual(tenantId: TenantId, data: MonthlySnapshot): Promise<void> {
  const { error } = await getSupabase()
    .from('monthly_actuals')
    .upsert({
      tenant_id: tenantId,
      year: data.year,
      month: data.month,
      revenue: data.revenue,
      cost_of_sales: data.costOfSales,
      gross_profit: data.grossProfit,
      sga_expenses: data.sgaExpenses,
      operating_income: data.operatingIncome,
      ordinary_income: data.ordinaryIncome,
      cash_and_deposits: data.cashAndDeposits,
      current_assets: data.currentAssets,
      current_liabilities: data.currentLiabilities,
      total_assets: data.totalAssets,
      net_assets: data.netAssets,
    }, { onConflict: 'tenant_id,year,month' });

  if (error) throw new Error(`月次実績の保存に失敗: ${error.message}`);
  logger.info(`月次実績を保存: ${data.year}年${data.month}月`);
}

export async function getMonthlyActuals(tenantId: TenantId, fromYear: number, fromMonth: number, toYear: number, toMonth: number): Promise<MonthlySnapshot[]> {
  const from = fromYear * 100 + fromMonth;
  const to = toYear * 100 + toMonth;

  const { data, error } = await getSupabase()
    .from('monthly_actuals')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('year', { ascending: true })
    .order('month', { ascending: true });

  if (error) throw new Error(`月次実績の取得に失敗: ${error.message}`);

  return (data || [])
    .filter(r => (r.year * 100 + r.month) >= from && (r.year * 100 + r.month) <= to)
    .map(mapSnapshot);
}

export async function getAllMonthlyActuals(tenantId: TenantId): Promise<MonthlySnapshot[]> {
  const { data, error } = await getSupabase()
    .from('monthly_actuals')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('year', { ascending: true })
    .order('month', { ascending: true });

  if (error) throw new Error(`月次実績の取得に失敗: ${error.message}`);
  return (data || []).map(mapSnapshot);
}

function mapSnapshot(r: any): MonthlySnapshot {
  return {
    year: r.year,
    month: r.month,
    revenue: r.revenue,
    costOfSales: r.cost_of_sales,
    grossProfit: r.gross_profit,
    sgaExpenses: r.sga_expenses,
    operatingIncome: r.operating_income,
    ordinaryIncome: r.ordinary_income,
    cashAndDeposits: r.cash_and_deposits,
    currentAssets: r.current_assets,
    currentLiabilities: r.current_liabilities,
    totalAssets: r.total_assets,
    netAssets: r.net_assets,
  };
}

// ========== 月次計画 ==========

export async function upsertMonthlyTarget(tenantId: TenantId, target: MonthlyTarget): Promise<void> {
  const { error } = await getSupabase()
    .from('monthly_targets')
    .upsert({
      tenant_id: tenantId,
      year: target.year,
      month: target.month,
      revenue: target.revenue,
      gross_profit: target.grossProfit,
      ordinary_income: target.ordinaryIncome,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,year,month' });

  if (error) throw new Error(`月次計画の保存に失敗: ${error.message}`);
}

export async function getMonthlyTargets(tenantId: TenantId): Promise<MonthlyTarget[]> {
  const { data, error } = await getSupabase()
    .from('monthly_targets')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('year', { ascending: true })
    .order('month', { ascending: true });

  if (error) throw new Error(`月次計画の取得に失敗: ${error.message}`);

  return (data || []).map(r => ({
    year: r.year,
    month: r.month,
    revenue: r.revenue,
    grossProfit: r.gross_profit,
    ordinaryIncome: r.ordinary_income,
  }));
}

// ========== チャット履歴 ==========

export async function saveChatMessage(tenantId: TenantId, role: string, content: string): Promise<void> {
  const { error } = await getSupabase()
    .from('chat_messages')
    .insert({ tenant_id: tenantId, role, content });

  if (error) throw new Error(`チャット保存に失敗: ${error.message}`);
}

export async function getChatHistory(tenantId: TenantId, limit: number = 50): Promise<ChatMessage[]> {
  const { data, error } = await getSupabase()
    .from('chat_messages')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`チャット履歴の取得に失敗: ${error.message}`);

  return (data || []).reverse().map(r => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
    timestamp: r.created_at,
  }));
}

export async function clearChatHistory(tenantId: TenantId): Promise<void> {
  const { error } = await getSupabase()
    .from('chat_messages')
    .delete()
    .eq('tenant_id', tenantId);

  if (error) throw new Error(`チャット履歴の削除に失敗: ${error.message}`);
}

// ========== 会社メモリ ==========

export async function getCompanyMemory(tenantId: TenantId): Promise<CompanyMemory> {
  const { data, error } = await getSupabase()
    .from('company_memory')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  if (error || !data) {
    return { companyName: '', industry: '', employeeCount: '', fiscalYearEnd: '', notes: [], businessDescription: '', strengths: '', challenges: '', keyClients: '', aiNotes: [], lastUpdated: '' };
  }

  return {
    companyName: data.company_name || '',
    industry: data.industry || '',
    employeeCount: data.employee_count || '',
    fiscalYearEnd: data.fiscal_year_end || '',
    notes: data.notes || [],
    businessDescription: data.business_description || '',
    strengths: data.strengths || '',
    challenges: data.challenges || '',
    keyClients: data.key_clients || '',
    aiNotes: data.ai_notes || [],
    lastUpdated: data.updated_at || '',
  };
}

export async function saveCompanyMemory(tenantId: TenantId, memory: CompanyMemory): Promise<void> {
  const { error } = await getSupabase()
    .from('company_memory')
    .upsert({
      tenant_id: tenantId,
      company_name: memory.companyName,
      industry: memory.industry,
      employee_count: memory.employeeCount,
      fiscal_year_end: memory.fiscalYearEnd,
      notes: memory.notes,
      business_description: memory.businessDescription,
      strengths: memory.strengths,
      challenges: memory.challenges,
      key_clients: memory.keyClients,
      ai_notes: memory.aiNotes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });

  if (error) throw new Error(`会社メモリの保存に失敗: ${error.message}`);
}

// ========== 分析結果 ==========

export async function savePlanAnalysis(tenantId: TenantId, id: string, variances: any, analysis: any): Promise<void> {
  const { error } = await getSupabase()
    .from('plan_analyses')
    .upsert({ tenant_id: tenantId, id, variances, analysis });

  if (error) throw new Error(`分析結果の保存に失敗: ${error.message}`);
}

export async function getPlanAnalyses(tenantId: TenantId): Promise<any[]> {
  const { data, error } = await getSupabase()
    .from('plan_analyses')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw new Error(`分析履歴の取得に失敗: ${error.message}`);
  return data || [];
}

// ========== ユーザー管理（tenant_id不要） ==========

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  created_at: string;
  last_login_at: string;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`ユーザーの取得に失敗: ${error.message}`);
  }
  return data;
}

export async function listUsers(): Promise<UserRecord[]> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .order('last_login_at', { ascending: false });

  if (error) throw new Error(`ユーザー一覧の取得に失敗: ${error.message}`);
  return data || [];
}
