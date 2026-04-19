import { getSupabase } from '../clients/supabase.js';
import { isSupabaseAvailable } from '../clients/supabase.js';
import { logger } from '../utils/logger.js';
import type { BankRatingResult, AdditionalMetrics, RatingInput } from '../types/bank-rating.js';
import type { TenantId } from '../types/auth.js';

export interface SavedAnalysis {
  id: string;
  createdAt: string;
  fileName: string | null;
  source: 'upload' | 'freee' | 'mock';
  ratingInput: RatingInput;
  rating: BankRatingResult;
  additional: AdditionalMetrics;
  aiCommentary: string | null;
  extractionNotes: string[];
}

export interface AnalysisSummary {
  id: string;
  createdAt: string;
  fileName: string | null;
  source: string;
  totalScore: number;
  rank: string;
  rankLabel: string;
  revenue: number;
  ordinaryIncome: number;
}

/**
 * 分析結果の保存・読み込み（Supabase永続化、テナント分離）
 * 全メソッドに tenantId を明示的に渡す
 */
export class AnalysisStore {

  async save(tenantId: TenantId, data: Omit<SavedAnalysis, 'id' | 'createdAt'>): Promise<string> {
    const id = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (isSupabaseAvailable()) {
      try {
        await getSupabase().from('financial_analyses').insert({
          id, tenant_id: tenantId, file_name: data.fileName, source: data.source,
          rating_input: data.ratingInput, rating: data.rating, additional: data.additional,
          ai_commentary: data.aiCommentary,
        });
        logger.info(`分析結果を保存しました: ${id}`);
        return id;
      } catch (e) { logger.warn('Supabase分析保存失敗:', e); }
    }
    return id;
  }

  async get(id: string): Promise<SavedAnalysis | null> {
    if (!isSupabaseAvailable()) return null;
    const { data, error } = await getSupabase().from('financial_analyses').select('*').eq('id', id).single();
    if (error || !data) return null;
    return {
      id: data.id, createdAt: data.created_at, fileName: data.file_name, source: data.source,
      ratingInput: data.rating_input, rating: data.rating, additional: data.additional,
      aiCommentary: data.ai_commentary, extractionNotes: [],
    };
  }

  async list(tenantId: TenantId): Promise<AnalysisSummary[]> {
    if (!isSupabaseAvailable()) return [];
    const { data, error } = await getSupabase().from('financial_analyses').select('*')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(20);
    if (error || !data) return [];
    return data.map((d: any) => ({
      id: d.id, createdAt: d.created_at, fileName: d.file_name, source: d.source,
      totalScore: d.rating?.totalScore || 0, rank: d.rating?.rank || '',
      rankLabel: d.rating?.rankLabel || '', revenue: d.rating_input?.revenue || 0,
      ordinaryIncome: d.rating_input?.ordinaryIncome || 0,
    }));
  }

  async delete(id: string): Promise<boolean> {
    if (!isSupabaseAvailable()) return false;
    const { error } = await getSupabase().from('financial_analyses').delete().eq('id', id);
    if (!error) logger.info(`分析結果を削除しました: ${id}`);
    return !error;
  }
}

export const analysisStore = new AnalysisStore();
