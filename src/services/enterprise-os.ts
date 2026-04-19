/**
 * 企業AI OS ナレッジサービス
 *
 * テナント別にナレッジをSupabase (enterprise_knowledge テーブル) に保存・取得する。
 * 各AIエージェントのシステムプロンプトに動的挿入される。
 */

import { getSupabase } from '../clients/supabase.js';
import { isSupabaseAvailable } from '../clients/supabase.js';
import { logger } from '../utils/logger.js';
import type { TenantId } from '../types/auth.js';

export interface KnowledgeEntry {
  id: string;
  tenantId: string;
  category: string;
  title: string;
  content: string;
  keyPoints: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 利用可能なカテゴリ */
const CATEGORIES: Record<string, string> = {
  '企業基盤': '01_企業基盤',
  '事業・サービス': '02_事業・サービス',
  '顧客情報': '03_顧客情報',
  '業務プロセス': '04_業務プロセス',
  'ナレッジ': '05_ナレッジ',
  'マーケティング': '06_マーケティング',
  '営業': '07_営業',
  'バックオフィス': '08_バックオフィス',
  '成功事例': '09_成功事例',
  'AIエージェント': '10_AIエージェント',
};

/** 利用可能なカテゴリ名一覧 */
export function getAvailableCategories(): string[] {
  return Object.keys(CATEGORIES);
}

/** カテゴリ名をID（01_企業基盤 等）に変換 */
function categoryToId(category: string): string {
  return CATEGORIES[category] || category;
}

/** テナントの全ナレッジを取得 */
export async function loadAllKnowledge(tenantId: TenantId): Promise<KnowledgeEntry[]> {
  if (!isSupabaseAvailable()) return [];
  try {
    const { data, error } = await getSupabase()
      .from('enterprise_knowledge')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('category')
      .order('title');
    if (error) throw error;
    return (data || []).map(mapEntry);
  } catch (e) {
    logger.warn('ナレッジ取得失敗:', e instanceof Error ? e.message : e);
    return [];
  }
}

/** ナレッジを保存（UPSERT） */
export async function saveKnowledge(
  tenantId: TenantId,
  category: string,
  fileName: string,
  content: string,
): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseAvailable()) {
    return { success: false, message: 'Supabase未接続' };
  }

  const catId = categoryToId(category);
  const title = fileName.replace(/[/\\:*?"<>|]/g, '_');

  try {
    // 既存エントリを確認
    const { data: existing } = await getSupabase()
      .from('enterprise_knowledge')
      .select('id, content')
      .eq('tenant_id', tenantId)
      .eq('category', catId)
      .eq('title', title)
      .single();

    if (existing) {
      // 追記
      const updated = existing.content + '\n・ ' + content;
      await getSupabase()
        .from('enterprise_knowledge')
        .update({
          content: updated,
          key_points: content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      logger.info(`ナレッジ追記: ${catId}/${title} (tenant: ${tenantId})`);
    } else {
      // 新規
      await getSupabase()
        .from('enterprise_knowledge')
        .insert({
          tenant_id: tenantId,
          category: catId,
          title,
          content: '・ ' + content,
          key_points: content,
        });
      logger.info(`ナレッジ新規作成: ${catId}/${title} (tenant: ${tenantId})`);
    }

    return { success: true, message: `${catId}/${title} に保存しました` };
  } catch (e: any) {
    logger.error('ナレッジ保存失敗:', e.message);
    return { success: false, message: e.message };
  }
}

/** AIプロンプト用に全ナレッジをテキスト化 */
export async function buildOSContext(tenantId?: TenantId): Promise<string> {
  if (!tenantId) return '';
  const entries = await loadAllKnowledge(tenantId);
  if (entries.length === 0) return '';

  // カテゴリ別にグループ化
  const grouped = new Map<string, KnowledgeEntry[]>();
  for (const e of entries) {
    const list = grouped.get(e.category) || [];
    list.push(e);
    grouped.set(e.category, list);
  }

  const sections = Array.from(grouped.entries()).map(([cat, items]) => {
    const files = items.map(e => {
      const display = e.keyPoints || e.content.slice(0, 500);
      return `### ${e.title}\n${display}`;
    }).join('\n\n');
    return `## ${cat}\n${files}`;
  }).join('\n\n---\n\n');

  return `# 企業AI OS（企業の第一次情報）\n\n${sections}`;
}

/** カテゴリ一覧の概要（UI表示用） */
export async function getOSSummary(tenantId: TenantId): Promise<Array<{ id: string; name: string; fileCount: number; titles: string[] }>> {
  const entries = await loadAllKnowledge(tenantId);
  const grouped = new Map<string, string[]>();
  for (const e of entries) {
    const list = grouped.get(e.category) || [];
    list.push(e.title);
    grouped.set(e.category, list);
  }
  return Array.from(grouped.entries()).map(([cat, titles]) => ({
    id: cat,
    name: cat.replace(/^\d{2}_/, ''),
    fileCount: titles.length,
    titles,
  }));
}

/** 企業AI OSが利用可能か（Supabase接続済みならtrue） */
export function isEnterpriseOSAvailable(): boolean {
  return isSupabaseAvailable();
}

function mapEntry(data: any): KnowledgeEntry {
  return {
    id: data.id,
    tenantId: data.tenant_id,
    category: data.category,
    title: data.title,
    content: data.content,
    keyPoints: data.key_points,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
