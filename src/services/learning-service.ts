import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { usageTracker } from './usage-tracker.js';
import { isSupabaseAvailable } from '../clients/supabase.js';
import { getSupabase } from '../clients/supabase.js';
import * as repo from '../repositories/supabase-repository.js';
import type { TenantId } from '../types/auth.js';
import fs from 'fs';
import path from 'path';

const INSIGHTS_FILE = path.resolve('data/learning-insights.json');

export interface LearningInsight {
  id?: string;
  category: string;       // 'seasonality' | 'bias' | 'pattern' | 'anomaly' | 'general'
  insight: string;         // 学習した知見テキスト
  confidence: number;      // 確信度 0.0〜1.0
  evidence: string;        // 根拠となるデータ概要
  created_at?: string;
  updated_at?: string;
}

export interface LearningResult {
  newInsights: LearningInsight[];
  updatedInsights: LearningInsight[];
  summary: string;
}

/**
 * 学習ループサービス
 *
 * 過去の実績データと予測を比較し、パターンを学習する。
 * 学習結果はSupabase（利用可能な場合）またはJSONファイルに保存する。
 */
class LearningService {
  private ai: any = null;

  constructor() {
    const project = config.ai.gcpProject;
    if (project) {
      import('@google/genai').then(({ GoogleGenAI }) => {
        this.ai = new GoogleGenAI({ vertexai: true, project, location: config.ai.geminiRegion });
        logger.info('学習サービス: Gemini API (2.5 Pro, Vertex AI) を初期化しました');
      }).catch(e => logger.error('Gemini SDK初期化失敗:', e));
    }
  }

  isAvailable(): boolean {
    return this.ai !== null;
  }

  /**
   * 学習サイクルを実行
   *
   * 1. 過去の実績データを取得
   * 2. 過去の分析・予測と実績を比較
   * 3. パターンを抽出
   * 4. 知見を保存
   */
  async runLearningCycle(tenantId?: TenantId): Promise<LearningResult> {
    if (!this.ai) {
      throw new Error('Vertex AI の認証が未設定です');
    }

    logger.info('学習サイクルを開始します...');

    // 1. 過去の実績データを取得
    const actuals = await this.getActualData(tenantId);
    if (actuals.length < 3) {
      return {
        newInsights: [],
        updatedInsights: [],
        summary: '学習に必要なデータが不足しています（最低3か月分の実績データが必要）',
      };
    }

    // 2. 過去の分析履歴を取得
    const pastAnalyses = await this.getPastAnalyses(tenantId);

    // 3. 既存の知見を取得
    const existingInsights = await this.getInsights();

    // 4. Gemini 2.5 Pro でパターン分析
    const analysisPrompt = this.buildAnalysisPrompt(actuals, pastAnalyses, existingInsights);

    const response = await this.ai.models.generateContent({
      model: config.ai.geminiAnalysisModel,
      contents: analysisPrompt,
      config: { maxOutputTokens: 4096 },
    });

    const usage = response.usageMetadata;
    if (usage) {
      usageTracker.record(config.ai.geminiAnalysisModel, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, '学習サイクル(Gemini Pro)');
    }

    const analysisText = response.text || '';

    // 5. 応答をパースして知見を抽出
    const result = this.parseAnalysisResponse(analysisText, existingInsights);

    // 6. 知見を保存
    await this.saveInsights([...existingInsights, ...result.newInsights]);

    logger.info(`学習サイクル完了: 新規知見${result.newInsights.length}件, 更新${result.updatedInsights.length}件`);

    return result;
  }

  /**
   * 保存済みの知見を取得
   */
  async getInsights(): Promise<LearningInsight[]> {
    if (isSupabaseAvailable()) {
      try {
        const { data, error } = await getSupabase()
          .from('learning_insights')
          .select('*')
          .order('confidence', { ascending: false });

        if (!error && data) {
          return data.map(r => ({
            id: r.id,
            category: r.category,
            insight: r.insight,
            confidence: r.confidence,
            evidence: r.evidence,
            created_at: r.created_at,
            updated_at: r.updated_at,
          }));
        }
      } catch (e) {
        logger.warn('Supabase知見取得失敗、ファイルにフォールバック');
      }
    }

    // ファイルフォールバック
    try {
      if (fs.existsSync(INSIGHTS_FILE)) {
        return JSON.parse(fs.readFileSync(INSIGHTS_FILE, 'utf-8'));
      }
    } catch { /* ignore */ }

    return [];
  }

  /**
   * 知見をプロンプト挿入用テキストとして取得
   */
  async getInsightsText(): Promise<string> {
    const insights = await this.getInsights();
    if (insights.length === 0) return '';

    return insights
      .filter(i => i.confidence >= 0.5)
      .map(i => `- [${i.category}] ${i.insight}（確信度: ${(i.confidence * 100).toFixed(0)}%）`)
      .join('\n');
  }

  /**
   * 自動学習を実行すべきか判定し、条件を満たせば非同期で実行する。
   * 条件: APIキー設定済み & 前回実行から7日以上経過 & 実績3ヶ月以上
   */
  async tryAutoLearn(tenantId?: TenantId): Promise<void> {
    if (!this.ai || !tenantId) return;

    try {
      const insights = await this.getInsights();
      const lastUpdate = insights.length > 0
        ? Math.max(...insights.map(i => new Date(i.updated_at || i.created_at || 0).getTime()))
        : 0;
      const daysSinceLast = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);

      if (daysSinceLast < 7) return;

      // 非同期実行（レスポンスをブロックしない）
      logger.info(`自動学習トリガー: ${daysSinceLast.toFixed(0)}日経過 (tenant: ${tenantId})`);
      this.runLearningCycle(tenantId).then(result => {
        logger.info(`自動学習完了: 新規${result.newInsights.length}件, 更新${result.updatedInsights.length}件`);
      }).catch(e => {
        logger.warn('自動学習失敗:', e instanceof Error ? e.message : e);
      });
    } catch (e) {
      // 判定失敗は無視（自動実行なので）
    }
  }

  // ========== Private Methods ==========

  private async getActualData(tenantId?: TenantId): Promise<any[]> {
    if (isSupabaseAvailable() && tenantId) {
      try {
        return await repo.getAllMonthlyActuals(tenantId);
      } catch (e) {
        logger.warn('Supabase実績取得失敗');
      }
    }

    // ファイルフォールバック: data/trend-cache等があれば読む
    try {
      const trendFile = path.resolve('data/trend-cache.json');
      if (fs.existsSync(trendFile)) {
        const data = JSON.parse(fs.readFileSync(trendFile, 'utf-8'));
        return data.months || [];
      }
    } catch { /* ignore */ }

    return [];
  }

  private async getPastAnalyses(tenantId?: TenantId): Promise<any[]> {
    if (isSupabaseAvailable() && tenantId) {
      try {
        return await repo.getPlanAnalyses(tenantId);
      } catch (e) {
        logger.warn('Supabase分析履歴取得失敗');
      }
    }
    return [];
  }

  private buildAnalysisPrompt(actuals: any[], pastAnalyses: any[], existingInsights: LearningInsight[]): string {
    const actualsText = actuals.map(a =>
      `${a.year}年${a.month}月: 売上=${a.revenue}, 売上原価=${a.costOfSales}, 粗利=${a.grossProfit}, 販管費=${a.sgaExpenses}, 営業利益=${a.operatingIncome}, 経常利益=${a.ordinaryIncome}, 現預金=${a.cashAndDeposits}`
    ).join('\n');

    let analysesText = '';
    if (pastAnalyses.length > 0) {
      analysesText = pastAnalyses.slice(0, 5).map(a => {
        const summary = typeof a.analysis === 'string' ? a.analysis.substring(0, 500) : JSON.stringify(a.analysis).substring(0, 500);
        return `分析ID=${a.id}: ${summary}`;
      }).join('\n');
    }

    let existingText = '';
    if (existingInsights.length > 0) {
      existingText = existingInsights.map(i =>
        `[${i.category}] ${i.insight} (確信度: ${i.confidence})`
      ).join('\n');
    }

    return `あなたは財務分析の学習エンジンです。以下の月次実績データと過去の分析結果を比較し、パターンや知見を抽出してください。

【月次実績データ】
${actualsText}

${analysesText ? `【過去の分析・予測】\n${analysesText}\n` : ''}
${existingText ? `【既存の学習済み知見】\n${existingText}\n` : ''}

以下の観点で分析し、JSON形式で知見を出力してください：

1. **季節性パターン**: 売上や費用に季節的な傾向はあるか
2. **楽観バイアス**: 過去の予測が実績と比べて楽観的だったか悲観的だったか
3. **異常パターン**: 通常と異なる動きをした月があるか
4. **トレンド**: 成長・縮小のトレンドがあるか
5. **費用構造**: 固定費と変動費の比率に変化はあるか

出力は以下のJSON形式にしてください（JSON以外のテキストは含めないでください）：
\`\`\`json
{
  "insights": [
    {
      "category": "seasonality|bias|pattern|anomaly|general",
      "insight": "知見の説明文",
      "confidence": 0.0-1.0,
      "evidence": "根拠の概要"
    }
  ],
  "summary": "全体のまとめ（1〜2文）"
}
\`\`\``;
  }

  private parseAnalysisResponse(text: string, existingInsights: LearningInsight[]): LearningResult {
    try {
      // JSON部分を抽出
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"insights"[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('学習応答のパースに失敗: JSON未検出');
        return { newInsights: [], updatedInsights: [], summary: '応答のパースに失敗しました' };
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      const newInsights: LearningInsight[] = (parsed.insights || []).map((i: any) => ({
        category: i.category || 'general',
        insight: i.insight || '',
        confidence: Math.min(1, Math.max(0, Number(i.confidence) || 0.5)),
        evidence: i.evidence || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // 既存知見との重複チェック（同カテゴリ・類似内容は更新扱い）
      const updatedInsights: LearningInsight[] = [];
      const trulyNew: LearningInsight[] = [];

      for (const ni of newInsights) {
        const existing = existingInsights.find(ei =>
          ei.category === ni.category && this.isSimilar(ei.insight, ni.insight)
        );
        if (existing) {
          existing.insight = ni.insight;
          existing.confidence = Math.max(existing.confidence, ni.confidence);
          existing.evidence = ni.evidence;
          existing.updated_at = new Date().toISOString();
          updatedInsights.push(existing);
        } else {
          trulyNew.push(ni);
        }
      }

      return {
        newInsights: trulyNew,
        updatedInsights,
        summary: parsed.summary || '学習サイクルが完了しました',
      };
    } catch (e) {
      logger.warn('学習応答のパースに失敗:', e);
      return { newInsights: [], updatedInsights: [], summary: '応答のパースに失敗しました' };
    }
  }

  private isSimilar(a: string, b: string): boolean {
    // 簡易的な類似判定: 先頭20文字が一致するか
    const normalize = (s: string) => s.replace(/\s+/g, '').substring(0, 20);
    return normalize(a) === normalize(b);
  }

  private async saveInsights(insights: LearningInsight[]): Promise<void> {
    if (isSupabaseAvailable()) {
      try {
        for (const insight of insights) {
          if (insight.id) {
            // 既存の更新
            await getSupabase()
              .from('learning_insights')
              .update({
                insight: insight.insight,
                confidence: insight.confidence,
                evidence: insight.evidence,
                updated_at: new Date().toISOString(),
              })
              .eq('id', insight.id);
          } else {
            // 新規挿入
            await getSupabase()
              .from('learning_insights')
              .insert({
                category: insight.category,
                insight: insight.insight,
                confidence: insight.confidence,
                evidence: insight.evidence,
              });
          }
        }
        logger.info(`学習知見をSupabaseに保存: ${insights.length}件`);
        return;
      } catch (e) {
        logger.warn('Supabase知見保存失敗、ファイルにフォールバック');
      }
    }

    // ファイルフォールバック
    const dir = path.dirname(INSIGHTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INSIGHTS_FILE, JSON.stringify(insights, null, 2), 'utf-8');
    logger.info(`学習知見をファイルに保存: ${insights.length}件`);
  }
}

export const learningService = new LearningService();
