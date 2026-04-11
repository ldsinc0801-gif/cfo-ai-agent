import { getSupabase } from '../clients/supabase.js';
import { logger } from '../utils/logger.js';
import type { MonthlySnapshot, MonthlyTarget } from '../types/trend.js';
import type { ChatMessage, CompanyMemory } from '../services/chat-service.js';

/**
 * Supabaseリポジトリ
 *
 * JSONファイル保存の代わりにSupabase(PostgreSQL)を使う。
 * 全てのデータ永続化をここに集約する。
 */

// ========== 月次実績 ==========

export async function upsertMonthlyActual(data: MonthlySnapshot): Promise<void> {
  const { error } = await getSupabase()
    .from('monthly_actuals')
    .upsert({
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
    }, { onConflict: 'year,month' });

  if (error) throw new Error(`月次実績の保存に失敗: ${error.message}`);
  logger.info(`月次実績を保存: ${data.year}年${data.month}月`);
}

export async function getMonthlyActuals(fromYear: number, fromMonth: number, toYear: number, toMonth: number): Promise<MonthlySnapshot[]> {
  const from = fromYear * 100 + fromMonth;
  const to = toYear * 100 + toMonth;

  const { data, error } = await getSupabase()
    .from('monthly_actuals')
    .select('*')
    .order('year', { ascending: true })
    .order('month', { ascending: true });

  if (error) throw new Error(`月次実績の取得に失敗: ${error.message}`);

  return (data || [])
    .filter(r => (r.year * 100 + r.month) >= from && (r.year * 100 + r.month) <= to)
    .map(r => ({
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
    }));
}

export async function getAllMonthlyActuals(): Promise<MonthlySnapshot[]> {
  const { data, error } = await getSupabase()
    .from('monthly_actuals')
    .select('*')
    .order('year', { ascending: true })
    .order('month', { ascending: true });

  if (error) throw new Error(`月次実績の取得に失敗: ${error.message}`);

  return (data || []).map(r => ({
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
  }));
}

// ========== 月次計画 ==========

export async function upsertMonthlyTarget(target: MonthlyTarget): Promise<void> {
  const { error } = await getSupabase()
    .from('monthly_targets')
    .upsert({
      year: target.year,
      month: target.month,
      revenue: target.revenue,
      gross_profit: target.grossProfit,
      ordinary_income: target.ordinaryIncome,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'year,month' });

  if (error) throw new Error(`月次計画の保存に失敗: ${error.message}`);
}

export async function getMonthlyTargets(): Promise<MonthlyTarget[]> {
  const { data, error } = await getSupabase()
    .from('monthly_targets')
    .select('*')
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

export async function saveChatMessage(role: string, content: string): Promise<void> {
  const { error } = await getSupabase()
    .from('chat_messages')
    .insert({ role, content });

  if (error) throw new Error(`チャット保存に失敗: ${error.message}`);
}

export async function getChatHistory(limit: number = 50): Promise<ChatMessage[]> {
  const { data, error } = await getSupabase()
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`チャット履歴の取得に失敗: ${error.message}`);

  return (data || []).reverse().map(r => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
    timestamp: r.created_at,
  }));
}

export async function clearChatHistory(): Promise<void> {
  const { error } = await getSupabase()
    .from('chat_messages')
    .delete()
    .neq('id', 0); // 全件削除

  if (error) throw new Error(`チャット履歴の削除に失敗: ${error.message}`);
}

// ========== 会社メモリ ==========

export async function getCompanyMemory(): Promise<CompanyMemory> {
  const { data, error } = await getSupabase()
    .from('company_memory')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return { companyName: '', industry: '', employeeCount: '', fiscalYearEnd: '', notes: [], lastUpdated: '' };
  }

  return {
    companyName: data.company_name || '',
    industry: data.industry || '',
    employeeCount: data.employee_count || '',
    fiscalYearEnd: data.fiscal_year_end || '',
    notes: data.notes || [],
    lastUpdated: data.updated_at || '',
  };
}

export async function saveCompanyMemory(memory: CompanyMemory): Promise<void> {
  const { error } = await getSupabase()
    .from('company_memory')
    .upsert({
      id: 1,
      company_name: memory.companyName,
      industry: memory.industry,
      employee_count: memory.employeeCount,
      fiscal_year_end: memory.fiscalYearEnd,
      notes: memory.notes,
      updated_at: new Date().toISOString(),
    });

  if (error) throw new Error(`会社メモリの保存に失敗: ${error.message}`);
}

// ========== 分析結果 ==========

export async function savePlanAnalysis(id: string, variances: any, analysis: any): Promise<void> {
  const { error } = await getSupabase()
    .from('plan_analyses')
    .upsert({ id, variances, analysis });

  if (error) throw new Error(`分析結果の保存に失敗: ${error.message}`);
}

export async function getPlanAnalyses(): Promise<any[]> {
  const { data, error } = await getSupabase()
    .from('plan_analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw new Error(`分析履歴の取得に失敗: ${error.message}`);
  return data || [];
}

// ========== ユーザー管理 ==========

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  created_at: string;
  last_login_at: string;
}

export async function upsertUser(email: string, name: string, picture: string): Promise<UserRecord> {
  const { data, error } = await getSupabase()
    .from('users')
    .upsert({
      email,
      name,
      picture,
      last_login_at: new Date().toISOString(),
    }, { onConflict: 'email' })
    .select()
    .single();

  if (error) throw new Error(`ユーザーの保存に失敗: ${error.message}`);
  logger.info(`ユーザーを保存: ${email}`);
  return data;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
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
