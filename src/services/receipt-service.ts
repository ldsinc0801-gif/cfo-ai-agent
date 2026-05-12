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
  receiptFilePath?: string;   // アップロードされたレシートのファイルパス
  receiptFileName?: string;   // 元のファイル名
  receiptMimeType?: string;   // MIMEタイプ
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
  private ai: any = null;

  constructor() {
    const project = config.ai.gcpProject;
    if (project) {
      import('@google/genai').then(({ GoogleGenAI }) => {
        this.ai = new GoogleGenAI({ vertexai: true, project, location: config.ai.geminiRegion });
        logger.info('Gemini API (Vertex AI) クライアントを初期化しました');
      }).catch(e => logger.error('Gemini SDK初期化失敗:', e));
    }
  }

  isAvailable(): boolean {
    return this.ai !== null;
  }

  /**
   * 画像（領収書・レシート）から仕訳データを生成
   */
  async analyzeReceiptImage(imageBuffer: Buffer, mimeType: string, fileName: string, industry?: string, fiscalMonth?: number | null, fiscalYear?: number | null): Promise<ReceiptAnalysis> {
    if (!this.ai) throw new Error('GOOGLE_CLOUD_PROJECTが未設定です');

    logger.info(`領収書画像を解析中（Gemini）: ${fileName}`);

    const base64 = imageBuffer.toString('base64');
    const prompt = await this.buildPrompt(industry, fiscalMonth, fiscalYear);

    const response = await this.ai!.models.generateContent({
      model: config.ai.geminiModel,
      contents: [
        { role: 'user', parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: prompt },
        ]},
      ],
    });

    const text = response.text || '';
    this.recordUsage(response, '領収書解析(Gemini)');
    return this.parseResponse(text, fiscalMonth, fiscalYear);
  }

  /**
   * PDFの領収書・請求書から仕訳データを生成
   */
  async analyzeReceiptPDF(pdfBuffer: Buffer, fileName: string, industry?: string, fiscalMonth?: number | null, fiscalYear?: number | null): Promise<ReceiptAnalysis> {
    if (!this.ai) throw new Error('GOOGLE_CLOUD_PROJECTが未設定です');

    logger.info(`領収書PDFを解析中（Gemini）: ${fileName}`);

    const base64 = pdfBuffer.toString('base64');
    const prompt = await this.buildPrompt(industry, fiscalMonth, fiscalYear);

    const response = await this.ai!.models.generateContent({
      model: config.ai.geminiModel,
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: 'application/pdf', data: base64 } },
        { text: prompt },
      ]}],
    });

    const text = response.text || '';
    this.recordUsage(response, '領収書PDF解析(Gemini)');
    return this.parseResponse(text, fiscalMonth, fiscalYear);
  }

  /**
   * 動画から領収書を直接解析
   *
   * Geminiは動画を直接入力できるため、フレーム抽出不要。
   * 動画内の領収書・レシートを自動認識して仕訳データを生成する。
   */
  async analyzeVideo(videoBuffer: Buffer, mimeType: string, fileName: string, industry?: string, fiscalMonth?: number | null, fiscalYear?: number | null): Promise<ReceiptAnalysis> {
    if (!this.ai) throw new Error('GOOGLE_CLOUD_PROJECTが未設定です');

    logger.info(`動画を解析中（Gemini）: ${fileName}`);

    const base64 = videoBuffer.toString('base64');
    const prompt = await this.buildPrompt(industry, fiscalMonth, fiscalYear);

    const response = await this.ai!.models.generateContent({
      model: config.ai.geminiModel,
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: `この動画に映っている領収書・レシート・請求書を全て読み取り、仕訳データを生成してください。
同じ書類が複数回映っている場合は1件にまとめてください。

${prompt}` },
      ]}],
    });

    const text = response.text || '';
    this.recordUsage(response, '動画解析(Gemini)');
    return this.parseResponse(text, fiscalMonth, fiscalYear);
  }

  /**
   * 複数画像を一括解析（動画フレーム互換）
   */
  async analyzeVideoFrames(frames: { buffer: Buffer; mimeType: string }[], industry?: string, fiscalMonth?: number | null, fiscalYear?: number | null): Promise<ReceiptAnalysis> {
    if (!this.ai) throw new Error('GOOGLE_CLOUD_PROJECTが未設定です');

    logger.info(`画像${frames.length}枚を一括解析中（Gemini）...`);

    const prompt = await this.buildPrompt(industry, fiscalMonth, fiscalYear);

    const parts = [
      ...frames.map(f => ({
        inlineData: { mimeType: f.mimeType, data: f.buffer.toString('base64') },
      })),
      { text: `これらは領収書・レシートを撮影した画像です。
各画像に写っている領収書・レシートを全て読み取り、仕訳データを生成してください。
同じ領収書が複数画像に写っている場合は1件にまとめてください。

${prompt}` },
    ];

    const response = await this.ai!.models.generateContent({
      model: config.ai.geminiModel,
      contents: [{ role: 'user', parts }],
    });
    const text = response.text || '';
    this.recordUsage(response, '複数画像解析(Gemini)');
    return this.parseResponse(text, fiscalMonth, fiscalYear);
  }

  /**
   * CSV（カード明細・銀行取引明細）から仕訳データを生成
   */
  async analyzeCSV(csvText: string, fileName: string, industry?: string, fiscalMonth?: number | null, fiscalYear?: number | null): Promise<ReceiptAnalysis> {
    if (!this.ai) throw new Error('GOOGLE_CLOUD_PROJECTが未設定です');

    logger.info(`CSV明細を解析中（Gemini）: ${fileName}`);

    const basePrompt = await this.buildPrompt(industry, fiscalMonth, fiscalYear);

    const response = await this.ai!.models.generateContent({
      model: config.ai.geminiModel,
      contents: `以下はクレジットカード明細または銀行取引明細のCSVデータです。
各取引行を読み取り、仕訳データを生成してください。
- 貸方（creditAccount）はカード明細なら「未払金」、銀行明細なら「普通預金」としてください
- CSVのヘッダー行がある場合は自動判別してください
- 日付、金額、取引先名、摘要をCSVから正確に読み取ってください

=== CSVデータ（${fileName}）===
${csvText}
===

${basePrompt}`,
    });

    const text = response.text || '';
    this.recordUsage(response, 'CSV明細解析(Gemini)');
    return this.parseResponse(text, fiscalMonth, fiscalYear);
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
  private async buildPrompt(industry?: string, fiscalMonth?: number | null, fiscalYear?: number | null): Promise<string> {
    const basePrompt = getReceiptPrompt(fiscalMonth, fiscalYear);
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
    fiscalMonth?: number | null,
    fiscalYear?: number | null,
  ): Promise<{ corrections: Array<{ index: number; field: string; newValue: any }>; aiMessage: string }> {
    if (!this.ai) throw new Error('GOOGLE_CLOUD_PROJECTが未設定です');

    const accountNames = getAllAccountNames();

    const entrySummary = entries.map((e, i) =>
      `${i + 1}件目: 日付=${e.date}, 借方=${e.debitAccount}, 貸方=${e.creditAccount}, 金額=${e.amount}円, 税率=${e.taxRate}%, 消費税=${e.taxAmount}円, 摘要=${e.description}, 取引先=${e.partnerName}`
    ).join('\n');

    const prompt = `以下の仕訳データに対してユーザーが修正を依頼しています。

【現在の仕訳データ】
${entrySummary}

【有効な勘定科目一覧】
${accountNames.join('、')}

【ユーザーの修正依頼】
${userMessage}

【修正可能なフィールド】
- date: 日付（必ず YYYY-MM-DD 形式の文字列。例 "2025-05-01"）
- debitAccount: 借方勘定科目（上記有効な勘定科目一覧から）
- creditAccount: 貸方勘定科目（上記有効な勘定科目一覧から）
- amount: 金額（円、整数）
- taxRate: 税率（10 / 8 / 0 のいずれか整数）
- taxAmount: 消費税額（円、整数）
- description: 摘要（文字列）
- partnerName: 取引先（文字列）

以下のJSON形式のみで回答してください:
{
  "corrections": [
    { "index": 0, "field": "date", "newValue": "2025-05-01" },
    { "index": 1, "field": "amount", "newValue": 1500 }
  ],
  "message": "修正内容の説明（日本語で簡潔に）"
}

ルール:
- indexは0始まり（1件目=0, 2件目=1, 3件目=2）
- 「全部○○にして」「すべての日付を△」のような全件適用依頼は、全件分の corrections を配列で返す（例: 3件あれば3要素）
- 「2件目」「最後の」「最初の3件」など範囲指定は適切に解釈
- 取引先名で指定された場合は該当する全ての仕訳を対象にする
- newValue の型はフィールドに応じて変える（amount/taxRate/taxAmount は数値、それ以外は文字列）
- 勘定科目を変える場合は有効な勘定科目一覧に含まれるもののみ
- 修正がない場合や理解できない場合は corrections を空配列にして message で理由を説明
- JSONのみ返すこと`;

    const response = await this.ai!.models.generateContent({
      model: config.ai.geminiModel,
      contents: prompt,
    });
    const text = response.text || '';
    this.recordUsage(response, '仕訳修正解釈(Gemini)');

    const VALID_FIELDS = new Set(['date', 'debitAccount', 'creditAccount', 'amount', 'taxRate', 'taxAmount', 'description', 'partnerName']);

    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const jsonStr = (jsonMatch[1] || text).match(/\{[\s\S]*\}/);
      if (!jsonStr) throw new Error('JSON not found');
      const parsed = JSON.parse(jsonStr[0]);

      const validCorrections = ((parsed.corrections || []) as any[])
        .filter(c =>
          typeof c.index === 'number' &&
          c.index >= 0 && c.index < entries.length &&
          VALID_FIELDS.has(c.field)
        )
        .map(c => {
          let value: any = c.newValue;
          if (c.field === 'date') {
            value = normalizeDate(value, fiscalMonth, fiscalYear);
          } else if (c.field === 'amount' || c.field === 'taxAmount') {
            value = Math.max(0, Math.round(Number(value) || 0));
          } else if (c.field === 'taxRate') {
            const r = Number(value);
            value = [0, 8, 10].includes(r) ? r : 10;
          } else if (c.field === 'debitAccount' || c.field === 'creditAccount') {
            // 無効な勘定科目はスキップ
            if (!accountNames.includes(value)) return null;
          } else {
            value = String(value ?? '');
          }
          return { index: c.index, field: c.field, newValue: value };
        })
        .filter((c): c is { index: number; field: string; newValue: any } => c !== null);

      return {
        corrections: validCorrections,
        aiMessage: parsed.message || '修正を処理しました。',
      };
    } catch {
      return {
        corrections: [],
        aiMessage: 'メッセージを理解できませんでした。例:「2件目の借方を旅費交通費にして」「全部5月1日にして」「1件目の金額を10000円に」',
      };
    }
  }

  private recordUsage(response: any, purpose: string): void {
    try {
      const usage = response.usageMetadata;
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

  private parseResponse(text: string, fiscalMonth?: number | null, fiscalYear?: number | null): ReceiptAnalysis {
    try {
      // ```json ... ``` ブロックまたは生JSONを抽出
      const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : text;
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('JSON not found');
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        entries: (parsed.entries || []).map((e: any) => ({
          date: normalizeDate(e.date, fiscalMonth, fiscalYear),
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

/**
 * 決算月（M月期決算）と、任意の期末年（fiscalYear）から、事業年度のレンジを返す。
 * fiscalYear が指定されていなければ「今日」基準で現在進行中の年度を返す。
 * 例: fiscalMonth=5, today=2026/05/12 → start=2025/6, end=2026/5
 *      fiscalMonth=5, fiscalYear=2025 → start=2024/6, end=2025/5
 *      fiscalMonth=12, today=2026/05/12 → start=2026/1, end=2026/12
 */
function getCurrentFiscalYear(fiscalMonth: number, today: Date, fiscalYear?: number | null): { start: { y: number; m: number }; end: { y: number; m: number } } {
  let endY: number;
  if (fiscalYear) {
    endY = fiscalYear;
  } else {
    const tY = today.getFullYear();
    const tM = today.getMonth() + 1;
    if (fiscalMonth === 12) endY = tY;
    else endY = tM <= fiscalMonth ? tY : tY + 1;
  }
  const startM = fiscalMonth === 12 ? 1 : fiscalMonth + 1;
  const startY = fiscalMonth === 12 ? endY : endY - 1;
  return { start: { y: startY, m: startM }, end: { y: endY, m: fiscalMonth } };
}

/**
 * 月日から、対象事業年度の中で該当する年を推定する。
 * 例: fiscalMonth=5 (5月期決算), 月=6 → 事業年度の前半 (前年6月)
 *      fiscalMonth=5, 月=3 → 事業年度の後半 (当年3月)
 */
function inferYearFromFiscalContext(month: number, fiscalMonth: number, today: Date, fiscalYear?: number | null): number {
  const fy = getCurrentFiscalYear(fiscalMonth, today, fiscalYear);
  if (fy.start.m <= fy.end.m) return fy.start.y; // 12月期など同年内
  if (month >= fy.start.m) return fy.start.y;
  return fy.end.y;
}

/**
 * AI から返ってきた日付文字列を YYYY-MM-DD に正規化する。
 * Gemini が稀に「25-10-12」「0025-10-12」「令和7年10月12日」のような形で返してくる場合のガード。
 * fiscalMonth が指定されていれば、AIが今日の年で fallback している疑いがある場合に決算期から推定する。
 */
function normalizeDate(raw: unknown, fiscalMonth?: number | null, fiscalYear?: number | null): string {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  if (typeof raw !== 'string' || !raw.trim()) return todayStr;
  let s = raw.trim();

  // 令和N年M月D日 / R7.10.12 / 令和7/10/12
  const reiwa = s.match(/(?:令和|R)\s*(\d{1,2})[.\-/年]\s*(\d{1,2})[.\-/月]\s*(\d{1,2})/);
  if (reiwa) {
    const y = 2018 + Number(reiwa[1]);
    return `${y}-${String(reiwa[2]).padStart(2, '0')}-${String(reiwa[3]).padStart(2, '0')}`;
  }
  // 平成N年M月D日
  const heisei = s.match(/(?:平成|H)\s*(\d{1,2})[.\-/年]\s*(\d{1,2})[.\-/月]\s*(\d{1,2})/);
  if (heisei) {
    const y = 1988 + Number(heisei[1]);
    return `${y}-${String(heisei[2]).padStart(2, '0')}-${String(heisei[3]).padStart(2, '0')}`;
  }

  // 一般的な区切り（- / . 年月日）でパース
  const parts = s.replace(/[年月日]/g, '-').replace(/[./]/g, '-').split('-').filter(Boolean);
  if (parts.length === 3) {
    let [y, m, d] = parts.map(p => parseInt(p, 10));
    if (isNaN(y) || isNaN(m) || isNaN(d)) return todayStr;
    // 2桁年（00〜99）は西暦下2桁とみなす
    if (y < 100) y = 2000 + y;
    // 1900以下や3000以上は不正値、決算月コンテキストがあればそれで推定、無ければ今年
    if (y < 1900 || y > 3000) {
      y = fiscalMonth ? inferYearFromFiscalContext(m, fiscalMonth, today, fiscalYear) : today.getFullYear();
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // 月日のみの形式（"6/3" "10月12日" など）→ 決算月から年を推定
  if (parts.length === 2) {
    const [m, d] = parts.map(p => parseInt(p, 10));
    if (!isNaN(m) && !isNaN(d) && m >= 1 && m <= 12) {
      const y = fiscalMonth ? inferYearFromFiscalContext(m, fiscalMonth, today) : today.getFullYear();
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return todayStr;
}

function getReceiptPrompt(fiscalMonth?: number | null, fiscalYear?: number | null): string {
  const rules = accountRulesToPrompt();
  const today = new Date();
  const currentYear = today.getFullYear();

  // 決算月コンテキスト（年補完に使用）
  let fiscalContext = '';
  let yearMissingDefault = `${currentYear}`;
  if (fiscalMonth) {
    const fy = getCurrentFiscalYear(fiscalMonth, today, fiscalYear);
    fiscalContext = `

【決算期コンテキスト（年補完の指針）】
- 当社の決算月: ${fiscalMonth}月（${fy.end.y}年${fiscalMonth}月期）
- 現在の事業年度: ${fy.start.y}年${fy.start.m}月 〜 ${fy.end.y}年${fy.end.m}月
- レシート上に年表記が無い場合は、上記事業年度の中で該当する月の年を採用すること
  例（${fiscalMonth}月期決算の場合）:
    - レシートが「${fy.start.m}月X日」 → ${fy.start.y}年${fy.start.m}月X日
    - レシートが「${fy.end.m}月X日」 → ${fy.end.y}年${fy.end.m}月X日`;
    yearMissingDefault = `事業年度コンテキスト（${fy.start.y}/${fy.start.m}〜${fy.end.y}/${fy.end.m}）に基づいて推定`;
  }

  return `この領収書・レシートの内容を読み取り、以下のJSON形式で仕訳データを生成してください。

【日付の解釈ルール（最重要）】
- 必ず 4桁西暦の YYYY-MM-DD 形式で返すこと（例: 2025-10-12）
- レシート上の「25年10月12日」「25/10/12」「'25/10/12」のような **2桁年は西暦下2桁** と解釈し、必ず 2000+ に補正する（25→2025、24→2024、23→2023）。0025年や 25年などの誤った西暦は禁止
- 「令和7年」→ 2025年、「令和元年」→ 2019年（令和N年 = 2018+N）
- 「平成31年」→ 2019年（平成N年 = 1988+N、平成は2019/4/30まで）
- 「R7.10.12」「R7-10-12」「令和7.10.12」のような和暦略記も同様に変換
- 年の記載が一切無いレシートは ${yearMissingDefault} 年として扱い、notesにその旨を記載
- 月日のみ「10/12」のような表記も同様に扱う${fiscalContext}

【基本ルール】
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
