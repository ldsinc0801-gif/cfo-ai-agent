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
  const row: Record<string, unknown> = {
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
    interest_bearing_debt: data.interestBearingDebt ?? 0,
    opening_interest_bearing_debt: data.openingInterestBearingDebt ?? null,
    accounts_receivable: data.accountsReceivable ?? null,
    inventory: data.inventory ?? null,
    accounts_payable: data.accountsPayable ?? null,
    net_income: data.netIncome ?? 0,
    depreciation: data.depreciation ?? 0,
    interest_expense: data.interestExpense ?? 0,
  };
  // 年間返済元本は「明示的に指定された時だけ」書き込む。未指定(決算書の再取込等)は
  // 既存値を保持し、返済計画表で入れた手入力値が消えないようにする。
  if (data.annualDebtRepayment !== undefined) row.annual_debt_repayment = data.annualDebtRepayment;

  const { error } = await getSupabase()
    .from('monthly_actuals')
    .upsert(row, { onConflict: 'tenant_id,year,month' });

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
    interestBearingDebt: r.interest_bearing_debt ?? 0,
    openingInterestBearingDebt: r.opening_interest_bearing_debt ?? null,
    accountsReceivable: r.accounts_receivable ?? null,
    inventory: r.inventory ?? null,
    accountsPayable: r.accounts_payable ?? null,
    netIncome: r.net_income ?? 0,
    depreciation: r.depreciation ?? 0,
    interestExpense: r.interest_expense ?? 0,
    annualDebtRepayment: r.annual_debt_repayment ?? null,
  };
}

// ========== 仕訳ルール（テナント固有） ==========

export interface JournalRule {
  id: string;
  ruleText: string;
  tags: string[];
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
}

export async function listJournalRules(tenantId: TenantId): Promise<JournalRule[]> {
  const { data, error } = await getSupabase()
    .from('journal_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw new Error(`仕訳ルールの取得に失敗: ${error.message}`);
  return (data || []).map((r: any) => ({
    id: r.id,
    ruleText: r.rule_text,
    tags: r.tags || [],
    enabled: !!r.enabled,
    sortOrder: r.sort_order || 0,
    createdAt: r.created_at,
  }));
}

export async function createJournalRule(tenantId: TenantId, args: { ruleText: string; tags: string[] }): Promise<string> {
  const { data, error } = await getSupabase()
    .from('journal_rules')
    .insert({
      tenant_id: tenantId,
      rule_text: args.ruleText,
      tags: args.tags || [],
    })
    .select()
    .single();
  if (error || !data) throw new Error(`仕訳ルールの作成に失敗: ${error?.message}`);
  return data.id;
}

export async function updateJournalRule(tenantId: TenantId, ruleId: string, args: { ruleText?: string; tags?: string[]; enabled?: boolean }): Promise<void> {
  const update: any = { updated_at: new Date().toISOString() };
  if (args.ruleText !== undefined) update.rule_text = args.ruleText;
  if (args.tags !== undefined) update.tags = args.tags;
  if (args.enabled !== undefined) update.enabled = args.enabled;
  const { error } = await getSupabase()
    .from('journal_rules')
    .update(update)
    .eq('id', ruleId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`仕訳ルールの更新に失敗: ${error.message}`);
}

export async function deleteJournalRule(tenantId: TenantId, ruleId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('journal_rules')
    .delete()
    .eq('id', ruleId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`仕訳ルールの削除に失敗: ${error.message}`);
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
  freeeSkipCount: number;
  createdAt: string;
}

export interface JournalEntryRow {
  id: string;
  batchId: string;
  entryDate: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  taxCategory: string | null;
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
      amount: number; taxCategory?: string; taxRate: number; taxAmount: number;
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
    tax_category: e.taxCategory ?? null,
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
    freeeSentAt: r.freee_sent_at, freeeSkipCount: r.freee_skip_count || 0,
    createdAt: r.created_at,
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
    freeeSentAt: data.freee_sent_at, freeeSkipCount: data.freee_skip_count || 0,
    createdAt: data.created_at,
  };
}

/** バッチのfreee送信完了をマーク（送信日時とスキップ件数を保存） */
export async function markBatchFreeeSent(tenantId: TenantId, batchId: string, skipCount: number = 0): Promise<void> {
  const { error } = await getSupabase()
    .from('journal_batches')
    .update({
      freee_sent_at: new Date().toISOString(),
      freee_skip_count: skipCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`freee送信日時の保存に失敗: ${error.message}`);
  logger.info(`バッチ ${batchId} を freee送信済みに設定（スキップ${skipCount}件）`);
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
    amount: Number(r.amount), taxCategory: r.tax_category,
    taxRate: r.tax_rate, taxAmount: Number(r.tax_amount),
    description: r.description, partnerName: r.partner_name, receiptType: r.receipt_type,
  }));
}

/** バッチの仕訳を一括置換（更新画面で「保存」を押した時用） */
export async function replaceJournalEntries(
  tenantId: TenantId,
  batchId: string,
  entries: Array<{
    date: string; debitAccount: string; creditAccount: string;
    amount: number; taxCategory?: string; taxRate: number; taxAmount: number;
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
      tax_category: e.taxCategory ?? null,
      tax_rate: e.taxRate,
      tax_amount: e.taxAmount,
      description: e.description,
      partner_name: e.partnerName,
      receiptType: e.receiptType ?? null,
    }));
    // typo修正: receiptType → receipt_type
    rows.forEach((r: any) => { r.receipt_type = r.receiptType; delete r.receiptType; });
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

// ========== テナント会社情報 ==========

export interface TenantProfile {
  companyName: string | null;
  postalCode: string | null;
  address: string | null;
  phone: string | null;
  representative: string | null;
  establishedDate: string | null; // YYYY-MM-DD
  corporateNumber: string | null;
  invoiceRegistered: boolean;
  invoiceNumber: string | null;
  invoiceRegisteredDate: string | null; // インボイス登録年月日 YYYY-MM-DD
  capital: number | null;               // 資本金
  industry: string | null;
  employeeCount: string | null;
  notes: string | null;
  // ロカベン6指標で選択した業種・規模（保存して次回復元）。会社情報フォームでは扱わないため任意。
  locabenMajor?: string | null;
  locabenMinor?: string | null;
  locabenScale?: string | null;
}

const EMPTY_PROFILE: TenantProfile = {
  companyName: null, postalCode: null, address: null, phone: null,
  representative: null, establishedDate: null, corporateNumber: null,
  invoiceRegistered: false, invoiceNumber: null, invoiceRegisteredDate: null,
  capital: null, industry: null,
  employeeCount: null, notes: null,
  locabenMajor: null, locabenMinor: null, locabenScale: null,
};

/** テナントの会社情報を取得（未登録なら全項目 null のオブジェクト） */
export async function getTenantProfile(tenantId: TenantId): Promise<TenantProfile> {
  const { data, error } = await getSupabase()
    .from('tenant_profile')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return { ...EMPTY_PROFILE };
    throw new Error(`会社情報の取得に失敗: ${error.message}`);
  }
  return {
    companyName: data.company_name,
    postalCode: data.postal_code,
    address: data.address,
    phone: data.phone,
    representative: data.representative,
    establishedDate: data.established_date,
    corporateNumber: data.corporate_number,
    invoiceRegistered: !!data.invoice_registered,
    invoiceNumber: data.invoice_number,
    invoiceRegisteredDate: data.invoice_registered_date,
    capital: data.capital ?? null,
    industry: data.industry,
    employeeCount: data.employee_count,
    notes: data.notes,
    locabenMajor: data.locaben_major ?? null,
    locabenMinor: data.locaben_minor ?? null,
    locabenScale: data.locaben_scale ?? null,
  };
}

/** テナントの年間KPI目標(JSON)を取得。未設定なら null。 */
export async function getTenantAnnualKpi(tenantId: TenantId): Promise<Record<string, unknown> | null> {
  const { data, error } = await getSupabase()
    .from('tenant_profile')
    .select('annual_kpi')
    .eq('tenant_id', tenantId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`年間KPIの取得に失敗: ${error.message}`);
  }
  return (data?.annual_kpi as Record<string, unknown>) ?? null;
}

/** テナントの年間KPI目標(JSON)を保存（他の会社情報は変更しない）。 */
export async function saveTenantAnnualKpi(tenantId: TenantId, kpi: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabase()
    .from('tenant_profile')
    .upsert({ tenant_id: tenantId, annual_kpi: kpi, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
  if (error) throw new Error(`年間KPIの保存に失敗: ${error.message}`);
}

// 年間決算書（期間残高）は tenant_profile.sga_breakdown 列に
// { "<期末年>": AnnualStatement, ... } の形で保存する（migration-025 で追加した jsonb 列を流用）。
type AnnualStatementMap = Record<string, import('../types/trend.js').AnnualStatement>;

async function getAnnualStatementMap(tenantId: TenantId): Promise<AnnualStatementMap | null> {
  const { data, error } = await getSupabase()
    .from('tenant_profile')
    .select('sga_breakdown')
    .eq('tenant_id', tenantId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`年間決算書の取得に失敗: ${error.message}`);
  }
  return (data?.sga_breakdown as AnnualStatementMap) ?? null;
}

/** 年間決算書（期間残高）を会計年度指定で取得。無ければ null。 */
export async function getAnnualStatement(
  tenantId: TenantId,
  fiscalYear: number,
): Promise<import('../types/trend.js').AnnualStatement | null> {
  const map = await getAnnualStatementMap(tenantId);
  return map?.[String(fiscalYear)] ?? null;
}

/** 保存済みの全会計年度の年間決算書を返す（前年比較用）。 */
export async function listAnnualStatements(
  tenantId: TenantId,
): Promise<import('../types/trend.js').AnnualStatement[]> {
  const map = await getAnnualStatementMap(tenantId);
  if (!map) return [];
  return Object.values(map).sort((a, b) => a.fiscalYearEndYear - b.fiscalYearEndYear);
}

/** 年間決算書（期間残高）を会計年度単位で保存（他の年度・会社情報は変更しない）。 */
export async function saveAnnualStatement(
  tenantId: TenantId,
  statement: import('../types/trend.js').AnnualStatement,
): Promise<void> {
  const map = (await getAnnualStatementMap(tenantId)) ?? {};
  map[String(statement.fiscalYearEndYear)] = statement;
  const { error } = await getSupabase()
    .from('tenant_profile')
    .upsert({ tenant_id: tenantId, sga_breakdown: map, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
  if (error) throw new Error(`年間決算書の保存に失敗: ${error.message}`);
  logger.info(`年間決算書を保存: ${statement.fiscalYearEndYear}年度 (販管費内訳${statement.sgaBreakdown.length}科目)`);
}

/** ロカベン6指標で選んだ業種・規模だけを保存（他の会社情報は変更しない）。 */
export async function updateLocabenSelection(
  tenantId: TenantId,
  sel: { major: string | null; minor: string | null; scale: string | null },
): Promise<void> {
  const { error } = await getSupabase()
    .from('tenant_profile')
    .upsert({
      tenant_id: tenantId,
      locaben_major: sel.major,
      locaben_minor: sel.minor,
      locaben_scale: sel.scale,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });
  if (error) throw new Error(`ロカベン選択の保存に失敗: ${error.message}`);
}

export async function upsertTenantProfile(tenantId: TenantId, p: TenantProfile): Promise<void> {
  const { error } = await getSupabase()
    .from('tenant_profile')
    .upsert({
      tenant_id: tenantId,
      company_name: p.companyName,
      postal_code: p.postalCode,
      address: p.address,
      phone: p.phone,
      representative: p.representative,
      established_date: p.establishedDate,
      corporate_number: p.corporateNumber,
      invoice_registered: p.invoiceRegistered,
      invoice_number: p.invoiceNumber,
      invoice_registered_date: p.invoiceRegisteredDate,
      capital: p.capital,
      industry: p.industry,
      employee_count: p.employeeCount,
      notes: p.notes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });
  if (error) throw new Error(`会社情報の保存に失敗: ${error.message}`);
  logger.info(`会社情報を更新: ${tenantId}`);
}

// ========== 借入明細（借入先ごとの内訳） ==========

export interface LoanDetail {
  id: string;
  lender: string;              // 借入先（例: 熊本銀行, 日本政策金融公庫）
  annualRepayment: number;     // 年間返済元本
  balance: number | null;      // 借入残高
  interest: number | null;     // 年間支払利息
  note: string | null;
}

export async function listLoanDetails(tenantId: TenantId): Promise<LoanDetail[]> {
  const { data, error } = await getSupabase()
    .from('loan_details')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`借入明細の取得に失敗: ${error.message}`);
  return (data || []).map((r: any) => ({
    id: r.id,
    lender: r.lender ?? '借入先',
    annualRepayment: Number(r.annual_repayment ?? 0),
    balance: r.balance == null ? null : Number(r.balance),
    interest: r.interest == null ? null : Number(r.interest),
    note: r.note ?? null,
  }));
}

export async function addLoanDetail(tenantId: TenantId, d: Omit<LoanDetail, 'id'>): Promise<void> {
  const { error } = await getSupabase().from('loan_details').insert({
    tenant_id: tenantId,
    lender: d.lender || '借入先',
    annual_repayment: d.annualRepayment ?? 0,
    balance: d.balance,
    interest: d.interest,
    note: d.note,
  });
  if (error) throw new Error(`借入明細の追加に失敗: ${error.message}`);
}

export async function deleteLoanDetail(tenantId: TenantId, id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('loan_details').delete().eq('tenant_id', tenantId).eq('id', id);
  if (error) throw new Error(`借入明細の削除に失敗: ${error.message}`);
}

export async function clearLoanDetails(tenantId: TenantId): Promise<void> {
  const { error } = await getSupabase()
    .from('loan_details').delete().eq('tenant_id', tenantId);
  if (error) throw new Error(`借入明細のリセットに失敗: ${error.message}`);
}

// ========== 固定資産明細（資産ごとの内訳） ==========

export interface FixedAssetDetail {
  id: string;
  name: string;                 // 資産名（例: 車両運搬具, 工具器具備品）
  acquisitionCost: number | null; // 取得価額
  depreciation: number | null;    // 当期減価償却費
  bookValue: number | null;       // 期末簿価（残存価格）
  note: string | null;
}

export async function listFixedAssetDetails(tenantId: TenantId): Promise<FixedAssetDetail[]> {
  const { data, error } = await getSupabase()
    .from('fixed_asset_details')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('book_value', { ascending: false });
  if (error) throw new Error(`固定資産明細の取得に失敗: ${error.message}`);
  return (data || []).map((r: any) => ({
    id: r.id,
    name: r.name ?? '資産',
    acquisitionCost: r.acquisition_cost == null ? null : Number(r.acquisition_cost),
    depreciation: r.depreciation == null ? null : Number(r.depreciation),
    bookValue: r.book_value == null ? null : Number(r.book_value),
    note: r.note ?? null,
  }));
}

/** 固定資産台帳は全資産の一覧なので、取込時は全消去→全挿入で置き換える。 */
export async function replaceFixedAssetDetails(tenantId: TenantId, items: Omit<FixedAssetDetail, 'id'>[]): Promise<void> {
  await clearFixedAssetDetails(tenantId);
  if (!items.length) return;
  const rows = items.map((a) => ({
    tenant_id: tenantId,
    name: a.name || '資産',
    acquisition_cost: a.acquisitionCost,
    depreciation: a.depreciation,
    book_value: a.bookValue,
    note: a.note,
  }));
  const { error } = await getSupabase().from('fixed_asset_details').insert(rows);
  if (error) throw new Error(`固定資産明細の保存に失敗: ${error.message}`);
}

export async function deleteFixedAssetDetail(tenantId: TenantId, id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('fixed_asset_details').delete().eq('tenant_id', tenantId).eq('id', id);
  if (error) throw new Error(`固定資産明細の削除に失敗: ${error.message}`);
}

export async function clearFixedAssetDetails(tenantId: TenantId): Promise<void> {
  const { error } = await getSupabase()
    .from('fixed_asset_details').delete().eq('tenant_id', tenantId);
  if (error) throw new Error(`固定資産明細のリセットに失敗: ${error.message}`);
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

/** テナントの「現在選択中の会計年度（決算月期末年）」を取得。未設定なら null。 */
export async function getTenantActiveFiscalYear(tenantId: TenantId): Promise<number | null> {
  const { data, error } = await getSupabase()
    .from('tenants')
    .select('active_fiscal_year')
    .eq('id', tenantId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`会計年度の取得に失敗: ${error.message}`);
  }
  return data?.active_fiscal_year ?? null;
}

/** テナントの選択中会計年度を保存（null で解除）。 */
export async function setTenantActiveFiscalYear(tenantId: TenantId, year: number | null): Promise<void> {
  const { error } = await getSupabase()
    .from('tenants')
    .update({ active_fiscal_year: year, updated_at: new Date().toISOString() })
    .eq('id', tenantId);
  if (error) throw new Error(`会計年度の保存に失敗: ${error.message}`);
  logger.info(`会計年度を保存: ${tenantId} → ${year ?? '解除'}`);
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
