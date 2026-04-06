import { GoogleGenerativeAI } from '@google/generative-ai';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { usageTracker } from './usage-tracker.js';
import { planAnalysisService } from './plan-analysis-service.js';
import { saveAnnualKpi, loadAnnualKpi } from '../web/plan-renderer.js';
import type { MonthlyTarget } from '../types/trend.js';
import type { AnnualKpiTarget, CustomKpiItem } from '../web/plan-renderer.js';

/** 抽出結果 */
export interface PlanExtractResult {
  monthlyTargets: MonthlyTarget[];
  annualKpi: Partial<AnnualKpiTarget> | null;
  customKpis: CustomKpiItem[];
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}

const EXTRACT_PROMPT = `あなたは中小企業の事業計画書を分析するAIです。
アップロードされたファイルから、以下の数値データを抽出してください。

【抽出してほしいデータ】

1. 月次目標（あれば）:
   - 各月の売上目標、粗利目標、経常利益目標

2. 年間KPI（あれば）:
   - 年間売上高目標（円）
   - 年間営業利益目標（円）
   - 目標営業利益率（%）
   - 目標自己資本比率（%）
   - 目標労働生産性（万円/人）
   - 従業員数

3. カスタムKPI（売上・粗利・経常利益以外の数値目標があれば全て抽出）:
   例: アポ数、契約率、契約件数、顧客数、解約率、平均単価、リード数、商談数、成約率、LTV、CACなど
   - 数値目標として読み取れるものは全て抽出してください
   - 年間目標か月次目標かを判定してください

【ルール】
- 数値は全て半角数字で、円単位で返してください（万円・百万円の場合は円に変換）
- 見つからない項目はnullにしてください
- 年度は「YYYY年M月期」の形式で返してください
- 確信度をhigh/medium/lowで返してください

以下のJSON形式のみで回答してください。JSON以外の文字は含めないでください。

{
  "fiscalYear": "2026年3月期",
  "monthlyTargets": [
    {"year": 2025, "month": 4, "revenue": 売上目標, "grossProfit": 粗利目標, "ordinaryIncome": 経常利益目標},
    ...
  ],
  "annualKpi": {
    "targetRevenue": 年間売上目標（円）or null,
    "targetProfit": 年間営業利益目標（円）or null,
    "targetMargin": 営業利益率（%）or null,
    "targetEquityRatio": 自己資本比率（%）or null,
    "targetProductivity": 労働生産性（万円/人）or null,
    "employeeCount": 従業員数 or null
  },
  "customKpis": [
    {"name": "KPI名", "target": 目標値, "actual": 実績値or null, "unit": "件 or % or 人 or 円 or 万円 or pt", "scope": "annual or monthly"},
    ...
  ],
  "confidence": "high or medium or low",
  "notes": ["抽出時の注意点やメモ"]
}`;

/**
 * 事業計画書から数値を抽出するサービス
 */
export class PlanExtractService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = config.ai.geminiApiKey;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  isAvailable(): boolean {
    return this.genAI !== null;
  }

  /**
   * ファイルから数値を抽出して目標に反映
   */
  async extractAndApply(filePath: string, fileName: string): Promise<PlanExtractResult> {
    const ext = path.extname(fileName).toLowerCase();
    let result: PlanExtractResult;

    if (ext === '.csv') {
      const text = fs.readFileSync(filePath, 'utf-8');
      result = await this.extractFromText(text, fileName);
    } else if (ext === '.xlsx' || ext === '.xls') {
      result = await this.extractFromExcel(filePath, fileName);
    } else if (ext === '.pdf') {
      result = await this.extractFromPDF(filePath, fileName);
    } else {
      throw new Error(`未対応のファイル形式: ${ext}`);
    }

    // 抽出結果を反映
    this.applyResults(result);
    return result;
  }

  /**
   * PDFからGeminiで数値抽出
   */
  private async extractFromPDF(filePath: string, fileName: string): Promise<PlanExtractResult> {
    if (!this.genAI) throw new Error('GEMINI_API_KEYが未設定です');

    logger.info(`事業計画PDF解析中: ${fileName}`);
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const model = this.genAI.getGenerativeModel({ model: config.ai.geminiModel });

    const result = await model.generateContent([
      { inlineData: { mimeType: 'application/pdf', data: base64 } },
      { text: EXTRACT_PROMPT },
    ]);

    const text = result.response.text();
    const usage = result.response.usageMetadata;
    if (usage) {
      usageTracker.record(config.ai.geminiModel, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, '事業計画PDF解析(Gemini)');
    }
    return this.parseExtractResult(text);
  }

  /**
   * Excel/CSVからGeminiで数値抽出
   */
  private async extractFromExcel(filePath: string, fileName: string): Promise<PlanExtractResult> {
    logger.info(`事業計画Excel解析中: ${fileName}`);

    // ExcelJSでテキスト化
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    let textContent = '';

    workbook.eachSheet((sheet) => {
      textContent += `\n【シート: ${sheet.name}】\n`;
      sheet.eachRow((row, rowNumber) => {
        const values = (row.values as (string | number | null)[])
          .slice(1) // ExcelJSは1-indexed
          .map(v => v != null ? String(v) : '')
          .join('\t');
        if (values.trim()) {
          textContent += `${rowNumber}: ${values}\n`;
        }
      });
    });

    return this.extractFromText(textContent, fileName);
  }

  /**
   * テキストからGeminiで数値抽出
   */
  private async extractFromText(text: string, fileName: string): Promise<PlanExtractResult> {
    if (!this.genAI) throw new Error('GEMINI_API_KEYが未設定です');

    logger.info(`事業計画テキスト解析中: ${fileName}`);
    const model = this.genAI.getGenerativeModel({ model: config.ai.geminiModel });

    const result = await model.generateContent([
      { text: `以下は事業計画書「${fileName}」の内容です:\n\n${text}\n\n${EXTRACT_PROMPT}` },
    ]);

    const responseText = result.response.text();
    const usage = result.response.usageMetadata;
    if (usage) {
      usageTracker.record(config.ai.geminiModel, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, '事業計画テキスト解析(Gemini)');
    }
    return this.parseExtractResult(responseText);
  }

  /**
   * AI応答をパース
   */
  private parseExtractResult(text: string): PlanExtractResult {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { monthlyTargets: [], annualKpi: null, customKpis: [], rawText: text, confidence: 'low', notes: ['JSONパースに失敗'] };
    }

    try {
      const data = JSON.parse(jsonMatch[0]);

      const monthlyTargets: MonthlyTarget[] = (data.monthlyTargets || []).map((t: any) => ({
        year: Number(t.year) || 0,
        month: Number(t.month) || 0,
        revenue: Number(t.revenue) || 0,
        grossProfit: Number(t.grossProfit) || 0,
        ordinaryIncome: Number(t.ordinaryIncome) || 0,
      })).filter((t: MonthlyTarget) => t.year > 0 && t.month > 0);

      const customKpis: CustomKpiItem[] = (data.customKpis || []).map((ck: any) => ({
        id: 'ck-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        name: String(ck.name || ''),
        target: Number(ck.target) || 0,
        actual: Number(ck.actual) || 0,
        unit: String(ck.unit || '件'),
        format: 'number' as const,
        scope: (ck.scope === 'monthly' ? 'monthly' : 'annual') as 'annual' | 'monthly',
      })).filter((ck: CustomKpiItem) => ck.name);

      return {
        monthlyTargets,
        annualKpi: data.annualKpi || null,
        customKpis,
        rawText: text,
        confidence: data.confidence || 'medium',
        notes: data.notes || [],
      };
    } catch (e) {
      logger.warn('事業計画パースエラー:', e);
      return { monthlyTargets: [], annualKpi: null, customKpis: [], rawText: text, confidence: 'low', notes: ['JSONパースエラー'] };
    }
  }

  /**
   * 抽出結果を月次目標・年間KPIに反映
   */
  private applyResults(result: PlanExtractResult): void {
    // 月次目標を反映
    if (result.monthlyTargets.length > 0) {
      for (const t of result.monthlyTargets) {
        planAnalysisService.setTarget(t);
      }
      logger.info(`月次目標を反映: ${result.monthlyTargets.length}か月分`);
    }

    // 年間KPIを反映（nullでない値のみ上書き）
    if (result.annualKpi) {
      const current = loadAnnualKpi();
      const update: AnnualKpiTarget = { ...current };

      if (result.annualKpi.targetRevenue != null) update.targetRevenue = result.annualKpi.targetRevenue;
      if (result.annualKpi.targetProfit != null) update.targetProfit = result.annualKpi.targetProfit;
      if (result.annualKpi.targetMargin != null) update.targetMargin = result.annualKpi.targetMargin;
      if (result.annualKpi.targetEquityRatio != null) update.targetEquityRatio = result.annualKpi.targetEquityRatio;
      if (result.annualKpi.targetProductivity != null) update.targetProductivity = result.annualKpi.targetProductivity;
      if (result.annualKpi.employeeCount != null) update.employeeCount = result.annualKpi.employeeCount;

      // カスタムKPIをマージ（既存を保持しつつ新規追加）
      if (result.customKpis.length > 0) {
        const existing = update.customKpis || [];
        for (const ck of result.customKpis) {
          const found = existing.find(e => e.name === ck.name);
          if (found) {
            // 既存KPIは目標値を更新
            found.target = ck.target;
            if (ck.actual) found.actual = ck.actual;
            found.scope = ck.scope;
          } else {
            existing.push(ck);
          }
        }
        update.customKpis = existing;
        logger.info(`カスタムKPIを反映: ${result.customKpis.length}件`);
      }

      saveAnnualKpi(update);
      logger.info('年間KPI目標を反映');
    } else if (result.customKpis.length > 0) {
      // annualKpiはないがcustomKpisはある場合
      const current = loadAnnualKpi();
      const existing = current.customKpis || [];
      for (const ck of result.customKpis) {
        const found = existing.find(e => e.name === ck.name);
        if (found) {
          found.target = ck.target;
          if (ck.actual) found.actual = ck.actual;
          found.scope = ck.scope;
        } else {
          existing.push(ck);
        }
      }
      current.customKpis = existing;
      saveAnnualKpi(current);
      logger.info(`カスタムKPIを反映: ${result.customKpis.length}件`);
    }
  }
}

export const planExtractService = new PlanExtractService();
