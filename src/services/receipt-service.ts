import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { usageTracker } from './usage-tracker.js';
import { accountRulesToPrompt } from '../config/account-rules.js';
import { journalLearningService } from './journal-learning-service.js';
import { getAllAccountNames } from '../config/freee-accounts.js';

/** 仕訳データ */
export interface JournalEntry {
  date: string;           // YYYY-MM-DD
  debitAccount: string;   // 借方勘定科目
  creditAccount: string;  // 貸方勘定科目
  amount: number;
  taxRate: number;        // 消費税率 (0, 8, 10)
  taxAmount: number;
  description: string;    // 摘要
  partnerName: string;    // 取引先名
  receiptType: string;    // 領収書 / レシート / 請求書
}

/** 領収書解析結果 */
export interface ReceiptAnalysis {
  entries: JournalEntry[];
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}

/**
 * 領収書・レシートをGemini AIで解析し、仕訳データを生成するサービス
 *
 * 画像・PDF・動画に対応。Geminiのマルチモーダル機能を活用。
 */
export class ReceiptService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = config.ai.geminiApiKey;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      logger.info('Gemini APIクライアントを初期化しました');
    }
  }

  isAvailable(): boolean {
    return this.genAI !== null;
  }

  /**
   * 画像（領収書・レシート）から仕訳データを生成
   */
  async analyzeReceiptImage(imageBuffer: Buffer, mimeType: string, fileName: string, industry?: string): Promise<ReceiptAnalysis> {
    if (!this.genAI) throw new Error('GEMINI_API_KEYが未設定です');

    logger.info(`領収書画像を解析中（Gemini）: ${fileName}`);

    const model = this.genAI.getGenerativeModel({ model: config.ai.geminiModel });
    const base64 = imageBuffer.toString('base64');
    const prompt = await this.buildPrompt(industry);

    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64 } },
      { text: prompt },
    ]);

    const text = result.response.text();
    this.recordUsage(result, '領収書解析(Gemini)');
    return this.parseResponse(text);
  }

  /**
   * PDFの領収書・請求書から仕訳データを生成
   */
  async analyzeReceiptPDF(pdfBuffer: Buffer, fileName: string, industry?: string): Promise<ReceiptAnalysis> {
    if (!this.genAI) throw new Error('GEMINI_API_KEYが未設定です');

    logger.info(`領収書PDFを解析中（Gemini）: ${fileName}`);

    const model = this.genAI.getGenerativeModel({ model: config.ai.geminiModel });
    const base64 = pdfBuffer.toString('base64');
    const prompt = await this.buildPrompt(industry);

    const result = await model.generateContent([
      { inlineData: { mimeType: 'application/pdf', data: base64 } },
      { text: prompt },
    ]);

    const text = result.response.text();
    this.recordUsage(result, '領収書PDF解析(Gemini)');
    return this.parseResponse(text);
  }

  /**
   * 動画から領収書を直接解析
   *
   * Geminiは動画を直接入力できるため、フレーム抽出不要。
   * 動画内の領収書・レシートを自動認識して仕訳データを生成する。
   */
  async analyzeVideo(videoBuffer: Buffer, mimeType: string, fileName: string, industry?: string): Promise<ReceiptAnalysis> {
    if (!this.genAI) throw new Error('GEMINI_API_KEYが未設定です');

    logger.info(`動画を解析中（Gemini）: ${fileName}`);

    const model = this.genAI.getGenerativeModel({ model: config.ai.geminiModel });
    const base64 = videoBuffer.toString('base64');
    const prompt = await this.buildPrompt(industry);

    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64 } },
      { text: `この動画に映っている領収書・レシート・請求書を全て読み取り、仕訳データを生成してください。
同じ書類が複数回映っている場合は1件にまとめてください。

${prompt}` },
    ]);

    const text = result.response.text();
    this.recordUsage(result, '動画解析(Gemini)');
    return this.parseResponse(text);
  }

  /**
   * 複数画像を一括解析（動画フレーム互換）
   */
  async analyzeVideoFrames(frames: { buffer: Buffer; mimeType: string }[], industry?: string): Promise<ReceiptAnalysis> {
    if (!this.genAI) throw new Error('GEMINI_API_KEYが未設定です');

    logger.info(`画像${frames.length}枚を一括解析中（Gemini）...`);

    const model = this.genAI.getGenerativeModel({ model: config.ai.geminiModel });
    const prompt = await this.buildPrompt(industry);

    const parts = [
      ...frames.map(f => ({
        inlineData: { mimeType: f.mimeType, data: f.buffer.toString('base64') },
      })),
      { text: `これらは領収書・レシートを撮影した画像です。
各画像に写っている領収書・レシートを全て読み取り、仕訳データを生成してください。
同じ領収書が複数画像に写っている場合は1件にまとめてください。

${prompt}` },
    ];

    const result = await model.generateContent(parts);
    const text = result.response.text();
    this.recordUsage(result, '複数画像解析(Gemini)');
    return this.parseResponse(text);
  }

  /** 仕訳データをCSV文字列に変換 */
  toCSV(entries: JournalEntry[]): string {
    const header = '日付,借方勘定科目,貸方勘定科目,金額,消費税率,消費税額,摘要,取引先名,種別';
    const rows = entries.map(e =>
      `${e.date},${e.debitAccount},${e.creditAccount},${e.amount},${e.taxRate}%,${e.taxAmount},"${e.description}","${e.partnerName}",${e.receiptType}`
    );
    return [header, ...rows].join('\n');
  }

  /**
   * 弥生会計用CSV文字列に変換
   *
   * フォーマット:
   *   1列目: 日付（YYYY年M月D日）
   *   2列目: 摘要
   *   3列目: 勘定科目（借方）
   *   4列目: 金額（経費はマイナス、売上はプラス）
   *   5列目: 相手勘定科目（貸方）※オプション
   */
  toYayoiCSV(entries: JournalEntry[], includeCounterAccount: boolean = true): string {
    const headers = includeCounterAccount
      ? '日付,摘要,勘定科目,金額,相手勘定科目'
      : '日付,摘要,勘定科目,金額';

    const rows = entries.map(e => {
      // 日付を「2026年1月1日」形式に変換
      const [y, m, d] = e.date.split('-').map(Number);
      const dateStr = `${y}年${m}月${d}日`;

      // 摘要: 取引先 + 内容
      const description = e.partnerName
        ? `${e.partnerName} ${e.description}`.trim()
        : e.description;

      // 売上系はプラス、経費系はマイナス
      const isIncome = e.debitAccount.includes('売上') || e.creditAccount.includes('売上');
      const amount = isIncome ? e.amount : -e.amount;

      const cols = [
        dateStr,
        `"${description}"`,
        e.debitAccount,
        amount,
      ];
      if (includeCounterAccount) {
        cols.push(e.creditAccount);
      }
      return cols.join(',');
    });

    return [headers, ...rows].join('\n');
  }

  /** freee API用の仕訳パラメータに変換 */
  toFreeeParams(entry: JournalEntry, companyId: number) {
    return {
      company_id: companyId,
      issue_date: entry.date,
      type: entry.debitAccount.includes('仕入') || entry.debitAccount.includes('費') ? 'expense' : 'income',
      details: [{
        account_item_name: entry.debitAccount,
        amount: entry.amount,
        tax_code: entry.taxRate === 10 ? 21 : entry.taxRate === 8 ? 23 : 0,
        description: `${entry.description} (${entry.partnerName})`,
      }],
    };
  }

  /**
   * 業種に応じた学習済みルールを含むプロンプトを生成
   */
  private async buildPrompt(industry?: string): Promise<string> {
    const basePrompt = getReceiptPrompt();
    if (!industry) return basePrompt;

    const learnedRules = await journalLearningService.getLearnedRulesForPrompt(industry);
    if (!learnedRules) return basePrompt;

    // 基本プロンプトの勘定科目ルールの後に学習済みルールを挿入
    return `${basePrompt}\n\n${learnedRules}`;
  }

  /**
   * ユーザーが仕訳を修正した際に学習データとして記録する
   */
  async recordJournalCorrection(
    original: JournalEntry,
    corrected: JournalEntry,
    industry: string,
    reason?: string,
  ): Promise<void> {
    await journalLearningService.recordCorrection(original, corrected, industry, reason);
  }

  /**
   * チャットによる仕訳修正の解釈
   * ユーザーの自然言語メッセージから修正内容をAIで解析する
   */
  async interpretCorrection(
    entries: JournalEntry[],
    userMessage: string,
  ): Promise<{ corrections: Array<{ index: number; field: 'debitAccount' | 'creditAccount'; newValue: string }>; aiMessage: string }> {
    if (!this.genAI) throw new Error('GEMINI_API_KEYが未設定です');

    const model = this.genAI.getGenerativeModel({ model: config.ai.geminiModel });
    const accountNames = getAllAccountNames();

    const entrySummary = entries.map((e, i) =>
      `${i + 1}件目: 日付=${e.date}, 借方=${e.debitAccount}, 貸方=${e.creditAccount}, 金額=${e.amount}円, 摘要=${e.description}, 取引先=${e.partnerName}`
    ).join('\n');

    const prompt = `以下の仕訳データに対してユーザーが修正を依頼しています。

【現在の仕訳データ】
${entrySummary}

【有効な勘定科目一覧】
${accountNames.join('、')}

【ユーザーの修正依頼】
${userMessage}

以下のJSON形式のみで回答してください:
{
  "corrections": [
    { "index": 0, "field": "debitAccount", "newValue": "勘定科目名" }
  ],
  "message": "修正内容の説明（日本語で簡潔に）"
}

ルール:
- indexは0始まり（1件目=0, 2件目=1, 3件目=2）
- fieldは "debitAccount"（借方）または "creditAccount"（貸方）のみ
- newValueは有効な勘定科目一覧に含まれるもののみ使用すること
- 取引先名で指定された場合は該当する全ての仕訳を修正対象にする
- 修正がない場合や理解できない場合は corrections を空配列にして message で理由を説明
- JSONのみ返すこと`;

    const result = await model.generateContent([{ text: prompt }]);
    const text = result.response.text();
    this.recordUsage(result, '仕訳修正解釈(Gemini)');

    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const jsonStr = (jsonMatch[1] || text).match(/\{[\s\S]*\}/);
      if (!jsonStr) throw new Error('JSON not found');
      const parsed = JSON.parse(jsonStr[0]);

      // 有効な勘定科目のみ通す
      const validCorrections = (parsed.corrections || []).filter((c: any) =>
        typeof c.index === 'number' &&
        c.index >= 0 && c.index < entries.length &&
        (c.field === 'debitAccount' || c.field === 'creditAccount') &&
        accountNames.includes(c.newValue)
      );

      return {
        corrections: validCorrections,
        aiMessage: parsed.message || '修正を処理しました。',
      };
    } catch {
      return { corrections: [], aiMessage: 'メッセージを理解できませんでした。例:「2件目の借方を旅費交通費にして」' };
    }
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

  private parseResponse(text: string): ReceiptAnalysis {
    try {
      // ```json ... ``` ブロックまたは生JSONを抽出
      const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : text;
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('JSON not found');
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        entries: (parsed.entries || []).map((e: any) => ({
          date: e.date || new Date().toISOString().slice(0, 10),
          debitAccount: e.debitAccount || '未分類',
          creditAccount: e.creditAccount || '現金',
          amount: Number(e.amount) || 0,
          taxRate: Number(e.taxRate) || 10,
          taxAmount: Number(e.taxAmount) || 0,
          description: e.description || '',
          partnerName: e.partnerName || '',
          receiptType: e.receiptType || '領収書',
        })),
        rawText: text,
        confidence: parsed.confidence || 'medium',
        notes: parsed.notes || [],
      };
    } catch {
      return { entries: [], rawText: text, confidence: 'low', notes: ['AIレスポンスの解析に失敗しました'] };
    }
  }
}

function getReceiptPrompt(): string {
  const rules = accountRulesToPrompt();
  return `この領収書・レシートの内容を読み取り、以下のJSON形式で仕訳データを生成してください。

【基本ルール】
- 日付はYYYY-MM-DD形式
- 借方（debitAccount）は以下の勘定科目ルールに従って選択すること
- 貸方（creditAccount）は支払方法（現金/普通預金/クレジットカード等）。レシートから判別できない場合は「現金」
- 消費税は内税前提で計算。税込金額から逆算すること
- 軽減税率8%対象（食料品・飲料 ※酒類除く）は taxRate: 8 とする
- 複数品目がある場合も1仕訳にまとめてよい（合計金額で）
- 読み取れない項目は推定し、notesに記載

【重要：飲食費の判定】
- 1人あたり10,000円未満 → 会議費
- 1人あたり10,000円以上 → 接待交際費
- 人数が不明な場合は金額から推定（5,000円以下→会議費が無難）

【重要：金額による科目判定】
- 1つ10万円以上の物品 → 減価償却費（資産計上）
- 1つ10万円未満の物品 → 消耗品費

【勘定科目ルール一覧】
${rules}

JSONのみ返してください：
{
  "entries": [
    {
      "date": "YYYY-MM-DD",
      "debitAccount": "上記ルールに基づく借方勘定科目",
      "creditAccount": "現金",
      "amount": 税込金額,
      "taxRate": 10,
      "taxAmount": 消費税額,
      "description": "摘要（店名＋購入内容の要約）",
      "partnerName": "取引先名（店名・会社名）",
      "receiptType": "領収書 or レシート or 請求書"
    }
  ],
  "confidence": "high/medium/low",
  "notes": ["読み取り時の注意点や推定した項目"]
}`;
}

export const receiptService = new ReceiptService();
