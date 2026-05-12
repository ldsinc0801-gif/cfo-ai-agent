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

// ========== 仕訳バッチ（取り込み履歴） ==========

export interface JournalBatchRow {
  id: string;
  tenantId: string;
  label: string;
  source: string | null;
  entryCount: number;
  totalAmount: number;
  freeeSentAt: string | null;
  createdAt: string;
}

export interface JournalEntryRow {
  id: string;
  batchId: string;
  entryDate: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  taxRate: number;
  taxAmount: number;
  description: string;
  partnerName: string;
  receiptType: string | null;
}

/** バッチを作成し、個別仕訳をまとめて挿入する */
export async function createJournalBatch(
  tenantId: TenantId,
  args: {
    label: string;
    source?: string;
    createdBy?: string;
    entries: Array<{
      date: string; debitAccount: string; creditAccount: string;
      amount: number; taxRate: number; taxAmount: number;
      description: string; partnerName: string; receiptType?: string;
    }>;
  }
): Promise<string> {
  const totalAmount = args.entries.reduce((s, e) => s + (e.amount || 0), 0);
  const supabase = getSupabase();
  const { data: batch, error: batchErr } = await supabase
    .from('journal_batches')
    .insert({
      tenant_id: tenantId,
      label: args.label,
      source: args.source ?? null,
      entry_count: args.entries.length,
      total_amount: totalAmount,
      created_by: args.createdBy ?? null,
    })
    .select()
    .single();
  if (batchErr || !batch) throw new Error(`バッチ作成に失敗: ${batchErr?.message}`);

  const rows = args.entries.map(e => ({
    tenant_id: tenantId,
    batch_id: batch.id,
    entry_date: e.date,
    debit_account: e.debitAccount,
    credit_account: e.creditAccount,
    amount: e.amount,
    tax_rate: e.taxRate,
    tax_amount: e.taxAmount,
    description: e.description,
    partner_name: e.partnerName,
    receipt_type: e.receiptType ?? null,
  }));
  if (rows.length > 0) {
    const { error: entryErr } = await supabase.from('journal_entries').insert(rows);
    if (entryErr) throw new Error(`仕訳保存に失敗: ${entryErr.message}`);
  }
  logger.info(`仕訳バッチ作成: ${args.label} (${args.entries.length}件)`);
  return batch.id;
}

/** テナント内の確定済みバッチを新しい順に取得 */
export async function listJournalBatches(tenantId: TenantId, limit: number = 50): Promise<JournalBatchRow[]> {
  const { data, error } = await getSupabase()
    .from('journal_batches')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`バッチ一覧の取得に失敗: ${error.message}`);
  return (data || []).map((r: any) => ({
    id: r.id, tenantId: r.tenant_id, label: r.label, source: r.source,
    entryCount: r.entry_count, totalAmount: Number(r.total_amount),
    freeeSentAt: r.freee_sent_at, createdAt: r.created_at,
  }));
}

/** バッチを取得（テナント検証込み） */
export async function getJournalBatch(tenantId: TenantId, batchId: string): Promise<JournalBatchRow | null> {
  const { data, error } = await getSupabase()
    .from('journal_batches')
    .select('*')
    .eq('id', batchId)
    .eq('tenant_id', tenantId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`バッチ取得に失敗: ${error.message}`);
  }
  return {
    id: data.id, tenantId: data.tenant_id, label: data.label, source: data.source,
    entryCount: data.entry_count, totalAmount: Number(data.total_amount),
    freeeSentAt: data.freee_sent_at, createdAt: data.created_at,
  };
}

/** バッチ内の仕訳一覧 */
export async function getJournalEntries(tenantId: TenantId, batchId: string): Promise<JournalEntryRow[]> {
  const { data, error } = await getSupabase()
    .from('journal_entries')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('batch_id', batchId)
    .order('entry_date', { ascending: true });
  if (error) throw new Error(`仕訳取得に失敗: ${error.message}`);
  return (data || []).map((r: any) => ({
    id: r.id, batchId: r.batch_id, entryDate: r.entry_date,
    debitAccount: r.debit_account, creditAccount: r.credit_account,
    amount: Number(r.amount), taxRate: r.tax_rate, taxAmount: Number(r.tax_amount),
    description: r.description, partnerName: r.partner_name, receiptType: r.receipt_type,
  }));
}

/** バッチの仕訳を一括置換（更新画面で「保存」を押した時用） */
export async function replaceJournalEntries(
  tenantId: TenantId,
  batchId: string,
  entries: Array<{
    date: string; debitAccount: string; creditAccount: string;
    amount: number; taxRate: number; taxAmount: number;
    description: string; partnerName: string; receiptType?: string;
  }>
): Promise<void> {
  const supabase = getSupabase();
  // 既存を削除
  const { error: delErr } = await supabase
    .from('journal_entries')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('batch_id', batchId);
  if (delErr) throw new Error(`既存仕訳の削除に失敗: ${delErr.message}`);

  // 新規挿入
  if (entries.length > 0) {
    const rows = entries.map(e => ({
      tenant_id: tenantId,
      batch_id: batchId,
      entry_date: e.date,
      debit_account: e.debitAccount,
      credit_account: e.creditAccount,
      amount: e.amount,
      tax_rate: e.taxRate,
      tax_amount: e.taxAmount,
      description: e.description,
      partner_name: e.partnerName,
      receipt_type: e.receiptType ?? null,
    }));
    const { error: insErr } = await supabase.from('journal_entries').insert(rows);
    if (insErr) throw new Error(`仕訳の再挿入に失敗: ${insErr.message}`);
  }

  // バッチのメタデータ更新
  const totalAmount = entries.reduce((s, e) => s + (e.amount || 0), 0);
  await supabase
    .from('journal_batches')
    .update({ entry_count: entries.length, total_amount: totalAmount, updated_at: new Date().toISOString() })
    .eq('id', batchId)
    .eq('tenant_id', tenantId);
}

/** バッチごと削除（journal_entries は ON DELETE CASCADE で自動削除） */
export async function deleteJournalBatch(tenantId: TenantId, batchId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('journal_batches')
    .delete()
    .eq('id', batchId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`バッチ削除に失敗: ${error.message}`);
  logger.info(`仕訳バッチ削除: ${batchId}`);
}

// ========== テナント設定 ==========

/** テナントの決算月（1-12）を取得。未設定なら null。 */
export async function getTenantFiscalMonth(tenantId: TenantId): Promise<number | null> {
  const { data, error } = await getSupabase()
    .from('tenants')
    .select('fiscal_year_end_month')
    .eq('id', tenantId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`決算月の取得に失敗: ${error.message}`);
  }
  return data?.fiscal_year_end_month ?? null;
}

/** テナントの決算月（1-12）を設定。null で解除。 */
export async function setTenantFiscalMonth(tenantId: TenantId, month: number | null): Promise<void> {
  if (month !== null && (month < 1 || month > 12)) {
    throw new Error('決算月は1-12で指定してください');
  }
  const { error } = await getSupabase()
    .from('tenants')
    .update({ fiscal_year_end_month: month, updated_at: new Date().toISOString() })
    .eq('id', tenantId);
  if (error) throw new Error(`決算月の保存に失敗: ${error.message}`);
  logger.info(`決算月を設定: ${tenantId} → ${month ?? '解除'}`);
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

export async function saveChatMessage(tenantId: TenantId, role: string, content: string, userId?: string): Promise<void> {
  const { error } = await getSupabase()
    .from('chat_messages')
    .insert({ tenant_id: tenantId, role, content, user_id: userId || null });

  if (error) throw new Error(`チャット保存に失敗: ${error.message}`);
}

export async function getChatHistory(tenantId: TenantId, limit: number = 50, userId?: string): Promise<ChatMessage[]> {
  let query = getSupabase()
    .from('chat_messages')
    .select('*')
    .eq('tenant_id', tenantId);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`チャット履歴の取得に失敗: ${error.message}`);

  return (data || []).reverse().map(r => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
    timestamp: r.created_at,
  }));
}

export async function clearChatHistory(tenantId: TenantId, userId?: string): Promise<void> {
  let query = getSupabase()
    .from('chat_messages')
    .delete()
    .eq('tenant_id', tenantId);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;

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
