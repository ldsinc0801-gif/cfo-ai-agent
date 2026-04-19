/**
 * 秘書AI 自動請求書生成サービス
 *
 * Googleタスクから「請求書作成」タスクを検知し、
 * 企業AI OSから顧客情報・締め日・事業内容を取得して
 * Excelテンプレートに書き込み→PDF変換を自動実行する。
 */
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { getSupabase } from '../clients/supabase.js';
import { isSupabaseAvailable } from '../clients/supabase.js';
import type { TenantId } from '../types/auth.js';

let _billingTenantId: TenantId | null = null;
export function setBillingTenantId(id: TenantId | null): void { _billingTenantId = id; }
import { googleTasksClient } from '../clients/google-tasks.js';
import { secretaryService } from './secretary-service.js';

// 企業AI OSのパス
const ENTERPRISE_OS_PATH = path.resolve(process.env.ENTERPRISE_OS_PATH || '/Users/kawaguchinaoto/Desktop/企業AI OS/企業AI_OS');

/** 企業AI OSから事業一覧を取得 */
export function getServiceList(): string[] {
  const services = [
    'AIシステム開発',
    'AI研修',
    '財務コンサルティング',
    '経理アウトソーシング',
    'SNS×AI活用支援',
    'Google Workspace業務改善支援',
    '企業AI OS構築支援',
    '業務改善コンサルティング',
    'AIエージェント設計支援',
    '補助金・助成金活用支援',
    '記帳自動化システム構築支援',
    '営業DX支援',
  ];

  // 企業AI OSから動的に読む
  try {
    const filePath = path.join(ENTERPRISE_OS_PATH, '02_事業・サービス', 'サービス一覧.txt');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const matches = content.match(/・(.+)/g);
      if (matches && matches.length > 0) {
        return matches.map(m => m.replace('・', '').trim()).filter(s => s.length > 0);
      }
    }
  } catch { /* fallback */ }

  return services;
}

/** 顧客の締め日・請求日設定 */
export interface CustomerBilling {
  customerName: string;
  closingDay: number;   // 締め日（末日=0, 10日=10, 20日=20 等）
  invoiceDay: number;   // 請求日（末日=0, 10日=10 等）
  dueDateType: string;  // 'end_next' | 'end_same' | '30' | '60'
}

const BILLING_CONFIG_PATH = path.resolve('data/secretary/billing-config.json');

/** 顧客ごとの請求設定を保存 */
export async function saveBillingConfig(configs: CustomerBilling[]): Promise<void> {
  if (isSupabaseAvailable() && _billingTenantId) {
    try {
      // 既存を削除してから再挿入
      await getSupabase().from('billing_configs').delete().eq('tenant_id', _billingTenantId);
      if (configs.length > 0) {
        await getSupabase().from('billing_configs').insert(
          configs.map(c => ({
            tenant_id: _billingTenantId, customer_name: c.customerName,
            closing_day: c.closingDay, invoice_day: c.invoiceDay, due_date_type: c.dueDateType,
          }))
        );
      }
      return;
    } catch (e) { logger.warn('請求設定DB保存失敗:', e); }
  }
}

/** 顧客ごとの請求設定を読込 */
export async function loadBillingConfigs(): Promise<CustomerBilling[]> {
  if (isSupabaseAvailable() && _billingTenantId) {
    try {
      const { data } = await getSupabase().from('billing_configs').select('*').eq('tenant_id', _billingTenantId).order('customer_name');
      return (data || []).map((r: any) => ({
        customerName: r.customer_name, closingDay: r.closing_day, invoiceDay: r.invoice_day, dueDateType: r.due_date_type,
      }));
    } catch (e) { logger.warn('請求設定DB取得失敗:', e); }
  }
  return [];
}

/** 顧客名で設定を検索 */
export function getBillingConfig(customerName: string): CustomerBilling | null {
  const configs = loadBillingConfigs();
  return configs.find(c => customerName.includes(c.customerName) || c.customerName.includes(customerName)) || null;
}

/** 締め日から請求日を計算 */
export function calcInvoiceDateFromConfig(config: CustomerBilling, baseDate?: Date): string {
  const now = baseDate || new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  let day: number;
  if (config.invoiceDay === 0) {
    // 末日
    day = new Date(year, month + 1, 0).getDate();
  } else {
    const lastDay = new Date(year, month + 1, 0).getDate();
    day = Math.min(config.invoiceDay, lastDay);
  }

  return new Date(year, month, day).toISOString().slice(0, 10);
}

/** 支払期限を計算 */
export function calcDueDateFromConfig(invoiceDate: string, config: CustomerBilling): string {
  const inv = new Date(invoiceDate);
  switch (config.dueDateType) {
    case 'end_next':
      return new Date(inv.getFullYear(), inv.getMonth() + 2, 0).toISOString().slice(0, 10);
    case 'end_same':
      return new Date(inv.getFullYear(), inv.getMonth() + 1, 0).toISOString().slice(0, 10);
    case '10_next':
      return new Date(inv.getFullYear(), inv.getMonth() + 1, 10).toISOString().slice(0, 10);
    default: {
      const days = Number(config.dueDateType) || 30;
      const due = new Date(inv);
      due.setDate(due.getDate() + days);
      return due.toISOString().slice(0, 10);
    }
  }
}

/**
 * Googleタスクから「請求書」を含むタスクを検知して自動処理
 */
export async function detectInvoiceTasksFromGoogle(): Promise<{
  tasks: Array<{ title: string; customerName: string; notes?: string }>;
}> {
  try {
    if (!googleTasksClient.isConfigured()) return { tasks: [] };

    const lists = await googleTasksClient.getTaskLists();
    const allTasks: Array<{ title: string; customerName: string; notes?: string }> = [];

    for (const list of lists) {
      const tasks = await googleTasksClient.listTasks(list.id);
      for (const task of tasks) {
        if (task.status === 'completed') continue;
        if (task.title.includes('請求書') || task.title.includes('請求')) {
          // タスク名から顧客名を抽出（例: 「A社 請求書作成」→「A社」）
          const customerName = task.title
            .replace(/請求書作成|請求書|請求|作成|発行/g, '')
            .replace(/[【】\[\]（）()]/g, '')
            .trim();

          if (customerName) {
            allTasks.push({
              title: task.title,
              customerName,
              notes: task.notes,
            });
          }
        }
      }
    }

    return { tasks: allTasks };
  } catch (error) {
    logger.warn('Googleタスク検知エラー:', error instanceof Error ? error.message : error);
    return { tasks: [] };
  }
}
