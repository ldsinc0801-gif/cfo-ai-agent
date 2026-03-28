import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { usageTracker } from './usage-tracker.js';
import type { RatingInput } from '../types/bank-rating.js';

/**
 * Gemini APIを使った財務分析サービス
 *
 * PDF/CSVから抽出したテキストや、freeeの数値データを
 * Gemini APIに渡して分析・解釈を行う。
 * 画像・PDF・動画のマルチモーダル入力に対応。
 */
export class AnthropicAnalysisService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = config.ai.geminiApiKey;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      logger.info('Gemini API分析クライアントを初期化しました');
    } else {
      logger.warn('GEMINI_API_KEYが未設定です。AI分析機能は利用できません。');
    }
  }

  isAvailable(): boolean {
    return this.genAI !== null;
  }

  /**
   * PDF/CSVのテキストから決算データを抽出し、RatingInputに変換する
   */
  async extractFinancialData(documentText: string, fileName: string): Promise<{
    ratingInput: RatingInput;
    extractionNotes: string[];
    rawResponse: string;
  }> {
    if (!this.genAI) {
      throw new Error('Gemini APIキーが設定されていません。.envファイルを確認してください。');
    }

    const prompt = `あなたは財務データ抽出の専門家です。
以下の決算書データから、銀行格付に必要な財務数値を抽出してJSON形式で返してください。

【重要なルール】
- 数値は全て円単位（整数）で返してください
- 見つからない項目はnullとしてください
- 推定した場合は extractionNotes に記載してください
- 有利子負債は「短期借入金+長期借入金+社債」の合計です
- 減価償却費がPLに明示されていない場合、販管費明細やCF計算書から探してください

【抽出対象】
{
  "totalAssets": 総資産,
  "currentAssets": 流動資産,
  "fixedAssets": 固定資産,
  "currentLiabilities": 流動負債,
  "fixedLiabilities": 固定負債,
  "netAssets": 純資産,
  "interestBearingDebt": 有利子負債,
  "cashAndDeposits": 現金預金,
  "revenue": 売上高,
  "operatingIncome": 営業利益,
  "ordinaryIncome": 経常利益,
  "netIncome": 当期純利益,
  "interestExpense": 支払利息,
  "interestIncome": 受取利息配当金,
  "depreciation": 減価償却費,
  "prevOrdinaryIncome": 前期経常利益（あれば）,
  "prevTotalAssets": 前期総資産（あれば）,
  "annualDebtRepayment": 年間返済元本（あれば）,
  "extractionNotes": ["抽出時の注意点や推定した項目"]
}

【決算書データ】
ファイル名: ${fileName}

${documentText}

JSONのみを返してください。説明文は不要です。`;

    logger.info(`Gemini APIで財務データを抽出中... (${fileName})`);

    const model = this.genAI.getGenerativeModel({ model: config.ai.geminiModel });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    this.recordUsage(result, '財務データ抽出(Gemini)');
    logger.info('Gemini APIからレスポンスを受信しました');

    // JSONを抽出
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : text;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AIからの応答から財務データを解析できませんでした');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const notes: string[] = parsed.extractionNotes || [];

    const ratingInput: RatingInput = {
      totalAssets: parsed.totalAssets ?? 0,
      currentAssets: parsed.currentAssets ?? 0,
      fixedAssets: parsed.fixedAssets ?? 0,
      currentLiabilities: parsed.currentLiabilities ?? 0,
      fixedLiabilities: parsed.fixedLiabilities ?? 0,
      netAssets: parsed.netAssets ?? 0,
      interestBearingDebt: parsed.interestBearingDebt ?? 0,
      cashAndDeposits: parsed.cashAndDeposits ?? 0,
      revenue: parsed.revenue ?? 0,
      operatingIncome: parsed.operatingIncome ?? 0,
      ordinaryIncome: parsed.ordinaryIncome ?? 0,
      netIncome: parsed.netIncome ?? 0,
      interestExpense: parsed.interestExpense ?? 0,
      interestIncome: parsed.interestIncome ?? 0,
      depreciation: parsed.depreciation ?? 0,
      prevOrdinaryIncome: parsed.prevOrdinaryIncome ?? null,
      prevTotalAssets: parsed.prevTotalAssets ?? null,
      annualDebtRepayment: parsed.annualDebtRepayment ?? null,
      profitFlowHistory: parsed.ordinaryIncome > 0
        ? ['positive', 'positive', 'positive']
        : ['negative', 'positive', 'positive'],
    };

    return { ratingInput, extractionNotes: notes, rawResponse: text };
  }

  /**
   * 財務指標と格付結果をもとに、経営者向けAI解説を生成する
   */
  async generateAnalysisCommentary(
    ratingJson: string,
    additionalJson: string,
  ): Promise<string> {
    if (!this.genAI) {
      throw new Error('Gemini APIキーが設定されていません');
    }

    const prompt = `あなたは中小企業専門の財務コンサルタントです。
以下の銀行格付分析結果をもとに、経営者向けの構造化された分析レポートをJSON形式で生成してください。

【文体ルール】
- 専門用語を使いすぎず、ただし会計的に不正確な表現は避ける
- 数字の羅列ではなく、何を意味するのかを説明する
- 「財務コンサルタントが経営者へ報告する文体」
- 誇張しない、データ不足時は「判断保留」と明記

【格付分析結果】
${ratingJson}

【追加指標】
${additionalJson}

以下のJSON形式で出力してください。JSONのみ返してください。

{
  "headline": "一言で表す総合判定（15文字以内）",
  "summary": "経営者が最初に読む3行の総評文",
  "overallGrade": "A〜Eの格付",
  "strengths": [
    {"title": "強みの名称", "detail": "具体的な説明（数値を含む）", "icon": "適切な絵文字1つ"}
  ],
  "weaknesses": [
    {"title": "弱みの名称", "detail": "具体的な説明（数値を含む）", "icon": "適切な絵文字1つ"}
  ],
  "bankView": {
    "overallComment": "銀行がこの企業をどう見るかの総合コメント（2〜3文）",
    "positives": ["銀行目線でのプラス要因"],
    "concerns": ["銀行目線での懸念事項"],
    "lendingImpact": "融資への具体的な影響（金利・限度額・条件への言及）"
  },
  "keyMetrics": [
    {"name": "指標名", "value": "値（単位付き）", "benchmark": "業界平均や基準値", "assessment": "excellent/good/fair/warning/danger", "comment": "一言コメント"}
  ],
  "immediateActions": [
    {"priority": 1, "action": "やるべきこと", "reason": "なぜ必要か", "expectedEffect": "期待される効果", "timeframe": "実施期間"}
  ],
  "mediumTermStrategy": [
    {"theme": "テーマ名", "detail": "具体的な施策の説明", "timeframe": "期間"}
  ],
  "riskAlerts": [
    {"level": "high/medium/low", "title": "リスク名", "detail": "詳細説明"}
  ],
  "industryComparison": {
    "position": "同業他社と比較した総合ポジション",
    "aboveAverage": ["業界平均を上回っている点"],
    "belowAverage": ["業界平均を下回っている点"]
  }
}`;

    logger.info('Gemini APIで分析コメントを生成中...');

    const model = this.genAI.getGenerativeModel({ model: config.ai.geminiModel });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    this.recordUsage(result, 'AI分析コメント生成(Gemini)');
    logger.info('AI分析コメント生成完了');
    return text;
  }

  /**
   * PDFファイルからテキストを抽出する（Gemini Vision使用）
   */
  async extractTextFromPDF(pdfBuffer: Buffer, fileName: string): Promise<string> {
    if (!this.genAI) {
      throw new Error('Gemini APIキーが設定されていません');
    }

    const base64 = pdfBuffer.toString('base64');

    logger.info(`PDFからテキスト抽出中（Gemini）... (${fileName})`);

    const model = this.genAI.getGenerativeModel({ model: config.ai.geminiModel });
    const result = await model.generateContent([
      { inlineData: { mimeType: 'application/pdf', data: base64 } },
      { text: `この決算書PDFから、全ての財務数値を正確にテキストとして抽出してください。
特に以下の項目を漏れなく抽出してください：
- 貸借対照表（BS）の全科目と金額
- 損益計算書（PL）の全科目と金額
- 売上高、営業利益、経常利益、当期純利益
- 流動資産、固定資産、流動負債、固定負債、純資産
- 借入金（短期・長期）
- 支払利息、受取利息
- 減価償却費
- 前期比較データがあれば前期の数値も

表形式で科目名と金額を整理して出力してください。` },
    ]);

    const text = result.response.text();
    this.recordUsage(result, 'PDF読み取り(Gemini)');
    logger.info(`PDFテキスト抽出完了 (${text.length}文字)`);
    return text;
  }

  private recordUsage(result: any, purpose: string): void {
    try {
      const usage = result.response.usageMetadata;
      if (usage) {
        usageTracker.record(
          config.ai.geminiModel,
          usage.promptTokenCount || 0,
          usage.candidatesTokenCount || 0,
          purpose,
        );
      }
    } catch { /* ignore */ }
  }
}
