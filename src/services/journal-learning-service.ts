import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { isSupabaseAvailable, getSupabase } from '../clients/supabase.js';
import type { JournalEntry } from './receipt-service.js';

/** 仕訳修正データ */
export interface JournalCorrection {
  originalDebitAccount: string;
  originalCreditAccount: string;
  correctedDebitAccount: string;
  correctedCreditAccount: string;
  amount: number;
  description: string;
  partnerName: string;
  industry: string;
  reason: string;
}

/** 業種別ルール */
export interface IndustryRule {
  industry: string;
  ruleText: string;
  examples: string[];
  confidence: number;
}

/**
 * 仕訳学習サービス
 *
 * ユーザーの修正フィードバックを蓄積し、
 * 業種別の仕訳パターンを学習してGeminiのプロンプトに反映する。
 */
export class JournalLearningService {

  // ========== 修正の記録 ==========

  /** ユーザーが仕訳を修正した時に呼ぶ */
  async recordCorrection(
    original: JournalEntry,
    corrected: JournalEntry,
    industry: string,
    reason: string = '',
  ): Promise<void> {
    // 変更がなければスキップ
    if (original.debitAccount === corrected.debitAccount &&
        original.creditAccount === corrected.creditAccount) {
      return;
    }

    const correction: JournalCorrection = {
      originalDebitAccount: original.debitAccount,
      originalCreditAccount: original.creditAccount,
      correctedDebitAccount: corrected.debitAccount,
      correctedCreditAccount: corrected.creditAccount,
      amount: corrected.amount,
      description: corrected.description,
      partnerName: corrected.partnerName,
      industry,
      reason,
    };

    if (isSupabaseAvailable()) {
      const { error } = await getSupabase()
        .from('journal_corrections')
        .insert({
          original_debit_account: correction.originalDebitAccount,
          original_credit_account: correction.originalCreditAccount,
          corrected_debit_account: correction.correctedDebitAccount,
          corrected_credit_account: correction.correctedCreditAccount,
          amount: correction.amount,
          description: correction.description,
          partner_name: correction.partnerName,
          industry: correction.industry,
          reason: correction.reason,
        });
      if (error) logger.warn('修正記録の保存に失敗:', error.message);
      else logger.info(`仕訳修正を記録: ${correction.originalDebitAccount} → ${correction.correctedDebitAccount}`);
    }

    // 修正パターンから業種ルールを自動生成
    await this.updateIndustryRule(correction);
  }

  // ========== 業種別ルールの自動生成 ==========

  /** 修正パターンから業種ルールを更新 */
  private async updateIndustryRule(correction: JournalCorrection): Promise<void> {
    if (!isSupabaseAvailable() || !correction.industry) return;

    const ruleText = `「${correction.description || correction.partnerName}」のような取引は「${correction.correctedDebitAccount}」で計上する（「${correction.originalDebitAccount}」ではない）`;
    const example = `${correction.description} ${correction.partnerName} → ${correction.correctedDebitAccount}`;

    // 既存ルールを検索
    const { data: existing } = await getSupabase()
      .from('industry_rules')
      .select('*')
      .eq('industry', correction.industry)
      .eq('rule_text', ruleText)
      .single();

    if (existing) {
      // 既存ルールの信頼度を上げる
      const newExamples = [...(existing.examples || []), example].slice(-10);
      const newConfidence = Math.min(existing.confidence + 0.1, 1.0);
      await getSupabase()
        .from('industry_rules')
        .update({
          examples: newExamples,
          confidence: newConfidence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      // 新規ルール作成
      await getSupabase()
        .from('industry_rules')
        .insert({
          industry: correction.industry,
          rule_text: ruleText,
          examples: [example],
          confidence: 0.3,
          source: 'learned',
        });
    }

    logger.info(`業種ルールを更新: ${correction.industry} - ${ruleText}`);
  }

  // ========== 学習データの取得（プロンプト用） ==========

  /** 業種に基づく学習済みルールをプロンプトテキストとして返す */
  async getLearnedRulesForPrompt(industry: string): Promise<string> {
    if (!isSupabaseAvailable() || !industry) return '';

    // 業種別ルール
    const { data: rules } = await getSupabase()
      .from('industry_rules')
      .select('*')
      .eq('industry', industry)
      .gte('confidence', 0.3)
      .order('confidence', { ascending: false })
      .limit(20);

    if (!rules || rules.length === 0) return '';

    let text = `【${industry}業の学習済み仕訳ルール】\n`;
    text += `以下はユーザーの修正から学習したルールです。これらを優先して適用してください。\n\n`;

    for (const rule of rules) {
      text += `- ${rule.rule_text}（信頼度: ${(rule.confidence * 100).toFixed(0)}%）\n`;
      if (rule.examples && rule.examples.length > 0) {
        text += `  例: ${rule.examples.slice(-3).join('、')}\n`;
      }
    }

    // 頻出の修正パターン
    const { data: corrections } = await getSupabase()
      .from('journal_corrections')
      .select('original_debit_account, corrected_debit_account, count(*)')
      .eq('industry', industry)
      .limit(50);

    if (corrections && corrections.length > 0) {
      // 集計: よくある修正パターン
      const patterns = new Map<string, number>();
      for (const c of corrections) {
        const key = `${c.original_debit_account} → ${c.corrected_debit_account}`;
        patterns.set(key, (patterns.get(key) || 0) + 1);
      }

      const frequent = [...patterns.entries()]
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (frequent.length > 0) {
        text += `\n【よくある修正パターン】\n`;
        for (const [pattern, count] of frequent) {
          text += `- ${pattern}（${count}回修正）\n`;
        }
      }
    }

    return text;
  }

  /** 全業種の修正統計を取得 */
  async getCorrectionStats(): Promise<{ total: number; byIndustry: Record<string, number> }> {
    if (!isSupabaseAvailable()) return { total: 0, byIndustry: {} };

    const { data, error } = await getSupabase()
      .from('journal_corrections')
      .select('industry');

    if (error || !data) return { total: 0, byIndustry: {} };

    const byIndustry: Record<string, number> = {};
    for (const row of data) {
      const ind = row.industry || '未設定';
      byIndustry[ind] = (byIndustry[ind] || 0) + 1;
    }

    return { total: data.length, byIndustry };
  }
}

export const journalLearningService = new JournalLearningService();
