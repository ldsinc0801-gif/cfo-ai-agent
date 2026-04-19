import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { usageTracker } from './usage-tracker.js';
import { getSupabase } from '../clients/supabase.js';
import { isSupabaseAvailable } from '../clients/supabase.js';
import type { MonthlyTarget, MonthlySnapshot } from '../types/trend.js';
import type { TenantId } from '../types/auth.js';

const PLAN_DIR = path.resolve('data/plans');
const PLAN_FILE = path.join(PLAN_DIR, 'monthly-targets.json');
const ANALYSIS_HISTORY_FILE = path.join(PLAN_DIR, 'analysis-history.json');

/** 計画データ（月次目標） */
export interface PlanData {
  targets: MonthlyTarget[];
  updatedAt: string;
  notes: string;
}

/** 実績 vs 計画の差分 */
export interface PlanVariance {
  year: number;
  month: number;
  planned: MonthlyTarget;
  actual: MonthlySnapshot;
  revenueVariance: number;       // 売上差額
  revenueVarianceRate: number;   // 売上達成率
  grossProfitVariance: number;
  grossProfitVarianceRate: number;
  ordinaryIncomeVariance: number;
  ordinaryIncomeVarianceRate: number;
}

/** AI分析結果 */
export interface PlanAnalysisResult {
  id: string;
  createdAt: string;
  variances: PlanVariance[];
  analysis: {
    summary: string;
    patterns: string[];
    rootCauses: string[];
    revisedTargets: MonthlyTarget[];
    recommendations: string[];
    confidenceLevel: 'high' | 'medium' | 'low';
  };
}

/**
 * 計画分析サービス（Gemini 2.5 Pro via Vertex AI）
 *
 * 現状の実績数値と計画数値の差分を分析し、
 * パターンを学習して計画に反映する。
 */
export class PlanAnalysisService {
  private ai: any = null;

  constructor() {
    const project = config.ai.gcpProject;
    if (project) {
      import('@google/genai').then(({ GoogleGenAI }) => {
        this.ai = new GoogleGenAI({ vertexai: true, project, location: config.ai.geminiRegion });
        logger.info('Gemini API（計画分析, 2.5 Pro）クライアントを初期化しました');
      }).catch(e => logger.error('Gemini SDK初期化失敗:', e));
    }
    if (!fs.existsSync(PLAN_DIR)) fs.mkdirSync(PLAN_DIR, { recursive: true });
  }

  isAvailable(): boolean {
    return this.ai !== null;
  }

  // ========== 計画データ管理 ==========

  /** 計画データを取得（Supabase優先、フォールバックはファイル） */
  async getPlan(tenantId?: TenantId): Promise<PlanData> {
    if (isSupabaseAvailable() && tenantId) {
      try {
        const { data } = await getSupabase().from('monthly_targets').select('*').eq('tenant_id', tenantId).order('year').order('month');
        if (data && data.length > 0) {
          return {
            targets: data.map((r: any) => ({ year: r.year, month: r.month, revenue: r.revenue, grossProfit: r.gross_profit, ordinaryIncome: r.ordinary_income })),
            updatedAt: data[0].updated_at || '', notes: '',
          };
        }
      } catch (e) { logger.warn('Supabase計画取得失敗'); }
    }
    // Supabase未接続時のみファイルフォールバック
    if (!isSupabaseAvailable() && fs.existsSync(PLAN_FILE)) {
      return JSON.parse(fs.readFileSync(PLAN_FILE, 'utf-8'));
    }
    return { targets: [], updatedAt: '', notes: '' };
  }

  /** 計画データを保存 */
  async savePlan(data: PlanData, tenantId?: TenantId): Promise<void> {
    data.updatedAt = new Date().toISOString();
    if (isSupabaseAvailable() && tenantId) {
      try {
        for (const t of data.targets) {
          await getSupabase().from('monthly_targets').upsert({
            tenant_id: tenantId, year: t.year, month: t.month,
            revenue: t.revenue, gross_profit: t.grossProfit, ordinary_income: t.ordinaryIncome,
            updated_at: data.updatedAt,
          }, { onConflict: 'tenant_id,year,month' });
        }
        logger.info(`計画データを保存しました (${data.targets.length}か月分)`);
        return;
      } catch (e) { logger.warn('Supabase計画保存失敗'); }
    }
    if (!isSupabaseAvailable()) {
      if (!fs.existsSync(PLAN_DIR)) fs.mkdirSync(PLAN_DIR, { recursive: true });
      fs.writeFileSync(PLAN_FILE, JSON.stringify(data, null, 2), 'utf-8');
      logger.info(`計画データを保存しました (${data.targets.length}か月分)`);
    }
  }

  /** 月次目標を個別に設定/更新 */
  async setTarget(target: MonthlyTarget, tenantId?: TenantId): Promise<void> {
    const plan = await this.getPlan(tenantId);
    const idx = plan.targets.findIndex(t => t.year === target.year && t.month === target.month);
    if (idx >= 0) {
      plan.targets[idx] = target;
    } else {
      plan.targets.push(target);
    }
    plan.targets.sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
    await this.savePlan(plan, tenantId);
  }

  // ========== 差分計算 ==========

  /** 実績と計画の差分を計算 */
  calculateVariances(actuals: MonthlySnapshot[], targets: MonthlyTarget[]): PlanVariance[] {
    const variances: PlanVariance[] = [];

    for (const target of targets) {
      const actual = actuals.find(a => a.year === target.year && a.month === target.month);
      if (!actual) continue;

      variances.push({
        year: target.year,
        month: target.month,
        planned: target,
        actual,
        revenueVariance: actual.revenue - target.revenue,
        revenueVarianceRate: target.revenue > 0 ? actual.revenue / target.revenue : 0,
        grossProfitVariance: actual.grossProfit - target.grossProfit,
        grossProfitVarianceRate: target.grossProfit > 0 ? actual.grossProfit / target.grossProfit : 0,
        ordinaryIncomeVariance: actual.ordinaryIncome - target.ordinaryIncome,
        ordinaryIncomeVarianceRate: target.ordinaryIncome !== 0 ? actual.ordinaryIncome / target.ordinaryIncome : 0,
      });
    }

    return variances;
  }

  // ========== Gemini分析 ==========

  /**
   * 実績 vs 計画の差分をGemini 2.5 Proで分析し、計画修正を提案する
   */
  async analyzePlanVariance(tenantId: TenantId,
    actuals: MonthlySnapshot[],
    targets: MonthlyTarget[],
    futureMonths: number = 3,
  ): Promise<PlanAnalysisResult> {
    if (!this.ai) throw new Error('Vertex AI の認証が未設定です');

    const variances = this.calculateVariances(actuals, targets);
    if (variances.length === 0) {
      throw new Error('比較可能な実績・計画データがありません');
    }

    const fmt = (n: number) => new Intl.NumberFormat('ja-JP').format(n);
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

    // 差分データをテキスト化
    let varianceText = '【月別 実績 vs 計画】\n';
    for (const v of variances) {
      varianceText += `\n${v.year}年${v.month}月:\n`;
      varianceText += `  売上: 計画${fmt(v.planned.revenue)}円 → 実績${fmt(v.actual.revenue)}円（達成率${pct(v.revenueVarianceRate)}、差額${fmt(v.revenueVariance)}円）\n`;
      varianceText += `  粗利: 計画${fmt(v.planned.grossProfit)}円 → 実績${fmt(v.actual.grossProfit)}円（達成率${pct(v.grossProfitVarianceRate)}）\n`;
      varianceText += `  経常利益: 計画${fmt(v.planned.ordinaryIncome)}円 → 実績${fmt(v.actual.ordinaryIncome)}円（達成率${pct(v.ordinaryIncomeVarianceRate)}）\n`;
      varianceText += `  販管費: ${fmt(v.actual.sgaExpenses)}円\n`;
      varianceText += `  現預金: ${fmt(v.actual.cashAndDeposits)}円\n`;
    }

    // 実績トレンド
    let trendText = '\n【実績推移（全月）】\n';
    for (const a of actuals) {
      trendText += `${a.year}年${a.month}月: 売上${fmt(a.revenue)}円 / 粗利${fmt(a.grossProfit)}円 / 経常${fmt(a.ordinaryIncome)}円 / 販管費${fmt(a.sgaExpenses)}円 / 現預金${fmt(a.cashAndDeposits)}円\n`;
    }

    // 未来の月リスト
    const lastActual = actuals[actuals.length - 1];
    const futureMonthsList: { year: number; month: number }[] = [];
    for (let i = 1; i <= futureMonths; i++) {
      let m = lastActual.month + i;
      let y = lastActual.year;
      while (m > 12) { m -= 12; y++; }
      futureMonthsList.push({ year: y, month: m });
    }

    // 過去の分析履歴を読み込み（学習のため）
    const history = await this.getAnalysisHistory(tenantId);
    let historyText = '';
    if (history.length > 0) {
      historyText = '\n【過去の分析で判明したパターン】\n';
      for (const h of history.slice(-3)) {
        historyText += `${h.createdAt.slice(0, 10)}: ${h.analysis.patterns.join('、')}\n`;
      }
    }

    const prompt = `あなたは中小企業の経営計画アナリストです。
以下の実績データと計画データの差分を分析し、計画の修正案を提示してください。

${varianceText}
${trendText}
${historyText}

【分析してほしいこと】
1. 計画と実績のズレのパターン（季節性、構造的な問題、一時的な要因等）
2. ズレの根本原因（売上構造、費用構造、外部要因等）
3. 今後${futureMonths}か月（${futureMonthsList.map(m => `${m.year}年${m.month}月`).join('、')}）の修正計画
4. 計画達成のための具体的なアクション

【重要ルール】
- 修正計画は楽観的すぎず、実績トレンドに基づいた現実的な数値にすること
- 季節変動がある場合はそのパターンを考慮すること
- 過去の分析パターンがあれば、その知見を活かすこと
- 数字の根拠を明確にすること

以下のJSON形式で回答してください。JSONのみ返してください。

{
  "summary": "分析の要約（3行以内）",
  "patterns": ["発見したパターン1", "パターン2"],
  "rootCauses": ["根本原因1", "原因2"],
  "revisedTargets": [
    ${futureMonthsList.map(m => `{"year": ${m.year}, "month": ${m.month}, "revenue": 修正後の売上目標, "grossProfit": 修正後の粗利目標, "ordinaryIncome": 修正後の経常利益目標}`).join(',\n    ')}
  ],
  "recommendations": ["アクション1", "アクション2", "アクション3"],
  "confidenceLevel": "high/medium/low"
}`;

    logger.info('Gemini 2.5 Pro で計画差分分析を実行中...');

    const response = await this.ai.models.generateContent({
      model: config.ai.geminiAnalysisModel,
      contents: prompt,
      config: { maxOutputTokens: 4096 },
    });

    const text = response.text || '';
    const usage = response.usageMetadata;
    if (usage) {
      usageTracker.record(config.ai.geminiAnalysisModel, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, '計画差分分析(Gemini Pro)');
    }

    // JSONパース
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : text;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('分析結果のパースに失敗しました');

    const parsed = JSON.parse(jsonMatch[0]);

    const result: PlanAnalysisResult = {
      id: `plan-analysis-${Date.now()}`,
      createdAt: new Date().toISOString(),
      variances,
      analysis: {
        summary: parsed.summary || '',
        patterns: parsed.patterns || [],
        rootCauses: parsed.rootCauses || [],
        revisedTargets: (parsed.revisedTargets || []).map((t: any) => ({
          year: t.year,
          month: t.month,
          revenue: Number(t.revenue) || 0,
          grossProfit: Number(t.grossProfit) || 0,
          ordinaryIncome: Number(t.ordinaryIncome) || 0,
        })),
        recommendations: parsed.recommendations || [],
        confidenceLevel: parsed.confidenceLevel || 'medium',
      },
    };

    // 分析履歴に保存（学習用）
    await this.saveAnalysisHistory(result, tenantId);

    logger.info(`計画分析完了: ${result.analysis.patterns.length}パターン検出, ${result.analysis.revisedTargets.length}か月分の修正案`);
    return result;
  }

  /**
   * 分析結果の修正計画を計画データに反映する
   */
  async applyRevisedTargets(revisedTargets: MonthlyTarget[], tenantId?: TenantId): Promise<void> {
    for (const target of revisedTargets) {
      await this.setTarget(target, tenantId);
    }
    logger.info(`修正計画を反映しました (${revisedTargets.length}か月分)`);
  }

  // ========== 分析履歴管理（学習用） ==========

  private async getAnalysisHistory(tenantId?: TenantId): Promise<PlanAnalysisResult[]> {
    if (isSupabaseAvailable() && tenantId) {
      try {
        const { data } = await getSupabase().from('plan_history').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10);
        return (data || []).map((r: any) => ({ id: r.id, createdAt: r.created_at, variances: r.variances, analysis: r.analysis }));
      } catch (e) { logger.warn('Supabase分析履歴取得失敗'); }
    }
    return [];
  }

  private async saveAnalysisHistory(result: PlanAnalysisResult, tenantId?: TenantId): Promise<void> {
    if (isSupabaseAvailable() && tenantId) {
      try {
        await getSupabase().from('plan_history').insert({
          id: result.id, tenant_id: tenantId, variances: result.variances, analysis: result.analysis,
        });
        return;
      } catch (e) { logger.warn('Supabase分析履歴保存失敗'); }
    }
  }

  /** 分析履歴を取得（UI表示用） */
  async getHistory(tenantId?: TenantId): Promise<PlanAnalysisResult[]> {
    return await this.getAnalysisHistory(tenantId);
  }
}

export const planAnalysisService = new PlanAnalysisService();
